/**
 * SQIE, fase 1: análise de questões históricas.
 *
 * Gera, para cada questão, a análise (pergunta real, dados-chave, armadilha, regra para lembrar) e a análise
 * das QUATRO alternativas, com conferência por software. O comentário é MONTADO por software a partir da
 * análise (uma só versão do texto). Regras:
 *   - o gabarito oficial é fato dado: a IA nunca o altera e a análise que o contesta é barrada;
 *   - a análise não afirma vigência de diretriz nem cita documento: isso é papel da camada de fontes/atualidade;
 *   - nada é publicado por aqui: o aluno só vê o que um revisor médico da área aprovou.
 */
import crypto from "crypto";
import { PROMPTS, asDocument } from "./ai/prompts";
import { resolveProviderKind, type AiProvider, type StructuredRequest } from "./ai/provider";
import { AiCapReached, maestroProvider } from "../ai/maestro";
import type { ModelRef } from "../ai/config";
import { validate } from "./ai/schema";
import { normalize, numbers, numbersOutside } from "./checks";
import { ComplementarTermsUnavailable, loadComplementarTerms, mentionsSupportMaterial } from "./complementarGuard";
import type { ContentDb } from "./infra";
import { aiAllowed, registerPrompts } from "./ai/registry";
import { verdictOf, type Finding, type Spend } from "./draftChecks";

export interface QuestionForAnalysis {
  id: string;
  exam_id: string;
  exam_year: number;
  number: number;
  area: string;
  statement: string;
  correct_option: string;
  images: unknown[];
  options: { id: string; text: string; explanation: string | null }[];
  official: { answer: string | null; status: string; source: string | null } | null;
  dna: { subarea?: string; competency?: string; care_setting?: string; patient_group?: string; clinical_decision?: string; concept?: string; intent?: string; distractor_patterns?: string[]; protocol_topics?: string[] } | null;
  basis_hash: string;
}

export interface AnalysisOption {
  option_id: string;
  is_official_correct: boolean;
  distractor_kind: "CORRECT" | "WRONG" | "TRUE_BUT_NOT_BEST";
  reasoning: string;
  why_plausible: string;
  why_wrong: string;
  when_correct: string;
  concept_difference: string;
  error_types: string[];
  trap: string;
  quality: number;
}

export interface Analysis {
  question_core: string;
  key_data: { text: string; role: string }[];
  reasoning_types: string[];
  difficulty: number;
  difficulty_components: Record<string, unknown>;
  trap: string;
  golden_rule: string;
  pedagogy: { teaches: string; why_important: string; cognitive_error: string; review_if_wrong: string };
  guideline_dependency: { depends: boolean; topics: string[] };
  options: AnalysisOption[];
}

export const ANALYSIS_VERSION = "question-analysis-1.0.0";
const LETTERS = ["A", "B", "C", "D"];

// ---------------------------------------------------------------------------- conferência por software
const LAZY = /(as\s+demais\s+(alternativas\s+)?(est[ãa]o|s[ãa]o)\s+(incorretas|erradas|falsas))|(demais\s+(alternativas\s+)?incorretas)|(as\s+outras\s+(est[ãa]o|s[ãa]o)\s+(incorretas|erradas))/i;
const REFERENCE = /(portaria|pcdt|nota\s+t[ée]cnica|resolu[çc][ãa]o|diretriz[^.]{0,40}20\d\d|doi\s*:|10\.\d{4,}\/|https?:\/\/|www\.)/i;
const CURRENCY = /\b(atualmente|hoje em dia|hoje\b|vigente|em vigor|desde\s+20\d\d|a partir de\s+20\d\d|nova\s+diretriz|recomenda[çc][ãa]o\s+atual)\b/i;
export const CHALLENGE = /(gabarito[^.]{0,60}(est[áa]\s+errado|incorret|desatualizad|question[áa]vel|discut[ií]vel|deveria\s+ser)|banca\s+(errou|se\s+equivocou)|quest[ãa]o\s+(mal\s+formulada|anul[áa]vel))/i;

