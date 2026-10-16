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
 *   - tentativa repetida não paga de novo: o que este pedido já fez fica no ponto de retomada (ids e gasto), gravado logo depois
 *     de cada chamada paga, e não é refeito; o gasto das tentativas anteriores conta no teto;
 *   - cancelar vence: se o pedido deixou de estar ativo (cancelado ou fechado), a passagem para "analisando" é recusada pelo
 *     banco e o processamento para sem chamar a IA;
 *   - parada por falta de configuração (IA desligada, teto da Central) com parte feita deixa o pedido "pendente" e retomável;
 *     falha de item ou parada de segurança do pedido encerra com o que foi feito.
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

interface Resume {
  cost_usd?: number;
  calls?: number;
  /** Análise: questões que este pedido já fez. */
  done_ids?: string[];
  /** Conferência: rascunhos que este pedido já conferiu, por camada. */
  layer_done?: Record<string, string[]>;
}

export async function runAiRequest(
  deps: PipelineDeps,
  job: Job,
  io: { checkpoint(data: Record<string, unknown>): Promise<void>; metrics: Record<string, unknown> }
): Promise<void> {
  const requestId = job.scope_key.startsWith("ai_request:") ? job.scope_key.slice("ai_request:".length) : "";
  if (!requestId) throw new AiRequestFailed("Tarefa sem identificação do pedido.");
  const db = deps.db;
  const update = (patch: Record<string, unknown>) => db.service<boolean | null>("ch_worker_ai_request_update", { p_request_id: requestId, p_patch: patch });
  const row = await db.service<RequestRow | null>("ch_worker_ai_request_get", { p_request_id: requestId });
  if (!row) throw new AiRequestFailed("Pedido não encontrado.");
  if (FINAL.includes(row.status)) return; // já terminou ou foi cancelado: nada a fazer
  if (row.kind !== (job.step as string)) throw new AiRequestFailed("O pedido não é desta etapa.");

  // o cancelamento vence: se o pedido deixou de estar ativo entre a leitura e agora, o banco recusa e aqui para, sem chamar a IA
  if ((await update({ status: "analisando", message: null })) !== true) return;

  const cp = (job.checkpoint ?? {}) as Resume;
  const ceiling = num(row.ceiling_usd);
  const prior = { cost: Number(cp.cost_usd ?? 0) || 0, calls: Number(cp.calls ?? 0) || 0 }; // de tentativas anteriores
  const live = { cost: 0, calls: 0 }; // desta tentativa
  const total = row.item_count;
  const mockProvider = deps.ai.provider?.isMock ? deps.ai.provider : null;
  const maxCostUsd = ceiling == null ? null : ceiling - prior.cost;

  const doneIds = new Set<string>(cp.done_ids ?? []);
  const layerDone: Record<string, Set<string>> = Object.fromEntries(Object.entries(cp.layer_done ?? {}).map(([k, v]) => [k, new Set(v)]));
  const layers = (row.params.layers ?? ["software"]).filter((l) => ["software", "sources", "currency", "redteam"].includes(l)) as Layer[];
  let pendingDone = 0; // rascunhos que já passaram por todas as camadas (conferência)

  const resume = () => ({
    cost_usd: prior.cost + live.cost,
    calls: prior.calls + live.calls,
    done_ids: [...doneIds],
    layer_done: Object.fromEntries(Object.entries(layerDone).map(([k, v]) => [k, [...v]])),
  });
  const doneNow = () => (row.kind === "question_analysis" ? doneIds.size : pendingDone);
  // o gasto e o que já foi feito vão para o ponto de retomada e para o pedido LOGO depois de cada chamada paga (antes de gravar o
  // resultado), para uma falha seguinte não repetir a cobrança nem esquecer o gasto
  const persist = async () => {
    await io.checkpoint(resume());
    await update({ done_count: doneNow(), calls: prior.calls + live.calls, cost_usd: prior.cost + live.cost });
  };
  const onSpend = async (d: { calls: number; costUsd: number }) => {
    live.calls += d.calls;
    live.cost += d.costUsd;
    await persist();
  };

  const finish = async (o: { done: number; failed: number; pending: string | null; stop: boolean; retryable: boolean; summary: Record<string, unknown> }) => {
    const calls = prior.calls + live.calls;
    const cost = prior.cost + live.cost;
    io.metrics.ai_calls = calls;
    io.metrics.cost_usd = cost;
    const patch = { done_count: o.done, skipped_count: o.failed, calls, cost_usd: cost, summary: o.summary };
    if (o.retryable && o.pending) {
      // falta de configuração (IA desligada, teto da Central), com ou sem parte feita: espera e continua de onde parou
      await update({ ...patch, status: "pendente", message: o.pending.slice(0, 1000) });
      throw new AiRequestPending(o.pending);
    }
    if (o.done === 0 && (o.failed > 0 || o.stop || o.pending)) {
      const why = o.pending ?? "A IA não conseguiu concluir nenhum item.";
      await update({ ...patch, status: "falhou", message: why.slice(0, 1000) });
      throw new AiRequestFailed(why);
    }
    const left = total - o.done;
    const message = o.pending ? `${o.done} de ${total} concluídos. ${o.pending}` : left > 0 ? `${o.done} de ${total} concluídos; ${left} já estavam prontos ou deixaram de valer e foram pulados.` : null;
    await update({ ...patch, status: "concluido", message: message?.slice(0, 1000) ?? null });
  };

  if (row.kind === "question_analysis") {
    const report = await runQuestionAnalysis(
      { db, mockProvider, aiMaker: deps.aiMaker, log: deps.log, onSpend },
      {
        ids: row.target_ids,
        // o que este pedido já refez numa tentativa anterior não entra de novo (nem conta como feito por engano)
        skipIds: [...doneIds],
        onlyMissing: row.params.only_missing !== false,
        maxCostUsd,
        onProgress: async (r) => {
          for (const id of r.savedIds) doneIds.add(id);
          await persist();
        },
      }
    );
    for (const id of report.savedIds) doneIds.add(id);
    await io.checkpoint(resume());
    await finish({
      done: doneIds.size, failed: report.skipped, pending: report.pending ?? null, stop: report.stop === "seguranca",
      retryable: Boolean(report.pending) && !report.stop && report.skipped === 0, summary: { verdicts: report.verdicts },
    });
    return;
  }

  // conferência dos rascunhos: software sempre; fontes, atualidade e revisão clínica se pedidas
  const track = (rs: RunReport[]) => {
    for (const r of rs) {
      const set = (layerDone[r.layer] ??= new Set<string>());
      for (const id of r.savedIds) set.add(id);
    }
    // rascunhos que passaram por TODAS as camadas pedidas: o que não precisa de trabalho nesta camada já está pronto
    pendingDone = Math.min(total, ...rs.map((r) => total - Math.max(r.considered - r.saved, 0)));
  };
  const reports = await runDraftChecks(
    { db, mockProvider, aiMaker: deps.aiMaker, log: deps.log, embedder: deps.embedder, crossCompany: true, onSpend },
    {
      layers,
      ids: row.target_ids,
      force: row.params.recheck === true,
      skip: Object.fromEntries(Object.entries(layerDone).map(([k, v]) => [k, [...v]])) as Partial<Record<Layer, string[]>>,
      maxCostUsd,
      onProgress: async (rs: RunReport[]) => {
        track(rs);
        await persist();
      },
    }
  );
  track(reports);
  await io.checkpoint(resume());
  // trilha dos rascunhos (Questões StaziaMed): uma linha "conferida" por rascunho conferido neste pedido, no texto que ainda vale
  // (o banco descarta se o texto mudou). Falha aqui nunca derruba o pedido: a conferência já está gravada.
  const touched = new Set<string>();
  for (const r of reports) for (const id of r.savedIds) touched.add(id);
  for (const id of touched) {
    try {
      const d = await db.service<{ content_hash?: string } | null>("ch_worker_draft_for_job", { p_draft_id: id });
      if (d?.content_hash) await db.service("ch_worker_draft_checked", { p_draft_id: id, p_hash: d.content_hash, p_summary: { origem: "pedido pela tela", pedido: row.id, camadas: layers } });
    } catch (error) {
      deps.log?.(`trilha do rascunho ${id}: ${(error as Error).message}`);
    }
  }
  const stopped = reports.find((r) => r.pending);
  const pending = stopped?.pending ?? null;
  const summary = { layers: Object.fromEntries(reports.map((r) => [r.layer, { saved: r.saved, verdicts: r.verdicts, pending: r.pending ?? null }])) };
  await finish({
    done: stopped ? pendingDone : total, failed: reports.some((r) => r.failed) ? 1 : 0, pending, stop: reports.some((r) => r.stop === "seguranca"),
    retryable: Boolean(stopped) && !reports.some((r) => r.stop || r.failed), summary,
  });
}
