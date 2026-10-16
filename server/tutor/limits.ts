/**
 * TRAVAS DE GASTO DA VOZ (Fase 0, 2026-10-14; auditoria L2 e L4). Duas coisas, sempre no servidor:
 *
 *   - limite de frequência por aluno, contado NO BANCO (ch_worker_tutor_rate_hit, migração …012800): vale para todas as instâncias da
 *     Vercel ao mesmo tempo. Tipos: ferramentas da voz, avaliação do raciocínio (IA de texto), delegação do GPT-Live e falas
 *     transcritas. Os números ficam no painel (tutor_config.voice_rate_limits);
 *   - a chave geral "IA desligada" (aiAllowed: ambiente e sinalizador ai_enabled do painel), que antes só valia no turno de texto e
 *     agora vale também ao abrir e renovar a voz, nas ferramentas e na transcrição.
 */
import { aiAllowed } from "../contentHub/ai/registry";
import { TutorError, type TutorDeps } from "./engine";

export type RateBucket = "voice_tool" | "voice_eval" | "voice_delegate" | "voice_transcript";

export const RATE_LIMITED = "Muitos pedidos seguidos. Espere um pouco e tente de novo.";
export const RATE_LIMITED_DAY = "Você chegou ao limite de uso da voz de hoje. Amanhã tem mais.";
/** Mesma frase do turno de texto quando a IA está desligada (o aluno não vê o motivo; a equipe vê no registro). */
export const AI_OFF = "O Tutor está indisponível no momento.";

/** Conta um pedido do aluno; passou do limite do minuto ou do dia: 429 com o código voice_rate (nada é gasto). */
export async function rateHit(deps: Pick<TutorDeps, "db">, userId: string, bucket: RateBucket): Promise<void> {
  const r = await deps.db.service<{ ok: boolean; reason?: string; retry_after_s?: number | null } | null>("ch_worker_tutor_rate_hit", { p_user: userId, p_bucket: bucket });
  if (r && r.ok === false) {
    throw Object.assign(new TutorError(r.reason === "per_day" ? RATE_LIMITED_DAY : RATE_LIMITED, 429), { code: "voice_rate", retry_after_s: r.retry_after_s ?? null });
  }
}

/** A IA pode ser usada agora? Desligada no ambiente ou no painel: 503 com o código ai_off, antes de qualquer gasto. */
export async function assertAiAllowed(deps: Pick<TutorDeps, "db" | "log">): Promise<void> {
  const allowed = await aiAllowed(deps.db);
  if (allowed.ok) return;
  deps.log?.(`[tutor] IA bloqueada: ${allowed.why}`);
  throw Object.assign(new TutorError(AI_OFF, 503), { code: "ai_off" });
}
