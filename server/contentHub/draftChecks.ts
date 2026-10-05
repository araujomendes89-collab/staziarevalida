/**
 * Conferência independente dos rascunhos inéditos (Stazia Knowledge Engine, fase 3).
 *
 *   software  regras sem IA (grátis, roda em todos): resposta única, números sem sustentação,
 *             semelhança com questão oficial, cópia do material-fonte, alternativas repetidas, dependência de figura
 *   sources   a afirmação central tem sustentação em fonte OFICIAL (nível A–D)? Sem acervo: "insuficiente", sem gastar IA
 *   currency  a versão da fonte é a vigente? Sem documento da versão: "inconclusivo", nunca "atualizado"
 *   redteam   resolução às cegas + revisão adversarial (opinião de IA, NÃO é evidência)
 *
 * Regras: o conferente é de outra família que o criador; qualquer problema crítico bloqueia (nada de maioria);
 * nenhuma camada aprova ou publica — o resultado só informa e ordena a revisão do médico.
 */
import { aiAllowed, registerPromptsOnce } from "./ai/registry";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PROMPTS, asDocument, type PromptKey } from "./ai/prompts";
import { resolveRoleProvider, type AiProvider, type StructuredRequest, type VerifierRole } from "./ai/provider";
import { validate } from "./ai/schema";
import { copyRatio, isVerbatim, negations, normalize, numbers, numbersOutside } from "./checks";
import type { ContentDb } from "./infra";

const run = promisify(execFile);

export type Layer = "software" | VerifierRole;
export type Verdict = "pass" | "issues" | "fail" | "insufficient" | "inconclusive";
export interface Finding {
  severity: "critical" | "major" | "minor" | "info";
  code: string;
  where?: string;
  detail: string;
}

export interface DraftRow {
  id: string;
  batch: string;
  source_id: string;
  slot: number;
  area: string;
  stem: string;
  alternatives: Record<string, string>;
  correct_answer: string;
  explanation: string | null;
  alternative_explanations: Record<string, string>;
  source_citations: { source_file?: string; supported_claim?: string }[];
  update_application: string | null;
  similarity_to_official: number | string | null;
  support_type: string | null;
  support_title: string | null;
  support_rows: { label: string; value: string }[];
  clinical_decision: string | null;
  model: string | null;
  content_hash: string;
}

export const CHECKS_VERSION = "draft-checks-1.0.0";
const LETTERS = ["A", "B", "C", "D"];

/** Verdito da camada a partir dos achados: crítico bloqueia; qualquer outro vira "com apontamentos". */
export function verdictOf(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === "critical")) return "fail";
  return findings.some((f) => f.severity !== "info") ? "issues" : "pass";
}

const supportText = (d: DraftRow) => (d.support_rows ?? []).map((r) => `${r.label} ${r.value}`).join(" ");

/** Texto que o aluno vê para responder (enunciado + tabela de apoio). */
export function studentVisibleText(d: DraftRow) {
  return `${d.stem}\n${d.support_title ?? ""}\n${supportText(d)}`;
}

