/**
 * Prévia do onboarding com o BANCO DE VERDADE (PGlite local com todas as migrações do ramo, inclusive 013640 e 013720) e o app
 * novo real em /novo. Nada vai ao Supabase nem à Vercel: o banco fica em /Volumes/StaziaMed/.tmp-aulas/onboarding/dev-db.
 * Uso: npx tsx scripts/previa-onboarding/servidor.ts   (porta 31990)
 */
import fs from "fs";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDevDbRouter } from "../../server/devDb/router";
import { getDevDatabase } from "../../server/devDb/devDatabase";

const PORTA = Number(process.env.PORTA || 31990);
const DIR = process.env.DEV_DB_DIR || "/Volumes/StaziaMed/.tmp-aulas/onboarding/dev-db";

async function main() {
  const app = express();
  app.use("/api/dev-db", createDevDbRouter(() => getDevDatabase(DIR)));
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    cacheDir: "/Volumes/StaziaMed/.tmp-aulas/onboarding/vite-cache",
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
  await getDevDatabase(DIR);
  app.listen(PORTA, "127.0.0.1", () => console.log(`[previa-onboarding] http://127.0.0.1:${PORTA}/novo (banco: ${DIR})`));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
