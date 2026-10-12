/**
 * Validações sem IA da Questão StaziaMed gerada (grátis, determinísticas). Vêm de `_validate_draft` e `validate_novel_draft`
 * do gerador antigo, com as regras da spec (§5.1 e §7): só português, citação literal de trecho oferecido, decisão clínica
 * sustentada, números com sustentação, resposta única, tabela coerente, nada de figura, explicação sem letra, nada de Inep
 * e semelhança com as provas oficiais e com as outras StaziaMed (70 recusa, 50 alerta).
 */
import { isVerbatim, normalize, numbersOutside } from "../checks";
import type { Finding } from "../draftChecks";
import { maxSimilarity, normalizeForSimilarity } from "./similarity";
import { LETTERS, type GeneratedQuestion, type OfficialPassage, type SimilarityCorpus, type SimilarityHit, type StaziaCitation } from "./types";

// marcadores de inglês claro (revalida-reverse-engine/src/classification/dna_validator.py:29-46)
const ENGLISH_MARKERS = [
  "assessment", "clinical decision", "diagnosis", "disease", "follow up", "guideline", "management", "migraine", "most likely",
  "next step", "patient", "preventive treatment", "risk factor", "screening", "treatment", "vaccination",
];

/** Inglês claro: algum marcador no texto normalizado (entre espaços) ou o texto inteiro em CAIXA_ALTA_COM_SUBLINHADO. */
export function containsClearEnglish(text: string): boolean {
  if (/^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(String(text ?? "").trim())) return true;
  const n = ` ${normalizeForSimilarity(text)} `;
  return ENGLISH_MARKERS.some((m) => n.includes(` ${m} `));
}

