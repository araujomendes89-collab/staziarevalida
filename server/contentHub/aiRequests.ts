/**
 * Pedidos de IA feitos pela tela (migração 20261003009810): análise de questões históricas e conferência dos rascunhos inéditos.
 *
 * Cada pedido (ch_ai_requests) vira uma tarefa da fila (ch_jobs, sem documento, etapa question_analysis ou draft_check). Aqui
 * o processamento roda SÓ as questões ou os rascunhos congelados no pedido, com as funções que já existiam por linha de comando
 * (runQuestionAnalysis e runDraftChecks), e grava o andamento e o gasto no pedido. A IA vem da Central de IAs (maestro: liga e
 * desliga, modelo por função, registro de chamadas em ai_calls).
 *
 * Regras:
 *   - nada é publicado nem aprovado: a análise nasce "rascunho de IA" e depois "conferida por regras"; a conferência dos
 *     rascunhos é só triagem; o gabarito oficial não é tocado (a conferência por software barra a análise que o contesta);
 *   - IA desligada, função sem IA ou teto de gasto deixam o pedido "pendente" e a tarefa parada, sem gastar tentativa;
 *   - parada de segurança: se o gasto real passar do teto do pedido (o dobro do pior caso estimado), o processamento para;
 *   - tentativa repetida não paga de novo: o que já foi gravado não é refeito (o pedido só roda o que ainda falta).
 */
import { runQuestionAnalysis } from "./questionAnalysis";
import { runDraftChecks, type Layer, type RunReport } from "./draftChecks";
import type { Job, PipelineDeps } from "./pipeline";

/** Falta configuração (IA desligada, teto): o pedido fica pendente e a tarefa parada, sem gastar tentativa. */
export class AiRequestPending extends Error {}
/** Falha que nova tentativa não resolve. */
export class AiRequestFailed extends Error {}

interface RequestRow {
  id: string;
  kind: "question_analysis" | "draft_check";
  status: string;
  params: { only_missing?: boolean; layers?: string[]; recheck?: boolean };
  target_ids: string[];
  item_count: number;
  ceiling_usd: number | string | null;
}

