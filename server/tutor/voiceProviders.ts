/**
 * PROVEDORES DE VOZ do Stazia Tutor: Gemini (voz nativa do Google, português do Brasil sem sotaque americano), GPT-Live e
 * Realtime (OpenAI). Os modelos vêm do ambiente do servidor.
 *
 *   GEMINI_LIVE_MODEL       voz ao vivo do Gemini (padrão gemini-3.8-live); chave GEMINI_API_KEY ou GOOGLE_GEMINI_API_KEY
 *   OPENAI_VOICE_PROVIDER   gemini | live | realtime | auto   (padrão: auto = Gemini quando configurado; senão GPT-Live; senão Realtime)
 *   OPENAI_LIVE_MODEL       modelo do GPT-Live (conversa full-duplex; ex.: gpt-live-1)
 *   OPENAI_REALTIME_MODEL   modelo do Realtime (reserva quando o GPT-Live não estiver disponível; ex.: gpt-realtime-2.1)
 *   OPENAI_REALTIME_VOICE   voz padrão quando o professor não tem uma e o painel não escolheu (ex.: marin)
 *   OPENAI_API_KEY e TUTOR_VOICE_ALLOW_EXTERNAL=1, como antes (realtime.ts)
 *   TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1  trava própria da voz ao vivo dos alunos (fala pelo microfone); desligada por padrão.
 *                                      Sem ela, nenhum dos três caminhos fica pronto (liveVoiceLockPending)
 *
 * O painel (tutor_config.voice_provider) escolhe entre automático, GPT-Live e Realtime e pode fixar uma voz para todos
 * (tutor_config.voice_name). Uma sessão de voz não troca de voz depois de começar a falar: trocar de voz ou de professor
 * é abrir outra ligação.
 *
 * GPT-Live (POST /v1/live/sessions, "interface unificada"): o navegador manda a oferta WebRTC para o NOSSO servidor, que a troca
 * com a OpenAI usando a chave daqui (nem segredo temporário vai para o navegador). O GPT-Live conversa; quando precisa do sistema
 * (questão, gabarito, fontes, histórico do aluno), ele DELEGA ao aplicativo (delegação "client"): o servidor monta a resposta
 * com o motor do Tutor (conferida antes de falar) e o aplicativo devolve para ele dizer (delegate.ts).
 * Encerrar pelo servidor (cota, limite, outra aba): canal lateral wss://…/v1/live/sessions/{id}/attach + session.close.
 */
import { createHash } from "crypto";
import { realKey } from "./speech";
import type { RealtimeConfig } from "./realtime";

const API = "https://api.openai.com/v1";

export type VoiceProviderId = "gemini" | "live" | "realtime";
export type VoiceProviderChoice = "auto" | VoiceProviderId;

export interface LiveConfig {
  ready: boolean;
  model: string | null;
  key: string | null;
  pending: string | null;
}

/**
 * Travas da VOZ AO VIVO dos alunos (VZ01, 2026-10-10). TUTOR_VOICE_ALLOW_EXTERNAL=1 sozinha basta para a equipe ouvir e aprovar as
 * vozes oficiais (officialVoices.ts); a voz ao vivo, em que a fala do aluno pelo microfone vai para o serviço de voz, exige também
 * a trava própria TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1, desligada por padrão. Vale para os três caminhos (Gemini, GPT-Live e Realtime).
 * Devolve o aviso para a equipe (só o que falta) ou null quando as duas estão ligadas.
 */
export const LIVE_VOICE_LOCK = "TUTOR_LIVE_VOICE_ALLOW_EXTERNAL";
export function liveVoiceLockPending(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing = ["TUTOR_VOICE_ALLOW_EXTERNAL", LIVE_VOICE_LOCK].filter((name) => env[name] !== "1");
  if (!missing.length) return null;
  return "Voz ao vivo dos alunos desligada: a fala do aluno pelo microfone só vai para o serviço de voz depois de o uso ser aprovado. "
    + `Para ligar, defina no servidor ${missing.map((name) => `${name}=1`).join(" e ")}.`;
}

