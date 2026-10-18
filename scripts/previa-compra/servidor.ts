/**
 * Prévia da etapa 4 (compra, cadeado, avisos) com o BANCO LOCAL (PGlite com todas as migrações do ramo) e o Asaas SANDBOX de
 * verdade (conta de teste, sem dinheiro real). Nada vai ao Supabase nem à Vercel. Os e-mails dos avisos NÃO são enviados: viram
 * arquivos .html em /Volumes/StaziaMed/.tmp-aulas/fase1-compra/emails (para o dono ver como ficam).
 *
 * Uso: npx tsx scripts/previa-compra/servidor.ts   (porta 31995)  → http://127.0.0.1:31995/novo e http://127.0.0.1:31995/previa
 *
 * Chaves: lê SÓ a chave do SANDBOX de ~/.config/staziamed/asaas.env (recusa se parecer de produção). Nunca imprime chaves.
 * O aviso do Asaas (webhook) não chega a um computador local: aqui a confirmação vem pela consulta que a tela faz sozinha
 * (a cada 5 s e ao voltar para a aba), que relê a cobrança na API do Asaas — o mesmo caminho seguro do servidor de verdade.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDevDbRouter } from "../../server/devDb/router";
import { getDevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb } from "../../server/contentHub/infra";
import { createBilling } from "../../server/billing/core";
import { createAsaasProvider } from "../../server/billing/asaasAdapter";
import { createBillingRouter, createWebhookHandler, type BillingRoutesDeps } from "../../server/billing/router";
import { createPlanosRouter } from "../../server/planos/router";
import { createAvisos, renderAviso } from "../../server/avisos/avisos";
import type { Mailer } from "../../server/avisos/smtp";

const PORTA = Number(process.env.PORTA || 31995);
const PASTA = "/Volumes/StaziaMed/.tmp-aulas/fase1-compra";
const DIR = process.env.DEV_DB_DIR || path.join(PASTA, "dev-db");
const EMAILS = path.join(PASTA, "emails");

function chavesSandbox(): NodeJS.ProcessEnv {
  const txt = fs.readFileSync(path.join(os.homedir(), ".config/staziamed/asaas.env"), "utf8");
  const env = Object.fromEntries(txt.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  const key = env.ASAAS_API_KEY ?? "";
  if (!key.startsWith("$aact_hmlg_") || key === env.ASAAS_API_KEY_PRODUCAO) throw new Error("A chave do sandbox não foi encontrada (ou parece de produção). Parei.");
  return { ASAAS_API_KEY: key, ASAAS_WEBHOOK_TOKEN: env.ASAAS_WEBHOOK_TOKEN_SANDBOX ?? "token-da-previa-local-com-mais-de-32-caracteres" } as NodeJS.ProcessEnv;
}

async function main() {
  fs.mkdirSync(EMAILS, { recursive: true });
  const dev = await getDevDatabase(DIR);
  const db = devContentDb(() => getDevDatabase(DIR));
  const sandbox = chavesSandbox();
  const provider = createAsaasProvider(sandbox);
  if (!provider || provider.mode !== "test") throw new Error("Prévia só com o Asaas sandbox.");
  // e-mail da prévia: grava o e-mail em arquivo (nada é enviado)
  const mailer: Mailer = {
    from: "nao-responda@staziamed.com.br",
    async send(m) {
      const nome = `${new Date().toISOString().replace(/[:.]/g, "-")}-${m.to.replace(/[^a-z0-9]/gi, "_")}.html`;
      fs.writeFileSync(path.join(EMAILS, nome), `<!-- Para: ${m.to} | Assunto: ${m.subject} -->\n${m.html}`);
    },
  };
  const avisos = createAvisos({ db, mailer, baseUrl: `http://127.0.0.1:${PORTA}`, log: (m) => console.log(m) });
  const billing = createBilling({ db, provider, baseUrl: `http://127.0.0.1:${PORTA}`, log: (m) => console.log(m) });
  const deps: BillingRoutesDeps = { billing, provider, authenticate: (req) => db.authenticate(req), log: (m) => console.log(m), avisos };

  // a prévia já vem com as vendas e os cadeados ligados (só neste banco local), o contrato 3.0 e o link dos Termos
  await dev.db.query(`update public.billing_config set vendas_ligadas = true, contrato_versao = coalesce(contrato_versao, '3.0')`);
  await dev.db.query(`update public.direitos_config set cadeados_ligados = true`);

  const app = express();
  app.post("/api/cobranca/webhook", express.raw({ type: "*/*", limit: "1mb" }), createWebhookHandler(() => deps));
  app.use(express.json());
  app.use("/api/dev-db", createDevDbRouter(() => getDevDatabase(DIR)));
  app.use("/api/cobranca", createBillingRouter(() => deps));
  app.use("/api/planos", createPlanosRouter({ db, log: (m) => console.log(m) }));

  // ---------------------------------------------------------------- página de apoio da prévia (só aqui, nunca no app)
  const sandboxCall = async (method: string, p: string) => {
    const r = await fetch(`https://api-sandbox.asaas.com/v3${p}`, { method, headers: { access_token: sandbox.ASAAS_API_KEY!, "Content-Type": "application/json" } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  app.get("/previa", async (_req, res) => {
    const abertos = (await dev.db.query<any>(`select p.id, p.nome, p.metodo, p.valor_centavos, p.provider_payment_id, u.email from public.billing_pedidos p join auth.users u on u.id = p.user_id where p.status = 'aberto' order by p.criado_em desc limit 20`)).rows;
    const contratos = (await dev.db.query<any>(`select c.plano, c.ciclo, c.metodo, c.renova, c.periodo_fim, u.email from public.billing_contratos c join auth.users u on u.id = c.user_id order by c.atualizado_em desc limit 20`)).rows;
    const emails = fs.readdirSync(EMAILS).filter((f) => f.endsWith(".html")).sort().reverse().slice(0, 30);
    const linha = (p: any) => `<li><b>${p.email}</b> · ${p.nome} · ${p.metodo} · R$ ${(p.valor_centavos / 100).toFixed(2).replace(".", ",")}
      ${p.metodo === "pix" && p.provider_payment_id ? `<form method="post" action="/previa/pix-pago/${p.id}" style="display:inline"><button>Simular o Pix pago (sandbox)</button></form>` : "<i>cartão: pague na página do Asaas com o cartão de teste</i>"}</li>`;
    res.type("html").send(`<!doctype html><meta charset="utf-8"><title>Prévia da compra</title>
      <style>body{font:15px/1.5 system-ui;max-width:860px;margin:24px auto;padding:0 16px}li{margin:6px 0}button{font:inherit;padding:4px 10px}</style>
      <h1>Prévia da compra (banco local + Asaas sandbox)</h1>
      <p><a href="/novo">Abrir o app</a> · Contas de teste (senha <code>Senha-forte-123</code>): aluno-teste@previa.dev (teste grátis, amostra), aluno-assina@previa.dev (para assinar), aluno-pro@previa.dev (já assinante).</p>
      <h2>Pagamentos em aberto</h2><ul>${abertos.map(linha).join("") || "<li>nenhum</li>"}</ul>
      <h2>Assinaturas</h2><ul>${contratos.map((c: any) => `<li>${c.email}: ${c.plano} ${c.ciclo} · ${c.metodo} · ${c.renova ? "renova" : "sem renovação"} · até ${new Date(c.periodo_fim).toLocaleString("pt-BR")}</li>`).join("") || "<li>nenhuma</li>"}</ul>
      <p>Na prévia, a amostra de questões é de <b>2 por dia</b> (no app de verdade são 20) para o cadeado aparecer logo.</p>
      <form method="post" action="/previa/tarefa"><button>Rodar a tarefa diária agora (Pix 7 dias antes, avisos 7/3/1, e-mails)</button></form>
      <h2>E-mails gerados (não enviados)</h2><ul>${emails.map((e) => `<li><a href="/previa/email/${encodeURIComponent(e)}">${e}</a></li>`).join("") || "<li>nenhum</li>"}</ul>`);
  });
  app.post("/previa/pix-pago/:id", async (req, res) => {
    const p = (await dev.db.query<any>(`select provider_payment_id from public.billing_pedidos where id = $1 and metodo = 'pix'`, [req.params.id])).rows[0];
    if (p?.provider_payment_id) await sandboxCall("POST", `/sandbox/payment/${encodeURIComponent(p.provider_payment_id)}/confirm`);
    res.redirect("/previa");
  });
  app.post("/previa/tarefa", async (_req, res) => {
    const out = { cobranca: await billing.runScheduled(), avisos: await avisos.gerar(), email: await avisos.enviar(50) };
    console.log("[previa] tarefa diária:", JSON.stringify(out));
    res.redirect("/previa");
  });
  // só na prévia: a amostra de questões em 2 por dia (para ver o cadeado logo) e mudar o vencimento de uma assinatura
  app.post("/previa/amostra-curta", async (_req, res) => {
    await dev.db.query(`update public.direitos_recursos set amostra_limite = 2 where codigo = 'questoes'`);
    res.json({ ok: true });
  });
  app.post("/previa/vencimento", async (req, res) => {
    const { email, dias } = req.body ?? {};
    const u = (await dev.db.query<any>(`select id from auth.users where email = $1`, [String(email)])).rows[0];
    if (!u) return res.status(404).json({ error: "conta não encontrada" });
    const fim = `${new Date(Date.now() - 3 * 3600e3 + Number(dias) * 86400e3).toISOString().slice(0, 10)}T23:59:59-03:00`;
    await dev.db.query(`update public.billing_contratos set periodo_fim = $2 where user_id = $1`, [u.id, fim]);
    await dev.db.query(`update public.subscriptions set current_period_end = $2 where user_id = $1`, [u.id, fim]);
    res.json({ ok: true, fim });
  });
  // só na prévia: os avisos de uma conta voltam a "não vistos" (para as capturas repetirem o pop-up)
  app.post("/previa/avisos-de-novo", async (req, res) => {
    await dev.db.query(`update public.avisos_aluno set visto_em = null where user_id = (select id from auth.users where email = $1)`, [String(req.body?.email ?? "")]);
    res.json({ ok: true });
  });
  app.get("/previa/email/:arq", (req, res) => {
    const arq = path.basename(req.params.arq);
    if (!arq.endsWith(".html")) return res.status(404).end();
    res.type("html").send(fs.readFileSync(path.join(EMAILS, arq), "utf8"));
  });
  app.get("/previa/email-exemplo", (_req, res) => {
    res.type("html").send(renderAviso({ titulo: "Seu PRO renova em 3 dias", texto: "Em 20/10/2026, R$ 99,90 serão cobrados à vista no seu cartão de crédito. Você não precisa fazer nada. Para trocar para Pix ou cancelar (sem multa), vá em Minha conta > Assinatura.", rota: "planos", nome: "Ana Souza" }, `http://127.0.0.1:${PORTA}`).html);
  });

  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    cacheDir: path.join(PASTA, "vite-cache"),
  });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    const html = req.method === "GET" && (req.path === "/novo" || req.path.startsWith("/novo/"));
    if (!html) return next();
    try {
      const template = await fs.promises.readFile(path.join(process.cwd(), "novo.html"), "utf-8");
      res.status(200).set({ "Content-Type": "text/html" }).end(await vite.transformIndexHtml(req.originalUrl, template));
    } catch (e) {
      next(e);
    }
  });
  app.listen(PORTA, "127.0.0.1", () => console.log(`[previa-compra] http://127.0.0.1:${PORTA}/novo  ·  apoio: http://127.0.0.1:${PORTA}/previa  (banco: ${DIR})`));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
