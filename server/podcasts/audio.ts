/**
 * ÁUDIO DO PODCAST: o roteiro APROVADO vira voz de dois apresentadores e depois um MP3.
 *
 *   OpenAI (padrão por enquanto): uma chamada por fala, uma voz para cada apresentador (com a instrução de estilo), e as falas
 *     emendadas com uma pausa curta. Modelo: PODCAST_TTS_OPENAI_MODEL (padrão gpt-4o-mini-tts).
 *   Gemini TTS (DESLIGADO por padrão): dois locutores na MESMA chamada (Interactions API, speech_config.speakers), um estilo por fala
 *     (speech_metadata) — ANA e BRUNO soam como uma conversa. Só volta com PODCAST_TTS_GEMINI_ENABLED=1 no servidor (decisão de
 *     2026-10-09: "usar só a OpenAI por enquanto"); desligado, fica "indisponível" e a geração o recusa antes de qualquer chamada.
 *     Modelo: PODCAST_TTS_GEMINI_MODEL (padrão gemini-3.8-flash-tts).
 *
 * O roteiro vai em PARTES (cada uma com poucas falas, para cada chamada caber no tempo de uma função da Vercel); cada parte vira
 * PCM 16 bits, 24 kHz, mono; no fim, as partes viram um MP3 (64 kbps, mono) com lamejs. Chaves só no servidor.
 */
import type { ScriptLine } from "./script";

export const SAMPLE_RATE = 24_000;
export const MAX_PART_CHARS = 1_400;

export type TtsKind = "gemini" | "openai" | "mock";

export interface PodcastVoices {
  ana: string;
  bruno: string;
}

export const DEFAULT_VOICES: Record<Exclude<TtsKind, "mock">, PodcastVoices> = {
  gemini: { ana: "Sulafat", bruno: "Puck" }, // Sulafat: acolhedora; Puck: animado
  openai: { ana: "marin", bruno: "cedar" },
};

/** Vozes aceitas (a escolha vem do painel; nada fora da lista chega ao provedor). */
export const VOICE_OPTIONS: Record<Exclude<TtsKind, "mock">, string[]> = {
  gemini: ["Sulafat", "Puck", "Kore", "Charon", "Aoede", "Leda", "Achird", "Zephyr", "Fenrir", "Orus", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
           "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager"],
  openai: ["marin", "cedar", "coral", "sage", "shimmer", "nova", "alloy", "ash", "ballad", "echo", "fable", "onyx", "verse"],
};

/** Vozes pedidas → vozes válidas para o provedor (o que não estiver na lista volta ao padrão). */
export function pickVoices(kind: TtsKind, wanted?: Partial<PodcastVoices> | null): PodcastVoices {
  if (kind === "mock") return { ana: "simulada-ana", bruno: "simulada-bruno" };
  const ok = (v: unknown, fallback: string) => (typeof v === "string" && VOICE_OPTIONS[kind].includes(v) ? v : fallback);
  return { ana: ok(wanted?.ana, DEFAULT_VOICES[kind].ana), bruno: ok(wanted?.bruno, DEFAULT_VOICES[kind].bruno) };
}

export interface TtsStatus {
  ready: boolean;
  kind: TtsKind | null;
  model: string | null;
  /** O motivo, em português simples, para a equipe ler na tela. */
  pending: string | null;
  /** O detalhe técnico (nome da variável de ambiente etc.): só para o registro interno do servidor, nunca vai para a tela. */
  technical?: string;
}

const realKey = (v: string | undefined) => {
  const k = (v ?? "").trim();
  return k.length >= 30 && !/^(my_|your|changeme|xxx)/i.test(k) ? k : null;
};
/** A voz do Gemini fica desligada até a variável valer exatamente "1" (o código dela continua aqui). */
export const geminiTtsEnabled = (env: NodeJS.ProcessEnv = process.env) => (env.PODCAST_TTS_GEMINI_ENABLED ?? "").trim() === "1";
export const GEMINI_TTS_OFF = "indisponível por enquanto (desligada no servidor).";
export const GEMINI_TTS_OFF_TECHNICAL = "voz do Gemini desligada: falta PODCAST_TTS_GEMINI_ENABLED=1 no servidor.";
export const geminiKey = (env: NodeJS.ProcessEnv = process.env) => realKey(env.GOOGLE_GEMINI_API_KEY) ?? realKey(env.GEMINI_API_KEY) ?? realKey(env.GOOGLE_TTS_API_KEY);

