// @vitest-environment node
/**
 * Ajustes da cobrança antes de abrir as vendas (migração 013850, ramo ajustes-cobranca; decisões do dono de 17/10), no banco local
 * (PGlite) com um fornecedor SIMULADO (sem rede):
 *   1. devolução feita no painel do Asaas: duplicada / parcial / período encerrado / conferir mantêm o acesso; só a única cobrança do
 *      período em curso corta (e cancela a renovação do cartão); extra devolvido por inteiro cancela os créditos; aviso repetido = nada;
 *   2. botão "Devolver pagamento" da Administração: só administrador, motivo e escolha do acesso obrigatórios, manter / encerrar,
 *      parcial, recusa do fornecedor volta para a equipe, assume o pedido do aluno que ficou para a equipe, grava quem fez;
 *   3. nota fiscal: aviso INVOICE_* relido na API, link no histórico, e-mail "Sua nota fiscal" uma vez só, nota de outro sistema
 *      ignorada, nota cancelada, conferência de hora em hora quando o aviso não chega;
 *   4. alertas ao dono: 80% e 100% do teto do dia, aluno fora do comum, uma vez só, endereço e chave configuráveis, desligados = nada;
 *   5. extras de IA à venda junto com o PRO quando as vendas abrem;
 *   6. a migração pode ser colada de novo, desfeita e colada outra vez.
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
import { createBillingRouter, createWebhookHandler, type BillingRoutesDeps } from "../../server/billing/router";
import { BillingSignatureError, ProviderError, type PaymentProvider, type ProviderCharge, type ProviderInvoice } from "../../server/billing/provider";
import { createEmailsCobranca, renderAlerta, renderNota } from "../../server/avisos/emailsCobranca";
import type { MailMessage } from "../../server/avisos/smtp";

const TOKEN = "token-do-aviso-simulado-com-mais-de-32-caracteres";
const CRON = "segredo-da-tarefa-de-teste";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ajustes-cobranca-"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [DUPLO, PARCIAL, UNICA, ANTIGA, CONFERIR, EXTRA, ADMIN, EDITOR, MANTER, ENCERRAR, RECUSA, ASSUME, NOTA, GASTAO, DUPLO_CARTAO] = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].map(id);
const TODOS = [DUPLO, PARCIAL, UNICA, ANTIGA, CONFERIR, EXTRA, ADMIN, EDITOR, MANTER, ENCERRAR, RECUSA, ASSUME, NOTA, GASTAO, DUPLO_CARTAO];
const MIGRACAO = path.resolve(__dirname, "../../supabase/migrations/20261003013850_ajustes_cobranca.sql");
const DESFAZER = path.resolve(__dirname, "../../supabase/desfazer/20261003013850_ajustes_cobranca.desfazer.sql");
const CONFERIR_SQL = path.resolve(__dirname, "../../supabase/conferir/ajustes-cobranca.sql");
let dev: DevDatabase;
let db: ContentDb;
let base: string;
const servers: Server[] = [];
const tokens: Record<string, string> = {};
const enviados: MailMessage[] = [];
const DIA = 86400e3;

// ---------------------------------------------------------------- fornecedor simulado
const charges = new Map<string, ProviderCharge & { reference: string }>();
const invoices = new Map<string, ProviderInvoice>();
const subs = new Map<string, { active: boolean }>();
const recusar = new Set<string>();
const log: string[] = [];
let seq = 0;
const fake: PaymentProvider = {
  name: "asaas",
  mode: "test",
  capabilities: { methods: { card: true, pix: true, debit: true }, partialRefund: true, requiresAddress: false, invoices: true },
  async ensureCustomer(i) {
    return `cus_${i.userId.slice(-2)}`;
  },
  async createCharge(i) {
    const cid = `pay_${++seq}`;
    charges.set(cid, { id: cid, status: "pending", method: i.method, amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: null, externalReference: i.reference, dueDate: i.dueDate, paidAt: null, installments: false, reference: i.reference });
    return { chargeId: cid, url: `https://pagar.teste/${cid}`, pix: i.method === "pix" ? { payload: "000201", image: "img", expiresAt: null } : null };
  },
  async createCardSubscription(i) {
    const sid = `sub_${++seq}`;
    subs.set(sid, { active: true });
    const cid = `pay_${++seq}`;
    charges.set(cid, { id: cid, status: "pending", method: "card", amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: sid, externalReference: i.reference, dueDate: i.firstDueDate, paidAt: null, installments: false, reference: i.reference });
    return { subscriptionId: sid, chargeId: cid, url: `https://pagar.teste/${cid}`, pix: null };
  },
  async payChargeByPix(cid) {
    return { chargeId: cid, url: `https://pagar.teste/${cid}`, pix: null };
  },
  async getCharge(cid) {
    const c = charges.get(cid);
    return c ? { ...c } : null;
  },
  async cancelCharge(cid) {
    const c = charges.get(cid);
    if (c && c.status === "pending") c.status = "canceled";
  },
  async refund(cid, amount) {
    if (recusar.has(cid)) throw new ProviderError("Asaas 400: invalid_action - Esta cobrança só pode ser estornada parcialmente no próximo dia", 400, "invalid_action");
    const c = charges.get(cid)!;
    c.refundedCents += amount ?? c.amountCents - c.refundedCents;
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
    if (b.invoice) return { kind: "invoice", eventId: b.id, event: b.event, invoiceId: b.invoice.id };
    return b.payment ? { kind: "charge", eventId: b.id, event: b.event, chargeId: b.payment.id, subscriptionId: b.payment.subscription ?? null } : { kind: "ignored", eventId: b.id, event: b.event };
  },
  async getInvoice(iid) {
    const i = invoices.get(iid);
    return i ? { ...i } : null;
  },
  async listInvoices(cid) {
    return [...invoices.values()].filter((i) => i.chargeId === cid);
  },
};
const mailer = {
  from: "nao-responda@teste.dev",
  async send(m: MailMessage) {
    enviados.push(m);
  },
};
let evt = 0;
const hook = (body: Record<string, unknown>) =>
  fetch(`${base}/api/cobranca/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "asaas-access-token": TOKEN }, body: JSON.stringify({ id: `evt_${++evt}`, ...body }) });
const hookPag = (cid: string, event = "PAYMENT_RECEIVED") => hook({ event, payment: { id: cid, subscription: charges.get(cid)?.subscriptionId ?? undefined } });
const api = (user: string, p: string, body?: unknown) =>
  fetch(`${base}/api/cobranca${p}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${tokens[user]}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const q = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows;
const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const comoUsuario = <T>(user: string, fn: string, args: Record<string, unknown> = {}) => db.asUser<T>({ id: user, email: null }, fn, args);
const brt = (d: Date) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const hojeBr = () => brt(new Date());

/** Compra pelo app e pagamento confirmado pelo aviso. Devolve o id da cobrança no fornecedor. */
async function comprarPago(user: string, o: Record<string, unknown>, ajuste: Partial<ProviderCharge> = {}) {
  const r = await api(user, "/checkout", { aceite: true, idem: `idem-${++seq}-ajustes`, documento: "366.385.446-91", nome: "Aluno Teste StaziaMed", ...o });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const pedido = await q1(`select provider_payment_id from public.billing_pedidos where id = $1`, [r.body.id]);
  const cid = pedido.provider_payment_id as string;
  Object.assign(charges.get(cid)!, { status: "paid", paidAt: new Date(), ...ajuste });
  expect((await hookPag(cid)).status).toBe(200);
  return cid;
}

