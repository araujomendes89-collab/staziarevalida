// @vitest-environment node
/**
 * Planos etapa 4 (migração 013760 + server/billing + server/avisos) no banco local (PGlite) com um fornecedor SIMULADO (sem rede):
 *   - avisos que nascem da cobrança (primeira compra confirmada, renovação do cartão recusada = acesso pausado, pago depois =
 *     acesso liberado; renovação normal não gera aviso), uma vez só;
 *   - tarefa diária: renovação 7/3/1 (um nível por dia, nunca empilhado), acesso pausado por Pix não pago, sem duplicar;
 *   - e-mail: pega uma vez, marca enviado/falhou, nunca repete o que caiu no meio, expira o velho; sem SMTP = nada sai;
 *   - troca da forma de pagamento (cartão → Pix e Pix → cartão), sem cobrança em dobro;
 *   - aceite do contrato obrigatório na compra; histórico com recibo; amostra do dia;
 *   - segurança: o aluno não grava aviso, não marca aviso de outro, não chama funções do servidor.
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
import { BillingSignatureError, type PaymentProvider, type ProviderCharge } from "../../server/billing/provider";
import { createAvisos, renderAviso } from "../../server/avisos/avisos";
import type { MailMessage } from "../../server/avisos/smtp";

const TOKEN = "token-do-aviso-simulado-com-mais-de-32-caracteres";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "compra-avisos-"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CARTAO, PIX, TROCA_PIX, TROCA_CARTAO, AMOSTRA, OUTRO, EQUIPE, VENCIDO, DUPLO] = [21, 22, 23, 24, 25, 26, 27, 28, 29].map(id);
const TODOS = [CARTAO, PIX, TROCA_PIX, TROCA_CARTAO, AMOSTRA, OUTRO, EQUIPE, VENCIDO, DUPLO];
let dev: DevDatabase;
let db: ContentDb;
let base: string;
const servers: Server[] = [];
const tokens: Record<string, string> = {};
const enviados: MailMessage[] = [];
let mailerFalha = false;

// ---------------------------------------------------------------- fornecedor simulado (mesmo modelo do cobrancaBanco)
const charges = new Map<string, ProviderCharge & { reference: string }>();
const subs = new Map<string, { active: boolean; firstDue: string }>();
const log: string[] = [];
let seq = 0;
let atraso = 0; // fornecedor lento (para dois cliques chegarem juntos)
const fake: PaymentProvider = {
  name: "asaas",
  mode: "test",
  capabilities: { methods: { card: true, pix: true, debit: true }, partialRefund: true },
  async ensureCustomer(i) {
    return `cus_${i.userId.slice(-2)}`;
  },
  async createCharge(i) {
    const cid = `pay_${++seq}`;
    charges.set(cid, { id: cid, status: "pending", method: i.method, amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: null, externalReference: i.reference, dueDate: i.dueDate, paidAt: null, installments: false, reference: i.reference, receiptUrl: `https://recibo.teste/${cid}` });
    log.push(`cobranca:${cid}:${i.method}:${i.dueDate}`);
    return { chargeId: cid, url: `https://pagar.teste/${cid}`, pix: i.method === "pix" ? { payload: "000201", image: "img", expiresAt: null } : null };
  },
  async createCardSubscription(i) {
    if (atraso) await new Promise((r) => setTimeout(r, atraso));
    const sid = `sub_${++seq}`;
    subs.set(sid, { active: true, firstDue: i.firstDueDate });
    const cid = `pay_${++seq}`;
    charges.set(cid, { id: cid, status: "pending", method: "card", amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: sid, externalReference: i.reference, dueDate: i.firstDueDate, paidAt: null, installments: false, reference: i.reference, receiptUrl: `https://recibo.teste/${cid}` });
    log.push(`assinatura:${sid}:${i.firstDueDate}`);
    return { subscriptionId: sid, chargeId: cid, url: `https://pagar.teste/${cid}`, pix: null };
  },
  async payChargeByPix(cid, due) {
    Object.assign(charges.get(cid)!, { method: "pix", dueDate: due, status: "pending" });
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
  async refund() {
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
const pay = (cid: string, when = new Date()) => Object.assign(charges.get(cid)!, { status: "paid", paidAt: when });
let evt = 0;
const hook = (cid: string, event = "PAYMENT_RECEIVED") =>
  fetch(`${base}/api/cobranca/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "asaas-access-token": TOKEN }, body: JSON.stringify({ id: `evt_${++evt}`, event, payment: { id: cid } }) });
const api = (user: string, p: string, body?: unknown) =>
  fetch(`${base}/api/cobranca${p}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${tokens[user]}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const q = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows;
const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const comprar = (user: string, o: Record<string, unknown>) => api(user, "/checkout", { aceite: true, idem: `idem-${++seq}-compra`, documento: "366.385.446-91", nome: "Aluno Teste StaziaMed", ...o });
const comoAluno = <T>(user: string, fn: string, args: Record<string, unknown> = {}) => db.asUser<T>({ id: user, email: null }, fn, args);
const avisosDe = (user: string) => q(`select tipo, chave, titulo, texto, email_status from public.avisos_aluno where user_id = $1 order by id`, [user]);
const hojeBr = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const fimDoDia = (dias: number) => new Date(`${new Date(Date.now() - 3 * 3600e3 + dias * 86400e3).toISOString().slice(0, 10)}T23:59:59-03:00`).toISOString();

const mailer = {
  from: "nao-responda@teste.dev",
  async send(m: MailMessage) {
    if (mailerFalha) throw new Error("Servidor de e-mail recusou a mensagem (código 550).");
    enviados.push(m);
  },
};
let avisos: ReturnType<typeof createAvisos>;
let billing: ReturnType<typeof createBilling>;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, uid] of TODOS.entries()) {
    await dev.db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `av${i}@t.dev`]);
    await dev.db.query(`update public.profiles set name = 'Maria Teste' where id = $1`, [uid]);
    tokens[uid] = await dev.createSession(uid);
    await dev.db.query(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) select $1, document, version, 'tela_aceite', 'x' from public.legal_versions where document = 'termo_uso'`, [uid]);
  }
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EQUIPE]);
  await dev.db.query(`update public.billing_config set vendas_ligadas = true`);
  billing = createBilling({ db, provider: fake, baseUrl: "https://app.teste.dev" });
  avisos = createAvisos({ db, mailer, baseUrl: "https://app.teste.dev" });
  const deps: BillingRoutesDeps = { billing, provider: fake, authenticate: (req) => db.authenticate(req), avisos };
  const app = express();
  app.post("/api/cobranca/webhook", express.raw({ type: "*/*" }), createWebhookHandler(() => deps));
  app.use(express.json());
  app.use("/api/cobranca", createBillingRouter(() => deps));
  base = await new Promise<string>((resolve) => {
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
    servers.push(srv);
  });
}, 300_000);

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("aceite do contrato na contratação", () => {
  it("sem a versão do Contrato de Assinatura no banco, ninguém contrata; o resumo leva o link do contrato", async () => {
    const r = await comprar(CARTAO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    expect(r).toMatchObject({ status: 503, body: { code: "contrato_pendente" } });
    expect(await q1(`select count(*)::int n from public.billing_pedidos where user_id = $1`, [CARTAO])).toEqual({ n: 0 });
    await dev.db.query(`update public.billing_config set contrato_versao = '3.0', contrato_url = '/novo/contrato'`);
    const ov = await api(CARTAO, "/overview");
    expect(ov.body.contrato_doc).toEqual({ versao: "3.0", url: "/novo/contrato" });
  });

  it("a caixa de aceite é obrigatória e o aceite fica carimbado no pedido (versão, hora do banco, navegador, oferta)", async () => {
    expect((await comprar(CARTAO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao", aceite: false })).body.code).toBe("aceite_obrigatorio");
    const r = await comprar(CARTAO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    expect(r.status).toBe(200);
    const p = await q1(`select aceite from public.billing_pedidos where id = $1`, [r.body.id]);
    expect(p.aceite).toMatchObject({ aceito: true, contrato_versao: "3.0", oferta: { valor_centavos: 9990 } });
    expect(p.aceite.registrado_em).toBeTruthy();
    // sem o documento 'contrato_assinatura' em legal_versions (ramo termo-v3), a prova fica só no pedido, sem erro
    expect(await q1(`select count(*)::int n from public.legal_acceptances where user_id = $1 and document <> 'termo_uso'`, [CARTAO])).toEqual({ n: 0 });
    // primeira compra paga: aviso "pagamento confirmado", e o recibo do fornecedor no histórico
    const cid = r.body.url.split("/").pop();
    pay(cid);
    expect((await hook(cid)).status).toBe(200);
    const av = await avisosDe(CARTAO);
    expect(av.map((a: any) => a.tipo)).toEqual(["acesso_liberado"]);
    expect(av[0].titulo).toBe("Pagamento confirmado");
    expect(av[0].texto).toContain("R$ 99,90");
    const h = await comoAluno<any>(CARTAO, "app_billing_historico");
    expect(h.pagamentos[0]).toMatchObject({ status: "paga", valor_centavos: 9990, recibo_url: `https://recibo.teste/${cid}` });
    expect(h.aceite).toMatchObject({ versao: "3.0" });
    expect(h.contrato_url).toBe("/novo/contrato");
  });
});

describe("avisos que nascem da cobrança", () => {
  let sid: string;
  it("renovação normal do cartão (no prazo, sem falha) não gera aviso", async () => {
    sid = (await q1(`select provider_subscription_id s from public.billing_contratos where user_id = $1`, [CARTAO])).s;
    const fim = (await q1(`select periodo_fim from public.billing_contratos where user_id = $1`, [CARTAO])).periodo_fim;
    const due = new Date(new Date(fim).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    charges.set("pay_ren_ok", { id: "pay_ren_ok", status: "paid", method: "card", amountCents: 9990, refundedCents: 0, customerId: "cus_21", subscriptionId: sid, externalReference: null, dueDate: due, paidAt: new Date(`${due}T12:00:00-03:00`), installments: false, reference: "" });
    expect((await hook("pay_ren_ok")).status).toBe(200);
    expect((await avisosDe(CARTAO)).length).toBe(1);
  });

  it("cartão recusado na renovação: UM aviso de acesso pausado (aviso repetido do fornecedor não duplica)", async () => {
    const fimHoje = fimDoDia(0);
    await dev.db.query(`update public.subscriptions set current_period_end = $2 where user_id = $1`, [CARTAO, fimHoje]);
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [CARTAO, fimHoje]);
    charges.set("pay_ren_falha", { id: "pay_ren_falha", status: "pending", method: "card", amountCents: 9990, refundedCents: 0, customerId: "cus_21", subscriptionId: sid, externalReference: null, dueDate: hojeBr(), paidAt: null, installments: false, reference: "" });
    expect((await hook("pay_ren_falha", "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED")).status).toBe(200);
    expect((await hook("pay_ren_falha", "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED")).status).toBe(200);
    const av = await avisosDe(CARTAO);
    expect(av.map((a: any) => a.tipo)).toEqual(["acesso_liberado", "acesso_bloqueado"]);
    expect(av[1].chave).toBe(`bloqueado:${hojeBr()}`);
    expect(av[1].texto).toMatch(/Pix/);
    // a tarefa diária, depois do fim do período, não cria um segundo aviso do mesmo bloqueio
    await dev.db.query(`update public.billing_contratos set periodo_fim = now() - interval '1 minute' where user_id = $1`, [CARTAO]);
    await avisos.gerar();
    expect((await avisosDe(CARTAO)).filter((a: any) => a.tipo === "acesso_bloqueado").length).toBe(1);
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [CARTAO, fimHoje]);
  });

  it("pago por Pix depois da recusa: aviso de acesso liberado", async () => {
    const r = await api(CARTAO, "/renewal/pix", {});
    expect(r.status).toBe(200);
    pay("pay_ren_falha");
    expect((await hook("pay_ren_falha")).status).toBe(200);
    const av = await avisosDe(CARTAO);
    expect(av.map((a: any) => a.tipo)).toEqual(["acesso_liberado", "acesso_bloqueado", "acesso_liberado"]);
    expect(av[2].titulo).toBe("Pagamento confirmado: acesso liberado");
  });
});

describe("tarefa diária: renovação 7, 3 e 1 dia antes, acesso pausado", () => {
  it("Pix: um nível por dia, nunca 7/3/1 juntos, nunca repetido; texto com o valor e a data", async () => {
    const r = await comprar(PIX, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    const cid = r.body.url.split("/").pop();
    pay(cid);
    await hook(cid);
    // 7 dias antes: Pix de renovação gerado e o aviso de 7 dias
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [PIX, fimDoDia(7)]);
    expect((await billing.runScheduled()).renovacoes).toBe(1);
    await avisos.gerar();
    await avisos.gerar();
    let ren = (await avisosDe(PIX)).filter((a: any) => a.tipo === "renovacao");
    expect(ren.map((a: any) => a.chave.split(":").pop())).toEqual(["7"]);
    expect(ren[0].texto).toContain("R$ 99,90");
    expect(ren[0].texto).toMatch(/Pix da renovação/);
    // a tarefa ficou 5 dias parada: com 2 dias para o fim sai só o de 3 (o de 7 já foi; nada empilhado)
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [PIX, fimDoDia(7)]);
    const dia = (await q1(`select public.avisos_dia(periodo_fim)::text d from public.billing_contratos where user_id = $1`, [PIX])).d;
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [PIX, fimDoDia(2)]);
    await avisos.gerar();
    ren = (await avisosDe(PIX)).filter((a: any) => a.tipo === "renovacao");
    expect(ren.length).toBe(2);
    expect(ren[1].chave).toMatch(/:3$/);
    void dia;
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [PIX, fimDoDia(1)]);
    await avisos.gerar();
    await avisos.gerar();
    ren = (await avisosDe(PIX)).filter((a: any) => a.tipo === "renovacao");
    expect(ren.map((a: any) => a.chave.split(":").pop())).toEqual(["7", "3", "1"]);
  });

  it("Pix não pago até o vencimento: um aviso de acesso pausado", async () => {
    await dev.db.query(`update public.billing_contratos set periodo_fim = now() - interval '2 hours' where user_id = $1`, [PIX]);
    expect(await avisos.gerar()).toBeGreaterThanOrEqual(1);
    await avisos.gerar();
    const bl = (await avisosDe(PIX)).filter((a: any) => a.tipo === "acesso_bloqueado");
    expect(bl.length).toBe(1);
    expect(bl[0].texto).toMatch(/Pague em Meu plano/);
  });

  it("cartão: texto de renovação automática; renovação cancelada: texto de fim do acesso", async () => {
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2, renova = true where user_id = $1`, [CARTAO, fimDoDia(3)]);
    await avisos.gerar();
    const c = (await avisosDe(CARTAO)).filter((a: any) => a.tipo === "renovacao");
    expect(c.at(-1).texto).toMatch(/cobrados à vista no seu cartão/);
    expect(c.at(-1).titulo).toMatch(/renova em 3 dias/);
    await dev.db.query(`update public.billing_contratos set renova = false, periodo_fim = $2 where user_id = $1`, [CARTAO, fimDoDia(1)]);
    await avisos.gerar();
    const f = (await avisosDe(CARTAO)).filter((a: any) => a.tipo === "renovacao");
    expect(f.at(-1).titulo).toMatch(/termina amanhã/);
    await dev.db.query(`update public.billing_contratos set renova = true, periodo_fim = now() + interval '20 days' where user_id = $1`, [CARTAO]);
  });
});

describe("e-mail dos avisos", () => {
  it("manda cada aviso uma vez, com o mesmo texto da tela, e marca enviado", async () => {
    const pend = (await q1(`select count(*)::int n from public.avisos_aluno where email_status = 'pendente'`)).n;
    expect(pend).toBeGreaterThan(3);
    // os avisos que nasceram dos avisos do fornecedor já saíram na hora (o webhook manda o e-mail logo depois)
    const jaNaHora = enviados.length;
    expect(jaNaHora).toBeGreaterThan(0);
    const r = await avisos.enviar(100);
    expect(r).toEqual({ enviados: pend, falhas: 0 });
    expect((await avisos.enviar(100)).enviados).toBe(0);
    expect(enviados.length - jaNaHora).toBe(pend);
    const m = enviados.find((e) => e.subject.startsWith("Pagamento confirmado"))!;
    expect(m.to).toMatch(/@t\.dev$/);
    expect(m.text).toContain("Olá, Maria!");
    expect(m.html).toContain("https://app.teste.dev/novo/planos");
    expect(await q1(`select count(*)::int n from public.avisos_aluno where email_status <> 'enviado'`)).toEqual({ n: 0 });
  });

  it("falha do servidor de e-mail: marca falhou e NÃO repete; envio que caiu no meio não é repetido; o velho expira", async () => {
    await dev.db.query(`select public.avisos_criar($1, 'renovacao', 'teste:falha', 'Teste de falha', 'Texto de teste.')`, [OUTRO]);
    mailerFalha = true;
    expect(await avisos.enviar()).toEqual({ enviados: 0, falhas: 1 });
    mailerFalha = false;
    expect(await avisos.enviar()).toEqual({ enviados: 0, falhas: 0 });
    expect(await q1(`select email_status, email_erro from public.avisos_aluno where chave = 'teste:falha'`)).toMatchObject({ email_status: "falhou" });
    // caiu no meio (ficou "enviando" há mais de 30 min): vira falhou, sem reenviar
    await dev.db.query(`select public.avisos_criar($1, 'renovacao', 'teste:meio', 'Teste meio', 'Texto de teste.')`, [OUTRO]);
    await dev.db.query(`update public.avisos_aluno set email_status = 'enviando', email_tentado_em = now() - interval '31 minutes' where chave = 'teste:meio'`);
    expect((await avisos.enviar()).enviados).toBe(0);
    expect(await q1(`select email_status from public.avisos_aluno where chave = 'teste:meio'`)).toEqual({ email_status: "falhou" });
    // velho (sem SMTP na época): expira, não chega atrasado
    await dev.db.query(`select public.avisos_criar($1, 'renovacao', 'teste:velho', 'Teste velho', 'Texto de teste.')`, [OUTRO]);
    await dev.db.query(`update public.avisos_aluno set criado_em = now() - interval '3 days' where chave = 'teste:velho'`);
    expect((await avisos.enviar()).enviados).toBe(0);
    expect(await q1(`select email_status from public.avisos_aluno where chave = 'teste:velho'`)).toEqual({ email_status: "expirado" });
  });

  it("sem SMTP configurado: nada sai e nada é marcado", async () => {
    const semEmail = createAvisos({ db, mailer: null, baseUrl: null });
    await dev.db.query(`select public.avisos_criar($1, 'renovacao', 'teste:sem-smtp', 'Teste', 'Texto de teste.')`, [OUTRO]);
    expect(await semEmail.enviar()).toEqual({ enviados: 0, falhas: 0, desligado: true });
    expect(await q1(`select email_status from public.avisos_aluno where chave = 'teste:sem-smtp'`)).toEqual({ email_status: "pendente" });
  });

  it("o HTML escapa o texto (nada de código vindo do banco) e o botão vai para o app", () => {
    const r = renderAviso({ titulo: "<b>x</b>", texto: "a & b <script>", rota: "planos", nome: null }, null);
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("https://app.staziamed.com.br/novo/planos");
    expect(r.text.startsWith("Olá!")).toBe(true);
  });

  it("equipe não recebe aviso de cobrança", async () => {
    expect(await q1(`select public.avisos_criar($1, 'renovacao', 'teste:equipe', 'Teste', 'Texto.') r`, [EQUIPE])).toEqual({ r: false });
  });
});

describe("avisos na tela (aluno)", () => {
  it("vê só os próprios; 'vi' marca só os próprios; não grava nem chama funções do servidor", async () => {
    const meus = await comoAluno<any>(PIX, "app_meus_avisos");
    expect(meus.novos.length).toBeGreaterThan(2);
    expect(meus.novos.every((a: any) => typeof a.titulo === "string")).toBe(true);
    const outro = await comoAluno<any>(OUTRO, "app_meus_avisos");
    const idsOutro = outro.novos.map((a: any) => a.id);
    // tentar marcar avisos de outra pessoa: nada muda
    expect(await comoAluno<number>(PIX, "app_avisos_vistos", { p_ids: idsOutro })).toBe(0);
    expect(await comoAluno<number>(PIX, "app_avisos_vistos", { p_ids: meus.novos.map((a: any) => a.id) })).toBe(meus.novos.length);
    expect((await comoAluno<any>(PIX, "app_meus_avisos")).novos).toEqual([]);
    expect((await comoAluno<any>(OUTRO, "app_meus_avisos")).novos.length).toBe(idsOutro.length);
    await expect(comoAluno(PIX, "avisos_criar", { p_user: PIX, p_tipo: "renovacao", p_chave: "x:1", p_titulo: "abc", p_texto: "abc" })).rejects.toThrow();
    await expect(comoAluno(PIX, "ch_worker_avisos_email_pegar", { p_limite: 5, p_horas: 48 })).rejects.toThrow();
    await expect(comoAluno(PIX, "ch_worker_billing_para_pix", { p_user: TROCA_PIX })).rejects.toThrow();
    await expect(comoAluno(PIX, "ch_worker_billing_troca_cartao_abrir", { p_user: TROCA_CARTAO, p_idem: "abcdefgh123" })).rejects.toThrow();
    await expect(comoAluno(PIX, "ch_worker_billing_recibo_salvar", { p_provider: "asaas", p_payment: "x", p_url: "https://mal.dev" })).rejects.toThrow();
    // direto na tabela, como o navegador faria pela REST
    const tx = async (sql: string) => dev.db.transaction(async (t) => {
      await t.exec(`set local role authenticated`);
      await t.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: PIX, role: "authenticated" })]);
      return t.query(sql);
    });
    await expect(tx(`insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto) values ('${PIX}', 'renovacao', 'x:2', 'abc', 'abc')`)).rejects.toThrow();
    await expect(tx(`update public.avisos_aluno set visto_em = null`)).rejects.toThrow();
    await expect(tx(`update public.billing_contratos set periodo_fim = now() + interval '1 year'`)).rejects.toThrow();
    const lidos = await tx(`select distinct user_id from public.avisos_aluno`);
    expect(lidos.rows.map((r: any) => r.user_id)).toEqual([PIX]);
  });
});

describe("trocar a forma de pagamento", () => {
  it("cartão → Pix: cancela a assinatura no fornecedor, contrato vira Pix e o Pix sai 7 dias antes", async () => {
    const r = await comprar(TROCA_PIX, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    const cid = r.body.url.split("/").pop();
    pay(cid);
    await hook(cid);
    const sid = (await q1(`select provider_subscription_id s from public.billing_contratos where user_id = $1`, [TROCA_PIX])).s;
    const t = await api(TROCA_PIX, "/payment-method", { metodo: "pix" });
    expect(t.status).toBe(200);
    expect(log).toContain(`cancelou-assinatura:${sid}`);
    expect(await q1(`select metodo, renova, provider_subscription_id from public.billing_contratos where user_id = $1`, [TROCA_PIX])).toEqual({ metodo: "pix", renova: true, provider_subscription_id: null });
    expect(await q1(`select provider_subscription_id from public.subscriptions where user_id = $1`, [TROCA_PIX])).toEqual({ provider_subscription_id: null });
    // repetir não faz nada; sem assinatura que renova: recusa
    expect((await api(TROCA_PIX, "/payment-method", { metodo: "pix" })).status).toBe(200);
    expect((await api(OUTRO, "/payment-method", { metodo: "pix" })).body.code).toBe("sem_renovacao");
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [TROCA_PIX, fimDoDia(6)]);
    expect((await billing.runScheduled()).renovacoes).toBe(1);
  });

  it("Pix → cartão: cancela o Pix aberto (não pago), abre a assinatura com a 1ª cobrança NO vencimento e só troca quando pagar", async () => {
    const r = await comprar(TROCA_CARTAO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    const cid = r.body.url.split("/").pop();
    pay(cid);
    await hook(cid);
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [TROCA_CARTAO, fimDoDia(5)]);
    await dev.db.query(`update public.subscriptions set current_period_end = $2 where user_id = $1`, [TROCA_CARTAO, fimDoDia(5)]);
    expect((await billing.runScheduled()).renovacoes).toBe(1);
    const pixRen = await q1(`select provider_payment_id p from public.billing_pedidos where user_id = $1 and motivo = 'renovacao' and status = 'aberto'`, [TROCA_CARTAO]);
    const t = await api(TROCA_CARTAO, "/payment-method", { metodo: "cartao", idem: "troca-cartao-001" });
    expect(t.status).toBe(200);
    expect(t.body.url).toMatch(/^https:\/\/pagar\.teste\//);
    expect(log).toContain(`cancelou:${pixRen.p}`);
    const due = new Date(new Date(fimDoDia(5)).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    expect(log.at(-1)).toMatch(new RegExp(`^assinatura:sub_\\d+:${due}$`));
    // repetir o clique devolve a mesma página (nada novo no fornecedor)
    const antes = log.length;
    expect((await api(TROCA_CARTAO, "/payment-method", { metodo: "cartao", idem: "troca-cartao-002" })).body.id).toBe(t.body.id);
    expect(log.length).toBe(antes);
    // ainda não pagou: o contrato continua Pix, e a tarefa não gera outro Pix (o pedido da troca está aberto)
    expect(await q1(`select metodo from public.billing_contratos where user_id = $1`, [TROCA_CARTAO])).toEqual({ metodo: "pix" });
    expect((await billing.runScheduled()).renovacoes).toBe(0);
    // pagou na página segura (antes do vencimento): contrato vira cartão e o período conta do vencimento (não perde dias)
    const fimAntes = (await q1(`select periodo_fim from public.billing_contratos where user_id = $1`, [TROCA_CARTAO])).periodo_fim;
    const nova = (t.body.url as string).split("/").pop()!;
    pay(nova);
    await hook(nova);
    const c = await q1(`select metodo, renova, provider_subscription_id, periodo_fim from public.billing_contratos where user_id = $1`, [TROCA_CARTAO]);
    expect(c).toMatchObject({ metodo: "cartao", renova: true });
    expect(c.provider_subscription_id).toMatch(/^sub_/);
    const dias = (new Date(c.periodo_fim).getTime() - new Date(fimAntes).getTime()) / 86400e3;
    expect(dias).toBeGreaterThanOrEqual(28);
    expect((await api(TROCA_CARTAO, "/payment-method", { metodo: "cartao", idem: "troca-cartao-003" })).body.code).toBe("ja_no_cartao");
  });

  it("Pix da renovação já pago na hora da troca: vale o pagamento, a troca é recusada sem cobrança em dobro", async () => {
    await dev.db.query(`update public.billing_contratos set metodo = 'pix', provider_subscription_id = null, periodo_fim = $2 where user_id = $1`, [TROCA_PIX, fimDoDia(6)]);
    const aberto = await q1(`select provider_payment_id p from public.billing_pedidos where user_id = $1 and motivo = 'renovacao' and status = 'aberto'`, [TROCA_PIX]);
    pay(aberto.p);
    const t = await api(TROCA_PIX, "/payment-method", { metodo: "cartao", idem: "troca-pago-0001" });
    expect(t.body.code).toBe("renovacao_paga");
    expect(await q1(`select status from public.billing_pedidos where provider_payment_id = $1`, [aberto.p])).toEqual({ status: "pago" });
    expect(await q1(`select count(*)::int n from public.billing_pedidos where user_id = $1 and metodo = 'cartao' and motivo = 'renovacao'`, [TROCA_PIX])).toEqual({ n: 0 });
  });
});

describe("amostra do dia (telas de cadeado)", () => {
  it("cadeados desligados: { ligado: false } (as telas ficam como hoje)", async () => {
    expect(await comoAluno(AMOSTRA, "app_amostra_hoje")).toEqual({ ligado: false });
  });

  it("cadeados ligados: quanto sobra hoje de questões, simulados e flashcards, com as ofertas", async () => {
    await dev.db.query(`update public.direitos_config set cadeados_ligados = true`);
    try {
      const a = await comoAluno<any>(AMOSTRA, "app_amostra_hoje");
      expect(a.ligado).toBe(true);
      expect(["teste", "vencido", "sem_acesso"]).toContain(a.perfil);
      if (a.recursos.questoes.acesso === "amostra") {
        expect(a.recursos.questoes).toMatchObject({ limite: 20, usados: 0, restam: 20 });
        expect(a.recursos.flashcards).toMatchObject({ limite: 10, restam: 10 });
      }
      expect(a.simulado_max_questoes).toBe(30);
      const pro = await comoAluno<any>(CARTAO, "app_amostra_hoje");
      expect(pro.recursos.questoes.acesso).toBe("liberado");
    } finally {
      await dev.db.query(`update public.direitos_config set cadeados_ligados = false`);
    }
  });
});

describe("revisão de segurança (17/10): nada de cobrança em dobro", () => {
  it("pedido vencido: antes de abrir outro, a cobrança velha é cancelada no fornecedor (não fica pagável)", async () => {
    const a = await comprar(VENCIDO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    const velha = a.body.url.split("/").pop();
    await dev.db.query(`update public.billing_pedidos set expira_em = now() - interval '1 minute' where id = $1`, [a.body.id]);
    const b = await comprar(VENCIDO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    expect(b.status).toBe(200);
    expect(log).toContain(`cancelou:${velha}`);
    expect(charges.get(velha)!.status).toBe("canceled");
    expect(await q1(`select status from public.billing_pedidos where id = $1`, [a.body.id])).toEqual({ status: "expirado" });
  });

  it("pedido vencido que foi pago no último minuto: vale o pagamento e a compra nova é barrada (já assinante)", async () => {
    const aberto = await q1(`select id, provider_payment_id p from public.billing_pedidos where user_id = $1 and status = 'aberto'`, [VENCIDO]);
    await dev.db.query(`update public.billing_pedidos set expira_em = now() - interval '1 minute' where id = $1`, [aberto.id]);
    pay(aberto.p);
    const c = await comprar(VENCIDO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix" });
    expect(c.body.code).toBe("ja_assinante");
    expect(await q1(`select status from public.billing_pedidos where id = $1`, [aberto.id])).toEqual({ status: "pago" });
    expect(await q1(`select count(*)::int n from public.billing_cobrancas where user_id = $1 and status = 'paga'`, [VENCIDO])).toEqual({ n: 1 });
  });

  it("o mesmo clique duas vezes ao mesmo tempo: uma cobrança só no fornecedor", async () => {
    const antes = log.filter((l) => l.startsWith("cobranca:") || l.startsWith("assinatura:")).length;
    const corpo = { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao", aceite: true, idem: "idem-duplo-0001", documento: "366.385.446-91", nome: "Aluno Teste" };
    atraso = 400;
    const [r1, r2] = await Promise.all([api(DUPLO, "/checkout", corpo), api(DUPLO, "/checkout", corpo)]);
    atraso = 0;
    expect([r1.status, r2.status].sort()).toEqual([200, 409].sort());
    expect(log.filter((l) => l.startsWith("cobranca:") || l.startsWith("assinatura:")).length - antes).toBe(1);
    const again = await api(DUPLO, "/checkout", corpo);
    expect(again.status).toBe(200);
    expect(again.body.url).toBe((r1.status === 200 ? r1 : r2).body.url);
  });

  it("Pix da renovação não se cancela avulso; vencido sem pagar, 'Cancelar assinatura' ainda funciona e libera comprar de novo", async () => {
    await dev.db.query(`insert into public.billing_clientes (user_id, provider, customer_id) values ($1, 'asaas', 'cus_26') on conflict do nothing`, [OUTRO]);
    await dev.db.query(`insert into public.billing_contratos (user_id, plano, ciclo, metodo, valor_centavos, renova, provider, contratado_em, periodo_inicio, periodo_fim)
      values ($1, 'pro', 'mensal', 'pix', 9990, true, 'asaas', now() - interval '25 days', now() - interval '25 days', $2)
      on conflict (user_id) do update set metodo = 'pix', renova = true, provider_subscription_id = null, periodo_fim = excluded.periodo_fim`, [OUTRO, fimDoDia(5)]);
    await billing.runScheduled();
    const ren = await q1(`select id, provider_payment_id p from public.billing_pedidos where user_id = $1 and motivo = 'renovacao' and status = 'aberto'`, [OUTRO]);
    expect((await api(OUTRO, `/orders/${ren.id}`)).body.cancelavel).toBe(false);
    expect((await api(OUTRO, `/orders/${ren.id}/cancel`, {})).body.code).toBe("renovacao_nao_cancela");
    // venceu sem pagar: o acesso pausou; o aluno decide parar
    await dev.db.query(`update public.billing_contratos set periodo_fim = now() - interval '2 days' where user_id = $1`, [OUTRO]);
    const c = await api(OUTRO, "/cancel-renewal", {});
    expect(c.status).toBe(200);
    expect(log).toContain(`cancelou:${ren.p}`);
    expect(await q1(`select status from public.billing_pedidos where id = $1`, [ren.id])).toEqual({ status: "cancelado" });
    // pode comprar de novo (no cartão, por exemplo)
    expect((await comprar(OUTRO, { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" })).status).toBe(200);
  });

  it("Pix velho de outro pedido que venceu não vira aviso falso de 'acesso pausado'", async () => {
    const antes = (await avisosDe(DUPLO)).length;
    const cid = "pay_orfao_1";
    charges.set(cid, { id: cid, status: "overdue", method: "pix", amountCents: 9990, refundedCents: 0, customerId: "cus_29", subscriptionId: null, externalReference: null, dueDate: hojeBr(), paidAt: null, installments: false, reference: "" });
    const ped = await q1(`select id from public.billing_pedidos where user_id = $1 order by criado_em limit 1`, [DUPLO]);
    // contrato existe (a compra do cartão pagou) e o Pix órfão (de um pedido de compra) venceu
    const aberto = await q1(`select provider_payment_id p from public.billing_pedidos where user_id = $1 and status = 'aberto'`, [DUPLO]);
    if (aberto?.p) { pay(aberto.p); await hook(aberto.p); }
    await dev.db.query(`select public.ch_worker_billing_falhou('asaas', $1, $2, $3, null, 'plano', 'pro', 'mensal', 'pix', 9990, 'Venceu sem pagamento', null)`, [cid, ped.id, DUPLO]);
    const depois = (await avisosDe(DUPLO)).filter((a: any) => a.tipo === "acesso_bloqueado");
    expect(depois.length).toBe(0);
    expect((await avisosDe(DUPLO)).length).toBeGreaterThanOrEqual(antes);
  });
});
