// Prévia da onda 4 (casca de Temas Essenciais, Diretrizes e Atualizações, Mapas Mentais, Flashcards) na porta 31973.
// Sem login e sem banco: a sessão é simulada (mock-session.jsx) e os dados são de TESTE. Uso (da raiz): npx vite --config scripts/previa-onda4/vite.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
// as telas reais importam session.jsx; aqui entra a versão simulada (a casca real Shell.jsx continua a verdadeira)
const mocks = () => ({
  name: "mocks-previa-onda4",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer || importer.includes("/scripts/previa-onda4/")) return null;
    if (/\/session\.jsx$/.test(source)) return path.join(here, "mock-session.jsx");
    return null;
  },
});
export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [mocks(), react()],
  server: { port: 31973, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/novas-telas/vite-cache-onda4",
});
