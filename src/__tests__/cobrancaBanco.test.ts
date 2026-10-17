// @vitest-environment node
/**
 * Cobrança (server/billing + migração 013700) no banco local (PGlite) com um fornecedor SIMULADO em memória (sem rede):
 * desligada sem chave, segunda trava (vendas_ligadas), aceite e CPF na hora de pagar, um pedido aberto por vez e idempotência,
 * aviso com token conferido + cobrança relida + valor conferido, Pix de extra entregue na carteira, PRO mensal no cartão com
 * renovação automática, sem tolerância, Pix de renovação 7 dias antes, cancelamento da renovação e devolução pela regra do dono
 * (7 dias integral; trimestral = meses não iniciados − 10%; extra = créditos não usados − 10%).
 *
 * O catálogo e a carteira são do ramo planos-acesso (013640/013680), que ainda não está no main: aqui entram cópias mínimas
 * das tabelas e das duas funções de cálculo da devolução (mesma regra), só para exercitar os pontos de ligação.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { createBilling } from "../../server/billing/core";
import { periodEndFor } from "../../server/billing/period";
import { createBillingRouter, createWebhookHandler, type BillingRoutesDeps } from "../../server/billing/router";
import { BillingSignatureError, type PaymentProvider, type ProviderCharge } from "../../server/billing/provider";

const TOKEN = "token-do-aviso-simulado-com-mais-de-32-caracteres";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cobranca-"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ALUNO, CARTAO, SEM_TERMO, EQUIPE, TRI, PIXREN, DEVOL, FALHA] = [1, 2, 3, 4, 5, 6, 7, 8].map(id);
let dev: DevDatabase;
let db: ContentDb;
let base: string;
let offBase: string;
const servers: Server[] = [];
const tokens: Record<string, string> = {};
let clock = new Date("2026-10-17T15:00:00Z");

// ---------------------------------------------------------------- fornecedor simulado
const charges = new Map<string, ProviderCharge & { reference: string }>();
const subs = new Map<string, { customerId: string; amountCents: number; cycle: string; reference: string; active: boolean }>();
const log: string[] = [];
let seq = 0;
const fake: PaymentProvider = {
  name: "asaas",
  mode: "test",
  capabilities: { methods: { card: true, pix: true }, partialRefund: true },
  async ensureCustomer(i) {
    log.push(`cliente:${i.document}`);
    return `cus_${i.userId.slice(-2)}`;
  },
  async createCharge(i) {
    const cid = `pay_${++seq}`;
    charges.set(cid, { id: cid, status: "pending", method: i.method, amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: null, externalReference: i.reference, dueDate: i.dueDate, paidAt: null, installments: false, reference: i.reference });
    log.push(`cobranca:${cid}:${i.method}:${i.amountCents}:${i.dueDate}`);
    return { chargeId: cid, url: `https://pagar.teste/${cid}`, pix: i.method === "pix" ? { payload: "000201", image: "img", expiresAt: null } : null };
  },
  async createCardSubscription(i) {
    const sid = `sub_${++seq}`;
    subs.set(sid, { customerId: i.customerId, amountCents: i.amountCents, cycle: i.cycle, reference: i.reference, active: true });
    const cid = `pay_${++seq}`;
    charges.set(cid, { id: cid, status: "pending", method: "card", amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: sid, externalReference: i.reference, dueDate: i.firstDueDate, paidAt: null, installments: false, reference: i.reference });
    log.push(`assinatura:${sid}:${i.cycle}:${i.amountCents}`);
    return { subscriptionId: sid, chargeId: cid, url: `https://pagar.teste/${cid}`, pix: null };
  },
  async payChargeByPix(cid, due) {
    const c = charges.get(cid)!;
    Object.assign(c, { method: "pix", dueDate: due, status: "pending" });
    log.push(`virou-pix:${cid}`);
    return { chargeId: cid, url: `https://pagar.teste/${cid}`, pix: { payload: "000201REN", image: "img", expiresAt: null } };
  },
  async getCharge(cid) {
    const c = charges.get(cid);
    return c ? { ...c } : null;
  },
  async cancelCharge(cid) {
    const c = charges.get(cid);
    if (c && c.status === "pending") c.status = "canceled";
    log.push(`cancelou:${cid}`);
  },
  async refund(cid, amount) {
    const c = charges.get(cid)!;
    c.refundedCents += amount ?? c.amountCents;
    c.status = c.refundedCents >= c.amountCents ? "refunded" : "partially_refunded";
    log.push(`devolveu:${cid}:${amount ?? "total"}`);
    return { status: "done" };
  },
  async cancelSubscription(sid) {
    const s = subs.get(sid);
    if (s) s.active = false;
    log.push(`cancelou-assinatura:${sid}`);
  },
  parseNotice(raw, headers) {
    if (headers["asaas-access-token"] !== TOKEN) throw new BillingSignatureError();
    const b = JSON.parse(raw.toString());
    return b.payment ? { kind: "charge", eventId: b.id, event: b.event, chargeId: b.payment.id, subscriptionId: b.payment.subscription ?? null, failed: b.event === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED" } : { kind: "ignored", eventId: b.id, event: b.event };
  },
};
const pay = (cid: string, when = clock, over: Partial<ProviderCharge> = {}) => Object.assign(charges.get(cid)!, { status: "paid", paidAt: when, ...over });
let evt = 0;
const hook = (cid: string, token = TOKEN, event = "PAYMENT_RECEIVED") =>
  fetch(`${base}/api/cobranca/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "asaas-access-token": token }, body: JSON.stringify({ id: `evt_${++evt}`, event, payment: { id: cid } }) });
const api = (b: string, user: string, p: string, body?: unknown) =>
  fetch(`${b}/api/cobranca${p}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${tokens[user]}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const q1 = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows[0];
const comprar = (user: string, o: Record<string, unknown>) => api(base, user, "/checkout", { aceite: true, idem: `idem-${++seq}-xyz`, documento: "366.385.446-91", nome: "Aluno Teste StaziaMed", ...o });

function listen(deps: BillingRoutesDeps | null) {
  return new Promise<string>((resolve) => {
    const app = express();
    app.post("/api/cobranca/webhook", express.raw({ type: "*/*" }), createWebhookHandler(() => deps));
    app.use(express.json());
    app.use("/api/cobranca", createBillingRouter(() => deps));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
    servers.push(srv);
  });
}

