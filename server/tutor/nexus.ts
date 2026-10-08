/**
 * TUTOR NEXUS: regras da voz do professor que valem para toda rota (a leitura da fala, a conversa pela voz e o painel).
 *
 * A voz do professor (uma voz oficial por professor) fala com o aluno quando: a voz do Tutor está ligada no painel, a voz
 * daquele professor está configurada no servidor, a versão aprovada no painel é a mesma que está no ar (a equipe ouve antes
 * da aprovação, para medir os tempos), "só equipe" está desligado (ou quem pede é da equipe) e ainda há caracteres do aluno no
 * dia e da conta no dia e no mês. As mensagens não nomeiam fornecedor.
 */
import { TutorError } from "./engine";
import { CHARS_PER_MINUTE } from "./speech";
import type { Approval, ReadinessRow } from "./officialVoices";
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