function analysisTexts(a: Analysis) {
  return [
    a.question_core,
    a.trap,
    a.golden_rule,
    ...Object.values(a.pedagogy ?? {}),
    ...a.key_data.map((k) => k.text),
    ...a.options.flatMap((o) => [o.reasoning, o.why_plausible, o.why_wrong, o.when_correct, o.concept_difference, o.trap]),
  ].filter(Boolean) as string[];
}

export function analysisChecks(q: QuestionForAnalysis, a: Analysis, terms: readonly string[] = []): Finding[] {
  const f: Finding[] = [];
  const add = (severity: Finding["severity"], code: string, detail: string, where?: string) => f.push({ severity, code, detail, where });
  const official = q.official?.answer ?? q.correct_option;

  // 1. quatro alternativas, uma só oficial, igual ao gabarito
  const ids = a.options.map((o) => o.option_id).sort().join("");
  if (ids !== "ABCD") add("critical", "options_incomplete", `A análise precisa cobrir exatamente A, B, C e D (veio: ${ids || "nada"}).`);
  const marked = a.options.filter((o) => o.is_official_correct).map((o) => o.option_id);
  if (marked.length !== 1) add("critical", "single_correct", `A análise marca ${marked.length} alternativa(s) como correta(s) oficial(is) (${marked.join(", ") || "nenhuma"}).`);
  else if (marked[0] !== official) add("critical", "official_answer_changed", `O gabarito oficial é ${official}, mas a análise marca ${marked[0]} como a correta: a IA não pode alterar o gabarito.`);
  for (const o of a.options) {
    if (o.option_id === official && o.distractor_kind !== "CORRECT") add("critical", "kind_mismatch", `A alternativa oficial ${o.option_id} não está classificada como CORRECT.`, o.option_id);
    if (o.option_id !== official && o.distractor_kind === "CORRECT") add("critical", "kind_mismatch", `A alternativa ${o.option_id} não é a oficial e está classificada como CORRECT.`, o.option_id);
  }

  // 2. cada distrator com análise própria (nada de "as demais estão incorretas")
  for (const o of a.options.filter((x) => x.option_id !== official)) {
    if (normalize(o.why_wrong).length < 40) add("major", "distractor_too_short", `A alternativa ${o.option_id} não explica por que está errada (menos de 40 caracteres).`, o.option_id);
    if (normalize(o.when_correct).length < 15) add("major", "no_context_where_correct", `A alternativa ${o.option_id} não diz em que situação estaria correta.`, o.option_id);
    if (normalize(o.why_plausible).length < 15) add("minor", "no_plausibility", `A alternativa ${o.option_id} não diz por que parece plausível.`, o.option_id);
    if (o.distractor_kind === "WRONG" && !o.error_types.length) add("minor", "no_error_type", `A alternativa ${o.option_id} não tem tipo de erro.`, o.option_id);
    if (o.distractor_kind === "TRUE_BUT_NOT_BEST" && !o.error_types.includes("TRUE_BUT_NOT_BEST")) add("minor", "true_not_best_untyped", `A alternativa ${o.option_id} é "verdadeira mas não é a melhor" e o tipo de erro não registra isso.`, o.option_id);
  }
  const all = analysisTexts(a).join("\n");
  if (LAZY.test(all)) add("major", "lazy_distractors", "A análise usa a fórmula 'as demais estão incorretas' em vez de analisar cada alternativa.");

  // 2b. o texto vai ao aluno: não pode citar apostila nem material complementar (nem "Sangue nos Olhos")
  const cited = mentionsSupportMaterial(all, terms);
  if (cited.length) add("critical", "cites_support_material", `A análise cita material de apoio (${cited.map((c) => `"${c}"`).join(", ")}): o aluno não vê essas fontes. Tire a citação.`);

  // 3. gabarito intocável
  if (CHALLENGE.test(all)) add("critical", "challenges_official_answer", "A análise contesta o gabarito oficial ou diz que a questão está errada/desatualizada: isso não cabe nesta etapa.");

  // 4. nada de vigência nem de documento inventado (isso é papel das camadas de fonte e de atualidade)
  const own = a.options.map((o) => `${o.reasoning} ${o.why_plausible} ${o.why_wrong} ${o.when_correct} ${o.concept_difference}`).join(" ") + ` ${a.question_core} ${a.trap} ${a.golden_rule}`;
  const base = `${q.statement} ${q.options.map((o) => o.text).join(" ")}`;
  const refs = own.match(REFERENCE);
  if (refs && !REFERENCE.test(base)) add("major", "invented_reference_risk", `A análise cita documento, norma, DOI ou link ("${refs[0]}") que não consta da questão: referência sem fonte verificada.`);
  const cur = own.match(CURRENCY);
  if (cur) add("major", "currency_claim_without_source", `A análise afirma atualidade ("${cur[0]}") sem fonte oficial vigente conferida.`);

  // 5. números que não estão na questão (dose, corte, prazo)
  const outside = numbersOutside(own, [base, q.dna?.clinical_decision ?? "", q.dna?.concept ?? ""]);
  if (outside.length) add("major", "numbers_unsupported", `Valores que não constam do enunciado, das alternativas nem da classificação: ${outside.join(", ")}.`);

  // 6. dados-chave, dificuldade, pergunta real
  if (!a.key_data.some((k) => k.role === "CRITICAL")) add("major", "no_critical_data", "Nenhum dado-chave marcado como CRITICAL.");
  const reuse = new Set(a.key_data.map((k) => normalize(k.text).toLowerCase()));
  if (reuse.size < a.key_data.length) add("minor", "duplicate_key_data", "Há dados-chave repetidos.");
  if (normalize(a.question_core).toLowerCase() === normalize(q.statement).toLowerCase().slice(0, a.question_core.length)) add("minor", "core_is_copy", "A 'pergunta real' é cópia do começo do enunciado.");
  if (a.guideline_dependency.depends && !a.guideline_dependency.topics.length) add("minor", "dependency_without_topic", "Diz depender de protocolo, mas não indica o tema.");

  // 7. dependência de figura que não acompanha
  if ((q.images ?? []).length === 0 && /(imagem|figura|radiografia|tomografia|ecg|eletrocardiograma)\s+(a seguir|abaixo|apresentad)/i.test(q.statement)) {
    add("minor", "figure_not_attached", "O enunciado remete a uma figura que não acompanha a questão: a análise pode estar incompleta.");
  }
  return f;
}

