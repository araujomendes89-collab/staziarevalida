/**
 * Treinamento em Dupla · etapa 3 · tarefa 9: separação do conteúdo da estação para a sala (content.js).
 * Só texto de teste: nenhuma estação, pessoa ou nota de verdade.
 */
import { describe, expect, it } from "vitest";
import { ACTOR_LABELS, splitActorScript, splitBlocks, splitTasks, toPepItems } from "../novo/app/dupla/content.js";

describe("conteúdo da estação para a sala", () => {
  it("os rótulos do roteiro são os da Montagem, na ordem", () => {
    expect(ACTOR_LABELS).toEqual([
      "Dados pessoais",
      "Motivo da consulta",
      "História atual",
      "Antecedentes",
      "Hábitos",
      "Respostas condicionais",
      "Dúvidas do paciente",
      "Só se perguntado",
      "Orientação",
      "Impressos a liberar",
    ]);
  });

  it("roteiro separado pelos rótulos da Montagem; blocos do cenário; tarefas sem numeração; itens do PEP para a tabela", () => {
    // roteiro: o valor pode estar na mesma linha do rótulo ou nas linhas seguintes
    expect(
      splitActorScript("Dados pessoais:\nPaciente de teste, 40 anos.\n\nSó se perguntado:\nNenhuma alergia conhecida.")
    ).toEqual([
      ["Dados pessoais", "Paciente de teste, 40 anos."],
      ["Só se perguntado", "Nenhuma alergia conhecida."],
    ]);
    expect(splitActorScript("Motivo da consulta: Dor de cabeça.\nHistória atual: Começou ontem.\nViu um médico.")).toEqual([
      ["Motivo da consulta", "Dor de cabeça."],
      ["História atual", "Começou ontem.\nViu um médico."],
    ]);
    // dois-pontos que não são rótulo da Montagem não separam nada
    expect(splitActorScript("Observação: nada a declarar.")).toEqual([["", "Observação: nada a declarar."]]);
    // texto antes do primeiro rótulo não se perde
    expect(splitActorScript("Interprete com calma.\nOrientação: Seguir o roteiro.")).toEqual([
      ["", "Interprete com calma."],
      ["Orientação", "Seguir o roteiro."],
    ]);
    expect(splitActorScript("")).toEqual([]);
    expect(splitActorScript("   \n ")).toEqual([]);
    expect(splitActorScript(null as unknown as string)).toEqual([]);

    // blocos do cenário
    expect(splitBlocks("Cenário um.\n\nCenário dois.\n  \n\nCenário três.\nSegunda linha.")).toEqual([
      "Cenário um.",
      "Cenário dois.",
      "Cenário três.\nSegunda linha.",
    ]);
    expect(splitBlocks("")).toEqual([]);
    expect(splitBlocks(undefined as unknown as string)).toEqual([]);

    // tarefas sem a numeração; linha sem número fica como item próprio, com o texto inteiro
    expect(splitTasks("1. Fazer a anamnese.\n2. Pedir exames;\n10) Orientar o paciente.")).toEqual([
      "Fazer a anamnese.",
      "Pedir exames;",
      "Orientar o paciente.",
    ]);
    expect(splitTasks("1. Primeira.\nObservação: use o impresso.")).toEqual(["Primeira.", "Observação: use o impresso."]);
    expect(splitTasks("")).toEqual([]);

    // itens do PEP: número = ordem; critérios na ordem Inadequado, Parcialmente adequado, Adequado, só com texto
    const items = [
      {
        id: "i1", order: 1, content: "Item um", tip: "Dica um",
        grades: { correct: 2.5, partial: 1.25, incorrect: 0 },
        criteria: { correct: "Adequado um", partial: "Parcial um", incorrect: "Inadequado um" },
        subitems: [],
      },
      {
        id: "i2", order: 2, content: "Item dois", tip: "",
        grades: { correct: 2.5, partial: null, incorrect: 0 },
        criteria: { correct: "Adequado dois", incorrect: "" },
        subitems: [],
      },
      {
        id: "i3", order: 3, content: "Item três", tip: "Dica três",
        grades: { correct: 5, partial: 2.5, incorrect: 0 },
        criteria: { correct: "Adequado três", partial: "Parcial três", incorrect: "Inadequado três" },
        subitems: [{ id: "s1", text: "Subitem um" }, { id: "s2", text: "Subitem dois" }],
      },
    ];
    const pep = toPepItems(items as any);
    expect(pep.map((p) => p.number)).toEqual(["1", "2", "3"]);
    expect(pep[0]).toMatchObject({
      id: "i1",
      text: "Item um",
      tip: "Dica um",
      levels: { incorrect: 0, partial: 1.25, correct: 2.5 },
    });
    expect(pep[0].criteria).toEqual([
      { label: "Inadequado", text: "Inadequado um" },
      { label: "Parcialmente adequado", text: "Parcial um" },
      { label: "Adequado", text: "Adequado um" },
    ]);
    // sem parcial: nível nulo e critério parcial ausente; texto vazio não vira linha; dica vazia some
    expect(pep[1].levels).toEqual({ incorrect: 0, partial: null, correct: 2.5 });
    expect(pep[1].criteria).toEqual([{ label: "Adequado", text: "Adequado dois" }]);
    expect(pep[1].tip).toBeUndefined();
    expect(pep[2].subitems).toEqual([{ id: "s1", text: "Subitem um" }, { id: "s2", text: "Subitem dois" }]);
    // fora de ordem entra na ordem; sem itens → lista vazia
    expect(toPepItems([items[2], items[0]] as any).map((p) => p.id)).toEqual(["i1", "i3"]);
    expect(toPepItems(undefined as any)).toEqual([]);
  });
});
