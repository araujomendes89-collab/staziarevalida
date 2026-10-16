// Prévia do editor estilo Word (porta 31987): Editar aula, Unidades e Revisão com banco SIMULADO em memória, sem login e sem rede.
// Nunca fala com o Supabase. Uso (da raiz do projeto): npx vite --config scripts/previa-editor-word/vite.config.mjs
// Textos reais de aula (opcional): se existir /Volumes/StaziaMed/.tmp-aulas/editor-word/dados/{lessons,units}.json, a prévia usa a
// primeira aula de lá; senão usa um texto de demonstração.
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
  server: { port: 31987, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz, "/Volumes/StaziaMed/.tmp-aulas/editor-word"] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/editor-word/vite-cache",
});