// ---------------------------------------------------------------------------- camada software
export function softwareChecks(d: DraftRow, opts: { referenceTexts?: Record<string, string>; officialFiles?: Set<string> } = {}): Finding[] {
  const f: Finding[] = [];
  const add = (severity: Finding["severity"], code: string, detail: string, where?: string) => f.push({ severity, code, detail, where });

  // 1. resposta única e explicações coerentes
  const exp = d.alternative_explanations ?? {};
  const markedCorrect = LETTERS.filter((l) => /^\s*(corret[ao]|adequad[ao])\b/i.test(exp[l] ?? ""));
  const markedWrong = LETTERS.filter((l) => /^\s*(incorret[ao]|inadequad[ao])\b/i.test(exp[l] ?? ""));
  if (LETTERS.some((l) => !normalize(exp[l] ?? ""))) add("major", "explanation_missing", "Falta a explicação de pelo menos uma alternativa.");
  if (markedCorrect.length + markedWrong.length === 0) {
    // o gerador escreveu as explicações em prosa, sem rótulo: a regra não consegue conferir, e isso não é erro do conteúdo
    add("minor", "explanation_unlabeled", "As explicações não usam o rótulo 'Correta/Incorreta': a coerência entre gabarito e explicação precisa ser conferida pelo revisor.");
  } else if (markedCorrect.length !== 1) add("critical", "single_answer", `A explicação marca ${markedCorrect.length} alternativa(s) como correta(s) (${markedCorrect.join(", ") || "nenhuma"}); precisa ser exatamente uma.`);
  else if (markedCorrect[0] !== d.correct_answer) add("critical", "answer_mismatch", `O gabarito é ${d.correct_answer}, mas a explicação marca ${markedCorrect[0]} como a correta.`);
  if (markedCorrect.length === 1 && markedCorrect.length + markedWrong.length === 4 && markedWrong.length !== 3) add("major", "explanation_labels", "As explicações não dizem 'Incorreta' nas três alternativas erradas.");

  // 2. alternativas repetidas
  const seen = new Map<string, string>();
  for (const l of LETTERS) {
    const key = normalize(d.alternatives?.[l] ?? "").toLowerCase();
    if (!key) add("critical", "empty_option", `A alternativa ${l} está vazia.`, l);
    else if (seen.has(key)) add("critical", "duplicate_option", `As alternativas ${seen.get(key)} e ${l} são iguais.`, l);
    else seen.set(key, l);
  }

  // 3. números/unidades da resposta e da explicação sem sustentação no enunciado, na tabela ou nas citações
  const bases = [studentVisibleText(d), ...(d.source_citations ?? []).map((c) => c.supported_claim ?? "")];
  const checked = [`${d.alternatives?.[d.correct_answer] ?? ""} ${d.explanation ?? ""} ${exp[d.correct_answer] ?? ""}`];
  const outside = numbersOutside(checked.join(" "), bases);
  if (outside.length) add("major", "numbers_unsupported", `Valores sem sustentação no enunciado, na tabela de apoio ou nas citações: ${outside.join(", ")}.`, "resposta/explicação");

  // 4. negação perdida entre a afirmação citada e a alternativa correta
  const claimNeg = new Set((d.source_citations ?? []).flatMap((c) => negations(c.supported_claim ?? "")));
  const answerNeg = new Set(negations(d.alternatives?.[d.correct_answer] ?? ""));
  const flipped = [...answerNeg].filter((n) => !claimNeg.has(n) && claimNeg.size > 0);
  if (flipped.length && (d.source_citations ?? []).length) add("minor", "negation_check", `A alternativa correta traz negação (${flipped.join(", ")}) que não consta das citações: conferir o sentido.`, d.correct_answer);

  // 5. pista de resposta: a correta é bem mais longa que as outras
  const len = (l: string) => normalize(d.alternatives?.[l] ?? "").length;
  const others = LETTERS.filter((l) => l !== d.correct_answer).map(len);
  const avg = others.reduce((a, b) => a + b, 0) / (others.length || 1);
  if (avg > 0 && len(d.correct_answer) > avg * 1.8 && len(d.correct_answer) - avg > 60) add("minor", "answer_cue", "A alternativa correta é bem mais longa que as outras (pista de resposta).", d.correct_answer);

  // 6. semelhança com questão oficial (originalidade)
  const sim = Number(d.similarity_to_official);
  if (Number.isFinite(sim)) {
    if (sim >= 85) add("critical", "too_similar_official", `Semelhança de ${sim}% com questão oficial: reescrever.`);
    else if (sim >= 70) add("major", "similar_official", `Semelhança de ${sim}% com questão oficial.`);
  }

  // 7. cópia do material-fonte (6-gramas), quando o texto de referência está disponível
  for (const c of d.source_citations ?? []) {
    const ref = opts.referenceTexts?.[c.source_file ?? ""];
    if (!ref) continue;
    const ratio = copyRatio(`${d.stem} ${Object.values(d.alternatives ?? {}).join(" ")}`, ref);
    if (ratio > 0.5) add("critical", "copied_from_source", `${Math.round(ratio * 100)}% das sequências de 6 palavras vêm de "${c.source_file}": reescrever.`);
    else if (ratio > 0.25) add("major", "close_to_source", `${Math.round(ratio * 100)}% das sequências de 6 palavras vêm de "${c.source_file}".`);
    break; // uma referência basta para o alerta
  }

  // 8. fonte única de terceiros: não é evidência (nível E)
  const files = [...new Set((d.source_citations ?? []).map((c) => c.source_file ?? "").filter(Boolean))];
  if (!files.length) add("critical", "no_citation", "Nenhuma fonte citada.");
  else if (files.every((x) => !opts.officialFiles?.has(x))) add("major", "third_party_source_only", `Só cita material que não é fonte oficial cadastrada (${files.join("; ")}): serve para descobrir o assunto, não para provar.`);

  // 9. o gerador pediu uma imagem que não existe: sem ela a questão não pode ser respondida
  if (d.support_type === "IMAGE_REQUEST") add("critical", "image_requested", "O gerador pediu uma imagem para esta questão e ela não existe: não dá para responder sem a figura.");
  // 9b. dependência de figura que não acompanha o rascunho
  if (d.support_type !== "IMAGE_REQUEST" && /imagem|figura|foto|radiografia|tomografia|ecg|eletrocardiograma|ultrassom/i.test(d.stem) && /(a seguir|abaixo|apresentad|mostrad|exibid)/i.test(d.stem) && !(d.support_rows ?? []).length) {
    add("major", "figure_missing", "O enunciado remete a uma figura que não acompanha o rascunho.");
  }
  return f;
}

