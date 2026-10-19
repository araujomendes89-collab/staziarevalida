// @vitest-environment node
/**
 * Enunciado com figuras e tabelas na posição certa (defeito da Revalida 2024/2 Q73, relatado pelo dono em 19/10/2026).
 * - Nas questões com figura ou tabela, a frase que apresenta a figura termina em ":" ("...revelam:"). Ela é do caso, não da pergunta.
 * - Cada figura pode ter `apos`: um trecho exato do enunciado que aparece UMA vez. A figura entra logo depois dele. Sem `apos` (ou com
 *   trecho que sumiu ou se repete), a figura fica onde sempre ficou: depois do caso, antes da pergunta.
 */
import { describe, expect, it } from "vitest";
import { montarEnunciado, splitStatement } from "../novo/app/practice/format.js";

const Q73 =
  "Na maternidade, um recém-nascido (RN) de 30 horas de vida, evolui com icterícia zona 3 de Kramer. Nasceu com 36 semanas de idade gestacional (IG), de parto vaginal, tendo algumas equimoses durante o parto. A tipagem sanguínea da mãe é O- e do RN é B+. Os exames laboratoriais, realizados quando a criança estava com 32 horas de vida, revelam: Considerando-se o caso e a tabela de referência apresentados, a conduta médica adequada é";
const PERGUNTA_Q73 = "Considerando-se o caso e a tabela de referência apresentados, a conduta médica adequada é";
const PEDIATRA =
  "O pediatra, ao ver esses resultados, iniciou fototerapia de alta intensidade e transferiu o paciente para unidade de cuidados neonatais. Após 4 horas de fototerapia (com 36 horas de vida) obteve-se:";
const Q73_FIEL = Q73.replace(" Considerando-se", ` ${PEDIATRA} Considerando-se`);

describe("splitStatement: ':' só é fim de frase nas questões com figura ou tabela", () => {
  it("Q73 (com figura): a frase dos exames fica no caso e a pergunta é só a pergunta", () => {
    const { stem, ask } = splitStatement(Q73, { comFigura: true });
    expect(ask).toBe(PERGUNTA_Q73);
    expect(stem.endsWith("revelam:")).toBe(true);
    expect(`${stem} ${ask}`).toBe(Q73);
  });

  it("sem figura, nada muda (KDIGO 'Disease: Improving' não pode quebrar)", () => {
    const kdigo = "Paciente com doença renal crônica. Segundo o KDIGO (Kidney Disease: Improving Global Outcomes), a conduta correta seria";
    expect(splitStatement(kdigo).ask).toBe("Segundo o KDIGO (Kidney Disease: Improving Global Outcomes), a conduta correta seria");
    expect(splitStatement(Q73).ask.startsWith("Os exames laboratoriais")).toBe(true); // comportamento antigo, sem a opção
  });
});