/** Qual voz está pronta no servidor (precisa da autorização de envio de conteúdo a provedor externo; a do Gemini também precisa estar ligada). */
export function ttsStatus(kind: TtsKind, env: NodeJS.ProcessEnv = process.env): TtsStatus {
  if (kind === "mock") return env.NODE_ENV === "production" ? { ready: false, kind, model: null, pending: "Voz simulada não existe em produção." } : { ready: true, kind, model: "voz-simulada", pending: null };
  if (kind === "gemini" && !geminiTtsEnabled(env)) return { ready: false, kind, model: (env.PODCAST_TTS_GEMINI_MODEL ?? "").trim() || "gemini-3.8-flash-tts", pending: GEMINI_TTS_OFF, technical: GEMINI_TTS_OFF_TECHNICAL };
  if (env.CONTENT_HUB_AI_ALLOW_EXTERNAL !== "1") return { ready: false, kind, model: null, pending: "O envio de conteúdo a serviços de voz externos não está autorizado neste servidor. Peça ao administrador do sistema.", technical: "falta CONTENT_HUB_AI_ALLOW_EXTERNAL=1 no servidor." };
  if (kind === "gemini") {
    const model = (env.PODCAST_TTS_GEMINI_MODEL ?? "").trim() || "gemini-3.8-flash-tts";
    return geminiKey(env) ? { ready: true, kind, model, pending: null } : { ready: false, kind, model, pending: "A chave da voz do Gemini não está configurada no servidor.", technical: "falta GEMINI_API_KEY (ou GOOGLE_GEMINI_API_KEY) no servidor." };
  }
  const model = (env.PODCAST_TTS_OPENAI_MODEL ?? "").trim() || "gpt-4o-mini-tts";
  return realKey(env.OPENAI_API_KEY) ? { ready: true, kind, model, pending: null } : { ready: false, kind, model, pending: "A chave da voz da OpenAI não está configurada no servidor.", technical: "falta OPENAI_API_KEY no servidor." };
}

/** Divide as falas em partes de até `max` caracteres (sem quebrar fala). */
export function splitParts(lines: ScriptLine[], max = MAX_PART_CHARS): number[][] {
  const parts: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  lines.forEach((l, i) => {
    if (cur.length && size + l.text.length > max) {
      parts.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += l.text.length;
  });
  if (cur.length) parts.push(cur);
  return parts;
}

// ------------------------------------------------------------ PCM / WAV
/** WAV (RIFF) → PCM 16 bits mono no `SAMPLE_RATE` (sem cabeçalho). Aceita PCM cru. */
export function toPcm(buf: Buffer): { pcm: Buffer; rate: number } {
  if (buf.subarray(0, 4).toString("latin1") !== "RIFF") return { pcm: buf, rate: SAMPLE_RATE };
  let off = 12;
  let rate = SAMPLE_RATE;
  while (off + 8 <= buf.length) {
    const id = buf.subarray(off, off + 4).toString("latin1");
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") rate = buf.readUInt32LE(off + 12);
    if (id === "data") return { pcm: buf.subarray(off + 8, off + 8 + size), rate };
    off += 8 + size + (size % 2);
  }
  return { pcm: Buffer.alloc(0), rate };
}

export const silence = (ms: number, rate = SAMPLE_RATE) => Buffer.alloc(Math.round((rate * ms) / 1000) * 2);
export const pcmSeconds = (bytes: number, rate = SAMPLE_RATE) => Math.round(bytes / 2 / rate);

/** PCM 16 bits mono → MP3 (lamejs). */
export async function pcmToMp3(pcm: Buffer, rate = SAMPLE_RATE, kbps = 64): Promise<Buffer> {
  const mod = (await import("@breezystack/lamejs")) as any;
  const Mp3Encoder = mod.Mp3Encoder ?? mod.default?.Mp3Encoder;
  const enc = new Mp3Encoder(1, rate, kbps);
  const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.length - (pcm.length % 2))));
  const out: Buffer[] = [];
  const block = 1152 * 20;
  for (let i = 0; i < samples.length; i += block) {
    const mp3 = enc.encodeBuffer(samples.subarray(i, i + block));
    if (mp3.length) out.push(Buffer.from(mp3));
  }
  const end = enc.flush();
  if (end.length) out.push(Buffer.from(end));
  return Buffer.concat(out);
}

// ------------------------------------------------------------ provedores
export interface TtsDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

function findAudio(j: any): string | null {
  for (const step of j?.steps ?? []) for (const c of step?.content ?? []) if (c?.type === "audio" && c.data) return c.data;
  for (const o of j?.outputs ?? []) if (o?.type === "audio" && o.data) return o.data;
  return null;
}

