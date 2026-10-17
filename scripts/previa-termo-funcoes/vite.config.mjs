// PRÉVIA LOCAL do ramo termo-funcoes (Contrato 3.0): Criar conta (avisos das senhas e caixa de marketing) e Minha Conta
// (chave de marketing, Ajuda com telefone e horário, Documentos pelo link do e-mail). Sem Supabase: nada sai do navegador.
// Troca só o módulo de dados (src/novo/data/index.ts) por um backend de mentira (dados-falsos.ts); o resto é o código real do app.
// Uso (da raiz do projeto): npx vite --config scripts/previa-termo-funcoes/vite.config.mjs  (porta 31977)
// Endereços: /?tela=cadastro|conta&secao=priv|ajuda|docs&tema=light|dark
// Capturas: node scripts/previa-termo-funcoes/capturar.mjs <pasta> <prefixo> [endereco]
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
const dadosReais = path.resolve(raiz, "src/novo/data/index.ts");
const dadosFalsos = path.resolve(here, "dados-falsos.ts");
const porta = Number(process.env.PREVIA_PORTA || 31977);

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
  server: { port: porta, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz, "/Volumes/StaziaMed"] } },
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  cacheDir: `/Volumes/StaziaMed/.tmp-aulas/termo-funcoes/vite-cache-${porta}`,
});
