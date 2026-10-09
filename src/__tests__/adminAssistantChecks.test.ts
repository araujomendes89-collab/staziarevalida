// @vitest-environment node
// Assistente das abas: esquemas por modo e conferências da resposta da IA sem confiar nela (server/adminAssistant).
import { describe, expect, it } from "vitest";
import { validate } from "../../server/contentHub/ai/schema";
import { ADMIN_ASSIST_VERSION, VALUE_SCHEMA, fitOutput, pickValue, schemaFor } from "../../server/adminAssistant/schemas";
import {
  checkValue,
  isRewording,
  newLines,
  numberWarning,
  resolveMarks,
  toSourceRefs,
  unknownSourceWarning,
  unsupportedNumbers,
  yearWarning,
  yearsNotCited,
  type MarkRef,
} from "../../server/adminAssistant/checks";
import { httpError } from "../../server/adminAssistant/types";
import type { AdapterField } from "../shared/adminAssistant/types";

const table = new Map<string, MarkRef>([
  ["T1", { mark: "T1", kind: "material", label: "p. 3", text: "Oxigênio se saturação abaixo de 90%." }],
  ["F1", { mark: "F1", kind: "oficial", label: "Ministério da Saúde — PCDT (nível A)", text: "Suporte é a base." }],
]);
const V = (text: string | null, more: Record<string, unknown> = {}) => ({ text, items: null, timeline: null, flashcards: null, ...more });
const TIMELINE: AdapterField = { name: "timeline", label: "Linha do tempo", kind: "timeline", ai: "editar", base: "fonte", max: 30, itemMax: 2000 };
const FLASHCARDS: AdapterField = { name: "flashcards", label: "Flashcards", kind: "flashcards", ai: "editar", base: "fonte", max: 40, itemMax: 2000 };
const FEATURES: AdapterField = { name: "features", label: "Recursos incluídos", kind: "lines", ai: "editar", base: "notas", max: 20, itemMax: 120 };

describe("assistente das abas — marcas e fontes", () => {
  it("marcas: válidas na ordem, inexistentes à parte", () =>
    expect(resolveMarks(["T1", "X", "T9", "F1", "T1"], new Map(table))).toEqual({ refs: [table.get("T1"), table.get("F1")], unknown: ["X", "T9"] }));

  it("marcas com colchetes ou espaços valem; resposta que não é lista não cita nada", () => {
    expect(resolveMarks([" [T1] ", "f1", "T9", "T9"], table)).toEqual({ refs: [table.get("T1"), table.get("F1")], unknown: ["T9"] });
    expect(resolveMarks(null, table)).toEqual({ refs: [], unknown: [] });
    expect(resolveMarks("T1", table)).toEqual({ refs: [], unknown: [] });
  });

  it("fontes para a tela sem rótulo repetido", () => {
    const twin: MarkRef = { mark: "T2", kind: "material", label: "p. 3", text: "Outro trecho da mesma página." };
    expect(toSourceRefs([table.get("T1")!, twin, table.get("F1")!])).toEqual([
      { label: "p. 3", kind: "material" },
      { label: "Ministério da Saúde — PCDT (nível A)", kind: "oficial" },
    ]);
  });

  it("textos dos avisos", () => {
    expect(numberWarning("Conduta esperada", "2 mg")).toBe('Conduta esperada: "2 mg" não está nas fontes citadas.');
    expect(yearWarning("Linha do tempo", 2019)).toBe("Linha do tempo: o ano 2019 não está no trecho citado.");
    expect(unknownSourceWarning("Tema", ["T9", "X"])).toBe("Tema: fonte inexistente descartada (T9, X).");
  });

  it("erro com status HTTP", () => {
    const e = httpError(403, "Acesso restrito à equipe.");
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({ status: 403, message: "Acesso restrito à equipe." });
  });
});

