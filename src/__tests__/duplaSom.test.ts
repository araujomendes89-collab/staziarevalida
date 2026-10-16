/**
 * Treinamento em Dupla · etapa 4 · tarefa 13: sons (apito, "Deu match!" e pular). O AudioContext é simulado; confere os números do
 * protótipo (App.jsx:1-32 e Match.jsx:30-88): apito de 1.400 Hz por 2 s com vibração de 800 ms, e o respeito à chave "sz-sound".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeAudio, type FakeCall as Call } from "./helpers/fakeAudio";

let audio: ReturnType<typeof makeFakeAudio>;
let vibrate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  audio = makeFakeAudio();
  (window as any).AudioContext = audio.Ctor;
  delete (window as any).webkitAudioContext;
  delete (window as any).__szAudio;
  delete (window as any).__szNoise;
  vibrate = vi.fn();
  Object.defineProperty(navigator, "vibrate", { configurable: true, writable: true, value: vibrate });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function load() {
  return import("../novo/app/dupla/sound.js");
}

describe("sound.js", () => {
  it("soundOn/setSoundOn usam a chave sz-sound: só 'off' desliga", async () => {
    const s = await load();
    expect(s.soundOn()).toBe(true);
    s.setSoundOn(false);
    expect(localStorage.getItem("sz-sound")).toBe("off");
    expect(s.soundOn()).toBe(false);
    s.setSoundOn(true);
    expect(localStorage.getItem("sz-sound")).toBe("on");
    expect(s.soundOn()).toBe(true);
    localStorage.setItem("sz-sound", "qualquer-coisa");
    expect(s.soundOn()).toBe(true);
  });

  it("playWhistle: 1.400 Hz por 2 s, com vibração de 800 ms", async () => {
    const s = await load();
    s.playWhistle();
    expect(audio.Ctor).toHaveBeenCalledTimes(1);
    const oscs = audio.of("osc");
    expect(oscs).toHaveLength(3);
    // tom principal: sobe a 1.400 Hz em 40 ms e dura 2 s (+ 50 ms de folga para o corte)
    const main = oscs[0];
    expect(main.frequency.calls.some((c: Call) => c.fn === "ramp" && c.args[0] === 1400)).toBe(true);
    const start = main.start.mock.calls[0][0];
    const stop = main.stop.mock.calls[0][0];
    expect(stop - start).toBeCloseTo(2.05, 5);
    // segundo tom 12% acima e harmônico no dobro
    expect(oscs[1].frequency.calls.some((c: Call) => c.fn === "ramp" && Math.abs(c.args[0] - 1400 * 1.12) < 1e-9)).toBe(true);
    expect(oscs[2].frequency.calls.some((c: Call) => c.fn === "ramp" && c.args[0] === 2800)).toBe(true);
    // sopro filtrado em 1.400 Hz
    expect(audio.of("filter").some((f: any) => f.type === "bandpass" && f.frequency.value === 1400)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(800);
  });

  it("playWhistle respeita sz-sound = off: nada é criado nem vibra", async () => {
    localStorage.setItem("sz-sound", "off");
    const s = await load();
    s.playWhistle();
    s.playSkipSound();
    s.playMatchSound();
    expect(audio.Ctor).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("playSkipSound: duas notas descendo (Mi para Dó grave) e vibração curta de 25 ms", async () => {
    const s = await load();
    s.playSkipSound();
    const oscs = audio.of("osc");
    expect(oscs.map((o: any) => o.frequency.calls.find((c: Call) => c.fn === "set")!.args[0])).toEqual([329.63, 196]);
    expect(oscs.every((o: any) => o.type === "triangle")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(25);
  });

  it("playMatchSound: fanfarra com acorde de Dó maior e vibração 300 ms depois", async () => {
    vi.useFakeTimers();
    const s = await load();
    s.playMatchSound();
    const freqs = audio
      .of("osc")
      .map((o: any) => o.frequency.value)
      .filter((f: number) => f > 0 && f !== 440);
    for (const f of [261.63, 392, 523.25, 659.25, 783.99, 1046.5, 2093, 2637, 3136, 4186]) expect(freqs).toContain(f);
    expect(vibrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(vibrate).toHaveBeenCalledWith([120, 60, 60, 40, 200]);
  });

  it("os sons reutilizam o mesmo contexto de áudio e o acordam se estiver suspenso", async () => {
    const s = await load();
    audio.ctx.state = "suspended";
    s.playSkipSound();
    s.playSkipSound();
    expect(audio.Ctor).toHaveBeenCalledTimes(1);
    expect(audio.ctx.resume).toHaveBeenCalled();
  });

  it("sem AudioContext no aparelho: não quebra", async () => {
    delete (window as any).AudioContext;
    const s = await load();
    expect(() => {
      s.playWhistle();
      s.playSkipSound();
      s.playMatchSound();
    }).not.toThrow();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("installAudioWake instala uma vez só (pointerdown, keydown e touchstart, com capture e passive) e acorda o contexto", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const s = await load();
    s.installAudioWake();
    s.installAudioWake();
    const wakes = add.mock.calls.filter((c) => ["pointerdown", "keydown", "touchstart"].includes(c[0] as string));
    expect(wakes.map((c) => c[0]).sort()).toEqual(["keydown", "pointerdown", "touchstart"]);
    for (const c of wakes) expect(c[2]).toEqual({ capture: true, passive: true });
    expect(audio.Ctor).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pointerdown"));
    expect(audio.Ctor).toHaveBeenCalledTimes(1);
    expect(audio.ctx.createBuffer).toHaveBeenCalled(); // ruído pré-gerado para o apito sair sem atraso
  });
});
