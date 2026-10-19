// @vitest-environment node
/**
 * Treino em Dupla · entrada na estação (dono, 19/10): linha do tempo do apito e da porta (porta.js). Funções PURAS do relógio do
 * servidor: o teste passa a hora; nada de Date.now().
 */
import { describe, expect, it } from "vitest";
import { measureOffset } from "../novo/app/dupla/clock.js";
import { APITO_MS, APITO_TOLERANCIA_MS, deveApitar, entrada, tempoMostrado } from "../novo/app/dupla/porta.js";

const T = Date.parse("2026-10-19T15:00:02.000Z"); // started_at: a porta termina de abrir aqui
const sala = (o: Record<string, unknown> = {}) => ({ phase: "running", started_at: new Date(T).toISOString(), ...o });

describe("porta.js · entrada na estação", () => {
  it("o apito dura 2 s e o atraso tolerado é 1 s", () => {
    expect(APITO_MS).toBe(2000);
    expect(APITO_TOLERANCIA_MS).toBe(1000);
  });

  it("antes de começar a porta está fechada; sala já em andamento sem início gravado (antiga) está aberta", () => {
    expect(entrada({ phase: "setup", started_at: null }, T).etapa).toBe("fechada");
    expect(entrada(null, T).etapa).toBe("fechada");
    expect(entrada({ phase: "running", started_at: null }, T)).toEqual({ etapa: "aberta", apitoEm: null, abreEm: null, faltaMs: 0 });
  });

  it("2 s antes do início a porta começa a abrir; no início ela está aberta", () => {
    expect(entrada(sala(), T - 2500)).toMatchObject({ etapa: "fechada", faltaMs: 2500 });
    expect(entrada(sala(), T - 2000)).toEqual({ etapa: "abrindo", apitoEm: T - 2000, abreEm: T, faltaMs: 2000 });
    expect(entrada(sala(), T - 1)).toMatchObject({ etapa: "abrindo", faltaMs: 1 });
    expect(entrada(sala(), T)).toMatchObject({ etapa: "aberta", faltaMs: 0 });
    expect(entrada(sala({ phase: "review" }), T + 60000).etapa).toBe("aberta");
  });

  it("dois aparelhos com relógios diferentes (ator 30 s atrasado, candidato 45 s adiantado) e o mesmo started_at: cada um mede a sua diferença e os dois veem a mesma etapa na mesma hora real", () => {
    // Cada aparelho mede a diferença numa consulta: enviou na hora DELE, o servidor respondeu com server_now, voltou 200 ms depois.
    const resposta = T - 2600; // server_now da última consulta (hora do servidor)
    const erro = { ator: -30000, candidato: 45000 }; // quanto o relógio de cada aparelho está à frente do servidor
    const medido = {
      ator: measureOffset(new Date(resposta).toISOString(), resposta + erro.ator - 100, resposta + erro.ator + 100),
      candidato: measureOffset(new Date(resposta).toISOString(), resposta + erro.candidato - 100, resposta + erro.candidato + 100),
    };
    expect(medido).toEqual({ ator: 30000, candidato: -45000 });
    // a mesma hora real lida em cada aparelho = hora do aparelho + a diferença medida
    for (const [depois, etapa] of [[0, "fechada"], [800, "abrindo"], [2000, "abrindo"], [2700, "aberta"]] as const) {
      const real = resposta + depois;
      const ator = entrada(sala(), real + erro.ator + medido.ator);
      const candidato = entrada(sala(), real + erro.candidato + medido.candidato);
      expect(ator.etapa, `${depois} ms`).toBe(etapa);
      expect(candidato, `${depois} ms`).toEqual(ator);
    }
    // sem a diferença medida, cada aparelho estaria numa etapa diferente
    expect(entrada(sala(), resposta + 800 + erro.ator).etapa).toBe("fechada");
    expect(entrada(sala(), resposta + 800 + erro.candidato).etapa).toBe("aberta");
  });

  it("apita uma vez, e só se o atraso desde o começo do apito for de até 1 s", () => {
    const cedo = T - 2000 + 300;
    expect(deveApitar(entrada(sala(), cedo), cedo, false)).toBe(true);
    expect(deveApitar(entrada(sala(), cedo), cedo, true)).toBe(false);
    const tarde = T - 2000 + 1500;
    expect(deveApitar(entrada(sala(), tarde), tarde, false)).toBe(false);
    expect(deveApitar(entrada(sala(), T + 100), T + 100, false)).toBe(false);
  });

  it("cronômetro: enquanto a porta abre mostra a duração cheia; depois, o que o servidor diz (inclusive +1 min)", () => {
    expect(tempoMostrado(entrada(sala(), T - 1000), 601000, 600000)).toBe(600000);
    expect(tempoMostrado(entrada(sala(), T + 1000), 599000, 600000)).toBe(599000);
    expect(tempoMostrado(entrada(sala(), T + 1000), 659000, 600000)).toBe(659000);
    expect(tempoMostrado(entrada({ phase: "setup" }, T), null, 600000)).toBe(600000);
  });
});