describe("assistente das abas — formato e tamanho de cada campo", () => {
  it("texto acima do limite é descartado com aviso", () => {
    const r = checkValue({ name: "topic", label: "Tema", kind: "text", ai: "editar", base: "item", max: 10 }, "x".repeat(11), null, false);
    expect(r).toEqual({ value: null, warnings: ["Tema: passa de 10 caracteres; sugestão descartada."] });
  });

  it("texto no limite passa sem aviso", () => {
    const r = checkValue({ name: "topic", label: "Tema", kind: "text", ai: "editar", base: "item", max: 10 }, "x".repeat(10), "antes", false);
    expect(r).toEqual({ value: "x".repeat(10), warnings: [] });
  });

  it("lista: item longo sai e o total respeita o máximo ao acrescentar", () => {
    const r = checkValue(FEATURES, ["Novo 1", "y".repeat(121), "Novo 2", "Novo 3"], Array.from({ length: 18 }, (_, i) => `R${i}`), true);
    expect(r.value).toEqual(["Novo 1", "Novo 2"]);
    expect(r.warnings).toEqual(["Recursos incluídos: item com mais de 120 caracteres descartado.", "Recursos incluídos: no máximo 20 itens; 1 ficaram de fora."]);
  });

  it("lista já cheia: nada a acrescentar vira nulo com aviso", () => {
    const r = checkValue(FEATURES, ["Novo"], Array.from({ length: 20 }, (_, i) => `R${i}`), true);
    expect(r).toEqual({ value: null, warnings: ["Recursos incluídos: no máximo 20 itens; 1 ficaram de fora."] });
  });

  it("lista sem acréscimo também respeita o máximo do campo", () => {
    const r = checkValue(FEATURES, Array.from({ length: 22 }, (_, i) => `N${i}`), ["R0"], false);
    expect(r.value).toHaveLength(20);
    expect(r.warnings).toEqual(["Recursos incluídos: no máximo 20 itens; 2 ficaram de fora."]);
  });

  it("linha do tempo fora de 2000–2100 e flashcard fora do formato saem com aviso", () => {
    const tl = checkValue(TIMELINE, [{ year: 2024, text: "Mudou." }, { year: 1990, text: "Antigo." }, { year: 2025, text: "" }, { year: 2101, text: "Futuro." }], [], true);
    expect(tl.value).toEqual([{ year: 2024, text: "Mudou." }]);
    expect(tl.warnings).toEqual(["Linha do tempo: ano 1990 fora de 2000–2100; item descartado.", "Linha do tempo: ano 2101 fora de 2000–2100; item descartado."]);
    const fc = checkValue(FLASHCARDS, [{ front: "ab", back: "x" }, { front: "Dose?", back: "150 mg" }, { front: "Pergunta?", back: "" }], [], true);
    expect(fc.value).toEqual([{ front: "Dose?", back: "150 mg" }]);
    const bad = "Flashcards: flashcard fora do formato (frente de 3 a 2.000 e verso de 1 a 2.000 caracteres); descartado.";
    expect(fc.warnings).toEqual([bad, bad]);
  });

  it("linha do tempo: texto de um ano acima do limite sai; lista que fica vazia vira nulo", () => {
    const r = checkValue(TIMELINE, [{ year: 2024, text: "z".repeat(2001) }], [], true);
    expect(r).toEqual({ value: null, warnings: ["Linha do tempo: item com mais de 2000 caracteres descartado."] });
  });

  it("linha do tempo e flashcards também param no máximo do campo ao acrescentar", () => {
    const current = Array.from({ length: 29 }, (_, i) => ({ year: 2000 + i, text: "a" }));
    const r = checkValue(TIMELINE, [{ year: 2030, text: "b" }, { year: 2031, text: "c" }], current, true);
    expect(r.value).toEqual([{ year: 2030, text: "b" }]);
    expect(r.warnings).toEqual(["Linha do tempo: no máximo 30 itens; 1 ficaram de fora."]);
    const cards = Array.from({ length: 40 }, () => ({ front: "Pergunta?", back: "Sim." }));
    expect(checkValue(FLASHCARDS, [{ front: "Nova?", back: "Sim." }], cards, true)).toEqual({ value: null, warnings: ["Flashcards: no máximo 40 itens; 1 ficaram de fora."] });
  });

  it("ao acrescentar, entrada que já está no campo ou repetida sai calada e não ocupa vaga dos itens novos", () => {
    // a IA repete os 30 flashcards do item (sem o `type` que os atuais guardam) e traz 2 novos: só os 2 novos ficam
    const current = Array.from({ length: 30 }, (_, i) => ({ front: `Pergunta ${i}?`, back: `Resposta ${i}.`, type: "O_QUE_MUDOU" }));
    const echoed = [...current.map(({ front, back }) => ({ front, back })), { front: "Nova 1?", back: "Sim." }, { front: "Nova 2?", back: "Não." }];
    expect(checkValue(FLASHCARDS, echoed, current, true)).toEqual({ value: [{ front: "Nova 1?", back: "Sim." }, { front: "Nova 2?", back: "Não." }], warnings: [] });
    expect(checkValue(FEATURES, ["Questões comentadas", "Questões comentadas"], ["Questões comentadas"], true)).toEqual({ value: null, warnings: [] });
    expect(checkValue(FEATURES, ["Mentoria", "Simulados", "Mentoria"], ["Questões comentadas"], true)).toEqual({ value: ["Mentoria", "Simulados"], warnings: [] });
    const year = [{ year: 2024, text: "Mudou." }];
    expect(checkValue(TIMELINE, [{ year: 2024, text: "Mudou." }, { year: 2025, text: "Mudou de novo." }], year, true)).toEqual({
      value: [{ year: 2025, text: "Mudou de novo." }],
      warnings: [],
    });
    // repetidas saem antes de contar a vaga: 19 atuais + 1 repetida + 1 nova cabem sem aviso
    const nineteen = Array.from({ length: 19 }, (_, i) => `R${i}`);
    expect(checkValue(FEATURES, ["R3", "Novo"], nineteen, true)).toEqual({ value: ["Novo"], warnings: [] });
  });

  it("valor de formato errado para o campo é descartado com aviso", () => {
    const r = checkValue({ name: "topic", label: "Tema", kind: "text", ai: "editar", base: "item", max: 200 }, ["a"], null, false);
    expect(r).toEqual({ value: null, warnings: ["Tema: fora do formato; sugestão descartada."] });
  });
});

