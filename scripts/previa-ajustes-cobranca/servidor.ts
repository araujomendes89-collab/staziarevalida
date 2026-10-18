/**
 * Prévia dos ajustes da cobrança (migração 013850) com o BANCO LOCAL (PGlite com todas as migrações do ramo) e um fornecedor de
 * pagamento SIMULADO em memória (nada vai ao Asaas, ao Supabase nem à Vercel; nenhum e-mail é enviado: viram arquivos .html).
 *
 * Uso: npx tsx scripts/previa-ajustes-cobranca/servidor.ts   (porta 31993) → http://127.0.0.1:31993/novo
 *
 * Contas (senha Senha-forte-123), criadas e preenchidas na primeira subida:
 *   admin-previa@previa.dev   Administração > Usuários > ficha da Ana (Pagamentos, Devolver pagamento) e > Planos (Devoluções, Alertas)
 *   ana-pagamentos@previa.dev Ana Souza: PRO no cartão com nota fiscal, uma cobrança repetida devolvida no painel e um extra
 *   bruno-conferir@previa.dev Bruno Lima: devolução feita no painel que pede conferência (renovação seguinte já paga)
 *   carla-equipe@previa.dev   Carla Mendes: pedido de devolução que ficou para a equipe
 */
import fs from "fs";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDevDbRouter } from "../../server/devDb/router";
import { getDevDatabase, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb } from "../../server/contentHub/infra";
import { createBilling } from "../../server/billing/core";
import { createBillingRouter, createWebhookHandler, type BillingRoutesDeps } from "../../server/billing/router";
import type { PaymentProvider, ProviderCharge, ProviderInvoice } from "../../server/billing/provider";
import { createEmailsCobranca } from "../../server/avisos/emailsCobranca";
import type { Mailer } from "../../server/avisos/smtp";
import { signUpMetadata } from "../../src/novo/data/backend";

const PORTA = Number(process.env.PORTA || 31993);
const PASTA = "/Volumes/StaziaMed/.tmp-aulas/ajustes-cobranca";
const DIR = process.env.DEV_DB_DIR || path.join(PASTA, "dev-db");
const EMAILS = path.join(PASTA, "emails");
const SENHA = "Senha-forte-123";
const DIA = 86400e3;

// ---------------------------------------------------------------- fornecedor simulado
const charges = new Map<string, ProviderCharge>();
const invoices = new Map<string, ProviderInvoice>();
let seq = 0;
const brt = (d: Date) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const fake: PaymentProvider = {
  name: "asaas",
  mode: "test",
  capabilities: { methods: { card: true, pix: true, debit: true }, partialRefund: true, requiresAddress: false, invoices: true },
  async ensureCustomer(i) {
    return `cus_previa_${i.userId.slice(0, 8)}`;
  },
  async createCharge(i) {
    const id = `pay_previa_${++seq}`;
    charges.set(id, { id, status: "pending", method: i.method, amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: null, externalReference: i.reference, dueDate: i.dueDate, paidAt: null, installments: false, receiptUrl: `https://sandbox.asaas.com/i/${id}` });
    return { chargeId: id, url: `https://sandbox.asaas.com/i/${id}`, pix: i.method === "pix" ? { payload: "000201PREVIA", image: "", expiresAt: null } : null };
  },
  async createCardSubscription(i) {
    const sid = `sub_previa_${++seq}`;
    const id = `pay_previa_${++seq}`;
    charges.set(id, { id, status: "pending", method: "card", amountCents: i.amountCents, refundedCents: 0, customerId: i.customerId, subscriptionId: sid, externalReference: i.reference, dueDate: i.firstDueDate, paidAt: null, installments: false, receiptUrl: `https://sandbox.asaas.com/i/${id}` });
    return { subscriptionId: sid, chargeId: id, url: `https://sandbox.asaas.com/i/${id}`, pix: null };
  },
  async payChargeByPix(id) {
    return { chargeId: id, url: `https://sandbox.asaas.com/i/${id}`, pix: null };
  },
  async getCharge(id) {
    const c = charges.get(id);
    return c ? { ...c } : null;
  },
  async cancelCharge() {},
  async refund(id, amount) {
    const c = charges.get(id)!;
    c.refundedCents += amount ?? c.amountCents - c.refundedCents;
    c.status = c.refundedCents >= c.amountCents ? "refunded" : "partially_refunded";
    return { status: c.method === "pix" ? "pending" : "done" };
  },
  async cancelSubscription() {},
  parseNotice() {
    throw new Error("sem avisos na prévia");
  },
  async getInvoice(id) {
    return invoices.get(id) ?? null;
  },
  async listInvoices(cid) {
    return [...invoices.values()].filter((i) => i.chargeId === cid);
  },
};

