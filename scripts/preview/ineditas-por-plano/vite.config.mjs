// Prévia navegável (dados simulados, sem banco): npx vite --config scripts/preview/ineditas-por-plano/vite.config.mjs --port 31939
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.resolve(import.meta.dirname);
const root = path.resolve(here, "../../..");
// as telas reais importam session.jsx e Shell.jsx; aqui entram versões simuladas
const mocks = () => ({
  name: "mocks-previa",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer || importer.includes("/scripts/preview/")) return null;
    if (/\/session\.jsx$/.test(source)) return path.join(here, "mock-session.jsx");
    if (/\/Shell\.jsx$/.test(source)) return path.join(here, "mock-shell.jsx");
    return null;
  },
});
export default defineConfig({
  root: here,
  publicDir: path.join(root, "public"),
  plugins: [mocks(), react()],
  server: { host: "127.0.0.1", fs: { strict: false } },
  resolve: { alias: { "@": root } },
});
