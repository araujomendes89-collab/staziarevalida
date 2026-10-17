// Prévia dos personagens do Tutor (Stazi / Stazia, 2D e Three.js), sem login, sem banco, sem chaves.
// Uso: npx vite --config scripts/previa-personagens/vite.config.mjs  →  http://localhost:31994
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ root: here, publicDir: path.resolve(here, "../../public"), plugins: [react()], envDir: here, server: { port: 31994, strictPort: true, host: "127.0.0.1", fs: { allow: [path.resolve(here, "../..")] } } });