/** Erro da voz para a tela em português simples; o detalhe técnico (código HTTP, resposta, erro de rede) fica em `technical`, só para o registro interno. */
export class VoiceError extends Error {
  constructor(message: string, readonly technical: string, readonly status?: number) {
    super(message);
    this.name = "VoiceError";
  }
}
const VOICE_NAME: Record<"gemini" | "openai", string> = { gemini: "do Gemini", openai: "da OpenAI" };
function voiceHttpError(kind: "gemini" | "openai", status: number, body: string, key: string): VoiceError {
  const who = VOICE_NAME[kind];
  const technical = `${kind} (voz) respondeu ${status}: ${body.split(key).join("[chave]").slice(0, 200)}`;
  if (status === 429) return new VoiceError(`O serviço de voz ${who} está com muitas chamadas agora. Espere um pouco e tente de novo.`, technical);
  if (status === 401 || status === 403) return new VoiceError(`O serviço de voz ${who} recusou o acesso do servidor. Avise o administrador do sistema.`, technical);
  if (status >= 500) return new VoiceError(`O serviço de voz ${who} está com problema agora. Tente de novo em alguns minutos.`, technical);
  return new VoiceError(`O serviço de voz ${who} recusou este trecho. Tente de novo; se repetir, avise o administrador do sistema.`, technical);
}
async function voiceFetch(kind: "gemini" | "openai", fetchImpl: typeof fetch, url: string, init: RequestInit, key: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (error: any) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    const technical = `${kind} (voz): ${String(error?.message ?? error).split(key).join("[chave]").slice(0, 200)}`;
    throw new VoiceError(timeout ? `O serviço de voz ${VOICE_NAME[kind]} demorou demais para responder. Tente de novo.` : `Não foi possível falar com o serviço de voz ${VOICE_NAME[kind]}. Tente de novo em alguns minutos.`, technical);
  }
  if (!res.ok) throw voiceHttpError(kind, res.status, await res.text().catch(() => ""), key);
  return res;
}

const PT = "Português do Brasil, sotaque neutro, conversa natural de podcast (não leitura).";

/** Uma parte do roteiro (algumas falas) → PCM. */
export async function synthesizePart(kind: TtsKind, lines: ScriptLine[], voices: PodcastVoices, deps: TtsDeps = {}): Promise<Buffer> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const st = ttsStatus(kind, env);
  if (!st.ready) throw new VoiceError(`Voz indisponível: ${st.pending}`, st.technical ?? st.pending ?? "voz indisponível", 503);
  if (kind === "mock") {
    // simulação: silêncio proporcional ao texto (~14 caracteres por segundo)
    return Buffer.concat(lines.map((l) => Buffer.concat([silence(Math.min(15_000, l.text.length * 70)), silence(250)])));
  }
  if (kind === "gemini") {
    const key = geminiKey(env)!;
    const res = await voiceFetch("gemini", fetchImpl, "https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: st.model,
        input: [{
          type: "user_input",
          content: lines.map((l) => ({
            type: "text",
            text: l.text,
            annotations: [{ type: "speech_metadata", speaker: l.speaker === "ANA" ? "Ana" : "Bruno", style: `${l.style || (l.speaker === "ANA" ? "acolhedora, didática" : "curioso")}. ${PT}` }],
          })),
        }],
        response_format: { type: "audio" },
        generation_config: { speech_config: { mode: "conversational", speakers: [{ speaker: "Ana", voice: voices.ana }, { speaker: "Bruno", voice: voices.bruno }] } },
      }),
      signal: AbortSignal.timeout(110_000),
    }, key);
    const data = findAudio(await res.json().catch(() => null));
    if (!data) throw new VoiceError("O serviço de voz do Gemini não devolveu áudio. Tente de novo.", "gemini (voz) respondeu sem áudio.");
    const { pcm, rate } = toPcm(Buffer.from(data, "base64"));
    if (rate !== SAMPLE_RATE) throw new VoiceError("O áudio devolvido pelo serviço de voz do Gemini veio num formato inesperado. Tente de novo.", `taxa de amostragem inesperada: ${rate}.`);
    return pcm;
  }
  // OpenAI: uma fala por chamada, emendadas com pausa curta
  const key = realKey(env.OPENAI_API_KEY)!;
  const out: Buffer[] = [];
  for (const l of lines) {
    const res = await voiceFetch("openai", fetchImpl, "https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: st.model,
        voice: l.speaker === "ANA" ? voices.ana : voices.bruno,
        input: l.text,
        instructions: `${l.speaker === "ANA" ? "Professora experiente, acolhedora e didática" : "Estudante avançado, curioso"}; ${l.style || "natural"}. ${PT}`,
        response_format: "pcm",
      }),
      signal: AbortSignal.timeout(60_000),
    }, key);
    out.push(Buffer.from(await res.arrayBuffer()), silence(280));
  }
  return Buffer.concat(out);
}

/** Estimativa de custo da voz (US$ por minuto de áudio; ajustável por PODCAST_TTS_PRICE_PER_MIN). */
export function ttsCost(kind: TtsKind, seconds: number, env: NodeJS.ProcessEnv = process.env): number {
  const per = Number(env.PODCAST_TTS_PRICE_PER_MIN) || (kind === "openai" ? 0.015 : kind === "gemini" ? 0.0135 : 0);
  return Math.round((seconds / 60) * per * 1e6) / 1e6;
}
