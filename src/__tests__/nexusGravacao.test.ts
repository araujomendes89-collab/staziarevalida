// @vitest-environment jsdom
/**
 * Gravação da fala do aluno na Nexus (modo reserva) e o tocador da voz do professor (spec §16 "Turno"): webm/opus no Chrome e mp4
 * no Safari; desde 18/10 TODO aparelho (iPhone inclusive) para sozinho depois de 1,2 s de silêncio, só depois de ouvir fala, com
 * limiar que aprende o ruído de fundo; medidor que só devolve zeros avisa (a tela pede um toque); tudo para em 45 s; só silêncio,
 * cancelada ou acima de 4 MB não vai ao servidor. O tocador toca o mp3 pelo
 * caminho que a esfera mede e para na hora. E a cor da esfera acompanha a irritação, até o vermelho.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { DEAD_METER_MS, MAX_AUDIO_BYTES, MAX_RECORD_MS, MIN_SPEECH_MS, SILENCE_MS, createVad, pickMime, startRecording } from "../novo/app/tutor/nexus/recorder.js";
import { AudioPlayer, base64ToFloat32 } from "../novo/app/tutor/voice/audioPlayer.js";
import { ORB_EMOTION, orbEmotion } from "../novo/app/tutor/voice/StaziaVoiceOrb.jsx";

class FakeRecorder {
  static supported = new Set(["audio/webm;codecs=opus", "audio/mp4"]);
  static last: FakeRecorder | null = null;
  static isTypeSupported(t: string) {
    return FakeRecorder.supported.has(t);
  }
  state = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  size = 2048;
  constructor(public stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "";
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(this.size)], { type: this.mimeType }) });
    this.onstop?.();
  }
}

let level = 0;
const record = (over: Record<string, unknown> = {}) => {
  const done = vi.fn();
  const r = startRecording({ stream: {}, level: () => level, MediaRecorderImpl: FakeRecorder as any, onDone: done, ...over });
  return { r, done };
};
const tick = (ms: number) => vi.advanceTimersByTime(ms);

beforeEach(() => {
  vi.useFakeTimers();
  level = 0;
  FakeRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/mp4"]);
});
afterEach(() => vi.useRealTimers());

describe("Gravação da fala", () => {
  it("escolhe webm/opus no Chrome e mp4 no Safari", () => {
    expect(pickMime((t: string) => t === "audio/webm;codecs=opus" || t === "audio/mp4")).toBe("audio/webm;codecs=opus");
    expect(pickMime((t: string) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickMime(() => false)).toBe("");
    expect(pickMime(undefined as any)).toBe("");
    FakeRecorder.supported = new Set(["audio/mp4"]);
    const { r } = record();
    expect(FakeRecorder.last!.mimeType).toBe("audio/mp4");
    r.cancel();
  });

  it("para sozinho (em qualquer aparelho) depois de 1,2 s de silêncio, só depois de ouvir fala; para em 45 s", () => {
    expect([SILENCE_MS, MAX_RECORD_MS]).toEqual([1200, 45_000]);
    level = 0.003; // ruído de fundo da sala
    const a = record();
    tick(5000);
    expect(FakeRecorder.last!.state).toBe("recording");
    level = 0.12; // começou a falar
    tick(600);
    level = 0.003; // calou
    tick(1100);
    expect(a.done).not.toHaveBeenCalled();
    tick(250);
    expect(a.done).toHaveBeenCalledTimes(1);
    const out = a.done.mock.calls[0][0];
    expect(out.blob).toBeInstanceOf(Blob);
    expect(out.mime).toBe("audio/webm;codecs=opus");
    expect(out.seconds).toBeGreaterThan(6);
    // falando sem parar: para em 45 s
    level = 0.2;
    const b = record();
    tick(MAX_RECORD_MS + 60);
    expect(b.done).toHaveBeenCalledTimes(1);
    expect(b.done.mock.calls[0][0].seconds).toBeLessThanOrEqual(45);
  });

  it("limiar adaptativo: o microfone baixinho do iPhone (ganho automático) e a sala barulhenta funcionam sem toque", () => {
    // iPhone: fundo 0,0008 e fala 0,02 (bem abaixo do limite fixo de antes)
    level = 0.0008;
    const baixo = record();
    tick(1000);
    level = 0.02;
    tick(800);
    level = 0.0008;
    tick(SILENCE_MS + 100);
    expect(baixo.done).toHaveBeenCalledWith(expect.objectContaining({ blob: expect.any(Blob) }));
    // sala barulhenta: fundo 0,03 não conta como fala; a fala a 0,15 conta
    level = 0.03;
    const sala = record();
    tick(4000);
    expect(sala.done).not.toHaveBeenCalled();
    level = 0.15;
    tick(700);
    level = 0.03;
    tick(SILENCE_MS + 100);
    expect(sala.done).toHaveBeenCalledWith(expect.objectContaining({ blob: expect.any(Blob) }));
    // estalo curto (menos que MIN_SPEECH_MS) não vale como fala
    level = 0.003;
    const estalo = record();
    tick(1000);
    level = 0.3;
    tick(MIN_SPEECH_MS - 100);
    level = 0.003;
    tick(SILENCE_MS + 500);
    expect(estalo.done).not.toHaveBeenCalled();
    estalo.r.cancel();
    const v = createVad();
    for (let i = 0; i < 40; i++) v.push(0.002);
    expect(v.limites.piso).toBeLessThan(0.003);
    expect(v.push(0.05)).toBe("speech");
  });

  it("medidor que só devolve zeros (Safari com o áudio suspenso): avisa uma vez; o 'Pronto' manda mesmo sem o medidor ouvir", () => {
    level = 0;
    const morto = vi.fn();
    const m = record({ onMeterDead: morto });
    tick(DEAD_METER_MS + 100);
    expect(morto).toHaveBeenCalledTimes(1);
    tick(5000);
    expect(morto).toHaveBeenCalledTimes(1);
    expect(m.done).not.toHaveBeenCalled();
    m.r.finish();
    expect(m.done).toHaveBeenCalledWith(expect.objectContaining({ blob: expect.any(Blob) }));
  });

  it("só silêncio, cancelada ou acima de 4 MB não é enviada", () => {
    level = 0.003;
    const quiet = record();
    tick(MAX_RECORD_MS);
    expect(quiet.done).toHaveBeenCalledWith(null);
    level = 0.5;
    const cancelled = record();
    tick(500);
    cancelled.r.cancel();
    expect(cancelled.done).toHaveBeenCalledWith(null);
    const big = record();
    tick(500);
    FakeRecorder.last!.size = MAX_AUDIO_BYTES + 1;
    big.r.finish();
    expect(big.done).toHaveBeenCalledWith(null);
  });
});

describe("Tocador da voz do professor", () => {
  const fakeCtx = () => {
    const sources: any[] = [];
    const ctx: any = {
      state: "running", currentTime: 0, destination: { name: "alto-falante" },
      resume: vi.fn(async () => {}),
      createGain: () => ({ gain: { value: 1 }, connected: [] as any[], connect(n: any) { this.connected.push(n); }, disconnect() {} }),
      createMediaStreamDestination: () => ({ stream: { id: "saida-da-voz" } }),
      createBuffer: (_c: number, n: number) => ({ duration: n / 24000, getChannelData: () => new Float32Array(n) }),
      createBufferSource: () => {
        const s: any = { buffer: null, connected: null, started: false, stopped: false, onended: null, connect(n: any) { this.connected = n; }, start() { this.started = true; }, stop() { this.stopped = true; } };
        sources.push(s);
        return s;
      },
      decodeAudioData: vi.fn(async () => ({ duration: 1.2 })),
    };
    return { ctx, sources };
  };

  it("AudioPlayer toca o mp3 pelo caminho que a esfera mede e para na hora", async () => {
    vi.useRealTimers();
    const { ctx, sources } = fakeCtx();
    const idle = vi.fn();
    const p = new AudioPlayer(ctx, 0.8, idle);
    expect(p.stream).toEqual({ id: "saida-da-voz" });
    const played = p.playEncoded(new ArrayBuffer(8));
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(sources[0].started).toBe(true);
    expect(p.playing).toBe(true);
    const gain = sources[0].connected;
    expect(gain.connected).toEqual([ctx.destination, { stream: { id: "saida-da-voz" } }]);
    expect(gain.gain.value).toBe(0.8);
    sources[0].onended();
    await expect(played).resolves.toBe(true);
    expect(idle).toHaveBeenCalled();
    // parar na hora: a promessa resolve com false e a fonte para
    const second = p.playEncoded(new ArrayBuffer(8));
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    p.stop();
    expect(sources[1].stopped).toBe(true);
    await expect(second).resolves.toBe(false);
    expect(p.playing).toBe(false);
    p.setVolume(0.2);
    expect(gain.gain.value).toBe(0.2);
    // o PCM do Gemini continua tocando pelo mesmo tocador
    expect(base64ToFloat32(btoa(String.fromCharCode(0, 64)))[0]).toBeCloseTo(0.5, 2);
    p.play(btoa(String.fromCharCode(0, 64, 0, 64)));
    expect(sources).toHaveLength(3);
  });
});

describe("Cor da esfera pela emoção", () => {
  it("calma azul, firme roxo, irritada magenta, com raiva vermelho (mais forte com a intensidade); alívio volta ao azul/verde-água", () => {
    expect(orbEmotion({ emotion: "firm", intensity: 30 })).toEqual({ emotion: "firm", intensity: 0.3 });
    expect(orbEmotion({ emotion: "irritated", intensity: 70 })).toEqual({ emotion: "annoyed", intensity: 0.7 });
    expect(orbEmotion({ emotion: "angry", intensity: 90 })).toEqual({ emotion: "angry", intensity: 0.9 });
    expect(orbEmotion({ emotion: "relieved", intensity: 40 })).toEqual({ emotion: "relieved", intensity: 0.4 });
    expect(ORB_EMOTION.neutral).toBe("neutral");
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/tutor/voice/voiceMode.css"), "utf8");
    const rule = (sel: string) => {
      const i = css.indexOf(sel);
      expect(i, sel).toBeGreaterThanOrEqual(0);
      return css.slice(i, css.indexOf("}", i));
    };
    expect(rule(".svm-orb.emo-firm .svm-orb__glow")).toMatch(/rgba\(1[3-9]\d, \d{2,3}, 2[0-5]\d/); // roxo
    expect(rule(".svm-orb.emo-annoyed .svm-orb__glow")).toMatch(/rgba\(2[0-5]\d, \d{2}, 1[2-9]\d/); // magenta
    expect(rule(".svm-orb.emo-angry .svm-orb__glow")).toMatch(/rgba\(255, \d{2}, \d{2}/); // vermelho
    expect(rule(".svm-orb.emo-angry .svm-orb__core::after")).toMatch(/var\(--emotion-intensity\)/); // proporcional à intensidade
    expect(rule(".svm-orb.emo-relieved .svm-orb__glow")).toMatch(/rgba\(94, 234, 212/); // verde-água, como a comemoração
    expect(css).not.toMatch(/não para vermelho/);
  });
});