// ---------------------------------------------------------------------------- comentário montado por software
export interface CommentContent {
  answer: string;
  question_core: string;
  reasoning: string;
  key_data: { text: string; role: string }[];
  why_correct: string;
  why_wrong: { option_id: string; kind: string; why_wrong: string; why_plausible: string; when_correct: string; concept_difference: string }[];
  trap: string;
  golden_rule: string;
  label: string;
}

/** Níveis rápido e completo, derivados da MESMA análise (o nível "professor" vem depois, com a revisão). */
export function compileComments(q: QuestionForAnalysis, a: Analysis): { level: "quick" | "full"; content: CommentContent }[] {
  const official = q.official?.answer ?? q.correct_option;
  const right = a.options.find((o) => o.option_id === official)!;
  const base = {
    answer: official,
    question_core: a.question_core,
    key_data: a.key_data.filter((k) => k.role === "CRITICAL" || k.role === "SUPPORTIVE"),
    trap: a.trap,
    golden_rule: a.golden_rule,
    label: "Comentário Stazia",
  };
  const full: CommentContent = {
    ...base,
    reasoning: right.reasoning,
    why_correct: right.reasoning,
    why_wrong: a.options.filter((o) => o.option_id !== official).map((o) => ({ option_id: o.option_id, kind: o.distractor_kind, why_wrong: o.why_wrong, why_plausible: o.why_plausible, when_correct: o.when_correct, concept_difference: o.concept_difference })),
  };
  const quick: CommentContent = {
    ...base,
    key_data: base.key_data.filter((k) => k.role === "CRITICAL"),
    reasoning: right.reasoning.length > 280 ? `${right.reasoning.slice(0, 277).trimEnd()}…` : right.reasoning,
    why_correct: right.reasoning.length > 280 ? `${right.reasoning.slice(0, 277).trimEnd()}…` : right.reasoning,
    why_wrong: [],
  };
  return [
    { level: "quick", content: quick },
    { level: "full", content: full },
  ];
}