/** Outra cobrança paga da MESMA assinatura do cartão (renovação), com vencimento e pagamento escolhidos. */
async function renovacaoPaga(sid: string, due: Date, paidAt: Date) {
  const cid = `pay_${++seq}`;
  charges.set(cid, { id: cid, status: "paid", method: "card", amountCents: 9990, refundedCents: 0, customerId: "cus_x", subscriptionId: sid, externalReference: null, dueDate: brt(due), paidAt, installments: false, reference: "" });
  expect((await hookPag(cid)).status).toBe(200);
  return cid;
}

/** Devolução feita no painel do fornecedor (o aviso chega depois). */
async function devolverNoPainel(cid: string, valor?: number) {
  const c = charges.get(cid)!;
  c.refundedCents = valor ?? c.amountCents;
  c.status = c.refundedCents >= c.amountCents ? "refunded" : "partially_refunded";
  expect((await hookPag(cid, c.status === "refunded" ? "PAYMENT_REFUNDED" : "PAYMENT_PARTIALLY_REFUNDED")).status).toBe(200);
}

const cobranca = (cid: string) => q1(`select * from public.billing_cobrancas where provider_payment_id = $1`, [cid]);
const acesso = (user: string) => q1(`select status::text, current_period_end > now() as vale from public.subscriptions where user_id = $1`, [user]);
const contrato = (user: string) => q1(`select renova, periodo_fim > now() as vale, ultima_cobranca_id, provider_subscription_id from public.billing_contratos where user_id = $1`, [user]);
const devolucoesPainel = (user: string) => q(`select classificacao, conferir, valor_centavos, status, origem from public.billing_reembolsos where user_id = $1 and origem = 'painel' order by id`, [user]);

