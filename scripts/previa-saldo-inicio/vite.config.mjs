import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");

// Prévia do chip de saldo no Início (planos etapa 1). Sessão simulada: nada é gravado e não fala com o banco.
export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [react()],
  resolve: { alias: [{ find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoSimulada.jsx") }] },
  server: { port: 31987, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/onboarding-planos/saldo-inicio/vite-cache",
});
