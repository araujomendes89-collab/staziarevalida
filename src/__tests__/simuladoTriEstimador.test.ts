// @vitest-environment node
/**
 * Simulado TRI (estimativa StaziaMed) — o estimador de Rasch em casos conhecidos (scripts/tri/rasch.ts).
 * É a mesma conta da função do banco (irt_eap, migração …9996) e do protótipo em Python (JMLE/EAP).
 * Os números de referência vêm da própria definição do modelo: P(acerto) = 1 / (1 + e^-(θ - b)).
 */
import { describe, expect, it } from "vitest";
import {
  ESCALA,
  bPorNivel,
  bProvisorioPorPercentual,
  calibrarJmle,
  escalaStaziaMed,
  estadoDoItem,
  estimarTheta,
  prob,
  sorteador,
  thetaEap,
  thetaMle,
} from "../../scripts/tri/rasch";
import { calibrarDaMatriz } from "../../scripts/tri/calibrar";

const correlacao = (a: number[], b: number[]) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  a.forEach((x, i) => {
    num += (x - ma) * (b[i] - mb);
    da += (x - ma) ** 2;
    db += (b[i] - mb) ** 2;
  });
  return num / Math.sqrt(da * db);
};

describe("Modelo de Rasch: a chance de acerto", () => {
  it("θ = b dá 50%; 1 logit acima, 73%; 1 abaixo, 27%", () => {
    expect(prob(0, 0)).toBeCloseTo(0.5, 10);
    expect(prob(1, 0)).toBeCloseTo(0.7311, 4);
    expect(prob(-1, 0)).toBeCloseTo(0.2689, 4);
    expect(prob(2.5, 0.5)).toBeCloseTo(prob(2, 0), 10);
  });
});

describe("θ por EAP (prior Normal(0,1), grade de 61 pontos em ±5)", () => {
  it("sem nenhuma questão, devolve a média e o desvio do prior", () => {
    const r = thetaEap([], []);
    expect(r.theta).toBeCloseTo(0, 6);
    expect(r.se).toBeCloseTo(1, 2);
  });

  it("metade certa em itens de b = 0 dá θ = 0 (simetria)", () => {
    const resp = Array.from({ length: 40 }, (_, i) => (i % 2 ? 1 : 0));
    const r = thetaEap(resp, resp.map(() => 0));
    expect(r.theta).toBeCloseTo(0, 6);
    expect(r.se).toBeGreaterThan(0.25);
    expect(r.se).toBeLessThan(0.35);
  });

  it("mesma prova e mesmo número de acertos = mesmo θ, não importa QUAIS questões acertou", () => {
    const b = [-2, -1.5, -1, -0.5, 0, 0.3, 0.6, 1, 1.5, 2];
    const acertouAsFaceis = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
    const acertouAsDificeis = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const a = thetaEap(acertouAsFaceis, b);
    const d = thetaEap(acertouAsDificeis, b);
    expect(a.theta).toBeCloseTo(d.theta, 10);
    expect(a.se).toBeCloseTo(d.se, 10);
  });

  it("conjuntos diferentes: o mesmo percentual em questões difíceis vale mais", () => {
    const resp = Array.from({ length: 50 }, (_, i) => (i < 40 ? 1 : 0)); // 40 de 50
    const faceis = thetaEap(resp, resp.map(() => -1));
    const dificeis = thetaEap(resp, resp.map(() => 1));
    expect(dificeis.theta).toBeGreaterThan(faceis.theta + 1.5);
    // trocar uma questão errada fácil por uma difícil acertada também sobe
    const misto = thetaEap([1, 0], [1, -1]);
    const contrario = thetaEap([1, 0], [-1, 1]);
    expect(misto.theta).toBeGreaterThan(contrario.theta);
  });

  it("0 acertos e 100% de acertos têm nota finita (o prior segura os extremos)", () => {
    const b = Array.from({ length: 30 }, () => 0);
    const zero = thetaEap(b.map(() => 0), b);
    const tudo = thetaEap(b.map(() => 1), b);
    expect(Number.isFinite(zero.theta) && Number.isFinite(tudo.theta)).toBe(true);
    expect(zero.theta).toBeLessThan(-2);
    expect(tudo.theta).toBeGreaterThan(2);
    expect(zero.theta).toBeCloseTo(-tudo.theta, 8);
  });

  it("questão sem resposta válida (nula: anulada) fica fora da conta", () => {
    const com = thetaEap([1, 0, null, 1], [0, 0, 3, 0]);
    const sem = thetaEap([1, 0, 1], [0, 0, 0]);
    expect(com.theta).toBeCloseTo(sem.theta, 10);
  });

  it("mais questões, faixa mais estreita (erro padrão menor)", () => {
    const curto = thetaEap(Array.from({ length: 30 }, (_, i) => i % 2), Array(30).fill(0));
    const longo = thetaEap(Array.from({ length: 100 }, (_, i) => i % 2), Array(100).fill(0));
    expect(longo.se).toBeLessThan(curto.se);
    expect(longo.se).toBeGreaterThan(0.18);
    expect(longo.se).toBeLessThan(0.23);
  });

  it("bate com o protótipo em Python (rasch_estimador.py, theta_eap e theta_mle) até a 10ª casa", () => {
    const b = [-2, -1.5, -1, -0.5, 0, 0.3, 0.6, 1, 1.5, 2, 0.2, -0.7];
    const r = [1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0];
    // valores impressos pelo protótipo (numpy) em 14/10/2026
    expect(thetaEap(r, b).theta).toBeCloseTo(0.30296747817528835, 10);
    expect(thetaEap(r, b).se).toBeCloseTo(0.5575211221377112, 10);
    expect(thetaMle(r, b).theta).toBeCloseTo(0.4237650743604269, 10);
    expect(thetaMle(r, b).se).toBeCloseTo(0.6628548953119353, 10);
  });

  it("listas de tamanhos diferentes são recusadas", () => {
    expect(() => thetaEap([1, 0], [0])).toThrow(/mesmo tamanho/);
  });
});

