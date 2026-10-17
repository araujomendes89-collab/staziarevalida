// PRÉVIA LOCAL da tela Recuperar senha / Criar nova senha: sem login e sem Supabase (chaves de produção em branco).
// Troca só o módulo de dados (src/novo/data/index.ts) por um backend de mentira (dados-falsos.ts); o resto é o código real do app.
// Uso (da raiz do projeto): npx vite --config scripts/previa-recuperar-senha/vite.config.mjs  (porta 31956)
// Capturas: node scripts/previa-recuperar-senha/capturar.mjs <pasta> <prefixo>
// Endereços: /?tela=forgot|login|nova|vencido&tema=light|dark
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
const dadosReais = path.resolve(raiz, "src/novo/data/index.ts");
const dadosFalsos = path.resolve(here, "dados-falsos.ts");

export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [
    react(),
    {
      name: "previa-dados-falsos",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (!importer || importer.startsWith(here)) return null;
        const r = await this.resolve(source, importer, { ...options, skipSelf: true });
        return r && r.id === dadosReais ? dadosFalsos : null;
      },
    },
  ],
  server: { port: 31956, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz, "/Volumes/StaziaMed"] } },
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/tela-recuperar-senha/vite-cache",
});
