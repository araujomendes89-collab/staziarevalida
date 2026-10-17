/**
 * Afinador da voz ao vivo (voice/pitchShift.js) e o tocador (voice/audioPlayer.js): o Stazi fala com a voz Gemini "Zubenelgenubi"
 * +3 semitons no mesmo ritmo (decisão do dono, 17/10/2026); a Stazia (0 semitons) segue bit a bit no caminho de antes.
 * Confere: 0 = devolve a entrada; duração igual; tom sobe 3 semitons; mesmo resultado com pedaços de 40 ms, 100 ms ou inteiro;
 * reiniciar zera; sem NaN e sem saturar; tocador afina antes de agendar, solta o fim no turno completo, cala na hora no stop();
 * geminiLive afina e solta o fim no turno completo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AfinadorStream, afinarTudo, definirSemitonsDaVoz, normalizarSemitons, semitonsDaVoz } from "../novo/app/tutor/voice/pitchShift.js";
import { AudioPlayer, base64ToFloat32 } from "../novo/app/tutor/voice/audioPlayer.js";
import { openGeminiLive, pcm16Base64 } from "../novo/app/tutor/voice/geminiLive.js";

const TAXA = 24_000;
const seno = (hz: number, s: number, amp = 0.8) => {
  const n = Math.round(TAXA * s);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * hz * i) / TAXA);
  return a;
};
// voz de mentira: fundamental que varia (vibrato) + harmônicos + um pouco de ruído determinístico
const vozFalsa = (s: number) => {
  const n = Math.round(TAXA * s);
  const a = new Float32Array(n);
  let fase = 0;
  let semente = 7;
  for (let i = 0; i < n; i++) {
    const f0 = 180 + 30 * Math.sin((2 * Math.PI * 3 * i) / TAXA);
    fase += (2 * Math.PI * f0) / TAXA;
    semente = (semente * 1103515245 + 12345) % 2147483648;
    const env = i < n * 0.1 || i > n * 0.9 ? 0.2 : 1;
    a[i] = env * (0.45 * Math.sin(fase) + 0.2 * Math.sin(2 * fase) + 0.1 * Math.sin(3 * fase) + 0.02 * (semente / 2147483648 - 0.5));
  }
  return a;
};
const fatiar = (a: Float32Array, tam: number, sem = 3) => {
  const af = new AfinadorStream({ semitons: sem, taxa: TAXA });
  const partes: Float32Array[] = [];
  let maxRetidas = 0;
  for (let i = 0; i < a.length; i += tam) {
    partes.push(af.processar(a.subarray(i, i + tam)));
    maxRetidas = Math.max(maxRetidas, af.retidas);
  }
  partes.push(af.finalizar());
  return { saida: juntar(partes), maxRetidas };
};
const juntar = (partes: Float32Array[]) => {
  const out = new Float32Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
/** Frequência fundamental pela autocorrelação (com interpolação parabólica do pico), no miolo do sinal. */
const tom = (a: Float32Array) => {
  const s = a.subarray(Math.floor(a.length * 0.25), Math.floor(a.length * 0.75));
  const c: number[] = [];
  let melhor = -Infinity;
  let lag = 0;
  for (let L = 40; L <= 200; L++) {
    let v = 0;
    for (let i = 0; i + L < s.length; i++) v += s[i] * s[i + L];
    c[L] = v;
    if (v > melhor) {
      melhor = v;
      lag = L;
    }
  }
  const [y0, y1, y2] = [c[lag - 1], c[lag], c[lag + 1]];
  return TAXA / (lag + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2));
};
const pico = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("AfinadorStream", () => {
  it("0 semitons: devolve a própria entrada, sem tocar (caminho de hoje, bit a bit)", () => {
    const a = new AfinadorStream({ semitons: 0, taxa: TAXA });
    const x = vozFalsa(0.1);
    expect(a.ativo).toBe(false);
    expect(a.processar(x)).toBe(x);
    expect(a.finalizar().length).toBe(0);
    expect(a.retidas).toBe(0);
    expect(afinarTudo(x, { semitons: 0 })).toBe(x);
    expect(normalizarSemitons("x")).toBe(0);
    expect(normalizarSemitons(40)).toBe(12);
  });

  it("+3: a duração da saída é a da entrada (±2%), em pedaços e de uma vez", () => {
    const x = vozFalsa(1.3);
    for (const tam of [960, 2400, x.length]) {
      const { saida } = fatiar(x, tam);
      expect(Math.abs(saida.length - x.length) / x.length).toBeLessThanOrEqual(0.02);
      expect(saida.length).toBe(x.length); // na prática, exata
    }
  });

  it("+3: um seno de 200 Hz sai ≈ 3 semitons acima (±0,3)", () => {
    const x = seno(200, 1);
    const y = afinarTudo(x, { semitons: 3, taxa: TAXA });
    const subiu = 12 * Math.log2(tom(y) / tom(x));
    expect(subiu).toBeGreaterThan(2.7);
    expect(subiu).toBeLessThan(3.3);
    // e −3 desce
    const desceu = 12 * Math.log2(tom(afinarTudo(x, { semitons: -3, taxa: TAXA })) / tom(x));
    expect(desceu).toBeGreaterThan(-3.3);
    expect(desceu).toBeLessThan(-2.7);
  });

  it("o tamanho do pedaço não muda o resultado (40 ms, 100 ms, inteiro e até pedaços tortos)", () => {
    const x = vozFalsa(1.2);
    const inteiro = afinarTudo(x, { semitons: 3, taxa: TAXA });
    for (const tam of [960, 2400, 37, 1001]) {
      const { saida } = fatiar(x, tam);
      expect(saida.length).toBe(inteiro.length);
      let dif = 0;
      for (let i = 0; i < saida.length; i++) dif = Math.max(dif, Math.abs(saida[i] - inteiro[i]));
      expect(dif).toBeLessThan(1e-6);
    }
  });

  it("latência pequena: segura no máximo ~34 ms (pedaços de 40 e 100 ms seguram ~30 ms)", () => {
    const x = vozFalsa(1);
    expect(fatiar(x, 960).maxRetidas / TAXA).toBeLessThanOrEqual(0.031);
    expect(fatiar(x, 2400).maxRetidas / TAXA).toBeLessThanOrEqual(0.031);
    expect(fatiar(x, 1).maxRetidas / TAXA).toBeLessThanOrEqual(0.034);
  });

  it("reiniciar() zera o estado: depois dele, o pedaço sai igual ao de um afinador novo", () => {
    const x = vozFalsa(0.4);
    const a = new AfinadorStream({ semitons: 3, taxa: TAXA });
    a.processar(vozFalsa(0.3));
    expect(a.retidas).toBeGreaterThan(0);
    a.reiniciar();
    expect(a.retidas).toBe(0);
    const depois = a.processar(x);
    const novo = new AfinadorStream({ semitons: 3, taxa: TAXA }).processar(x);
    expect(Array.from(depois)).toEqual(Array.from(novo));
  });

  it("sem NaN, sem saturar, e o volume continua o mesmo", () => {
    const x = seno(200, 1, 0.9);
    const y = afinarTudo(x, { semitons: 3, taxa: TAXA });
    expect(y.some((v) => Number.isNaN(v))).toBe(false);
    expect(pico(y)).toBeLessThanOrEqual(0.95);
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const miolo = (a: Float32Array) => a.subarray(2400, a.length - 2400);
    expect(rms(miolo(y)) / rms(miolo(x))).toBeGreaterThan(0.9);
    expect(rms(miolo(y)) / rms(miolo(x))).toBeLessThan(1.1);
    // silêncio continua silêncio; pedaço vazio não quebra
    const a = new AfinadorStream({ semitons: 3, taxa: TAXA });
    expect(a.processar(new Float32Array(0)).length).toBe(0);
    const z = a.processar(new Float32Array(4800));
    expect(pico(z)).toBe(0);
  });
});

