/**
 * Personagens do Tutor (Stazi / Stazia) no lugar da esfera: escolha da pose por estado e emoção, quadro como função pura do tempo
 * (boca pelo nível da voz, inclinação pelo microfone, piscada, movimento reduzido), sprites de todas as poses, texto para leitor de
 * tela em português, escolha guardada no aparelho e a escolha na entrada do Nexus.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { escolherPose, quadro, EMOCAO_POSE, piscada, REACAO_MS, CICLO_FALA_MS, efeitoDo, dinamicaPose, ruido, suavizar, PERMANENCIA_MS, ANTECIPA_MS } from "../novo/app/tutor/personagens/movimento.js";
import { POSES, PERSONAGEM_IDS, rotuloPersonagem, lerPersonagem, gravarPersonagem, personagemPadrao, CHAVE_PERSONAGEM } from "../novo/app/tutor/personagens/personagens.js";
import { spritePose, urlsDoPersonagem } from "../novo/app/tutor/personagens/sprites.js";
import { ORB_EMOTION } from "../novo/app/tutor/voice/StaziaVoiceOrb.jsx";

vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ getAudioContext: () => null, releaseAudioContext: async () => {}, unlockAudio: () => null }));

const ESTADOS = ["idle", "ready", "listening", "thinking", "speaking", "interrupted", "paused", "reconnecting", "ended", "error"];
const EMOCOES = ["neutral", "happy", "proud", "impressed", "curious", "skeptical", "firm", "annoyed", "angry", "relieved"];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("escolherPose", () => {
  it("cada estado tem uma pose coerente", () => {
    const p = (estado: string, extra: any = {}) => escolherPose({ estado, emocao: "neutral", intensidade: 0.3, tEstado: 5000, ...extra });
    expect(p("listening")).toBe("ouvindo");
    expect(p("thinking")).toBe("pensando");
    expect(p("speaking")).toBe("falando");
    expect(p("ready", { tEstado: 100 })).toBe("acenando");
    expect(p("ready")).toBe("base");
    expect(p("interrupted", { tEstado: 200 })).toBe("surpresa");
    expect(p("interrupted")).toBe("ouvindo");
    expect(p("reconnecting")).toBe("pensando");
    expect(p("ended")).toBe("acenando");
    expect(p("error")).toBe("encorajando");
    expect(p("idle")).toBe("base");
    expect(p("paused")).toBe("base");
  });

  it("toda emoção que o servidor manda vira uma pose própria", () => {
    for (const e of new Set(Object.values(ORB_EMOTION))) expect(EMOCAO_POSE[e as string]).toBeTruthy();
    const poses = EMOCOES.filter((e) => e !== "neutral").map((e) => EMOCAO_POSE[e]);
    expect(new Set(poses).size).toBe(poses.length);
  });

  it("emoção nova aparece como reação e depois volta à pose do estado", () => {
    const base = { estado: "listening", emocao: "angry", intensidade: 0.9, tEstado: 5000 };
    expect(escolherPose({ ...base, tEmocao: 200 })).toBe("bravo");
    expect(escolherPose({ ...base, tEmocao: REACAO_MS + 10 })).toBe("ouvindo");
  });

  it("falando: alterna a boca que mexe e a pose da emoção; a firmeza usa a fala séria", () => {
    const fala = (emocao: string, tEstado: number, intensidade = 0.8) => escolherPose({ estado: "speaking", emocao, intensidade, tEstado, tEmocao: 1e9 });
    expect(fala("happy", 500)).toBe("falando");
    expect(fala("happy", 4500)).toBe("feliz");
    expect(fala("happy", CICLO_FALA_MS + 500)).toBe("falando");
    expect(fala("angry", 500)).toBe("falandoFirme");
    expect(fala("angry", 3200)).toBe("bravo");
    expect(fala("firm", 500)).toBe("falandoFirme");
    expect(fala("happy", 4500, 0.2)).toBe("falando"); // emoção fraca: só a fala
  });

  it("movimento reduzido: pose estática da emoção", () => {
    for (const e of EMOCOES.filter((x) => x !== "neutral")) {
      expect(escolherPose({ estado: "speaking", emocao: e, intensidade: 0.6, reduzido: true })).toBe(EMOCAO_POSE[e]);
    }
    expect(escolherPose({ estado: "listening", emocao: "neutral", reduzido: true })).toBe("ouvindo");
    expect(escolherPose({ estado: "error", emocao: "angry", reduzido: true })).toBe("encorajando");
  });
});

describe("quadro (função pura do tempo)", () => {
  const base = { t: 1234, tEstado: 3000, tPose: 3000, estado: "speaking", emocao: "neutral", intensidade: 0.5, entrada: 0, saida: 0, pose: "falando" };

  it("é determinístico", () => {
    expect(quadro({ ...base, saida: 0.6 })).toEqual(quadro({ ...base, saida: 0.6 }));
  });

  it("a boca acompanha a voz só na pose de falar", () => {
    expect(quadro({ ...base, saida: 0 }).boca).toBe(0);
    expect(quadro({ ...base, saida: 0.8 }).boca).toBe(1);
    expect(quadro({ ...base, saida: 0.8, pose: "feliz" }).boca).toBe(0);
    expect(quadro({ ...base, estado: "listening", saida: 0.8, pose: "falando" }).boca).toBe(0);
  });

  it("ao ouvir, inclina mais quanto mais alto o microfone", () => {
    const calado = quadro({ ...base, estado: "listening", pose: "ouvindo", entrada: 0 });
    const alto = quadro({ ...base, estado: "listening", pose: "ouvindo", entrada: 1 });
    expect(Math.abs(alto.rot)).toBeGreaterThan(Math.abs(calado.rot) + 3);
  });

  it("raiva é contida e tensa ao falar: sem tremor, mexe menos que a alegria", () => {
    const passo = (emocao: string) => Math.max(...Array.from({ length: 120 }, (_, i) => Math.abs(quadro({ ...base, t: 1000 + i * 16, emocao, intensidade: 0.9, saida: 0.7, pose: "falandoFirme" }).x - quadro({ ...base, t: 1000 + (i + 1) * 16, emocao, intensidade: 0.9, saida: 0.7, pose: "falandoFirme" }).x)));
    expect(passo("angry")).toBeLessThan(0.5); // nenhum tremor de alta frequência
    const balanco = (emocao: string) => Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(quadro({ ...base, t: i * 200, emocao, intensidade: 0.9, estado: "idle", pose: "base" }).rot)));
    expect(balanco("angry")).toBeLessThan(balanco("happy"));
  });

  it("a intensidade da emoção controla a amplitude, não só a pose", () => {
    const amplitude = (intensidade: number) => Math.max(...Array.from({ length: 80 }, (_, i) => Math.abs(quadro({ ...base, t: i * 90, estado: "listening", pose: "ouvindo", intensidade, entrada: 1 }).rot)));
    expect(amplitude(1)).toBeGreaterThan(amplitude(0.1) * 1.4);
  });

  it("troca de pose: tomada de impulso antes e mola (aperta e estica) depois, sem sair do lugar", () => {
    const antes = quadro({ ...base, estado: "listening", pose: "ouvindo", antecipa: 1, tPose: 1e9, intensidade: 0.8 });
    const calmo = quadro({ ...base, estado: "listening", pose: "ouvindo", antecipa: 0, tPose: 1e9, intensidade: 0.8 });
    expect(antes.sy).toBeLessThan(calmo.sy - 0.02);
    const sy = Array.from({ length: 60 }, (_, i) => quadro({ ...base, estado: "listening", pose: "ouvindo", tPose: i * 8, intensidade: 0.8 }).sy);
    expect(Math.min(...sy)).toBeLessThan(calmo.sy - 0.02); // aperta
    expect(Math.max(...sy)).toBeGreaterThan(calmo.sy + 0.005); // estica (overshoot)
    expect(quadro({ ...base, tPose: 0 }).troca).toBe(0);
    expect(quadro({ ...base, tPose: 400 }).troca).toBe(1);
  });

  it("piscada fecha rápido e abre (nunca mais de 3 vezes por segundo)", () => {
    const valores = Array.from({ length: 4200 }, (_, i) => piscada(i));
    expect(Math.max(...valores)).toBe(1);
    expect(valores.filter((v) => v > 0.5).length).toBeLessThan(200);
    let fechamentos = 0;
    for (let i = 1; i < 1000; i++) if (piscada(i) > 0.5 && piscada(i - 1) <= 0.5) fechamentos++;
    expect(fechamentos).toBeLessThanOrEqual(3);
  });

  it("pausa fecha os olhos; movimento reduzido não mexe", () => {
    expect(quadro({ ...base, estado: "paused", pose: "base" }).olhos).toBe(1);
    const r = quadro({ ...base, saida: 0.9, emocao: "angry", reduzido: true });
    expect([r.x, r.y, r.rot, r.sx, r.sy, r.boca]).toEqual([0, 0, 0, 1, 1, 0]);
  });

  it("efeitos por estado e emoção", () => {
    expect(efeitoDo("thinking", "neutral", 0.3)).toBe("pensando");
    expect(efeitoDo("listening", "neutral", 0.3)).toBe("ondas");
    expect(efeitoDo("speaking", "angry", 0.8)).toBe("raiva");
    expect(efeitoDo("speaking", "happy", 0.8)).toBe("brilho");
    expect(efeitoDo("error", "angry", 0.9)).toBeNull();
  });
});

describe("dinamicaPose e ruído", () => {
  const desde = { estado: 0, emocao: -1e9, estadoAnterior: "listening" };
  it("a pose nova entra depois da tomada de impulso e há aviso antes", () => {
    const antes = dinamicaPose({ t: ANTECIPA_MS / 2, estado: "speaking", emocao: "neutral", desde });
    expect(antes.pose).toBe("ouvindo");
    expect(antes.antecipa).toBeGreaterThan(0);
    expect(antes.proxima).toBe("falando");
    const depois = dinamicaPose({ t: ANTECIPA_MS + 100, estado: "speaking", emocao: "neutral", desde });
    expect(depois).toMatchObject({ pose: "falando", anterior: "ouvindo" });
  });
  it("poucas trocas por segundo: nenhuma pose dura menos que a permanência mínima", () => {
    const d = { estado: 0, emocao: 600, estadoAnterior: "listening", emocaoAnterior: "neutral" };
    const trocas: number[] = [];
    let ult = "";
    for (let t = 0; t < 9000; t += 8) {
      const r = dinamicaPose({ t, estado: "speaking", emocao: "angry", intensidade: 0.9, desde: d });
      if (r.pose !== ult) { trocas.push(t); ult = r.pose; }
    }
    for (let i = 1; i < trocas.length - 1; i++) expect(trocas[i + 1] - trocas[i]).toBeGreaterThanOrEqual(PERMANENCIA_MS - 20);
    expect(trocas.length).toBeLessThan(12);
  });
  it("é reproduzível em qualquer ordem de quadros", () => {
    const a = dinamicaPose({ t: 3300, estado: "speaking", emocao: "angry", intensidade: 0.9, desde: { estado: 0, emocao: 600 } });
    dinamicaPose({ t: 100, estado: "speaking", emocao: "angry", intensidade: 0.9, desde: { estado: 0, emocao: 600 } });
    expect(dinamicaPose({ t: 3300, estado: "speaking", emocao: "angry", intensidade: 0.9, desde: { estado: 0, emocao: 600 } })).toEqual(a);
  });
  it("ruído com semente: igual para a mesma semente, diferente entre sementes, nunca periódico curto", () => {
    expect(ruido(1234, 3)).toBe(ruido(1234, 3));
    expect(ruido(1234, 3)).not.toBe(ruido(1234, 4));
    const v = Array.from({ length: 400 }, (_, i) => ruido(i * 100, 1));
    expect(Math.max(...v)).toBeLessThanOrEqual(1);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(-1);
    expect(new Set(v.map((x) => x.toFixed(3))).size).toBeGreaterThan(300);
  });
  it("suavizar não deixa a boca tremer: um pico isolado vira pouco", () => {
    expect(suavizar([1, 0, 0, 0])).toBeLessThan(0.5);
    expect(suavizar([0.6, 0.6, 0.6, 0.6])).toBeCloseTo(0.6, 5);
  });
  it("as piscadas não têm intervalo fixo", () => {
    const inicios: number[] = [];
    for (let t = 1; t < 40000; t++) if (piscada(t) > 0.5 && piscada(t - 1) <= 0.5) inicios.push(t);
    const dif = inicios.slice(1).map((x, i) => x - inicios[i]).filter((d) => d > 600);
    expect(new Set(dif.map((d) => Math.round(d / 100))).size).toBeGreaterThan(3);
  });
});

describe("sprites e textos", () => {
  it("todas as poses dos dois personagens têm imagem, âncora e, onde a boca mexe, a sobreposição da boca", () => {
    for (const id of PERSONAGEM_IDS) {
      for (const chave of Object.keys(POSES[id as "stazi"])) {
        const s = spritePose(id, chave);
        expect(s?.url, `${id}/${chave}`).toBeTruthy();
        expect(s!.ay).toBeGreaterThan(s!.h * 0.9);
      }
      expect(spritePose(id, "falando")?.boca?.url, `${id} boca`).toBeTruthy();
      expect(spritePose(id, "falandoFirme")?.boca?.url, `${id} boca firme`).toBeTruthy();
      expect(spritePose(id, "base")?.olhos?.url, `${id} piscada`).toBeTruthy();
      expect(urlsDoPersonagem(id).length).toBeGreaterThan(15);
    }
  });

  it("texto para leitor de tela em português, com o gênero de cada personagem", () => {
    expect(rotuloPersonagem("stazia", "listening")).toBe("Stazia, sua professora, ouvindo");
    expect(rotuloPersonagem("stazi", "speaking", "angry")).toBe("Stazi, seu professor, falando, bravo");
    expect(rotuloPersonagem("stazia", "ready")).toBe("Stazia, sua professora, pronta para conversar");
    for (const e of ESTADOS) expect(rotuloPersonagem("stazi", e)).toMatch(/^Stazi, seu professor, /);
  });

  it("escolha guardada no aparelho; sem escolha, acompanha o professor", () => {
    expect(personagemPadrao("durona")).toBe("stazia");
    expect(lerPersonagem("acolhedor")).toBe("stazi");
    gravarPersonagem("stazia");
    expect(window.localStorage.getItem(CHAVE_PERSONAGEM)).toBe("stazia");
    expect(lerPersonagem("acolhedor")).toBe("stazia");
    gravarPersonagem("outro");
    expect(lerPersonagem()).toBe("stazia");
  });
});

describe("componentes", () => {
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any;
  });

  it("2D: mesma interface da esfera, com nome e estado para o leitor de tela", async () => {
    const { PersonagemTutor2D } = await import("../novo/app/tutor/personagens/PersonagemTutor2D.jsx");
    render(<PersonagemTutor2D personagem="stazia" conversationState="listening" emotion="neutral" emotionIntensity={0.3} time={0} />);
    const el = screen.getByRole("img", { name: "Stazia, sua professora, ouvindo" });
    expect(el).toHaveAttribute("data-pose", "ouvindo");
    expect(el.querySelector(".tp__img")).toHaveAttribute("src");
  });

  it("2D com movimento reduzido fica na pose da emoção", async () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as any;
    const { PersonagemTutor2D } = await import("../novo/app/tutor/personagens/PersonagemTutor2D.jsx");
    render(<PersonagemTutor2D personagem="stazi" conversationState="speaking" emotion="angry" emotionIntensity={0.9} />);
    const el = screen.getByRole("img");
    expect(el).toHaveAttribute("data-pose", "bravo");
    expect(el).toHaveClass("is-reduced");
  });

  it("escolha do personagem: botões com estado e guarda a escolha", async () => {
    const { EscolhaPersonagem } = await import("../novo/app/tutor/personagens/EscolhaPersonagem.jsx");
    const onEscolher = vi.fn();
    render(<EscolhaPersonagem valor="stazi" onEscolher={onEscolher} />);
    expect(screen.getByRole("button", { name: /Stazi\b/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Stazia/ }));
    expect(onEscolher).toHaveBeenCalledWith("stazia");
  });

  it("entrada do Nexus: troca a esfera pelo personagem e guarda a escolha ao começar", async () => {
    const { NexusLobby } = await import("../novo/app/tutor/nexus/NexusLobby.jsx");
    const onStart = vi.fn();
    const status = { personalities: [{ id: "durao", name: "Durão", emoji: "🔥", tagline: "w", character: "stazi" }, { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "x", character: "stazi" }, { id: "durona", name: "Durona", emoji: "🔥", tagline: "y", character: "stazia" }, { id: "tranquila", name: "Tranquila", emoji: "😌", tagline: "z", character: "stazia" }], preferences: { personality_id: "durona" }, daily_limit: 40, used_today: 2, entitlement: { enabled: true, mode: "paid", is_paid: true, can_use: true, can_text: true, can_voice: true, text: { used: 2, limit: 40, remaining: 38 }, voice: { enabled: true, remaining_s: 600 }, questions: { limit: null, used: 0 }, trial: { state: "none", days: 7 } } };
    const { container } = render(<NexusLobby status={status} nexus={{}} onStart={onStart} onHistory={() => {}} onListen={() => {}} />);
    // sem escolha salva: abre no personagem do professor que o aluno já usava (a Durona é da Stazia)
    expect(screen.getByRole("button", { name: /Stazia/ })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".nx-lobby__orb [data-personagem='stazia']")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Stazi\b/ }));
    expect(container.querySelector(".nx-lobby__orb [data-personagem='stazi']")).toBeTruthy();
    // trocar de personagem leva a personalidade calma dele, não a Durona (que é da Stazia): o personagem manda
    expect(screen.queryByRole("button", { name: /^.{0,3}\s*Durona\b/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Começar com/ }));
    expect(onStart).toHaveBeenCalledWith("acolhedor", "livre");
    expect(window.localStorage.getItem(CHAVE_PERSONAGEM)).toBe("stazi");
  });

  it("tela de voz: o personagem da personalidade no lugar da esfera, fixo na conversa (a voz é dele), e cor de fundo pela emoção", async () => {
    const { StaziaVoiceMode } = await import("../novo/app/tutor/voice/StaziaVoiceMode.jsx");
    const rt: any = { state: "speaking", muted: false, streams: { input: null, output: null }, captions: { tutor: "Foco.", student: "" }, provider: "live", setVolume() {}, start() {}, sendText() {}, toggleMute() {}, interrupt() {} };
    window.localStorage.setItem(CHAVE_PERSONAGEM, "stazi"); // a escolha guardada não vence a personalidade da conversa
    render(<StaziaVoiceMode rt={rt} persona={{ id: "durona", name: "Durona", emoji: "🔥" }} avatar={{ emotion: "angry", intensity: 90 }} onClose={() => {}} />);
    expect(document.querySelector(".svm-orb")).toBeNull();
    const el = screen.getByRole("img", { name: /^Stazia, sua professora, falando/ });
    expect(el).toHaveAttribute("data-emotion", "angry");
    expect(document.querySelector(".svm")).toHaveAttribute("data-emo", "angry");
    expect(screen.queryByRole("button", { name: /Trocar para/ })).toBeNull();
    cleanup();
    render(<StaziaVoiceMode rt={rt} persona={{ id: "durao", name: "Durão", emoji: "🔥" }} onClose={() => {}} />);
    expect(screen.getByRole("img", { name: /^Stazi, seu professor, falando/ })).toBeTruthy();
    cleanup();
  });

  it("tela de voz: conversa antiga de professor aposentado ainda troca o desenho no meio da conversa", async () => {
    const { StaziaVoiceMode } = await import("../novo/app/tutor/voice/StaziaVoiceMode.jsx");
    const rt: any = { state: "speaking", muted: false, streams: { input: null, output: null }, captions: { tutor: "Foco.", student: "" }, provider: "live", setVolume() {}, start() {}, sendText() {}, toggleMute() {}, interrupt() {} };
    window.localStorage.setItem(CHAVE_PERSONAGEM, "stazia");
    render(<StaziaVoiceMode rt={rt} persona={{ id: "direto", name: "Direto", emoji: "🎯" }} avatar={{ emotion: "angry", intensity: 90 }} onClose={() => {}} />);
    expect(screen.getByRole("img", { name: /^Stazia, sua professora, falando/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trocar para o Stazi, seu professor" }));
    expect(screen.getByRole("img", { name: /^Stazi, seu professor, falando/ })).toBeTruthy();
    expect(window.localStorage.getItem(CHAVE_PERSONAGEM)).toBe("stazi");
    expect(rt.state).toBe("speaking"); // a ligação não foi tocada
  });

  it("tela de voz: se o personagem falhar, a esfera de sempre assume", async () => {
    vi.resetModules();
    vi.doMock("../novo/app/tutor/personagens/PersonagemTutor.jsx", () => ({ PersonagemTutor: () => { throw new Error("falhou ao carregar"); } }));
    const { StaziaVoiceMode } = await import("../novo/app/tutor/voice/StaziaVoiceMode.jsx");
    const rt: any = { state: "listening", muted: false, streams: { input: null, output: null }, captions: { tutor: "", student: "" }, provider: "live", setVolume() {}, start() {}, sendText() {}, toggleMute() {}, interrupt() {} };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<StaziaVoiceMode rt={rt} persona={{ id: "acolhedor", name: "Tranquilo", emoji: "😌" }} onClose={() => {}} />);
    erro.mockRestore();
    expect(document.querySelector(".svm-orb")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Trocar para/ })).toBeNull();
    vi.doUnmock("../novo/app/tutor/personagens/PersonagemTutor.jsx");
  });
});
