// @vitest-environment node
/**
 * Nota fiscal que falhou (migração 013860, Pacote 2): no banco local (PGlite) com um fornecedor SIMULADO (sem rede).
 *   1. o pedido da nota na hora do pagamento cai: fica anotado; a tarefa de hora em hora pede de novo (só depois de 50 min) e a nota sai;
 *   2. a nota volta com ERRO: a tarefa guarda o erro e pede outra; a nova nota (agendada) passa a valer;
 *   3. no máximo 4 pedidos por pagamento; pagamento devolvido não ganha nota nova;
 *   4. Administração: "pagamentos sem nota / nota com erro" só para o administrador; com a nota desligada, nada aparece;
 *   5. a migração pode ser colada de novo, desfeita e colada outra vez; a conferência diz OK.
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

const TOKEN = "token-do-aviso-simulado-com-mais-de-32-caracteres";
const CRON = "segredo-da-tarefa-de-teste-nota";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nota-reenvio-"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CAIU, ERRO, TETO, DEVOLVIDO, ADMIN, EDITOR, SEMNOTA, DESLIGADA] = [61, 62, 63, 64, 65, 66, 67, 68].map(id);
const TODOS = [CAIU, ERRO, TETO, DEVOLVIDO, ADMIN, EDITOR, SEMNOTA, DESLIGADA];
const MIGRACAO = path.resolve(__dirname, "../../supabase/migrations/20261003013860_nota_fiscal_reenvio.sql");
const DESFAZER = path.resolve(__dirname, "../../supabase/desfazer/20261003013860_nota_fiscal_reenvio.desfazer.sql");
const CONFERIR_SQL = path.resolve(__dirname, "../../supabase/conferir/nota-fiscal-reenvio.sql");
let dev: DevDatabase;
let db: ContentDb;
const bases: Record<"com" | "sem", string> = { com: "", sem: "" };
const servers: Server[] = [];
const tokens: Record<string, string> = {};

// ---------------------------------------------------------------- fornecedor simulado (com e sem nota fiscal ligada)
const charges = new Map<string, ProviderCharge & { reference: string }>();
const invoices = new Map<string, ProviderInvoice>();
/** Pedidos de nota que devem falhar (um por vez) e o que foi pedido. */
let falharPedidos = 0;
let statusDaNovaNota: ProviderInvoice["status"] = "agendada";
const pedidos: string[] = [];
let seq = 0;
function fornecedor(comNota: boolean): PaymentProvider {
  return {
    name: "asaas",
    mode: "test",
    capabilities: { methods: { card: true, pix: true, debit: true }, partialRefund: true, requiresAddress: false, invoices: comNota },
    async ensureCustomer(i) {
      return `cus_${i.userId.slice(-2)}`;
    },
    async createCharge(i) {
      const cid = `pay_${++seq}`;
      charges.set(cid, { id: cid, status: "pending", method: i.method, amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: null, externalReference: i.reference, dueDate: i.dueDate, paidAt: null, installments: false, reference: i.reference });
      return { chargeId: cid, url: `https://pagar.teste/${cid}`, pix: i.method === "pix" ? { payload: "000201", image: "img", expiresAt: null } : null };
    },
    async createCardSubscription() {
      throw new Error("não usado");
    },
    async payChargeByPix(cid) {
      return { chargeId: cid, url: `https://pagar.teste/${cid}`, pix: null };
    },
    async getCharge(cid) {
      const c = charges.get(cid);
      return c ? { ...c } : null;
    },
    async cancelCharge() {},
    async refund(cid) {
      const c = charges.get(cid)!;
      c.refundedCents = c.amountCents;
      c.status = "refunded";
      return { status: "done" };
    },
    async cancelSubscription() {},
    parseNotice(raw, headers) {
      if (headers["asaas-access-token"] !== TOKEN) throw new BillingSignatureError();
      const b = JSON.parse(raw.toString());
      return { kind: "charge", eventId: b.id, event: b.event, chargeId: b.payment.id, subscriptionId: null };
    },
    async getInvoice(iid) {
      const i = invoices.get(iid);
      return i ? { ...i } : null;
    },
    async listInvoices(cid) {
      return [...invoices.values()].filter((i) => i.chargeId === cid);
    },
    // igual ao adaptador do Asaas: só pede se a nota estiver ligada e não houver nota (a com ERRO não conta)
    ...(comNota
      ? {
          async afterPaid(charge: ProviderCharge, descricao: string) {
            if ([...invoices.values()].some((i) => i.chargeId === charge.id && i.status !== "erro")) return;
            pedidos.push(`${charge.id}:${descricao}`);
            if (falharPedidos > 0) {
              falharPedidos--;
              throw new ProviderError("Asaas 503: fora do ar", 503);
            }
            const iid = `inv_${++seq}`;
            invoices.set(iid, { id: iid, status: statusDaNovaNota, chargeId: charge.id, pdfUrl: null, numero: null });
          },
        }
      : {}),
  };
}

