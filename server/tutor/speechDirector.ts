/**
 * Direção de voz do Stazia Tutor.
 *
 * O motor do Tutor decide o conteúdo e o estado emocional. Esta camada só converte esse estado em
 * parâmetros de atuação do provedor de voz. Ela não recebe texto livre, não cria conteúdo e não
 * permite que o modelo de linguagem injete tags como [angry] ou [laughs].
 */

export interface SpeechDirection {
  emotion?: string;
  intensity?: number;
  speed?: number;
}

export interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
}

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const round = (n: number) => Math.round(n * 100) / 100;

/** Perfil de atuação por humor (entra na versão de cada voz: mudar aqui pede nova audição). */
export const SPEECH_PROFILES: Record<string, { stability: number; style: number; speed: number }> = {
  neutral: { stability: 0.72, style: 0.08, speed: 0 },
  pleased: { stability: 0.62, style: 0.18, speed: 0.02 },
  encouraged: { stability: 0.58, style: 0.22, speed: 0.03 },
  impressed: { stability: 0.5, style: 0.3, speed: 0.04 },
  impatient: { stability: 0.48, style: 0.3, speed: 0.04 },
  irritated: { stability: 0.38, style: 0.46, speed: 0.06 },
  angry: { stability: 0.3, style: 0.58, speed: 0.08 },
  disappointed: { stability: 0.56, style: 0.22, speed: -0.02 },
  // Nexus: a Durona firme no 1º erro e o alívio no acerto depois de errar (sem marcação: vem do ritmo e do estilo)
  firm: { stability: 0.6, style: 0.24, speed: 0.02 },
  relieved: { stability: 0.62, style: 0.3, speed: -0.04 },
};
const PROFILE = SPEECH_PROFILES;

/** Marcações do eleven_v3 escolhidas pelo Stazia (nunca pelo texto da IA), a partir de que intensidade. */
export const TAG_RULES = {
  minIntensity: 0.4,
  durona: { angry: "[angry]", irritated: "[frustrated]", impatient: "[frustrated]" },
  tranquilo: { irritated: "[sighs]", impatient: "[sighs]", disappointed: "[sighs]" },
  good: { pleased: "[encouraging]", encouraged: "[encouraging]", impressed: "[encouraging]" },
} as const;

/** Faixa de ritmo das vozes oficiais. */
export const SPEED_RANGE = [0.85, 1.12] as const;

/** Estado mínimo que o banco persiste e que o diretor precisa para atuar. */
export function speechDirectionFromState(raw: Record<string, unknown> | null | undefined): SpeechDirection {
  const emotion = typeof raw?.mood === "string" && PROFILE[raw.mood] ? raw.mood : "neutral";
  const moodIntensity = ["pleased", "encouraged", "impressed"].includes(emotion)
    ? Number(raw?.enthusiasm)
    : Number(raw?.frustration);
  const intensity = Number.isFinite(moodIntensity) ? round(clamp(moodIntensity / 100)) : 0;
  const explicitSpeed = Number(raw?.speechRate);
  return {
    emotion,
    intensity,
    ...(Number.isFinite(explicitSpeed) ? { speed: round(clamp(explicitSpeed, 0.75, 1.25)) } : {}),
  };
}

/** Traduz a direção semântica para o contrato do ElevenLabs, mantendo a fala inteligível. */
export function elevenLabsVoiceSettings(direction: SpeechDirection = {}): ElevenLabsVoiceSettings {
  const requestedEmotion = direction.emotion ?? "neutral";
  const emotion = PROFILE[requestedEmotion] ? requestedEmotion : "neutral";
  const profile = PROFILE[emotion];
  const intensity = clamp(Number.isFinite(direction.intensity) ? Number(direction.intensity) : 0);
  const requestedSpeed = Number.isFinite(direction.speed) ? Number(direction.speed) : 1;
  return {
    stability: round(clamp(profile.stability - intensity * 0.18)),
    similarity_boost: 0.82,
    style: round(clamp(profile.style + intensity * 0.28)),
    use_speaker_boost: true,
    speed: round(clamp(requestedSpeed + profile.speed * intensity, 0.75, 1.25)),
  };
}
