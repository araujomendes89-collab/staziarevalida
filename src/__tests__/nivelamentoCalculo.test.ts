// @vitest-environment node
/**
 * Nivelamento (SDP): a conta da especificação do dono (16/10/2026), sem IA.
 * Exemplo da seção 4: 5/6, 2/6, 4/6, 3/6, 4/6 → PG 57,5 · Intermediário · 18/30 · 60,0% brutos · prioridade Cirurgia, depois GO.
 */
import { describe, expect, it } from "vitest";
import {
  AREAS,
  EXEMPLO_ESPECIFICACAO,
  avisoIncerteza,
  calcularArea,
  calcularNivelamento,
  calcularPorContagem,
  classificar,
  distribuicaoDificuldade,
  fmt1,
  interpretar,
} from "../novo/app/nivelamento/calculo.js";

const cont = (...acertos: [number, number][]) => AREAS.map((a, i) => ({ area: a.id, acertos: acertos[i][0], total: acertos[i][1] }));

describe("nivelamento — exemplo da especificação", () => {
  const r = calcularPorContagem(EXEMPLO_ESPECIFICACAO);

  it("proficiência por área 75,0 · 37,5 · 62,5 · 50,0 · 62,5", () => {
    expect(r.perfil.map((p) => p.proficiencia)).toEqual([75, 37.5, 62.5, 50, 62.5]);
    expect(r.perfil.map((p) => p.prioridade)).toEqual([25, 62.5, 37.5, 50, 37.5]);
    expect(r.perfil.map((p) => `${p.acertos} de ${p.total}`)).toEqual(["5 de 6", "2 de 6", "4 de 6", "3 de 6", "4 de 6"]);
  });

  it("PG 57,5 e nível Intermediário; acertos brutos 18/30 = 60,0% guardados à parte", () => {
    expect(r.score).toBe(57.5);
    expect(fmt1(r.score)).toBe("57,5");
    expect(r.nivel).toBe(3);
    expect(r.nivel_nome).toBe("Intermediário");
    expect(r.nivel_foco).toBe("Fortalecer raciocínio clínico e tomada de decisão");
    expect(r.acertos).toBe(18);
    expect(r.total).toBe(30);
    expect(r.percentual_bruto).toBe(60);
  });

  it("prioridade: Cirurgia, depois Ginecologia e Obstetrícia (empate Pediatria × MFC fica na ordem da especificação)", () => {
    expect(r.prioridades).toEqual(["CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE", "CLINICA_MEDICA"]);
  });

  it("interpretação automática e aviso de incerteza com o texto da especificação", () => {
    expect(interpretar(r)).toBe(
      "O estudante apresentou 60,0% de acertos brutos. A maior prioridade de revisão é Cirurgia, seguida de Ginecologia e Obstetrícia."
    );
    expect(interpretar(r, { pessoa: "voce" })).toBe(
      "Você apresentou 60,0% de acertos brutos. A maior prioridade de revisão é Cirurgia, seguida de Ginecologia e Obstetrícia."
    );
    expect(avisoIncerteza(r)).toBe("Resultado inicial sujeito a revisão por novas questões. Cada área contém apenas seis observações.");
  });

  it("faixa indicativa (só para validação) cruza a fronteira de 55: status PROVISÓRIO", () => {
    expect(r.faixa_indicativa).toEqual([45.8, 69.2]);
    expect(r.status).toBe("PROVISORIO");
  });

  it("a forma por respostas ({ area, correta }) dá o mesmo resultado", () => {
    const respostas = EXEMPLO_ESPECIFICACAO.flatMap((c) =>
      Array.from({ length: c.total }, (_, i) => ({ area: c.area, correta: i < c.acertos }))
    );
    expect(calcularNivelamento(respostas)).toEqual(r);
  });
});

