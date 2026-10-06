/**
 * PROVEDORES DE VOZ do Stazia Tutor (OpenAI). Nenhum nome de modelo fica no código: tudo vem do ambiente do servidor.
 *
 *   OPENAI_VOICE_PROVIDER   live | realtime | auto   (padrão: auto = GPT-Live quando configurado; senão Realtime)
 *   OPENAI_LIVE_MODEL       modelo do GPT-Live (conversa full-duplex; ex.: gpt-live-1)
 *   OPENAI_REALTIME_MODEL   modelo do Realtime (reserva quando o GPT-Live não estiver disponível; ex.: gpt-realtime-2.1)
 *   OPENAI_REALTIME_VOICE   voz padrão quando o professor não tem uma e o painel não escolheu (ex.: marin)
 *   OPENAI_API_KEY e TUTOR_VOICE_ALLOW_EXTERNAL=1, como antes (realtime.ts)
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

export type VoiceProviderId = "live" | "realtime";
export type VoiceProviderChoice = "auto" | VoiceProviderId;

export interface LiveConfig {
  ready: boolean;
  model: string | null;
  key: string | null;
  pending: string | null;
}

/** GPT-Live pronto? Mesmas exigências da voz atual (chave, consentimento) mais o modelo do GPT-Live. */
export function liveConfig(env: NodeJS.ProcessEnv = process.env): LiveConfig {
  const model = (env.OPENAI_LIVE_MODEL ?? "").trim() || null;
  const key = realKey(env.OPENAI_API_KEY);
  const pending = !model
    ? "Defina OPENAI_LIVE_MODEL no servidor para usar o GPT-Live."
    : env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1"
      ? "Envio da voz do aluno à OpenAI não autorizado: defina TUTOR_VOICE_ALLOW_EXTERNAL=1 no servidor depois de aprovar o uso."
      : !key
        ? "OPENAI_API_KEY ausente ou com o texto de exemplo no .env do servidor."
        : null;
  return { ready: !pending, model, key: pending ? null : key, pending };
}

/** Escolha do ambiente (OPENAI_VOICE_PROVIDER), usada quando o painel está em "automático". */
export function envProviderChoice(env: NodeJS.ProcessEnv = process.env): VoiceProviderChoice {
  const v = (env.OPENAI_VOICE_PROVIDER ?? "").trim().toLowerCase();
  return v === "live" || v === "realtime" ? v : "auto";
}

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
  /** Reserva se o primeiro for recusado pela OpenAI. */
  fallback: VoiceProviderId | null;
  pending: string | null;
}

/**
 * Qual provedor usar. Painel "live" ou "realtime" manda; "auto" segue o ambiente; ambiente "auto" prefere o GPT-Live quando
 * configurado. Um provedor só entra se estiver pronto; o outro, se pronto, fica de reserva.
 */
export function planProviders(admin: string | null | undefined, env: NodeJS.ProcessEnv, live: LiveConfig, rt: Pick<RealtimeConfig, "ready" | "pending">, clientCanLive: boolean): ProviderPlan {
  const wanted: VoiceProviderChoice = admin === "live" || admin === "realtime" ? admin : envProviderChoice(env);
  const liveOk = live.ready && clientCanLive && !liveIsDown();
  const order: VoiceProviderId[] = wanted === "realtime" ? ["realtime", "live"] : ["live", "realtime"];
  const usable = order.filter((p) => (p === "live" ? liveOk : rt.ready));
  if (!usable.length) {
    const why = wanted === "live" && !live.ready ? live.pending : rt.pending ?? live.pending;
    return { first: null, fallback: null, pending: why ?? "A conversa por voz ainda não está configurada no servidor." };
  }
  return { first: usable[0], fallback: usable[1] ?? null, pending: null };
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
