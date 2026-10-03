// @vitest-environment node
/** Formatação das telas de treino do app novo. */
import { describe, expect, it } from "vitest";
import { areaLabel, examLabel, formatClock, formatMinutes, formatWhen, percent, splitStatement } from "../novo/app/practice/format.js";

describe("App novo — formatação do treino", () => {
  it("separa o comando da questão sem perder nem reordenar texto", () => {
    const statement =
      "Uma mulher com 48 anos vai à UBS com calorões há três meses. IMC = 23,5 kg/m2 e PA = 110 x 70 mmHg. Considerando os dados clínicos da paciente, assinale a alternativa que apresenta a conduta adequada.";
    const { stem, ask } = splitStatement(statement);
    expect(ask).toBe("Considerando os dados clínicos da paciente, assinale a alternativa que apresenta a conduta adequada.");
    expect(`${stem} ${ask}`).toBe(statement);

    expect(splitStatement("Lactente com sibilância. Nesse caso, a hipótese diagnóstica é de").ask).toBe("Nesse caso, a hipótese diagnóstica é de");
    expect(splitStatement("Paciente refere “dor intensa”. Qual é o diagnóstico mais provável?").ask).toBe("Qual é o diagnóstico mais provável?");
  });

  it("sem divisão clara, o enunciado fica inteiro no caso clínico", () => {
    expect(splitStatement("Qual é a conduta adequada para a pré-eclâmpsia grave?")).toEqual({
      stem: "Qual é a conduta adequada para a pré-eclâmpsia grave?",
      ask: "",
    });
    // "frase" final curta demais (abreviação) não vira comando
    expect(splitStatement("Paciente atendido pelo Dr. Silva.")).toEqual({ stem: "Paciente atendido pelo Dr. Silva.", ask: "" });
    const long = `Caso clínico. ${"Texto muito longo ".repeat(30)}fim.`;
    expect(splitStatement(long)).toEqual({ stem: long, ask: "" });
    expect(splitStatement(null)).toEqual({ stem: "", ask: "" });
  });

  it("rótulos de prova e área", () => {
    expect(examLabel({ kind: "REVALIDA", year: 2024, semester: 1 })).toBe("Revalida 2024/1");
    expect(examLabel({ kind: "REVALIDA", year: 2021, semester: null })).toBe("Revalida 2021");
    expect(examLabel({ kind: "ENAMED", year: 2025, semester: null })).toBe("ENAMED 2025");
    expect(areaLabel("GINECOLOGIA_OBSTETRICIA")).toBe("Gineco & Obstetrícia");
    expect(areaLabel("")).toBe("Todas as áreas");
  });

  it("tempo e percentual", () => {
    expect([36, 60, 90, 300].map(formatMinutes)).toEqual(["36 min", "1h", "1h30", "5h"]);
    expect([0, 75, 3725, -5].map(formatClock)).toEqual(["00:00", "01:15", "1:02:05", "00:00"]);
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });

  it("data da sessão em relação a hoje", () => {
    const now = new Date(2026, 9, 3, 15, 0);
    expect(formatWhen(new Date(2026, 9, 3, 9, 5).toISOString(), now)).toBe("hoje, 09:05");
    expect(formatWhen(new Date(2026, 9, 2, 23, 50).toISOString(), now)).toBe("ontem, 23:50");
    expect(formatWhen(new Date(2026, 8, 12, 18, 0).toISOString(), now)).toMatch(/^12 de set\.?, 18:00$/);
  });
});
