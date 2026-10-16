/**
 * Configuração do Tutor que o servidor usa a cada turno e a cada ligação (painel → Stazia Tutor): provedor e voz, limite por
 * conversa, transcrição, motor emocional, piadas internas, nível da Durona e pronúncias. Vem do banco (ch_worker_tutor_settings)
 * com um cache curto por processo (TUTOR_SETTINGS_TTL_MS, padrão 15 s): mudança no painel vale em segundos, sem reiniciar.
 */
import type { TutorDeps } from "./engine";

export interface TutorSettings {
  enabled: boolean;
  voice_enabled: boolean;
  voice_provider: "auto" | "gemini" | "live" | "realtime";
  voice_name: string | null;
  voice_session_max_seconds: number;
  save_transcripts: boolean;
  transcript_retention_days: number;
  emotion_engine: boolean;
  inside_jokes: boolean;
  durona_level: "moderada" | "forte" | "sem_filtro";
  pronunciations: { term: string; say: string }[];
  max_profanity: "off" | "mild" | "moderate";
  /** Voz do professor (Nexus): só a equipe ouve enquanto estiver ligado. */
  tts_team_only: boolean;
  /** Caracteres de fala do professor por aluno por dia (900 = 1 minuto). */
  tts_trial_daily_chars: number;
  tts_paid_daily_chars: number;
  /** Tetos da conta inteira (dia e mês de Brasília). */
  tts_account_daily_chars: number;
  tts_account_monthly_chars: number;
  /** Preços do plano contratado (0 = ainda não preenchido: o painel avisa). */
  tts_price_per_1k_chars_usd: number;
  stt_price_per_min_usd: number;
  /** Microfone da Nexus (transcrição no servidor) só para a equipe. Nasce ligado (CF02): o aluno só fala ao microfone depois que o dono abre. */
  stt_team_only: boolean;
  /** Tetos diários da transcrição em SEGUNDOS (dia de Brasília): por aluno no teste, por aluno no plano pago e da plataforma toda. null = ainda sem valor. */
  stt_trial_daily_seconds: number | null;
  stt_paid_daily_seconds: number | null;
  stt_account_daily_seconds: number | null;
  /** Dica do Tutor nas questões do treino (interruptor do painel; a variável TUTOR_QUESTION_HINT=1 também liga). Nasce desligada. */
  question_hint_enabled: boolean;
}

export const DEFAULT_SETTINGS: TutorSettings = {
  enabled: false, voice_enabled: true, voice_provider: "auto", voice_name: null, voice_session_max_seconds: 1800, save_transcripts: true,
  transcript_retention_days: 180, emotion_engine: true, inside_jokes: true, durona_level: "forte", pronunciations: [], max_profanity: "moderate",
  tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
  tts_price_per_1k_chars_usd: 0, stt_price_per_min_usd: 0,
  stt_team_only: true, stt_trial_daily_seconds: null, stt_paid_daily_seconds: null, stt_account_daily_seconds: null,
  question_hint_enabled: false,
};

const cache = new WeakMap<object, { at: number; value: TutorSettings }>();

export async function tutorSettings(deps: Pick<TutorDeps, "db">): Promise<TutorSettings> {
  const ttl = Number(process.env.TUTOR_SETTINGS_TTL_MS ?? 15_000);
  const hit = cache.get(deps.db);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  let value = DEFAULT_SETTINGS;
  try {
    const raw = await deps.db.service<Partial<TutorSettings> | null>("ch_worker_tutor_settings", {});
    value = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  } catch {
    // banco antigo (sem a migração da voz) ou falha momentânea: segue com o padrão, que é o comportamento de antes
    value = DEFAULT_SETTINGS;
  }
  cache.set(deps.db, { at: Date.now(), value });
  return value;
}

/** Testes: esquece o cache depois de mudar a configuração. */
export const forgetTutorSettings = (deps: Pick<TutorDeps, "db">) => cache.delete(deps.db);

/** DETERMINISTIC_TUTOR=true: sem variação aleatória (testes automatizados e conferências reproduzíveis). */
export const deterministicTutor = (env: NodeJS.ProcessEnv = process.env) => /^(1|true|yes|sim)$/i.test((env.DETERMINISTIC_TUTOR ?? "").trim());