// cópia mínima do catálogo e da carteira do ramo planos-acesso (013640/013680), com a mesma regra de devolução
const CATALOGO = `
create table public.direitos_config (id boolean primary key default true, devolucao_desconto_pct numeric(5,2) not null default 10,
  devolucao_abuso_qtd integer not null default 2, devolucao_abuso_dias integer not null default 180);
insert into public.direitos_config default values;
create table public.direitos_planos (codigo text primary key, nome text not null, descricao text, preco_mensal_centavos integer not null,
  preco_trimestral_centavos integer not null, posicao smallint not null default 0, a_venda boolean not null default false);
insert into public.direitos_planos values ('pro','PRO','1ª fase',9990,26970,1,true),('pratica','PRÁTICA','2ª fase',16990,45870,2,false),('elite','ELITE','tudo',19990,53970,3,false);
create table public.carteira_pacotes (codigo text primary key, nome text not null, preco_centavos integer not null, creditos numeric(10,1) not null,
  voz_minutos integer not null, validade_dias integer not null default 30, posicao smallint not null default 0);
insert into public.carteira_pacotes values ('boost','IA Boost',2490,100,10,30,1),('plus','IA Plus',5990,300,30,30,2),('max','IA Max',12990,700,70,30,3);
create table public.carteira_extras (id bigint generated always as identity primary key, user_id uuid not null, pacote text, origem text not null,
  creditos numeric(10,1) not null, creditos_usados numeric(10,1) not null default 0, voz_segundos integer not null default 0,
  preco_pago_centavos integer not null default 0, valido_de timestamptz not null, valido_ate timestamptz not null, referencia text unique,
  cancelado_em timestamptz, cancelado_motivo text);
create table public.carteira_devolucoes (id bigint generated always as identity primary key, user_id uuid not null, plano text, ciclo text,
  integral_7_dias boolean not null default false, valor_centavos integer not null default 0, calculo jsonb, referencia text, criado_em timestamptz not null default now());
create function public.carteira_devolucoes_recentes(p_user uuid) returns integer language sql stable as $$
  select count(*)::int from public.carteira_devolucoes d where d.user_id = p_user and d.integral_7_dias and d.criado_em > now() - interval '180 days' $$;
create function public.carteira_calcular_devolucao_plano(p_ciclo text, p_preco_centavos integer, p_contratado_em timestamptz,
  p_cancelado_em timestamptz, p_devolucoes_anteriores integer default 0) returns jsonb language plpgsql stable as $$
declare cfg public.direitos_config; v_idade interval; v_iniciados integer; v_nao integer; v_valor numeric; v_abuso boolean;
begin
  select * into cfg from public.direitos_config;
  v_abuso := coalesce(p_devolucoes_anteriores, 0) >= coalesce(cfg.devolucao_abuso_qtd, 2);
  if p_cancelado_em - p_contratado_em <= interval '7 days' then
    return jsonb_build_object('regra', 'integral_7_dias', 'valor_centavos', p_preco_centavos, 'abuso', v_abuso, 'automatica', not v_abuso);
  end if;
  if p_ciclo = 'mensal' then return jsonb_build_object('regra', 'mensal_sem_devolucao', 'valor_centavos', 0, 'abuso', false, 'automatica', true); end if;
  v_idade := age(p_cancelado_em, p_contratado_em);
  v_iniciados := (extract(year from v_idade) * 12 + extract(month from v_idade))::int + 1;
  v_nao := greatest(0, 3 - v_iniciados);
  v_valor := round(p_preco_centavos::numeric * v_nao / 3 * (100 - coalesce(cfg.devolucao_desconto_pct, 10)) / 100);
  return jsonb_build_object('regra', 'trimestral_meses_nao_iniciados', 'meses_nao_iniciados', v_nao, 'desconto_pct', coalesce(cfg.devolucao_desconto_pct, 10),
                            'valor_centavos', greatest(0, v_valor)::int, 'abuso', false, 'automatica', true);
end $$;
create function public.carteira_calcular_devolucao_extra(p_preco_centavos integer, p_creditos numeric, p_creditos_usados numeric,
  p_comprado_em timestamptz, p_cancelado_em timestamptz, p_devolucoes_anteriores integer default 0) returns jsonb language plpgsql stable as $$
declare cfg public.direitos_config; v_abuso boolean; v_nao numeric; v_valor numeric;
begin
  select * into cfg from public.direitos_config;
  v_abuso := coalesce(p_devolucoes_anteriores, 0) >= coalesce(cfg.devolucao_abuso_qtd, 2);
  if p_cancelado_em - p_comprado_em <= interval '7 days' then
    return jsonb_build_object('regra', 'integral_7_dias', 'valor_centavos', p_preco_centavos, 'abuso', v_abuso, 'automatica', not v_abuso);
  end if;
  v_nao := greatest(0, p_creditos - coalesce(p_creditos_usados, 0));
  v_valor := round(p_preco_centavos::numeric * v_nao / p_creditos * (100 - coalesce(cfg.devolucao_desconto_pct, 10)) / 100);
  return jsonb_build_object('regra', 'extra_creditos_nao_usados', 'creditos_nao_usados', v_nao, 'valor_centavos', greatest(0, v_valor)::int, 'abuso', false, 'automatica', true);
end $$;`;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, uid] of [ALUNO, CARTAO, SEM_TERMO, EQUIPE, TRI, PIXREN, DEVOL, FALHA].entries()) {
    await dev.db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `c${i}@t.dev`]);
    tokens[uid] = await dev.createSession(uid);
    if (uid !== SEM_TERMO) await dev.db.query(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) select $1, document, version, 'tela_aceite', 'x' from public.legal_versions where document = 'termo_uso'`, [uid]);
  }
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EQUIPE]);
  const deps: BillingRoutesDeps = { billing: createBilling({ db, provider: fake, baseUrl: "https://app.teste.dev", now: () => clock }), provider: fake, authenticate: (req) => db.authenticate(req) };
  base = await listen(deps);
  offBase = await listen({ billing: createBilling({ db, provider: null, baseUrl: null }), provider: null, authenticate: (req) => db.authenticate(req) });
}, 300_000);

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("desligada", () => {
  it("sem chave: resumo diz desligado e o resto 503; aviso 503", async () => {
    expect((await api(offBase, ALUNO, "/overview")).body).toEqual({ enabled: false });
    expect((await api(offBase, ALUNO, "/checkout", { tipo: "extra", codigo: "boost", metodo: "pix", aceite: true, idem: "abcdefgh1" })).status).toBe(503);
    const r = await fetch(`${offBase}/api/cobranca/webhook`, { method: "POST", body: "{}" });
    expect(r.status).toBe(503);
  });

  it("com chave mas vendas desligadas no banco (2ª trava) e sem catálogo: nada à venda", async () => {
    const r = await comprar(ALUNO, { tipo: "extra", codigo: "boost", metodo: "pix" });
    expect(r).toMatchObject({ status: 503, body: { code: "vendas_desligadas" } });
    await dev.db.query(`update public.billing_config set vendas_ligadas = true`);
    const r2 = await comprar(ALUNO, { tipo: "extra", codigo: "boost", metodo: "pix" });
    expect(r2).toMatchObject({ status: 409, body: { code: "fora_de_venda" } }); // carteira ainda não instalada
    await dev.db.exec(CATALOGO);
  });
});

describe("compra de extra por Pix", () => {
  let pedido: any;
  it("exige aceite, CPF válido e nome; só Pix ou cartão; equipe e quem não aceitou o Termo não compram", async () => {
    expect((await api(base, ALUNO, "/checkout", { tipo: "extra", codigo: "boost", metodo: "pix", idem: "abcdefgh2" })).body.code).toBe("aceite_obrigatorio");
    expect((await comprar(ALUNO, { tipo: "extra", codigo: "boost", metodo: "pix", documento: undefined })).body.code).toBe("documento_obrigatorio");
    expect((await comprar(ALUNO, { tipo: "extra", codigo: "boost", metodo: "pix", documento: "111.111.111-11" })).body.code).toBe("documento_invalido");
    expect((await comprar(ALUNO, { tipo: "extra", codigo: "boost", metodo: "boleto" })).status).toBe(400);
    expect((await comprar(EQUIPE, { tipo: "extra", codigo: "boost", metodo: "pix" })).status).toBe(403);
    expect((await comprar(SEM_TERMO, { tipo: "extra", codigo: "boost", metodo: "pix" })).status).toBe(403);
  });

  it("abre o pedido com preço do banco, QR Code, aceite carimbado e SEM guardar CPF", async () => {
    const r = await api(base, ALUNO, "/checkout", { tipo: "extra", codigo: "boost", metodo: "pix", aceite: true, idem: "idem-boost-1", documento: "36638544691", nome: "Aluno Teste" });
    expect(r.status).toBe(200);
    pedido = r.body;
    expect(pedido).toMatchObject({ status: "aberto", valor_centavos: 2490, nome: "IA Boost", metodo: "pix" });
    expect(pedido.pix.payload).toBe("000201");
    const row = await q1(`select aceite, provider_customer_id from public.billing_pedidos where id = $1`, [pedido.id]);
    expect(row.aceite).toMatchObject({ aceito: true, oferta: { valor_centavos: 2490 } });
    expect(row.aceite.registrado_em).toBeTruthy();
    const tudo = JSON.stringify((await dev.db.query(`select * from public.billing_pedidos`)).rows) + JSON.stringify((await dev.db.query(`select * from public.billing_clientes`)).rows);
    expect(tudo).not.toContain("36638544691");
  });

  it("idempotente (mesmo clique) e um pedido aberto por vez", async () => {
    const again = await api(base, ALUNO, "/checkout", { tipo: "extra", codigo: "boost", metodo: "pix", aceite: true, idem: "idem-boost-1" });
    expect(again.body.id).toBe(pedido.id);
    const other = await comprar(ALUNO, { tipo: "extra", codigo: "max", metodo: "pix" });
    expect(other).toMatchObject({ status: 409, body: { code: "pedido_aberto" } });
    expect(log.filter((l) => l.startsWith("cobranca:")).length).toBe(1);
  });

  it("aviso com token errado = 401; aviso certo mas cobrança ainda pendente = nada liberado", async () => {
    expect((await hook(pedido.id, "errado")).status).toBe(401);
    const cid = (await q1(`select provider_payment_id from public.billing_pedidos where id = $1`, [pedido.id])).provider_payment_id;
    expect((await hook(cid)).status).toBe(200);
    expect(await q1(`select count(*)::int n from public.carteira_extras where user_id = $1`, [ALUNO])).toEqual({ n: 0 });
  });

  it("pago: confere na API, entrega o extra na carteira uma vez só (aviso repetido não duplica)", async () => {
    const cid = (await q1(`select provider_payment_id from public.billing_pedidos where id = $1`, [pedido.id])).provider_payment_id;
    pay(cid);
    expect((await hook(cid)).status).toBe(200);
    expect((await hook(cid)).status).toBe(200);
    const e = await q1(`select count(*)::int n, max(creditos)::int c, max(voz_segundos) v, max(preco_pago_centavos) p from public.carteira_extras where user_id = $1`, [ALUNO]);
    expect(e).toEqual({ n: 1, c: 100, v: 600, p: 2490 });
    expect(await q1(`select status, entregue from public.billing_pedidos where id = $1`, [pedido.id])).toEqual({ status: "pago", entregue: true });
  });

  it("valor diferente do pedido NÃO libera (o aviso falha e o fornecedor tenta de novo)", async () => {
    const r = await comprar(ALUNO, { tipo: "extra", codigo: "plus", metodo: "pix" });
    const cid = r.body.url.split("/").pop();
    pay(cid, clock, { amountCents: 100 });
    expect((await hook(cid)).status).toBe(500);
    expect(await q1(`select count(*)::int n from public.carteira_extras where user_id = $1 and pacote = 'plus'`, [ALUNO])).toEqual({ n: 0 });
    await api(base, ALUNO, `/orders/${r.body.id}/cancel`, {});
  });

  it("cobrança que não existe na nossa conta (aviso forjado com token vazado) é ignorada", async () => {
    expect((await hook("pay_de_outra_conta")).status).toBe(200);
  });
});

describe("PRO mensal no cartão (renovação automática, sem tolerância)", () => {
  let cid: string;
  it("só o PRO está à venda; ELITE em breve", async () => {
    expect((await comprar(CARTAO, { tipo: "plano", codigo: "elite", ciclo: "mensal", metodo: "cartao" })).body.code).toBe("fora_de_venda");
    expect((await comprar(CARTAO, { tipo: "plano", codigo: "pratica", ciclo: "mensal", metodo: "cartao" })).body.code).toBe("fora_de_venda");
    const ov = await api(base, CARTAO, "/overview");
    expect(ov.body.vitrine.planos.map((p: any) => [p.codigo, p.a_venda])).toEqual([["pro", true], ["pratica", false], ["elite", false]]);
  });

  it("cria a assinatura no fornecedor (sem o cartão passar por aqui) e libera ao confirmar", async () => {
    const r = await comprar(CARTAO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    expect(r.status).toBe(200);
    cid = r.body.url.split("/").pop();
    expect(log.some((l) => l.startsWith("assinatura:") && l.endsWith(":monthly:9990"))).toBe(true);
    pay(cid);
    // a tela que espera também confere (sem aviso): o servidor relê a cobrança e processa
    const st = await api(base, CARTAO, `/orders/${r.body.id}`);
    expect(st.body.status).toBe("pago");
    const s = await q1(`select plan, status, current_period_end, provider_subscription_id from public.subscriptions where user_id = $1`, [CARTAO]);
    expect(s.plan).toBe("pro");
    expect(s.status).toBe("active");
    expect(new Date(s.current_period_end).toISOString()).toBe("2026-11-18T02:59:59.000Z"); // fim do dia 17/11 em Brasília
    expect(s.provider_subscription_id).toMatch(/^sub_/);
    expect((await comprar(CARTAO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" })).body.code).toBe("ja_assinante");
  });

  it("renovação do cartão (cobrança nova da mesma assinatura) estende o período", async () => {
    const sid = (await q1(`select provider_subscription_id s from public.subscriptions where user_id = $1`, [CARTAO])).s;
    const nova = "pay_renov_1";
    charges.set(nova, { id: nova, status: "paid", method: "card", amountCents: 9990, refundedCents: 0, customerId: "cus_02", subscriptionId: sid, externalReference: null, dueDate: "2026-11-17", paidAt: new Date("2026-11-17T10:00:00Z"), installments: false, reference: "" });
    expect((await hook(nova)).status).toBe(200);
    const s = await q1(`select current_period_end from public.subscriptions where user_id = $1`, [CARTAO]);
    expect(new Date(s.current_period_end).toISOString()).toBe("2026-12-18T02:59:59.000Z");
  });

  it("cartão recusado na renovação: pausa o acesso NA HORA; nada de 'past_due' (que daria 3 dias)", async () => {
    const sid = (await q1(`select provider_subscription_id s from public.subscriptions where user_id = $1`, [CARTAO])).s;
    charges.set("pay_recusado", { id: "pay_recusado", status: "failed", method: "card", amountCents: 9990, refundedCents: 0, customerId: "cus_02", subscriptionId: sid, externalReference: null, dueDate: "2026-12-17", paidAt: null, installments: false, reference: "" });
    expect((await hook("pay_recusado")).status).toBe(200);
    const s = await q1(`select status, current_period_end <= now() as pausado from public.subscriptions where user_id = $1`, [CARTAO]);
    expect(s).toEqual({ status: "active", pausado: true });
    expect(await q1(`select status from public.billing_cobrancas where provider_payment_id = 'pay_recusado'`)).toEqual({ status: "falhou" });
  });

  it("cancelar a renovação: cancela no fornecedor e mantém o acesso até o fim do período", async () => {
    const r = await api(base, CARTAO, "/cancel-renewal", {});
    expect(r.status).toBe(200);
    expect(new Date(r.body.acesso_ate).toISOString()).toBe("2026-12-18T02:59:59.000Z");
    expect(log.some((l) => l.startsWith("cancelou-assinatura:"))).toBe(true);
    const s = await q1(`select status, provider_subscription_id from public.subscriptions where user_id = $1`, [CARTAO]);
    expect(s).toEqual({ status: "active", provider_subscription_id: null });
  });
});

describe("renovação do cartão recusada (decisão do dono 17/10): bloqueio no mesmo dia, volta ao pagar, sem cobrança em dobro", () => {
  const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  let sid: string;
  it("cartão recusado no dia do vencimento: o acesso cai na hora, mesmo com o Asaas ainda tentando", async () => {
    const r = await comprar(FALHA, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    pay(r.body.url.split("/").pop());
    await api(base, FALHA, `/orders/${r.body.id}`);
    sid = (await q1(`select provider_subscription_id s from public.subscriptions where user_id = $1`, [FALHA])).s;
    // como se o mês pago terminasse hoje (fim do dia do vencimento)
    const fimHoje = new Date(`${hoje()}T23:59:59-03:00`).toISOString();
    await dev.db.query(`update public.subscriptions set current_period_end = $2 where user_id = $1`, [FALHA, fimHoje]);
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [FALHA, fimHoje]);
    // a cobrança de renovação de hoje foi recusada (aviso de recusa; a cobrança continua "pendente" para nova tentativa)
    charges.set("pay_ren_falhou", { id: "pay_ren_falhou", status: "pending", method: "card", amountCents: 9990, refundedCents: 0, customerId: "cus_08", subscriptionId: sid, externalReference: null, dueDate: hoje(), paidAt: null, installments: false, reference: "" });
    expect((await hook("pay_ren_falhou", TOKEN, "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED")).status).toBe(200);
    const s = await q1(`select status, current_period_end <= now() as pausado from public.subscriptions where user_id = $1`, [FALHA]);
    expect(s).toEqual({ status: "active", pausado: true });
    const ov = await api(base, FALHA, "/overview");
    expect(ov.body.renovacao_pendente).toMatchObject({ valor_centavos: 9990, plano: "pro" });
    expect(ov.body.renovacao_pendente.payment_id).toBeUndefined(); // o aluno não vê o código interno
    // comprar de novo seria cobrança em dobro: barrado, com o caminho certo
    expect((await comprar(FALHA, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" })).body.code).toBe("renovacao_pendente");
  });

  it("paga por Pix: a MESMA cobrança vira Pix (nada novo no fornecedor) e o acesso volta na hora, contando da confirmação", async () => {
    const antes = log.filter((l) => l.startsWith("cobranca:") || l.startsWith("assinatura:")).length;
    const r = await api(base, FALHA, "/renewal/pix", {});
    expect(r.status).toBe(200);
    expect(r.body.pix.payload).toBe("000201REN");
    expect(log).toContain("virou-pix:pay_ren_falhou");
    expect(log.filter((l) => l.startsWith("cobranca:") || l.startsWith("assinatura:")).length).toBe(antes);
    // repetir o clique devolve o mesmo Pix
    expect((await api(base, FALHA, "/renewal/pix", {})).body.id).toBe(r.body.id);
    pay("pay_ren_falhou");
    expect((await hook("pay_ren_falhou")).status).toBe(200);
    const s = await q1(`select status, current_period_end from public.subscriptions where user_id = $1`, [FALHA]);
    expect(s.status).toBe("active");
    expect(new Date(s.current_period_end) > new Date(Date.now() + 25 * 86400e3)).toBe(true);
    // o contrato continua no cartão (a assinatura segue cobrando o cartão nos próximos meses; nada de Pix de renovação extra)
    expect(await q1(`select metodo, renova, provider_subscription_id = $2 as mesma from public.billing_contratos where user_id = $1`, [FALHA, sid])).toEqual({ metodo: "cartao", renova: true, mesma: true });
    expect((await api(base, FALHA, "/overview")).body.renovacao_pendente).toBeNull();
    const billing = createBilling({ db, provider: fake, baseUrl: "https://app.teste.dev", now: () => clock });
    await dev.db.query(`update public.billing_contratos set periodo_fim = now() + interval '3 days' where user_id = $1`, [FALHA]);
    expect((await billing.runScheduled()).renovacoes).toBe(0);
    expect((await api(base, FALHA, "/renewal/pix", {})).status).toBe(404);
  });

  it("aviso de recusa de uma cobrança ANTIGA não corta um período já pago por outra", async () => {
    charges.set("pay_velha", { id: "pay_velha", status: "pending", method: "card", amountCents: 9990, refundedCents: 0, customerId: "cus_08", subscriptionId: sid, externalReference: null, dueDate: "2026-09-17", paidAt: null, installments: false, reference: "" });
    await hook("pay_velha", TOKEN, "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED");
    expect(await q1(`select current_period_end > now() as ativo from public.subscriptions where user_id = $1`, [FALHA])).toEqual({ ativo: true });
  });

  it("o Asaas reprocessa o cartão dias depois e passa: libera a partir da confirmação (uma cobrança só)", () => {
    expect(periodEndFor({ method: "card", dueDate: "2026-11-17", paidAt: new Date("2026-11-19T13:00:00Z"), cycle: "mensal" }).toISOString()).toBe("2026-12-20T02:59:59.000Z");
    expect(periodEndFor({ method: "card", dueDate: "2026-11-17", paidAt: new Date("2026-11-17T09:00:00Z"), cycle: "trimestral" }).toISOString()).toBe("2027-02-18T02:59:59.000Z");
  });
});

describe("Pix do plano: renovação 7 dias antes, pagamento atrasado", () => {
  it("compra PRO mensal por Pix; a tarefa gera o Pix de renovação 7 dias antes, uma vez só", async () => {
    const r = await comprar(PIXREN, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    pay(r.body.url.split("/").pop());
    await api(base, PIXREN, `/orders/${r.body.id}`);
    const fim = (await q1(`select periodo_fim from public.billing_contratos where user_id = $1`, [PIXREN])).periodo_fim;
    expect(new Date(fim).toISOString()).toBe("2026-11-18T02:59:59.000Z");
    const billing = createBilling({ db, provider: fake, baseUrl: "https://app.teste.dev", now: () => clock });
    // 8 dias antes: ainda não
    await dev.db.query(`update public.billing_contratos set periodo_fim = now() + interval '8 days' where user_id = $1`, [PIXREN]);
    expect((await billing.runScheduled()).renovacoes).toBe(0);
    await dev.db.query(`update public.billing_contratos set periodo_fim = now() + interval '6 days' where user_id = $1`, [PIXREN]);
    expect((await billing.runScheduled()).renovacoes).toBe(1);
    expect((await billing.runScheduled()).renovacoes).toBe(0);
    const ren = await q1(`select valor_centavos, metodo, motivo, status, vencimento from public.billing_pedidos where user_id = $1 and motivo = 'renovacao'`, [PIXREN]);
    expect(ren).toMatchObject({ valor_centavos: 9990, metodo: "pix", motivo: "renovacao", status: "aberto" });
  });

  it("Pix pago depois do vencimento: o acesso volta e o novo período conta do dia do pagamento", () => {
    const end = periodEndFor({ method: "pix", dueDate: "2026-11-17", paidAt: new Date("2026-11-20T13:00:00Z"), cycle: "mensal" });
    expect(end.toISOString()).toBe("2026-12-21T02:59:59.000Z");
    const early = periodEndFor({ method: "pix", dueDate: "2026-11-17", paidAt: new Date("2026-11-12T13:00:00Z"), cycle: "trimestral" });
    expect(early.toISOString()).toBe("2027-02-18T02:59:59.000Z");
    expect(periodEndFor({ method: "card", dueDate: "2027-01-31", paidAt: new Date("2027-01-31T13:00:00Z"), cycle: "mensal" }).toISOString()).toBe("2027-03-01T02:59:59.000Z");
  });
});

describe("devolução pela regra do dono", () => {
  it("em 7 dias: integral, corta o acesso na hora", async () => {
    const r = await comprar(DEVOL, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    const cid = r.body.url.split("/").pop();
    pay(cid);
    await hook(cid);
    const ov = await api(base, DEVOL, "/overview");
    const d = ov.body.devolucoes.find((x: any) => x.tipo === "plano");
    expect(d).toMatchObject({ regra: "integral_7_dias", valor_centavos: 9990 });
    const res = await api(base, DEVOL, "/refunds", { cobranca_id: d.cobranca_id });
    expect(res.body).toMatchObject({ status: "feito", valor_centavos: 9990 });
    const s = await q1(`select status, current_period_end <= now() as cortado from public.subscriptions where user_id = $1`, [DEVOL]);
    expect(s).toEqual({ status: "canceled", cortado: true });
    expect((await api(base, DEVOL, "/refunds", { cobranca_id: d.cobranca_id })).body.code).toBe("sem_devolucao");
  });

  it("trimestral cancelado no 2º mês: 1 mês não iniciado − 10% = R$ 80,91; acesso até o fim do mês em curso", async () => {
    const r = await comprar(TRI, { tipo: "plano", codigo: "pro", ciclo: "trimestral", metodo: "pix" });
    const cid = r.body.url.split("/").pop();
    pay(cid, new Date("2026-08-20T15:00:00Z"), { dueDate: "2026-08-20" });
    await hook(cid);
    // a compra foi em 20/08 (40 e poucos dias atrás): mês 2 em curso
    await dev.db.query(`update public.billing_cobrancas set pago_em = now() - interval '40 days' where provider_payment_id = $1`, [cid]);
    await dev.db.query(`update public.billing_contratos set contratado_em = now() - interval '40 days', periodo_fim = now() + interval '50 days' where user_id = $1`, [TRI]);
    await dev.db.query(`update public.subscriptions set current_period_end = now() + interval '50 days' where user_id = $1`, [TRI]);
    const ov = await api(base, TRI, "/overview");
    const d = ov.body.devolucoes.find((x: any) => x.tipo === "plano");
    expect(d).toMatchObject({ regra: "trimestral_meses_nao_iniciados", meses_nao_iniciados: 1, valor_centavos: 8091 });
    const res = await api(base, TRI, "/refunds", { cobranca_id: d.cobranca_id });
    expect(res.body).toMatchObject({ status: "feito", valor_centavos: 8091 });
    expect(log).toContain(`devolveu:${cid}:8091`);
    const s = await q1(`select status, current_period_end > now() as ainda, current_period_end < now() + interval '25 days' as encurtou from public.subscriptions where user_id = $1`, [TRI]);
    expect(s).toEqual({ status: "active", ainda: true, encurtou: true });
  });

  it("extra depois de 7 dias com 50 de 100 créditos usados: R$ 12,45 − 10% = R$ 11,21", async () => {
    const x = await q1(`select id from public.billing_cobrancas where user_id = $1 and tipo = 'extra' and status = 'paga'`, [ALUNO]);
    await dev.db.query(`update public.billing_cobrancas set pago_em = now() - interval '10 days' where id = $1`, [x.id]);
    await dev.db.query(`update public.carteira_extras set creditos_usados = 50 where user_id = $1`, [ALUNO]);
    const ov = await api(base, ALUNO, "/overview");
    const d = ov.body.devolucoes.find((y: any) => y.tipo === "extra");
    expect(d).toMatchObject({ regra: "extra_creditos_nao_usados", valor_centavos: 1121 });
    const res = await api(base, ALUNO, "/refunds", { cobranca_id: d.cobranca_id });
    expect(res.body).toMatchObject({ status: "feito", valor_centavos: 1121 });
  });

  it("mensal depois de 7 dias: sem devolução", async () => {
    const x = await q1(`select id from public.billing_cobrancas where user_id = $1 and tipo = 'plano' and status = 'paga' order by id limit 1`, [PIXREN]);
    await dev.db.query(`update public.billing_cobrancas set pago_em = now() - interval '9 days' where id = $1`, [x.id]);
    await dev.db.query(`update public.billing_contratos set contratado_em = now() - interval '9 days' where user_id = $1`, [PIXREN]);
    expect((await api(base, PIXREN, "/refunds", { cobranca_id: x.id })).body.code).toBe("sem_devolucao");
  });
});

describe("tarefa agendada", () => {
  it("pedido vencido: confere no fornecedor, cancela a cobrança e encerra", async () => {
    const r = await comprar(ALUNO, { tipo: "extra", codigo: "max", metodo: "pix" });
    await dev.db.query(`update public.billing_pedidos set expira_em = now() - interval '1 minute' where id = $1`, [r.body.id]);
    const billing = createBilling({ db, provider: fake, baseUrl: "https://app.teste.dev", now: () => clock });
    const out = await billing.runScheduled();
    expect(out.expirados).toBeGreaterThanOrEqual(1);
    expect(await q1(`select status from public.billing_pedidos where id = $1`, [r.body.id])).toEqual({ status: "expirado" });
    expect(log).toContain(`cancelou:${r.body.url.split("/").pop()}`);
  });

  it("rota da tarefa exige o segredo", async () => {
    process.env.CRON_SECRET = "segredo-de-teste";
    expect((await fetch(`${base}/api/cobranca/cron`)).status).toBe(401);
    expect((await fetch(`${base}/api/cobranca/cron`, { headers: { Authorization: "Bearer errado" } })).status).toBe(401);
    expect((await fetch(`${base}/api/cobranca/cron`, { headers: { Authorization: "Bearer segredo-de-teste" } })).status).toBe(200);
    delete process.env.CRON_SECRET;
  });

  it("o aluno não lê as tabelas da cobrança direto", async () => {
    const funcs = await dev.db.query<any>(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'ch\\_worker\\_billing\\_%' or p.proname like 'billing\\_%') and has_function_privilege('authenticated', p.oid, 'execute')`);
    expect(funcs.rows).toEqual([]);
    const t = await dev.db.query<any>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'billing\\_%' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, 'select')`);
    expect(t.rows.map((r: any) => r.relname).filter((x: string) => x !== "billing_events")).toEqual([]);
  });
});
