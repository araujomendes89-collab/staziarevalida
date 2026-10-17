/**
 * Prévia da Central de Notificações (migração 013830) com o BANCO LOCAL (PGlite com todas as migrações do ramo). Nada vai ao
 * Supabase nem à Vercel; não há cobrança de verdade (os avisos de cobrança são gravados direto no banco local, como a tarefa faria).
 *
 * Uso: npx tsx scripts/previa-notificacoes/servidor.ts   (porta 31997) → http://127.0.0.1:31997/novo e http://127.0.0.1:31997/previa
 *
 * Contas (senha Senha-forte-123), criadas na primeira subida:
 *   aluno-notificacoes@previa.dev  Ana Souza  · PRO ativo; contrato novo para aceitar (prazo da cláusula 6.5-A); 5 notificações
 *   aluno-muitas@previa.dev        Carla Mendes · 12 não lidas (o sino mostra 9+)
 *   aluno-vazio@previa.dev         Bruno Lima · nenhuma notificação (estado vazio)
 *   admin-previa@previa.dev        Administração > Comunicados
 */
import fs from "fs";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDevDbRouter } from "../../server/devDb/router";
import { getDevDatabase, type DevDatabase } from "../../server/devDb/devDatabase";
import { signUpMetadata } from "../../src/novo/data/backend";

const PORTA = Number(process.env.PORTA || 31997);
const PASTA = "/Volumes/StaziaMed/.tmp-aulas/notificacoes";
const DIR = process.env.DEV_DB_DIR || path.join(PASTA, "dev-db");
const SENHA = "Senha-forte-123";

async function conta(dev: DevDatabase, email: string, nome: string, admin = false) {
  const tem = (await dev.db.query<{ id: string }>(`select id from auth.users where email = $1`, [email])).rows[0];
  if (tem) return { id: tem.id, novo: false };
  const meta = signUpMetadata({ termsVersion: "3.0", userAgent: "previa", declaresAdult: true, declaresPhysician: true });
  const u = await dev.core.createAccount(nome, email, SENHA, admin, meta);
  // sem onboarding e sem nivelamento na abertura (a prévia é do sino)
  await dev.core.rpc(u, "app_onboarding_salvar", { p_passo: "pular", p_dados: {} }).catch(() => undefined);
  await dev.db.query(`update public.profiles set theme = 'light' where id = $1`, [u.id]).catch(() => undefined);
  return { id: u.id, novo: true };
}

const aviso = async (dev: DevDatabase, user: string, o: { tipo: string; chave: string; titulo: string; texto: string; rota?: string; link?: string | null; horas: number; lida?: boolean; email?: string }) =>
  dev.db.query(
    `insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto, rota, link, criado_em, visto_em, email_status)
     values ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(mins => $8), case when $9 then now() - make_interval(mins => $8 - 30) end, $10)
     on conflict (user_id, chave) do nothing`,
    [user, o.tipo, o.chave, o.titulo, o.texto, o.rota ?? "planos", o.link ?? null, Math.round(o.horas * 60), Boolean(o.lida), o.email ?? "enviado"]
  );

