// Movimento natural dos personagens do Tutor: função pura do tempo, com semente. Testa troca de pose, vida contínua (respiração,
// balanço, piscar irregular), boca (ataque rápido, queda lenta, histerese), amplitude por intensidade e emoção, e movimento reduzido.
import { describe, expect, it } from "vitest";
import { quadro, piscada, seguidorVoz, dinamicaPose, TROCA_MS, PERMANENCIA_MS, BOCA_SEGURA_MS, opacidadesTroca, aparenciaBoca, geometriaBoca, posicaoNaBoca } from "../novo/app/tutor/personagens/movimento.js";
import { ADIANTO_BOCA_S } from "../novo/app/tutor/personagens/usePersonagemAnimacao.js";
import { spritePose } from "../novo/app/tutor/personagens/sprites.js";
import { AudioPlayer, nivelDoFluxo, rmsPorBloco } from "../novo/app/tutor/voice/audioPlayer.js";

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

// Voz falsa com sílabas de durações irregulares (90 a 260 ms), vales curtos entre elas e pausas de frase: parecida com a do Gemini.
const silabas = (() => {
  const lista: { ini: number; fim: number; amp: number }[] = [];
  let t = 300;
  let k = 0;
  while (t < 12000) {
    const dur = 90 + ((k * 73) % 170);
    lista.push({ ini: t, fim: t + dur, amp: 0.55 + ((k * 37) % 45) / 100 });
    t += dur + 45 + ((k * 29) % 50) + (k % 9 === 8 ? 450 : 0); // vale entre sílabas; a cada 9, pausa de frase
    k++;
  }
  return lista;
})();
const voz = (ms: number) => {
  for (const s of silabas) if (ms >= s.ini && ms < s.fim) return s.amp * Math.sin((Math.PI * (ms - s.ini)) / (s.fim - s.ini)) ** 0.5;
  return 0;
};
// como ao vivo: a cada quadro de 16 ms, o histórico de 1,5 s do nível (lido ADIANTO_BOCA_S à frente) passa pelo seguidor
const aoVivo = (f: (ms: number) => number, ate: number, adianto = ADIANTO_BOCA_S * 1000) => {
  const hist: { t: number; v: number }[] = [];
  const out: { t: number; boca: number; nivel: number; env: number }[] = [];
  for (let t = 0; t <= ate; t += 16) {
    hist.push({ t, v: f(t + adianto) });
    while (hist.length > 1 && t - hist[0].t > 1500) hist.shift();
    const r = seguidorVoz(hist);
    out.push({ t, boca: r.boca, nivel: r.nivel, env: r.env });
  }
  return out;
};
const pearson = (a: number[], b: number[]) => {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / Math.sqrt(sa * sb || 1);
};