// ---------------------------------------------------------------------------- IA (camadas separadas)
export interface Spend {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface RunDeps {
  db: ContentDb;
  mockRespond?: (req: StructuredRequest) => unknown;
  log?: (m: string) => void;
}

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

async function callAi<T>(deps: RunDeps, provider: AiProvider, key: PromptKey, payload: unknown, spend: Spend, draft: DraftRow, layer: Layer): Promise<T> {
  const allowed = await aiAllowed(deps.db);
  if (!allowed.ok) throw new Error(allowed.why);
  await registerPromptsOnce(deps.db);
  const prompt = PROMPTS[key];
  const input = `Responda no formato "${key}". O material segue como dado:\n${asDocument(payload)}`;
  const inputHash = sha256(`${prompt.system}\n${input}`);
  const cached = await deps.db.service<T | null>("ch_worker_cached_run", { p_prompt_id: prompt.id, p_prompt_version: prompt.version, p_model: provider.model, p_input_hash: inputHash });
  if (cached && validate(prompt.schema, cached).length === 0) return cached;
  const r = await provider.generate<T>({ promptId: prompt.id, promptVersion: prompt.version, system: prompt.system, input, schema: prompt.schema, schemaName: `staziamed_${key}`, maxOutputTokens: 4096 });
  spend.calls++;
  spend.inputTokens += r.inputTokens ?? 0;
  spend.outputTokens += r.outputTokens ?? 0;
  if (r.costUsd != null) spend.costUsd = (spend.costUsd ?? 0) + r.costUsd;
  await deps.db.service("ch_worker_log_ai_run", {
    p_run: { document_id: null, step: `draft_check:${layer}`, provider: r.provider, model: r.model, prompt_id: prompt.id, prompt_version: prompt.version, schema_version: prompt.version, input_hash: inputHash, status: "ok", output: r.output, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd, latency_ms: r.latencyMs },
  });
  return r.output;
}

const questionForReview = (d: DraftRow, withKey: boolean) => ({
  enunciado: d.stem,
  tabela_de_apoio: d.support_title ? { titulo: d.support_title, linhas: d.support_rows } : null,
  alternativas: d.alternatives,
  ...(withKey ? { gabarito_do_criador: d.correct_answer, explicacao: d.explanation, explicacao_por_alternativa: d.alternative_explanations, afirmacao_central: d.clinical_decision, citacoes_do_criador: d.source_citations } : {}),
});

/** Revisão clínica independente: resolve às cegas e depois revisa com tudo. É opinião de IA, nunca prova. */
export async function redteamCheck(deps: RunDeps, provider: AiProvider, d: DraftRow, spend: Spend): Promise<{ verdict: Verdict; findings: Finding[] }> {
  const findings: Finding[] = [];
  const solved = await callAi<{ answer: string; certainty: string; rationale: string; ambiguity: string }>(deps, provider, "solve", questionForReview(d, false), spend, d, "redteam");
  if (solved.answer !== d.correct_answer) {
    findings.push({ severity: "critical", code: "blind_answer_differs", where: "gabarito", detail: `Resolvendo sem ver o gabarito, o revisor escolheu ${solved.answer} (certeza ${solved.certainty}) e o criador marcou ${d.correct_answer}. Opinião do revisor: ${solved.rationale}` });
  } else if (solved.certainty === "low") {
    findings.push({ severity: "minor", code: "blind_answer_uncertain", where: "gabarito", detail: `O revisor chegou à mesma resposta, mas com certeza baixa. ${solved.ambiguity}` });
  }
  // "Nenhuma relevante" não é apontamento: só registra ambiguidade que o revisor de fato descreveu
  const ambiguity = normalize(solved.ambiguity);
  const none = /^(nenhum|nenhuma|nada|n[ãa]o h[áa]|sem ambiguidade|n\/a)\b/i.test(ambiguity);
  if (ambiguity.length > 8 && !none && solved.answer === d.correct_answer && solved.certainty !== "low") {
    findings.push({ severity: "minor", code: "blind_ambiguity", where: "enunciado", detail: solved.ambiguity });
  }
  const review = await callAi<{ issues: { severity: Finding["severity"]; kind: string; where: string; detail: string; basis: string }[] }>(deps, provider, "redteam", questionForReview(d, true), spend, d, "redteam");
  for (const i of review.issues) {
    findings.push({
      severity: i.severity,
      code: `redteam_${i.kind}`,
      where: i.where,
      detail: `${i.detail} [${i.basis === "model_knowledge" ? "conhecimento do modelo, sem fonte" : "inconsistência no próprio texto"}]`,
    });
  }
  return { verdict: verdictOf(findings), findings };
}

/** Passagens oficiais para a afirmação central (busca por palavras, só fontes nível A–D). */
async function officialPassages(deps: RunDeps, claim: string) {
  const query = normalize(claim).toLowerCase().split(/[^a-zà-ú0-9]+/i).filter((w) => w.length >= 4).slice(0, 10).join(" or ");
  if (!query) return [];
  return deps.db.service<any[]>("ch_worker_search_official_passages", { p_query: query, p_limit: 6 });
}

/** Fontes: a afirmação central está sustentada por trecho oficial? Sem acervo, "insuficiente" (sem chamar IA). */
export async function sourcesCheck(deps: RunDeps, provider: AiProvider | null, d: DraftRow, spend: Spend): Promise<{ verdict: Verdict; findings: Finding[] }> {
  const claim = normalize(d.clinical_decision ?? "");
  if (!claim) return { verdict: "inconclusive", findings: [{ severity: "major", code: "no_claim", detail: "O rascunho não traz a afirmação central a conferir." }] };
  const passages = await officialPassages(deps, claim);
  if (!passages.length) {
    return { verdict: "insufficient", findings: [{ severity: "major", code: "no_official_source", detail: "Nenhuma fonte oficial (nível A–D) cadastrada trata desta afirmação: cadastre o documento completo para conferir." }] };
  }
  if (!provider) throw new Error("Conferente de fontes sem provedor de IA.");
  const byId = new Map(passages.map((p: any) => [p.passage_id, p]));
  const out = await callAi<{ verdict: string; passage_id: string; quote: string; rationale: string }>(
    deps, provider, "evidence",
    { afirmacao: { text: claim, context: { area: d.area } }, trechos: passages.map((p: any) => ({ passage_id: p.passage_id, source: p.source, organ: p.organ, version: p.version, section: p.section, page: p.page, text: String(p.text).slice(0, 2500) })) },
    spend, d, "sources",
  );
  const p = byId.get(out.passage_id) as any;
  const findings: Finding[] = [];
  if (!p || !isVerbatim(out.quote, p.text)) return { verdict: "inconclusive", findings: [{ severity: "major", code: "quote_not_verbatim", detail: "A citação proposta não é cópia literal do trecho da fonte: descartada." }] };
  const missing = numbersOutside(claim, [out.quote]);
  const missingNeg = negations(claim).filter((n) => !negations(out.quote).includes(n));
  if (out.verdict === "compatible" && (missing.length || missingNeg.length)) {
    findings.push({ severity: "critical", code: "numbers_or_negation_mismatch", detail: `A fonte não traz: ${[...missing, ...missingNeg].join(", ")}. O parecer "compatível" foi rebaixado.` });
    return { verdict: "fail", findings };
  }
  const ref = `${p.source} · ${p.organ}${p.version ? ` · versão ${p.version}` : ""}${p.page != null ? ` · p. ${p.page}` : ""}`;
  if (out.verdict === "compatible") return { verdict: "pass", findings: [{ severity: "info", code: "supported", detail: `Sustentada por: ${ref}. "${out.quote.slice(0, 240)}"` }] };
  const sev: Finding["severity"] = out.verdict === "conflicting" || out.verdict === "outdated" ? "critical" : "major";
  findings.push({ severity: sev, code: `sources_${out.verdict}`, detail: `${ref}: ${out.rationale}` });
  return { verdict: verdictOf(findings), findings };
}

/** Atualidade: só com documento. Fonte vencida ou substituída pesa mais que qualquer parecer. */
export async function currencyCheck(deps: RunDeps, provider: AiProvider | null, d: DraftRow, spend: Spend): Promise<{ verdict: Verdict; findings: Finding[] }> {
  const claim = normalize(d.clinical_decision ?? "");
  if (!claim) return { verdict: "inconclusive", findings: [{ severity: "major", code: "no_claim", detail: "O rascunho não traz a afirmação central a conferir." }] };
  const passages = await officialPassages(deps, claim);
  if (!passages.length) {
    return { verdict: "inconclusive", findings: [{ severity: "major", code: "no_document_for_currency", detail: "Sem o documento oficial da versão mais recente no acervo, não é possível dizer se a conduta está atualizada. O modelo não decide pela própria memória." }] };
  }
  const today = new Date().toISOString().slice(0, 10);
  const expired = passages.filter((p: any) => p.valid_until && String(p.valid_until) < today);
  if (expired.length === passages.length) {
    return { verdict: "fail", findings: [{ severity: "critical", code: "source_expired", detail: `Todas as fontes encontradas estão com vigência encerrada (${[...new Set(expired.map((p: any) => `${p.source} v${p.version ?? "?"}`))].join("; ")}).` }] };
  }
  if (!provider) throw new Error("Conferente de atualizações sem provedor de IA.");
  const byId = new Map(passages.map((p: any) => [p.passage_id, p]));
  const out = await callAi<{ verdict: string; passage_id: string; quote: string; rationale: string }>(
    deps, provider, "currency",
    { afirmacao: claim, hoje: today, trechos: passages.map((p: any) => ({ passage_id: p.passage_id, source: p.source, organ: p.organ, version: p.version, published_on: p.published_on, valid_until: p.valid_until, page: p.page, text: String(p.text).slice(0, 2500) })) },
    spend, d, "currency",
  );
  const p = byId.get(out.passage_id) as any;
  if (!p || !isVerbatim(out.quote, p.text)) return { verdict: "inconclusive", findings: [{ severity: "major", code: "quote_not_verbatim", detail: "A citação proposta não é cópia literal do trecho: descartada." }] };
  if (out.verdict === "current") return { verdict: "pass", findings: [] };
  const sev: Finding["severity"] = out.verdict === "inconclusive" ? "major" : "critical";
  return { verdict: out.verdict === "inconclusive" ? "inconclusive" : "fail", findings: [{ severity: sev, code: `currency_${out.verdict}`, detail: `${p.source} v${p.version ?? "?"}: ${out.rationale}` }] };
}

// ---------------------------------------------------------------------------- texto de referência (originalidade)
export async function loadReferenceTexts(dir: string | undefined, files: string[], python = process.env.CONTENT_HUB_PYTHON ?? "pdfpython"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!dir) return out;
  const cacheDir = path.join(process.cwd(), ".data/ref-text");
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const file of files) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    const cache = path.join(cacheDir, `${sha256(`${full}|${stat.size}|${stat.mtimeMs}`).slice(0, 24)}.txt`);
    if (!fs.existsSync(cache)) {
      const { stdout } = await run(python, ["-c", "import sys,pymupdf;d=pymupdf.open(sys.argv[1]);sys.stdout.write('\\n'.join(p.get_text() for p in d))", full], { maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60_000 });
      fs.writeFileSync(cache, stdout);
    }
    out[file] = fs.readFileSync(cache, "utf8");
  }
  return out;
}

