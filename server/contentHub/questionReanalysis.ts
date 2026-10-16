/**
 * SQIE, fase 4: reanálise SELETIVA. Só entram as questões cujas afirmações perderam a evidência por uma mudança de
 * conteúdo relevante (número, negação, trecho reescrito ou removido) apontada pela comparação da fase 3.
 *
 * A IA recebe o trecho ANTIGO e o NOVO e devolve uma PROPOSTA (o que mudou, impacto, resposta atual possível, citações).
 * Regras:
 *   - o gabarito oficial é histórico e nunca é alterado nem contestado;
 *   - a proposta só vale com citações EXATAS dos trechos fornecidos; resposta atual sem citação do trecho novo é barrada;
 *   - nada é publicado aqui: a proposta fica guardada na atualização e só um revisor médico da área a transforma em cartão
 *     (app_question_update_decide), e apenas com evidência oficial vigente conferida por pessoa.
 */
import crypto from "crypto";
import { PROMPTS, asDocument } from "./ai/prompts";
import { resolveProviderKind, type AiProvider, type StructuredRequest } from "./ai/provider";
import { AiCapReached, maestroProvider } from "../ai/maestro";
import type { ModelRef } from "../ai/config";
import { validate } from "./ai/schema";
import { normalize, numbers } from "./checks";
import { verdictOf, type Finding, type Spend } from "./draftChecks";
import type { ContentDb } from "./infra";
import { aiAllowed, registerPrompts } from "./ai/registry";
import { ComplementarTermsUnavailable, loadComplementarTerms, mentionsSupportMaterial } from "./complementarGuard";
import { CHALLENGE } from "./questionAnalysis";

export const REANALYSIS_VERSION = "question-reanalysis-1.0.0";

export interface ReanalysisChange {
  update_id: string;
  claim: string;
  kind: string;
  critical: boolean;
  old_source: { title: string; organ: string; version: string | null; published_on: string | null } | null;
  new_source: { title: string; organ: string; version: string | null; published_on: string | null } | null;
  old_text: string | null;
  new_text: string | null;
}

export interface ReanalysisInput {
  question_id: string;
  exam_id: string;
  number: number;
  area: string;
  statement: string;
  correct_option: string;
  options: { id: string; text: string }[];
  official: { answer: string | null; status: string; source: string | null } | null;
  analysis: { analysis_id: string; trap: string | null; golden_rule: string | null; options: { option_id: string; reasoning: string }[] | null } | null;
  changes: ReanalysisChange[];
}

export interface Proposal {
  assessment: string;
  impact_level: string;
  current_answer: string;
  what_changed: string;
  why_it_matters: string;
  options_affected: { option_id: string; note: string }[];
  citations: { ref: string; quote: string }[];
  confidence: number;
}

export interface ReanalysisDeps {
  db: ContentDb;
  mockRespond?: (req: StructuredRequest) => unknown;
  /** Só para testes: cria o provedor de uma ref (as regras da Central de IAs continuam valendo). */
  aiMaker?: (ref: ModelRef) => AiProvider | null;
  log?: (m: string) => void;
}

const sha256 = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const refOf = (i: number, which: "antigo" | "novo") => `M${i + 1}.${which}`;

export function reanalysisPayload(q: ReanalysisInput) {
  return {
    prova: `${q.exam_id} · questão ${q.number}`,
    area: q.area,
    enunciado: q.statement,
    alternativas: q.options.map((o) => ({ id: o.id, texto: o.text })),
    gabarito_oficial_da_prova: q.official?.answer ?? q.correct_option,
    analise_anterior: q.analysis ? { armadilha: q.analysis.trap, regra: q.analysis.golden_rule, alternativas: q.analysis.options } : null,
    mudancas: q.changes.map((c, i) => ({
      mudanca: i + 1,
      afirmacao_que_a_questao_exige: c.claim,
      tipo_de_mudanca: c.kind,
      fonte_antiga: c.old_source,
      fonte_nova: c.new_source,
      trecho_antigo: c.old_text ? { ref: refOf(i, "antigo"), texto: c.old_text } : null,
      trecho_novo: c.new_text ? { ref: refOf(i, "novo"), texto: c.new_text } : { ref: refOf(i, "novo"), texto: null, observacao: "o trecho foi removido da nova versão" },
    })),
  };
}