let emails: ReturnType<typeof createEmailsCobranca>;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, uid] of TODOS.entries()) {
    await dev.db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `aj${i}@t.dev`]);
    await dev.db.query(`update public.profiles set name = 'Joana Teste' where id = $1`, [uid]);
    tokens[uid] = await dev.createSession(uid);
    await dev.db.query(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) select $1, document, version, 'tela_aceite', 'x' from public.legal_versions where document = 'termo_uso'`, [uid]);
  }
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await dev.db.query(`update public.billing_config set vendas_ligadas = true`);
  const billing = createBilling({ db, provider: fake, baseUrl: "https://app.teste.dev" });
  emails = createEmailsCobranca({ db, mailer, baseUrl: "https://app.teste.dev" });
  const deps: BillingRoutesDeps = { billing, provider: fake, authenticate: (req) => db.authenticate(req), emails };
  const app = express();
  app.post("/api/cobranca/webhook", express.raw({ type: "*/*" }), createWebhookHandler(() => deps));
  app.use(express.json());
  app.use("/api/cobranca", createBillingRouter(() => deps));
  base = await new Promise<string>((resolve) => {
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
    servers.push(srv);
  });
  process.env.CRON_SECRET = CRON;
}, 300_000);

afterAll(async () => {
  delete process.env.CRON_SECRET;
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("migração 013850", () => {
  it("pode ser colada de novo, desfeita e colada outra vez; a conferência diz OK", async () => {
    const sql = fs.readFileSync(MIGRACAO, "utf8");
    await dev.db.exec(sql);
    await dev.db.exec(sql);
    await dev.db.exec(fs.readFileSync(DESFAZER, "utf8"));
    // desfeita: a versão antiga da devolução voltou e as tabelas novas sumiram
    expect((await q1(`select to_regclass('public.alertas_dono') is null as sumiu`)).sumiu).toBe(true);
    expect((await q1(`select position('classificacao' in pg_get_functiondef('public.ch_worker_billing_devolvido(text,text,integer)'::regprocedure)) = 0 as antiga`)).antiga).toBe(true);
    await dev.db.exec(fs.readFileSync(DESFAZER, "utf8"));
    await dev.db.exec(sql);
    expect((await q1(`select email, ligado, resumo_diario from public.alertas_dono_config`))).toEqual({ email: "suporte@staziamed.com.br", ligado: true, resumo_diario: true });
    let conferir: any;
    try {
      conferir = await q1(fs.readFileSync(CONFERIR_SQL, "utf8"));
    } catch (e) {
      // o PGlite pode não ter XML (query_to_xml); a parte que confere o banco roda sem ela
      if (!/xml/i.test(String((e as Error).message))) throw e;
      const s = fs.readFileSync(CONFERIR_SQL, "utf8");
      conferir = await q1(s.slice(0, s.indexOf(",\n  (select concat_ws")) + "\nfrom falta;");
    }
    expect(conferir.resultado).toBe("OK: ajustes da cobrança (013850) no banco");
  });
});

describe("devolução feita no painel do Asaas", () => {
  it("cobrança repetida (o período já foi pago por outra cobrança): o acesso continua e o contrato passa a apontar para a que ficou", async () => {
    const c1 = await comprarPago(DUPLO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    // a mesma compra paga duas vezes: outra cobrança com a mesma referência do pedido
    const ref = charges.get(c1)!.reference;
    const c2 = `pay_${++seq}`;
    charges.set(c2, { ...charges.get(c1)!, id: c2, paidAt: new Date(), reference: ref });
    expect((await hookPag(c2)).status).toBe(200);
    expect((await q1(`select count(*)::int n from public.billing_cobrancas where user_id = $1 and status = 'paga'`, [DUPLO])).n).toBe(2);
    await devolverNoPainel(c2);
    expect(await acesso(DUPLO)).toEqual({ status: "active", vale: true });
    expect((await contrato(DUPLO))).toMatchObject({ renova: true, vale: true, ultima_cobranca_id: (await cobranca(c1)).id });
    expect(await devolucoesPainel(DUPLO)).toEqual([{ classificacao: "duplicada", conferir: false, valor_centavos: 9990, status: "feito", origem: "painel" }]);
    // aviso repetido (outro id de evento, mesmo valor): nada novo
    await devolverNoPainel(c2);
    expect((await devolucoesPainel(DUPLO)).length).toBe(1);
  });

  it("cobrança repetida por Pix em cima do período do cartão: devolvida, o contrato volta a renovar no cartão (sem Pix de renovação a mais)", async () => {
    const c1 = await comprarPago(DUPLO_CARTAO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    const sid = charges.get(c1)!.subscriptionId!;
    const c2 = `pay_${++seq}`;
    charges.set(c2, { ...charges.get(c1)!, id: c2, method: "pix", subscriptionId: null, paidAt: new Date() });
    expect((await hookPag(c2)).status).toBe(200);
    expect(await q1(`select metodo, provider_subscription_id from public.billing_contratos where user_id = $1`, [DUPLO_CARTAO])).toEqual({ metodo: "pix", provider_subscription_id: null });
    await devolverNoPainel(c2);
    expect(await q1(`select metodo, provider_subscription_id, renova from public.billing_contratos where user_id = $1`, [DUPLO_CARTAO])).toEqual({ metodo: "cartao", provider_subscription_id: sid, renova: true });
    expect(await acesso(DUPLO_CARTAO)).toEqual({ status: "active", vale: true });
    expect((await devolucoesPainel(DUPLO_CARTAO))[0].classificacao).toBe("duplicada");
  });

  it("devolução parcial: o acesso continua e fica registrada", async () => {
    const c = await comprarPago(PARCIAL, { tipo: "plano", codigo: "pro", ciclo: "trimestral", metodo: "pix" });
    await devolverNoPainel(c, 5000);
    expect(await acesso(PARCIAL)).toEqual({ status: "active", vale: true });
    expect((await cobranca(c))).toMatchObject({ status: "devolvida_parcial", devolvido_centavos: 5000 });
    expect(await devolucoesPainel(PARCIAL)).toEqual([{ classificacao: "parcial", conferir: false, valor_centavos: 5000, status: "feito", origem: "painel" }]);
  });

  it("única cobrança do período em curso (desistência): o acesso acaba e a renovação do cartão é cancelada no fornecedor", async () => {
    const c = await comprarPago(UNICA, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    const sid = charges.get(c)!.subscriptionId!;
    await devolverNoPainel(c);
    expect(await acesso(UNICA)).toEqual({ status: "canceled", vale: false });
    expect(await contrato(UNICA)).toMatchObject({ renova: false, vale: false, provider_subscription_id: null });
    expect(log).toContain(`cancelou-assinatura:${sid}`);
    expect(subs.get(sid)!.active).toBe(false);
    expect((await devolucoesPainel(UNICA))[0].classificacao).toBe("unica");
  });

  it("cobrança de um período que já acabou: o acesso de hoje (pago por outra cobrança) não muda", async () => {
    const antes = new Date(Date.now() - 40 * DIA);
    const c1 = await comprarPago(ANTIGA, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" }, { dueDate: brt(antes), paidAt: antes });
    const sid = charges.get(c1)!.subscriptionId!;
    await renovacaoPaga(sid, new Date(Date.now() - 9 * DIA), new Date(Date.now() - 9 * DIA));
    expect(await acesso(ANTIGA)).toEqual({ status: "active", vale: true });
    await devolverNoPainel(c1);
    expect(await acesso(ANTIGA)).toEqual({ status: "active", vale: true });
    expect(await contrato(ANTIGA)).toMatchObject({ renova: true, vale: true });
    expect((await devolucoesPainel(ANTIGA))[0].classificacao).toBe("periodo_encerrado");
    expect(subs.get(sid)!.active).toBe(true);
  });

  it("há renovação paga para depois: o acesso continua e o dono recebe um alerta para conferir", async () => {
    const c1 = await comprarPago(CONFERIR, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    const sid = charges.get(c1)!.subscriptionId!;
    const fim = new Date((await cobranca(c1)).periodo_fim);
    await renovacaoPaga(sid, fim, new Date());
    await devolverNoPainel(c1);
    expect(await acesso(CONFERIR)).toEqual({ status: "active", vale: true });
    expect(await devolucoesPainel(CONFERIR)).toEqual([expect.objectContaining({ classificacao: "conferir", conferir: true })]);
    const alerta = await q1(`select tipo, texto from public.alertas_dono where tipo = 'devolucao_conferir' order by id desc limit 1`);
    expect(alerta.texto).toContain("aj4@t.dev");
    expect(alerta.texto).toContain("NÃO foi cortado");
  });

  it("extra devolvido por inteiro no painel: os créditos dele são cancelados", async () => {
    const c = await comprarPago(EXTRA, { tipo: "extra", codigo: "boost", metodo: "pix" });
    expect((await q1(`select cancelado_em from public.carteira_extras where referencia = $1`, [`asaas:${c}`])).cancelado_em).toBeNull();
    await devolverNoPainel(c);
    expect((await q1(`select cancelado_em from public.carteira_extras where referencia = $1`, [`asaas:${c}`])).cancelado_em).not.toBeNull();
    expect((await devolucoesPainel(EXTRA))[0].classificacao).toBe("extra_total");
  });
});

describe("botão Devolver pagamento (Administração)", () => {
  it("só o administrador; motivo e escolha do acesso são obrigatórios", async () => {
    const c = await comprarPago(MANTER, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    const x = await cobranca(c);
    expect(await api(MANTER, "/admin/devolver", { cobranca_id: x.id, motivo: "quero meu dinheiro", acesso: "manter" })).toMatchObject({ status: 403, body: { code: "so_admin" } });
    expect(await api(EDITOR, "/admin/devolver", { cobranca_id: x.id, motivo: "cobrança em dobro", acesso: "manter" })).toMatchObject({ status: 403, body: { code: "so_admin" } });
    expect(await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: " ", acesso: "manter" })).toMatchObject({ status: 422, body: { code: "motivo_obrigatorio" } });
    expect(await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: "cobrança em dobro" })).toMatchObject({ status: 422, body: { code: "acesso_obrigatorio" } });
    expect(await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: "cobrança em dobro", acesso: "manter", valor_centavos: 99999 })).toMatchObject({ status: 422, body: { code: "valor_invalido" } });
    expect(charges.get(c)!.refundedCents).toBe(0);
    await expect(comoUsuario(MANTER, "app_admin_billing_pagamentos", { p_user: MANTER })).rejects.toThrow(/administradores/);
  });

  it("devolver e MANTER acesso (parcial): só o dinheiro volta; fica gravado quem fez e o motivo", async () => {
    const x = await q1(`select * from public.billing_cobrancas where user_id = $1`, [MANTER]);
    const r = await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: "Cortesia de metade do mês", acesso: "manter", valor_centavos: 4995 });
    expect(r).toMatchObject({ status: 200, body: { ok: true, status: "feito", valor_centavos: 4995 } });
    expect(log).toContain(`devolveu:${x.provider_payment_id}:4995`);
    expect(await acesso(MANTER)).toEqual({ status: "active", vale: true });
    expect(await contrato(MANTER)).toMatchObject({ renova: true, vale: true });
    const d = await q1(`select origem, motivo, feito_por, acesso, status from public.billing_reembolsos where cobranca_id = $1`, [x.id]);
    expect(d).toEqual({ origem: "equipe", motivo: "Cortesia de metade do mês", feito_por: ADMIN, acesso: "manter", status: "feito" });
    const reg = await q1(`select actor_id, details from public.admin_audit_log where action = 'cobranca.devolver' order by id desc limit 1`);
    expect(reg.actor_id).toBe(ADMIN);
    expect(reg.details).toMatchObject({ valor_centavos: 4995, acesso: "manter", motivo: "Cortesia de metade do mês" });
    // a ficha do aluno mostra a devolução com o e-mail de quem fez
    const ficha = await comoUsuario<any>(ADMIN, "app_admin_billing_pagamentos", { p_user: MANTER });
    expect(ficha.pagamentos[0]).toMatchObject({ status: "devolvida_parcial", devolvido_centavos: 4995, devolucoes: [expect.objectContaining({ origem: "equipe", acesso: "manter", feito_por: "aj6@t.dev" })] });
    // e a aba Planos lista as devoluções recentes
    const lista = await comoUsuario<any[]>(ADMIN, "app_admin_billing_devolucoes", { p_limite: 50 });
    expect(lista.some((l) => l.cobranca_id === x.id && l.origem === "equipe")).toBe(true);
  });

  it("devolver e ENCERRAR acesso: o acesso acaba e a renovação do cartão é cancelada", async () => {
    const c = await comprarPago(ENCERRAR, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    const sid = charges.get(c)!.subscriptionId!;
    const x = await cobranca(c);
    const r = await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: "Desistência pedida por e-mail", acesso: "encerrar" });
    expect(r).toMatchObject({ status: 200, body: { ok: true, status: "feito" } });
    expect(await acesso(ENCERRAR)).toEqual({ status: "canceled", vale: false });
    expect(await contrato(ENCERRAR)).toMatchObject({ renova: false, vale: false });
    expect(subs.get(sid)!.active).toBe(false);
    expect((await cobranca(c)).status).toBe("devolvida");
  });

  it("o fornecedor recusa (parcial no cartão no mesmo dia): a tela recebe o motivo e a devolução fica para a equipe", async () => {
    const c = await comprarPago(RECUSA, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    recusar.add(c);
    const x = await cobranca(c);
    const r = await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: "Desconto combinado", acesso: "manter", valor_centavos: 1000 });
    expect(r.status).toBe(502);
    expect(r.body.code).toBe("devolucao_recusada");
    expect(r.body.error).toContain("estornada parcialmente no próximo dia");
    expect(await q1(`select status, erro is not null as tem_erro from public.billing_reembolsos where cobranca_id = $1`, [x.id])).toEqual({ status: "equipe", tem_erro: true });
    expect(await acesso(RECUSA)).toEqual({ status: "active", vale: true });
    // a equipe tenta de novo no dia seguinte: a mesma linha é assumida (não cria outra)
    recusar.delete(c);
    expect((await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: "Desconto combinado (2ª tentativa)", acesso: "manter", valor_centavos: 1000 })).status).toBe(200);
    expect(await q(`select status, motivo from public.billing_reembolsos where cobranca_id = $1`, [x.id])).toEqual([{ status: "feito", motivo: "Desconto combinado (2ª tentativa)" }]);
  });

  it("assume o pedido do aluno que ficou para a equipe (mesma linha, com quem fez)", async () => {
    const c = await comprarPago(ASSUME, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    const x = await cobranca(c);
    await dev.db.query(`insert into public.billing_reembolsos (user_id, cobranca_id, valor_centavos, total, regra, status) values ($1, $2, 9990, true, '{}', 'equipe')`, [ASSUME, x.id]);
    expect((await api(ADMIN, "/admin/devolver", { cobranca_id: x.id, motivo: "Abuso descartado; devolução aprovada", acesso: "encerrar" })).status).toBe(200);
    const linhas = await q(`select origem, status, feito_por, regra from public.billing_reembolsos where cobranca_id = $1`, [x.id]);
    expect(linhas).toEqual([expect.objectContaining({ origem: "equipe", status: "feito", feito_por: ADMIN, regra: expect.objectContaining({ assumido_pela_equipe: true }) })]);
    expect(await acesso(ASSUME)).toEqual({ status: "canceled", vale: false });
  });
});

describe("nota fiscal", () => {
  let cid = "";
  it("aviso da nota autorizada: relida na API, link no histórico e e-mail 'Sua nota fiscal' uma vez só", async () => {
    cid = await comprarPago(NOTA, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    invoices.set("inv_1", { id: "inv_1", status: "autorizada", chargeId: cid, pdfUrl: "https://nota.teste/inv_1.pdf", numero: "123" });
    const antes = enviados.length;
    expect((await hook({ event: "INVOICE_AUTHORIZED", invoice: { id: "inv_1", status: "AUTHORIZED" } })).status).toBe(200);
    const novos = enviados.slice(antes);
    expect(novos).toHaveLength(1);
    expect(novos[0]).toMatchObject({ to: "aj12@t.dev", subject: "Sua nota fiscal · StaziaMed" });
    expect(novos[0].html).toContain("https://nota.teste/inv_1.pdf");
    expect(novos[0].text).toContain("nº 123");
    expect(novos[0].text).toContain("plano PRO mensal");
    const h = await comoUsuario<any>(NOTA, "app_billing_historico");
    expect(h.pagamentos[0]).toMatchObject({ nota_status: "autorizada", nota_numero: "123", nota_url: "https://nota.teste/inv_1.pdf" });
    // o mesmo aviso de novo (outro id) e a tarefa de hora em hora: nenhum e-mail a mais
    expect((await hook({ event: "INVOICE_AUTHORIZED", invoice: { id: "inv_1" } })).status).toBe(200);
    await emails.enviarNotas(50);
    expect(enviados.length).toBe(antes + 1);
    expect((await cobranca(cid)).nota_email_status).toBe("enviado");
  });

  it("nota de outro sistema da mesma conta (StaziaTech) ou que não existe: ignorada", async () => {
    invoices.set("inv_tech", { id: "inv_tech", status: "autorizada", chargeId: "pay_do_staziatech", pdfUrl: "https://nota.teste/tech.pdf", numero: "9" });
    expect((await hook({ event: "INVOICE_AUTHORIZED", invoice: { id: "inv_tech" } })).status).toBe(200);
    expect((await hook({ event: "INVOICE_AUTHORIZED", invoice: { id: "inv_forjada" } })).status).toBe(200);
    expect((await q1(`select count(*)::int n from public.billing_cobrancas where nota_pdf_url = 'https://nota.teste/tech.pdf'`)).n).toBe(0);
  });

  it("nota cancelada (devolução total): o histórico mostra 'cancelada', sem o link", async () => {
    invoices.set("inv_1", { ...invoices.get("inv_1")!, status: "cancelada" });
    expect((await hook({ event: "INVOICE_CANCELED", invoice: { id: "inv_1" } })).status).toBe(200);
    const h = await comoUsuario<any>(NOTA, "app_billing_historico");
    expect(h.pagamentos[0]).toMatchObject({ nota_status: "cancelada", nota_url: null, nota_numero: null });
    // um aviso velho "autorizada" que chega atrasado não ressuscita a nota cancelada
    invoices.set("inv_1", { ...invoices.get("inv_1")!, status: "autorizada" });
    await hook({ event: "INVOICE_AUTHORIZED", invoice: { id: "inv_1" } });
    expect((await cobranca(cid)).nota_status).toBe("cancelada");
  });

  it("aviso da nota não chegou: a tarefa de hora em hora pergunta ao fornecedor, guarda e manda o e-mail", async () => {
    const c = await comprarPago(GASTAO, { tipo: "extra", codigo: "plus", metodo: "pix" });
    invoices.set("inv_2", { id: "inv_2", status: "autorizada", chargeId: c, pdfUrl: "https://nota.teste/inv_2.pdf", numero: "124" });
    const antes = enviados.length;
    const r = await fetch(`${base}/api/cobranca/cron`, { headers: { Authorization: `Bearer ${CRON}` } }).then((x) => x.json() as any);
    expect(r.notas).toBeGreaterThanOrEqual(1);
    const nota = enviados.slice(antes).find((m) => m.html.includes("inv_2.pdf"));
    expect(nota?.text).toContain("pacote extra IA Plus");
    expect((await cobranca(c))).toMatchObject({ nota_status: "autorizada", nota_email_status: "enviado" });
  });

  it("modelo do e-mail: sem número e sem nome também fica certo", () => {
    const r = renderNota({ id: 1, email: "a@b.c", nome: null, tipo: "plano", codigo: "pro", ciclo: "trimestral", valor_centavos: 26970, pago_em: "2026-10-17T15:00:00Z", numero: null, pdf_url: "https://x.y/n.pdf" }, null);
    expect(r.text).toContain("Olá!");
    expect(r.text).toContain("R$ 269,70 (plano PRO trimestral, pago em 17/10/2026)");
    expect(r.html).toContain("https://app.staziamed.com.br/novo/perfil?secao=assinatura");
  });
});

describe("alertas de gasto de IA para o dono", () => {
  const gasto = (user: string, usd: number) =>
    dev.db.query(`insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, creditos, custo_usd) values ($1, $2, 'tutor_texto', 'sombra', 'confirmado', 1, $3)`, [user, `req-${++seq}-alerta`, usd]);
  // (o resumo do dia anterior pode já ter saído na tarefa de hora em hora do teste da nota: fica de fora aqui)
  const alertas = () => q(`select tipo, chave from public.alertas_dono where tipo not in ('devolucao_conferir', 'resumo_diario') order by id`);

  it("80% e 100% do teto do dia e aluno fora do comum: uma vez só cada, para o endereço configurado", async () => {
    await dev.db.query(`update public.direitos_config set teto_custo_dia_usd = 2`);
    await dev.db.query(`update public.alertas_dono_config set resumo_diario = false`);
    await gasto(GASTAO, 0.9);
    await gasto(ENCERRAR, 0.3);
    expect(await emails.gerarAlertas()).toBe(0); // 1,20 de 2,00 = 60%
    await gasto(GASTAO, 0.5); // 1,70 = 85%; o aluno passou de US$ 1,00
    expect(await emails.gerarAlertas()).toBe(2);
    expect(await alertas()).toEqual([
      { tipo: "teto_80", chave: `teto80:${hojeBr()}` },
      { tipo: "aluno_fora_do_comum", chave: `aluno:${GASTAO}:${hojeBr()}` },
    ]);
    await gasto(ENCERRAR, 0.5); // 2,20 = 110%
    expect(await emails.gerarAlertas()).toBe(1);
    expect(await emails.gerarAlertas()).toBe(0); // nada repete
    expect((await alertas()).map((a: any) => a.tipo)).toEqual(["teto_80", "aluno_fora_do_comum", "teto_100"]);
    // e-mails: para o endereço configurado AGORA; uma vez só
    await comoUsuario(ADMIN, "app_admin_alertas_dono_salvar", { p_dados: { email: "Dono@StaziaMed.com.br", ligado: true, resumo_diario: false, aluno_limite_usd_dia: "1,00" } });
    const antes = enviados.length;
    const r = await emails.enviarAlertas(50);
    expect(r.enviados).toBeGreaterThanOrEqual(3);
    const meus = enviados.slice(antes);
    expect(meus.every((m) => m.to === "dono@staziamed.com.br")).toBe(true);
    expect(meus.map((m) => m.subject)).toEqual(expect.arrayContaining(["[StaziaMed] Gasto de IA em 80% do teto de hoje", "[StaziaMed] Gasto de IA passou do teto de hoje (100%)", "[StaziaMed] Aluno com gasto de IA fora do comum"]));
    expect(meus.find((m) => m.subject.includes("fora do comum"))!.text).toContain("aj13@t.dev já gastou US$ 1,40");
    expect((await emails.enviarAlertas(50)).enviados).toBe(0);
  });

  it("configuração: só o administrador, e-mail e limite conferidos; desligados, nenhum alerta novo", async () => {
    await expect(comoUsuario(EDITOR, "app_admin_alertas_dono", {})).rejects.toThrow(/administradores/);
    await expect(comoUsuario(ADMIN, "app_admin_alertas_dono_salvar", { p_dados: { email: "não é e-mail", aluno_limite_usd_dia: "1" } })).rejects.toThrow(/E-mail dos alertas inválido/);
    await expect(comoUsuario(ADMIN, "app_admin_alertas_dono_salvar", { p_dados: { email: "a@b.com", aluno_limite_usd_dia: "0" } })).rejects.toThrow(/Limite por aluno/);
    const r = await comoUsuario<any>(ADMIN, "app_admin_alertas_dono_salvar", { p_dados: { email: "suporte@staziamed.com.br", ligado: false, resumo_diario: true, aluno_limite_usd_dia: "0,50" } });
    expect(r.config).toMatchObject({ email: "suporte@staziamed.com.br", ligado: false, resumo_diario: true, aluno_limite_usd_dia: 0.5 });
    expect(r.recentes.length).toBeGreaterThanOrEqual(3);
    await gasto(ENCERRAR, 0.6); // passaria do novo limite de 0,50
    expect(await emails.gerarAlertas()).toBe(0);
    const ultimo = (await q1(`select max(id) m from public.alertas_dono`)).m;
    await comoUsuario(ADMIN, "app_admin_alertas_dono_salvar", { p_dados: { email: "suporte@staziamed.com.br", ligado: true, resumo_diario: false, aluno_limite_usd_dia: "0,50" } });
    await emails.gerarAlertas();
    expect(await q(`select tipo, dados ->> 'email' as email from public.alertas_dono where id > $1 order by id`, [ultimo])).toEqual([{ tipo: "aluno_fora_do_comum", email: "aj9@t.dev" }]);
  });

  it("resumo diário do dia anterior (a partir das 8h de Brasília), uma vez só", async () => {
    await dev.db.query(`update public.alertas_dono_config set resumo_diario = true`);
    const ontem = brt(new Date(Date.now() - DIA));
    await dev.db.query(`delete from public.alertas_dono where chave = $1`, [`resumo:${ontem}`]);
    await dev.db.query(`insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, creditos, custo_usd, dia) values ($1, 'req-ontem-resumo', 'tutor_texto', 'sombra', 'confirmado', 1, 0.42, $2)`, [GASTAO, ontem]);
    await emails.gerarAlertas();
    await emails.gerarAlertas();
    const hora = Number(new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 13));
    const resumos = await q(`select texto from public.alertas_dono where chave = $1`, [`resumo:${ontem}`]);
    if (hora >= 8) {
      expect(resumos).toHaveLength(1);
      expect(resumos[0].texto).toContain("US$ 0,42");
      expect(resumos[0].texto).toContain("aj13@t.dev");
    } else {
      expect(resumos).toHaveLength(0);
    }
  });

  it("a tarefa de hora em hora roda os alertas mesmo com a cobrança desligada no servidor", async () => {
    const app = express();
    const off: BillingRoutesDeps = { billing: createBilling({ db, provider: null, baseUrl: null }), provider: null, authenticate: (req) => db.authenticate(req), emails };
    app.use("/api/cobranca", createBillingRouter(() => off));
    const url = await new Promise<string>((resolve) => {
      const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
      servers.push(srv);
    });
    const r = await fetch(`${url}/api/cobranca/cron`, { headers: { Authorization: `Bearer ${CRON}` } }).then((x) => x.json() as any);
    expect(r.enabled).toBe(false);
    expect(r.emails).toMatchObject({ alertas_email: expect.any(Object), notas_email: expect.any(Object) });
    expect((await fetch(`${url}/api/cobranca/cron`)).status).toBe(401);
  });

  it("modelo do e-mail do alerta leva à Administração", () => {
    const r = renderAlerta({ tipo: "teto_80", titulo: "Gasto de IA em 80% do teto de hoje", texto: "x" }, "https://app.teste.dev");
    expect(r.text).toContain("https://app.teste.dev/novo/admin?aba=planos");
    expect(renderAlerta({ tipo: "devolucao_conferir", titulo: "t", texto: "x" }, null).text).toContain("aba=vendas");
  });
});

describe("extras de IA à venda junto com o PRO", () => {
  it("com as vendas abertas, IA Boost, IA Plus e IA Max aparecem e podem ser comprados", async () => {
    const ov = await api(GASTAO, "/overview");
    expect(ov.body.vendas_ligadas).toBe(true);
    expect(ov.body.vitrine.extras.map((x: any) => [x.codigo, x.valor_centavos])).toEqual([["boost", 2490], ["plus", 5990], ["max", 12990]]);
    expect(ov.body.vitrine.planos.filter((p: any) => p.a_venda).map((p: any) => p.codigo)).toEqual(["pro"]);
    const r = await api(GASTAO, "/checkout", { tipo: "extra", codigo: "max", metodo: "pix", aceite: true, idem: `idem-${++seq}-max` });
    expect(r).toMatchObject({ status: 200, body: { nome: "IA Max", valor_centavos: 12990 } });
  });
});

describe("Administração: abrir/fechar vendas e Vendas e pagamentos", () => {
  it("abrir e fechar as vendas: só administrador, fica no Registro; fechadas, ninguém compra", async () => {
    await expect(comoUsuario(EDITOR, "app_admin_billing_vendas_ligar", { p_ligar: false })).rejects.toThrow(/administradores/);
    const fechou = await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_ligar", { p_ligar: false });
    expect(fechou).toMatchObject({ vendas_ligadas: false, atualizado_por: "aj6@t.dev" });
    expect(fechou.extras_a_venda.map((x: any) => x.codigo)).toEqual(["boost", "plus", "max"]);
    expect(fechou.planos_a_venda.map((x: any) => x.codigo)).toEqual(["pro"]);
    expect(typeof fechou.cadeados_ligados).toBe("boolean");
    expect((await api(EXTRA, "/checkout", { tipo: "extra", codigo: "plus", metodo: "pix", aceite: true, idem: `idem-${++seq}-fechada` })).body.code).toBe("vendas_desligadas");
    const reg = await q1(`select actor_id, details from public.admin_audit_log where action = 'cobranca.vendas' order by id desc limit 1`);
    expect(reg).toEqual({ actor_id: ADMIN, details: { vendas_ligadas: false, antes: true } });
    // a mesma escolha de novo não grava outra linha no Registro
    await comoUsuario(ADMIN, "app_admin_billing_vendas_ligar", { p_ligar: false });
    expect((await q1(`select count(*)::int n from public.admin_audit_log where action = 'cobranca.vendas'`)).n).toBe(1);
    expect((await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_ligar", { p_ligar: true })).vendas_ligadas).toBe(true);
  });

  it("lista do período por situação, com aluno, produto, forma, valor, nota, pedidos para a equipe (prazo de 5 dias úteis) e o total", async () => {
    await expect(comoUsuario(EDITOR, "app_admin_billing_vendas_lista", { p_de: null, p_ate: null })).rejects.toThrow(/administradores/);
    const nota = await cobranca((await q1(`select provider_payment_id from public.billing_cobrancas where user_id = $1 and tipo = 'plano'`, [NOTA])).provider_payment_id);
    await dev.db.query(`insert into public.billing_reembolsos (user_id, cobranca_id, valor_centavos, total, regra, status) values ($1, $2, 9990, true, '{}', 'equipe')`, [NOTA, nota.id]);
    const tudo = await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_lista", { p_de: null, p_ate: null });
    expect(tudo.linhas[0]).toMatchObject({ situacao: "em_analise", cobranca_id: nota.id, email: "aj12@t.dev", nome: "Joana Teste", metodo: "pix", valor_centavos: 9990,
      devolucao: expect.objectContaining({ status: "equipe", prazo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }) });
    const sit = (s: string) => tudo.linhas.filter((l: any) => l.situacao === s);
    expect(sit("devolvido").some((l: any) => l.email === "aj0@t.dev")).toBe(true); // a cobrança repetida devolvida no painel
    expect(sit("pendente").some((l: any) => l.origem === "pedido" && l.produto === "IA Max")).toBe(true); // o IA Max ainda não pago
    expect(sit("pago").find((l: any) => l.email === "aj13@t.dev" && l.produto === "IA Plus")).toMatchObject({ nota_url: "https://nota.teste/inv_2.pdf", metodo: "pix" });
    const t = tudo.totais;
    expect(t.liquido_centavos).toBe(t.recebido_centavos - t.devolvido_centavos);
    // o período padrão é dos últimos 30 dias: a cobrança de 40 dias atrás (aluno "período encerrado") fica de fora
    expect(t.recebido_centavos).toBe(Number((await q1(`select sum(valor_centavos)::int s from public.billing_cobrancas where pago_em > now() - interval '31 days'`)).s));
    const desde2020 = await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_lista", { p_de: "2020-01-01", p_ate: null });
    expect(desde2020.totais.recebido_centavos).toBe(Number((await q1(`select sum(valor_centavos)::int s from public.billing_cobrancas where pago_em is not null`)).s));
    expect(t.por_situacao.em_analise).toBe(1);
    // filtro por situação e busca por aluno
    const devolvidos = await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_lista", { p_de: null, p_ate: null, p_situacao: "devolvido" });
    expect(devolvidos.linhas.every((l: any) => l.situacao === "devolvido")).toBe(true);
    expect(devolvidos.totais).toEqual(tudo.totais); // o total é do período inteiro
    const busca = await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_lista", { p_de: null, p_ate: null, p_busca: "AJ13@" });
    expect(new Set(busca.linhas.map((l: any) => l.email))).toEqual(new Set(["aj13@t.dev"]));
    // o pedido que venceu sem pagar vira "vencido"; período sem nada = vazio
    await dev.db.query(`update public.billing_pedidos set expira_em = now() - interval '1 minute' where user_id = $1 and status = 'aberto'`, [GASTAO]);
    const venc = await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_lista", { p_de: null, p_ate: null, p_situacao: "vencido" });
    expect(venc.linhas.some((l: any) => l.produto === "IA Max")).toBe(true);
    const vazio = await comoUsuario<any>(ADMIN, "app_admin_billing_vendas_lista", { p_de: "2020-01-01", p_ate: "2020-01-31" });
    expect(vazio).toMatchObject({ linhas: [], totais: { recebido_centavos: 0, pagamentos: 0 } });
    await expect(comoUsuario(ADMIN, "app_admin_billing_vendas_lista", { p_de: null, p_ate: null, p_situacao: "outra" })).rejects.toThrow(/Situação inválida/);
  });

  it("prazo em dias úteis: sábado e domingo não contam", async () => {
    expect((await q1(`select public.billing_dias_uteis('2026-10-16 10:00-03', 5)::text d`)).d).toBe("2026-10-23"); // sexta → sexta
    expect((await q1(`select public.billing_dias_uteis('2026-10-17 10:00-03', 5)::text d`)).d).toBe("2026-10-23"); // sábado → sexta
    expect((await q1(`select public.billing_dias_uteis('2026-10-19 10:00-03', 5)::text d`)).d).toBe("2026-10-26"); // segunda → segunda
  });
});
