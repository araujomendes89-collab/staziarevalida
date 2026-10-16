// Prévia da ONDA 1 do editor profissional (ramo ed-integra, porta 32021): as telas de verdade com banco SIMULADO em memória,
// sem login e sem Supabase. A prévia do PDF usa a rota de verdade (server/contentHub/previaPdf.ts) com o Chromium local do
// Playwright; sem o Chromium, cai na prévia de impressão do navegador (como no servidor).
// Uso (da raiz do worktree): npx vite --config scripts/previa-ed-integra/vite.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");

function previaPdfLocal() {
  let handler = null;
  return {
    name: "previa-pdf-local",
    configureServer(server) {
      server.middlewares.use("/api/content-hub/previa-pdf", async (req, res) => {
        try {
          if (!handler) {
            const { createRenderer } = await server.ssrLoadModule(path.join(raiz, "server/contentHub/render.ts"));
            const { mountPreviaPdf } = await server.ssrLoadModule(path.join(raiz, "server/contentHub/previaPdf.ts"));
            const renderer = await createRenderer().catch(() => null);
            const router = { post: (...args) => { handler = args[args.length - 1]; } };
            mountPreviaPdf(router, { renderer }, null, async () => ({ staff: true }));
          }
          let corpo = "";
          for await (const c of req) corpo += c;
          req.body = corpo ? JSON.parse(corpo) : {};
          const resposta = {
            status(c) { res.statusCode = c; return this; },
            set(k, v) { res.setHeader(k, v); return this; },
            setHeader(k, v) { res.setHeader(k, v); return this; },
            type(t) { res.setHeader("Content-Type", t === "application/pdf" ? t : t); return this; },
            json(o) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return this; },
            send(b) { res.end(b); return this; },
            end(b) { res.end(b); return this; },
          };
          await handler(req, resposta);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [react(), previaPdfLocal()],
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoSimulada.jsx") }] },
  server: { port: 32021, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz, "/Volumes/StaziaMed/.tmp-aulas/editor-word"] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/editor-pro/vite-cache-integra",
});
