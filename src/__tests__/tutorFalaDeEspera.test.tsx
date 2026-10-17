/**
 * Frase de espera FALADA na voz ao vivo (17/10/2026): as 32 gravações aprovadas (Stazi já afinado +3, Stazia sem afinar) tocam pelo
 * MESMO tocador da voz, sem afinar de novo, quando a busca passa de ~600 ms; nunca por cima do professor nem do aluno; a resposta, a
 * fala do aluno ou a interrupção cortam na hora; rodízio sem repetir; o texto da frase aparece sempre na tela.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { FRASES_ESPERA, VINHETAS, type PersonaEspera } from "../../server/tutor/conhecimento/frasesEspera";
import { AudioPlayer, nivelDoFluxo } from "../novo/app/tutor/voice/audioPlayer.js";
import { carregarVinheta, FalaDeEspera, limparVinhetas, OuvidoDoAluno } from "../novo/app/tutor/voice/falaDeEspera.js";

const PERSONAS: PersonaEspera[] = ["durao", "acolhedor", "durona", "tranquila"];
const PUBLICO = path.resolve(__dirname, "../../public");
const MANIFESTO = JSON.parse(fs.readFileSync(path.join(PUBLICO, "novo-assets/tutor/espera/manifesto.json"), "utf8"));

describe("as 32 gravações", () => {
  it("uma por frase aprovada, mesmo texto do manifesto, arquivo leve e com a versão certa no endereço", () => {
    for (const p of PERSONAS) {
      const urls = VINHETAS[p]!;
      expect(urls, p).toHaveLength(FRASES_ESPERA[p].length);
      const m = MANIFESTO.personas[p];
      expect(m.frases.map((f: any) => f.texto), p).toEqual([...FRASES_ESPERA[p]]); // texto mudou? grave de novo
      urls.forEach((u, i) => {
        const [arquivo, versao] = u.split("?v=");
        expect(arquivo).toBe(m.frases[i].url);
        const bytes = fs.readFileSync(path.join(PUBLICO, arquivo));
        expect(bytes.length, arquivo).toBeLessThan(40_000);
        expect(crypto.createHash("sha256").update(bytes).digest("hex").startsWith(versao), arquivo).toBe(true);
        expect(m.frases[i].segundos, arquivo).toBeLessThan(5);
        expect(m.frases[i].pico_db, arquivo).toBeLessThanOrEqual(0.2);
      });
    }
    // Stazi: Zubenelgenubi já afinado +3 (o app não afina de novo); Stazia: Kore sem afinar
    expect(MANIFESTO.personas.durao).toMatchObject({ personagem: "Stazi", voz: "Zubenelgenubi", semitons_aplicados: 3 });
    expect(MANIFESTO.personas.acolhedor).toMatchObject({ personagem: "Stazi", voz: "Zubenelgenubi", semitons_aplicados: 3 });
    expect(MANIFESTO.personas.durona).toMatchObject({ personagem: "Stazia", voz: "Kore", semitons_aplicados: 0 });
    expect(MANIFESTO.personas.tranquila).toMatchObject({ personagem: "Stazia", voz: "Kore", semitons_aplicados: 0 });
  });
});

// ---- tocador com contexto falso ----
class FakeNode {
  connect(n: unknown) {
    return n;
  }
  disconnect() {}
}
class FakeCtx {
  state = "running";
  currentTime = 0;
  destination = new FakeNode();
  sources: any[] = [];
  decodificados: unknown[] = [];
  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } });
  }
  createMediaStreamDestination() {
    return Object.assign(new FakeNode(), { stream: { id: "voz" } });
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
  async decodeAudioData(ab: ArrayBuffer) {
    this.decodificados.push(ab);
    return gravacao(0.5);
  }
  resume() {
    return Promise.resolve();
  }
}
/** "Gravação" de `nivel` constante, 1 s a 24 kHz (como o mp3 decodificado). */
function gravacao(nivel: number) {
  const data = new Float32Array(24000).fill(nivel);
  return { duration: 1, sampleRate: 24000, getChannelData: () => data };
}
const pcmB64 = (n: number, v = 0.3) => {
  const b = new Uint8Array(n * 2);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < n; i++) dv.setInt16(i * 2, Math.round(v * 32767), true);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

