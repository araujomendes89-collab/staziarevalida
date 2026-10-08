import { createHash } from "node:crypto";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, type OfficialVoice } from "../../src/shared/tutor/officialVoices";
import { ELEVENLABS_APPROVALS } from "./elevenlabsApprovals";

// Apenas servidor. Não importar este módulo em src/ (o catálogo público fica em src/shared).
export const VOICES = {
  direto: process.env.ELEVENLABS_VOICE_DIRETO,
  durona: process.env.ELEVENLABS_VOICE_DURONA || process.env.ELEVENLABS_VOICE_DURAO,
  tranquilo: process.env.ELEVENLABS_VOICE_TRANQUILO || process.env.ELEVENLABS_VOICE_PREGUICOSO,
};
const ENV_NAMES = {
  direto: "ELEVENLABS_VOICE_DIRETO", durona: "ELEVENLABS_VOICE_DURONA",
  tranquilo: "ELEVENLABS_VOICE_TRANQUILO",
} as const;
const LEGACY_ENV_NAMES: Partial<Record<OfficialVoice, string>> = {
  durona: "ELEVENLABS_VOICE_DURAO",
  tranquilo: "ELEVENLABS_VOICE_PREGUICOSO",
};
export const VOICE_DIRECTION_REVISION = "stazia-elevenlabs-2";
export const OFFICIAL_VOICE_KEYS = Object.keys(OFFICIAL_VOICES) as OfficialVoice[];
export const validVoiceId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{10,128}$/.test(value);
export const elevenLabsSelected = (env: NodeJS.ProcessEnv = process.env) => env.TUTOR_VOICE_PROVIDER?.trim().toLowerCase() === "elevenlabs";

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

export function voiceFingerprint(id: OfficialVoice, env: NodeJS.ProcessEnv = process.env) {
  const c = elevenLabsConfiguration(env);
  return createHash("sha256").update(JSON.stringify({
    id, voiceId: c.voices[id], model: c.model, format: c.format,
    revision: VOICE_DIRECTION_REVISION, profile: OFFICIAL_VOICES[id], scenarios: VOICE_SCENARIOS,
  })).digest("hex");
}

export function elevenLabsReadiness(env: NodeJS.ProcessEnv = process.env, approvals = ELEVENLABS_APPROVALS) {
  const config = elevenLabsConfiguration(env);
  const key = env.ELEVENLABS_API_KEY?.trim() ?? "";
  const keyConfigured = key.length >= 20 && !/^(your|my_|changeme|xxx|sk-\.\.\.)/i.test(key);
  const pending = !keyConfigured ? "ELEVENLABS_API_KEY não configurada no servidor."
    : env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1" ? "Autorize o envio do texto final: TUTOR_VOICE_ALLOW_EXTERNAL=1."
    : !["eleven_v3", "eleven_multilingual_v2"].includes(config.model) ? "Modelo não homologado: use eleven_v3 ou eleven_multilingual_v2 e teste novamente."
    : config.format !== "mp3_44100_128" ? "Use ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128 para a audição homologada."
    : null;
  const rows = OFFICIAL_VOICE_KEYS.map((id) => {
    const configured = validVoiceId(config.voices[id]);
    const unique = configured && OFFICIAL_VOICE_KEYS.every((other) => other === id || config.voices[other] !== config.voices[id]);
    const fingerprint = voiceFingerprint(id, env);
    const approval = approvals[id];
    const approved = Boolean(configured && unique && approval?.fingerprint === fingerprint && approval.approvedBy?.trim() && Number.isFinite(Date.parse(approval.approvedAt)));
    return { id, label: OFFICIAL_VOICES[id].label, configured, unique, approved, fingerprint,
      ready: !pending && configured && unique,
      pending: pending || (!configured ? `Configure ${ENV_NAMES[id]} com o voice_id salvo.` : !unique ? "Cada personalidade precisa de uma voz própria." : null),
    };
  });
  const allApproved = rows.every((row) => row.approved);
  const voiceCount = rows.length;
  const voiceCountText = voiceCount === 3 ? "três" : String(voiceCount);
  return { model: config.model, keyConfigured, rows, allApproved, releaseReady: !pending && allApproved,
    pending: pending || (!allApproved ? `Liberação bloqueada: as ${voiceCountText} vozes precisam ser testadas e aprovadas.` : null),
  };
}
