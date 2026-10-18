/**
 * Prévia local do Pacote 2 prévio: app novo real em /novo + banco PGlite local com TODAS as migrações do ramo pacote2-previo.
 * Nada vai ao Supabase, à Vercel, ao Asaas nem às IAs: só o banco local (pasta previa/dev-db) e o Vite com cache fora do $TMPDIR.
 * Uso (de dentro do worktree pacote2-previo): npx tsx scripts/previa-pacote2/servidor.mts  (porta 31962)
 */
import fs from "fs";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDevDbRouter } from "../../server/devDb/router";
import { getDevDatabase } from "../../server/devDb/devDatabase";
const WT = process.cwd();
const PORTA = Number(process.env.PORTA || 31962);
const DIR = "/Volumes/StaziaMed/.tmp-aulas/pacote2-previo/previa/dev-db";
if (!fs.existsSync(path.join(WT, "novo.html"))) throw new Error("rode de dentro do worktree pacote2-previo");
for (const k of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"]) process.env[k] = "";
const app = express();
app.use("/api/dev-db", createDevDbRouter(() => getDevDatabase(DIR)));
const vite = await createViteServer({
  root: WT,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/pacote2-previo/previa/vite-cache",
});
app.use(vite.middlewares);
app.use(async (req, res, next) => {
  if (!(req.method === "GET" && (req.path === "/novo" || req.path.startsWith("/novo/")))) return next();
  try {
    const template = await fs.promises.readFile(path.join(WT, "novo.html"), "utf-8");
    res.status(200).set({ "Content-Type": "text/html" }).end(await vite.transformIndexHtml(req.originalUrl, template));
  } catch (e) {
    next(e);
  }
});
await getDevDatabase(DIR);
app.listen(PORTA, "127.0.0.1", () => console.log(`[previa-pacote2] http://127.0.0.1:${PORTA}/novo (banco: ${DIR})`));
