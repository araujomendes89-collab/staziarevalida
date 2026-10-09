// @vitest-environment node
// Assistente das abas: tipos comuns, textos exatos e campos de Questões (src/shared/adminAssistant).
import { describe, expect, it } from "vitest";
import { ASSIST_TEXTS, aiDefinedText, isEmptyValue, sameValue, valueText } from "../shared/adminAssistant/types";
import { QUESTOES_SPEC } from "../shared/adminAssistant/questoes";

const LETTERS = ["A", "B", "C", "D"];

describe("assistente das abas — campos de Questões", () => {
  it("campos de Questões: o que muda, o que só confere e o que nunca toca", () => {
    const names = (ai: string) => QUESTOES_SPEC.fields.filter((f) => f.ai === ai).map((f) => f.name);
    expect(names("editar")).toEqual(["explanation_A", "explanation_B", "explanation_C", "explanation_D", "expected_conduct", "inep_intent", "topic", "subtopic"]);
    expect(names("conferir")).toEqual(["statement", "option_A", "option_B", "option_C", "option_D", "area"]);
    expect(names("nunca")).toEqual(["correct_option", "status", "kind", "year", "semester", "number", "needs_image"]);
    const by = Object.fromEntries(QUESTOES_SPEC.fields.map((f) => [f.name, f]));
    expect(by.topic).toMatchObject({ base: "item", max: 200 });
    expect(by.subtopic).toMatchObject({ base: "item", max: 300 });
    expect(by.correct_option.owner).toBe("O gabarito só muda pelo registro do gabarito oficial (administrador).");
    expect(QUESTOES_SPEC).toMatchObject({ tab: "questoes", medical: true, material: "material" });
  });

  it("a tabela inteira: ordem, rótulo, tipo, base, tamanho e quem muda", () => {
    const sameText = "Enunciado e alternativas são o texto da prova oficial: o assistente só aponta.";
    const examText = "Prova, ano, edição e número não mudam depois de criada a questão.";
    const rows = QUESTOES_SPEC.fields.map(({ name, label, kind, ai, base, max, owner }) => [name, label, kind, ai, base, max, owner ?? null]);
    expect(rows).toEqual([
      ...LETTERS.map((l) => [`explanation_${l}`, `Explicação da ${l}`, "text", "editar", "fonte", 4000, null]),
      ["expected_conduct", "Conduta esperada", "text", "editar", "fonte", 4000, null],
      ["inep_intent", "O que a questão avalia", "text", "editar", "fonte", 4000, null],
      ["topic", "Tema", "text", "editar", "item", 200, null],
      ["subtopic", "Subtema", "text", "editar", "item", 300, null],
      ["statement", "Enunciado", "text", "conferir", "item", 20000, sameText],
      ...LETTERS.map((l) => [`option_${l}`, `Alternativa ${l}`, "text", "conferir", "item", 4000, sameText]),
      ["area", "Grande área", "text", "conferir", "item", 60, "A grande área fica com a equipe, no formulário."],
      ["correct_option", "Gabarito", "text", "nunca", "item", 1, "O gabarito só muda pelo registro do gabarito oficial (administrador)."],
      ["status", "Situação", "text", "nunca", "item", 40, "A situação só muda pelo registro do gabarito oficial (administrador)."],
      ["kind", "Prova", "text", "nunca", "item", 20, examText],
      ["year", "Ano", "text", "nunca", "item", 20, examText],
      ["semester", "Edição", "text", "nunca", "item", 20, examText],
      ["number", "Número", "text", "nunca", "item", 20, examText],
      ["needs_image", "Cita figura", "text", "nunca", "item", 3, 'A marca "cita figura" fica com a equipe, no formulário.'],
    ]);
    expect(QUESTOES_SPEC.fields.every((f) => f.itemMax === undefined)).toBe(true);
  });

  it("values lê as explicações; patch troca só a alternativa pedida", () => {
    const form = { topic: "T", options: LETTERS.map((id) => ({ id, text: id.toLowerCase(), explanation: id === "B" ? "Velha." : "" })) };
    expect(QUESTOES_SPEC.values(form)).toMatchObject({ explanation_B: "Velha.", option_A: "a", topic: "T" });
    const p = QUESTOES_SPEC.patch(form, "explanation_A", "Nova.");
    expect(p.options[0]).toEqual({ id: "A", text: "a", explanation: "Nova." });
    expect(p.options[1].explanation).toBe("Velha.");
    expect(QUESTOES_SPEC.patch(form, "topic", "Bronquiolite")).toEqual({ topic: "Bronquiolite" });
  });

  it("values devolve todos os campos como texto, com 'cita figura' em sim/não", () => {
    const form = {
      kind: "REVALIDA", year: 2024, semester: "1", number: "12", area: "PEDIATRIA", topic: null, subtopic: undefined,
      statement: "Lactente com sibilância.", correct_option: "C", status: "valid", expected_conduct: "Suporte.", inep_intent: "",
      needs_image: true, options: LETTERS.map((id) => ({ id, text: `Texto ${id}`, explanation: `Explica ${id}` })),
    };
    const v = QUESTOES_SPEC.values(form);
    expect(Object.keys(v)).toEqual(QUESTOES_SPEC.fields.map((f) => f.name));
    expect(v).toMatchObject({
      explanation_D: "Explica D", option_C: "Texto C", year: "2024", number: "12", topic: "", subtopic: "", correct_option: "C",
      status: "valid", needs_image: "sim", expected_conduct: "Suporte.", inep_intent: "",
    });
    expect(QUESTOES_SPEC.values({ ...form, needs_image: false }).needs_image).toBe("não");
    // Formulário sem alternativas: explicações e alternativas vazias, sem erro.
    expect(QUESTOES_SPEC.values({})).toMatchObject({ explanation_A: "", option_D: "", topic: "", needs_image: "não" });
  });

  it("patch não muda o formulário recebido e escreve o texto da alternativa dentro de options", () => {
    const options = LETTERS.map((id) => ({ id, text: id, explanation: "" }));
    const form = { topic: "T", options };
    const p = QUESTOES_SPEC.patch(form, "explanation_C", "Por que a C.");
    expect(Object.keys(p)).toEqual(["options"]);
    expect(p.options.map((o: { explanation: string }) => o.explanation)).toEqual(["", "", "Por que a C.", ""]);
    expect(form.options).toBe(options);
    expect(options[2].explanation).toBe("");
    const t = QUESTOES_SPEC.patch(form, "option_B", "Texto novo");
    expect(t.options[1]).toEqual({ id: "B", text: "Texto novo", explanation: "" });
    expect(t.options[0]).toBe(options[0]);
  });
});

