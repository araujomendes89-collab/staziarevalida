// Prévia navegável do Início, do Plano de Hoje e de Mais/Preferências (Novas telas, onda 2) na porta 31971: sem login e sem banco.
// Todos os números são DADOS DE TESTE (iguais aos do pacote, só para comparar captura com captura). Nunca vão ao aluno.
// Uso (da raiz do projeto): npx vite --config scripts/previa-novas-telas-onda2/vite.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [react()],
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoSimulada.jsx") }] },
  server: { port: 31971, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: process.env.PREVIA_CACHE || "/Volumes/StaziaMed/.tmp-aulas/novas-telas/vite-cache-onda2",
});
