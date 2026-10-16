// Prévia navegável do Treinamento em Dupla / Stazia Match (porta 31997): dados SIMULADOS ("dados de teste"), sem login e sem banco.
// A estação 1 de teste mostra as imagens do protótipo de 11/10 (folha do candidato e esfregaço) lidas do disco do dono SÓ por
// este servidor de prévia (/previa-imagens/); nenhuma imagem é copiada para o repositório.
// Uso (da raiz do projeto): npx vite --config scripts/previa-dupla/vite.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
const IMAGENS_PROTOTIPO = "/Users/joaopaulomendes/Documents/StaziaMed-Previas/handoff-treino-dupla/assets/inep2020";

export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [
    react(),
    {
      // imagens da estação 1 do protótipo (só leitura, só na prévia; nomes conferidos)
      name: "imagens-prototipo",
      configureServer(server) {
        server.middlewares.use("/previa-imagens/", (req, res, next) => {
          const nome = path.basename(decodeURIComponent(req.url.split("?")[0]));
          if (!/^estacao-01-[a-z0-9-]+\.png$/.test(nome)) return next();
          const arquivo = path.join(IMAGENS_PROTOTIPO, nome);
          if (!fs.existsSync(arquivo)) return next();
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "no-store");
          res.end(fs.readFileSync(arquivo));
        });
      },
    },
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
  server: { port: 31997, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/fase2/vite-cache-sala-vivo",
});