/** GPT-Live pronto? Mesmas exigências da voz atual (chave, as duas travas da voz ao vivo) mais o modelo do GPT-Live. */
export function liveConfig(env: NodeJS.ProcessEnv = process.env): LiveConfig {
  const model = (env.OPENAI_LIVE_MODEL ?? "").trim() || null;
  const key = realKey(env.OPENAI_API_KEY);
  const pending = !model
    ? "Defina OPENAI_LIVE_MODEL no servidor para usar o GPT-Live."
    : liveVoiceLockPending(env) ?? (!key ? "OPENAI_API_KEY ausente ou com o texto de exemplo no .env do servidor." : null);
  return { ready: !pending, model, key: pending ? null : key, pending };
}

/**
 * Voz nativa do Gemini (Live API, áudio nativo): conversa ao vivo com pronúncia de quem nasceu falando português. O navegador
 * conecta direto no Google com uma chave temporária que o servidor cria (uma por ligação, com as instruções travadas aqui).
 */
export interface GeminiVoiceConfig {
  ready: boolean;
  model: string;
  key: string | null;
  pending: string | null;
}
export function geminiVoiceConfig(env: NodeJS.ProcessEnv = process.env): GeminiVoiceConfig {
  const model = (env.GEMINI_LIVE_MODEL ?? "").trim() || "gemini-3.8-live";
  const key = realKey(env.GEMINI_API_KEY) ?? realKey(env.GOOGLE_GEMINI_API_KEY);
  const pending = liveVoiceLockPending(env) ?? (!key ? "GEMINI_API_KEY ausente no servidor." : null);
  return { ready: !pending, model, key: pending ? null : key, pending };
}

/** Escolha do ambiente (OPENAI_VOICE_PROVIDER), usada quando o painel está em "automático". */
export function envProviderChoice(env: NodeJS.ProcessEnv = process.env): VoiceProviderChoice {
  const v = (env.OPENAI_VOICE_PROVIDER ?? "").trim().toLowerCase();
  return v === "gemini" || v === "live" || v === "realtime" ? v : "auto";
}

// Gemini recusado (chave sem acesso ao modelo, configuração recusada): usa a OpenAI por um tempo, sem insistir a cada ligação.
let geminiDownUntil = 0;
export const markGeminiUnavailable = (ms = 10 * 60_000) => {
  geminiDownUntil = Date.now() + ms;
};
export const geminiIsDown = () => Date.now() < geminiDownUntil;
export const resetGeminiAvailability = () => {
  geminiDownUntil = 0;
};

// GPT-Live recusado pela OpenAI (conta sem acesso, modelo inexistente): usa o Realtime por um tempo, sem insistir a cada ligação.
let liveDownUntil = 0;
export const markLiveUnavailable = (ms = 10 * 60_000) => {
  liveDownUntil = Date.now() + ms;
};
export const liveIsDown = () => Date.now() < liveDownUntil;
export const resetLiveAvailability = () => {
  liveDownUntil = 0;
};

export interface ProviderPlan {
  /** Provedor a tentar primeiro (null = nenhum configurado). */
  first: VoiceProviderId | null;
  /** Reserva se o primeiro for recusado. */
  fallback: VoiceProviderId | null;
  /** Todos os prontos, na ordem de tentativa. */
  order: VoiceProviderId[];
  pending: string | null;
}

const NOT_GEMINI: GeminiVoiceConfig = { ready: false, model: "", key: null, pending: "Gemini não configurado." };

/**
 * Qual provedor usar. O painel manda quando escolhe um; "auto" segue o ambiente; ambiente "auto" prefere o Gemini (português do
 * Brasil nativo), depois o GPT-Live, depois o Realtime. Só entra quem estiver pronto; `avoid` tira quem acabou de falhar no
 * aparelho do aluno (a conexão do Gemini é feita pelo navegador).
 */
export function planProviders(
  admin: string | null | undefined, env: NodeJS.ProcessEnv, live: LiveConfig, rt: Pick<RealtimeConfig, "ready" | "pending">, clientCanLive: boolean,
  gemini: GeminiVoiceConfig = NOT_GEMINI, avoid: VoiceProviderId[] = [],
): ProviderPlan {
  const wanted: VoiceProviderChoice = admin === "gemini" || admin === "live" || admin === "realtime" ? admin : envProviderChoice(env);
  const ok: Record<VoiceProviderId, boolean> = {
    gemini: gemini.ready && !geminiIsDown() && !avoid.includes("gemini"),
    live: live.ready && clientCanLive && !liveIsDown() && !avoid.includes("live"),
    realtime: rt.ready && !avoid.includes("realtime"),
  };
  const order: VoiceProviderId[] =
    wanted === "realtime" ? ["realtime", "live", "gemini"] : wanted === "live" ? ["live", "realtime", "gemini"] : ["gemini", "live", "realtime"];
  const usable = order.filter((p) => ok[p]);
  if (!usable.length) {
    const why = wanted === "gemini" && !gemini.ready ? gemini.pending : wanted === "live" && !live.ready ? live.pending : rt.pending ?? live.pending ?? gemini.pending;
    return { first: null, fallback: null, order: [], pending: why ?? "A conversa por voz ainda não está configurada no servidor." };
  }
  return { first: usable[0], fallback: usable[1] ?? null, order: usable, pending: null };
}