async function conta(dev: DevDatabase, email: string, nome: string, admin = false) {
  const tem = (await dev.db.query<{ id: string }>(`select id from auth.users where email = $1`, [email])).rows[0];
  if (tem) return { id: tem.id, novo: false };
  const meta = signUpMetadata({ termsVersion: "3.0", userAgent: "previa", declaresAdult: true, declaresPhysician: true });
  const u = await dev.core.createAccount(nome, email, SENHA, admin, meta);
  await dev.core.rpc(u, "app_onboarding_salvar", { p_passo: "pular", p_dados: {} }).catch(() => undefined);
  return { id: u.id, novo: true };
}

async function main() {
  fs.mkdirSync(EMAILS, { recursive: true });
  const dev = await getDevDatabase(DIR);
  const db = devContentDb(() => getDevDatabase(DIR));
  const mailer: Mailer = {
    from: "nao-responda@staziamed.com.br",
    async send(m) {
      const nome = `${new Date().toISOString().replace(/[:.]/g, "-")}-${m.to.replace(/[^a-z0-9]/gi, "_")}.html`;
      fs.writeFileSync(path.join(EMAILS, nome), `<!-- Para: ${m.to} | Assunto: ${m.subject} -->\n${m.html}`);
    },
  };
  const billing = createBilling({ db, provider: fake, baseUrl: `http://127.0.0.1:${PORTA}`, log: (m) => console.log(m) });
  const emails = createEmailsCobranca({ db, mailer, baseUrl: `http://127.0.0.1:${PORTA}`, log: (m) => console.log(m) });
  const deps: BillingRoutesDeps = { billing, provider: fake, authenticate: (req) => db.authenticate(req), log: (m) => console.log(m), emails };
  await dev.db.query(`update public.billing_config set vendas_ligadas = true`);

  await conta(dev, "admin-previa@previa.dev", "Equipe StaziaMed", true);
  const ana = await conta(dev, "ana-pagamentos@previa.dev", "Ana Souza");
  const bruno = await conta(dev, "bruno-conferir@previa.dev", "Bruno Lima");
  const carla = await conta(dev, "carla-equipe@previa.dev", "Carla Mendes");
  if (ana.novo) {
    const comprar = async (u: { id: string }, email: string, o: Record<string, unknown>, ajuste: Partial<ProviderCharge> = {}) => {
      const r = await billing.checkout({ id: u.id, email } as any, { aceite: true, idem: `previa-${++seq}-compra`, documento: "366.385.446-91", nome: "Aluno Previa", ...o });
      const p = (await dev.db.query<any>(`select provider_payment_id from public.billing_pedidos where id = $1`, [r.id])).rows[0];
      const c = charges.get(p.provider_payment_id)!;
      Object.assign(c, { status: "paid", paidAt: new Date(), ...ajuste });
      await billing.processCharge(c.id, c.subscriptionId);
      return c;
    };
    const painel = async (c: ProviderCharge) => {
      c.refundedCents = c.amountCents;
      c.status = "refunded";
      await billing.processCharge(c.id, c.subscriptionId);
    };
    // Ana: PRO mensal no cartão (com nota fiscal emitida), um Pix repetido do mesmo período devolvido no painel, e o IA Boost
    const pro = await comprar(ana, "ana-pagamentos@previa.dev", { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    invoices.set("inv_previa_1", { id: "inv_previa_1", status: "autorizada", chargeId: pro.id, pdfUrl: "https://sandbox.asaas.com/000/file/public/download/nota-previa.pdf", numero: "590649" });
    await billing.processInvoice("inv_previa_1");
    const repetida = `pay_previa_${++seq}`;
    charges.set(repetida, { ...pro, id: repetida, method: "pix", subscriptionId: null, paidAt: new Date(), receiptUrl: `https://sandbox.asaas.com/i/${repetida}` });
    await billing.processCharge(repetida, null);
    await painel(charges.get(repetida)!);
    await comprar(ana, "ana-pagamentos@previa.dev", { tipo: "extra", codigo: "boost", metodo: "pix" });
    // Bruno: o 1º mês e a renovação seguinte já paga; a 1ª devolvida no painel = "conferir" (acesso mantido, alerta ao dono)
    const b1 = await comprar(bruno, "bruno-conferir@previa.dev", { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao" });
    const fim = new Date((await dev.db.query<any>(`select periodo_fim from public.billing_cobrancas where provider_payment_id = $1`, [b1.id])).rows[0].periodo_fim);
    const b2 = `pay_previa_${++seq}`;
    charges.set(b2, { ...b1, id: b2, externalReference: null, dueDate: brt(fim), paidAt: new Date() });
    await billing.processCharge(b2, b1.subscriptionId);
    await painel(b1);
    // Carla: PRO trimestral por Pix com um pedido de devolução que ficou para a equipe
    const c1 = await comprar(carla, "carla-equipe@previa.dev", { tipo: "plano", codigo: "pro", ciclo: "trimestral", metodo: "pix" }, { paidAt: new Date(Date.now() - 20 * DIA) });
    const x = (await dev.db.query<any>(`select id from public.billing_cobrancas where provider_payment_id = $1`, [c1.id])).rows[0];
    await dev.db.query(`insert into public.billing_reembolsos (user_id, cobranca_id, valor_centavos, total, regra, status, erro) values ($1, $2, 16182, false, '{"regra":"trimestral_meses_nao_iniciados"}', 'equipe', 'Asaas 400: devolução parcial no cartão só no dia seguinte')`, [carla.id, x.id]);
    // alertas ao dono (gasto de IA) e a tarefa de hora em hora (gera e "manda" = grava os e-mails em arquivo)
    await dev.db.query(`update public.direitos_config set teto_custo_dia_usd = 2`);
    for (const [u, usd] of [[ana.id, 1.25], [bruno.id, 0.4]] as const) {
      await dev.db.query(`insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, creditos, custo_usd) values ($1, $2, 'tutor_texto', 'sombra', 'confirmado', 1, $3)`, [u, `previa-${++seq}-ia`, usd]);
    }
    console.log("[previa] tarefa:", JSON.stringify(await emails.rodar()));
  }

  const app = express();
  app.post("/api/cobranca/webhook", express.raw({ type: "*/*", limit: "1mb" }), createWebhookHandler(() => deps));
  app.use(express.json());
  app.use("/api/dev-db", createDevDbRouter(() => getDevDatabase(DIR)));
  app.use("/api/cobranca", createBillingRouter(() => deps));
  app.get("/previa/email/:arq", (req, res) => {
    const arq = path.basename(req.params.arq);
    if (!arq.endsWith(".html")) return res.status(404).end();
    res.type("html").send(fs.readFileSync(path.join(EMAILS, arq), "utf8"));
  });
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", cacheDir: path.join(PASTA, "vite-cache") });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    if (!(req.method === "GET" && (req.path === "/novo" || req.path.startsWith("/novo/")))) return next();
    try {
      const template = await fs.promises.readFile(path.join(process.cwd(), "novo.html"), "utf-8");
      res.status(200).set({ "Content-Type": "text/html" }).end(await vite.transformIndexHtml(req.originalUrl, template));
    } catch (e) {
      next(e);
    }
  });
  app.listen(PORTA, "127.0.0.1", () => console.log(`[previa-ajustes-cobranca] http://127.0.0.1:${PORTA}/novo  (banco: ${DIR})`));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
