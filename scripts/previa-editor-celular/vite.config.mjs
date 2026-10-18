// Prévia do editor profissional no CELULAR (porta 31996): as telas de verdade da Administração (Questões, Aulas, Comunicados,
// Atualizações) com banco SIMULADO em memória, sem login e sem rede. Nunca fala com o Supabase.
// Uso (da raiz do projeto): npx vite --config scripts/previa-editor-celular/vite.config.mjs
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
  server: { port: Number(process.env.PORTA || 31996), strictPort: true, host: "127.0.0.1", hmr: false, fs: { allow: [raiz] } },
  cacheDir: process.env.VITE_CACHE || "/Volumes/StaziaMed/.tmp-aulas/editor-celular/vite-cache",
});
