// Prévia sem login do painel "Reações de voz por professor" (dados de teste, nada vai ao banco).
// Uso (da raiz do worktree): npx vite --config scripts/preview/vt-reacoes/vite.config.mjs   → http://127.0.0.1:31992/
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.resolve(import.meta.dirname);
const root = path.resolve(here, "../../..");
// o painel real importa session.jsx; aqui entra a sessão simulada
const mocks = () => ({
  name: "mocks-previa-reacoes",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer || importer.includes("/scripts/preview/")) return null;
    if (/\/session\.jsx$/.test(source)) return path.join(here, "mock-session.jsx");
    return null;
  },
});
export default defineConfig({
  root: here,
  publicDir: path.join(root, "public"),
  plugins: [mocks(), react()],
  server: { host: "127.0.0.1", port: 31992, strictPort: true, fs: { strict: false } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/vt-reacoes/vite-cache",
  resolve: { alias: { "@": root } },
});
