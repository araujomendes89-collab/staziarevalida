/**
 * TUTOR NEXUS: regras da voz do professor que valem para toda rota (a leitura da fala, a conversa pela voz e o painel).
 *
 * A voz do professor (uma voz oficial por professor) fala com o aluno quando: a voz do Tutor está ligada no painel, a voz
 * daquele professor está configurada no servidor, a versão aprovada no painel é a mesma que está no ar (a equipe ouve antes
 * da aprovação, para medir os tempos), "só equipe" está desligado (ou quem pede é da equipe) e ainda há caracteres do aluno no
 * dia e da conta no dia e no mês. As mensagens não nomeiam fornecedor.
 */
import { PROFESSOR_CHANGED, TutorError, consentError, type TutorDeps } from "./engine";
import { CHARS_PER_MINUTE } from "./speech";
import { elevenLabsReadiness, officialVoiceForPersonality, type Approval, type ReadinessRow } from "./officialVoices";
import { hangup, reasonError, voiceReady } from "./realtime";
import { sttConfig, studentMicOpen } from "./stt";
import { tutorSettings } from "./settings";
import type { OfficialVoice } from "../../src/shared/tutor/officialVoices";

export type ElevenBlock = "voice_off" | "not_configured" | "not_approved" | "team_only" | "student_limit" | "account_day" | "account_month";

/** O que o banco diz da voz do professor para este aluno (tutor_tts_quota, migração …5700). */
export interface TtsQuota {
  consent_pending: boolean;
  enabled: boolean;
  mode: "trial" | "paid" | "blocked";
  staff: boolean;
  voice_enabled: boolean;
  team_only: boolean;
  limit_today: number;
  used_today: number;
  remaining_today: number;
  account_day_left: number;
  account_month_left: number;
  reserve_can: boolean;
  reserve_remaining_s: number;
  approvals: Partial<Record<OfficialVoice, Approval>>;
}

/** A voz do professor pode falar agora `need` caracteres? Os motivos vêm nesta ordem. */
export function elevenAccessOf(i: { quota: TtsQuota; row: ReadinessRow | null; need?: number }): { ok: boolean; reason: ElevenBlock | null } {
  const { quota, row } = i;
  const need = i.need ?? 1;
  const no = (reason: ElevenBlock) => ({ ok: false, reason });
  if (!quota.voice_enabled) return no("voice_off");
  if (!row?.ready) return no("not_configured");
  if (!quota.staff && quota.approvals?.[row.id]?.fingerprint !== row.fingerprint) return no("not_approved");
  if (!quota.staff && quota.team_only) return no("team_only");
  if (quota.remaining_today < need) return no("student_limit");
  if (quota.account_day_left < need) return no("account_day");
  if (quota.account_month_left < need) return no("account_month");
  return { ok: true, reason: null };
}

export const VOICE_BLOCK_ERROR: Record<ElevenBlock, { status: number; code: string; message: string }> = {
  voice_off: { status: 503, code: "voice_disabled", message: "A voz do Tutor está desligada." },
  not_configured: { status: 409, code: "voice_unavailable", message: "A voz do professor não está disponível agora." },
  not_approved: { status: 409, code: "voice_unavailable", message: "A voz do professor não está disponível agora." },
  team_only: { status: 409, code: "voice_unavailable", message: "A voz do professor não está disponível agora." },
  student_limit: { status: 429, code: "voice_student_limit", message: "Você usou sua voz de hoje" },
  account_day: { status: 429, code: "voice_account_day", message: "A voz da plataforma acabou por hoje" },
  account_month: { status: 429, code: "voice_account_month", message: "A voz da plataforma acabou neste mês" },
};

/** Erro da rota com o código que o aplicativo usa para escolher o que mostrar (voz reserva, por escrito, aviso). */
export const voiceBlockError = (reason: ElevenBlock) => {
  const e = VOICE_BLOCK_ERROR[reason];
  return Object.assign(new TutorError(e.message, e.status), { code: e.code });
};

/** Minutos inteiros de fala (900 caracteres = 1 minuto): o "Voz hoje: X min". */
export const minutesOf = (chars: number) => Math.floor(Math.max(0, chars) / CHARS_PER_MINUTE);

// ---------------------------------------------------------------- os jeitos da conversa
/** Voz do professor (eleven), voz reserva ao vivo (reserva) ou por escrito (escrito): a tela mostra "Voz do professor",
 * "Voz reserva" ou "Por escrito", sem nomear fornecedor. */
export type Jeito = "eleven" | "reserva" | "escrito";

/** Os quatro professores, na ordem dos cartões: Stazi (Durão, Tranquilo) e Stazia (Durona, Tranquila). */
export const NEXUS_PROFESSORS = ["durao", "acolhedor", "durona", "tranquila"] as const;

export interface NexusStatus {
  voice_enabled: boolean;
  stt: boolean;
  reserve: boolean;
  reserve_minutes: number;
  minutes_today: number;
  professors: { id: string; eleven: boolean; sample: boolean; reason: ElevenBlock | null }[];
}

export interface NexusOpen {
  jeito: Jeito;
  voice_call_id: string | null;
  mic: boolean;
  reason: ElevenBlock | null;
  minutes_today: number;
  reserve_minutes: number;
}