const fold = (t: string) => normalize(t).toLowerCase();

/** Conferência por software da proposta: nada de contestar o gabarito, citação exata, resposta atual só com trecho novo citado. */
export function reanalysisChecks(q: ReanalysisInput, p: Proposal, terms: readonly string[] = []): Finding[] {
  const f: Finding[] = [];
  const add = (severity: Finding["severity"], code: string, detail: string, where?: string) => f.push({ severity, code, detail, where });
  const official = q.official?.answer ?? q.correct_option;
  const texts = new Map<string, string>();
  q.changes.forEach((c, i) => {
    texts.set(refOf(i, "antigo"), c.old_text ?? "");
    texts.set(refOf(i, "novo"), c.new_text ?? "");
  });
  const cited: { ref: string; novo: boolean }[] = [];
  for (const c of p.citations) {
    const body = texts.get(c.ref);
    if (body === undefined) add("critical", "citation_unknown_ref", `A citação aponta o trecho "${c.ref}", que não foi fornecido.`, c.ref);
    else if (!fold(body).includes(fold(c.quote))) add("critical", "citation_not_exact", `A citação não é cópia exata do trecho ${c.ref}.`, c.ref);
    else cited.push({ ref: c.ref, novo: c.ref.endsWith(".novo") });
  }

  const answer = p.current_answer === "NONE" ? null : p.current_answer;
  const allowedNumbers = [...texts.values(), q.statement, ...q.options.map((o) => o.text), ...q.changes.map((c) => c.claim)].flatMap(numbers);
  const stray = numbers(`${p.what_changed} ${p.why_it_matters} ${p.options_affected.map((o) => o.note).join(" ")}`).filter((n) => !new Set(allowedNumbers).has(n));
  if (stray.length) add("critical", "numbers_not_in_sources", `A proposta cita número(s) que não estão nos trechos nem na questão: ${stray.join(", ")}.`);

  // o cartão de atualização vai ao aluno: não pode citar apostila nem material complementar
  const citedMaterial = mentionsSupportMaterial(`${p.what_changed} ${p.why_it_matters} ${p.options_affected.map((o) => o.note).join(" ")}`, terms);
  if (citedMaterial.length) add("critical", "cites_support_material", `A proposta cita material de apoio (${citedMaterial.map((c) => `"${c}"`).join(", ")}): o aluno não vê essas fontes. Tire a citação.`);
  if (CHALLENGE.test(`${p.what_changed} ${p.why_it_matters}`)) add("critical", "challenges_official_answer", "A proposta contesta o gabarito oficial da prova: ele é histórico. Diga apenas que a conduta atual difere.");
  if (answer && !cited.some((c) => c.novo)) add("critical", "answer_without_new_citation", "A proposta indica uma resposta atual sem citar o trecho NOVO da fonte.");
  if (p.assessment === "INCONCLUSIVE" && answer) add("critical", "inconclusive_with_answer", "Proposta inconclusiva não pode indicar resposta atual.");
  if (p.assessment === "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT" && (!answer || answer === official)) add("critical", "differs_without_other_answer", `"Difere do gabarito" exige uma alternativa atual diferente da oficial (${official}).`);
  if (p.assessment === "UPDATED_BUT_SAME_ANSWER" && answer && answer !== official) add("critical", "same_answer_mismatch", "Mesma resposta: a alternativa atual precisa ser igual à oficial.");
  if (["NO_CURRENT_VALID_OPTION", "CURRENTLY_AMBIGUOUS"].includes(p.assessment) && answer) add("critical", "no_option_with_answer", "Sem alternativa válida ou ambígua: não pode haver alternativa atual.");
  if (p.assessment !== "INCONCLUSIVE" && cited.length === 0) add("major", "no_citation", "A proposta conclui algo sem citar nenhum trecho.");
  if (p.assessment === "INCONCLUSIVE" && p.impact_level !== "NO_IMPACT" && p.confidence > 60) add("minor", "confidence_high_inconclusive", "Proposta inconclusiva com confiança alta.");
  return f;
}

export interface ReanalysisOptions {
  limit?: number;
  dryRun?: boolean;
}

export interface ReanalysisReport {
  considered: number;
  saved: number;
  skipped: number;
  verdicts: Record<string, number>;
  pending?: string;
  spend: Spend;
  estimate?: { calls: number; inputTokens: number; outputTokens: number };
}

