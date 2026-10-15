// Prévia navegável do Treinamento em Dupla / Stazia Match (porta 31960): dados SIMULADOS ("dados de teste"), sem login e sem banco.
// Uso (da raiz do projeto): npx vite --config scripts/previa-dupla/vite.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [
    react(),
    {
      // os ícones saem direto do lucide-static (sem copiar para public/)
      name: "icones-lucide",
      configureServer(server) {
        server.middlewares.use("/ds-icons/", (req, res, next) => {
          const arquivo = path.join(raiz, "node_modules/lucide-static/icons", path.basename(req.url.split("?")[0]));
          if (!fs.existsSync(arquivo)) return next();
          res.setHeader("Content-Type", "image/svg+xml");
          res.end(fs.readFileSync(arquivo));
        });
      },
    },
  ],
  // as telas leem a sessão pelo mesmo caminho de sempre; aqui recebem o banco simulado
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoSimulada.jsx") }] },
  server: { port: 31960, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz, "/Volumes/StaziaMed/STAZIAMED REVALIDA/handoff-treino-dupla"] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/parte2-pratica/vite-cache",
});
