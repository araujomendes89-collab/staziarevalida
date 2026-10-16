import { vi } from "vitest";

// AudioContext de mentira para os testes de som do Treinamento em Dupla: guarda cada nó criado, não toca nada.
export type FakeCall = { fn: string; args: any[] };

/** Contexto de áudio de mentira: guarda cada nó criado e cada chamada de agenda, sem tocar nada. */
export function makeFakeAudio() {
  const nodes: { kind: string; node: any }[] = [];
  const param = (initial = 0) => {
    const p: any = { value: initial, calls: [] as FakeCall[] };
    p.setValueAtTime = vi.fn((...args: any[]) => p.calls.push({ fn: "set", args }));
    p.exponentialRampToValueAtTime = vi.fn((...args: any[]) => p.calls.push({ fn: "ramp", args }));
    return p;
  };
  const make = (kind: string, extra: Record<string, unknown> = {}) => {
    const node: any = {
      kind,
      connect: vi.fn((to: any) => to),
      start: vi.fn(),
      stop: vi.fn(),
      ...extra,
    };
    nodes.push({ kind, node });
    return node;
  };
  const ctx: any = {
    state: "running",
    sampleRate: 8000,
    currentTime: 0,
    destination: { kind: "destination" },
    resume: vi.fn(),
    createGain: vi.fn(() => make("gain", { gain: param(1) })),
    createOscillator: vi.fn(() => make("osc", { type: "sine", frequency: param(440), detune: param(0) })),
    createBiquadFilter: vi.fn(() => make("filter", { type: "lowpass", frequency: param(350), Q: param(1) })),
    createDynamicsCompressor: vi.fn(() =>
      make("comp", { threshold: param(-24), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    ),
    createDelay: vi.fn(() => make("delay", { delayTime: param(0) })),
    createBuffer: vi.fn((_ch: number, len: number) => ({ length: len, getChannelData: () => new Float32Array(len) })),
    createBufferSource: vi.fn(() => make("source", { buffer: null })),
  };
  const Ctor = vi.fn(function () {
    return ctx;
  });
  return { ctx, Ctor, nodes, of: (kind: string) => nodes.filter((n) => n.kind === kind).map((n) => n.node) };
}

