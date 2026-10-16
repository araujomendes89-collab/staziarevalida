// Prévia da tela de Flashcards com cartões ILUSTRADOS (porta 31944): dados simulados, sem login e sem banco.
// Uso (da raiz do projeto): npx vite --config scripts/previa-flashcards/vite.config.mjs
// Parâmetros: ?atraso=700 (ms do servidor de imagem simulado) &tema=escuro
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
  // a tela lê a sessão pelo mesmo caminho de sempre; aqui ela recebe o banco simulado
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoSimulada.jsx") }] },
  server: { port: 31944, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/previa-flashcards/vite-cache",
});
