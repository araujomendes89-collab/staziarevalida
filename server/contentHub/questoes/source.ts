/**
 * "Buscar fonte oficial" (etapa `question_source`, uma tarefa por rascunho e versão): para cada afirmação que a questão precisa
 * sustentar (a decisão clínica e cada frase da resposta e das explicações com número), procura trechos de fontes OFICIAIS e pede
 * à IA de verificação o que sustenta. Só vale trecho LITERAL (`isVerbatim`) com os mesmos números e as mesmas negações.
 *
 * O resultado é uma PROPOSTA por afirmação (citação, ou "não encontrada"); quem usa é uma pessoa da equipe (`app_draft_source_accept`).
 * Nada é gravado direto no rascunho e nenhum conteúdo médico sai da memória do modelo.
 */
import { Blocked } from "../jobErrors";
import { aiAllowed } from "../ai/registry";
import { AiCapReached, maestroRoleProvider } from "../../ai/maestro";
import type { Job, PipelineDeps } from "../pipeline";
import { callAi, type Answerer, type DraftRow, type RunDeps, type Spend } from "../draftChecks";
import { isVerbatim, negations, normalize, numbers, numbersOutside } from "../checks";
import { searchOfficialPassages } from "./passages";
import type { StaziaCitation } from "./types";

export interface SourceClaim {
  kind: "decisao_clinica" | "numero";
  text: string;
}
export interface ProposalClaim extends SourceClaim {
  status: "encontrada" | "nao_encontrada";
  citation: StaziaCitation | null;
  reason: string | null;
}

const MAX_CLAIMS = 8;

/** A decisão clínica primeiro; depois cada frase da resposta correta e das explicações que traga número. Sem repetir; até 8. */
export function sourceClaims(d: Pick<DraftRow, "clinical_decision" | "alternatives" | "correct_answer" | "explanation" | "alternative_explanations">): SourceClaim[] {
  const out: SourceClaim[] = [];
  const seen = new Set<string>();
  const add = (kind: SourceClaim["kind"], text: string) => {
    const t = normalize(text);
    const key = t.toLowerCase();
    if (!t || seen.has(key) || out.length >= MAX_CLAIMS) return;
    seen.add(key);
    out.push({ kind, text: t });
  };
  add("decisao_clinica", d.clinical_decision ?? "");
  const texts = [d.alternatives?.[d.correct_answer] ?? "", d.explanation ?? "", ...["A", "B", "C", "D"].map((l) => d.alternative_explanations?.[l] ?? "")];
  for (const text of texts) {
    for (const sentence of normalize(text).split(/(?<=[.;!?])\s+/)) {
      if (numbers(sentence).length) add("numero", sentence);
    }
  }
  return out;
}

type Evidence = { verdict: string; passage_id: string; quote: string; rationale: string };

