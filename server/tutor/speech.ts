/**
 * VOZ NATURAL do Stazia Tutor: transforma em áudio, no servidor, um texto que o servidor JÁ validou (fala gravada do professor,
 * a questão da conversa ou uma frase fixa do aplicativo). O navegador nunca manda texto livre para cá.
 *
 *   TUTOR_VOICE_PROVIDER          openai | gemini | elevenlabs | mock | off (padrão: off; mock só fora de produção)
 *   TUTOR_VOICE_ALLOW_EXTERNAL=1  consentimento próprio: o texto da resposta vai para o serviço de voz
 *   TUTOR_VOICE_MODEL             modelo do provedor; ElevenLabs usa eleven_multilingual_v2 por padrão
 *   OPENAI_API_KEY / GEMINI_API_KEY / ELEVENLABS_API_KEY
 *   ELEVENLABS_VOICE_ID           voz padrão do ElevenLabs; a personalidade pode sobrescrever com voice.elevenlabs
 *   TUTOR_VOICE_DAILY_CHARS       teto de caracteres falados por aluno por dia (padrão 30.000, cerca de meia hora de fala)
 *   TUTOR_VOICE_PRICE_PER_MIN     preço por minuto de fala, para a estimativa de custo (padrão: 0,015 OpenAI; 0,0135 Gemini até 31/12/2026)
 *
 * Sem voz natural pronta, o aplicativo usa a voz do aparelho, como antes. A voz é sempre a mesma resposta validada: só muda o som.
 */
import { createHash } from "crypto";
import { TRIAL_OVER, TutorError, consentError, type TutorDeps } from "./engine";
import { spokenText } from "./safety";
import { TUTOR_SPOKEN_LANGUAGE } from "../../src/shared/tutor/voiceLanguage";
import { elevenLabsVoiceSettings, speechDirectionFromState, type SpeechDirection } from "./speechDirector";
import { OfficialElevenLabsSpeech } from "./elevenlabsTts";
import { elevenLabsReadiness } from "./officialVoices";

export interface VoiceProfile {
  openai?: string;
  gemini?: string;
  elevenlabs?: string;
  personality?: string;
  /** Direção de atuação: como o personagem fala (sem conteúdo médico). */
  acting?: string;
  style?: string;
  direction?: SpeechDirection;
}

export interface SpeechAudio {
  audio: Buffer;
  mime: string;
}

export interface SpeechProvider {
  readonly name: string;
  readonly model: string;
  readonly isMock: boolean;
  /** Preço estimado por minuto de fala (US$). */
  readonly pricePerMinute: number;
  readonly cacheIdentity?: string;
  synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio>;
}

export interface SpeechStatus {
  ready: boolean;
  provider: string;
  model: string | null;
  pending: string | null;
}

/** Fala em português leva uns 900 caracteres por minuto: é a base da estimativa de custo (o serviço cobra pelo áudio gerado). */
export const CHARS_PER_MINUTE = 900;
export const MAX_SPEECH_CHARS = 4000;

/** Chave de verdade, não o texto de exemplo do .env ("MY_GEMINI_API_KEY", "your-key", vazio). */
export function realKey(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (v.length < 30 || /^(my_|your|sk-\.\.\.|changeme|xxx)/i.test(v)) return null;
  return v;
}

/** Instrução de atuação para o serviço de voz: português do Brasil, conversa (não leitura) e o jeito do personagem. */
export function actingInstructions(voice: VoiceProfile): string {
  return [
    TUTOR_SPOKEN_LANGUAGE,
    voice.acting ? `Personagem: ${voice.acting}.` : voice.style ? `Tom: ${voice.style}.` : "",
    "Respeite as pausas das reticências e das vírgulas. Palavrão, quando houver, é dito com naturalidade, sem censura e sem pausa.",
  ]
    .filter(Boolean)
    .join(" ");
}

export class OpenAISpeech implements SpeechProvider {
  readonly name = "openai";
  readonly isMock = false;
  constructor(
    private apiKey: string,
    readonly model: string,
    readonly pricePerMinute: number,
    private fetchImpl: typeof fetch = fetch,
    private baseUrl = "https://api.openai.com/v1",
  ) {}

