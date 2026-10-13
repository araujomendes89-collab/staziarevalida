/**
 * Processamento das questões parecidas (etapa `similarity` da fila ch_jobs; migração 20261003009910). Sem documento.
 *
 *   modo "motor" (Reprocessar na Administração, ou a fila automática quando a função está ligada):
 *     1. atualiza as impressões digitais de todas as questões (só o que mudou fica pendente);
 *     2. vetores (Gemini Embedding 2, embeddings.ts) SÓ com a função "Questões parecidas" ligada na Central de IAs E a busca por
 *        significado pronta no servidor; sem isso, nada vai ao Google e o motor segue por palavras, perfil e taxonomia;
 *     3. para cada questão pendente: candidatas no banco (texto igual, equivalentes, palavras, taxonomia/tema, vetores), decisão
 *        no servidor (engine.ts) e gravação dos pares (proposta); nada de comparar todas com todas.
 *   modo "ia" (Classificar pares duvidosos, pedido do administrador): manda os pares de confiança baixa para a IA da função
 *     `similaridade` (maestro: liga e desliga, preço, teto e registro em ai_calls). A IA nunca aprova.
 *
 * Toda execução fica em similarity_runs (questões, vetores, pares, tokens, custo e tempo). Função desligada ou teto de gasto
 * deixam o trabalho parado sem gastar tentativa (Blocked); a retomada não refaz o que já foi gravado (cada questão gravada sai
 * da lista de pendentes, cada par reclassificado sai da lista de duvidosos).
 */
import crypto from "crypto";
import type { Job, PipelineDeps } from "../pipeline";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMS, EmbeddingsError, embedderAllowed, type Embedder } from "../embeddings";
import { loadAiConfig } from "../../ai/config";
import { runFunction } from "../../ai/maestro";
import { decideAll, ENGINE_VERSION, type Candidate, type QuestionSide } from "./engine";
import {
  checkClassifierOutput, CLASSIFIER_PROMPT_ID, CLASSIFIER_PROMPT_VERSION, CLASSIFIER_SCHEMA, CLASSIFIER_SYSTEM, classifierInput, PAIRS_PER_CALL,
  type DoubtfulPair,
} from "./classifier";

/** Falta configuração (função desligada, teto): o trabalho fica parado, sem gastar tentativa. */
export class SimilarityPending extends Error {}
/** Falha que nova tentativa não resolve. */
export class SimilarityFailed extends Error {}

/** Versão do formato dos textos que viram vetor (fica em cada vetor; mudar refaz os vetores). */
export const EMBED_TEXT_VERSION = "q1";
export const FUNCTION_OFF = 'A função "Questões parecidas" está desligada na Central de IAs.';
const EMBED_BATCH = 50;
const QUESTION_BATCH = 25;
const TOP_K = 20;

interface Totals {
  questions: number;
  embedded: number;
  relations_new: number;
  relations_changed: number;
  relations_removed: number;
  ai_pairs: number;
  tokens: number;
  cost_usd: number;
}