/** Uma proposta por afirmação. `complete` = a decisão clínica e todos os números têm citação. */
export async function proposeSources(
  deps: RunDeps,
  d: DraftRow,
  creatorModel: string | null,
  spend: Spend,
  /** Conferido antes de cada chamada de IA: false = o rascunho mudou, para sem gastar mais. */
  shouldContinue?: () => Promise<boolean>
): Promise<{ claims: ProposalClaim[]; complete: boolean; stopped?: boolean }> {
  const mock = deps.mockProvider ?? null;
  const { provider, status } = await maestroRoleProvider({ db: deps.db, mockProvider: mock, makeProviderFor: deps.aiMaker, log: deps.log }, 0, creatorModel, { source: "conferencia", itemId: d.id });
  if (!provider) throw new Blocked(status.pending ?? "Conferente de fontes indisponível.");
  const who: Answerer = { provider: provider.name, model: provider.model };
  const claims: ProposalClaim[] = [];
  for (const claim of sourceClaims(d)) {
    if (shouldContinue && !(await shouldContinue())) return { claims, complete: false, stopped: true };
    const notFound = (reason: string): ProposalClaim => ({ ...claim, status: "nao_encontrada", citation: null, reason });
    const passages = await searchOfficialPassages(deps, claim.text, 6);
    if (!passages.length) {
      claims.push(notFound("Nenhum trecho de fonte oficial trata desta afirmação."));
      continue;
    }
    const byId = new Map(passages.map((p) => [p.passage_id, p]));
    const out = await callAi<Evidence>(
      deps, provider, "evidence",
      { afirmacao: { text: claim.text, context: { area: d.area } }, trechos: passages.map((p) => ({ passage_id: p.passage_id, source: p.source, organ: p.organ, version: p.version, section: p.section, page: p.page, text: String(p.text).slice(0, 2500) })) },
      spend, "question_source:evidence", who
    );
    const p = byId.get(out.passage_id);
    if (out.verdict !== "compatible") {
      claims.push(notFound(`Os trechos encontrados não sustentam a afirmação (${out.verdict}).`));
      continue;
    }
    if (!p || !isVerbatim(out.quote, p.text)) {
      claims.push(notFound("A citação proposta não é cópia literal do trecho: descartada."));
      continue;
    }
    const missing = numbersOutside(claim.text, [out.quote]);
    const missingNeg = negations(claim.text).filter((n) => !negations(out.quote).includes(n));
    if (missing.length || missingNeg.length) {
      claims.push(notFound(`O trecho não traz: ${[...missing, ...missingNeg].join(", ")}.`));
      continue;
    }
    claims.push({ ...claim, status: "encontrada", reason: null, citation: { passage_id: p.passage_id, source_id: p.source_id, source: p.source, organ: p.organ, version: p.version, page: p.page, quote: out.quote, supports: claim.text } });
  }
  // completa = a decisão clínica e todas as frases com número têm citação (toda afirmação de `sourceClaims` é uma das duas)
  const complete = claims.length > 0 && claims[0].kind === "decisao_clinica" && claims.every((c) => c.status === "encontrada");
  return { claims, complete };
}

/** Etapa `question_source` (escopo `qsource:<rascunho>:<hash>`). Hash diferente do atual: termina sem fazer nada. */
export async function stepQuestionSource(deps: PipelineDeps, job: Job, metrics: Record<string, unknown> & { ai_calls: number; input_tokens: number; output_tokens: number; cost_usd: number | null }): Promise<null> {
  const m = /^qsource:([0-9a-f-]{36}):([0-9a-f]{64})$/.exec(job.scope_key);
  if (!m) throw new Error(`Escopo inválido da busca de fonte: ${job.scope_key}`);
  const [, draftId, hash] = m;
  const read = () => deps.db.service<DraftRow | null>("ch_worker_draft_for_job", { p_draft_id: draftId });
  const d = await read();
  if (!d || d.content_hash !== hash) {
    metrics.descartada = "texto mudou";
    return null;
  }
  const allowed = await aiAllowed(deps.db);
  if (!allowed.ok) throw new Blocked(allowed.why);
  const runDeps: RunDeps = { db: deps.db, aiMaker: deps.aiMaker, embedder: deps.embedder, log: deps.log, mockProvider: deps.ai.provider?.isMock ? deps.ai.provider : null };
  const spend: Spend = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null };
  let result;
  try {
    result = await proposeSources(runDeps, d, d.model, spend, async () => (await read())?.content_hash === hash);
  } catch (error) {
    if (error instanceof AiCapReached) throw new Blocked(error.message);
    throw error;
  } finally {
    metrics.ai_calls += spend.calls;
    metrics.input_tokens += spend.inputTokens;
    metrics.output_tokens += spend.outputTokens;
    if (spend.costUsd != null) metrics.cost_usd = (metrics.cost_usd ?? 0) + spend.costUsd;
  }
  if (result.stopped) {
    metrics.descartada = "texto mudou";
    return null;
  }
  const id = await deps.db.service<string | null>("ch_worker_save_source_proposal", {
    p_draft_id: draftId, p_hash: hash, p_claims: result.claims, p_complete: result.complete,
    p_meta: { calls: spend.calls, cost_usd: spend.costUsd, afirmacoes: result.claims.length, encontradas: result.claims.filter((c) => c.status === "encontrada").length },
  });
  if (!id) metrics.descartada = "texto mudou";
  return null;
}
