import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WT = path.resolve(AQUI, "../../../..");
export default defineConfig({
  root: AQUI,
  publicDir: path.join(AQUI, "public"),
  plugins: [
    react(),
    { name: "sessao-de-mentira", enforce: "pre", resolveId(src, importer) { if (/\/session\.jsx$/.test(src) && importer && !importer.includes("session-stub")) return path.join(AQUI, "session-stub.jsx"); return null; } },
  ],
  server: { port: 5391, strictPort: true, fs: { allow: [WT, path.dirname(WT)] }, host: "127.0.0.1" },
  cacheDir: process.env.TMPDIR ? path.join(process.env.TMPDIR, "vite-capturas") : undefined,
});
