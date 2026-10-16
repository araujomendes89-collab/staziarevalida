/**
 * PONTE DE VOZ — serviço do Cloud Run (stazia-voz-ponte). Só faz a ponte navegador ⇄ Gemini Live no Vertex (ponte.ts).
 *
 *   GET  /saude           → { ok: true }
 *   WS   /ponte           → primeira mensagem {t:"abrir", bilhete}; o bilhete é selado pelo app (bilhete.ts)
 *
 * Ambiente: VOZ_PONTE_SEGREDO (Secret Manager; o mesmo no app da Vercel), VOZ_PONTE_ORIGENS (sites que podem abrir a ponte,
 * separados por vírgula; ex.: https://app.staziamed.com.br), VOZ_PONTE_PROJETO (padrão staziamed-revalida-prod),
 * VOZ_PONTE_REGIAO (padrão us-central1), VOZ_PONTE_RELATORIO_URL (opcional: rota do app que registra o uso), PORT (Cloud Run).
 * A credencial do Google vem da conta de serviço do Cloud Run (servidor de metadados); no Mac, do gcloud do dono.
 * Uso local: VOZ_PONTE_SEGREDO=... VOZ_PONTE_ORIGENS=http://127.0.0.1:31991 npx tsx server/vozPonte/main.ts
 */
import http from "node:http";
import { WebSocketServer } from "ws";
import { tokenGoogle } from "./googleToken";
import { NoncesUsados } from "./bilhete";
import { atenderPonte } from "./ponte";

const env = (k: string, p = "") => (process.env[k] ?? p).trim();
const PORTA = Number(env("PORT", env("VOZ_PONTE_PORTA", "31997")));
const ORIGENS = new Set(env("VOZ_PONTE_ORIGENS").split(",").map((s) => s.trim()).filter(Boolean));
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
const segredo = env("VOZ_PONTE_SEGREDO");
if (segredo.length < 32) { log({ ponte: "sem VOZ_PONTE_SEGREDO (mínimo 32 caracteres): recusando subir" }); process.exit(1); }

const usados = new NoncesUsados();
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const servidor = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/saude" || req.url === "/")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}'); }
  res.writeHead(404); res.end();
});
servidor.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname !== "/ponte" || !ORIGENS.has(String(req.headers.origin ?? ""))) {
    log({ ponte: "recusado", caminho: url.pathname, origem: String(req.headers.origin ?? "").slice(0, 80) });
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) =>
    atenderPonte(ws, {
      segredo, usados, log, tokenGoogle,
      projeto: env("VOZ_PONTE_PROJETO", "staziamed-revalida-prod"),
      regiao: env("VOZ_PONTE_REGIAO", "us-central1"),
      relatorio: env("VOZ_PONTE_RELATORIO_URL") ? { url: env("VOZ_PONTE_RELATORIO_URL") } : null,
    }),
  );
});
servidor.listen(PORTA, "0.0.0.0", () => log({ ponte: "ouvindo", porta: PORTA, origens: [...ORIGENS] }));
