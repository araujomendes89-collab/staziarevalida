// Prévia navegável da casca nova (menu, abas, cabeçalho) na porta 31970: sem login e sem banco; dados de TESTE marcados.
// Uso (da raiz do projeto): npx vite --config scripts/previa-novas-telas/vite.config.mjs
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
  server: { port: 31970, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/novas-telas/vite-cache",
});