async function semear(dev: DevDatabase) {
  const admin = await conta(dev, "admin-previa@previa.dev", "Equipe StaziaMed", true);
  const ana = await conta(dev, "aluno-notificacoes@previa.dev", "Ana Souza");
  const carla = await conta(dev, "aluno-muitas@previa.dev", "Carla Mendes");
  await conta(dev, "aluno-vazio@previa.dev", "Bruno Lima");
  if (!ana.novo) return;

  // Ana: PRO ativo e aceite só da versão 2.0 do Contrato → fica no prazo da cláusula 6.5-A (aviso no topo + notificação no sino).
  // Só nesta prévia local: a prova do aceite 3.0 do cadastro é trocada pela de 2.0 (no banco de verdade o aceite nunca é apagado).
  await dev.db.exec(`alter table public.legal_acceptances disable trigger user`);
  await dev.db.query(`delete from public.legal_acceptances where user_id = $1 and document = 'termo_uso'`, [ana.id]);
  await dev.db.query(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) values ($1, 'termo_uso', '2.0', 'tela_aceite', 'previa')`, [ana.id]);
  await dev.db.exec(`alter table public.legal_acceptances enable trigger user`);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '9 days' where user_id = $1`, [ana.id]);
  await dev.db.query(`update public.subscriptions set plan = 'elite', status = 'active', current_period_end = now() + interval '40 days' where user_id = $1`, [carla.id]);

  await aviso(dev, ana.id, { tipo: "comunicado", chave: "previa:boas-vindas", titulo: "Boas-vindas à StaziaMed", texto: "Que bom ter você aqui. Comece pelo Plano de Hoje: ele monta o estudo do dia com base no seu diagnóstico.", rota: "nenhuma", horas: 24 * 12, lida: true, email: "so_tela" });
  await aviso(dev, ana.id, { tipo: "acesso_liberado", chave: "previa:liberado", titulo: "Pagamento confirmado", texto: "Recebemos R$ 99,90 (Pix). Seu PRO está ativo até 26/10/2026. Bons estudos!", horas: 24 * 3 + 2, lida: true });
  await aviso(dev, ana.id, { tipo: "renovacao", chave: "previa:renovacao", titulo: "Seu PRO vence em 7 dias", texto: "O Pix da renovação (R$ 99,90) já está em Meu plano. Pague até 26/10/2026 para o acesso não pausar. Se preferir, troque para cartão de crédito em Minha conta > Assinatura.", horas: 5, lida: false });
  // comunicado pela função de verdade (só a Ana é do PRO entre as contas da prévia)
  await dev.core.rpc({ id: admin.id, email: "admin-previa@previa.dev" }, "app_admin_comunicado_enviar", {
    p_titulo: "Simulado nacional neste sábado",
    p_texto: "Sábado, às 9h, abre o simulado com 100 questões no formato do Revalida. Reserve 5 horas e um lugar tranquilo.",
    p_link: "/simulados",
    p_publico: "plano",
    p_filtro: "pro",
    p_idem: "previa-simulado-sabado",
  });
  await dev.db.query(`update public.avisos_aluno set criado_em = now() - interval '2 hours' where user_id = $1 and tipo = 'comunicado' and comunicado_id is not null`, [ana.id]);

  // Carla: 12 não lidas (o sino mostra 9+)
  for (let i = 0; i < 12; i++) {
    await aviso(dev, carla.id, {
      tipo: "comunicado",
      chave: `previa:carla:${i}`,
      titulo: ["Aula nova de Pediatria", "Atualização: diretriz de sepse", "Mapa mental novo: AVC", "Plantão de dúvidas hoje"][i % 4],
      texto: "Já está no app. Abra quando puder.",
      rota: "link",
      link: ["/aulas", "/atualizacoes", "/mapas", "/tutor"][i % 4],
      horas: 1 + i * 7,
      email: "so_tela",
    });
  }
}

async function main() {
  fs.mkdirSync(PASTA, { recursive: true });
  const dev = await getDevDatabase(DIR);
  await semear(dev);

  const app = express();
  app.use(express.json());
  app.use("/api/dev-db", createDevDbRouter(() => getDevDatabase(DIR)));
  // só na prévia: as notificações do último dia de uma conta voltam a "não lidas" (para repetir as capturas)
  app.post("/previa/nao-lidas", async (req, res) => {
    await dev.db.query(`update public.avisos_aluno set visto_em = null where user_id = (select id from auth.users where email = $1) and tipo <> 'contrato_novo' and criado_em > now() - interval '1 day'`, [String(req.body?.email ?? "")]);
    res.json({ ok: true });
  });
  app.get("/previa", (_req, res) => {
    res.type("html").send(`<!doctype html><meta charset="utf-8"><title>Prévia das notificações</title>
      <style>body{font:15px/1.5 system-ui;max-width:760px;margin:24px auto;padding:0 16px}li{margin:6px 0}</style>
      <h1>Prévia da Central de Notificações (banco local)</h1>
      <p><a href="/novo">Abrir o app</a> · senha de todas: <code>${SENHA}</code></p>
      <ul>
        <li><b>aluno-notificacoes@previa.dev</b> (Ana): 3 não lidas, contrato novo para aceitar, PRO ativo</li>
        <li><b>aluno-muitas@previa.dev</b> (Carla): 12 não lidas (o sino mostra 9+)</li>
        <li><b>aluno-vazio@previa.dev</b> (Bruno): nenhuma notificação</li>
        <li><b>admin-previa@previa.dev</b>: Administração &gt; Comunicados (o sino não aparece para a equipe)</li>
      </ul>`);
  });

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
  app.listen(PORTA, "127.0.0.1", () => console.log(`[previa-notificacoes] http://127.0.0.1:${PORTA}/novo  ·  apoio: http://127.0.0.1:${PORTA}/previa  (banco: ${DIR})`));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