describe("nivelamento — fórmulas e faixas", () => {
  it("P_a = 100·(A+1)/(Q+2) e variância da Beta posterior", () => {
    expect(calcularArea(5, 6).proficiencia).toBeCloseTo(75, 10);
    expect(calcularArea(0, 0).proficiencia).toBe(50);
    expect(calcularArea(3, 6).variancia).toBeCloseTo(16 / 576, 12);
  });

  it("cinco níveis com as fronteiras 40 · 55 · 70 · 85", () => {
    expect(classificar(0).nome).toBe("Fundamentos");
    expect(classificar(39.99).nome).toBe("Fundamentos");
    expect(classificar(40).nome).toBe("Em desenvolvimento");
    expect(classificar(54.9).nome).toBe("Em desenvolvimento");
    expect(classificar(55).nome).toBe("Intermediário");
    expect(classificar(69.9).nome).toBe("Intermediário");
    expect(classificar(70).nome).toBe("Avançado");
    expect(classificar(84.9).nome).toBe("Avançado");
    expect(classificar(85).nome).toBe("Domínio elevado");
    expect(classificar(100).nome).toBe("Domínio elevado");
  });

  it("distribuição de dificuldade das atividades seguintes (tabela da seção 5)", () => {
    expect(distribuicaoDificuldade(44.9)).toEqual({ facil: 60, media: 30, dificil: 10 });
    expect(distribuicaoDificuldade(45)).toEqual({ facil: 20, media: 60, dificil: 20 });
    expect(distribuicaoDificuldade(69.9)).toEqual({ facil: 20, media: 60, dificil: 20 });
    expect(distribuicaoDificuldade(70)).toEqual({ facil: 10, media: 40, dificil: 50 });
  });

  it("primeiras 15 (3 por área): resultado provisório", () => {
    const r = calcularPorContagem(cont([2, 3], [1, 3], [2, 3], [2, 3], [3, 3]));
    expect(r.perfil.map((p) => p.proficiencia)).toEqual([60, 40, 60, 60, 80]);
    expect(r.score).toBe(60);
    expect(r.nivel_nome).toBe("Intermediário");
    expect(r.status).toBe("PROVISORIO");
    expect(r.percentual_bruto).toBe(66.7);
    expect(avisoIncerteza(r)).toBe("Resultado inicial sujeito a revisão por novas questões. Cada área contém apenas três observações.");
  });

  it("30 de 30 não vira 100: PG 87,5 (Domínio elevado), ainda provisório pela faixa", () => {
    const r = calcularPorContagem(cont([6, 6], [6, 6], [6, 6], [6, 6], [6, 6]));
    expect(r.score).toBe(87.5);
    expect(r.nivel_nome).toBe("Domínio elevado");
    expect(r.status).toBe("PROVISORIO");
  });

  it("0 de 30: PG 12,5 (Fundamentos); faixa sem cruzar fronteira → ESTIMATIVA_INICIAL", () => {
    const r = calcularPorContagem(cont([0, 6], [0, 6], [0, 6], [0, 6], [0, 6]));
    expect(r.score).toBe(12.5);
    expect(r.nivel_nome).toBe("Fundamentos");
    expect(r.status).toBe("ESTIMATIVA_INICIAL");
    expect(interpretar(r)).toBe(
      "O estudante apresentou 0,0% de acertos brutos. As cinco áreas tiveram o mesmo resultado; nenhuma se destacou como prioridade de revisão."
    );
  });

  it("dados insuficientes: área com menos de 3 questões fica sem pontuação e sem nível", () => {
    const r = calcularPorContagem(cont([2, 3], [1, 2], [2, 3], [2, 3], [3, 3]));
    expect(r.status).toBe("DADOS_INSUFICIENTES");
    expect(r.score).toBeNull();
    expect(r.nivel).toBeNull();
    expect(r.faixa_indicativa).toBeNull();
    expect(r.acertos).toBe(10);
    expect(r.total).toBe(14);
    const vazio = calcularPorContagem([]);
    expect(vazio.status).toBe("DADOS_INSUFICIENTES");
    expect(vazio.percentual_bruto).toBeNull();
    expect(interpretar(vazio)).toBe("");
  });

  it("empates são ditos como empates", () => {
    const topo = calcularPorContagem(cont([5, 6], [2, 6], [2, 6], [4, 6], [5, 6]));
    expect(interpretar(topo)).toBe(
      "O estudante apresentou 60,0% de acertos brutos. As maiores prioridades de revisão, empatadas, são Cirurgia e Pediatria."
    );
    const segundo = calcularPorContagem(cont([5, 6], [1, 6], [3, 6], [3, 6], [5, 6]));
    expect(interpretar(segundo)).toBe(
      "O estudante apresentou 56,7% de acertos brutos. A maior prioridade de revisão é Cirurgia, seguida de Pediatria e Ginecologia e Obstetrícia (empatadas)."
    );
  });

  it("recusa contagem impossível", () => {
    expect(() => calcularPorContagem([{ area: "CIRURGIA_GERAL", acertos: 4, total: 3 }])).toThrow(/inválida/);
    expect(() => calcularPorContagem([{ area: "ODONTO", acertos: 1, total: 3 }])).toThrow(/desconhecida/);
  });
});