describe("assistente das abas — números, anos e recursos", () => {
  it("números: com unidade (abas médicas) e qualquer número (Planos)", () => {
    expect(unsupportedNumbers("Corticoide 2 mg/kg ajuda.", ["Oxigênio se saturação abaixo de 90%."], "unidade")).toEqual(["2 mg"]);
    expect(unsupportedNumbers("R$ 129,90 com 45 minutos", ["Preço R$ 129,90 e 30 minutos de voz"], "qualquer")).toEqual(["45"]);
  });

  it("corte em % e prazo no singular também contam, seguidos de espaço, pontuação ou fim do texto", () => {
    const cited = ["Oxigênio se saturação abaixo de 90%."];
    expect(unsupportedNumbers("Oxigênio se saturação abaixo de 92% e hidratação.", cited, "unidade")).toEqual(["92%"]);
    expect(unsupportedNumbers("Oxigênio abaixo de 92%.", cited, "unidade")).toEqual(["92%"]);
    expect(unsupportedNumbers("Corte novo (92%) na diretriz.", cited, "unidade")).toEqual(["92%"]);
    expect(unsupportedNumbers("Oxigênio abaixo de 92%", cited, "unidade")).toEqual(["92%"]);
    expect(unsupportedNumbers("Oxigênio abaixo de 90%.", cited, "unidade")).toEqual([]);
    expect(unsupportedNumbers("Tratar por 1 ano e reavaliar em 1 mês.", ["Tratar por 2 anos."], "unidade")).toEqual(["1 ano", "1 mês"]);
    // unidade só vale como palavra inteira: "2 gotas" e "3 hábitos" não são "2 g" e "3 h"
    expect(unsupportedNumbers("Tomar 2 gotas e mudar 3 hábitos.", cited, "unidade")).toEqual([]);
  });

  it("número inteiro: 2 não vale por estar dentro de 20 ou de 1,25; repetido avisa uma vez", () => {
    expect(unsupportedNumbers("Até 2 planos e 2 meses.", ["Vale por 20 dias ou 1,25 mês."], "qualquer")).toEqual(["2"]);
    expect(unsupportedNumbers("Preço R$ 1.299,90.", ["Preço R$ 1.299,90 por ano"], "qualquer")).toEqual([]);
    expect(unsupportedNumbers("Sem número.", [], "qualquer")).toEqual([]);
  });

  it("anos fora do trecho e recursos novos", () => {
    expect(yearsNotCited([{ year: 2024, text: "a" }, { year: 2019, text: "b" }], ["Em 2024 mudou."])).toEqual([2019]);
    expect(newLines(["Simulados com correção", "Mentoria individual"], ["Inclui simulados com CORREÇÃO e questões."])).toEqual(["Mentoria individual"]);
  });

  it("ano só vale inteiro no trecho e cada ano aparece uma vez", () => {
    expect(yearsNotCited([{ year: 2024, text: "a" }, { year: 2024, text: "b" }], ["Protocolo 120245 e 20240."])).toEqual([2024]);
  });

  it("recurso conhecido com espaços e acentos diferentes não é novo", () => {
    expect(newLines(["  Questões   comentadas "], ["questoes comentadas"])).toEqual([]);
  });
});