describe("assistente das abas — valores e textos comuns", () => {
  it("sameValue, valueText e isEmptyValue", () => {
    expect(sameValue([{ year: 2024, text: "a" }], [{ year: 2024, text: "a" }])).toBe(true);
    expect(sameValue("a ", "a")).toBe(false);
    expect(valueText([{ year: 2024, text: "Mudou." }])).toBe("2024: Mudou.");
    expect(valueText([{ front: "F", back: "V" }])).toBe("F → V");
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue("x")).toBe(false);
  });

  it("sameValue: nulo e ausente são iguais; ordem das chaves não importa; ordem da lista e tipo importam", () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(undefined, undefined)).toBe(true);
    expect(sameValue(null, "")).toBe(false);
    expect(sameValue({ front: "F", back: "V", type: "O_QUE_MUDOU" }, { type: "O_QUE_MUDOU", back: "V", front: "F" })).toBe(true);
    expect(sameValue([{ front: "F", back: "V", type: "X" }], [{ front: "F", back: "V" }])).toBe(false);
    expect(sameValue(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameValue([{ year: 2024, text: "a" }], [{ year: "2024", text: "a" }])).toBe(false);
    expect(sameValue(["a"], "a")).toBe(false);
  });

  it("valueText: texto como está, lista uma por linha, várias entradas e vazio", () => {
    expect(valueText("Texto livre.")).toBe("Texto livre.");
    expect(valueText(["Simulados", "Tutor por voz"])).toBe("Simulados\nTutor por voz");
    expect(valueText([{ year: 2019, text: "Antes." }, { year: 2024, text: "Depois." }])).toBe("2019: Antes.\n2024: Depois.");
    expect(valueText([{ front: "Pergunta", back: "Resposta" }, { front: "P2", back: "R2", type: "X" }] as never)).toBe("Pergunta → Resposta\nP2 → R2");
    expect(valueText(null)).toBe("");
    expect(valueText(undefined)).toBe("");
    expect(valueText([])).toBe("");
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue([{ year: 2024, text: "" }])).toBe(false);
  });

  it("textos exatos", () => expect(ASSIST_TEXTS).toMatchObject({ noSource: "Sem fonte: cole um trecho da diretriz ou envie o material", stale: "O campo mudou depois da proposta: peça de novo", aiReason: "assistente de IA" }));

  it("todos os textos exatos das regras globais (com os três da decisão A9)", () => {
    expect(ASSIST_TEXTS).toEqual({
      noSource: "Sem fonte: cole um trecho da diretriz ou envie o material",
      discarded: "Sugestão para campo que o assistente não muda foi descartada",
      suspeita: "Suspeita sem fonte: confira antes de mudar",
      stale: "O campo mudou depois da proposta: peça de novo",
      diverge: "A fonte diverge do gabarito oficial: veja o Conferir",
      newFeature: "Recurso novo: confirme que o plano tem",
      annulled: "Questão anulada: sem explicação de gabarito.",
      questoesNotice: "O que você salvar aparece na hora para o aluno.",
      figure: "a questão cita uma figura que o assistente não vê",
      aiReason: "assistente de IA",
      mockLabel: "Simulação (sem IA)",
      gabaritoOwner: "O gabarito só muda pelo registro do gabarito oficial (administrador).",
      aiDefined: "IA definida na Central de IAs: {IA} {modelo}",
      centralName: "Assistente: conversar e revisar",
      noAnswer: "Grave o gabarito antes de pedir as explicações.",
      contradicts: "A explicação contradiz o gabarito gravado.",
    });
  });

  it("aiDefinedText monta a linha da IA a partir do modelo do texto", () => {
    expect(aiDefinedText("Gemini", "gemini-2.5-pro")).toBe("IA definida na Central de IAs: Gemini gemini-2.5-pro");
    expect(aiDefinedText("Gemini", null)).toBe("IA definida na Central de IAs: Gemini");
  });
});