// ---- tocador ----
class FakeNode {
  connected: unknown[] = [];
  connect(n: unknown) {
    this.connected.push(n);
    return n;
  }
  disconnect() {}
}
class FakeCtx {
  state = "running";
  currentTime = 0;
  destination = new FakeNode();
  sources: any[] = [];
  audioWorklet = { addModule: async () => {} };
  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1 } });
  }
  createMediaStreamDestination() {
    return Object.assign(new FakeNode(), { stream: { id: "voz" } });
  }
  createMediaStreamSource(stream: unknown) {
    return Object.assign(new FakeNode(), { stream });
  }
  createBuffer(_ch: number, n: number, rate: number) {
    const data = new Float32Array(n);
    return { duration: n / rate, sampleRate: rate, getChannelData: () => data };
  }
  createBufferSource() {
    const s: any = Object.assign(new FakeNode(), { at: null, stopped: false, onended: null });
    s.start = (at: number) => (s.at = at);
    s.stop = () => (s.stopped = true);
    this.sources.push(s);
    return s;
  }
  resume() {
    return Promise.resolve();
  }
}
const tocado = (ctx: FakeCtx) => juntar(ctx.sources.map((s) => s.buffer.getChannelData(0)));
const pedacosB64 = (x: Float32Array, tam: number) => {
  const out: string[] = [];
  for (let i = 0; i < x.length; i += tam) out.push(pcm16Base64(x.subarray(i, i + tam)));
  return out;
};

afterEach(() => {
  vi.useRealTimers();
  definirSemitonsDaVoz(0);
});