interface CandidatesResult {
  question: QuestionSide & { basis_hash: string | null; has_vectors: boolean };
  candidates: Candidate[];
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function runSimilarity(
  deps: PipelineDeps,
  job: Job,
  io: { checkpoint(data: Record<string, unknown>): Promise<void>; metrics: Record<string, unknown> }
): Promise<Totals & { run_id: string }> {
  const db = deps.db;
  const t0 = Date.now();
  const cp = (job.checkpoint ?? {}) as Record<string, any>;
  const mode: "motor" | "ia" = cp.mode === "ia" ? "ia" : "motor";
  const model = deps.embedder?.model ?? DEFAULT_EMBEDDING_MODEL;
  const begin = await db.service<{ run_id: string; changed: number; function_on: boolean }>("ch_worker_similarity_begin", {
    p_job_id: job.id, p_mode: mode, p_engine: ENGINE_VERSION, p_model: model, p_run_id: cp.run_id ?? null,
  });
  const runId = begin.run_id;
  // o que tentativas anteriores desta execução já fizeram continua contando
  const totals: Totals = {
    questions: num(cp.questions), embedded: num(cp.embedded), relations_new: num(cp.relations_new), relations_changed: num(cp.relations_changed),
    relations_removed: num(cp.relations_removed), ai_pairs: num(cp.ai_pairs), tokens: num(cp.tokens), cost_usd: num(cp.cost_usd),
  };
  const notes: string[] = [];
  const save = async () => {
    await io.checkpoint({ ...cp, run_id: runId, ...totals });
    await db.service("ch_worker_similarity_finish", { p_run_id: runId, p_patch: { ...totals } });
  };
  const finish = async (status: "concluida" | "falhou" | "pendente", message: string | null) => {
    Object.assign(io.metrics, { similarity: { ...totals, run_id: runId }, cost_usd: totals.cost_usd });
    await db.service("ch_worker_similarity_finish", {
      p_run_id: runId, p_patch: { ...totals, status, message, duration_ms: Date.now() - t0, details: { notes } },
    });
  };

  try {
    if (mode === "ia") await classify(deps, runId, cp, totals, save, notes);
    else {
      const cfg = await loadAiConfig(db);
      const on = Boolean(cfg.functions.similaridade);
      const embedder = on ? await embedderAllowed(db, deps.embedder) : null;
      if (!on) notes.push("Vetores: a função \"Questões parecidas\" está desligada na Central de IAs (nada foi enviado ao Google).");
      else if (!embedder) notes.push("Vetores: a busca por significado não está pronta neste processamento (nada foi enviado ao Google).");
      if (embedder) await embedQuestions(deps, embedder, job, totals, save, notes);
      await computeRelations(deps, runId, model, totals, save);
    }
    await finish("concluida", notes.join(" ") || null);
    return { ...totals, run_id: runId };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    await finish(error instanceof SimilarityPending ? "pendente" : "falhou", message.slice(0, 1000)).catch(() => undefined);
    throw error;
  }
}

/** Vetores das questões que ainda não têm (ou cujo texto mudou), em lotes, com o custo registrado. */
async function embedQuestions(deps: PipelineDeps, embedder: Embedder, job: Job, totals: Totals, save: () => Promise<void>, notes: string[]) {
  const db = deps.db;
  for (;;) {
    const batch = await db.service<{ question_id: string; kind: string; text: string; basis_hash: string }[]>("ch_worker_similarity_to_embed", {
      p_model: embedder.model, p_version: EMBED_TEXT_VERSION, p_limit: EMBED_BATCH,
    });
    if (!batch?.length) return;
    let r: Awaited<ReturnType<Embedder["embedDocuments"]>>;
    try {
      r = await embedder.embedDocuments(batch.map((b) => ({ title: null, text: b.text })));
    } catch (error) {
      // erro do Google (configuração, crédito): os pares seguem sem vetor e o motivo fica na execução
      if (error instanceof EmbeddingsError) {
        notes.push(`Vetores parados: ${error.message.slice(0, 300)}`);
        return;
      }
      throw error;
    }
    if (r.vectors.length !== batch.length || r.vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIMS)) {
      notes.push(`Vetores parados: o Google devolveu ${r.vectors.length} vetor(es) para ${batch.length} texto(s) ou um vetor fora do tamanho.`);
      return;
    }
    const saved = await db.service<number>("ch_worker_similarity_save_embeddings", {
      p_model: embedder.model, p_version: EMBED_TEXT_VERSION,
      p_items: batch.map((b, i) => ({ question_id: b.question_id, kind: b.kind, basis_hash: b.basis_hash, embedding: r.vectors[i] })),
    });
    await db
      .service("ch_worker_log_ai_run", {
        p_run: {
          job_id: job.id, step: "embeddings", provider: "gemini", model: embedder.model, prompt_id: "question_embedding", prompt_version: EMBED_TEXT_VERSION,
          schema_version: `${EMBEDDING_DIMS}d`, input_hash: crypto.createHash("sha256").update(batch.map((b) => `${b.question_id}:${b.kind}:${b.basis_hash}`).join(",")).digest("hex"),
          status: "ok", output: { texts: batch.length, saved }, input_tokens: r.tokens, output_tokens: 0, cost_usd: r.costUsd, latency_ms: r.latencyMs,
        },
      })
      .catch(() => undefined);
    totals.embedded += saved;
    totals.tokens += r.tokens;
    totals.cost_usd = Math.round((totals.cost_usd + r.costUsd) * 1e6) / 1e6;
    await save();
    if (!saved) return; // nada gravado (questões apagadas no meio do caminho): não insiste no mesmo lote
  }
}

