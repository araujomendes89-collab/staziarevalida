// Movimento natural dos personagens do Tutor: função pura do tempo, com semente. Testa troca de pose, vida contínua (respiração,
// balanço, piscar irregular), boca (ataque rápido, queda lenta, histerese), amplitude por intensidade e emoção, e movimento reduzido.
import { describe, expect, it } from "vitest";
import { quadro, piscada, seguidorVoz, dinamicaPose, TROCA_MS, PERMANENCIA_MS, BOCA_LIMIAR_ABRE, BOCA_LIMIAR_FECHA, opacidadesTroca } from "../novo/app/tutor/personagens/movimento.js";

const base = { t: 5000, tEstado: 4000, tPose: 4000, estado: "idle", emocao: "neutral", intensidade: 0.5, pose: "base" };
const serie = (n: number, passo: number, f: (t: number) => number) => Array.from({ length: n }, (_, i) => f(i * passo));
const amplitude = (v: number[]) => Math.max(...v) - Math.min(...v);

describe("troca de pose", () => {
  it("cruzamento curto (100 a 180 ms) e permanência mínima de pelo menos 350 ms", () => {
    expect(TROCA_MS).toBeGreaterThanOrEqual(100);
    expect(TROCA_MS).toBeLessThanOrEqual(180);
    expect(PERMANENCIA_MS).toBeGreaterThanOrEqual(350);
  });
  it("a troca vai de 0 a 1 sem degrau e as opacidades nunca somem juntas (sem piscar de luz)", () => {
    const tr = serie(40, 5, (ms) => quadro({ ...base, tPose: ms }).troca);
    for (let i = 1; i < tr.length; i++) {
      expect(tr[i]).toBeGreaterThanOrEqual(tr[i - 1]);
      expect(tr[i] - tr[i - 1]).toBeLessThan(0.2);
    }
    for (let k = 0; k <= 20; k++) {
      const o = opacidadesTroca(k / 20);
      expect(Math.max(o.atual, o.anterior)).toBeGreaterThan(0.99 * Math.min(1, Math.max(o.atual, o.anterior)));
      expect(o.atual + o.anterior).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });
  it("com a emoção mudando logo depois do estado, nenhuma pose dura menos que a permanência", () => {
    const d = { estado: 0, emocao: 250, estadoAnterior: "listening", emocaoAnterior: "neutral" };
    let ult = "";
    let ini = 0;
    const duracoes: number[] = [];
    for (let t = 0; t < 6000; t += 8) {
      const r = dinamicaPose({ t, estado: "speaking", emocao: "angry", intensidade: 0.9, desde: d });
      if (r.pose !== ult) { if (ult) duracoes.push(t - ini); ult = r.pose; ini = t; }
    }
    expect(duracoes.length).toBeGreaterThan(1);
    for (const x of duracoes.slice(1)) expect(x).toBeGreaterThanOrEqual(PERMANENCIA_MS - 20);
  });
});

describe("vida contínua", () => {
  it("respiração: a escala vertical oscila devagar, de forma sutil, e o tronco sobe e desce", () => {
    const sy = serie(600, 20, (ms) => quadro({ ...base, t: ms }).sy);
    expect(amplitude(sy)).toBeGreaterThan(0.01);
    expect(amplitude(sy)).toBeLessThan(0.06);
    const y = serie(600, 20, (ms) => quadro({ ...base, t: ms }).y);
    expect(amplitude(y)).toBeGreaterThan(0.8);
    for (let i = 1; i < y.length; i++) expect(Math.abs(y[i] - y[i - 1])).toBeLessThan(0.5); // sem salto
  });
  it("balanço do corpo e da cabeça é suave (sem tremor entre quadros de 16 ms)", () => {
    const rot = serie(600, 16, (ms) => quadro({ ...base, t: ms }).rot);
    expect(amplitude(rot)).toBeGreaterThan(0.4);
    for (let i = 1; i < rot.length; i++) expect(Math.abs(rot[i] - rot[i - 1])).toBeLessThan(0.15);
  });
  it("piscar: intervalos de 2 a 6 s, irregulares, às vezes duplo, e diferente por semente", () => {
    const ini: number[] = [];
    for (let t = 1; t < 120000; t++) if (piscada(t) > 0.5 && piscada(t - 1) <= 0.5) ini.push(t);
    const dif = ini.slice(1).map((x, i) => x - ini[i]);
    const longos = dif.filter((d) => d > 1000);
    expect(Math.min(...longos)).toBeGreaterThanOrEqual(1800);
    expect(Math.max(...longos)).toBeLessThanOrEqual(6400);
    expect(dif.some((d) => d < 600)).toBe(true); // piscada dupla
    expect(new Set(longos.map((d) => Math.round(d / 200))).size).toBeGreaterThan(8);
    expect(piscada(7300, 1)).toBe(piscada(7300, 1));
    const a = serie(3000, 40, (ms) => piscada(ms, 1));
    const b = serie(3000, 40, (ms) => piscada(ms, 2));
    expect(a).not.toEqual(b);
  });
  it("mesma semente, mesmo quadro; sementes diferentes, balanços diferentes", () => {
    expect(quadro({ ...base, semente: 3 })).toEqual(quadro({ ...base, semente: 3 }));
    expect(quadro({ ...base, semente: 3 }).rot).not.toBe(quadro({ ...base, semente: 4 }).rot);
  });
});

describe("boca acompanha o volume da voz", () => {
  const sil = (ms: number) => Math.max(0, Math.sin((2 * Math.PI * 4.3 * ms) / 1000) * 0.5 + 0.5);
  const hist = (f: (ms: number) => number, fim: number) => Array.from({ length: 26 }, (_, i) => { const t = fim - (25 - i) * 24; return { t, v: f(Math.max(0, t)) }; });
  it("ataque rápido, queda lenta", () => {
    const sobe = seguidorVoz(Array.from({ length: 4 }, (_, i) => ({ t: i * 16, v: 1 })));
    expect(sobe.env).toBeGreaterThan(0.5); // 64 ms e já passou da metade
    const desce = seguidorVoz([...Array.from({ length: 30 }, (_, i) => ({ t: i * 16, v: 1 })), ...Array.from({ length: 4 }, (_, i) => ({ t: 480 + i * 16, v: 0 }))]);
    expect(desce.env).toBeGreaterThan(0.5); // 64 ms depois do silêncio ainda está aberta
  });
  it("histerese: no limiar não tremula", () => {
    // nível oscilando entre os dois limiares: fica no mesmo estado, sem abrir e fechar
    const zona = (BOCA_LIMIAR_ABRE + BOCA_LIMIAR_FECHA) / 2;
    const meio = Array.from({ length: 60 }, (_, i) => ({ t: i * 16, v: zona + (i % 2 ? 0.02 : -0.02) }));
    expect(seguidorVoz(meio).boca).toBe(0); // nunca abriu (ficou abaixo do limiar de abrir)
    const aberta = [...Array.from({ length: 20 }, (_, i) => ({ t: i * 16, v: 0.6 })), ...Array.from({ length: 40 }, (_, i) => ({ t: 320 + i * 16, v: zona + (i % 2 ? 0.02 : -0.02) }))];
    expect(seguidorVoz(aberta).boca).toBeGreaterThan(0); // já aberta, continua aberta
  });
  it("com fala silábica a boca não treme: variação por quadro pequena e fecha nas pausas longas", () => {
    const fala = (ms: number) => (ms % 1800 < 1300 ? sil(ms) * 0.9 : 0);
    const bocas = serie(450, 16, (ms) => seguidorVoz(hist(fala, ms)).boca);
    let saltos = 0;
    for (let i = 1; i < bocas.length; i++) if (Math.abs(bocas[i] - bocas[i - 1]) > 0.35) saltos++;
    expect(saltos).toBeLessThanOrEqual(3); // só nos começos de frase
    expect(Math.max(...bocas)).toBeGreaterThan(0.6);
    expect(Math.min(...bocas)).toBe(0);
  });
});

describe("a emoção e a intensidade mandam na amplitude", () => {
  const falaBase = { ...base, estado: "speaking", pose: "falando", saida: 0.7 };
  const mexe = (emocao: string, intensidade: number, estado = "idle") => amplitude(serie(500, 40, (ms) => quadro({ ...base, estado, emocao, intensidade, saida: estado === "speaking" ? 0.7 : 0, t: ms }).rot));
  it("intensidade maior, movimento maior", () => {
    const m = (i: number) => amplitude(serie(300, 40, (ms) => quadro({ ...falaBase, t: ms, intensidade: i }).y));
    expect(m(1)).toBeGreaterThan(m(0.1) * 1.3);
  });
  it("alegre balança mais; irritada e com raiva ficam contidas", () => {
    expect(mexe("happy", 0.9)).toBeGreaterThan(mexe("angry", 0.9) * 1.5);
    expect(mexe("happy", 0.9)).toBeGreaterThan(mexe("annoyed", 0.9));
  });
  it("quente respira mais curto e rápido que a aliviada", () => {
    const cruza = (emocao: string) => { const v = serie(3000, 20, (ms) => quadro({ ...base, emocao, intensidade: 1, t: ms }).y); let c = 0; for (let i = 1; i < v.length; i++) if (v[i - 1] < 0 && v[i] >= 0) c++; return c; };
    expect(cruza("angry")).toBeGreaterThan(cruza("relieved"));
  });
  it("raiva ao falar: sem tremor de alta frequência", () => {
    const x = serie(400, 8, (ms) => quadro({ ...falaBase, emocao: "angry", intensidade: 1, t: ms, pose: "falandoFirme" }).x);
    for (let i = 1; i < x.length; i++) expect(Math.abs(x[i] - x[i - 1])).toBeLessThan(0.3);
  });
});

describe("estados", () => {
  it("ouvindo: inclina mais com o microfone alto, e de forma contínua", () => {
    const r = (e: number) => quadro({ ...base, estado: "listening", pose: "ouvindo", entrada: e }).rot;
    expect(Math.abs(r(1) - r(0))).toBeGreaterThan(3);
    expect(Math.abs(r(0.5) - r(0))).toBeLessThan(Math.abs(r(1) - r(0)));
  });
  it("pensando: devagar, sem as batidas da fala", () => {
    const v = serie(300, 16, (ms) => quadro({ ...base, estado: "thinking", pose: "pensando", t: ms }).x);
    for (let i = 1; i < v.length; i++) expect(Math.abs(v[i] - v[i - 1])).toBeLessThan(0.2);
  });
  it("interrompido: reação curta que passa em menos de um segundo", () => {
    const y = (tEstado: number) => quadro({ ...base, estado: "interrupted", pose: "surpresa", tEstado, entrada: 0 }).y;
    expect(y(100)).toBeLessThan(y(1000) - 1.5);
    const longe = quadro({ ...base, estado: "interrupted", pose: "ouvindo", tEstado: 5000 });
    const perto = quadro({ ...base, estado: "interrupted", pose: "ouvindo", tEstado: 100 });
    expect(perto.sy).toBeGreaterThan(longe.sy);
  });
  it("movimento reduzido: quadro estático, sem respiração nem balanço, igual em qualquer instante", () => {
    const a = quadro({ ...base, t: 100, emocao: "happy", reduzido: true, saida: 0.9, estado: "speaking" });
    const b = quadro({ ...base, t: 9000, emocao: "happy", reduzido: true, saida: 0.2, estado: "speaking" });
    expect(a).toEqual(b);
    expect([a.x, a.y, a.rot, a.sx, a.sy, a.boca]).toEqual([0, 0, 0, 1, 1, 0]);
  });
});
