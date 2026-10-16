/**
 * Voice Tutor — Fase 2 (protótipo). Servidor de TESTE isolado (não toca no Tutor atual, no banco nem em aluno).
 *
 * VOZ_MODO=llm (padrão; é o que vai para o Cloud Run): só GET /saude e POST /v1/chat/completions (Custom LLM da ElevenLabs,
 *   com segredo compartilhado). Nada de microfone, Live ou token aqui: o serviço público não deixa ninguém gastar.
 * VOZ_MODO=previa (só no Mac, preso em 127.0.0.1): faz o papel do APP para a prévia: POST /api/voz/sessao (sela o bilhete da
 *   ponte com a Durona do Personality Engine), POST /api/voz/ferramenta (ferramentas do protótipo) e monta a MESMA ponte do
 *   Cloud Run (server/vozPonte) em WS /api/voz/ponte. GET /api/voz/eleven/* fica para a opção futura (ElevenLabs parada).
 *
 * Segredos: VOZ_LLM_SEGREDO e VOZ_PONTE_SEGREDO (env ou ~/.config/staziamed-voz-teste/segredos.env), VERTEX_API_KEY (env ou
 * ~/.config/vertex-staziamed/vertex.env). Nenhum é impresso. O Live usa o gcloud do dono (no Cloud Run, a conta de serviço).
 *
 * Uso local: npx tsx server/vozTeste/main.ts   (com VOZ_MODO=previa para a página scripts/previa-voz)
 */
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { tratarChatCompletions } from "./customLlm";
import { configEleven, lerArquivoEnv, tokenConversaEleven } from "./eleven";
import { tokenGoogle } from "../vozPonte/googleToken";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { vozValida, MODELO_LIVE } from "./liveConfig";
import { diretivaPrevia, escolhaValida, instrucoesPrevia, type EscolhaExplosiva } from "./durona";
import { DECLARACOES_FERRAMENTAS, EstadoQuestao, QUESTAO_ANAFILAXIA } from "./questaoTeste";
import { personaPromptLayer } from "../tutor/personalityEngine";
import { NoncesUsados, selarBilhete } from "../vozPonte/bilhete";
import { atenderPonte } from "../vozPonte/ponte";
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
const usados = new NoncesUsados();
/** Ligações da prévia (o "banco" do teste): estado da questão e escolha da Durona, só em memória. */
const ligacoes = new Map<string, { questao: EstadoQuestao; escolha: EscolhaExplosiva; criada: number }>();
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

    // faz o papel do app (Vercel): sela o bilhete da ponte com a Durona do Personality Engine e as ferramentas do protótipo
    if (req.method === "POST" && url.pathname === "/api/voz/sessao") {
      const b = await corpoJson(req);
      const escolha = escolhaValida(b);
      const vc = randomUUID();
      for (const [k, v] of ligacoes) if (Date.now() - v.criada > 3600_000) ligacoes.delete(k);
      ligacoes.set(vc, { questao: new EstadoQuestao(QUESTAO_ANAFILAXIA), escolha, criada: Date.now() });
      const { bilhete, expiraEm } = selarBilhete({
        vc, u: "00000000-0000-4000-8000-000000000000", modelo: MODELO_LIVE, voz: vozValida(b.voz), instrucoes: instrucoesPrevia(escolha),
        ferramentas: DECLARACOES_FERRAMENTAS, maxSegundos: Number(env("VOZ_MAX_SESSAO_S", "600")), vad: b.vad === "rapido" ? "rapido" : "padrao",
      }, env("VOZ_PONTE_SEGREDO"));
      return json(res, 200, { vc, bilhete, expiraEm, ponte: "/api/voz/ponte" });
    }
    // faz o papel de /api/tutor/voice/tool: executa a ferramenta no servidor; depois da resposta devolve o tom novo (Personality Engine)
    if (req.method === "POST" && url.pathname === "/api/voz/ferramenta") {
      const b = await corpoJson(req);
      const l = ligacoes.get(String(b.vc ?? ""));
      if (!l) return json(res, 404, { erro: "ligação não encontrada" });
      const output: Record<string, unknown> = l.questao.executar(String(b.name ?? ""), (b.args ?? {}) as Record<string, unknown>);
      if (b.name === "submit_answer" && typeof output.acertou === "boolean") output.tom_do_professor = personaPromptLayer(diretivaPrevia(l.escolha, [output.acertou ? "correct" : "wrong"]));
      return json(res, 200, { output });
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
  // a MESMA ponte que vai para o Cloud Run, montada aqui em /api/voz/ponte (origem só a página da prévia)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  servidor.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/api/voz/ponte" || !origemOk(req) || !req.headers.origin) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) =>
      atenderPonte(ws, {
        segredo: env("VOZ_PONTE_SEGREDO"), usados, log, tokenGoogle,
        projeto: env("GCLOUD_PROJECT_VERTEX", "staziamed-revalida-prod"),
        regiao: env("VOZ_LIVE_REGIAO", "us-central1"),
      }),
    );
  });
}

servidor.listen(PORTA, HOST, () => log({ ouvindo: `${HOST}:${PORTA}`, modo: MODO, segredo_llm: env("VOZ_LLM_SEGREDO") ? "configurado" : "AUSENTE", chave_vertex: env("VERTEX_API_KEY") ? "configurada" : "AUSENTE" }));