describe("assistente das abas — esquemas por modo", () => {
  it("esquemas aceitam a resposta de cada modo e recusam campo a mais", () => {
    expect(validate(schemaFor("conferir"), { findings: [{ field: null, kind: "erro", detail: "x", sources: [] }] })).toEqual([]);
    expect(validate(schemaFor("preencher"), { suggestions: [], missing: [], extra: 1 }).length).toBeGreaterThan(0);
  });

  it("cada modo com seus campos obrigatórios", () => {
    expect(ADMIN_ASSIST_VERSION).toBe("1.0.0");
    const preencher = { suggestions: [{ field: "expected_conduct", value: V("Suporte."), sources: ["T1"] }], missing: [{ field: "inep_intent", reason: "A fonte não diz." }] };
    expect(validate(schemaFor("preencher"), preencher)).toEqual([]);
    const conversar = { reply: "Feito.", changes: [{ field: "expected_conduct", after: V("Suporte clínico."), sources: ["I1"], reason: "Mais claro." }] };
    expect(validate(schemaFor("conversar"), conversar)).toEqual([]);
    expect(validate(schemaFor("conversar"), { reply: "Feito.", changes: [{ field: "x", after: V("y"), sources: [] }] }).length).toBeGreaterThan(0);
    expect(validate(schemaFor("conferir"), { findings: [{ field: "topic", kind: "talvez", detail: "x", sources: [] }] }).length).toBeGreaterThan(0);
    expect(validate(schemaFor("preencher"), { suggestions: [{ field: "topic", value: { text: "x" }, sources: [] }], missing: [] }).length).toBeGreaterThan(0);
  });

  it("limites do valor iguais aos maiores campos de lista (decisão A3): 20 recursos, 30 anos, 40 flashcards", () => {
    const n = (k: number, f: (i: number) => unknown) => Array.from({ length: k }, (_, i) => f(i));
    const year = (i: number) => ({ year: 2000 + i, text: "a" });
    const card = () => ({ front: "Pergunta?", back: "Sim." });
    expect(validate(VALUE_SCHEMA, V(null, { items: n(20, (i) => `R${i}`) }))).toEqual([]);
    expect(validate(VALUE_SCHEMA, V(null, { items: n(21, (i) => `R${i}`) })).length).toBeGreaterThan(0);
    expect(validate(VALUE_SCHEMA, V(null, { timeline: n(30, year) }))).toEqual([]);
    expect(validate(VALUE_SCHEMA, V(null, { timeline: n(31, year) })).length).toBeGreaterThan(0);
    expect(validate(VALUE_SCHEMA, V(null, { flashcards: n(40, card) }))).toEqual([]);
    expect(validate(VALUE_SCHEMA, V(null, { flashcards: n(41, card) })).length).toBeGreaterThan(0);
    expect(validate(VALUE_SCHEMA, V("x".repeat(6000)))).toEqual([]);
    expect(validate(VALUE_SCHEMA, V("x".repeat(6001))).length).toBeGreaterThan(0);
  });

  it("pickValue: a parte do tipo do campo, aparada; vazia vira nulo", () => {
    expect(pickValue("text", V("  Suporte.  "))).toBe("Suporte.");
    expect(pickValue("text", V("   "))).toBeNull();
    expect(pickValue("text", V(null, { items: ["a"] }))).toBeNull();
    expect(pickValue("lines", V("ignorado", { items: [" Simulados ", "", "  "] }))).toEqual(["Simulados"]);
    expect(pickValue("lines", V(null, { items: [] }))).toBeNull();
    expect(pickValue("timeline", V(null, { timeline: [{ year: 2024, text: " Mudou. " }] }))).toEqual([{ year: 2024, text: "Mudou." }]);
    expect(pickValue("flashcards", V(null, { flashcards: [{ front: " Dose? ", back: " 150 mg " }] }))).toEqual([{ front: "Dose?", back: "150 mg" }]);
    expect(pickValue("flashcards", V(null))).toBeNull();
  });
});

