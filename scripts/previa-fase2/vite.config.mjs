// Prévia navegável da 2ª fase (porta 31983): as telas reais conversam com um banco de TESTE em memória (servidor-banco.mjs), sem login.
// Uso (da raiz): node scripts/previa-fase2/servidor-banco.mjs  e  npx vite --config scripts/previa-fase2/vite.config.mjs
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
  server: { port: 31983, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/telas-2fase/vite-cache",
});