const FINAL = ["concluido", "falhou"];
const num = (v: unknown) => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function runAiRequest(
  deps: PipelineDeps,
  job: Job,
  io: { checkpoint(data: Record<string, unknown>): Promise<void>; metrics: Record<string, unknown> }
): Promise<void> {
  const requestId = job.scope_key.startsWith("ai_request:") ? job.scope_key.slice("ai_request:".length) : "";
  if (!requestId) throw new AiRequestFailed("Tarefa sem identificação do pedido.");
  const db = deps.db;
  const update = (patch: Record<string, unknown>) => db.service("ch_worker_ai_request_update", { p_request_id: requestId, p_patch: patch });
  const row = await db.service<RequestRow | null>("ch_worker_ai_request_get", { p_request_id: requestId });
  if (!row) throw new AiRequestFailed("Pedido não encontrado.");
  if (FINAL.includes(row.status)) return; // já terminou ou foi cancelado: nada a fazer
  if (row.kind !== (job.step as string)) throw new AiRequestFailed("O pedido não é desta etapa.");

  await update({ status: "analisando", message: null });
  const ceiling = num(row.ceiling_usd);
  const before = Number((job.checkpoint as { cost_usd?: number } | undefined)?.cost_usd ?? 0); // gasto de tentativas anteriores
  const mockProvider = deps.ai.provider?.isMock ? deps.ai.provider : null;
  const cp = (job.checkpoint ?? {}) as { started?: boolean; cost_usd?: number; calls?: number };

  const finish = async (done: number, calls: number, cost: number, summary: Record<string, unknown>, pending: string | null, failed: number) => {
    io.metrics.ai_calls = calls;
    io.metrics.cost_usd = cost;
    const total = row.item_count;
    const patch = { done_count: done, skipped_count: failed, calls, cost_usd: cost, summary };
    if (done < total && pending && done === 0 && failed === 0) {
      // nada foi feito por falta de configuração: pendente, a tarefa espera
      await update({ ...patch, status: "pendente", message: pending.slice(0, 1000) });
      throw new AiRequestPending(pending);
    }
    if (done === 0 && failed > 0) {
      const why = pending ?? "A IA não conseguiu concluir nenhum item.";
      await update({ ...patch, status: "falhou", message: why.slice(0, 1000) });
      throw new AiRequestFailed(why);
    }
    const message = done < total ? `${done} de ${total} concluídos. ${pending ?? ""}`.trim() : null;
    await update({ ...patch, status: "concluido", message: message?.slice(0, 1000) ?? null });
  };

  if (row.kind === "question_analysis") {
    const report = await runQuestionAnalysis(
      { db, mockProvider, aiMaker: deps.aiMaker, log: deps.log },
      {
        ids: row.target_ids,
        // na repetição de uma tentativa que caiu no meio, o que já foi gravado não se refaz
        onlyMissing: cp.started ? true : row.params.only_missing !== false,
        maxCostUsd: ceiling == null ? null : ceiling - before,
        onProgress: async (r) => {
          await io.checkpoint({ started: true, cost_usd: before + (r.spend.costUsd ?? 0), calls: r.spend.calls });
          await update({ done_count: r.saved, calls: r.spend.calls, cost_usd: before + (r.spend.costUsd ?? 0) });
        },
      }
    );
    await io.checkpoint({ started: true, cost_usd: before + (report.spend.costUsd ?? 0), calls: report.spend.calls });
    // a tentativa repetida só conta o que falta: o que já estava gravado entra como feito
    const done = Math.min(row.item_count, report.saved + Math.max(row.item_count - report.considered, 0));
    await finish(done, report.spend.calls, before + (report.spend.costUsd ?? 0), { verdicts: report.verdicts }, report.pending ?? null, report.skipped);
    return;
  }

  // conferência dos rascunhos: software sempre; fontes, atualidade e revisão clínica se pedidas
  const layers = (row.params.layers ?? ["software"]).filter((l) => ["software", "sources", "currency", "redteam"].includes(l)) as Layer[];
  const reports = await runDraftChecks(
    { db, mockProvider, aiMaker: deps.aiMaker, log: deps.log, embedder: deps.embedder, crossCompany: true },
    {
      layers,
      ids: row.target_ids,
      force: cp.started ? false : row.params.recheck === true,
      maxCostUsd: ceiling == null ? null : ceiling - before,
      onProgress: async (rs: RunReport[]) => {
        const cost = before + rs.reduce((a, r) => a + (r.spend.costUsd ?? 0), 0);
        await io.checkpoint({ started: true, cost_usd: cost, calls: rs.reduce((a, r) => a + r.spend.calls, 0) });
        await update({ done_count: Math.max(0, ...rs.map((r) => r.saved)), calls: rs.reduce((a, r) => a + r.spend.calls, 0), cost_usd: cost });
      },
    }
  );
  const calls = reports.reduce((a, r) => a + r.spend.calls, 0);
  const cost = before + reports.reduce((a, r) => a + (r.spend.costUsd ?? 0), 0);
  await io.checkpoint({ started: true, cost_usd: cost, calls });
  const pending = reports.find((r) => r.pending)?.pending ?? null;
  // feito = rascunhos que passaram por todas as camadas pedidas (o que já valia antes também conta)
  const done = reports.every((r) => !r.pending) ? row.item_count : Math.min(...reports.map((r) => r.saved + Math.max(row.item_count - r.considered, 0)));
  const summary = { layers: Object.fromEntries(reports.map((r) => [r.layer, { saved: r.saved, verdicts: r.verdicts, pending: r.pending ?? null }])) };
  await finish(done, calls, cost, summary, pending, 0);
}
