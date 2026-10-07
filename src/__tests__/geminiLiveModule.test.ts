/**
 * Voz do Gemini no navegador (voice/geminiLive.js) com o SDK do Google e o áudio SIMULADOS: conexão com a chave temporária (nada
 * além da continuidade vai no pedido), abertura do professor só depois de o aplicativo ter o controle, microfone em PCM 16 kHz
 * (inclusive vindo de um contexto a 48 kHz), voz tocada em sequência e cortada quando o aluno interrompe, ferramentas, troca de
 * conexão do Google e quedas (a conexão antiga não derruba a nova), e nada fica ligado quando não abre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { base64ToFloat32, GEMINI_IN_RATE, openGeminiLive, pcm16Base64 } from "../novo/app/tutor/voice/geminiLive.js";

class FakeNode {
  connected: unknown[] = [];
  disconnected = false;
  connect(n: unknown) {
    this.connected.push(n);
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}
let failWorklet = false;
const blobs: Blob[] = [];
class FakeCtx {
  state = "running";
  currentTime = 0;
  destination = new FakeNode();
  closed = false;
  modules: string[] = [];
  sources: any[] = [];
  audioWorklet = {
    addModule: async (url: string) => {
      this.modules.push(url);
      if (failWorklet) throw new Error("sem worklet");
    },
  };
  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1 } });
  }
  createMediaStreamDestination() {
    return Object.assign(new FakeNode(), { stream: { id: "voz-do-professor" } });
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
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}
const captureNodes: any[] = [];
(globalThis as any).AudioWorkletNode = class extends FakeNode {
  port = { onmessage: null as null | ((e: { data: Float32Array }) => void) };
  constructor(readonly ctx: unknown, readonly name: string, readonly opts: unknown) {
    super();
    captureNodes.push(this);
  }
};
URL.createObjectURL = ((b: Blob) => (blobs.push(b), "blob:captura")) as typeof URL.createObjectURL;
URL.revokeObjectURL = () => {};

// SDK do Google simulado: cada conexão guarda o que foi enviado e os retornos (callbacks) para o teste disparar mensagens
const conns: any[] = [];
const sdkOpts: any[] = [];
let connectFails = false;
let setupDuringConnect = false;
class FakeGenAI {
  live: { connect: (p: any) => Promise<any> };
  constructor(opts: unknown) {
    sdkOpts.push(opts);
    this.live = {
      connect: async (p: any) => {
        if (connectFails) throw new Error("recusado pelo Google");
        const c: any = { params: p, cb: p.callbacks, sent: [] as any[], tools: [] as any[], closed: false };
        c.sendRealtimeInput = (m: unknown) => c.sent.push(m);
        c.sendToolResponse = (m: unknown) => c.tools.push(m);
        c.close = () => (c.closed = true);
        conns.push(c);
        if (setupDuringConnect) p.callbacks.onmessage({ setupComplete: {} });
        return c;
      },
    };
  }
}
const sdk = { GoogleGenAI: FakeGenAI };
const tick = () => new Promise((r) => setTimeout(r, 0));
const handlers = () => ({
  onReady: vi.fn(), onAudio: vi.fn(), onIdle: vi.fn(), onTranscript: vi.fn(), onTurnComplete: vi.fn(), onToolCalls: vi.fn(), onInterrupted: vi.fn(),
  onUsage: vi.fn(), onReconnect: vi.fn(), onClose: vi.fn(), onError: vi.fn(),
});
const open = (h: any, ctx = new FakeCtx()) => openGeminiLive({ token: "auth_tokens/temporario", model: "gemini-3.8-live", stream: { id: "microfone" }, handlers: h, sdk, audioContext: ctx });

beforeEach(() => {
  failWorklet = false;
  connectFails = false;
  setupDuringConnect = false;
});

describe("Áudio em PCM", () => {
  it("vai e volta em 16 bits, cortando o que passa do limite", () => {
    const back = base64ToFloat32(pcm16Base64(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -3])));
    expect(Array.from(back).map((v) => Number(v.toFixed(3)))).toEqual([0, 0.5, -0.5, 1, -1, 1, -1]);
  });

  it("a captura reduz 48 kHz para 16 kHz (a voz continua a mesma) e não mexe quando o contexto já está a 16 kHz", async () => {
    await open(handlers());
    const src = await blobs[0].text();
    const run = async (rate: number, input: Float32Array) => {
      const posted: Float32Array[] = [];
      let Proc: any = null;
      class Base {
        port = { postMessage: (m: Float32Array) => posted.push(m) };
      }
      new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", src)(Base, (_n: string, P: unknown) => (Proc = P), rate);
      const p = new Proc({ processorOptions: { rate: GEMINI_IN_RATE } });
      for (let i = 0; i < input.length; i += 128) expect(p.process([[input.subarray(i, i + 128)]])).toBe(true);
      const out = new Float32Array(posted.reduce((n, b) => n + b.length, 0));
      let o = 0;
      for (const b of posted) {
        out.set(b, o);
        o += b.length;
      }
      return out;
    };
    // 0,2 s de um tom de 440 Hz a 48 kHz: 3200 amostras a 16 kHz, mesma frequência e quase a mesma intensidade
    const n48 = 9600;
    const tone = new Float32Array(n48).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48_000));
    const down = await run(48_000, tone);
    expect(down.length).toBe(3200);
    const body = down.subarray(200);
    const rms = Math.sqrt(body.reduce((s, v) => s + v * v, 0) / body.length);
    expect(rms).toBeGreaterThan(0.5 * Math.SQRT1_2 * 0.95);
    expect(rms).toBeLessThan(0.5 * Math.SQRT1_2 * 1.05);
    let crossings = 0;
    for (let i = 1; i < body.length; i++) if (body[i - 1] < 0 !== body[i] < 0) crossings++;
    expect(Math.abs(crossings - (2 * 440 * body.length) / 16_000)).toBeLessThanOrEqual(3);
    // contexto já a 16 kHz: passa igual
    const same = new Float32Array(3200).map((_, i) => Math.sin(i / 7));
    expect(Array.from(await run(16_000, same))).toEqual(Array.from(same));
  });
});

describe("Conversa com o Gemini", () => {
  it("conecta só com a chave temporária, abre depois de entregar o controle, manda o microfone, toca a voz e usa as ferramentas", async () => {
    const h = handlers();
    const ctx = new FakeCtx();
    setupDuringConnect = true; // o Google ficou pronto antes de a função devolver o controle
    const ctl = await open(h, ctx);
    expect(h.onReady).not.toHaveBeenCalled();
    await tick();
    expect(h.onReady).toHaveBeenCalledTimes(1);
    expect(ctl.ready).toBe(true);
    expect(sdkOpts.at(-1)).toEqual({ apiKey: "auth_tokens/temporario", httpOptions: { apiVersion: "v1alpha" } });
    const c = conns.at(-1);
    expect(c.params.model).toBe("gemini-3.8-live");
    expect(c.params.config).toEqual({ sessionResumption: {} }); // instruções, voz e ferramentas estão travadas na chave
    expect(ctl.outputStream).toEqual({ id: "voz-do-professor" });
    // microfone: blocos de 100 ms em PCM 16 kHz; mudo não envia e avisa o fim da fala
    const node = captureNodes.at(-1);
    expect(node.opts).toEqual({ processorOptions: { rate: 16_000 } });
    node.port.onmessage({ data: new Float32Array(1600).fill(0.25) });
    expect(c.sent[0].audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(base64ToFloat32(c.sent[0].audio.data)).toHaveLength(1600);
    ctl.mute(true);
    expect(c.sent.at(-1)).toEqual({ audioStreamEnd: true });
    node.port.onmessage({ data: new Float32Array(1600) });
    expect(c.sent.filter((m: any) => m.audio)).toHaveLength(1);
    ctl.mute(false);
    // voz do professor: pedaços tocados em sequência, sem buraco
    const chunk = pcm16Base64(new Float32Array(2400).fill(0.1)); // 100 ms a 24 kHz
    c.cb.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: chunk } }, { inlineData: { mimeType: "audio/pcm;rate=24000", data: chunk } }] } } });
    expect(h.onAudio).toHaveBeenCalledTimes(2);
    const [s1, s2] = ctx.sources;
    expect(s2.at).toBeCloseTo(s1.at + 0.1, 6);
    expect(ctl.speaking).toBe(true);
    // legendas e fim de turno
    c.cb.onmessage({ serverContent: { outputTranscription: { text: "Fala, " } } });
    c.cb.onmessage({ serverContent: { inputTranscription: { text: "oi", finished: true }, turnComplete: true } });
    expect(h.onTranscript.mock.calls).toEqual([["tutor", "Fala, ", false], ["student", "oi", true]]);
    expect(h.onTurnComplete).toHaveBeenCalledTimes(1);
    // o aluno falou por cima: a voz para na hora
    c.cb.onmessage({ serverContent: { interrupted: true } });
    expect(s1.stopped && s2.stopped).toBe(true);
    expect(ctl.speaking).toBe(false);
    expect(h.onInterrupted).toHaveBeenCalledTimes(1);
    // terminou de falar: avisa
    c.cb.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: chunk } }] } } });
    ctx.sources.at(-1).onended();
    expect(h.onIdle).toHaveBeenCalledTimes(1);
    // ferramentas: o pedido sobe para o aplicativo e a resposta volta na ordem
    c.cb.onmessage({ toolCall: { functionCalls: [{ id: "f1", name: "get_question_context", args: {} }] }, usageMetadata: { totalTokenCount: 30 } });
    expect(h.onToolCalls).toHaveBeenCalledWith([{ id: "f1", name: "get_question_context", args: {} }]);
    expect(h.onUsage).toHaveBeenCalledWith({ totalTokenCount: 30 });
    ctl.respondTools([{ id: "f1", name: "get_question_context", response: { output: { ok: true } } }]);
    expect(c.tools).toEqual([{ functionResponses: [{ id: "f1", name: "get_question_context", response: { output: { ok: true } } }] }]);
    ctl.sendText("O aluno acabou de abrir a conversa.");
    expect(c.sent.at(-1)).toEqual({ text: "O aluno acabou de abrir a conversa." });
    // fechar: conexão e captura desligadas; o contexto (compartilhado com a esfera) continua
    ctl.close();
    expect(c.closed).toBe(true);
    expect(node.disconnected).toBe(true);
    expect(ctx.closed).toBe(false);
    c.cb.onmessage({ serverContent: { outputTranscription: { text: "depois de fechar" } } });
    expect(h.onTranscript).toHaveBeenCalledTimes(2);
    ctl.sendText("nada");
    expect(c.sent.at(-1)).toEqual({ text: "O aluno acabou de abrir a conversa." });
    // o processador de captura é carregado uma vez por contexto
    const again = await open(handlers(), ctx);
    expect(ctx.modules).toHaveLength(1);
    again.close();
  });

  it("o Google troca a conexão (goAway): continua a mesma conversa; a antiga não derruba a nova; quedas têm limite", async () => {
    const h = handlers();
    const ctl = await open(h);
    const c1 = conns.at(-1);
    const node = captureNodes.at(-1);
    c1.cb.onmessage({ setupComplete: {} });
    await tick();
    expect(h.onReady).toHaveBeenCalledTimes(1);
    c1.cb.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: "h1" } });
    const before = conns.length;
    c1.cb.onmessage({ goAway: { timeLeft: "10s" } });
    await tick();
    const c2 = conns.at(-1);
    expect(conns.length).toBe(before + 1);
    expect(c2.params.config).toEqual({ sessionResumption: { handle: "h1" } });
    expect(c1.closed).toBe(true);
    expect(h.onReconnect).toHaveBeenLastCalledWith("goaway");
    c1.cb.onclose({ code: 1000 }); // a antiga avisa que fechou depois da troca: nada acontece
    await tick();
    expect(conns.length).toBe(before + 1);
    expect(h.onClose).not.toHaveBeenCalled();
    c2.cb.onmessage({ setupComplete: {} });
    await tick();
    expect(h.onReady).toHaveBeenCalledTimes(1); // a conversa não "abre" de novo
    node.port.onmessage({ data: new Float32Array(1600) });
    expect(c2.sent.some((m: any) => m.audio)).toBe(true);
    // duas quedas de rede são retomadas; a terceira avisa o aplicativo (que abre outra ligação)
    c2.cb.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: "h2" } });
    c2.cb.onclose({ code: 1006 });
    await tick();
    const c3 = conns.at(-1);
    expect(c3.params.config).toEqual({ sessionResumption: { handle: "h2" } });
    expect(h.onReconnect).toHaveBeenLastCalledWith("drop");
    c3.cb.onclose({ code: 1006 });
    await tick();
    const c4 = conns.at(-1);
    expect(conns.length).toBe(before + 3);
    c4.cb.onclose({ code: 1006 });
    await tick();
    expect(conns.length).toBe(before + 3);
    expect(h.onClose).toHaveBeenCalledWith({ beforeReady: false, reason: "1006" });
    expect(node.disconnected).toBe(true);
    ctl.close();
  });

  it("não abriu: fechada antes de ficar pronta, captura sem suporte ou conexão recusada; nada fica ligado", async () => {
    const h = handlers();
    await open(h);
    conns.at(-1).cb.onclose({ code: 1008, reason: "chave recusada" });
    expect(h.onClose).toHaveBeenCalledWith({ beforeReady: true, reason: "chave recusada" });
    await tick();
    expect(h.onReady).not.toHaveBeenCalled();
    failWorklet = true;
    await expect(open(handlers())).rejects.toThrow("sem worklet");
    expect(conns.at(-1).closed).toBe(true);
    failWorklet = false;
    connectFails = true;
    await expect(open(handlers())).rejects.toThrow("recusado pelo Google");
  });
});