describe("θ por máxima verossimilhança (só para a equipe comparar)", () => {
  it("bate com a raiz de acertos = soma das chances", () => {
    const b = [-1, 0, 1, 0.5, -0.5];
    const resp = [1, 1, 0, 1, 0];
    const r = thetaMle(resp, b);
    const esperado = b.reduce((s, bi) => s + prob(r.theta, bi), 0);
    expect(esperado).toBeCloseTo(3, 6);
    expect(r.se).toBeGreaterThan(0);
  });
  it("0 ou 100% de acertos não têm estimativa finita", () => {
    expect(thetaMle([0, 0], [0, 0]).theta).toBe(-Infinity);
    expect(thetaMle([1, 1], [0, 0]).theta).toBe(Infinity);
  });
});

describe("Escala StaziaMed (50 + 10·θ) e faixa de 95%", () => {
  it("é a escala própria, nunca a do Inep", () => {
    expect(ESCALA).toEqual({ media: 50, porLogit: 10 });
    expect(escalaStaziaMed(0)).toBe(50);
    expect(escalaStaziaMed(1.234)).toBe(62.3);
    expect(escalaStaziaMed(-0.4)).toBe(46);
    expect(escalaStaziaMed(9)).toBe(100);
    expect(escalaStaziaMed(-9)).toBe(0);
  });
  it("estimarTheta devolve θ, erro padrão, nota e intervalo de 95%", () => {
    const r = estimarTheta(Array.from({ length: 100 }, (_, i) => (i < 60 ? 1 : 0)), Array(100).fill(0));
    expect(r.theta).toBeGreaterThan(0.3);
    expect(r.thetaLo).toBeCloseTo(r.theta - 1.96 * r.se, 10);
    expect(r.thetaHi).toBeCloseTo(r.theta + 1.96 * r.se, 10);
    expect(r.nota).toBe(escalaStaziaMed(r.theta));
    expect(r.notaLo).toBe(escalaStaziaMed(r.thetaLo));
    expect(r.notaHi).toBe(escalaStaziaMed(r.thetaHi));
    expect(r.nItens).toBe(100);
    expect(r.acertos).toBe(60);
  });
});

describe("Dificuldade do item: provisória e calibrada", () => {
  it("estado pela quantidade de respostas: < 100 provisória, ≥ 100 calibrada", () => {
    expect(estadoDoItem(0)).toBe("provisoria");
    expect(estadoDoItem(29)).toBe("provisoria");
    expect(estadoDoItem(99)).toBe("provisoria");
    expect(estadoDoItem(100)).toBe("calibrada");
  });
  it("pelo percentual de acerto: 50% → 0; muito acertada → negativa; pouco acertada → positiva; nunca infinita", () => {
    expect(bProvisorioPorPercentual(10, 20)).toBeCloseTo(0, 10);
    expect(bProvisorioPorPercentual(18, 20)).toBeLessThan(-1.5);
    expect(bProvisorioPorPercentual(2, 20)).toBeGreaterThan(1.5);
    expect(Number.isFinite(bProvisorioPorPercentual(20, 20))).toBe(true);
    expect(Number.isFinite(bProvisorioPorPercentual(0, 20))).toBe(true);
  });
  it("pelo nível do blueprint: baixo −1, moderado 0, alto +1; sem nível, 0", () => {
    expect(bPorNivel("LOW")).toBe(-1);
    expect(bPorNivel("MODERATE")).toBe(0);
    expect(bPorNivel("HIGH")).toBe(1);
    expect(bPorNivel(null)).toBe(0);
  });
});