describe("tocador: a gravação sai pelo mesmo caminho da voz, sem afinar de novo", () => {
  it("Stazi (+3 na voz ao vivo): a gravação vai inteira, sem afinador; a boca mexe; não conta como fala do professor; termina sozinha", async () => {
    const ctx = new FakeCtx();
    const onIdle = vi.fn();
    const p = new AudioPlayer(ctx, 1, onIdle, { semitons: 3 });
    const g = gravacao(0.5);
    const fim = p.tocarVinheta(g);
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer).toBe(g); // o próprio áudio gravado, sem passar pelo afinador
    expect(p.afinador).toBeNull();
    expect(p.semitons).toBe(3); // a voz ao vivo continua afinada; só a gravação não
    expect(p.playing).toBe(false);
    expect(p.vinhetaTocando).toBe(true);
    // a boca lê o nível do que sai (mesmo MediaStream da voz)
    expect(p.nivelEm(0.5)).toBeGreaterThan(0.5);
    expect(nivelDoFluxo(p.stream)).toBeTypeOf("function");
    ctx.sources[0].onended();
    await expect(fim).resolves.toBe(true);
    expect(onIdle).not.toHaveBeenCalled();
    expect(p.vinhetaTocando).toBe(false);
  });

  it("mp3 (ArrayBuffer) é decodificado e tocado sem afinar; a fala ao vivo que chega corta na hora e só ela segue (afinada)", async () => {
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx, 1, null, { semitons: 3 });
    const fim = p.tocarVinheta(new ArrayBuffer(8));
    await vi.waitFor(() => expect(ctx.sources).toHaveLength(1));
    expect(ctx.decodificados).toHaveLength(1);
    const vinheta = ctx.sources[0];
    p.play(pcmB64(2400)); // a resposta chegou
    expect(vinheta.stopped).toBe(true);
    await expect(fim).resolves.toBe(false);
    expect(p.vinhetaTocando).toBe(false);
    expect(p.afinador).not.toBeNull(); // a voz ao vivo continua passando pelo afinador
    expect(p.nivelEm(0.5)).toBeLessThan(0.5); // a trilha da gravação cortada saiu (boca não segue a frase cortada)
  });

  it("interrupção (stop) corta; com o professor falando, a gravação não toca por cima", async () => {
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx, 1, null, { semitons: 0 });
    const fim = p.tocarVinheta(gravacao(0.4));
    await vi.waitFor(() => expect(ctx.sources).toHaveLength(1));
    p.stop();
    expect(ctx.sources[0].stopped).toBe(true);
    await expect(fim).resolves.toBe(false);
    p.play(pcmB64(24000)); // professor falando
    expect(p.playing).toBe(true);
    await expect(p.tocarVinheta(gravacao(0.4))).resolves.toBe(false);
    expect(ctx.sources).toHaveLength(2); // só a fala do professor foi agendada
  });

  it("cortada enquanto decodificava: não toca", async () => {
    const ctx = new FakeCtx();
    const p = new AudioPlayer(ctx, 1, null);
    const fim = p.tocarVinheta(new ArrayBuffer(8));
    p.pararVinheta();
    await expect(fim).resolves.toBe(false);
    expect(ctx.sources).toHaveLength(0);
  });
});

