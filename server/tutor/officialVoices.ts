import { createHash } from "node:crypto";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, scenariosFor, type OfficialVoice } from "../../src/shared/tutor/officialVoices";
import { PERSONAGENS } from "../../src/novo/app/tutor/personagens/personagens.js";
import { SPEECH_PROFILES, SPEED_RANGE, TAG_RULES } from "./speechDirector";
import { googleAiAccess } from "../ai/googleKey";
import { ACABAMENTO_VERSAO, LUFS_ALVO, MP3_KBPS, PICO_MAX_DB } from "./vozAcabamento";
import { PRONUNCIAS, PRONUNCIA_VERSAO } from "./pronuncia";

// Apenas servidor. Não importar este módulo em src/ (o catálogo público fica em src/shared).
/** Aprovação de uma voz no painel (tutor_voice_approvals): vale só para a mesma versão (fingerprint). */
export interface Approval { fingerprint: string; approved_at: string; sample_path: string | null }
/**
 * pending: o aviso em português simples que a equipe lê na tela. detail: o detalhe técnico (nome da variável do servidor etc.),
 * que a tela mostra escondido, para quem configura o servidor (VZ04).
 */
export interface ReadinessRow { id: OfficialVoice; label: string; configured: boolean; unique: boolean; ready: boolean; approved: boolean; fingerprint: string; pending: string | null; detail: string | null }

/**
 * UMA VOZ POR PERSONAGEM NO APP INTEIRO (decisão do dono, 17/10/2026; voz do professor unificada em 18/10/2026): a voz que lê as
 * respostas do Tutor é a MESMA da voz ao vivo e das frases de espera, a do personagem em personagens.js (`voz.gemini` e
 * `voz.semitons`): Stazi = Gemini "Zubenelgenubi" afinado +3 semitons; Stazia = Gemini "Kore". Gerada pelo Gemini TTS
 * (GEMINI_TTS_MODEL) pelo Vertex (VERTEX_API_KEY; sem ela, a chave do AI Studio).
 *
 * A ElevenLabs ficou como RESERVA DESLIGADA: só fala com TUTOR_VOICE_ENGINE=elevenlabs no servidor, e só com as variáveis novas
 * (ELEVENLABS_VOICE_STAZI e _STAZIA). As vozes antigas (ELEVENLABS_VOICE_TRANQUILO, _DURONA…) não valem mais, nem de reserva.
 */
export type VoiceEngine = "gemini" | "elevenlabs";
export const voiceEngine = (env: NodeJS.ProcessEnv = process.env): VoiceEngine =>
  (env.TUTOR_VOICE_ENGINE ?? "").trim().toLowerCase() === "elevenlabs" ? "elevenlabs" : "gemini";

/** O modelo de TTS homologado (o mesmo das frases de espera). Trocar de modelo é mudança de código: nova audição e aprovação. */
export const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";
export const GEMINI_FORMAT = `mp3_24000_${MP3_KBPS}`;

/** Voz e afinação de cada personagem: as de personagens.js, as mesmas da voz ao vivo. */
export function geminiVoiceOf(id: OfficialVoice): { voice: string; semitons: number } {
  const v = PERSONAGENS[id].voz;
  return { voice: v.gemini, semitons: v.semitons };
}

/** ElevenLabs (reserva): só as variáveis de hoje, uma por personagem. */
const ENV_NAMES = {
  stazi: "ELEVENLABS_VOICE_STAZI", stazia: "ELEVENLABS_VOICE_STAZIA",
} as const;
export const OFFICIAL_VOICE_KEYS = Object.keys(OFFICIAL_VOICES) as OfficialVoice[];
export const validVoiceId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{10,128}$/.test(value);

/**
 * A voz oficial de cada personalidade vem do PERSONAGEM: Stazi (Durão e Tranquilo) e Stazia (Durona e Tranquila). Aceita também
 * o próprio id do personagem e os ids antigos (tranquilo, preguiçoso, durona), que continuam resolvendo para a voz do personagem.
 * O Direto saiu e não tem voz.
 */
export function officialVoiceForPersonality(id: string | undefined): OfficialVoice | null {
  if (id === "durao" || id === "acolhedor" || id === "preguicoso" || id === "tranquilo") return "stazi";
  if (id === "durona" || id === "tranquila") return "stazia";
  return OFFICIAL_VOICE_KEYS.includes(id as OfficialVoice) ? id as OfficialVoice : null;
}

export function elevenLabsConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const voices = Object.fromEntries(OFFICIAL_VOICE_KEYS.map((id) => [id, (env[ENV_NAMES[id]] ?? "").trim()])) as Record<OfficialVoice, string>;
  return {
    voices,
    model: (env.ELEVENLABS_MODEL_ID || env.TUTOR_VOICE_MODEL || "eleven_v3").trim(),
    format: (env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128").trim(),
  };
}

/**
 * O que forma a versão de uma voz. Gemini: o serviço, o modelo, a voz, a afinação, o formato, o acabamento (volume e teto), a
 * pronúncia dos nomes (pronuncia.ts), o perfil e os cenários de audição. ElevenLabs (reserva): o voice_id, o modelo, o formato, o perfil, os cenários e a direção do
 * Speech Director. Mudar qualquer parte pede nova audição e nova aprovação.
 */
