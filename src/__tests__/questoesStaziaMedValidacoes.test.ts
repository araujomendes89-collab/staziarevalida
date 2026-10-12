// @vitest-environment node
/**
 * Questões StaziaMed — validações sem IA (Tarefa 4): semelhança (regra do rapidfuzz), citação em letra, dependência de figura,
 * embaralhamento do gabarito com as explicações junto e a lista de comparação do banco (ch_worker_similarity_corpus).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { charRatio, maxSimilarity, normalizeForSimilarity, tokenSetRatio } from "../../server/contentHub/questoes/similarity";
import { citesLetter, containsClearEnglish, dependsOnFigure, validateGenerated } from "../../server/contentHub/questoes/validate";
import { shuffleToTarget } from "../../server/contentHub/questoes/shuffle";
import type { GeneratedQuestion, OfficialPassage, SimilarityCorpus } from "../../server/contentHub/questoes/types";
import { insertDraft, insertStaziaQuestion, openStaziaEnv, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 120_000 });

const PASSAGE: OfficialPassage = {
  passage_id: "p1", source_id: "s1", source: "PCDT de Otite", organ: "Ministério da Saúde", version: "2026", authority_level: "A",
  published_on: "2026-01-01", valid_until: null, section: "Tratamento", page: 7,
  text: "Em lactentes com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias como primeira escolha.",
};
const DECISION = "Tratar a otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.";
const clean = (): GeneratedQuestion => ({
  title: "Otite no lactente",
  stem: "Lactente de 8 meses, com febre há 3 dias, otalgia e membrana timpânica abaulada. Qual é a conduta inicial adequada?",
  support_type: "NONE", support_title: null, support_rows: [],
  alternatives: { A: "Amoxicilina por 10 dias.", B: "Apenas observação sem antibiótico.", C: "Azitromicina em dose única.", D: "Ceftriaxona intramuscular." },
  correct_answer: "A",
  explanation: "Em lactente com otite média aguda indica-se amoxicilina 90 mg/kg/dia por 10 dias.",
  alternative_explanations: {
    A: "Correta. Amoxicilina 90 mg/kg/dia por 10 dias é a primeira escolha.",
    B: "Incorreta. Em lactente a observação isolada não é a conduta inicial.",
    C: "Incorreta. Não é a primeira escolha.",
    D: "Incorreta. Fica para falha do tratamento.",
  },
  clinical_decision: DECISION,
  key_concepts: ["otite média aguda"],
  citations: [{ passage_id: "p1", quote: "indica-se amoxicilina 90 mg/kg/dia por 10 dias", supports: DECISION }],
});
const EMPTY: SimilarityCorpus = { official: [], staziamed: [] };
const run = (q: GeneratedQuestion, corpus: SimilarityCorpus = EMPTY) => validateGenerated(q, { offered: [PASSAGE], corpus });
const codes = (r: ReturnType<typeof run>) => r.findings.map((f) => `${f.severity}:${f.code}`).sort();

describe("Semelhança", () => {
  it("charRatio e tokenSetRatio seguem a regra do rapidfuzz", () => {
    expect(charRatio("abcd", "abce")).toBe(75);
    expect(charRatio("", "abc")).toBe(0);
    expect(tokenSetRatio("lactente febre otite", "otite febre lactente grave")).toBe(100);
    expect(tokenSetRatio("", "otite")).toBe(0);
    expect(normalizeForSimilarity("PACIENTE, com dôr!")).toBe("paciente com dor");
    expect(maxSimilarity("Paciente com dor", [{ id: "x", text: "PACIENTE, com dôr!" }])).toEqual({ score: 100, id: "x" });
    expect(maxSimilarity("qualquer", [])).toEqual({ score: 0, id: null });
  });

  it("maxSimilarity escolhe a mais parecida, respeita excludeId e dá nota com uma casa decimal", () => {
    const corpus = [
      { id: "longe", text: "Gestante com sangramento no terceiro trimestre e dor abdominal intensa." },
      { id: "perto", text: "Lactente de 8 meses com febre há 3 dias, otalgia e membrana timpânica abaulada, qual a conduta?" },
      { id: "outra", text: "Idoso com dispneia progressiva e edema de membros inferiores." },
    ];
    const hit = maxSimilarity("Lactente de 8 meses, com febre há 3 dias, otalgia e membrana timpânica abaulada. Qual é a conduta inicial adequada?", corpus);
    expect(hit.id).toBe("perto");
    expect(hit.score).toBeGreaterThan(80);
    expect(Number.isInteger(hit.score * 10)).toBe(true);
    expect(maxSimilarity("Lactente de 8 meses, com febre há 3 dias, otalgia e membrana timpânica abaulada.", corpus, { excludeId: "perto" }).id).not.toBe("perto");
  });

  it("com 1.200 textos de 800 caracteres devolve uma nota válida (o pré-filtro limita a conta cara)", () => {
    const words = ["lactente", "febre", "tosse", "dispneia", "dor", "abdome", "gestante", "sangramento", "criança", "idoso", "choque", "sepse"];
    const text = (n: number) => Array.from({ length: 130 }, (_, i) => words[(i * 7 + n * 3) % words.length] + (i % 11)).join(" ").slice(0, 800);
    const corpus = Array.from({ length: 1200 }, (_, i) => ({ id: `q${i}`, text: text(i) }));
    const hit = maxSimilarity(text(5), corpus);
    expect(hit.id).not.toBeNull();
    expect(hit.score).toBeGreaterThan(0);
  });
});

describe("Regras de texto", () => {
  it("citesLetter: 'a alternativa B', 'Letra C', '(D)', 'item A' e 'itens' sim; 'Correta: a amoxicilina', 'vitamina D', 'hepatite B' não", () => {
    for (const t of ["a alternativa B está certa", "Letra C", "veja (D)", "o item A", "os itens A e B", "Opção D"]) expect(citesLetter(t), t).toBe(true);
    for (const t of ["Correta: a amoxicilina", "vitamina D", "hepatite B", "A conduta é observar", "fator B do complemento"]) expect(citesLetter(t), t).toBe(false);
  });

  it("dependsOnFigure: pede figura sim; tabela de exames com linhas pode dizer 'apresentado abaixo' (Q15)", () => {
    expect(dependsOnFigure("Observe a radiografia apresentada a seguir. Qual o diagnóstico?")).toBe(true);
    expect(dependsOnFigure("O ultrassom abaixo mostra cisto. Qual a conduta?")).toBe(true);
    expect(dependsOnFigure("Qual a conduta para esta criança com febre?")).toBe(false);
    expect(dependsOnFigure("Os exames apresentados abaixo incluem ultrassom e hemograma.", true)).toBe(false);
  });

  it("containsClearEnglish: marcadores de inglês e código em caixa alta; português com 'paciente' não", () => {
    expect(containsClearEnglish("The most likely diagnosis is")).toBe(true);
    expect(containsClearEnglish("CLINICAL_DECISION")).toBe(true);
    expect(containsClearEnglish("Paciente com doença e tratamento adequado")).toBe(false);
  });
});

describe("validateGenerated", () => {
  it("questão limpa não gera achado nenhum e as citações saem completas (órgão, documento, versão, página)", () => {
    const r = run(clean());
    expect(r.findings).toEqual([]);
    expect(r.citations).toEqual([{ passage_id: "p1", source_id: "s1", source: "PCDT de Otite", organ: "Ministério da Saúde", version: "2026", page: 7,
      quote: "indica-se amoxicilina 90 mg/kg/dia por 10 dias", supports: DECISION }]);
    expect(r.similarity).toEqual({ official: { score: 0, id: null }, staziamed: { score: 0, id: null } });
  });

  const PLANTADOS: [string, (q: GeneratedQuestion) => GeneratedQuestion | void, string, SimilarityCorpus?][] = [
    ["not_portuguese", (q) => { q.explanation = "The most likely diagnosis is otitis media."; }, "critical:not_portuguese"],
    ["citation_not_offered", (q) => { q.citations.push({ passage_id: "p9", quote: "x", supports: "y" }); }, "critical:citation_not_offered"],
    ["quote_not_verbatim", (q) => { q.citations[0].quote = "indica-se azitromicina por 5 dias"; }, "critical:quote_not_verbatim"],
    ["decision_without_citation", (q) => { q.citations[0].supports = "Outra afirmação qualquer."; }, "critical:decision_without_citation"],
    ["numbers_unsupported", (q) => { q.explanation += " A dose máxima é 4 g/dia."; }, "critical:numbers_unsupported"],
    ["duplicate_option", (q) => { q.alternatives.C = q.alternatives.B; }, "critical:duplicate_option"],
    ["empty_option", (q) => { q.alternatives.D = " "; }, "critical:empty_option"],
    ["single_answer", (q) => { q.alternative_explanations.B = "Correta. Também serve."; }, "critical:single_answer"],
    ["support_incoherent (tabela sem linhas)", (q) => { q.support_type = "TABLE"; q.support_title = "Exames"; }, "critical:support_incoherent"],
    ["support_incoherent (linhas sem tipo)", (q) => { q.support_rows = [{ label: "Hb", value: "11" }]; }, "critical:support_incoherent"],
    ["support_incoherent (cita tabela inexistente)", (q) => { q.stem += " Analise os exames abaixo."; }, "critical:support_incoherent"],
    ["figure", (q) => { q.stem = "Observe a radiografia apresentada a seguir. Qual a conduta inicial adequada?"; }, "critical:figure"],
    ["explanation_cites_letter", (q) => { q.alternative_explanations.C = "Incorreta. A alternativa B é melhor."; }, "critical:explanation_cites_letter"],
    ["mentions_inep", (q) => { q.title = "Questão no estilo do Inep"; }, "critical:mentions_inep"],
    ["too_similar_official", () => {}, "critical:too_similar_official", { official: [{ id: "o1", text: "Lactente de 8 meses, com febre há 3 dias, otalgia e membrana timpânica abaulada. Qual é a conduta inicial adequada?" }], staziamed: [] }],
    ["too_similar_staziamed", () => {}, "critical:too_similar_staziamed", { official: [], staziamed: [{ id: "d1", text: "Lactente de 8 meses, com febre há 3 dias, otalgia e membrana timpânica abaulada. Qual é a conduta inicial adequada?" }] }],
    ["similar_official (50 a 69)", () => {}, "major:similar_official",
      { official: [{ id: "o1", text: "Menino de 9 meses com febre alta e choro ao deitar, tímpano hiperemiado e abaulado. Qual a melhor conduta?" }], staziamed: [] }],
  ];
  it.each(PLANTADOS)("pega: %s", (name, mutate, expected, corpus) => {
    const q = clean();
    mutate(q);
    const r = run(q, corpus);
    if (name.startsWith("similar_official")) {
      // a nota fica entre 50 e 69: o teste conferiu que cai na faixa certa
      expect(r.similarity.official.score).toBeGreaterThanOrEqual(50);
      expect(r.similarity.official.score).toBeLessThan(70);
    }
    expect(codes(r)).toContain(expected);
  });

  it("a mesma questão excluída de si mesma não conta como semelhante a si (excludeId)", () => {
    const corpus: SimilarityCorpus = { official: [], staziamed: [{ id: "eu", text: clean().stem }] };
    expect(validateGenerated(clean(), { offered: [PASSAGE], corpus, excludeId: "eu" }).findings).toEqual([]);
    expect(codes(validateGenerated(clean(), { offered: [PASSAGE], corpus }))).toContain("critical:too_similar_staziamed");
  });
});

describe("Embaralhamento", () => {
  it("shuffleToTarget: correta de A para D; B, C, D viram A, B, C; explicações acompanham", () => {
    const q = clean();
    const { question, from, to } = shuffleToTarget(q, "D");
    expect({ from, to }).toEqual({ from: "A", to: "D" });
    expect(question.correct_answer).toBe("D");
    expect(question.alternatives).toEqual({ A: q.alternatives.B, B: q.alternatives.C, C: q.alternatives.D, D: q.alternatives.A });
    expect(question.alternative_explanations).toEqual({ A: q.alternative_explanations.B, B: q.alternative_explanations.C, C: q.alternative_explanations.D, D: q.alternative_explanations.A });
    // continua uma questão válida: a "Correta" está na letra do gabarito
    expect(run(question).findings).toEqual([]);
    // a original não mudou
    expect(q.correct_answer).toBe("A");
  });

  it("shuffleToTarget: correta de C para B mantém a ordem relativa das outras; mesma letra não muda nada", () => {
    const q = { ...clean(), correct_answer: "C" as const,
      alternative_explanations: { A: "Incorreta. a", B: "Incorreta. b", C: "Correta. c", D: "Incorreta. d" } };
    const { question } = shuffleToTarget(q, "B");
    expect(question.alternatives).toEqual({ A: q.alternatives.A, B: q.alternatives.C, C: q.alternatives.B, D: q.alternatives.D });
    expect(shuffleToTarget(q, "C").question.alternatives).toEqual(q.alternatives);
  });
});

describe("Lista de comparação do banco", () => {
  let env: StaziaEnv;
  beforeAll(async () => { env = await openStaziaEnv(); }, 600_000);
  afterAll(async () => { await env?.close(); }, 60_000);

  it("ch_worker_similarity_corpus traz as 1.200 oficiais e os rascunhos não recusados (nunca a StaziaMed publicada como oficial)", async () => {
    await insertStaziaQuestion(env, { area: "PEDIATRIA" });
    const ok = await insertDraft(env, { stem: "Enunciado do rascunho aguardando revisão médica de pediatria." });
    const refused = await insertDraft(env, { stem: "Enunciado do rascunho recusado." });
    await env.sql(`update public.draft_questions set status = 'rejected' where id = $1`, [refused]);
    const [{ r }] = await env.sql<{ r: { official: { id: string }[]; staziamed: { id: string; text: string }[] } }>(`select public.ch_worker_similarity_corpus() as r`);
    expect(r.official).toHaveLength(1200);
    expect(r.official.some((x) => x.id.startsWith("staziamed_q"))).toBe(false);
    expect(r.staziamed.map((x) => x.id)).toContain(ok);
    expect(r.staziamed.map((x) => x.id)).not.toContain(refused);
    // só o servidor chama
    await expect(env.sqlAs("00000000-0000-4000-8000-0000000051a1", `select public.ch_worker_similarity_corpus()`)).rejects.toThrow(/permission denied/);
  });
});
