/**
 * Conferência de um rascunho de Questão StaziaMed como tarefa da fila (etapa `question_check`, uma por rascunho e versão).
 *
 *   regras (software, grátis) → fontes (papel 0) → atualidade (papel 1) → revisão clínica independente (papel 2) → pedagogia (papel 2)
 *
 * Regras que valem aqui:
 *   - cada camada grava o resultado SÓ se o rascunho ainda tem o texto que foi lido (hash); se alguém editou no meio, o resultado
 *     é descartado e as chamadas de IA que faltavam não acontecem (Review Focus 4);
 *   - o conferente é de outra família que o criador (maestroRoleProvider); sem conferente a tarefa fica pendente, sem gastar tentativa;
 *   - nada aqui aprova ou publica: o resultado só informa o revisor médico.
 */
import { Blocked } from "../jobErrors";
import { aiAllowed } from "../ai/registry";
import { resolveProviderKind, type AiProvider } from "../ai/provider";
import { AiCapReached, maestroRoleProvider } from "../../ai/maestro";
import type { Job, PipelineDeps } from "../pipeline";
import {
  CHECKS_VERSION, currencyCheck, isStaziaCitation, pedagogyCheck, redteamCheck, softwareChecks, sourcesCheck, verdictOf,
  type Answerer, type DraftRow, type Finding, type Layer, type PassageInfo, type RunDeps, type Spend, type Verdict,
} from "../draftChecks";
import { passagesByIds } from "./passages";
import { maxSimilarity } from "./similarity";
import type { SimilarityCorpus, SimilarityHit } from "./types";

export interface LayerResult {
  verdict: Verdict;
  findings: Finding[];
  meta: Record<string, unknown>;
}
export type CheckLayer = Layer | "pedagogy";
export interface CheckResults {
  layers: Partial<Record<Layer, LayerResult>>;
  pedagogy: (LayerResult & { review: Record<string, unknown> }) | null;
  similarity: { official: SimilarityHit; staziamed: SimilarityHit };
  spend: Spend;
  stopped: boolean;
}

const ROLE_INDEX = { sources: 0, currency: 1, redteam: 2, pedagogy: 2 } as const;

/** Os três conferentes (papéis 0, 1 e 2), um por camada de IA. Algum sem IA ou da mesma família do criador: pendente. */
export async function resolveCheckers(deps: RunDeps, creatorModel: string | null, itemId: string): Promise<Record<"sources" | "currency" | "redteam", AiProvider>> {
  const mock = deps.mockProvider ?? (deps.mockRespond ? resolveProviderKind("mock", deps.mockRespond).provider : null);
  const out: Partial<Record<"sources" | "currency" | "redteam", AiProvider>> = {};
  for (const layer of ["sources", "currency", "redteam"] as const) {
    const { provider, status } = await maestroRoleProvider({ db: deps.db, mockProvider: mock, makeProviderFor: deps.aiMaker, log: deps.log }, ROLE_INDEX[layer], creatorModel, { source: "conferencia", itemId });
    if (!provider) throw new Blocked(status.pending ?? "Conferente indisponível.");
    out[layer] = provider;
  }
  return out as Record<"sources" | "currency" | "redteam", AiProvider>;
}

/**
 * Roda as camadas na ordem. `onLayer` é chamado depois de cada uma (e da pedagogia) e devolve `false` para parar tudo
 * (`stopped: true`, sem novas chamadas). `shouldContinue` é conferido entre as chamadas de IA da revisão clínica.
 */
export async function runCheckLayers(
  deps: RunDeps,
  d: DraftRow,
  ctx: {
    corpus: SimilarityCorpus;
    passages: Map<string, PassageInfo>;
    creatorModel: string | null;
    onLayer?: (layer: CheckLayer, r: LayerResult) => Promise<boolean>;
    shouldContinue?: () => Promise<boolean>;
  }
): Promise<CheckResults> {
  const spend: Spend = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null };
  const results: CheckResults = {
    layers: {},
    pedagogy: null,
    similarity: { official: { score: 0, id: null }, staziamed: { score: 0, id: null } },
    spend,
    stopped: false,
  };
  const checkers = await resolveCheckers(deps, ctx.creatorModel, d.id);
  const text = d.stem;
  results.similarity = { official: maxSimilarity(text, ctx.corpus.official), staziamed: maxSimilarity(text, ctx.corpus.staziamed, { excludeId: d.id }) };

  const done = async (layer: CheckLayer, r: LayerResult) => {
    if (ctx.onLayer && !(await ctx.onLayer(layer, r))) {
      results.stopped = true;
      return false;
    }
    return true;
  };
  const meta = (provider: AiProvider, who: Answerer, before: number, costBefore: number | null): Record<string, unknown> => {
    const called = spend.calls > before;
    return {
      provider: called ? who.provider : provider.name,
      model: called ? who.model : "sem chamada de IA",
      prompt_version: CHECKS_VERSION,
      cost_usd: called && spend.costUsd != null ? Math.round((spend.costUsd - (costBefore ?? 0)) * 1e5) / 1e5 : null,
    };
  };

  // 1. regras (sem IA)
  const sw = softwareChecks(d, { similarity: results.similarity, passages: ctx.passages });
  const software: LayerResult = { verdict: verdictOf(sw), findings: sw, meta: { provider: "software", model: "regras", prompt_version: CHECKS_VERSION } };
  results.layers.software = software;
  if (!(await done("software", software))) return results;

  // 2 a 4. IA
  for (const layer of ["sources", "currency", "redteam"] as const) {
    const provider = checkers[layer];
    const who: Answerer = { provider: provider.name, model: provider.model };
    const before = spend.calls;
    const costBefore = spend.costUsd;
    const r =
      layer === "redteam" ? await redteamCheck(deps, provider, d, spend, who, ctx.shouldContinue)
      : layer === "sources" ? await sourcesCheck(deps, provider, d, spend, who)
      : await currencyCheck(deps, provider, d, spend, who);
    if ((r as { stopped?: boolean }).stopped) {
      results.stopped = true;
      return results;
    }
    const lr: LayerResult = { verdict: r.verdict, findings: r.findings, meta: meta(provider, who, before, costBefore) };
    results.layers[layer] = lr;
    if (!(await done(layer, lr))) return results;
  }

  // 5. pedagogia (mesmo conferente do papel 2)
  if (ctx.shouldContinue && !(await ctx.shouldContinue())) {
    results.stopped = true;
    return results;
  }
  const provider = checkers.redteam;
  const who: Answerer = { provider: provider.name, model: provider.model };
  const before = spend.calls;
  const costBefore = spend.costUsd;
  const p = await pedagogyCheck(deps, provider, d, spend, who);
  results.pedagogy = { verdict: p.verdict, findings: p.findings, review: p.review, meta: meta(provider, who, before, costBefore) };
  await done("pedagogy", results.pedagogy);
  return results;
}

