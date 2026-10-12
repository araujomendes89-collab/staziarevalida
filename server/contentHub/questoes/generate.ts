/**
 * Geração de UMA Questão StaziaMed por vaga (etapa `question_generate` da fila, uma tarefa por vaga do pedido).
 *
 *   trechos oficiais do tema → IA de criação → validações sem IA → embaralha para a letra-alvo → conferências → (uma reescrita) → rascunho
 *
 * Regras que valem aqui (spec §5.1 e §7):
 *   - nenhum conteúdo médico sai da memória do modelo: sem trecho oficial a vaga é "pulada" SEM chamar IA; a IA pode responder
 *     "evidência insuficiente" (vaga pulada com o motivo dela);
 *   - no máximo UMA reescrita por questão; vaga que ainda falha na validação é "descartada" com o motivo;
 *   - nada passa de "aguardando revisão médica": quem aprova é um revisor, quem publica é um administrador;
 *   - a IA é a da Central (função "criacao"); teto atingido ou IA desligada deixa a tarefa pendente, sem gastar tentativa.
 */
import { Blocked } from "../jobErrors";
import { aiAllowed, registerPromptsOnce } from "../ai/registry";
import { PROMPTS } from "../ai/prompts";
import { AiCapReached, maestroProvider } from "../../ai/maestro";
import type { Job, PipelineDeps } from "../pipeline";
import { callAi, type Answerer, type DraftRow, type Finding, type PassageInfo, type RunDeps, type Spend } from "../draftChecks";
import { runCheckLayers, type CheckResults } from "./check";
import { searchOfficialPassages } from "./passages";
import { shuffleToTarget } from "./shuffle";
import { validateGenerated } from "./validate";
import type { GeneratedQuestion, Letter, OfficialPassage, SimilarityCorpus, StaziaCitation } from "./types";

export interface SlotJob {
  request_id: string;
  slot: number;
  area: string;
  topic: string;
  subarea: string | null;
  competency: string | null;
  target: Letter;
  attempts: number;
  max_attempts: number;
}
export interface SlotOutcome {
  state: "gerada" | "pulada" | "descartada";
  reason: string | null;
  draft_id: string | null;
  cost_usd: number;
  calls: number;
}

interface GenerationOut {
  status: "ok" | "evidencia_insuficiente";
  reason: string | null;
  question: GeneratedQuestion | null;
}

/** Os achados que obrigam a reescrever: críticos e importantes. */
const blocking = (f: Finding[]) => f.filter((x) => x.severity === "critical" || x.severity === "major");

const rowOf = (id: string, q: GeneratedQuestion, slot: SlotJob, citations: StaziaCitation[], model: string): DraftRow => ({
  id, batch: "", source_id: "", slot: slot.slot, area: slot.area,
  stem: q.stem, alternatives: q.alternatives, correct_answer: q.correct_answer, explanation: q.explanation,
  alternative_explanations: q.alternative_explanations, source_citations: citations, update_application: null, similarity_to_official: null,
  support_type: q.support_type, support_title: q.support_title, support_rows: q.support_rows, clinical_decision: q.clinical_decision,
  model, content_hash: "", topic: slot.topic, generated_by: "servidor",
});