/** Vozes prontas do Gemini (a lista do Live API). Nome fora da lista não vai para o Google. */
export const GEMINI_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina",
  "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix",
  "Sadachbia", "Sadaltager", "Sulafat",
];
export const geminiVoiceName = (v: unknown): string | null => {
  const s = String(v ?? "").trim().toLowerCase();
  return GEMINI_VOICES.find((n) => n.toLowerCase() === s) ?? null;
};

/** Ferramentas no formato do Gemini (o mesmo esquema JSON das ferramentas da OpenAI). */
export function geminiTools(tools: { name: string; description: string; parameters: unknown }[]) {
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }];
}

export class GeminiVoiceError extends Error {
  constructor(message: string, readonly status: number, readonly access: boolean) {
    super(message);
  }
}

export interface GeminiTokenRequest {
  key: string;
  model: string;
  instructions: string;
  voice: string | null;
  tools: { name: string; description: string; parameters: unknown }[];
  /** Quanto a ligação pode durar (limite do painel ou o tempo de voz que o aluno ainda tem): a chave vale um pouco mais que isso. */
  maxSeconds: number;
  /** Testes: troca o cliente do Google (nenhuma chamada de verdade). */
  client?: { authTokens: { create(params: { config: Record<string, unknown> }): Promise<{ name?: string }> } };
}

/**
 * Chave temporária do Gemini Live para o navegador, com TUDO travado aqui: modelo, instruções do professor, voz, ferramentas,
 * transcrições e o modo de áudio. O navegador só conecta; não consegue trocar as instruções nem usar a chave principal.
 * Abre UMA conversa (retomar a mesma conversa depois de uma queda não conta como uso, segundo o Google) e vence 2 minutos depois
 * do tempo que a ligação pode durar: o servidor não consegue desligar uma conversa do Gemini, então a validade é o limite.
 */
export async function createGeminiVoiceToken(r: GeminiTokenRequest): Promise<{ token: string; expiresAt: string }> {
  const client = r.client ?? (await (async () => {
    const { GoogleGenAI } = (await import("@google/genai")) as typeof import("@google/genai");
    return new GoogleGenAI({ apiKey: r.key, httpOptions: { apiVersion: "v1alpha" } }) as unknown as NonNullable<GeminiTokenRequest["client"]>;
  })());
  const expiresAt = new Date(Date.now() + Math.min(Math.max(r.maxSeconds, 60) + 120, 2 * 3600) * 1000).toISOString();
  const config = {
    responseModalities: ["AUDIO"],
    systemInstruction: r.instructions,
    ...(r.voice ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: r.voice } } } } : {}),
    tools: geminiTools(r.tools),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // fala com emoção de verdade (bronca, comemoração, grito curto), no tom do que está acontecendo
    enableAffectiveDialog: true,
    contextWindowCompression: { slidingWindow: {} },
    // a continuidade entre conexões (sessionResumption) fica livre: o aplicativo manda o "handle" quando reconecta
  };
  let token: { name?: string };
  try {
    token = await client.authTokens.create({
      config: { uses: 1, expireTime: expiresAt, newSessionExpireTime: expiresAt, liveConnectConstraints: { model: r.model, config }, lockAdditionalFields: [] },
    });
  } catch (error: any) {
    const status = Number(error?.status ?? error?.code ?? 502) || 502;
    const msg = String(error?.message ?? error).split(r.key).join("[chave]").slice(0, 240);
    throw new GeminiVoiceError(`Gemini recusou a chave temporária (${status}): ${msg}`, status, [400, 401, 403, 404].includes(status));
  }
  if (!token?.name) throw new GeminiVoiceError("Gemini respondeu sem chave temporária.", 502, false);
  return { token: token.name, expiresAt };
}