describe("montarEnunciado: blocos na ordem da prova", () => {
  it("sem figura: texto e pergunta, como sempre", () => {
    expect(montarEnunciado({ statement: "Criança com febre há dois dias. Qual a conduta mais adequada?" })).toEqual([
      { tipo: "texto", texto: "Criança com febre há dois dias." },
      { tipo: "pergunta", texto: "Qual a conduta mais adequada?" },
    ]);
  });

  it("Q73 como está hoje (uma figura, sem posição): caso até 'revelam:' -> figura -> pergunta", () => {
    const blocos = montarEnunciado({ statement: Q73, images: [{ path: "questoes/a.png", alt: "Três tabelas" }] });
    expect(blocos.map((b) => b.tipo)).toEqual(["texto", "figuras", "pergunta"]);
    expect(blocos[0].texto.endsWith("revelam:")).toBe(true);
    expect(blocos[1].indices).toEqual([0]);
    expect(blocos[2].texto).toBe(PERGUNTA_Q73);
  });

  it("Q73 fiel à prova: tabela 1 depois de 'revelam:', tabelas 2 e 3 depois de 'obteve-se:', pergunta no fim", () => {
    const images = [
      { path: "questoes/t1.png", alt: "Tabela 1", apos: "revelam:", tipo: "tabela" },
      { path: "questoes/t2.png", alt: "Tabela 2", apos: "obteve-se:", tipo: "tabela" },
      { path: "questoes/t3.png", alt: "Tabela 3", apos: "obteve-se:", tipo: "tabela" },
    ];
    const blocos = montarEnunciado({ statement: Q73_FIEL, images });
    expect(blocos).toEqual([
      { tipo: "texto", texto: Q73.slice(0, Q73.indexOf(" Considerando-se")) },
      { tipo: "figuras", indices: [0] },
      { tipo: "texto", texto: PEDIATRA },
      { tipo: "figuras", indices: [1, 2] },
      { tipo: "pergunta", texto: PERGUNTA_Q73 },
    ]);
  });

  it("figura no meio do caso: o texto depois dela continua o caso; a pergunta continua no fim", () => {
    const statement = "Sinais vitais: Ao exame físico, abdome doloroso. Nesse caso, qual é a principal hipótese diagnóstica?";
    const blocos = montarEnunciado({ statement, images: [{ url: "/sv.png", alt: "Sinais vitais", apos: "Sinais vitais:" }] });
    expect(blocos).toEqual([
      { tipo: "texto", texto: "Sinais vitais:" },
      { tipo: "figuras", indices: [0] },
      { tipo: "texto", texto: "Ao exame físico, abdome doloroso." },
      { tipo: "pergunta", texto: "Nesse caso, qual é a principal hipótese diagnóstica?" },
    ]);
  });

  it("trecho que sumiu ou que se repete: a figura volta ao lugar de sempre (sem perder o índice original)", () => {
    const statement = "Exame A normal. Exame B normal. Qual o diagnóstico mais provável?";
    const images = [
      { url: "/a.png", alt: "a", apos: "normal." }, // aparece duas vezes
      { url: "/b.png", alt: "b", apos: "trecho que não existe" },
      { url: "/c.png", alt: "c", apos: "Exame A normal." },
    ];
    expect(montarEnunciado({ statement, images })).toEqual([
      { tipo: "texto", texto: "Exame A normal." },
      { tipo: "figuras", indices: [2] },
      { tipo: "texto", texto: "Exame B normal." },
      { tipo: "figuras", indices: [0, 1] },
      { tipo: "pergunta", texto: "Qual o diagnóstico mais provável?" },
    ]);
  });

  it("tabela de apoio (Questões Inéditas) fica depois das figuras, antes da pergunta", () => {
    const blocos = montarEnunciado({ statement: "Caso com exames. Qual a conduta mais adequada?", images: [{ url: "/x.png", alt: "x" }], support: { title: "Exames", rows: [] } });
    expect(blocos.map((b) => b.tipo)).toEqual(["texto", "figuras", "apoio", "pergunta"]);
  });

  it("figura ancorada no fim do texto, sem pergunta separável: figura no fim", () => {
    const statement = "Com base nesses dados, analise a imagem";
    expect(montarEnunciado({ statement, images: [{ url: "/x.png", alt: "x", apos: "analise a imagem" }] })).toEqual([
      { tipo: "texto", texto: statement },
      { tipo: "figuras", indices: [0] },
    ]);
  });

  it("depois da última figura, uma frase só (sem ponto antes) vira a pergunta", () => {
    const statement = "Radiografia de tórax abaixo O diagnóstico e a conduta inicial indicada para esse paciente são";
    expect(montarEnunciado({ statement, images: [{ url: "/x.png", alt: "x", apos: "Radiografia de tórax abaixo" }] })).toEqual([
      { tipo: "texto", texto: "Radiografia de tórax abaixo" },
      { tipo: "figuras", indices: [0] },
      { tipo: "pergunta", texto: "O diagnóstico e a conduta inicial indicada para esse paciente são" },
    ]);
  });

  it("nenhum texto se perde nem muda de ordem", () => {
    const images = [{ url: "/a.png", alt: "a", apos: "revelam:" }];
    const blocos = montarEnunciado({ statement: Q73, images });
    const junto = blocos.filter((b) => b.texto).map((b) => b.texto).join(" ");
    expect(junto).toBe(Q73);
  });

  it("enunciado vazio ou nulo", () => {
    expect(montarEnunciado({ statement: null })).toEqual([]);
    expect(montarEnunciado({ statement: "", images: [{ url: "/a.png", alt: "a" }] })).toEqual([{ tipo: "figuras", indices: [0] }]);
  });
});