export async function generateSlot(deps: PipelineDeps, slot: SlotJob): Promise<SlotOutcome> {
  // gasto: as chamadas de criação e reescrita (`spend`) mais as das conferências (somadas em `cost` a cada rodada)
  const cost = { usd: 0, calls: 0 };
  const spend: Spend = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null };
  const total = () => ({ usd: cost.usd + (spend.costUsd ?? 0), calls: cost.calls + spend.calls });
  const done = (state: SlotOutcome["state"], reason: string | null, draft_id: string | null = null): SlotOutcome => ({ state, reason, draft_id, cost_usd: Math.round(total().usd * 1e5) / 1e5, calls: total().calls });

  // 1. trechos oficiais do tema; nenhum = vaga pulada, sem chamar IA
  const offered: OfficialPassage[] = await searchOfficialPassages(
    { db: deps.db, embedder: deps.embedder, log: deps.log },
    [slot.topic, slot.subarea, slot.competency].filter(Boolean).join(" "),
    8
  );
  if (!offered.length) return done("pulada", "sem fonte oficial");

  // 2. IA de criação (Central de IAs)
  const allowed = await aiAllowed(deps.db);
  if (!allowed.ok) throw new Blocked(allowed.why);
  const mockProvider = deps.ai.provider?.isMock ? deps.ai.provider : null;
  const { provider, status } = await maestroProvider({ db: deps.db, mockProvider, makeProviderFor: deps.aiMaker, log: deps.log }, "criacao", { source: "questoes_staziamed", itemId: slot.request_id });
  if (!provider) throw new Blocked(status.pending ?? "IA de criação não configurada: configure na Central de IAs.");
  await registerPromptsOnce(deps.db);
  const runDeps: RunDeps = { db: deps.db, aiMaker: deps.aiMaker, embedder: deps.embedder, log: deps.log, mockProvider };
  const who: Answerer = { provider: provider.name, model: provider.model };
  const account = (s: Spend) => {
    cost.usd += s.costUsd ?? 0;
    cost.calls += s.calls;
  };

  const vaga = { area: slot.area, tema: slot.topic, subarea: slot.subarea, competencia: slot.competency };
  const trechos = offered.map((p) => ({ passage_id: p.passage_id, fonte: p.source, orgao: p.organ, versao: p.version, secao: p.section, pagina: p.page, texto: p.text.slice(0, 3000) }));
  const corpus = await deps.db.service<SimilarityCorpus>("ch_worker_similarity_corpus");
  const passages = new Map<string, PassageInfo>(offered.map((p) => [p.passage_id, { ...p, official: true }]));
  const itemId = `pedido:${slot.request_id}:${slot.slot}`;

  try {
    // 3. criação
    let out = await callAi<GenerationOut>(runDeps, provider, "staziamed_questao", { vaga, trechos }, spend, "question_generate:criacao", who, 8192, { noCache: true });
    if (out.status !== "ok" || !out.question) return done("pulada", `evidência insuficiente${out.reason ? `: ${out.reason}` : ""}`);

    let q = out.question;
    let rewritten = false;
    let rewriteFindings: Finding[] = [];
    let validation = validateGenerated(q, { offered, corpus });
    let ready = q;
    let checks: CheckResults | null = null;

    for (;;) {
      validation = validateGenerated(q, { offered, corpus });
      const critical = validation.findings.filter((f) => f.severity === "critical");
      checks = null;
      ready = q;
      if (!critical.length) {
        // 4. embaralha para a letra-alvo e confere o texto final
        ready = shuffleToTarget(q, slot.target).question;
        checks = await runCheckLayers(runDeps, rowOf(itemId, ready, slot, validation.citations, who.model), { corpus, passages, creatorModel: who.model });
      }
      const problems = [
        ...blocking(validation.findings),
        ...(checks ? [...Object.values(checks.layers).flatMap((l) => blocking(l!.findings)), ...blocking(checks.pedagogy?.findings ?? [])] : []),
      ];
      if (checks) account(checks.spend);
      if (!problems.length || rewritten) break;

      // 5. UMA reescrita, com os achados
      out = await callAi<GenerationOut>(runDeps, provider, "staziamed_reescrita", { vaga, questao: q, achados: problems, trechos }, spend, "question_generate:reescrita", who, 8192, { noCache: true });
      rewritten = true;
      rewriteFindings = problems;
      if (out.status !== "ok" || !out.question) return done("descartada", `Reescrita sem evidência suficiente${out.reason ? `: ${out.reason}` : ""}`);
      q = out.question;
    }

    const critical = validation.findings.find((f) => f.severity === "critical");
    if (critical) return done("descartada", `Validação: ${critical.detail}`);
    if (!checks) return done("descartada", "Validação: a conferência não rodou.");

    // 6. grava o rascunho aguardando revisão médica (os achados que sobraram ficam para o revisor)
    const layerRows = Object.fromEntries(
      Object.entries(checks.layers).map(([k, v]) => [k, { verdict: v!.verdict, findings: v!.findings, provider: v!.meta.provider, model: v!.meta.model, cost_usd: v!.meta.cost_usd ?? null }])
    );
    const pedagogy = checks.pedagogy ? { ...checks.pedagogy.review, provider: checks.pedagogy.meta.provider, model: checks.pedagogy.meta.model, findings: checks.pedagogy.findings } : null;
    const embaralhado = shuffleToTarget(q, slot.target);
    const draftId = await deps.db.service<string>("ch_worker_staziamed_save_draft", {
      p_request_id: slot.request_id,
      p_slot: slot.slot,
      p_draft: {
        title: ready.title, stem: ready.stem, support_type: ready.support_type, support_title: ready.support_title, support_rows: ready.support_rows,
        alternatives: ready.alternatives, correct_answer: ready.correct_answer, explanation: ready.explanation, alternative_explanations: ready.alternative_explanations,
        clinical_decision: ready.clinical_decision, key_concepts: ready.key_concepts, source_citations: validation.citations,
        similarity_to_official: checks.similarity.official.score, similar_question_id: checks.similarity.official.score > 0 ? checks.similarity.official.id : null,
        model: who.model, topic: slot.topic,
      },
      p_checks: { ...layerRows, ...(pedagogy ? { pedagogia: pedagogy } : {}) },
      p_generation: {
        modelos: { criacao: { provider: who.provider, model: who.model }, conferencia: Object.fromEntries(Object.entries(checks.layers).map(([k, v]) => [k, { provider: v!.meta.provider, model: v!.meta.model }])) },
        prompts: {
          staziamed_questao: PROMPTS.staziamed_questao.version,
          ...(rewritten ? { staziamed_reescrita: PROMPTS.staziamed_reescrita.version } : {}),
          staziamed_pedagogia: PROMPTS.staziamed_pedagogia.version,
          checks: "draft-checks-1.0.0",
        },
        trechos_oferecidos: offered.map((p) => ({ passage_id: p.passage_id, source: p.source, organ: p.organ, version: p.version, page: p.page })),
        reescrita: { feita: rewritten, achados: rewriteFindings.map((f) => ({ severity: f.severity, code: f.code, detail: f.detail })) },
        custo_usd: Math.round(total().usd * 1e5) / 1e5,
        chamadas: total().calls,
        letra_alvo: slot.target,
        embaralhamento: { de: embaralhado.from, para: embaralhado.to },
      },
    });
    return done("gerada", null, draftId);
  } catch (error) {
    if (error instanceof AiCapReached) throw new Blocked(error.message);
    throw error;
  }
}

