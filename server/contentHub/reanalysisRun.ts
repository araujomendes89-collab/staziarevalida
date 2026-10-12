/**
 * Reanálise das questões que esperam depois que uma fonte oficial mudou (SQIE, fase 4), sem comando de terminal (CC18).
 *
 * Quem chama é o processamento (a tarefa do Google Cloud Run, a cada rodada) e, no desenvolvimento, o servidor depois do pedido
 * do administrador. A rodada só acontece quando:
 *   - o administrador pediu pelo botão "Reanalisar agora" (pedido manual), ou
 *   - a chave "Análise automática" está ligada na Configuração.
 * A IA só PROPÕE: a proposta fica na atualização da questão e nada vai ao aluno sem a decisão de um revisor médico. A IA, o modelo
 * e os tetos vêm da Central de IAs (runQuestionReanalysis passa pelo maestro). O resultado fica no banco para a tela mostrar.
 */
import type { PipelineDeps } from "./pipeline";
import type { StructuredRequest } from "./ai/provider";
import { runQuestionReanalysis, type ReanalysisReport } from "./questionReanalysis";

/** Questões por rodada: o pedido manual faz um lote maior que a rodada automática. */
export const AUTO_LIMIT = 10;
export const MANUAL_LIMIT = 20;

export interface ScheduledReanalysis {
  ran: boolean;
  manual: boolean;
  report?: ReanalysisReport;
  /** Banco sem a atualização 9872: nada a fazer (o site novo convive com o banco antigo). */
  unavailable?: boolean;
}

const missingFunction = (error: unknown) => /ch_worker_reanalysis_(claim|done)/.test((error as Error).message ?? "") && /does not exist|could not find|schema cache/i.test((error as Error).message ?? "");

/** `mockRespond` é só para testes (IA simulada): no uso real nunca é informado. */
export async function runScheduledReanalysis(deps: Pick<PipelineDeps, "db" | "aiMaker" | "log"> & { mockRespond?: (req: StructuredRequest) => unknown }): Promise<ScheduledReanalysis> {
  let claim: { run: boolean; manual: boolean } | null;
  try {
    claim = await deps.db.service<{ run: boolean; manual: boolean } | null>("ch_worker_reanalysis_claim");
  } catch (error) {
    if (missingFunction(error)) return { ran: false, manual: false, unavailable: true };
    throw error;
  }
  if (!claim?.run) return { ran: false, manual: Boolean(claim?.manual) };
  let report: ReanalysisReport;
  try {
    report = await runQuestionReanalysis({ db: deps.db, aiMaker: deps.aiMaker, log: deps.log, mockRespond: deps.mockRespond }, { limit: claim.manual ? MANUAL_LIMIT : AUTO_LIMIT });
  } catch (error) {
    // a falha fica visível na tela (em português) em vez de sumir no registro do servidor
    await deps.db.service("ch_worker_reanalysis_done", { p_summary: { considered: 0, saved: 0, skipped: 0, pending: "A rodada não terminou. Tente de novo mais tarde." } }).catch(() => undefined);
    throw error;
  }
  await deps.db.service("ch_worker_reanalysis_done", {
    p_summary: { considered: report.considered, saved: report.saved, skipped: report.skipped, verdicts: report.verdicts, pending: report.pending ?? null, calls: report.spend.calls, cost_usd: report.spend.costUsd },
  });
  return { ran: true, manual: claim.manual, report };
}
