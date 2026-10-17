// Prévia do Mini Tutor (porta 31988): dados simulados, sem login, sem banco e sem IA.
// Uso (da raiz do projeto): npx vite --config scripts/previa-mini-tutor/vite.config.mjs
// Telas: /?tela=questao (treino, &estado=respondendo|errado) · /?tela=questao&modo=simulado · /?tela=resultado · /?tela=aula
//        &saldo=pouco|acabou muda o saldo de exemplo; &tema=escuro.
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
  // as telas leem a sessão pelo mesmo caminho de sempre; aqui recebem o banco simulado (o da prévia de questões + o Tutor)
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoMini.jsx") }] },
  server: { port: 31988, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/mini-tutor/vite-cache",
});
