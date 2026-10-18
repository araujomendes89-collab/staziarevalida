/**
 * Prévia de Comunicados: editar, apagar e editor profissional (migração 013940) com o BANCO LOCAL (PGlite com todas as migrações do
 * ramo). Nada vai ao Supabase nem à Vercel.
 *
 * Uso: npx tsx scripts/previa-comunicados-editor/servidor.ts   (porta 31994) → http://127.0.0.1:31994/novo
 *
 * Contas (senha Senha-forte-123), criadas na primeira subida:
 *   admin-comunicados@previa.dev   Administração > Comunicados
 *   aluna-comunicados@previa.dev   Ana Souza · PRO · recebeu os comunicados (um formatado e editado)
 *   aluno-comunicados@previa.dev   Bruno Lima · teste grátis
 */
import fs from "fs";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDevDbRouter } from "../../server/devDb/router";
import { getDevDatabase, type DevDatabase } from "../../server/devDb/devDatabase";
import { signUpMetadata } from "../../src/novo/data/backend";
import { campoDoDoc } from "../../src/shared/docRico/campos";

const PORTA = Number(process.env.PORTA || 31994);
const PASTA = "/Volumes/StaziaMed/.tmp-aulas/comunicados-editor";
const DIR = process.env.DEV_DB_DIR || path.join(PASTA, "dev-db");
const SENHA = "Senha-forte-123";

async function conta(dev: DevDatabase, email: string, nome: string, admin = false) {
  const tem = (await dev.db.query<{ id: string }>(`select id from auth.users where email = $1`, [email])).rows[0];
  if (tem) return { id: tem.id, novo: false };
  const meta = signUpMetadata({ termsVersion: "3.0", userAgent: "previa", declaresAdult: true, declaresPhysician: true });
  const u = await dev.core.createAccount(nome, email, SENHA, admin, meta);
  await dev.core.rpc(u, "app_onboarding_salvar", { p_passo: "pular", p_dados: {} }).catch(() => undefined);
  await dev.db.query(`update public.profiles set theme = 'light' where id = $1`, [u.id]).catch(() => undefined);
  return { id: u.id, novo: true };
}

const ANTES = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Sábado, às 9h, abre o simulado com 100 questões. Reserve 5 horas." }] }],
};
const DEPOIS = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Novo horário: 10h" }] },
    { type: "paragraph", content: [{ type: "text", text: "O simulado de sábado abre " }, { type: "text", text: "às 10h", marks: [{ type: "bold" }] }, { type: "text", text: " (e não mais às 9h)." }] },
    { type: "bulletList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "100 questões no formato do Revalida" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Reserve " }, { type: "text", text: "5 horas", marks: [{ type: "italic" }] }] }] },
    ] },
    { type: "paragraph", content: [{ type: "text", text: "Edital do Inep", marks: [{ type: "link", attrs: { href: "https://www.gov.br/inep" } }] }] },
  ],
};

async function semear(dev: DevDatabase) {
  const admin = await conta(dev, "admin-comunicados@previa.dev", "Equipe StaziaMed", true);
  const ana = await conta(dev, "aluna-comunicados@previa.dev", "Ana Souza");
  const bruno = await conta(dev, "aluno-comunicados@previa.dev", "Bruno Lima");
  if (!admin.novo) return;
  await dev.db.query(`delete from public.aluno_fases where user_id = any($1::uuid[])`, [[ana.id, bruno.id]]);
  await dev.db.query(`insert into public.aluno_fases (user_id, fase, situacao, plano, inicio, fim, origem) values ($1, 'teoria', 'paga', 'pro', now() - interval '3 days', now() + interval '27 days', 'equipe')`, [ana.id]);
  await dev.db.query(`insert into public.aluno_fases (user_id, fase, situacao, plano, inicio, fim, origem) values ($1, 'teoria', 'teste', null, now() - interval '1 day', now() + interval '6 days', 'equipe')`, [bruno.id]);
  const eu = { id: admin.id, email: "admin-comunicados@previa.dev" };
  const enviar = (o: Record<string, unknown>) =>
    dev.core.rpc(eu, "app_admin_comunicado_enviar", { p_link: null, p_publico: "todos", p_filtro: null, p_rico: null, ...o }) as Promise<any>;

  // 1) antigo, só texto (enviado ontem); a Ana já leu → o público fica fixo
  const antigo = await enviar({ p_titulo: "Boas-vindas à StaziaMed", p_texto: "Comece pelo Plano de Hoje: ele monta o estudo do dia com base no seu diagnóstico.", p_idem: "previa-ce-boas-vindas" });
  // 2) apagado (fica no filtro Apagados)
  const errado = await enviar({ p_titulo: "Aula ao vivo hoje (data errada)", p_texto: "Hoje, às 20h, plantão de dúvidas.", p_idem: "previa-ce-errado" });
  // 3) formatado e depois EDITADO (o aluno vê o selo "editado")
  const a = campoDoDoc(ANTES);
  const d = campoDoDoc(DEPOIS);
  const simulado = await enviar({ p_titulo: "Simulado nacional neste sábado", p_texto: a.texto, p_rico: a.rico, p_link: "/simulados", p_idem: "previa-ce-simulado" });
  await dev.db.query(`update public.avisos_aluno set criado_em = now() - interval '26 hours' where comunicado_id = $1`, [antigo.id]);
  await dev.db.query(`update public.comunicados_equipe set enviado_em = now() - interval '26 hours' where id = $1`, [antigo.id]);
  await dev.db.query(`update public.avisos_aluno set criado_em = now() - interval '3 hours' where comunicado_id = $1`, [simulado.id]);
  await dev.db.query(`update public.comunicados_equipe set enviado_em = now() - interval '3 hours' where id = $1`, [simulado.id]);
  await dev.core.rpc({ id: ana.id, email: null } as any, "app_notificacoes_lidas", { p_ids: null });
  await dev.core.rpc(eu, "app_admin_comunicado_editar", { p_id: simulado.id, p_titulo: "Simulado nacional neste sábado (novo horário)", p_texto: d.texto, p_rico: d.rico, p_link: "/simulados", p_versao: 1 });
  await dev.db.query(`update public.avisos_aluno set visto_em = null where comunicado_id = $1`, [simulado.id]);
  await dev.core.rpc(eu, "app_admin_comunicado_apagar", { p_id: errado.id, p_motivo: "Data errada; mandei de novo corrigido" });
}

async function main() {
  fs.mkdirSync(PASTA, { recursive: true });
  const dev = await getDevDatabase(DIR);
  await semear(dev);
  const app = express();
  app.use(express.json());
  app.use("/api/dev-db", createDevDbRouter(() => getDevDatabase(DIR)));
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", cacheDir: path.join(PASTA, "vite-cache") });
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
  app.listen(PORTA, "127.0.0.1", () => console.log(`[previa-comunicados] http://127.0.0.1:${PORTA}/novo  (banco: ${DIR})`));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