describe("FalaDeEspera: tocar, não tocar, parar", () => {
  const controle = () => {
    let terminar: (ok: boolean) => void = () => {};
    return {
      tocadas: [] as unknown[],
      paradas: 0,
      tocarVinheta: vi.fn(function (this: any, a: unknown) {
        this.tocadas.push(a);
        return new Promise<boolean>((ok) => (terminar = ok));
      }),
      pararVinheta: vi.fn(function (this: any) {
        this.paradas++;
        terminar(false);
      }),
      acabar: () => terminar(true),
    };
  };

  it("toca quando ninguém está falando e avisa começo e fim", async () => {
    const gem = controle();
    const aoComecar = vi.fn();
    const aoTerminar = vi.fn();
    const f = new FalaDeEspera({ controle: () => gem, podeFalar: () => true, aoComecar, aoTerminar, carregar: async (u: string) => `audio:${u}` });
    const fim = f.tocar("/a.mp3");
    await vi.waitFor(() => expect(gem.tocadas).toEqual(["audio:/a.mp3"]));
    expect(aoComecar).toHaveBeenCalledTimes(1);
    expect(f.ativa).toBe(true);
    gem.acabar();
    await expect(fim).resolves.toBe(true);
    expect(aoTerminar).toHaveBeenCalledWith(true);
    expect(f.ativa).toBe(false);
  });

  it("não toca se alguém está falando (antes ou depois de baixar), sem gravação ou sem a voz aberta", async () => {
    const gem = controle();
    let pode = false;
    const f = new FalaDeEspera({ controle: () => gem, podeFalar: () => pode, carregar: async () => "audio" });
    await expect(f.tocar("/a.mp3")).resolves.toBe(false);
    // começou a baixar com todos calados, mas o aluno falou enquanto baixava
    pode = true;
    let soltar: (v: string) => void = () => {};
    const f2 = new FalaDeEspera({ controle: () => gem, podeFalar: () => pode, carregar: () => new Promise((ok) => (soltar = ok)) });
    const fim = f2.tocar("/b.mp3");
    pode = false;
    soltar("audio");
    await expect(fim).resolves.toBe(false);
    pode = true;
    await expect(f.tocar(null as any)).resolves.toBe(false);
    await expect(new FalaDeEspera({ controle: () => null, podeFalar: () => true }).tocar("/a.mp3")).resolves.toBe(false);
    await expect(new FalaDeEspera({ controle: () => gem, podeFalar: () => true, carregar: async () => { throw new Error("rede"); } }).tocar("/a.mp3")).resolves.toBe(false);
    expect(gem.tocadas).toEqual([]);
  });

  it("parar corta na hora e avisa o fim (ou não, se pedido)", async () => {
    const gem = controle();
    const aoTerminar = vi.fn();
    const f = new FalaDeEspera({ controle: () => gem, podeFalar: () => true, aoTerminar, carregar: async () => "audio" });
    const fim = f.tocar("/a.mp3");
    await vi.waitFor(() => expect(f.ativa).toBe(true));
    expect(f.parar()).toBe(true);
    expect(gem.pararVinheta).toHaveBeenCalled();
    expect(aoTerminar).toHaveBeenCalledWith(false);
    await expect(fim).resolves.toBe(false);
    expect(aoTerminar).toHaveBeenCalledTimes(1);
    const fim2 = f.tocar("/b.mp3");
    await vi.waitFor(() => expect(f.ativa).toBe(true));
    expect(f.parar(false)).toBe(true);
    await fim2;
    expect(aoTerminar).toHaveBeenCalledTimes(1);
    expect(f.parar()).toBe(false); // nada tocando
  });

  it("carregarVinheta baixa uma vez por endereço; erro não fica guardado", async () => {
    limparVinhetas();
    const buscar = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    await carregarVinheta("/x.mp3", buscar as any);
    await carregarVinheta("/x.mp3", buscar as any);
    expect(buscar).toHaveBeenCalledTimes(1);
    const falha = vi.fn(async () => ({ ok: false, status: 404 }));
    await expect(carregarVinheta("/y.mp3", falha as any)).rejects.toThrow("404");
    await expect(carregarVinheta("/y.mp3", buscar as any)).resolves.toBeInstanceOf(ArrayBuffer);
    limparVinhetas();
  });
});

describe("OuvidoDoAluno: o microfone ouviu o aluno (sem esperar a transcrição)", () => {
  it("silêncio e um estalo não contam; 2 blocos de voz seguidos = começou (avisa uma vez); 'falando' por ~0,7 s", () => {
    let t = 0;
    const o = new OuvidoDoAluno(() => t);
    const voz = new Float32Array(1600).fill(0.1);
    const silencio = new Float32Array(1600).fill(0.002);
    expect(o.ouvir(silencio)).toBe(false);
    expect(o.ouvir(voz)).toBe(false);
    expect(o.ouvir(silencio)).toBe(false);
    expect(o.falando).toBe(false);
    expect(o.ouvir(voz)).toBe(false);
    expect(o.ouvir(voz)).toBe(true);
    expect(o.ouvir(voz)).toBe(false); // continua falando: não avisa de novo
    expect(o.falando).toBe(true);
    t += 600;
    expect(o.falando).toBe(true);
    t += 200;
    expect(o.falando).toBe(false);
  });
});

// ---- na conversa por voz (useRealtimeVoice com a ponte simulada) ----
const ponte: any = { aberta: null as any };
vi.mock("../novo/app/tutor/voice/geminiPonte.js", () => ({
  openGeminiPonte: async (args: any) => {
    const gem: any = {
      handlers: args.handlers,
      outputStream: { id: "voz" },
      speaking: false,
      alunoFalando: false,
      tocadas: [] as string[],
      parou: 0,
      terminar: null as null | ((ok: boolean) => void),
      sendText() {},
      respondTools() {},
      mute() {},
      interrupt() {
        gem.terminar?.(false);
      },
      setVolume() {},
      close() {},
      tocarVinheta: vi.fn((audio: string) => {
        gem.tocadas.push(audio);
        return new Promise<boolean>((ok) => (gem.terminar = ok));
      }),
      pararVinheta: vi.fn(() => {
        gem.parou++;
        gem.terminar?.(false);
        gem.terminar = null;
      }),
    };
    ponte.aberta = gem;
    return gem;
  },
}));
vi.mock("../novo/app/tutor/voice/geminiLive.js", () => ({ openGeminiLive: async () => { throw new Error("não usado"); } }));
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ unlockAudio: () => {}, getAudioContext: () => null }));
vi.mock("../novo/app/tutor/api.js", () => ({
  voiceApi: {
    start: async () => ({ provider: "gemini", voice_call_id: "vc-1", gemini_ponte: { url: "wss://ponte", bilhete: "b" }, persona_espera: "durao", entitlement: { voice: { remaining_s: 600 } } }),
    renew: async () => ({ stop: false, lease_seconds: 120 }),
    end: async () => ({}),
    transcript: async () => ({}),
    tool: async () => ({ output: {} }),
    metrics: async () => ({}),
  },
}));