describe("assistente das abas — fontes que não são marca e Só redação (decisão D5)", () => {
  it("fitOutput só separa marcas quando a fonte é só marcas e separadores; o resto fica como marca desconhecida, cortada se longa", () => {
    const sources = ["T1, T2", "[I9]", " t3 ; F2 ", "I9 e literatura", "Diretriz SBP 2023", "T1", "Livro", "[T1]      x"];
    const { output, warnings } = fitOutput("preencher", { suggestions: [{ field: "topic", value: V("Bronquiolite"), sources }], missing: [] }) as any;
    expect(output.suggestions[0].sources).toEqual(["T1", "T2", "I9", "T3", "F2", "I9 e li…", "Diretri…", "Livro"]);
    expect(warnings).toEqual(["Resposta da IA acima do limite de 8 marcas de fonte: 1 ficou de fora."]);
    expect(validate(schemaFor("preencher"), output)).toEqual([]);
    // texto livre (inteiro ou cortado) nunca vira uma marca do pedido, mesmo começando por uma marca
    const free = ["sem trecho: T1 não cobre isso", "conforme T1, sem fonte externa", "T1 e literatura", "[T1]      x", "T1 x", "F1 (PCDT)"];
    const fitted = (fitOutput("conferir", { findings: [{ field: null, kind: "erro", detail: "x", sources: free }] }).output as any).findings[0].sources;
    expect(fitted.every((s: string) => s.length <= 8)).toBe(true);
    expect(resolveMarks(fitted, table)).toEqual({ refs: [], unknown: ["SEM TRE…", "CONFORM…", "T1 E LI…", "T1]…", "T1 X", "F1 (PCD…"] });
    // só marcas e separadores: separa sem repetir
    const marks = (fitOutput("conversar", { reply: "x", changes: [{ field: "topic", after: V("x"), sources: ["[T1] [F1]", "t1;F1", "T1 / F1."], reason: "x" }] }).output as any).changes[0].sources;
    expect(marks).toEqual(["T1", "F1"]);
  });

  it("reescrita: 60% das palavras de 4+ letras do texto novo (sem acento, sem repetir) estão no atual", () => {
    const current = "Suporte com oxigênio e hidratação venosa.";
    // 3 de 5 (60%): suporte, oxigenio, hidratacao estão; observar e sinais não
    expect(isRewording("Suporte, OXIGENIO e hidratacao; observar sinais.", current)).toBe(true);
    // 2 de 4 (50%)
    expect(isRewording("Suporte com oxigênio, corticoide e nebulização.", current)).toBe(false);
    // palavra repetida conta uma vez: suporte e corticoide (50%)
    expect(isRewording("Suporte, suporte, suporte e corticoide.", "Suporte.")).toBe(false);
    // sem palavra de 4+ letras no texto novo não há como conferir: não é reescrita
    expect(isRewording("O2 e IV.", "Oxigênio e via venosa.")).toBe(false);
    // campo com uma letra (ou vazio) reescrito em texto médico novo
    expect(isRewording("Oxigênio se saturação abaixo de 92%.", "S.")).toBe(false);
    expect(isRewording("Suporte.", "")).toBe(false);
  });

  it("reescrita: o texto novo tem no máximo 1,5× o tamanho do atual + 40 caracteres", () => {
    // "Suporte." tem 8 caracteres: até 52
    expect(isRewording(`Suporte${".".repeat(45)}`, "Suporte.")).toBe(true);
    expect(isRewording(`Suporte${".".repeat(46)}`, "Suporte.")).toBe(false);
    // espaços das pontas não contam
    expect(isRewording(`  Suporte${".".repeat(45)}  `, "  Suporte.  ")).toBe(true);
  });
});
