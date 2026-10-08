/**
 * VOZ NATURAL do Stazia Tutor: transforma em áudio, no servidor, um texto que o servidor JÁ validou (fala gravada do professor,
 * a questão da conversa ou uma frase fixa do aplicativo). O navegador nunca manda texto livre para cá.
 *
 * A voz do professor é sempre a oficial (ElevenLabs, uma voz por professor; TUTOR_VOICE_PROVIDER não decide mais):
 *   TUTOR_VOICE_ALLOW_EXTERNAL=1  consentimento próprio: o texto da resposta vai para o serviço de voz
 *   ELEVENLABS_API_KEY, ELEVENLABS_VOICE_TRANQUILO / _DURONA / _DIRETO, ELEVENLABS_MODEL_ID (eleven_v3), ELEVENLABS_OUTPUT_FORMAT
 *   TUTOR_VOICE_DAILY_CHARS       teto de caracteres falados por aluno por dia (padrão 30.000, cerca de meia hora de fala)
 *
 * Sem voz natural pronta, o aplicativo usa a voz do aparelho, como antes. A voz é sempre a mesma resposta validada: só muda o som.
 */
import { createHash } from "crypto";
import { TRIAL_OVER, TutorError, consentError, type TutorDeps } from "./engine";
import { spokenText } from "./safety";
import { TUTOR_SPOKEN_LANGUAGE } from "../../src/shared/tutor/voiceLanguage";
import { speechDirectionFromState, type SpeechDirection } from "./speechDirector";
import { elevenSynth } from "./elevenlabsTts";
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
  /** Preço estimado por minuto de fala (US$), quando o provedor sabe; a voz oficial tem o preço no painel. */
  readonly pricePerMinute?: number;
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

/** Áudio PCM 16 bits mono (24 kHz) num arquivo WAV que o navegador toca. */
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

/** Voz do professor: a dos testes (deps.speech) ou a oficial, pronta quando ao menos uma voz está configurada. */
export function speechProviderFor(deps: TutorDeps): { provider: SpeechProvider | null; status: SpeechStatus } {
  if (deps.speech !== undefined) {
    const p = deps.speech;
    return { provider: p, status: { ready: Boolean(p), provider: p?.name ?? "off", model: p?.model ?? null, pending: p ? null : "Voz natural desligada." } };
  }
  const r = elevenLabsReadiness(deps.elevenEnv ?? process.env);
  const ready = !r.pending && r.rows.some((row) => row.ready);
  const status: SpeechStatus = { ready, provider: "elevenlabs", model: r.model, pending: ready ? null : r.pending ?? r.rows.find((row) => row.pending)?.pending ?? "Voz oficial não configurada." };
  return { provider: ready ? elevenSynth(deps) : null, status };
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
  await deps.db.service("ch_worker_tutor_voice_charge", { p_user: userId, p_chars: text.length, p_cost: speechCost(text.length, provider.pricePerMinute ?? 0) });
  cache.set(key, out);
  return { ...out, cached: false };
}