describe("Calibração JMLE (dados incompletos, cada aluno com um simulado diferente)", () => {
  it("recupera as dificuldades e as proficiências numa simulação sintética pequena", () => {
    const rnd = sorteador(20261014);
    const nItens = 60;
    const nPessoas = 400;
    const bVerdadeiro = Array.from({ length: nItens }, () => rnd.normal());
    const media = bVerdadeiro.reduce((s, x) => s + x, 0) / nItens;
    const b0 = bVerdadeiro.map((x) => x - media);
    const thetaVerdadeiro = Array.from({ length: nPessoas }, () => rnd.normal());
    // cada pessoa responde 40 dos 60 itens (sorteados): matriz incompleta, como nos simulados
    const X: (number | null)[][] = thetaVerdadeiro.map((th) => {
      const escolhidos = new Set<number>();
      while (escolhidos.size < 40) escolhidos.add(Math.floor(rnd.uniforme() * nItens));
      return b0.map((b, i) => (escolhidos.has(i) ? (rnd.uniforme() < prob(th, b) ? 1 : 0) : null));
    });
    const r = calibrarJmle(X);
    const ok = r.b.map((b, i) => [b, b0[i]] as const).filter(([b]) => b !== null) as [number, number][];
    expect(ok.length).toBe(nItens);
    expect(correlacao(ok.map((x) => x[0]), ok.map((x) => x[1]))).toBeGreaterThan(0.97);
    const rmse = Math.sqrt(ok.reduce((s, [a, c]) => s + (a - c) ** 2, 0) / ok.length);
    expect(rmse).toBeLessThan(0.25);
    expect(r.nResp.every((n) => n > 200)).toBe(true);

    // θ por EAP com os b calibrados acompanha o θ verdadeiro
    const thetas = X.map((linha) => thetaEap(linha, r.b.map((b) => b ?? 0)).theta);
    expect(correlacao(thetas, thetaVerdadeiro)).toBeGreaterThan(0.85);
  });

  it("item que todos acertam (ou todos erram) fica sem estimativa", () => {
    const X = [
      [1, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
      [1, 0, 1],
    ];
    const r = calibrarJmle(X);
    expect(r.b[0]).toBeNull();
    expect(r.b[1]).not.toBeNull();
  });
});

describe("Script de calibração (scripts/tri/calibrar.ts): o que vai para irt_save_calibration", () => {
  it("manda só questões com ≥ 30 respostas; gabarito invertido sai rejeitado; o resto calibra perto do verdadeiro", () => {
    const rnd = sorteador(7);
    const nItens = 30;
    const b0 = Array.from({ length: nItens }, () => rnd.normal());
    const rows: { person: string; question_id: string; score: number }[] = [];
    for (let p = 0; p < 250; p++) {
      const th = rnd.normal();
      b0.forEach((b, j) => {
        let x = rnd.uniforme() < prob(th, b) ? 1 : 0;
        if (j === 0) x = 1 - x; // gabarito errado na q0: quem sabe mais "erra"
        rows.push({ person: `p${p}`, question_id: `q${j}`, score: x });
      });
    }
    // q-rara: só 20 respostas
    for (let p = 0; p < 20; p++) rows.push({ person: `p${p}`, question_id: "q-rara", score: p % 2 });
    const { items, resumo } = calibrarDaMatriz(rows);
    expect(items.some((i) => i.question_id === "q-rara")).toBe(false);
    expect(resumo.poucas_respostas).toBe(1);
    const q0 = items.find((i) => i.question_id === "q0")!;
    expect(q0.reject_reason).toMatch(/correlação/);
    const boas = items.filter((i) => !i.reject_reason);
    expect(boas.length).toBeGreaterThanOrEqual(nItens - 3);
    expect(boas.every((i) => i.n_resp >= 100)).toBe(true);
    expect(resumo.calibradas).toBe(boas.length);
    const idx = boas.map((i) => Number(i.question_id.slice(1)));
    expect(correlacao(boas.map((i) => i.b), idx.map((j) => b0[j]))).toBeGreaterThan(0.95);
  });
});