const quotaOf = (deps: TutorDeps, userId: string) => deps.db.service<TtsQuota>("ch_worker_tutor_tts_quota", { p_user: userId });
const rowFor = (deps: TutorDeps, quota: TtsQuota, personality: string) => {
  const id = officialVoiceForPersonality(personality);
  return id ? elevenLabsReadiness(deps.elevenEnv ?? process.env, quota.approvals ?? {}).rows.find((r) => r.id === id) ?? null : null;
};
const minutesToday = (q: TtsQuota) => minutesOf(Math.min(q.remaining_today, q.account_day_left, q.account_month_left));
const reserveOf = (deps: TutorDeps, q: TtsQuota) => ({
  reserve: voiceReady(deps).ready && q.reserve_can && q.reserve_remaining_s >= 15,
  reserve_minutes: Math.floor(Math.max(0, q.reserve_remaining_s) / 60),
});
const sttReady = (deps: TutorDeps) => (deps.stt ?? sttConfig()).ready;
/**
 * Microfone da voz do professor e do "por escrito" (transcrição no servidor). CF02: equipe sempre; aluno só quando o dono abriu a
 * chave e preencheu os tetos diários (studentMicOpen). A voz reserva fica de fora: o microfone dela vai do navegador direto à voz ao
 * vivo, com limites próprios no banco.
 */
const micOf = async (deps: TutorDeps, q: TtsQuota) => sttReady(deps) && (q.staff === true || studentMicOpen(await tutorSettings(deps), q.mode));

/** O que a entrada da Nexus mostra: por professor, se a voz do professor vale agora e se há amostra para o "Ouvir". */
export async function nexusStatus(deps: TutorDeps, userId: string): Promise<NexusStatus> {
  const q = await quotaOf(deps, userId);
  if (q?.consent_pending) throw consentError();
  const { reserve, reserve_minutes } = reserveOf(deps, q);
  return {
    voice_enabled: q.voice_enabled, stt: await micOf(deps, q), reserve, reserve_minutes, minutes_today: minutesToday(q),
    professors: NEXUS_PROFESSORS.map((id) => {
      const row = rowFor(deps, q, id);
      const access = elevenAccessOf({ quota: q, row });
      const approval = row ? q.approvals?.[row.id] : null;
      return { id, eleven: access.ok, sample: Boolean(access.ok && row?.approved && approval?.sample_path), reason: access.reason };
    }),
  };
}

const SPOKEN_LIMITS = new Set(["student_limit", "account_day", "account_month"]);

/**
 * Abre a conversa da Nexus e escolhe o jeito: voz do professor quando ela vale e há caracteres; senão a voz reserva ao vivo
 * (o aplicativo abre pela rota de sempre) quando houver tempo; senão por escrito. A chamada "tts" (trava de turno) abre na voz do
 * professor e no "por escrito" com a voz ligada no painel. skip: no meio da conversa, "eleven" pula a voz do professor (ela
 * parou) e "voice" pula as duas (a reserva não roda: microfone bloqueado ou sem tempo ao vivo).
 */
export type NexusSkip = "eleven" | "voice";
export async function openNexus(deps: TutorDeps, userId: string, sessionId: string, force: boolean, skip: NexusSkip | null = null): Promise<NexusOpen> {
  const ctx = await deps.db.service<{ consent_pending?: boolean; session: { read_only?: boolean }; personality: { id: string } } | null>(
    "ch_worker_tutor_context", { p_user: userId, p_session_id: sessionId });
  if (!ctx) throw new TutorError("Conversa não encontrada.", 404);
  if (ctx.consent_pending) throw consentError();
  if (ctx.session.read_only) throw new TutorError(PROFESSOR_CHANGED, 409);
  const q = await quotaOf(deps, userId);
  const base = { minutes_today: minutesToday(q), reserve_minutes: reserveOf(deps, q).reserve_minutes };
  if (!q.voice_enabled) return { jeito: "escrito", voice_call_id: null, mic: false, reason: "voice_off", ...base };
  const tts = async (spoken: boolean) => {
    const r = await deps.db.service<{ ok: boolean; reason?: string; voice_call_id?: string; replaced_call_id?: string | null; replaced_provider?: string | null }>(
      "ch_worker_tutor_tts_open", { p_user: userId, p_session_id: sessionId, p_force: force, p_spoken: spoken });
    // a ligação ao vivo que a Nexus assumiu (outra aba) é desligada pelo servidor
    if (r.ok && r.replaced_call_id) void hangup(r.replaced_call_id, deps, r.replaced_provider ?? "realtime");
    return r;
  };
  const access = elevenAccessOf({ quota: q, row: rowFor(deps, q, ctx.personality.id) });
  let reason = access.reason;
  if (access.ok && !skip) {
    const r = await tts(true);
    if (r.ok) return { jeito: "eleven", voice_call_id: r.voice_call_id!, mic: await micOf(deps, q), reason: null, ...base };
    if (!SPOKEN_LIMITS.has(r.reason ?? "")) throw reasonError(r.reason, null);
    reason = r.reason as ElevenBlock;
  }
  if (skip !== "voice" && reserveOf(deps, q).reserve) return { jeito: "reserva", voice_call_id: null, mic: true, reason, ...base };
  const r = await tts(false);
  if (!r.ok) throw reasonError(r.reason, null);
  return { jeito: "escrito", voice_call_id: r.voice_call_id!, mic: await micOf(deps, q), reason, ...base };
}