/** Erro da OpenAI ao abrir o GPT-Live; `access` = a conta/modelo não tem acesso (vale tentar o Realtime). */
export class LiveSessionError extends Error {
  constructor(message: string, readonly status: number, readonly access: boolean) {
    super(message);
  }
}

export interface LiveSessionRequest {
  key: string;
  model: string;
  instructions: string;
  voice: string | null;
  sdp: string;
  userId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Abre a sessão do GPT-Live trocando a oferta WebRTC do navegador pela resposta (delegação ao aplicativo). */
export async function createLiveSession(r: LiveSessionRequest): Promise<{ sessionId: string; sdp: string }> {
  const fetchImpl = r.fetchImpl ?? fetch;
  const res = await fetchImpl(`${API}/live/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${r.key}`,
      "Content-Type": "application/json",
      // identificador estável e sem dado pessoal, para a OpenAI tratar abuso por aluno
      "OpenAI-Safety-Identifier": createHash("sha256").update(`stazia:${r.userId}`).digest("hex"),
    },
    body: JSON.stringify({
      session: { model: r.model, instructions: r.instructions, ...(r.voice ? { voice: r.voice } : {}), delegation: { type: "client" } },
      transport: { type: "webrtc", sdp: r.sdp },
    }),
    signal: AbortSignal.timeout(r.timeoutMs ?? 20_000),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).split(r.key).join("[chave]").slice(0, 240);
    throw new LiveSessionError(`GPT-Live respondeu ${res.status}: ${text}`, res.status, [400, 401, 403, 404].includes(res.status));
  }
  const data = (await res.json()) as { session?: { id?: string }; transport?: { sdp?: string } };
  if (!data.session?.id || !data.transport?.sdp) throw new LiveSessionError("GPT-Live respondeu sem sessão ou sem SDP.", 502, false);
  return { sessionId: data.session.id, sdp: data.transport.sdp };
}

type WsLike = {
  on(event: "open" | "message" | "error" | "close", cb: (...args: any[]) => void): unknown;
  send(data: string): void;
  close(): void;
};
type WsFactory = (url: string, headers: Record<string, string>) => WsLike;

let wsFactory: WsFactory | null = null;
/** Testes trocam o WebSocket (nenhuma conexão de verdade). */
export const setLiveSidebandFactory = (f: WsFactory | null) => {
  wsFactory = f;
};

async function defaultWs(url: string, headers: Record<string, string>): Promise<WsLike> {
  const mod = (await import("ws")) as unknown as { default: new (url: string, opts: { headers: Record<string, string> }) => WsLike };
  return new mod.default(url, { headers });
}

/**
 * Encerra uma sessão do GPT-Live pelo servidor (canal lateral + session.close; espera session.closed ou o tempo esgotar).
 * Melhor esforço: o tempo continua contado pelo banco de qualquer jeito.
 */
export async function closeLiveSession(key: string | null, sessionId: string, log?: (m: string) => void, timeoutMs = 6_000): Promise<boolean> {
  if (!key || !/^[A-Za-z0-9_-]{4,120}$/.test(sessionId)) return false;
  const url = `wss://api.openai.com/v1/live/sessions/${sessionId}/attach`;
  let ws: WsLike;
  try {
    ws = wsFactory ? wsFactory(url, { Authorization: `Bearer ${key}` }) : await defaultWs(url, { Authorization: `Bearer ${key}` });
  } catch (error) {
    log?.(`[tutor] voz: não abri o canal lateral do GPT-Live: ${(error as Error).message.slice(0, 120)}`);
    return false;
  }
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // já fechado
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    ws.on("open", () => {
      try {
        ws.send(JSON.stringify({ type: "session.close" }));
      } catch {
        finish(false);
      }
    });
    ws.on("message", (raw: unknown) => {
      try {
        const ev = JSON.parse(String(raw));
        if (ev?.type === "session.closed") finish(true);
      } catch {
        // mensagem ilegível: ignora
      }
    });
    ws.on("error", (error: Error) => {
      log?.(`[tutor] voz: canal lateral do GPT-Live falhou: ${String(error?.message ?? error).slice(0, 120)}`);
      finish(false);
    });
    ws.on("close", () => finish(false));
  });
}