describe("boca acompanha a voz (sílabas, 3 aberturas, sem tremer)", () => {
  const serieVoz = aoVivo(voz, 12000);
  it("abre logo na sílaba e fecha no silêncio", () => {
    const sobe = aoVivo((ms) => (ms >= 500 ? 0.8 : 0), 700, 0);
    const abriu = sobe.find((x) => x.nivel > 0)!;
    expect(abriu.t - 500).toBeLessThanOrEqual(40);
    const desce = aoVivo((ms) => (ms < 500 ? 0.8 : 0), 900, 0);
    expect(desce.at(-1)!.boca).toBe(0);
  });
  it("três aberturas (fechada, meia, aberta) e a boca passa pela meia, sem pular de fechada para aberta", () => {
    const niveis = new Set(serieVoz.map((x) => x.nivel));
    expect([...niveis].sort()).toEqual([0, 0.5, 1]);
    for (let i = 1; i < serieVoz.length; i++) expect(Math.abs(serieVoz[i].nivel - serieVoz[i - 1].nivel)).toBeLessThanOrEqual(0.5);
  });
  it("sem piscar de boca: cada abertura dura o mínimo, no máximo 7 fechamentos por segundo, sem salto entre quadros", () => {
    const trocas: number[] = [];
    let ini = 0;
    for (let i = 1; i < serieVoz.length; i++) {
      if (serieVoz[i].nivel !== serieVoz[i - 1].nivel) {
        if (trocas.length) expect(serieVoz[i].t - ini).toBeGreaterThanOrEqual(BOCA_SEGURA_MS * 0.6 - 16);
        trocas.push(serieVoz[i].t);
        ini = serieVoz[i].t;
      }
      expect(Math.abs(serieVoz[i].boca - serieVoz[i - 1].boca)).toBeLessThan(0.35);
    }
    // cada sílaba dá até 4 trocas (fechada → meia → aberta → meia → fechada): no máximo 7 fechamentos em qualquer segundo
    const sobe = trocas.map((t) => { const i = serieVoz.findIndex((x) => x.t === t); return serieVoz[i].nivel > serieVoz[i - 1].nivel; });
    const descidas = trocas.filter((_, k) => k > 0 && !sobe[k] && sobe[k - 1]); // começo de cada fechamento (depois de abrir)
    for (let i = 0; i < descidas.length; i++) expect(descidas.filter((t) => t >= descidas[i] && t < descidas[i] + 1000).length).toBeLessThanOrEqual(7);
  });
  it("acompanha as sílabas: fecha (ou quase) em pelo menos 70% dos vales entre elas", () => {
    let fechou = 0;
    let vales = 0;
    for (let k = 0; k + 1 < silabas.length && silabas[k + 1].ini < 11500; k++) {
      vales++;
      const v = serieVoz.filter((x) => x.t >= silabas[k].fim - 30 && x.t <= silabas[k + 1].ini + 30);
      if (v.some((x) => x.nivel < 1)) fechou++;
    }
    expect(fechou / vales).toBeGreaterThan(0.7);
  });
  it("histerese: um tremido pequeno no nível não abre e fecha a boca", () => {
    const tremido = aoVivo((ms) => 0.6 + (Math.floor(ms / 16) % 2 ? 0.04 : -0.04), 3000, 0).filter((x) => x.t > 500);
    expect(new Set(tremido.map((x) => x.nivel)).size).toBe(1);
  });
  it("sincronia: a boca acompanha o som com atraso de no máximo 60 ms (lendo o nível ADIANTO_BOCA_S à frente)", () => {
    const A = serieVoz.map((x) => x.boca);
    let melhor = { lag: 0, r: -2 };
    for (let lag = -200; lag <= 300; lag += 4) {
      const r = pearson(A, serieVoz.map((x) => voz(x.t - lag)));
      if (r > melhor.r) melhor = { lag, r };
    }
    expect(Math.abs(melhor.lag)).toBeLessThanOrEqual(60);
    expect(melhor.r).toBeGreaterThan(0.75);
  });
  it("o envelope do corpo é lento: não segue a sílaba", () => {
    const env = serieVoz.map((x) => x.env);
    let maior = 0;
    for (let i = 1; i < env.length; i++) maior = Math.max(maior, Math.abs(env[i] - env[i - 1]));
    expect(maior).toBeLessThan(0.12);
  });
});

describe("corpo parado na sílaba (o tremor do falando)", () => {
  const serieVoz = aoVivo(voz, 8000);
  const quadros = serieVoz.map((x) => quadro({ ...base, t: x.t, estado: "speaking", pose: "falando", intensidade: 0.75, saida: x.env, boca: x.boca }));
  const rapido = (v: number[]) => {
    const res = v.map((x, i) => { const a = v.slice(Math.max(0, i - 9), i + 10); return x - a.reduce((p, q) => p + q, 0) / a.length; });
    return Math.sqrt(res.reduce((p, q) => p + q * q, 0) / res.length);
  };
  it("altura, giro e escala do corpo sem componente rápida (antes: batida de 4,8 Hz por sílaba)", () => {
    expect(rapido(quadros.map((q) => q.y))).toBeLessThan(0.25);
    expect(rapido(quadros.map((q) => q.rot))).toBeLessThan(0.05);
    expect(rapido(quadros.map((q) => q.sy))).toBeLessThan(0.001);
    for (let i = 1; i < quadros.length; i++) expect(Math.abs(quadros[i].y - quadros[i - 1].y)).toBeLessThan(0.5);
  });
  it("a boca do quadro é a do seguidor (o corpo não muda com ela)", () => {
    const a = quadro({ ...base, estado: "speaking", pose: "falando", saida: 0.5, boca: 0 });
    const b = quadro({ ...base, estado: "speaking", pose: "falando", saida: 0.5, boca: 1 });
    expect(b.boca).toBe(1);
    expect([a.x, a.y, a.rot, a.sx, a.sy]).toEqual([b.x, b.y, b.rot, b.sx, b.sy]);
  });
});

