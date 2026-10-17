// Bancada da sincronia da boca (só medida, sem servidor): toca uma voz gravada pelo MESMO tocador do app (AudioPlayer, com o afinador)
// e o personagem mede o som como ao vivo. Uso: npx vite --config scripts/sincronia-boca/vite.config.mjs (porta 31993) e
// node scripts/sincronia-boca/medir.mjs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here, plugins: [react()],
  server: { port: 31993, strictPort: true, host: "127.0.0.1", hmr: false, fs: { allow: [path.resolve(here, "../.."), "/Volumes/StaziaMed/.tmp-aulas"] } },
  cacheDir: "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/sincronia/vite-cache",
});
