// Prévia da conversa por voz do Tutor (porta 31977): a tela de verdade (NexusScreen) com servidor, banco, ponte de voz e
// microfone SIMULADOS, sem login, sem rede e sem IA. Serve para as capturas e para o teste no Playwright (WebKit/iPhone e Chromium).
// Uso (da raiz do projeto): npx vite --config scripts/previa-voz-natural/vite.config.mjs
// Endereço: /?cenario=aovivo|eleven|ponte-fora|sem-minutos|mic-negado|medidor-mudo &personagem=stazi|stazia &resumo=bom|curta
//           &tema=escuro
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
  // a tela lê a sessão pelo caminho de sempre; aqui recebe o banco simulado
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoFalsa.jsx") }] },
  server: { port: 31977, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/voz-natural/vite-cache",
});