/** Os dados que a conferência precisa e que vêm do banco: a lista de comparação e os trechos citados. */
export async function loadCheckContext(deps: RunDeps, d: DraftRow): Promise<{ corpus: SimilarityCorpus; passages: Map<string, PassageInfo> }> {
  const corpus = await deps.db.service<SimilarityCorpus>("ch_worker_similarity_corpus");
  const ids = (d.source_citations ?? []).filter(isStaziaCitation).map((c) => c.passage_id);
  return { corpus, passages: await passagesByIds(deps.db, ids) };
}

/**
 * Etapa `question_check` (escopo `qcheck:<rascunho>:<hash>`). O hash é o do texto no momento do pedido: se o rascunho já mudou,
 * a tarefa termina sem chamar IA (`metrics.descartada = "texto mudou"`).
 */
export async function stepQuestionCheck(deps: PipelineDeps, job: Job, metrics: Record<string, unknown> & { ai_calls: number; input_tokens: number; output_tokens: number; cost_usd: number | null }): Promise<null> {
  const m = /^qcheck:([0-9a-f-]{36}):([0-9a-f]{64})$/.exec(job.scope_key);
  if (!m) throw new Error(`Escopo inválido da conferência: ${job.scope_key}`);
  const [, draftId, hash] = m;
  const read = () => deps.db.service<(DraftRow & { status: string }) | null>("ch_worker_draft_for_job", { p_draft_id: draftId });
  const d = await read();
  if (!d || d.content_hash !== hash) {
    metrics.descartada = "texto mudou";
    return null;
  }
  const allowed = await aiAllowed(deps.db);
  if (!allowed.ok) throw new Blocked(allowed.why);
  const runDeps: RunDeps = { db: deps.db, aiMaker: deps.aiMaker, embedder: deps.embedder, log: deps.log, mockProvider: deps.ai.provider?.isMock ? deps.ai.provider : null };
  const stillSame = async () => (await read())?.content_hash === hash;
  const { corpus, passages } = await loadCheckContext(runDeps, d);
  let results: CheckResults;
  try {
    results = await runCheckLayers(runDeps, d, {
      corpus, passages, creatorModel: d.model, shouldContinue: stillSame,
      onLayer: async (layer, r) => {
        // só grava no texto que foi lido; texto mudado: para tudo
        if (layer === "pedagogy") {
          const review = (r as LayerResult & { review?: Record<string, unknown> }).review ?? {};
          return (await deps.db.service<boolean>("ch_worker_save_pedagogy", { p_draft_id: draftId, p_hash: hash, p_review: { ...review, provider: r.meta.provider, model: r.meta.model, findings: r.findings } })) === true;
        }
        const id = await deps.db.service<string | null>("ch_worker_save_draft_check", {
          p_draft_id: draftId, p_layer: layer, p_verdict: r.verdict, p_findings: r.findings, p_meta: { ...r.meta, content_hash: hash },
        });
        return id != null;
      },
    });
  } catch (error) {
    if (error instanceof AiCapReached) throw new Blocked(error.message);
    throw error;
  }
  metrics.ai_calls += results.spend.calls;
  metrics.input_tokens += results.spend.inputTokens;
  metrics.output_tokens += results.spend.outputTokens;
  if (results.spend.costUsd != null) metrics.cost_usd = (metrics.cost_usd ?? 0) + results.spend.costUsd;
  if (results.stopped) {
    metrics.descartada = "texto mudou";
    return null;
  }
  const officialId = results.similarity.official.score > 0 ? results.similarity.official.id : null;
  await deps.db.service("ch_worker_set_draft_similarity", { p_draft_id: draftId, p_hash: hash, p_score: results.similarity.official.score, p_question_id: officialId });
  await deps.db.service("ch_worker_draft_checked", {
    p_draft_id: draftId, p_hash: hash,
    p_summary: {
      verdicts: Object.fromEntries(Object.entries(results.layers).map(([k, v]) => [k, v!.verdict])),
      pedagogy: results.pedagogy?.verdict ?? null,
      similarity: results.similarity, calls: results.spend.calls, cost_usd: results.spend.costUsd,
    },
  });
  return null;
}