describe("na voz ao vivo", () => {
  beforeEach(() => {
    limparVinhetas();
    (window as any).RTCPeerConnection = class {};
    (navigator as any).mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getAudioTracks: () => [{ enabled: true, stop() {} }] }) };
    (globalThis as any).fetch = vi.fn(async (u: string) => ({ ok: true, arrayBuffer: async () => `mp3:${u}` }));
  });
  afterEach(() => {
    ponte.aberta = null;
  });

  const abrir = async (sessao = "s-" + Math.random()) => {
    const { useRealtimeVoice } = await import("../novo/app/tutor/useRealtimeVoice.js");
    const h = renderHook(() => useRealtimeVoice({ backend: {}, sessionId: sessao, hint: "gemini" }));
    await act(async () => {
      await h.result.current.start();
    });
    await waitFor(() => expect(ponte.aberta).not.toBeNull());
    const gem = ponte.aberta;
    act(() => gem.handlers.onReady());
    await waitFor(() => expect(h.result.current.state).toBe("listening"));
    return { h, gem };
  };

  it("a busca demorou: o texto aparece, a gravação da personalidade toca pelo tocador e o personagem fala; a resposta corta e apaga", async () => {
    const { h, gem } = await abrir();
    // as 8 gravações do Durão foram baixadas antes de precisar
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalledTimes(8));
    act(() => gem.handlers.onWaiting());
    const frase = h.result.current.conferindo;
    expect(FRASES_ESPERA.durao).toContain(frase);
    await waitFor(() => expect(gem.tocadas).toHaveLength(1));
    const i = FRASES_ESPERA.durao.indexOf(frase);
    expect(gem.tocadas[0]).toBe(`mp3:${VINHETAS.durao![i]}`); // a gravação DESTA frase
    await waitFor(() => expect(h.result.current.state).toBe("speaking")); // boca mexe
    // a busca terminou (fontes): o texto fica enquanto a gravação toca
    act(() => gem.handlers.onWaitingEnd());
    expect(h.result.current.conferindo).toBe(frase);
    // a resposta do professor chegou
    act(() => gem.handlers.onAudio());
    expect(gem.pararVinheta).toHaveBeenCalled();
    expect(h.result.current.conferindo).toBeNull();
    expect(h.result.current.state).toBe("speaking");
  });

  it("a gravação acaba sozinha: o personagem volta a ouvir e o texto some se a busca já terminou", async () => {
    const { h, gem } = await abrir();
    act(() => gem.handlers.onWaiting());
    await waitFor(() => expect(h.result.current.state).toBe("speaking"));
    act(() => gem.handlers.onWaitingEnd());
    await act(async () => {
      gem.terminar(true);
    });
    expect(h.result.current.state).toBe("listening");
    expect(h.result.current.conferindo).toBeNull();
  });

  it("o aluno começa a falar: a gravação para na hora", async () => {
    const { h, gem } = await abrir();
    act(() => gem.handlers.onWaiting());
    await waitFor(() => expect(h.result.current.state).toBe("speaking"));
    act(() => gem.handlers.onVozDoAluno());
    expect(gem.pararVinheta).toHaveBeenCalled();
    expect(h.result.current.state).toBe("listening");
  });

  it("professor ou aluno falando: não toca, mas o texto aparece", async () => {
    const { h, gem } = await abrir();
    gem.speaking = true;
    act(() => gem.handlers.onWaiting());
    expect(h.result.current.conferindo).toBeTruthy();
    gem.speaking = false;
    gem.alunoFalando = true;
    act(() => gem.handlers.onWaiting());
    expect(h.result.current.conferindo).toBeTruthy();
    await new Promise((ok) => setTimeout(ok, 20));
    expect(gem.tocadas).toEqual([]);
    expect(h.result.current.state).toBe("listening");
  });

  it("rodízio: 8 buscas lentas seguidas tocam as 8 gravações, sem repetir", async () => {
    const { h, gem } = await abrir();
    for (let k = 0; k < 8; k++) {
      act(() => gem.handlers.onWaiting());
      await waitFor(() => expect(gem.tocadas).toHaveLength(k + 1));
      await act(async () => {
        gem.terminar(true);
      });
      act(() => gem.handlers.onWaitingEnd());
    }
    expect(new Set(gem.tocadas).size).toBe(8);
    expect(new Set(gem.tocadas)).toEqual(new Set(VINHETAS.durao!.map((u) => `mp3:${u}`)));
    expect(h.result.current.conferindo).toBeNull();
  });
});