// ---------------------------------------------------------------------------- execução
export interface RunOptions {
  layers: Layer[];
  limit?: number;
  batch?: string;
  dryRun?: boolean;
  referenceDir?: string;
}

export interface RunReport {
  layer: Layer;
  considered: number;
  saved: number;
  verdicts: Record<string, number>;
  pending?: string;
  spend: Spend;
  estimate?: { calls: number; inputTokens: number; outputTokens: number };
}

/** Estimativa de tokens (4 caracteres ≈ 1 token) para decidir antes de gastar. */
export function estimateTokens(d: DraftRow, layer: Layer) {
  const base = Math.ceil(JSON.stringify(questionForReview(d, layer === "redteam")).length / 4) + 500;
  if (layer === "redteam") return { calls: 2, inputTokens: base * 2, outputTokens: 700 + 400 };
  return { calls: 1, inputTokens: base, outputTokens: 350 };
}

export async function runDraftChecks(deps: RunDeps, options: RunOptions): Promise<RunReport[]> {
  const reports: RunReport[] = [];
  const officialSources = await deps.db.service<{ title: string }[]>("ch_worker_official_sources");
  const officialFiles = new Set(officialSources.map((s) => s.title));
  for (const layer of options.layers) {
    const report: RunReport = { layer, considered: 0, saved: 0, verdicts: {}, spend: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null } };
    reports.push(report);
    const drafts = await deps.db.service<DraftRow[]>("ch_worker_drafts_for_check", { p_layer: layer, p_limit: options.limit ?? 50, p_batch: options.batch ?? null });
    report.considered = drafts.length;
    if (!drafts.length) continue;

    let referenceTexts: Record<string, string> = {};
    if (layer === "software" && options.referenceDir && !options.dryRun) {
      referenceTexts = await loadReferenceTexts(options.referenceDir, [...new Set(drafts.flatMap((d) => (d.source_citations ?? []).map((c) => c.source_file ?? "")).filter(Boolean))]);
    }

    for (const d of drafts) {
      if (options.dryRun) {
        if (layer !== "software") {
          const e = estimateTokens(d, layer);
          report.estimate = { calls: (report.estimate?.calls ?? 0) + e.calls, inputTokens: (report.estimate?.inputTokens ?? 0) + e.inputTokens, outputTokens: (report.estimate?.outputTokens ?? 0) + e.outputTokens };
        }
        continue;
      }
      let result: { verdict: Verdict; findings: Finding[] };
      let meta: Record<string, unknown> = { prompt_version: CHECKS_VERSION };
      if (layer === "software") {
        const findings = softwareChecks(d, { referenceTexts, officialFiles });
        result = { verdict: verdictOf(findings), findings };
        meta = { provider: "software", model: "regras", prompt_version: CHECKS_VERSION };
      } else {
        const role = layer as VerifierRole;
        const { provider, status } = resolveRoleProvider(role, d.model, deps.mockRespond);
        const needsAi = layer === "redteam";
        // fontes/atualidade só chamam IA quando há trecho oficial; antes disso o resultado é determinístico
        if (!provider && needsAi) {
          report.pending = status.pending ?? "Conferente indisponível.";
          break;
        }
        const before = report.spend.calls;
        try {
          result = layer === "redteam" ? await redteamCheck(deps, provider!, d, report.spend) : layer === "sources" ? await sourcesCheck(deps, provider, d, report.spend) : await currencyCheck(deps, provider, d, report.spend);
        } catch (error) {
          if (!provider) {
            report.pending = status.pending ?? (error as Error).message;
            break;
          }
          report.pending = `Falha na chamada (${(error as Error).message.slice(0, 160)})`;
          break;
        }
        meta = { provider: provider?.name ?? "software", model: report.spend.calls > before ? provider?.model : "sem chamada de IA", prompt_version: CHECKS_VERSION };
      }
      await deps.db.service("ch_worker_save_draft_check", { p_draft_id: d.id, p_layer: layer, p_verdict: result.verdict, p_findings: result.findings, p_meta: meta });
      report.saved++;
      report.verdicts[result.verdict] = (report.verdicts[result.verdict] ?? 0) + 1;
    }
  }
  return reports;
}
