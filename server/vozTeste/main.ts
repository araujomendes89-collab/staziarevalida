/**
 * Voice Tutor — Fase 2 (protótipo). Servidor de TESTE isolado (não toca no Tutor atual, no banco nem em aluno).
 *
 * VOZ_MODO=llm (padrão; é o que vai para o Cloud Run): só GET /saude e POST /v1/chat/completions (Custom LLM da ElevenLabs,
 *   com segredo compartilhado). Nada de microfone, Live ou token aqui: o serviço público não deixa ninguém gastar.
 * VOZ_MODO=previa (só no Mac, preso em 127.0.0.1): + POST /api/voz/sessao (token temporário), WS /api/voz/live (ponte para o
 *   Gemini Live) e GET /api/voz/eleven/* (token de conversa da ElevenLabs quando a chave existir).
 *
 * Segredos: VOZ_LLM_SEGREDO e VOZ_SESSAO_SEGREDO (env ou ~/.config/staziamed-voz-teste/segredos.env), VERTEX_API_KEY (env ou
 * ~/.config/vertex-staziamed/vertex.env). Nenhum é impresso.
 *
 * Uso local: npx tsx server/vozTeste/main.ts   (com VOZ_MODO=previa para a página scripts/previa-voz)
 */
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { tratarChatCompletions } from "./customLlm";
import { configEleven, lerArquivoEnv, tokenConversaEleven } from "./eleven";
import { tokenGoogle } from "./googleToken";
import { atenderNavegador, servidorWsLive } from "./liveProxy";
import { vozValida } from "./liveConfig";
import { nivelValido } from "./durona";
import { emitirToken, UsoUnico, verificarToken } from "./tokens";
import { gerarCom, type ConfigCerebros } from "./cerebros";

const arquivos = {
  ...lerArquivoEnv(path.join(os.homedir(), ".config/vertex-staziamed/vertex.env")),
  ...lerArquivoEnv(path.join(os.homedir(), ".config/staziamed-voz-teste/segredos.env")),
};
const env = (k: string, padrao = ""): string => process.env[k] ?? arquivos[k] ?? padrao;

const MODO = env("VOZ_MODO", "llm") === "previa" ? "previa" : "llm";
const PORTA = Number(process.env.PORT || env("VOZ_PORTA", "31996"));
const HOST = MODO === "previa" ? "127.0.0.1" : "0.0.0.0";
const ORIGENS = new Set(["http://127.0.0.1:31991", "http://localhost:31991"]);
const usados = new UsoUnico();
const cerebros: ConfigCerebros = {
  apiKey: env("VERTEX_API_KEY"),
  apiBase: env("VERTEX_API_BASE"),
  modeloGemini: env("VOZ_LLM_MODELO", "gemini-3.8-flash"),
  modeloClaude: env("VOZ_LLM_MODELO_CLAUDE", "claude-haiku-4-5"),
  projeto: env("ANTHROPIC_VERTEX_PROJECT_ID", env("GCLOUD_PROJECT_VERTEX", "staziamed-revalida-prod")),
  regiaoClaude: env("VOZ_CLAUDE_REGIAO", "global"),
  tokenGoogle,
};

const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

const json = (res: http.ServerResponse, status: number, o: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(o));
};

async function corpoJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let s = "";
  for await (const p of req) { s += p; if (s.length > 4096) break; }
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

const origemOk = (req: http.IncomingMessage) => !req.headers.origin || ORIGENS.has(String(req.headers.origin));

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/saude") return json(res, 200, { ok: true, modo: MODO });

    if (req.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")) {
      return await tratarChatCompletions(req, res, {
        segredo: env("VOZ_LLM_SEGREDO"),
        modelo: env("VOZ_LLM_MODELO", "gemini-3.8-flash"),
        reacoes: env("VOZ_REACOES").split(",").map((s) => s.trim()).filter(Boolean),
        fluxo: env("VOZ_LLM_FLUXO", "frase") === "token" ? "token" : "frase",
        enchimento: env("VOZ_ENCHIMENTO"),
        log,
        gerar: (p) => gerarCom(env("VOZ_LLM_CEREBRO", "gemini") === "claude" ? "claude" : "gemini", cerebros, p),
      });
    }

    if (MODO !== "previa") return json(res, 404, { erro: "não existe" });
    if (!origemOk(req)) return json(res, 403, { erro: "origem não permitida" });

    if (req.method === "POST" && url.pathname === "/api/voz/sessao") {
      const b = await corpoJson(req);
      const { token, expiraEm } = emitirToken(
        { motor: "gemini", voz: vozValida(b.voz), nivel: nivelValido(b.nivel), vad: b.vad === "rapido" ? "rapido" : "padrao" },
        env("VOZ_SESSAO_SEGREDO"),
        30_000,
      );
      return json(res, 200, { token, expiraEm, ws: `/api/voz/live?t=${encodeURIComponent(token)}` });
    }
    if (req.method === "GET" && url.pathname === "/api/voz/eleven/estado") {
      const c = configEleven();
      return json(res, 200, { pronta: c.falta.length === 0, falta: c.falta });
    }
    if (req.method === "POST" && url.pathname === "/api/voz/eleven/token") {
      const c = configEleven();
      if (c.falta.length) return json(res, 503, { erro: "ElevenLabs ainda não configurada", falta: c.falta });
      const t = await tokenConversaEleven(c);
      return json(res, 200, { conversationToken: t.token });
    }
    return json(res, 404, { erro: "não existe" });
  } catch (e) {
    const err = e as Error & { status?: number; detalhe?: string };
    log({ rota: url.pathname, erro: String(err.message).slice(0, 200), detalhe: err.detalhe });
    if (!res.headersSent) json(res, err.status ?? 500, { erro: String(err.message).slice(0, 200) });
  }
});

if (MODO === "previa") {
  const wss = servidorWsLive();
  servidor.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/api/voz/live" || !origemOk(req)) return socket.destroy();
    const v = verificarToken(url.searchParams.get("t") ?? "", env("VOZ_SESSAO_SEGREDO"), usados);
    if (!v.ok) {
      log({ rota: "live", recusado: v.motivo });
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      atenderNavegador(ws, v.dados, {
        projeto: env("GCLOUD_PROJECT_VERTEX", "staziamed-revalida-prod"),
        regiao: env("VOZ_LIVE_REGIAO", "us-central1"),
        token: tokenGoogle,
        maxSessaoS: Number(env("VOZ_MAX_SESSAO_S", "600")),
        retomada: env("VOZ_LIVE_RETOMADA", "1") === "1",
        log,
      }),
    );
  });
}

servidor.listen(PORTA, HOST, () => log({ ouvindo: `${HOST}:${PORTA}`, modo: MODO, segredo_llm: env("VOZ_LLM_SEGREDO") ? "configurado" : "AUSENTE", chave_vertex: env("VERTEX_API_KEY") ? "configurada" : "AUSENTE" }));
