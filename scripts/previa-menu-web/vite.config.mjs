// Prévia do MENU LATERAL da versão web (frente "menu-web", 16/10/2026) na porta 31978: sem login e sem banco.
// Mostra a casca de verdade (AppShell) com a tela Início de TESTE; todos os números são DADOS DE TESTE (nunca vão ao aluno).
// Uso (da raiz do projeto): npx vite --config scripts/previa-menu-web/vite.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
const onda2 = path.join(raiz, "scripts/previa-novas-telas-onda2");
export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [react()],
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(onda2, "sessaoSimulada.jsx") }] },
  server: { port: Number(process.env.PREVIA_PORTA || 31978), strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: process.env.PREVIA_CACHE || "/Volumes/StaziaMed/.tmp-aulas/menu-web/vite-cache",
});