/**
 * Etapa `question_generate` (escopo `staziamed:<pedido>:<vaga>`). Vaga já final: não faz nada. Erro na última tentativa: a vaga
 * vira "descartada" com "Falha da IA: …" (não fica presa em "gerando") e o erro continua, para a tarefa terminar como falha.
 */
export async function stepQuestionGenerate(deps: PipelineDeps, job: Job, metrics: Record<string, unknown> & { ai_calls: number; cost_usd: number | null }): Promise<null> {
  const m = /^staziamed:([0-9a-f-]{36}):(\d+)$/.exec(job.scope_key);
  if (!m) throw new Error(`Escopo inválido da geração: ${job.scope_key}`);
  const requestId = m[1];
  const slotNo = Number(m[2]);
  const row = await deps.db.service<(Omit<SlotJob, "attempts" | "max_attempts" | "request_id" | "slot"> & { state: string }) | null>("ch_worker_staziamed_slot", { p_request_id: requestId, p_slot: slotNo });
  if (!row || row.state === "gerada" || row.state === "pulada" || row.state === "descartada") {
    metrics.vaga = row?.state ?? "inexistente";
    return null;
  }
  const slot: SlotJob = { request_id: requestId, slot: slotNo, area: row.area, topic: row.topic, subarea: row.subarea ?? null, competency: row.competency ?? null, target: row.target, attempts: job.attempts, max_attempts: job.max_attempts };
  let outcome: SlotOutcome;
  try {
    outcome = await generateSlot(deps, slot);
  } catch (error) {
    if (!(error instanceof Blocked) && job.attempts >= job.max_attempts) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.db.service("ch_worker_staziamed_slot_result", { p_request_id: requestId, p_slot: slotNo, p_state: "descartada", p_reason: `Falha da IA: ${message}`.slice(0, 500), p_draft_id: null, p_cost: 0 });
    }
    throw error;
  }
  metrics.ai_calls += outcome.calls;
  if (outcome.cost_usd) metrics.cost_usd = (metrics.cost_usd ?? 0) + outcome.cost_usd;
  metrics.vaga = outcome.state;
  await deps.db.service("ch_worker_staziamed_slot_result", { p_request_id: requestId, p_slot: slotNo, p_state: outcome.state, p_reason: outcome.reason, p_draft_id: outcome.draft_id, p_cost: outcome.cost_usd });
  return null;
}
