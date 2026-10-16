// Prévia do Voice Tutor (porta 31991). Fala com o servidor de teste (server/vozTeste/main.ts, VOZ_MODO=previa, porta 31996).
// O SDK da ElevenLabs fica numa pasta à parte (/Volumes/StaziaMed/.tmp-aulas/voice-tutor/sdk-eleven) para não mexer no
// node_modules compartilhado do projeto.
// Uso (da raiz do worktree): bash scripts/previa-voz/rodar.sh
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
const SDK = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/sdk-eleven/node_modules";

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [{ find: /^@elevenlabs\/react$/, replacement: path.join(SDK, "@elevenlabs/react/dist/index.js") }],
  },
  server: {
    port: 31991, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz, SDK, here] },
    proxy: { "/api/voz": { target: "http://127.0.0.1:31996", ws: true, changeOrigin: false } },
  },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/vite-cache",
});
