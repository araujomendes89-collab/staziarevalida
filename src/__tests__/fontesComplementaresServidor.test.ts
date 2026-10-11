// @vitest-environment node
/**
 * Fontes complementares, lado do servidor (server/contentHub/complementarGuard.ts e as conferências que o usam):
 * o texto que a IA escreve para o aluno pode ter sido feito com base na apostila, mas não pode citá-la.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ALWAYS_TERMS, labelIsSupportMaterial, loadComplementarTerms, mentionsSupportMaterial, NEVER_CITE_SUPPORT_MATERIAL, resetComplementarTermsCache,
} from "../../server/contentHub/complementarGuard";
import { checkScript, SCRIPT_SYSTEM, type PodcastScript } from "../../server/podcasts/script";
import { ASSIST_SYSTEM } from "../../server/lessons/assist";
import { analysisChecks, type Analysis, type QuestionForAnalysis } from "../../server/contentHub/questionAnalysis";
import { reanalysisChecks } from "../../server/contentHub/questionReanalysis";
import { safetyCheck, type SafetyContext } from "../../server/tutor/safety";
import { MEDICAL_GROUNDING_RULES } from "../../server/tutor/prompts";
import { PROMPTS } from "../../server/contentHub/ai/prompts";

const TITULO = "Sangue nos Olhos — Clínica Médica";
const TERMOS = [TITULO, "Editora Alfa (teste)"];

beforeEach(() => resetComplementarTermsCache());

describe("conferência de menção ao material complementar", () => {
  it("acha o nome do material, do órgão, 'Sangue nos Olhos' e a palavra apostila, sem acento nem caixa", () => {
    expect(mentionsSupportMaterial("Segundo a apostila de clínica, faça suporte.")).toEqual(["apostila"]);
    expect(mentionsSupportMaterial("como diz o SANGUE NOS OLHOS")).toEqual(["Sangue nos Olhos"]);
    expect(mentionsSupportMaterial("Veja o manual da Editora Alfa (teste) para detalhes.", TERMOS)).toEqual(["Editora Alfa (teste)"]);
    expect(mentionsSupportMaterial("Sangue nos olhos clinica medica", TERMOS)).toContain("Sangue nos Olhos");
  });

  it("texto limpo passa; a palavra 'apostilar' dentro de outra não conta", () => {
    expect(mentionsSupportMaterial("Na bronquiolite leve, o tratamento é de suporte.", TERMOS)).toEqual([]);
    expect(mentionsSupportMaterial("", TERMOS)).toEqual([]);
    expect(mentionsSupportMaterial("desapostilado", TERMOS)).toEqual([]);
  });

  it("rótulo de fonte: complementar é escondida, oficial não", () => {
    expect(labelIsSupportMaterial("Sangue nos Olhos · Clínica Médica · p. 345", TERMOS)).toBe(true);
    expect(labelIsSupportMaterial("PCDT de Bronquiolite · Ministério da Saúde", TERMOS)).toBe(false);
  });

  it("os termos vêm do banco, ficam em cache por 60 s e, se o banco falhar, sobram os termos fixos", async () => {
    let chamadas = 0;
    const db = { service: async () => { chamadas++; return [TITULO]; } } as any;
    expect(await loadComplementarTerms(db, 1000)).toEqual([...ALWAYS_TERMS, TITULO]);
    await loadComplementarTerms(db, 30_000);
    expect(chamadas).toBe(1);
    await loadComplementarTerms(db, 70_000);
    expect(chamadas).toBe(2);
    resetComplementarTermsCache();
    expect(await loadComplementarTerms({ service: async () => { throw new Error("fora"); } } as any)).toEqual([...ALWAYS_TERMS]);
    expect(await loadComplementarTerms(null)).toEqual([...ALWAYS_TERMS]);
  });
});

describe("prompts de geração mandam nunca citar o material complementar", () => {
  it("podcast, aula, análise da questão, atualização e Tutor trazem a regra", () => {
    expect(SCRIPT_SYSTEM).toContain(NEVER_CITE_SUPPORT_MATERIAL);
    expect(ASSIST_SYSTEM).toContain(NEVER_CITE_SUPPORT_MATERIAL);
    expect(PROMPTS.qanalysis.system).toMatch(/NUNCA cite apostila nem material complementar/);
    expect(PROMPTS.qreanalysis.system).toMatch(/NUNCA cite apostila nem material complementar/);
    expect(MEDICAL_GROUNDING_RULES).toMatch(/Nunca cite apostila nem material complementar/);
  });
});

describe("roteiro do podcast", () => {
  const script = (text: string): PodcastScript => ({ lines: [{ speaker: "ANA", text, style: "", sources: [1] }], missing: [] });
  const chunks = new Map([[1, { id: 1, source: "Material", doc: 1, page: 1, text: "Suporte clínico." }]]);
  it("fala que cita o material é avisada; fala limpa não", () => {
    const avisos = checkScript(script("Como diz a apostila Sangue nos Olhos, o suporte basta."), chunks, undefined, TERMOS);
    expect(avisos.map((a) => a.kind)).toContain("cites_material");
    expect(checkScript(script("O suporte basta."), chunks, undefined, TERMOS).map((a) => a.kind)).not.toContain("cites_material");
  });
});

describe("análise da questão e atualização (saem para o aluno)", () => {
  const q = {
    id: "q1", exam_id: "e", exam_year: 2024, number: 1, area: "PEDIATRIA", statement: "Lactente com sibilância.", correct_option: "B", images: [],
    options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: null })), official: { answer: "B", status: "FINAL", source: null }, dna: null, basis_hash: "x",
  } as QuestionForAnalysis;
  const analise = (texto: string): Analysis => ({ ...({
    question_core: "Pede a conduta na bronquiolite leve.", key_data: [{ text: "sibilância", role: "CRITICAL" }], reasoning_types: [], difficulty: 2, difficulty_components: {},
    trap: texto, golden_rule: "Suporte é a base.", pedagogy: { teaches: "", why_important: "", cognitive_error: "", review_if_wrong: "" }, guideline_dependency: { depends: false, topics: [] },
    options: ["A", "B", "C", "D"].map((id) => ({
      option_id: id, is_official_correct: id === "B", distractor_kind: id === "B" ? "CORRECT" : "WRONG", reasoning: "Porque o quadro pede suporte clínico.",
      why_plausible: "Parece razoável no início.", why_wrong: "Não trata a causa do quadro e não muda o desfecho do paciente.", when_correct: "Em outro quadro clínico.",
      concept_difference: "Conceito diferente.", error_types: id === "B" ? [] : ["WRONG_CONCEPT"], trap: "", quality: 80,
    })),
  } as Analysis) });
  it("análise que cita a apostila recebe falha crítica", () => {
    const f = analysisChecks(q, analise("Cuidado: a apostila Sangue nos Olhos marca outra letra."), TERMOS);
    expect(f).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "critical", code: "cites_support_material" })]));
    expect(analysisChecks(q, analise("Cuidado com a pegadinha do enunciado."), TERMOS).map((x) => x.code)).not.toContain("cites_support_material");
  });
  it("proposta de atualização que cita o material recebe falha crítica", () => {
    const proposta: any = { assessment: "INCONCLUSIVE", impact_level: "NO_IMPACT", current_answer: "NONE", what_changed: "Conforme a Editora Alfa (teste), mudou.", why_it_matters: "", options_affected: [], citations: [], confidence: 10 };
    const entrada: any = { question_id: "q1", statement: "x", options: [], changes: [], correct_option: "B", official: { answer: "B" } };
    expect(reanalysisChecks(entrada, proposta, TERMOS).map((x) => x.code)).toContain("cites_support_material");
  });
});

describe("Tutor", () => {
  const out = (reply: string): any => ({
    reply, grounding: "GENERAL", citations: [], evaluation: { error_type: "none", knowledge_gap: "", severity: 1, unsafe: false, reasoning_quality: "na", recommended_action: "none", answer_correct: "na", self_corrected: false },
    justification: "NONE", reveals_answer: false, suggested_replies: [],
  });
  const ctx = (extra: Partial<SafetyContext> = {}): SafetyContext => ({ blocks: [], conversationTexts: [], hintLevel: null, hasUpdateCard: false, profanity: "off", ...extra });
  it("resposta que cita apostila ou 'Sangue nos Olhos' é barrada", () => {
    for (const reply of ["Isso está na apostila, pode olhar.", "Pelo Sangue nos Olhos, a conduta é outra.", "No manual da Editora Alfa (teste) aparece."]) {
      expect(safetyCheck(out(reply), ctx({ supportTerms: TERMOS })).violations.map((v) => v.code)).toContain("cites_support_material");
    }
    expect(safetyCheck(out("Pensa no quadro: o que muda a conduta?"), ctx({ supportTerms: TERMOS })).violations.map((v) => v.code)).not.toContain("cites_support_material");
  });
  it("as fontes devolvidas ao aluno não trazem rótulo de fonte complementar", () => {
    const blocks = [
      { ref: "F1", kind: "source" as const, label: "PCDT de Bronquiolite · Ministério da Saúde", text: "Suporte clínico na bronquiolite leve." },
      { ref: "F2", kind: "source" as const, label: "Sangue nos Olhos · Clínica Médica · p. 345", text: "Suporte clínico na bronquiolite leve, segundo o capítulo." },
    ];
    const r = safetyCheck({ ...out("O suporte clínico é a base."), grounding: "SOURCE", citations: [{ ref: "F1", quote: "Suporte clínico" }, { ref: "F2", quote: "Suporte clínico" }] }, ctx({ blocks, supportTerms: TERMOS }));
    expect(r.sources.map((s) => s.ref)).toEqual(["F1"]);
    expect(JSON.stringify(r.sources)).not.toMatch(/sangue/i);
  });
});