// ---------------------------------------------------------------------------- IA
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

export interface AnalysisRunDeps {
  db: ContentDb;
  mockRespond?: (req: StructuredRequest) => unknown;
  /** Só para testes: cria o provedor de uma ref (as regras da Central de IAs continuam valendo). */
  aiMaker?: (ref: ModelRef) => AiProvider | null;
  log?: (m: string) => void;
}

export function analysisPayload(q: QuestionForAnalysis) {
  return {
    prova: `${q.exam_id} · questão ${q.number}`,
    area: q.area,
    enunciado: q.statement,
    alternativas: q.options.map((o) => ({ id: o.id, texto: o.text })),
    gabarito_oficial: q.official?.answer ?? q.correct_option,
    classificacao: q.dna ? { subarea: q.dna.subarea, competencia: q.dna.competency, cenario: q.dna.care_setting, paciente: q.dna.patient_group, decisao_clinica: q.dna.clinical_decision, conceito_da_resposta: q.dna.concept, intencao: q.dna.intent, padroes_de_distrator: q.dna.distractor_patterns } : null,
  };
}

export async function generateAnalysis(deps: AnalysisRunDeps, provider: AiProvider, q: QuestionForAnalysis, spend: Spend, who?: { provider: string; model: string }): Promise<Analysis> {
  const prompt = PROMPTS.qanalysis;
  const input = `Responda no formato "qanalysis". A questão segue como dado:\n${asDocument(analysisPayload(q))}`;
  const inputHash = sha256(`${prompt.system}\n${input}`);
  const cached = await deps.db.service<Analysis | null>("ch_worker_cached_run", { p_prompt_id: prompt.id, p_prompt_version: prompt.version, p_model: provider.model, p_input_hash: inputHash });
  if (cached && validate(prompt.schema, cached).length === 0) return cached;
  const r = await provider.generate<Analysis>({ promptId: prompt.id, promptVersion: prompt.version, system: prompt.system, input, schema: prompt.schema, schemaName: "staziamed_qanalysis", maxOutputTokens: 12000 });
  if (who) { who.provider = r.provider; who.model = r.model; }
  spend.calls++;
  spend.inputTokens += r.inputTokens ?? 0;
  spend.outputTokens += r.outputTokens ?? 0;
  if (r.costUsd != null) spend.costUsd = (spend.costUsd ?? 0) + r.costUsd;
  await deps.db.service("ch_worker_log_ai_run", {
    p_run: { document_id: null, step: "question_analysis", provider: r.provider, model: r.model, prompt_id: prompt.id, prompt_version: prompt.version, schema_version: prompt.version, input_hash: inputHash, status: "ok", output: r.output, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd, latency_ms: r.latencyMs },
  });
  return r.output;
}

export interface AnalysisRunOptions {
  limit?: number;
  exam?: string;
  dryRun?: boolean;
}

export interface AnalysisReport {
  considered: number;
  saved: number;
  verdicts: Record<string, number>;
  skipped: number;
  pending?: string;
  spend: Spend;
  estimate?: { calls: number; inputTokens: number; outputTokens: number };
}

