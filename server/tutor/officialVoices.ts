import { createHash } from "node:crypto";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, scenariosFor, type OfficialVoice } from "../../src/shared/tutor/officialVoices";
import { SPEECH_PROFILES, SPEED_RANGE, TAG_RULES } from "./speechDirector";

// Apenas servidor. Não importar este módulo em src/ (o catálogo público fica em src/shared).
/** Aprovação de uma voz no painel (tutor_voice_approvals): vale só para a mesma versão (fingerprint). */
export interface Approval { fingerprint: string; approved_at: string; sample_path: string | null }
/**
 * pending: o aviso em português simples que a equipe lê na tela. detail: o detalhe técnico (nome da variável do servidor etc.),
 * que a tela mostra escondido, para quem configura o servidor (VZ04).
 */
export interface ReadinessRow { id: OfficialVoice; label: string; configured: boolean; unique: boolean; ready: boolean; approved: boolean; fingerprint: string; pending: string | null; detail: string | null }
const ENV_NAMES = {
  direto: "ELEVENLABS_VOICE_DIRETO", durona: "ELEVENLABS_VOICE_DURONA",
  tranquilo: "ELEVENLABS_VOICE_TRANQUILO",
} as const;
const LEGACY_ENV_NAMES: Partial<Record<OfficialVoice, string>> = {
  durona: "ELEVENLABS_VOICE_DURAO",
  tranquilo: "ELEVENLABS_VOICE_PREGUICOSO",
};
export const OFFICIAL_VOICE_KEYS = Object.keys(OFFICIAL_VOICES) as OfficialVoice[];
export const validVoiceId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{10,128}$/.test(value);

/** Alias explícito: mantém o ID e o comportamento da Durona já existente no banco. */
export function officialVoiceForPersonality(id: string | undefined): OfficialVoice | null {
  // IDs antigos continuam resolvendo para a voz, mas não aparecem como perfis separados.
  if (id === "acolhedor" || id === "preguicoso") return "tranquilo";
  return OFFICIAL_VOICE_KEYS.includes(id as OfficialVoice) ? id as OfficialVoice : null;
}

export function elevenLabsConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const voices = Object.fromEntries(OFFICIAL_VOICE_KEYS.map((id) => [id,
    ((env[ENV_NAMES[id]] || (LEGACY_ENV_NAMES[id] ? env[LEGACY_ENV_NAMES[id]!] : "")) ?? "").trim(),
  ])) as Record<OfficialVoice, string>;
  return {
    voices,
    model: (env.ELEVENLABS_MODEL_ID || env.TUTOR_VOICE_MODEL || "eleven_v3").trim(),
    format: (env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128").trim(),
  };
}

/**
 * O que forma a versão de uma voz: o voice_id, o modelo, o formato, o perfil e os cenários de audição dela e a direção do
 * Speech Director (perfis, marcações e ritmo). Mudar qualquer parte pede nova audição e nova aprovação.
 */
export function fingerprintParts(id: OfficialVoice, env: NodeJS.ProcessEnv = process.env) {
  const c = elevenLabsConfiguration(env);
  return {
    id, voiceId: c.voices[id], model: c.model, format: c.format, profile: OFFICIAL_VOICES[id],
    scenarios: scenariosFor(id).map((k) => [k, VOICE_SCENARIOS[k]] as [string, unknown]),
    direction: { profiles: SPEECH_PROFILES, tags: TAG_RULES, speed: SPEED_RANGE },
  };
}
export const fingerprintOf = (parts: unknown) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const voiceFingerprint = (id: OfficialVoice, env: NodeJS.ProcessEnv = process.env) => fingerprintOf(fingerprintParts(id, env));

/** Situação de cada voz. Cada uma vale sozinha: aprovada a Durona, ela fala, mesmo sem as outras. */
export function elevenLabsReadiness(env: NodeJS.ProcessEnv = process.env, approvals: Partial<Record<OfficialVoice, Approval>> = {}): {
  model: string; keyConfigured: boolean; pending: string | null; detail: string | null; rows: ReadinessRow[];
} {
  const config = elevenLabsConfiguration(env);
  const key = env.ELEVENLABS_API_KEY?.trim() ?? "";
  const keyConfigured = key.length >= 20 && !/^(your|my_|changeme|xxx|sk-\.\.\.)/i.test(key);
  const [pending, detail]: [string | null, string | null] = !keyConfigured
    ? ["A chave de acesso da voz do professor ainda não foi configurada no servidor.", "Configure ELEVENLABS_API_KEY no servidor."]
    : env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1"
      ? ["O envio do texto para gerar a voz ainda não foi autorizado no servidor.", "Defina TUTOR_VOICE_ALLOW_EXTERNAL=1 no servidor."]
    : !["eleven_v3", "eleven_multilingual_v2"].includes(config.model)
      ? ["O modelo de voz configurado não foi homologado. Use um dos dois modelos aprovados e teste de novo.", "Use eleven_v3 ou eleven_multilingual_v2 (ELEVENLABS_MODEL_ID)."]
    : config.format !== "mp3_44100_128"
      ? ["O formato de áudio configurado não é o homologado para a audição.", "Use ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128."]
    : [null, null];
  const rows = OFFICIAL_VOICE_KEYS.map((id): ReadinessRow => {
    const configured = validVoiceId(config.voices[id]);
    const unique = configured && OFFICIAL_VOICE_KEYS.every((other) => other === id || config.voices[other] !== config.voices[id]);
    const fingerprint = voiceFingerprint(id, env);
    const approval = approvals[id];
    const approved = Boolean(configured && unique && approval?.fingerprint === fingerprint && Number.isFinite(Date.parse(approval.approved_at)));
    const own: [string | null, string | null] = !configured ? [`A voz de ${OFFICIAL_VOICES[id].label} ainda não foi cadastrada no servidor.`, `Configure ${ENV_NAMES[id]} com o voice_id salvo.`]
      : !unique ? ["Cada professor precisa de uma voz própria: há vozes repetidas.", `Os voice_id de ${OFFICIAL_VOICE_KEYS.map((other) => ENV_NAMES[other]).join(", ").replace(/, ([^,]*)$/, " e $1")} devem ser diferentes entre si.`]
      : [null, null];
    return { id, label: OFFICIAL_VOICES[id].label, configured, unique, approved, fingerprint,
      ready: !pending && configured && unique,
      pending: pending || own[0], detail: pending ? detail : own[1],
    };
  });
  return { model: config.model, keyConfigured, pending, detail, rows };
}