let evt = 0;
const q = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows;
const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const comoUsuario = <T>(user: string, fn: string, args: Record<string, unknown> = {}) => db.asUser<T>({ id: user, email: null }, fn, args);
const api = (b: string, user: string, p: string, body?: unknown) =>
  fetch(`${b}/api/cobranca${p}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${tokens[user]}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const cron = (b = bases.com) => fetch(`${b}/api/cobranca/cron`, { headers: { Authorization: `Bearer ${CRON}` } }).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const nota = (cid: string) => q1(`select id, nota_status, nota_pedidos, nota_erro, nota_id from public.billing_cobrancas where provider_payment_id = $1`, [cid]);
/** O último pedido de nota (ou o pagamento) foi há mais de 50 minutos. */
const passaUmaHora = (cid: string) =>
  dev.db.query(`update public.billing_cobrancas set nota_pedido_em = nota_pedido_em - interval '61 minutes', pago_em = pago_em - interval '61 minutes' where provider_payment_id = $1`, [cid]);

async function comprarPago(b: string, user: string) {
  const r = await api(b, user, "/checkout", { aceite: true, idem: `idem-${++seq}-nota`, documento: "366.385.446-91", nome: "Aluno Teste StaziaMed", tipo: "extra", codigo: "boost", metodo: "pix" });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const cid = (await q1(`select provider_payment_id from public.billing_pedidos where id = $1`, [r.body.id])).provider_payment_id as string;
  Object.assign(charges.get(cid)!, { status: "paid", paidAt: new Date() });
  const h = await fetch(`${b}/api/cobranca/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "asaas-access-token": TOKEN }, body: JSON.stringify({ id: `evt_${++evt}`, event: "PAYMENT_RECEIVED", payment: { id: cid } }) });
  expect(h.status).toBe(200);
  return cid;
}

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, uid] of TODOS.entries()) {
    await dev.db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `nf${i}@t.dev`]);
    await dev.db.query(`update public.profiles set name = 'Nina Teste' where id = $1`, [uid]);
    tokens[uid] = await dev.createSession(uid);
    await dev.db.query(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) select $1, document, version, 'tela_aceite', 'x' from public.legal_versions where document = 'termo_uso'`, [uid]);
  }
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await dev.db.query(`update public.billing_config set vendas_ligadas = true`);
  for (const k of ["com", "sem"] as const) {
    const provider = fornecedor(k === "com");
    const deps: BillingRoutesDeps = { billing: createBilling({ db, provider, baseUrl: "https://app.teste.dev" }), provider, authenticate: (req) => db.authenticate(req) };
    const app = express();
    app.post("/api/cobranca/webhook", express.raw({ type: "*/*" }), createWebhookHandler(() => deps));
    app.use(express.json());
    app.use("/api/cobranca", createBillingRouter(() => deps));
    bases[k] = await new Promise<string>((resolve) => {
      const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
      servers.push(srv);
    });
  }
  process.env.CRON_SECRET = CRON;
}, 300_000);

afterAll(async () => {
  delete process.env.CRON_SECRET;
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("nota fiscal que falhou: a tarefa de hora em hora pede de novo", () => {
  it("o pedido da hora do pagamento caiu: fica anotado; antes de 50 min nada; depois, a tarefa pede de novo e a nota sai", async () => {
    falharPedidos = 1;
    const cid = await comprarPago(bases.com, CAIU);
    expect(await nota(cid)).toMatchObject({ nota_status: null, nota_pedidos: 1, nota_erro: "Asaas 503: fora do ar" });
    // logo depois: ainda não pede de novo
    expect((await cron()).body.notas_pedidas_de_novo).toBe(0);
    expect(pedidos.filter((p) => p.startsWith(`${cid}:`))).toHaveLength(1);
    await passaUmaHora(cid);
    const r = await cron();
    expect(r.status).toBe(200);
    expect(r.body.notas_pedidas_de_novo).toBe(1);
    // o da hora do pagamento (caiu) e o novo, com o mesmo texto da nota
    expect(pedidos.filter((p) => p.startsWith(`${cid}:`))).toEqual(Array(2).fill(`${cid}:Pacote extra de IA (IA Boost) – plataforma de preparação para o Revalida`));
    expect(await nota(cid)).toMatchObject({ nota_pedidos: 2, nota_erro: null });
    // na rodada seguinte a nota agendada é lida e guardada; não pede outra
    await passaUmaHora(cid);
    expect((await cron()).body.notas_pedidas_de_novo).toBe(0);
    expect(await nota(cid)).toMatchObject({ nota_status: "agendada", nota_pedidos: 2 });
  });

  it("a nota voltou com ERRO: o erro fica guardado, a tarefa pede outra e a nova passa a valer", async () => {
    statusDaNovaNota = "erro";
    const cid = await comprarPago(bases.com, ERRO);
    statusDaNovaNota = "agendada";
    await passaUmaHora(cid);
    const r = await cron();
    expect(r.body.notas_pedidas_de_novo).toBe(1);
    const lista = [...invoices.values()].filter((i) => i.chargeId === cid).map((i) => i.status);
    expect(lista).toEqual(["erro", "agendada"]);
    await passaUmaHora(cid);
    await cron();
    const n = await nota(cid);
    expect(n).toMatchObject({ nota_status: "agendada", nota_pedidos: 2 });
    expect(n.nota_id).toBe([...invoices.values()].find((i) => i.chargeId === cid && i.status === "agendada")!.id);
  });

  it("no máximo 4 pedidos por pagamento; depois a Administração vê 'não vai tentar de novo'", async () => {
    falharPedidos = 10;
    const cid = await comprarPago(bases.com, TETO);
    for (let i = 0; i < 5; i++) {
      await passaUmaHora(cid);
      await cron();
    }
    falharPedidos = 0;
    expect(pedidos.filter((p) => p.startsWith(`${cid}:`))).toHaveLength(4);
    expect(await nota(cid)).toMatchObject({ nota_status: null, nota_pedidos: 4, nota_erro: "Asaas 503: fora do ar" });
    const lista = await comoUsuario<any[]>(ADMIN, "app_admin_billing_notas_pendencias");
    expect(lista.find((l) => l.email === "nf2@t.dev")).toMatchObject({ situacao: "sem_nota", nota_pedidos: 4, vai_tentar_de_novo: false, produto: "IA Boost", valor_centavos: 2490, nota_erro: "Asaas 503: fora do ar" });
  });

  it("pagamento devolvido não ganha nota nova", async () => {
    falharPedidos = 1;
    const cid = await comprarPago(bases.com, DEVOLVIDO);
    await dev.db.query(`update public.billing_cobrancas set status = 'devolvida', devolvido_centavos = valor_centavos where provider_payment_id = $1`, [cid]);
    await passaUmaHora(cid);
    await cron();
    expect(pedidos.filter((p) => p.startsWith(`${cid}:`))).toHaveLength(1);
  });
});

describe("Administração: pagamentos sem nota / nota com erro", () => {
  it("só o administrador vê; o editor e o aluno são barrados", async () => {
    await expect(comoUsuario(EDITOR, "app_admin_billing_notas_pendencias")).rejects.toThrow(/administradores/);
    await expect(comoUsuario(CAIU, "app_admin_billing_notas_pendencias")).rejects.toThrow(/administradores/);
    const lista = await comoUsuario<any[]>(ADMIN, "app_admin_billing_notas_pendencias");
    // a do CAIU tem nota agendada (saiu): fora da lista; a do TETO está; a nota com erro que foi trocada por uma agendada: fora
    expect(lista.map((l) => l.email)).toContain("nf2@t.dev");
    expect(lista.map((l) => l.email)).not.toContain("nf0@t.dev");
    expect(lista.map((l) => l.email)).not.toContain("nf1@t.dev");
  });

  it("nota com erro aparece como 'Nota com erro'", async () => {
    statusDaNovaNota = "erro";
    const cid = await comprarPago(bases.com, SEMNOTA);
    statusDaNovaNota = "agendada";
    // a tarefa lê a nota com erro (e já pede outra, que fica agendada): até lá, a Administração vê "erro"
    await dev.db.query(`update public.billing_cobrancas set nota_status = 'erro' where provider_payment_id = $1`, [cid]);
    const lista = await comoUsuario<any[]>(ADMIN, "app_admin_billing_notas_pendencias");
    expect(lista.find((l) => l.email === "nf6@t.dev")).toMatchObject({ situacao: "erro", vai_tentar_de_novo: true });
  });

  it("com a nota fiscal desligada (sem ASAAS_NFSE_*), o app não pede nota e nada aparece na lista", async () => {
    const antes = pedidos.length;
    const cid = await comprarPago(bases.sem, DESLIGADA);
    await passaUmaHora(cid);
    await dev.db.query(`update public.billing_cobrancas set pago_em = now() - interval '3 hours' where provider_payment_id = $1`, [cid]);
    await cron(bases.sem);
    expect(pedidos.length).toBe(antes);
    expect(await nota(cid)).toMatchObject({ nota_pedidos: 0 });
    const lista = await comoUsuario<any[]>(ADMIN, "app_admin_billing_notas_pendencias");
    expect(lista.map((l) => l.email)).not.toContain("nf7@t.dev");
  });
});

describe("migração 013860", () => {
  it("pode ser colada de novo, desfeita e colada outra vez; a conferência diz OK; aluno não executa as funções do servidor", async () => {
    const sql = fs.readFileSync(MIGRACAO, "utf8");
    await dev.db.exec(sql);
    await dev.db.exec(fs.readFileSync(DESFAZER, "utf8"));
    expect((await q1(`select to_regprocedure('public.app_admin_billing_notas_pendencias()') is null as sumiu`)).sumiu).toBe(true);
    expect((await q1(`select count(*)::int n from information_schema.columns where table_name = 'billing_cobrancas' and column_name = 'nota_pedidos'`)).n).toBe(0);
    // a versão da 013850 voltou (sem pedir_de_novo) e a conferência acusa
    expect((await q1(fs.readFileSync(CONFERIR_SQL, "utf8"))).resultado).toMatch(/^FALTA: /);
    await dev.db.exec(fs.readFileSync(DESFAZER, "utf8"));
    await dev.db.exec(sql);
    await dev.db.exec(sql);
    expect((await q1(fs.readFileSync(CONFERIR_SQL, "utf8"))).resultado).toBe("OK: nota fiscal com novo pedido e pendências (013860) no banco");
    const exec = await q(`select r, f from unnest(array['anon','authenticated']) r cross join unnest(array['public.ch_worker_billing_nota_pedido(text,text,boolean,text)', 'public.ch_worker_billing_notas_pendentes(integer)']) f
                         where has_function_privilege(r, f::regprocedure, 'execute')`);
    expect(exec).toEqual([]);
  });
});
