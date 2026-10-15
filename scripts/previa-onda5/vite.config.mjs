// Prévia da onda 5 (Desempenho, Análise, Planejamento, Conta, Meu plano, Login) na porta 31974: dados de TESTE, sem login e sem banco.
// Uso (da raiz do projeto): npx vite --config scripts/previa-onda5/vite.config.mjs
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
  server: { port: 31974, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/novas-telas/vite-cache-onda5",
});