export function fingerprintParts(id: OfficialVoice, env: NodeJS.ProcessEnv = process.env) {
  const scenarios = scenariosFor(id).map((k) => [k, VOICE_SCENARIOS[k]] as [string, unknown]);
  if (voiceEngine(env) === "gemini") {
    const g = geminiVoiceOf(id);
    return {
      id, engine: "gemini" as const, model: GEMINI_TTS_MODEL, voice: g.voice, semitons: g.semitons, format: GEMINI_FORMAT,
      finish: { version: ACABAMENTO_VERSAO, lufs: LUFS_ALVO[id], peakDb: PICO_MAX_DB },
      pronunciation: { version: PRONUNCIA_VERSAO, words: PRONUNCIAS }, profile: OFFICIAL_VOICES[id], scenarios,
    };
  }
  const c = elevenLabsConfiguration(env);
  return {
    id, engine: "elevenlabs" as const, voiceId: c.voices[id], model: c.model, format: c.format, profile: OFFICIAL_VOICES[id], scenarios,
    direction: { profiles: SPEECH_PROFILES, tags: TAG_RULES, speed: SPEED_RANGE },
  };
}
export const fingerprintOf = (parts: unknown) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const voiceFingerprint = (id: OfficialVoice, env: NodeJS.ProcessEnv = process.env) => fingerprintOf(fingerprintParts(id, env));

const NO_KEY = "A chave de acesso da voz do professor ainda não foi configurada no servidor.";
const NOT_ALLOWED: [string, string] = ["O envio do texto para gerar a voz ainda não foi autorizado no servidor.", "Defina TUTOR_VOICE_ALLOW_EXTERNAL=1 no servidor."];

export interface VoiceReadiness { engine: VoiceEngine; model: string; keyConfigured: boolean; pending: string | null; detail: string | null; rows: ReadinessRow[] }

/** Situação de cada voz, no serviço escolhido. Cada uma vale sozinha: aprovada a da Stazia, ela fala, mesmo sem a do Stazi. */
export function voiceReadiness(env: NodeJS.ProcessEnv = process.env, approvals: Partial<Record<OfficialVoice, Approval>> = {}): VoiceReadiness {
  const engine = voiceEngine(env);
  let model: string;
  let keyConfigured: boolean;
  let pending: string | null = null;
  let detail: string | null = null;
  let voiceOf: (id: OfficialVoice) => string;
  let own: (id: OfficialVoice, configured: boolean, unique: boolean) => [string | null, string | null];
  if (engine === "gemini") {
    model = GEMINI_TTS_MODEL;
    keyConfigured = Boolean(googleAiAccess(env));
    if (!keyConfigured) [pending, detail] = [NO_KEY, "Configure VERTEX_API_KEY no servidor."];
    else if (env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1") [pending, detail] = NOT_ALLOWED;
    voiceOf = (id) => geminiVoiceOf(id).voice;
    own = (id, configured, unique) => !configured ? [`A voz de ${OFFICIAL_VOICES[id].label} ainda não foi definida.`, "Defina voz.gemini do personagem em personagens.js."]
      : !unique ? ["Cada personagem precisa de uma voz própria: há vozes repetidas.", "As vozes voz.gemini do Stazi e da Stazia (personagens.js) devem ser diferentes."]
      : [null, null];
  } else {
    const config = elevenLabsConfiguration(env);
    model = config.model;
    const key = env.ELEVENLABS_API_KEY?.trim() ?? "";
    keyConfigured = key.length >= 20 && !/^(your|my_|changeme|xxx|sk-\.\.\.)/i.test(key);
    if (!keyConfigured) [pending, detail] = [NO_KEY, "Configure ELEVENLABS_API_KEY no servidor."];
    else if (env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1") [pending, detail] = NOT_ALLOWED;
    else if (!["eleven_v3", "eleven_multilingual_v2"].includes(config.model)) [pending, detail] = ["O modelo de voz configurado não foi homologado. Use um dos dois modelos aprovados e teste de novo.", "Use eleven_v3 ou eleven_multilingual_v2 (ELEVENLABS_MODEL_ID)."];
    else if (config.format !== "mp3_44100_128") [pending, detail] = ["O formato de áudio configurado não é o homologado para a audição.", "Use ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128."];
    voiceOf = (id) => config.voices[id];
    own = (id, configured, unique) => !configured ? [`A voz de ${OFFICIAL_VOICES[id].label} ainda não foi cadastrada no servidor.`, `Configure ${ENV_NAMES[id]} com o voice_id salvo.`]
      : !unique ? ["Cada personagem precisa de uma voz própria: há vozes repetidas.", `Os voice_id de ${OFFICIAL_VOICE_KEYS.map((other) => ENV_NAMES[other]).join(", ").replace(/, ([^,]*)$/, " e $1")} devem ser diferentes entre si.`]
      : [null, null];
  }
  const valid = (v: string) => engine === "gemini" ? /^[A-Z][a-z]{2,30}$/.test(v ?? "") : validVoiceId(v);
  const rows = OFFICIAL_VOICE_KEYS.map((id): ReadinessRow => {
    const configured = valid(voiceOf(id));
    const unique = configured && OFFICIAL_VOICE_KEYS.every((other) => other === id || voiceOf(other) !== voiceOf(id));
    const fingerprint = voiceFingerprint(id, env);
    const approval = approvals[id];
    const approved = Boolean(configured && unique && approval?.fingerprint === fingerprint && Number.isFinite(Date.parse(approval.approved_at)));
    const [p, d] = own(id, configured, unique);
    return { id, label: OFFICIAL_VOICES[id].label, configured, unique, approved, fingerprint,
      ready: !pending && configured && unique,
      pending: pending || p, detail: pending ? detail : d,
    };
  });
  return { engine, model, keyConfigured, pending, detail, rows };
}