/** Pares das questões pendentes (mudaram, ganharam vetor, versão nova do motor ou pedidas pela equipe). */
async function computeRelations(deps: PipelineDeps, runId: string, model: string, totals: Totals, save: () => Promise<void>) {
  const db = deps.db;
  const done = new Set<string>();
  for (;;) {
    const ids = await db.service<string[]>("ch_worker_similarity_pending", { p_model: model, p_engine: ENGINE_VERSION, p_limit: QUESTION_BATCH });
    const fresh = (ids ?? []).filter((id) => !done.has(id));
    if (!fresh.length) return; // acabou (ou só sobraram as que já foram feitas nesta execução)
    for (const id of fresh) {
      done.add(id);
      const ctx = await db.service<CandidatesResult | null>("ch_worker_similarity_candidates", { p_question_id: id, p_model: model, p_k: TOP_K });
      if (!ctx?.question) continue;
      const decisions = decideAll(ctx.question, ctx.candidates ?? []);
      const basis = `${ctx.question.basis_hash ?? ""}:${ctx.question.has_vectors ? "v" : "l"}:${ENGINE_VERSION}`;
      const r = await db.service<{ new: number; changed: number; removed: number } | null>("ch_worker_similarity_save", {
        p_question_id: id, p_basis: basis, p_engine: ENGINE_VERSION, p_run_id: runId, p_items: decisions,
      });
      totals.questions++;
      totals.relations_new += r?.new ?? 0;
      totals.relations_changed += r?.changed ?? 0;
      totals.relations_removed += r?.removed ?? 0;
    }
    await save(); // sinal de vida e números parciais a cada lote
  }
}

/** Pares duvidosos → IA da função `similaridade` (só com a função configurada). */
async function classify(deps: PipelineDeps, runId: string, cp: Record<string, any>, totals: Totals, save: () => Promise<void>, notes: string[]) {
  const db = deps.db;
  const cfg = await loadAiConfig(db);
  // desligada depois do pedido: o pedido não fica parado esperando (sem tentativa nova); o administrador liga e pede de novo
  if (!cfg.functions.similaridade && !deps.ai.provider?.isMock) throw new SimilarityFailed(`${FUNCTION_OFF} Ligue a função e peça a classificação de novo.`);
  const limit = Math.min(Math.max(Number(cp.limit) || 20, 1), 100);
  const left = Math.max(limit - totals.ai_pairs, 0);
  if (!left) return;
  const pairs = await db.service<DoubtfulPair[]>("ch_worker_similarity_doubtful", { p_limit: left });
  const maestro = { db, mockProvider: deps.ai.provider?.isMock ? deps.ai.provider : null, makeProviderFor: deps.aiMaker, log: deps.log };
  let failures = 0;
  for (let i = 0; i < pairs.length; i += PAIRS_PER_CALL) {
    const chunk = pairs.slice(i, i + PAIRS_PER_CALL);
    const res = await runFunction<unknown>(
      maestro, "similaridade",
      { promptId: CLASSIFIER_PROMPT_ID, promptVersion: CLASSIFIER_PROMPT_VERSION, system: CLASSIFIER_SYSTEM, input: classifierInput(chunk), schema: CLASSIFIER_SCHEMA, schemaName: "similaridade_pares", maxOutputTokens: 4096 },
      { source: "similaridade", itemId: runId }
    );
    totals.cost_usd = Math.round((totals.cost_usd + num(res.costUsd)) * 1e6) / 1e6;
    if (res.status === "parou_no_teto") {
      await save();
      throw new SimilarityPending(res.message ?? "Teto de gasto da Central de IAs atingido.");
    }
    const items = res.output != null ? checkClassifierOutput(res.output, chunk) : [];
    if (!items.length) {
      failures++;
      notes.push(`IA sem resposta válida para ${chunk.length} par(es)${res.message ? `: ${res.message.slice(0, 200)}` : ""}.`);
      await save();
      if (failures >= 2) break; // duas falhas seguidas: para e deixa o resto para outro pedido
      continue;
    }
    failures = 0;
    const model = res.outputs.find((o) => o.output != null)?.ref.model ?? null;
    totals.ai_pairs += await db.service<number>("ch_worker_similarity_save_ai", {
      p_run_id: runId,
      p_items: items.map((it) => ({ id: it.id, relation: it.relacao, confidence: it.confianca, reason: it.justificativa, model })),
    });
    await save();
  }
}