/** A explicação cita uma alternativa por letra? ("a alternativa B", "Letra C", "(D)", "item A"). O "itens" também (Q2). */
export function citesLetter(text: string): boolean {
  return /(?:\b(?:[Aa]lternativas?|[Ll]etras?|[Oo]p[çc](?:ão|ao|ões|oes)|[Ii]te(?:m|ns))\s+[“"(]?[A-D]\b)|\(\s*[A-D]\s*\)/.test(String(text ?? ""));
}

/**
 * O enunciado depende de uma figura que não vem junto? (regra 9b de draftChecks.ts). Questão com tabela ou painel de exames
 * COM linhas pode dizer "apresentado abaixo" sem ser figura (Q15): passe `hasSupportRows`.
 */
export function dependsOnFigure(stem: string, hasSupportRows = false): boolean {
  if (hasSupportRows) return false;
  return /imagem|figura|foto|radiografia|tomografia|ecg|eletrocardiograma|ultrassom/i.test(stem) && /(a seguir|abaixo|apresentad|mostrad|exibid)/i.test(stem);
}

const fold = (t: string) => normalizeForSimilarity(t);

export interface ValidationResult {
  findings: Finding[];
  similarity: { official: SimilarityHit; staziamed: SimilarityHit };
  citations: StaziaCitation[];
}

export function validateGenerated(
  q: GeneratedQuestion,
  ctx: { offered: OfficialPassage[]; corpus: SimilarityCorpus; excludeId?: string }
): ValidationResult {
  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], code: string, detail: string, where?: string) => findings.push({ severity, code, detail, where });
  const exp = q.alternative_explanations ?? ({} as GeneratedQuestion["alternative_explanations"]);
  const alts = q.alternatives ?? ({} as GeneratedQuestion["alternatives"]);

  // 1. só português
  const allText = [q.title, q.stem, q.support_title ?? "", ...(q.support_rows ?? []).flatMap((r) => [r.label, r.value]), ...LETTERS.map((l) => alts[l] ?? ""),
    q.explanation, ...LETTERS.map((l) => exp[l] ?? ""), q.clinical_decision, ...(q.key_concepts ?? [])];
  if (allText.some(containsClearEnglish)) add("critical", "not_portuguese", "O texto tem trechos em inglês: a questão deve estar toda em português do Brasil.");

  // 2. citações: só de trecho oferecido e literal
  const byId = new Map(ctx.offered.map((p) => [p.passage_id, p]));
  const citations: StaziaCitation[] = [];
  for (const c of q.citations ?? []) {
    const p = byId.get(c.passage_id);
    if (!p) {
      add("critical", "citation_not_offered", `A citação aponta para um trecho que não foi oferecido (${c.passage_id}).`, "citações");
      continue;
    }
    if (!isVerbatim(c.quote, p.text)) add("critical", "quote_not_verbatim", `O trecho citado não aparece literalmente na fonte "${p.source}".`, "citações");
    citations.push({ passage_id: p.passage_id, source_id: p.source_id, source: p.source, organ: p.organ, version: p.version, page: p.page, quote: c.quote, supports: c.supports });
  }

  // 3. a decisão clínica tem citação que a sustenta
  if (!(q.citations ?? []).some((c) => normalize(c.supports) === normalize(q.clinical_decision))) {
    add("critical", "decision_without_citation", "A decisão clínica não tem uma citação que a sustente.", "decisão clínica");
  }

  // 4. números da decisão, da correta e das explicações: no enunciado, na tabela de apoio ou nos trechos citados
  const bases = [q.stem, `${q.support_title ?? ""} ${(q.support_rows ?? []).map((r) => `${r.label} ${r.value}`).join(" ")}`, ...(q.citations ?? []).map((c) => c.quote)];
  const checked = [q.clinical_decision, alts[q.correct_answer] ?? "", q.explanation, ...LETTERS.map((l) => exp[l] ?? "")].join(" ");
  const outside = numbersOutside(checked, bases);
  if (outside.length) add("critical", "numbers_unsupported", `Valores sem sustentação no enunciado, na tabela ou nos trechos citados: ${outside.join(", ")}.`, "números");

  // 5. alternativas distintas e preenchidas
  const seen = new Map<string, string>();
  for (const l of LETTERS) {
    const key = fold(alts[l] ?? "");
    if (!key) add("critical", "empty_option", `A alternativa ${l} está vazia.`, l);
    else if (seen.has(key)) add("critical", "duplicate_option", `As alternativas ${seen.get(key)} e ${l} são iguais.`, l);
    else seen.set(key, l);
  }

  // 6. resposta única: exatamente uma explicação "Correta" (na letra do gabarito) e três "Incorreta"
  const starts = (t: string | undefined, w: string) => new RegExp(`^\\s*${w}\\b`, "i").test(t ?? "");
  const corretas = LETTERS.filter((l) => starts(exp[l], "corret[ao]"));
  const incorretas = LETTERS.filter((l) => starts(exp[l], "incorret[ao]"));
  if (corretas.length !== 1 || corretas[0] !== q.correct_answer || incorretas.length !== 3) {
    add("critical", "single_answer", `As explicações precisam marcar só ${q.correct_answer} como "Correta" e as outras três como "Incorreta".`, "explicações");
  }

  // 7. tabela de apoio coerente
  const rows = q.support_rows ?? [];
  if (q.support_type === "TABLE" || q.support_type === "LAB_PANEL") {
    if (!normalize(q.support_title ?? "") || !rows.length) add("critical", "support_incoherent", "A tabela de apoio precisa de título e de pelo menos uma linha.", "tabela");
  } else if (rows.length) add("critical", "support_incoherent", "Há linhas de tabela, mas o tipo de apoio é nenhum.", "tabela");
  if (q.support_type === "NONE" && /(tabela|quadro|exames?)\s+(a seguir|abaixo)|(a seguir|abaixo)[^.]{0,40}(tabela|quadro|exames)/i.test(q.stem)) {
    add("critical", "support_incoherent", "O enunciado remete a uma tabela ou quadro que não existe.", "tabela");
  }

  // 8. nada de figura
  if (dependsOnFigure(q.stem, rows.length > 0)) add("critical", "figure", "O enunciado depende de uma figura: nesta etapa não há questão com imagem.", "enunciado");

  // 9. a explicação não cita letra (o gabarito é embaralhado depois)
  if ([q.explanation, ...LETTERS.map((l) => exp[l] ?? "")].some(citesLetter)) {
    add("critical", "explanation_cites_letter", "A explicação cita alternativa por letra: o gabarito é embaralhado depois e a letra deixaria de valer.", "explicações");
  }

  // 10. nunca atribuída ao Inep
  if (allText.some((t) => /\binep\b/i.test(t))) add("critical", "mentions_inep", "A questão menciona o Inep: a Questão StaziaMed nunca é atribuída ao Inep.");

  // 11. semelhança: com as provas oficiais e com as outras StaziaMed (70 recusa, 50 alerta)
  const text = q.stem;
  const similarity = {
    official: maxSimilarity(text, ctx.corpus.official),
    staziamed: maxSimilarity(text, ctx.corpus.staziamed, { excludeId: ctx.excludeId }),
  };
  for (const [kind, hit] of [["official", similarity.official], ["staziamed", similarity.staziamed]] as const) {
    const label = kind === "official" ? "questão oficial" : "outra Questão StaziaMed";
    if (hit.score >= 70) add("critical", `too_similar_${kind}`, `Semelhança de ${hit.score}% com ${label}: reescrever.`, "enunciado");
    else if (hit.score >= 50) add("major", `similar_${kind}`, `Semelhança de ${hit.score}% com ${label}.`, "enunciado");
  }

  return { findings, similarity, citations };
}