describe("AudioPlayer com afinação", () => {
  it("0 semitons: toca exatamente o que chegou, como antes, sem relógio nenhum", () => {
    vi.useFakeTimers();
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx as any, 1, null, { semitons: 0 });
    const b64 = pedacosB64(vozFalsa(0.3), 2400);
    for (const b of b64) p.play(b);
    expect(ctx.sources).toHaveLength(b64.length);
    ctx.sources.forEach((s, i) => expect(Array.from(s.buffer.getChannelData(0))).toEqual(Array.from(base64ToFloat32(b64[i]))));
    expect(vi.getTimerCount()).toBe(0);
    p.flush();
    expect(ctx.sources).toHaveLength(b64.length);
  });

  it("+3: afina antes de agendar, em sequência sem buraco, e o turno completo solta o fim (mesma duração)", () => {
    vi.useFakeTimers();
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx as any, 1, null, { semitons: 3 });
    const x = vozFalsa(0.5);
    const b64 = pedacosB64(x, 2400);
    for (const b of b64) p.play(b);
    const entrada = juntar(b64.map(base64ToFloat32));
    expect(tocado(ctx).length).toBeLessThan(entrada.length); // o finzinho ficou guardado
    p.flush();
    const saida = tocado(ctx);
    expect(saida.length).toBe(entrada.length);
    expect(Array.from(saida)).toEqual(Array.from(afinarTudo(entrada, { semitons: 3, taxa: TAXA })));
    for (let i = 1; i < ctx.sources.length; i++) expect(ctx.sources[i].at).toBeCloseTo(ctx.sources[i - 1].at + ctx.sources[i - 1].buffer.duration, 9);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("+3: sem pedaço novo, o relógio solta o fim antes de a fila acabar", () => {
    vi.useFakeTimers();
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx as any, 1, null, { semitons: 3 });
    p.play(pcm16Base64(vozFalsa(0.2)));
    const antes = ctx.sources.length;
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(ctx.sources.length).toBe(antes + 1);
    expect(tocado(ctx).length).toBe(Math.round(0.2 * TAXA));
  });

  it("stop() cala na hora e descarta o que o afinador guardava (nada da fala cortada sai depois)", () => {
    vi.useFakeTimers();
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx as any, 1, null, { semitons: 3 });
    for (const b of pedacosB64(vozFalsa(0.3), 960)) p.play(b);
    const cortadas = ctx.sources.length;
    p.stop();
    expect(ctx.sources.every((s) => s.stopped)).toBe(true);
    expect(p.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(p.afinador.retidas).toBe(0);
    p.flush();
    expect(ctx.sources.length).toBe(cortadas);
    // a fala nova começa do zero
    const nova = pcm16Base64(vozFalsa(0.2));
    p.play(nova);
    const doZero = new AfinadorStream({ semitons: 3, taxa: TAXA }).processar(base64ToFloat32(nova));
    expect(Array.from(ctx.sources[ctx.sources.length - 1].buffer.getChannelData(0))).toEqual(Array.from(doZero));
  });

  it("segue os semitons que a tela de voz pede (definirSemitonsDaVoz) até fechar", () => {
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx as any, 1, null, { seguirTela: true });
    expect(p.semitons).toBe(0);
    definirSemitonsDaVoz(3);
    expect(semitonsDaVoz()).toBe(3);
    expect(p.semitons).toBe(3);
    const fixo = new AudioPlayer(ctx as any, 1, null, { semitons: 0 });
    const mp3 = new AudioPlayer(ctx as any, 1); // a voz do professor (Nexus) nunca é afinada
    expect(fixo.semitons).toBe(0);
    expect(mp3.semitons).toBe(0);
    p.close();
    definirSemitonsDaVoz(0);
    expect(p.semitons).toBe(3); // fechado: não segue mais
  });
});

describe("geminiLive com a voz afinada", () => {
  it("afina os pedaços, solta o fim no turno completo e corta tudo na interrupção", async () => {
    (globalThis as any).AudioWorkletNode = class extends FakeNode {
      port = { onmessage: null };
    };
    URL.createObjectURL = (() => "blob:captura") as typeof URL.createObjectURL;
    URL.revokeObjectURL = () => {};
    const conns: any[] = [];
    const sdk = {
      GoogleGenAI: class {
        live = {
          connect: async (p: any) => {
            const c: any = { cb: p.callbacks, sendRealtimeInput() {}, sendToolResponse() {}, close() {} };
            conns.push(c);
            return c;
          },
        };
      },
    };
    const ctx = new FakeCtx();
    const onTurnComplete = vi.fn();
    const gem = await openGeminiLive({ token: "t", model: "m", stream: {}, handlers: { onTurnComplete }, sdk, audioContext: ctx, semitons: 3 });
    const x = vozFalsa(0.4);
    const msg = (b: string) => ({ serverContent: { modelTurn: { parts: [{ inlineData: { data: b, mimeType: "audio/pcm;rate=24000" } }] } } });
    const b64 = pedacosB64(x, 2400);
    for (const b of b64) conns[0].cb.onmessage(msg(b));
    conns[0].cb.onmessage({ serverContent: { turnComplete: true } });
    expect(onTurnComplete).toHaveBeenCalled();
    const entrada = juntar(b64.map(base64ToFloat32));
    expect(Array.from(tocado(ctx))).toEqual(Array.from(afinarTudo(entrada, { semitons: 3, taxa: TAXA })));
    // interrupção no meio da próxima fala
    for (const b of b64.slice(0, 2)) conns[0].cb.onmessage(msg(b));
    conns[0].cb.onmessage({ serverContent: { interrupted: true } });
    expect(gem.speaking).toBe(false);
    gem.setSemitons(0);
    gem.close();
  });
});