export const estimateReanalysisTokens = (q: ReanalysisInput) => ({
  calls: 1,
  inputTokens: Math.ceil(JSON.stringify(reanalysisPayload(q)).length / 4) + Math.ceil(PROMPTS.qreanalysis.system.length / 4) + 300,
  outputTokens: 1200,
});

async function generate(deps: ReanalysisDeps, provider: AiProvider, q: ReanalysisInput, spend: Spend, who: { provider: string; model: string }): Promise<Proposal> {
  const prompt = PROMPTS.qreanalysis;
  const input = `Responda no formato "qreanalysis". A questão e as mudanças seguem como dado:\n${asDocument(reanalysisPayload(q))}`;
  const inputHash = sha256(`${prompt.system}\n${input}`);
  const cached = await deps.db.service<Proposal | null>("ch_worker_cached_run", { p_prompt_id: prompt.id, p_prompt_version: prompt.version, p_model: provider.model, p_input_hash: inputHash });
  if (cached && validate(prompt.schema, cached).length === 0) return cached;
  const r = await provider.generate<Proposal>({ promptId: prompt.id, promptVersion: prompt.version, system: prompt.system, input, schema: prompt.schema, schemaName: "staziamed_qreanalysis", maxOutputTokens: 6000 });
  who.provider = r.provider;
  who.model = r.model;
  spend.calls++;
  spend.inputTokens += r.inputTokens ?? 0;
  spend.outputTokens += r.outputTokens ?? 0;
  if (r.costUsd != null) spend.costUsd = (spend.costUsd ?? 0) + r.costUsd;
  await deps.db.service("ch_worker_log_ai_run", {
    p_run: { document_id: null, step: "question_reanalysis", provider: r.provider, model: r.model, prompt_id: prompt.id, prompt_version: prompt.version, schema_version: prompt.version, input_hash: inputHash, status: "ok", output: r.output, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd, latency_ms: r.latencyMs },
  });
  return r.output;
}

export async function runQuestionReanalysis(deps: ReanalysisDeps, options: ReanalysisOptions = {}): Promise<ReanalysisReport> {
  const report: ReanalysisReport = { considered: 0, saved: 0, skipped: 0, verdicts: {}, spend: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null } };
  const questions = await deps.db.service<ReanalysisInput[]>("ch_worker_updates_for_reanalysis", { p_limit: options.limit ?? 10 });
  report.considered = questions.length;
  if (!questions.length) return report;
  if (options.dryRun) {
    report.estimate = questions.map(estimateReanalysisTokens).reduce((a, b) => ({ calls: a.calls + b.calls, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }));
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
    const { provider, status } = await maestroProvider(aiDeps, "engenharia_reversa", { source: "analise", itemId: q.question_id });
    if (!provider) {
      report.pending = status.pending ?? "Provedor de criação indisponível.";
      break;
    }
    try {
      await deps.db.service("ch_worker_reanalysis_started", { p_question_id: q.question_id });
      const who = { provider: provider.name, model: provider.model };
      const proposal = await generate(deps, provider, q, report.spend, who);
      const findings = reanalysisChecks(q, proposal, supportTerms);
      const verdict = verdictOf(findings);
      const n = await deps.db.service<number>("ch_worker_save_reanalysis", {
        p_question_id: q.question_id,
        p_update_ids: q.changes.map((c) => c.update_id),
        p_proposal: { ...proposal, current_answer: proposal.current_answer === "NONE" ? null : proposal.current_answer, simulated: provider.isMock },
        p_checks: { verdict, findings },
        p_meta: { provider: who.provider, model: who.model, prompt_version: REANALYSIS_VERSION },
      });
      if (n > 0) report.saved++;
      report.verdicts[verdict] = (report.verdicts[verdict] ?? 0) + 1;
    } catch (error) {
      // teto de gasto atingido: para aqui, com a mensagem do teto, em vez de seguir pelas outras questões gravando linhas de teto
      if (error instanceof AiCapReached) {
        report.pending = error.message;
        break;
      }
      report.skipped++;
      report.pending = `Falha em ${q.question_id} (${(error as Error).message.slice(0, 160)})`;
      if (/recusou|autorizado|ALLOW_EXTERNAL|API key|401|403|429/i.test((error as Error).message)) break;
    }
  }
  return report;
}