describe("desenho da boca (sem imagem nova, sem desencaixe)", () => {
  it("fechada some, meia é a aberta com o queixo achatado (presa na linha da boca), aberta é o recorte inteiro", () => {
    expect(aparenciaBoca(0).opacidade).toBe(0);
    expect(aparenciaBoca(0.5).opacidade).toBe(1);
    expect(aparenciaBoca(0.5).escala).toBeGreaterThan(0.6);
    expect(aparenciaBoca(0.5).escala).toBeLessThan(0.8);
    expect(aparenciaBoca(1)).toEqual({ opacidade: 1, escala: 1 });
    for (let b = 0.05; b <= 1; b += 0.05) expect(aparenciaBoca(b).escala).toBeGreaterThan(aparenciaBoca(b - 0.05).escala);
  });
  it("a boca começa no focinho (sobrancelhas do recorte não pulam) em todos os recortes do manifesto", () => {
    for (const id of ["stazi", "stazia"]) {
      for (const pose of ["falando", "falandoFirme"]) {
        const s = spritePose(id, pose)!;
        const g = geometriaBoca(s)!;
        expect(g.corte, `${id} ${pose}`).toBeCloseTo(s.ny - s.boca!.y, 5);
        expect(g.corte).toBeGreaterThan(0);
        expect(g.h).toBeGreaterThan(s.boca!.h * 0.3);
        expect(g.cx).toBeGreaterThan(0);
        expect(g.cx).toBeLessThan(s.boca!.w);
      }
    }
  });

  // 17/10/2026, "a boca sai um pouco do quadro": a dobra da meia boca era o centro do focinho, ~31–41 px lógicos acima do lábio; na
  // meia boca o lábio de cima e os cantos subiam ~6 px na tela de voz (medido no navegador: scripts/boca-alinhamento/medir.mjs).
  // px de tela por px lógico: tela de voz (caixa 480), prévia de voz (440), rosto do Mini Tutor (123). A geometria é em px lógicos,
  // então vale igual para a versão cheia e a "meia" dos sprites (as duas são esticadas ao mesmo tamanho lógico).
  const TELAS = { "tela de voz": 480 / 820, "prévia de voz": 440 / 820, "Mini Tutor": 123 / 820 };
  const COM_BOCA = ["stazi", "stazia"].flatMap((id) => ["falando", "falandoFirme"].map((pose) => [id, pose] as const));

  it("a dobra fica na linha da boca (lábio de cima), bem abaixo do focinho, em todas as poses com boca", () => {
    for (const [id, pose] of COM_BOCA) {
      const s = spritePose(id, pose)!;
      const b = s.boca!;
      const g = geometriaBoca(s)!;
      expect(Number.isFinite(b.labio), `${id} ${pose}: manifest sem boca.labio`).toBe(true);
      expect(g.dobra, `${id} ${pose}`).toBeCloseTo(b.labio - b.y, 5);
      expect(g.dobra - g.corte, `${id} ${pose}: dobra colada no focinho`).toBeGreaterThan(20);
      expect(b.labio - s.ny, `${id} ${pose}`).toBeLessThan(60); // ainda na boca, não no queixo
      expect(g.hCima + g.hBaixo).toBeCloseTo(g.h, 5);
      expect(g.hBaixo).toBeGreaterThan(b.h * 0.2);
    }
  });

  it("o lábio de cima não sai do lugar em nenhuma abertura (≤ 1 px na tela), nos três tamanhos e nos dois personagens", () => {
    for (const [id, pose] of COM_BOCA) {
      const s = spritePose(id, pose)!;
      const g = geometriaBoca(s)!;
      const labio = s.boca!.labio - s.boca!.y;
      for (const [tela, u] of Object.entries(TELAS)) {
        for (let v = 0; v <= 1.0001; v += 0.05) {
          const e = aparenciaBoca(v).escala;
          // lábio de cima e tudo entre o focinho e ele: parados
          expect(Math.abs(posicaoNaBoca(g, labio, e) - labio) * u, `${id} ${pose} ${tela} abertura ${v.toFixed(2)}`).toBeLessThanOrEqual(1);
          expect(posicaoNaBoca(g, g.corte + 1, e)).toBe(g.corte + 1);
          // e a boca abre de verdade: o fim do recorte (queixo) desce com a abertura
          expect(posicaoNaBoca(g, s.boca!.h, e)).toBeCloseTo(g.dobra + g.hBaixo * e, 5);
        }
      }
      expect(posicaoNaBoca(g, s.boca!.h, 1)).toBeCloseTo(s.boca!.h, 5); // aberta = recorte inteiro, no lugar
    }
  });

  it("sem a linha da boca no manifesto, cai no jeito antigo (dobra no focinho) sem quebrar", () => {
    const s = spritePose("stazi", "falando")!;
    const g = geometriaBoca({ ...s, boca: { ...s.boca!, labio: undefined } })!;
    expect(g.dobra).toBeCloseTo(g.corte, 5);
    expect(g.hCima).toBe(0);
  });
});

