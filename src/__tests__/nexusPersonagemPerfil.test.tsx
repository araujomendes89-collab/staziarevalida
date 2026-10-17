/**
 * Personagem do Tutor no perfil (decisão do dono de 17/10/2026): a entrada do Nexus abre com o personagem do perfil, grava no
 * perfil ao tocar (sem travar a tela) e, se a gravação falhar, guarda no aparelho e tenta de novo na próxima vez.
 * Regra: perfil > aparelho > personagem da personalidade preferida > Stazi; o toque DESTA conta que o perfil ainda não confirmou é
 * o mais novo e vale até ser gravado. A cópia do aparelho (e a chave da versão antiga) nunca passa por cima do perfil, e o toque
 * de uma conta nunca vai para o perfil de outra que entrar no mesmo navegador.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CHAVE_PENDENTE, CHAVE_PERSONAGEM, personagemInicial, personagemPendente as pendenteDe, marcarNoPerfil as marcarNoPerfilDe, marcarPendente, gravarPersonagem } from "../novo/app/tutor/personagens/personagens.js";

vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ getAudioContext: () => null, releaseAudioContext: async () => {}, unlockAudio: () => null }));

const PERSONALITIES = [
  { id: "durao", name: "Durão", emoji: "🔥", tagline: "w", character: "stazi" },
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "x", character: "stazi" },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "y", character: "stazia" },
  { id: "tranquila", name: "Tranquila", emoji: "😌", tagline: "z", character: "stazia" },
];
const ENT = { enabled: true, mode: "paid", is_paid: true, can_use: true, can_text: true, can_voice: true, text: { used: 2, limit: 40, remaining: 38 }, voice: { enabled: true, remaining_s: 600 }, questions: { limit: null, used: 0 }, trial: { state: "none", days: 7 } };
const status = (preferences: any) => ({ personalities: PERSONALITIES, preferences, daily_limit: 40, used_today: 2, entitlement: ENT });

const pressed = (nome: RegExp) => screen.getByRole("button", { name: nome }).getAttribute("aria-pressed") === "true";
const STAZI = /^Stazi\b(?!a)/;
const STAZIA = /^Stazia\b/;
const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^.{0,3}\\s*${name}\\b`) });
const ANA = "11111111-1111-4111-8111-111111111111";
const BIA = "22222222-2222-4222-8222-222222222222";
const personagemPendente = (conta: string | null = ANA) => pendenteDe(conta);
const marcarNoPerfil = (id: string, conta: string | null = ANA) => marcarNoPerfilDe(conta, id);
// [cópia do aparelho, toque pendente da Ana]
const local = () => [window.localStorage.getItem(CHAVE_PERSONAGEM), window.localStorage.getItem(`${CHAVE_PENDENTE}:${ANA}`)];

async function lobby(st: any, onPersonagem: any = null, conta: string | null = ANA) {
  const { NexusLobby } = await import("../novo/app/tutor/nexus/NexusLobby.jsx");
  const onStart = vi.fn();
  const r = render(<NexusLobby status={st} nexus={{}} onStart={onStart} onHistory={() => {}} onListen={() => {}} onPersonagem={onPersonagem} conta={conta} />);
  return { ...r, onStart };
}

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any;
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("regra de prioridade (personagens.js)", () => {
  it("perfil > aparelho; o toque desta conta que o perfil não confirmou vale até ser gravado", () => {
    expect(personagemInicial(ANA, null)).toBeNull(); // nada escolhido: quem chama completa (personalidade preferida, Stazi)
    expect(personagemInicial(ANA, "stazia")).toBe("stazia");
    marcarNoPerfil("stazi"); // cópia confirmada pelo perfil
    expect(personagemPendente()).toBeNull();
    expect(personagemInicial(ANA, "stazia")).toBe("stazia"); // o perfil manda sobre a cópia do aparelho
    expect(personagemInicial(ANA, null)).toBe("stazi"); // sem perfil, vale o aparelho
    gravarPersonagem("stazia"); // a cópia do aparelho (tela de voz, botão Começar) nunca é pendente
    expect(personagemPendente()).toBeNull();
    expect(personagemInicial(ANA, "stazi")).toBe("stazi");
    marcarPendente(ANA, "stazia"); // tocou na entrada e a gravação ainda não voltou
    expect(personagemPendente()).toBe("stazia");
    expect(personagemInicial(ANA, "stazi")).toBe("stazia");
    expect(personagemInicial(ANA, "invalido")).toBe("stazia");
    // o toque da Ana não é pendente para a Bia, nem sem conta
    expect(personagemPendente(BIA)).toBeNull();
    expect(personagemPendente(null)).toBeNull();
    expect(personagemInicial(BIA, "stazi")).toBe("stazi");
    marcarPendente(null, "stazi"); // sem conta, nada fica pendente
    expect(window.localStorage.getItem(`${CHAVE_PENDENTE}:null`)).toBeNull();
    marcarNoPerfil("stazia"); // o perfil da Ana confirmou: deixa de ser pendente
    expect(personagemPendente()).toBeNull();
  });

  it("aparelho sem armazenamento (navegação privada) não quebra: vale o perfil", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    try {
      expect(personagemPendente()).toBeNull();
      expect(personagemInicial(ANA, "stazia")).toBe("stazia");
      expect(() => marcarNoPerfil("stazi")).not.toThrow();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

describe("entrada do Nexus com o personagem do perfil", () => {
  it("a escolha vem do perfil, mesmo com outra cópia no aparelho, e a cópia passa a ser a do perfil", async () => {
    marcarNoPerfil("stazi"); // este aparelho tinha o Stazi
    const onPersonagem = vi.fn(async () => ({}));
    await lobby(status({ personality_id: "tranquila", profanity: "off", chosen: true, character: "stazia" }), onPersonagem);
    expect(pressed(STAZIA)).toBe(true);
    expect(card("Tranquila")).toHaveAttribute("aria-pressed", "true");
    expect(local()).toEqual(["stazia", null]);
    expect(onPersonagem).not.toHaveBeenCalled(); // nada a gravar ao abrir
  });

  it("aparelho da versão anterior (só a chave antiga): vale o perfil, nada é enviado e a cópia passa a ser a do perfil", async () => {
    window.localStorage.setItem(CHAVE_PERSONAGEM, "stazi"); // gravado pelo botão Começar da versão anterior
    window.localStorage.setItem("smn-tutor-personagem-perfil", "stazi"); // chave de uma versão de teste, sem conta
    const onPersonagem = vi.fn(async () => ({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }));
    await lobby(status({ personality_id: "durona", profanity: "moderate", chosen: true, character: "stazia" }), onPersonagem);
    await act(async () => {});
    expect(pressed(STAZIA)).toBe(true);
    expect(card("Durona")).toHaveAttribute("aria-pressed", "true");
    expect(onPersonagem).not.toHaveBeenCalled();
    expect(local()).toEqual(["stazia", null]);
    expect(window.localStorage.getItem("smn-tutor-personagem-perfil")).toBeNull();
  });

  it("duas contas no mesmo navegador: o toque que não chegou ao perfil da Ana não vai para o perfil da Bia", async () => {
    const falha = vi.fn(async () => { throw new Error("sem rede"); });
    await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }), falha, ANA);
    fireEvent.click(screen.getByRole("button", { name: STAZIA }));
    await waitFor(() => expect(falha).toHaveBeenCalledWith("stazia"));
    await act(async () => {});
    expect(personagemPendente(ANA)).toBe("stazia");
    cleanup();
    // a Ana sai; a Bia, que usa o Durão, entra no mesmo navegador e abre o Tutor
    const daBia = vi.fn(async () => ({}));
    await lobby(status({ personality_id: "durao", profanity: "moderate", chosen: true, character: "stazi" }), daBia, BIA);
    await act(async () => {});
    expect(pressed(STAZI)).toBe(true);
    expect(card("Durão")).toHaveAttribute("aria-pressed", "true");
    expect(daBia).not.toHaveBeenCalled();
    expect(personagemPendente(ANA)).toBe("stazia"); // continua guardado para a Ana
    cleanup();
    // a Ana volta: o toque dela vale e vai para o perfil dela
    const daAna = vi.fn(async () => ({ personality_id: "tranquila", character: "stazia" }));
    await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }), daAna, ANA);
    expect(pressed(STAZIA)).toBe(true);
    await waitFor(() => expect(daAna).toHaveBeenCalledWith("stazia"));
    await waitFor(() => expect(personagemPendente(ANA)).toBeNull());
  });

  it("toque pendente que o perfil já tem (a conversa começou com ele): só deixa de ser pendente, sem enviar de novo", async () => {
    marcarPendente(ANA, "stazia");
    const onPersonagem = vi.fn(async () => ({}));
    await lobby(status({ personality_id: "tranquila", profanity: "off", chosen: true, character: "stazia" }), onPersonagem);
    await act(async () => {});
    expect(onPersonagem).not.toHaveBeenCalled();
    expect(local()).toEqual(["stazia", null]);
  });

  it("perfil sem personagem: aparelho; sem aparelho, o personagem da personalidade preferida", async () => {
    await lobby(status({ personality_id: "durona", profanity: "moderate", chosen: true, character: null }));
    expect(pressed(STAZIA)).toBe(true);
    cleanup();
    marcarNoPerfil("stazi");
    await lobby(status({ personality_id: "durona", profanity: "moderate", chosen: true, character: null }));
    expect(pressed(STAZI)).toBe(true);
    cleanup();
    window.localStorage.clear();
    await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: false, character: null }));
    expect(pressed(STAZI)).toBe(true);
  });

  it("tocar no personagem grava no perfil sem travar a tela; a personalidade que o perfil devolve fica marcada", async () => {
    let solta: (v: any) => void = () => {};
    const onPersonagem = vi.fn(() => new Promise((r) => (solta = r)));
    const { onStart } = await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }), onPersonagem);
    fireEvent.click(screen.getByRole("button", { name: STAZIA }));
    await waitFor(() => expect(onPersonagem).toHaveBeenCalledWith("stazia"));
    // a tela já mudou antes da resposta e o aluno pode começar
    expect(pressed(STAZIA)).toBe(true);
    expect(card("Tranquila")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Começar com/ })).toBeEnabled();
    expect(personagemPendente()).toBe("stazia");
    await act(async () => solta({ personality_id: "tranquila", profanity: "off", chosen: true, character: "stazia" }));
    expect(local()).toEqual(["stazia", null]);
    expect(personagemPendente()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Começar com/ }));
    expect(onStart).toHaveBeenCalledWith("tranquila", "livre");
  });

  it("vale o último toque, mesmo se a resposta do primeiro chegar depois", async () => {
    const pendentes: Array<(v: any) => void> = [];
    const onPersonagem = vi.fn(() => new Promise((r) => pendentes.push(r)));
    await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }), onPersonagem);
    fireEvent.click(screen.getByRole("button", { name: STAZIA }));
    fireEvent.click(screen.getByRole("button", { name: STAZI }));
    await waitFor(() => expect(onPersonagem).toHaveBeenCalledTimes(2));
    await act(async () => pendentes[1]({ personality_id: "acolhedor", character: "stazi" }));
    await act(async () => pendentes[0]({ personality_id: "tranquila", character: "stazia" }));
    expect(local()).toEqual(["stazi", null]);
    expect(pressed(STAZI)).toBe(true);
    expect(card("Tranquilo")).toHaveAttribute("aria-pressed", "true");
  });

  it("falha de rede não quebra: a escolha fica no aparelho e vai de novo na próxima vez que a entrada abrir", async () => {
    const falha = vi.fn(async () => { throw new Error("sem rede"); });
    const { onStart } = await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }), falha);
    fireEvent.click(screen.getByRole("button", { name: STAZIA }));
    await waitFor(() => expect(falha).toHaveBeenCalledWith("stazia"));
    await act(async () => {});
    expect(pressed(STAZIA)).toBe(true);
    expect(personagemPendente()).toBe("stazia");
    fireEvent.click(screen.getByRole("button", { name: /Começar com/ }));
    expect(onStart).toHaveBeenCalledWith("tranquila", "livre");
    cleanup();
    // próxima vez: o perfil ainda diz Stazi, mas o toque pendente desta conta vale e é gravado de novo
    const ok = vi.fn(async () => ({ personality_id: "tranquila", character: "stazia" }));
    await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }), ok);
    expect(pressed(STAZIA)).toBe(true);
    await waitFor(() => expect(ok).toHaveBeenCalledWith("stazia"));
    await waitFor(() => expect(personagemPendente()).toBeNull());
    expect(local()).toEqual(["stazia", null]);
  });

  it("erro que estoura na hora (sem promessa) também não quebra a tela", async () => {
    const quebra = vi.fn(() => { throw new Error("backend fora"); });
    await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" }), quebra);
    fireEvent.click(screen.getByRole("button", { name: STAZIA }));
    await act(async () => {});
    expect(quebra).toHaveBeenCalledWith("stazia");
    expect(pressed(STAZIA)).toBe(true);
  });

  it("sem quem grave (entrada sem perfil), a escolha fica só no aparelho como antes, sem pendente", async () => {
    await lobby(status({ personality_id: "acolhedor", profanity: "off", chosen: true }));
    fireEvent.click(screen.getByRole("button", { name: STAZIA }));
    expect(pressed(STAZIA)).toBe(true);
    expect(local()).toEqual(["stazia", null]);
  });
});