export function estimateAnalysisTokens(q: QuestionForAnalysis) {
  return { calls: 1, inputTokens: Math.ceil(JSON.stringify(analysisPayload(q)).length / 4) + Math.ceil(PROMPTS.qanalysis.system.length / 4) + 600, outputTokens: 2600 };
}

export async function runQuestionAnalysis(deps: AnalysisRunDeps, options: AnalysisRunOptions = {}): Promise<AnalysisReport> {
  const report: AnalysisReport = { considered: 0, saved: 0, skipped: 0, verdicts: {}, spend: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null } };
  const questions = await deps.db.service<QuestionForAnalysis[]>("ch_worker_questions_for_analysis", { p_limit: options.limit ?? 20, p_exam: options.exam ?? null, p_only_missing: true });
  report.considered = questions.length;
  if (!questions.length) return report;
  if (options.dryRun) {
    report.estimate = questions.map(estimateAnalysisTokens).reduce((a, b) => ({ calls: a.calls + b.calls, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }));
    return report;
  }
  const allowed = await aiAllowed(deps.db);
  if (!allowed.ok) {
    report.pending = allowed.why;
    return report;
  }
  await registerPrompts(deps.db);
  // lista de fontes que o aluno não pode ver: sem ela nada é gerado nem gravado (a equipe vê o aviso e tenta de novo)
  let supportTerms: string[];
  try {
    supportTerms = await loadComplementarTerms(deps.db, undefined, deps.log);
  } catch (error) {
    if (error instanceof ComplementarTermsUnavailable) {
      report.pending = error.message;
      return report;
    }
    throw error;
  }
  const mockProvider = deps.mockRespond ? resolveProviderKind("mock", deps.mockRespond).provider : null;
  const aiDeps = { db: deps.db, mockProvider, makeProviderFor: deps.aiMaker, log: deps.log };
  for (const q of questions) {
    // a origem leva o id da questão; o maestro refaz o provedor a cada questão
    const { provider, status } = await maestroProvider(aiDeps, "engenharia_reversa", { source: "analise", itemId: q.id });
    if (!provider) {
      report.pending = status.pending ?? "Provedor de criação indisponível.";
      break;
    }
    try {
      const who = { provider: provider.name, model: provider.model };
      const analysis = await generateAnalysis(deps, provider, q, report.spend, who);
      const findings = analysisChecks(q, analysis, supportTerms);
      const verdict = verdictOf(findings);
      const saved = await deps.db.service<{ analysis_id: string }>("ch_worker_save_question_analysis", {
        p_question_id: q.id,
        p_analysis: { ...analysis, options: undefined },
        p_options: analysis.options,
        p_comments: compileComments(q, analysis).map((c) => ({ level: c.level, content: c.content })),
        p_meta: { provider: who.provider, model: who.model, prompt_version: ANALYSIS_VERSION, status: "ai_draft" },
      });
      await deps.db.service("ch_worker_save_analysis_check", { p_analysis_id: saved.analysis_id, p_layer: "software", p_verdict: verdict, p_findings: findings, p_meta: { provider: "software", model: "regras", prompt_version: ANALYSIS_VERSION } });
      report.saved++;
      report.verdicts[verdict] = (report.verdicts[verdict] ?? 0) + 1;
    } catch (error) {
      // teto de gasto atingido: para aqui, com a mensagem do teto, em vez de seguir pelas outras questões gravando linhas de teto
      if (error instanceof AiCapReached) {
        report.pending = error.message;
        break;
      }
      report.skipped++;
      report.pending = `Falha em ${q.id} (${(error as Error).message.slice(0, 160)})`;
      if (/recusou|autorizado|ALLOW_EXTERNAL|API key|401|403|429/i.test((error as Error).message)) break;
    }
  }
  return report;
}

export { numbers };