describe("tocador: nível do som que sai do alto-falante", () => {
  class No { connect() {} disconnect() {} }
  const ctxFalso = () => ({
    state: "running", currentTime: 0, outputLatency: 0.03, destination: new No(),
    createGain: () => Object.assign(new No(), { gain: { value: 1 } }),
    createMediaStreamDestination: () => Object.assign(new No(), { stream: { id: "voz" } }),
    createBuffer: (_c: number, n: number, rate: number) => { const d = new Float32Array(n); return { duration: n / rate, sampleRate: rate, getChannelData: () => d }; },
    createBufferSource: () => Object.assign(new No(), { start() {}, stop() {}, onended: null }),
  });
  const b64 = (x: Float32Array) => { const u = new Uint8Array(x.length * 2); x.forEach((v, i) => { const s = Math.round(v * 32767) & 0xffff; u[2 * i] = s & 255; u[2 * i + 1] = s >> 8; }); return btoa(String.fromCharCode(...u)); };
  it("anota o volume no instante em que cada pedaço vai tocar e zera na interrupção", () => {
    const ctx: any = ctxFalso();
    const p = new AudioPlayer(ctx, 1, null, { semitons: 0 });
    const nivel = nivelDoFluxo(p.stream)!;
    expect(nivel).toBeTypeOf("function");
    const tom = new Float32Array(4800).map((_, i) => 0.2 * Math.sin(i / 3)); // 200 ms
    const silencio = new Float32Array(4800);
    p.play(b64(silencio));
    p.play(b64(tom));
    // começa em 0,03 s (folga): silêncio até 0,23 s, tom de 0,23 a 0,43 s
    expect(p.nivelEm(0.13)).toBe(0);
    expect(p.nivelEm(0.33)).toBeGreaterThan(0.35);
    expect(p.nivelEm(0.6)).toBe(0);
    // tempo que sai do alto-falante = relógio do contexto menos a latência de saída
    ctx.currentTime = 0.36;
    expect(p.tempoOuvido()).toBeCloseTo(0.33, 5);
    expect(nivel(0)).toBeGreaterThan(0.35);
    p.stop();
    expect(p.nivelEm(0.33)).toBe(0);
  });
  it("RMS por blocos de 10 ms", () => {
    const r = rmsPorBloco(new Float32Array(480).fill(0.5), 24000);
    expect(r.length).toBe(2);
    expect(r[0]).toBeCloseTo(0.5, 5);
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
