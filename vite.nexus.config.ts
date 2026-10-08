// Conversa atual pela Vercel; audição ElevenLabs exclusivamente no backend local autenticado.
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import express from "express";
import { createVoicePreviewRouter, previewAuth } from "./server/tutor/voicePreview";

export default defineConfig(({ mode }) => {
  // loadEnv sem prefixo somente neste módulo de servidor. Nunca expor como define/import.meta.env.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
  plugins: [react(), {
    name: "nexus-local-connected",
    configureServer(server) {
      const preview = express();
      preview.use("/api/nexus-lab/voices", createVoicePreviewRouter(previewAuth(env), env));
      server.middlewares.use(preview);
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (pathname === "/api/nexus-lab/health") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ mode: "connected" }));
          return;
        }
        if (pathname === "/" || pathname === "/novo" || pathname.startsWith("/novo/")) req.url = "/nexus-lab.html";
        next();
      });
    },
  }],
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/api/tutor/": {
        target: "https://staziamed-revalida.vercel.app",
        changeOrigin: true,
        secure: true,
        configure(proxy) {
          proxy.on("error", (_error, _req, res) => {
            if ("writeHead" in res && !res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Não foi possível conectar à voz do sistema. Confira a conexão e tente novamente." }));
            }
          });
        },
      },
    },
  },
  };
});
