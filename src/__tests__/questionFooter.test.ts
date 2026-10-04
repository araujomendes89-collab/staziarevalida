import { describe, expect, it } from "vitest";
import { cleanQuestionText } from "../shared/questions/footer";

describe("limpeza de rodapé das questões", () => {
  it.each([
    ["Tratar com penicilina. 2020", "Tratar com penicilina.", ["rodape-ano"]],
    ["Rastrear aos 50 anos. 2023 PRIMEIRA EDIÇÃO", "Rastrear aos 50 anos.", ["rodape-prova-edicao"]],
    ["Alta imediata. 2022 EDIÇÃO 2022/2", "Alta imediata.", ["rodape-prova-edicao"]],
    ["Observação clínica. Espaço livre Revalida 2022", "Observação clínica.", ["rodape-prova-edicao"]],
    ["negativo 0,9-1,03 29-35 segundos Revalida 2022", "negativo 0,9-1,03 29-35 segundos", ["rodape-prova-edicao"]],
    ["Diabetes gestacional controlada com dieta. enamed Exame Nacional de Avaliação da Formação Médica", "Diabetes gestacional controlada com dieta.", ["rodape-enamed"]],
    ["Erradicação por 10 dias. PRIMEIRA EDIÇÃO", "Erradicação por 10 dias.", ["rodape-edicao"]],
    ["Fim da prova. REVALIDA 2020 2020", "Fim da prova.", ["rodape-prova-edicao"]],
  ])("remove o rodapé de %j", (input, expected, rules) => {
    const r = cleanQuestionText(input);
    expect(r.text).toBe(expected);
    expect(r.removed.map((x) => x.rule)).toEqual(rules);
  });

  it("corta a pesquisa de satisfação arrastada pela última questão e registra o que saiu", () => {
    const r = cleanQuestionText("imunoglobulina humana Anti-hepatite B. 2020 QUESTIONÁRIO DE PERCEPÇÃO SOBRE A PROVA As perguntas abaixo visam…");
    expect(r.text).toBe("imunoglobulina humana Anti-hepatite B.");
    expect(r.removed.map((x) => x.rule)).toEqual(["rodape-ano", "questionario-de-percepcao"]);
    expect(r.removed[1].text).toMatch(/^QUESTIONÁRIO DE PERCEPÇÃO/);
  });

  it("remove o cabeçalho de página que caiu no meio do enunciado e registra", () => {
    const r = cleanQuestionText("Observe o ECG Admissão 2024 SEGUNDA EDIÇÃO ECG após 30 minutos Nesse caso, a conduta");
    expect(r.text).toBe("Observe o ECG Admissão ECG após 30 minutos Nesse caso, a conduta");
    expect(r.removed).toEqual([{ rule: "cabecalho-no-meio", text: "2024 SEGUNDA EDIÇÃO" }]);
  });

  it("não corta respostas legítimas, nem ano no meio ou no fim sem ponto final antes", () => {
    for (const ok of ["Notificar em até 24 horas.", "Vacina HPV, dose única, desde 2024", "Surto ocorrido em 2020", "Protocolo de 2022 com revisão.", "Revalida é o exame nacional.", "Espaço livre entre os eletrodos."]) {
      const r = cleanQuestionText(ok);
      expect(r.text, ok).toBe(ok);
      expect(r.removed).toEqual([]);
    }
  });
});