  async synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio> {
    const res = await this.fetchImpl(`${this.baseUrl}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, voice: voice.openai || "marin", input: text.slice(0, MAX_SPEECH_CHARS), instructions: actingInstructions(voice), response_format: "mp3" }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`serviço de voz OpenAI respondeu ${res.status}: ${(await res.text()).replace(this.apiKey, "[chave]").slice(0, 200)}`);
    return { audio: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
  }
}

/** Procura o áudio em base64 na resposta do Gemini (o nome do campo varia entre versões da API). */
function findAudio(node: unknown): { data: string; mime: string } | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  if (typeof n.data === "string" && n.data.length > 200) return { data: n.data, mime: String(n.mime_type ?? n.mimeType ?? "audio/pcm") };
  for (const v of Object.values(n)) {
    const hit = findAudio(v);
    if (hit) return hit;
  }
  return null;
}

/** Áudio PCM 16 bits mono (24 kHz, o padrão do Gemini) num arquivo WAV que o navegador toca. */
export function wrapWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8, "latin1");
  h.write("fmt ", 12, "latin1");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "latin1");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export class GeminiSpeech implements SpeechProvider {
  readonly name = "gemini";
  readonly isMock = false;
  constructor(
    private apiKey: string,
    readonly model: string,
    readonly pricePerMinute: number,
    private fetchImpl: typeof fetch = fetch,
    private endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions",
  ) {}

  async synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio> {
    const res = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        model: this.model,
        input: [{ type: "user_input", content: [{ type: "text", text: text.slice(0, MAX_SPEECH_CHARS), annotations: [{ type: "speech_metadata", style: actingInstructions(voice) }] }] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: voice.gemini || "Sulafat" }] },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`serviço de voz Gemini respondeu ${res.status}: ${(await res.text()).replace(this.apiKey, "[chave]").slice(0, 200)}`);
    const found = findAudio(await res.json());
    if (!found) throw new Error("serviço de voz Gemini respondeu sem áudio");
    const buf = Buffer.from(found.data, "base64");
    if (buf.subarray(0, 4).toString("latin1") === "RIFF") return { audio: buf, mime: "audio/wav" };
    const rate = Number(/rate=(\d+)/.exec(found.mime)?.[1]) || 24000;
    return { audio: wrapWav(buf, rate), mime: "audio/wav" };
  }
}

export class ElevenLabsSpeech implements SpeechProvider {
  readonly name = "elevenlabs";
  readonly isMock = false;
  constructor(
    private apiKey: string,
    private defaultVoiceId: string,
    readonly model: string,
    readonly pricePerMinute: number,
    private fetchImpl: typeof fetch = fetch,
    private baseUrl = "https://api.elevenlabs.io",
    private outputFormat = "mp3_44100_128",
  ) {}

  async synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio> {
    const voiceId = (voice.elevenlabs || this.defaultVoiceId).trim();
    if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID ausente");
    const query = new URLSearchParams({ output_format: this.outputFormat });
    const res = await this.fetchImpl(`${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": this.apiKey },
      body: JSON.stringify({
        text: text.slice(0, MAX_SPEECH_CHARS),
        model_id: this.model,
        voice_settings: elevenLabsVoiceSettings(voice.direction),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`serviço de voz ElevenLabs respondeu ${res.status}: ${(await res.text()).replace(this.apiKey, "[chave]").slice(0, 200)}`);
    return { audio: Buffer.from(await res.arrayBuffer()), mime: this.outputFormat.startsWith("mp3") ? "audio/mpeg" : "audio/octet-stream" };
  }
}

/** Voz simulada para testes: um WAV curto de silêncio, com o tamanho proporcional ao texto. */
export class MockSpeech implements SpeechProvider {
  readonly name = "mock";
  readonly model = "voz-simulada";
  readonly isMock = true;
  readonly pricePerMinute = 0.015;
  readonly calls: { text: string; voice: VoiceProfile }[] = [];
  async synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio> {
    this.calls.push({ text, voice });
    return { audio: wrapWav(Buffer.alloc(Math.min(48_000, 200 + text.length * 2))), mime: "audio/wav" };
  }
}

const DEFAULT_MODEL: Record<string, string> = { openai: "gpt-4o-mini-tts", gemini: "gemini-3.8-flash-tts", elevenlabs: "eleven_v3" };
const DEFAULT_PRICE: Record<string, number> = { openai: 0.015, gemini: 0.0135, elevenlabs: 0 };

let mockSingleton: MockSpeech | null = null;
export const mockSpeech = () => (mockSingleton ??= new MockSpeech());

export function resolveSpeechProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): { provider: SpeechProvider | null; status: SpeechStatus } {
  const kind = (env.TUTOR_VOICE_PROVIDER || "off").trim().toLowerCase();
  const model = (env.TUTOR_VOICE_MODEL || (kind === "elevenlabs" ? env.ELEVENLABS_MODEL_ID : "") || DEFAULT_MODEL[kind] || "").trim() || null;
  const pending = (why: string) => ({ provider: null, status: { ready: false, provider: kind, model, pending: why } });
  if (kind === "off" || kind === "") return pending("Voz natural desligada: defina TUTOR_VOICE_PROVIDER (openai, gemini ou elevenlabs) no servidor.");
  if (kind === "mock") {
    if (env.NODE_ENV === "production") return pending("Voz simulada não é permitida em produção.");
    const p = mockSpeech();
    return { provider: p, status: { ready: true, provider: "mock", model: p.model, pending: null } };
  }
  if (kind !== "openai" && kind !== "gemini" && kind !== "elevenlabs") return pending(`Serviço de voz desconhecido: ${kind}. Use openai, gemini ou elevenlabs.`);
  if (env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1") return pending("Envio do texto das respostas ao serviço de voz não autorizado: defina TUTOR_VOICE_ALLOW_EXTERNAL=1 no servidor depois de aprovar o uso.");
  const keyName = kind === "openai" ? "OPENAI_API_KEY" : kind === "gemini" ? "GEMINI_API_KEY" : "ELEVENLABS_API_KEY";
  const key = realKey(env[keyName]);
  if (!key) return pending(`${keyName} ausente ou com o texto de exemplo no .env do servidor.`);
  if (kind === "elevenlabs") {
    const readiness = elevenLabsReadiness(env);
    if (!readiness.releaseReady) return pending(readiness.pending || "As vozes ElevenLabs ainda não foram liberadas.");
    const provider = new OfficialElevenLabsSpeech(env, fetchImpl);
    return { provider, status: { ready: true, provider: kind, model: provider.model, pending: null } };
  }
  const configuredPrice = Number(env.TUTOR_VOICE_PRICE_PER_MIN || env.ELEVENLABS_PRICE_PER_MIN);
  const price = configuredPrice > 0 ? configuredPrice : DEFAULT_PRICE[kind];
  const provider = kind === "openai"
    ? new OpenAISpeech(key, model!, price, fetchImpl)
    : kind === "gemini"
      ? new GeminiSpeech(key, model!, price, fetchImpl)
      : new ElevenLabsSpeech(key, "", model!, price, fetchImpl, env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io", env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128");
  return { provider, status: { ready: true, provider: kind, model, pending: null } };
}

/** Frases fixas do aplicativo que podem virar voz (o navegador manda só o nome e, quando é o caso, a letra). */
export function phraseText(phrase: string, letter: string | null, sample: string | null): string | null {
  switch (phrase) {
    case "marked":
      return letter ? `Marquei a ${letter}. Diga confirmo para responder, ou fale outra alternativa.` : null;
    case "unmarked":
      return "Desmarquei. Qual você escolhe?";
    case "sample":
      return sample;
    default:
      return null;
  }
}

/** Custo estimado (US$) de falar um texto, pela duração aproximada. */
export const speechCost = (chars: number, pricePerMinute: number) => Math.round((chars / CHARS_PER_MINUTE) * pricePerMinute * 1e6) / 1e6;

/** Cache pequeno em memória: repetir a mesma fala (ouvir de novo, frase fixa) não gera nem cobra outra vez. */
export class SpeechCache {
  private map = new Map<string, SpeechAudio>();
  private bytes = 0;
  constructor(private maxBytes = 32 * 1024 * 1024) {}
  static key(provider: SpeechProvider, voice: VoiceProfile, text: string) {
    return createHash("sha256").update(JSON.stringify([provider.name, provider.model, provider.cacheIdentity ?? null, voice.openai, voice.gemini, voice.elevenlabs, voice.personality, voice.direction, actingInstructions(voice), text])).digest("hex");
  }
  get(key: string) {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit ?? null;
  }
  set(key: string, value: SpeechAudio) {
    if (value.audio.length > this.maxBytes) return;
    this.map.set(key, value);
    this.bytes += value.audio.length;
    for (const [k, v] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.map.delete(k);
      this.bytes -= v.audio.length;
    }
  }
}

/** Texto que de fato vira voz: o mesmo da fala validada, sem marcação. */
export const speechInput = (text: string) => spokenText(text).slice(0, MAX_SPEECH_CHARS);

export interface SpeechRequest {
  kind: "message" | "question" | "phrase";
  sessionId: string | null;
  messageId: number | null;
  phrase: string | null;
  letter: string | null;
  personalityId: string | null;
}

interface SpeechSource {
  found: boolean;
  /** O banco diz que o aluno ainda não aceitou os Tutores de IA (vem também quando não acha a fala). */
  consent_pending?: boolean;
  config?: { enabled: boolean; voice_enabled: boolean };
  /** Direito do Tutor e caracteres da voz do professor (tutor_tts_quota). */
  quota?: { mode: "trial" | "paid" | "blocked"; used_today: number };
  personality?: string;
  voice?: VoiceProfile;
  emotion?: Record<string, unknown> | null;
  sample?: string | null;
  text?: string | null;
}

const cache = new SpeechCache();
const DAILY_CHARS = () => (Number(process.env.TUTOR_VOICE_DAILY_CHARS) > 0 ? Number(process.env.TUTOR_VOICE_DAILY_CHARS) : 30_000);

/** Provedor de voz: o dos testes (deps.speech) ou o do .env. */
export function speechProviderFor(deps: TutorDeps) {
  if (deps.speech !== undefined) {
    const p = deps.speech;
    return { provider: p, status: { ready: Boolean(p), provider: p?.name ?? "off", model: p?.model ?? null, pending: p ? null : "Voz natural desligada." } as SpeechStatus };
  }
  return resolveSpeechProvider();
}

/** Gera a voz natural de um texto já validado, para o aluno dono dele. Conta os caracteres do dia e o custo estimado. */
export async function tutorSpeech(deps: TutorDeps, userId: string, req: SpeechRequest): Promise<SpeechAudio & { cached: boolean }> {
  const { provider, status } = speechProviderFor(deps);
  if (!provider) {
    deps.log?.(`[tutor] voz natural indisponível: ${status.pending}`);
    throw new TutorError("A voz natural não está ligada no servidor.", 503);
  }
  const src = await deps.db.service<SpeechSource>("ch_worker_tutor_speech", {
    p_user: userId, p_session_id: req.sessionId, p_kind: req.kind, p_message_id: req.messageId, p_personality: req.personalityId,
  });
  // o aceite vem primeiro, antes de "não encontrada" e do aviso de plano: sem ele nada é lido nem gerado
  if (src?.consent_pending) throw consentError();
  if (!src?.found) throw new TutorError(req.kind === "phrase" ? "Professor não encontrado." : "Fala não encontrada.", 404);
  if (!src.config!.enabled || !src.config!.voice_enabled) throw new TutorError("A voz do Tutor está desligada.", 503);
  if (src.quota?.mode === "blocked") throw new TutorError(TRIAL_OVER, 403);
  const raw = req.kind === "phrase" ? phraseText(req.phrase ?? "", req.letter, src.sample ?? null) : src.text;
  if (!raw) throw new TutorError("Frase inválida.", 400);
  const text = speechInput(raw);
  const voice: VoiceProfile = { ...(src.voice ?? {}), personality: src.personality, direction: speechDirectionFromState(src.emotion) };
  const key = SpeechCache.key(provider, voice, text);
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };
  if ((src.quota?.used_today ?? 0) + text.length > DAILY_CHARS()) throw new TutorError("Você chegou ao limite de voz natural de hoje. O professor continua falando com a voz do aparelho.", 429);
  let out: SpeechAudio;
  try {
    out = await provider.synthesize(text, voice);
  } catch (error) {
    deps.log?.(`[tutor] falha do serviço de voz: ${(error as Error).message.slice(0, 200)}`);
    throw new TutorError("A voz natural falhou agora. O professor fala com a voz do aparelho.", 502);
  }
  await deps.db.service("ch_worker_tutor_voice_charge", { p_user: userId, p_chars: text.length, p_cost: speechCost(text.length, provider.pricePerMinute) });
  cache.set(key, out);
  return { ...out, cached: false };
}
