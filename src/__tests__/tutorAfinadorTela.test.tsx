/**
 * Tela de voz → afinador: a voz ao vivo do personagem dono da voz vem afinada pelo manifest (`voz.semitons`: Stazi +3, Stazia 0);
 * conversa antiga (professor aposentado) não afina; a prop `semitons` passa por cima; ao fechar a tela, volta a 0.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { semitonsDaVoz } from "../novo/app/tutor/voice/pitchShift.js";
import { PERSONAGENS } from "../novo/app/tutor/personagens/personagens.js";

vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ getAudioContext: () => null, releaseAudioContext: async () => {}, unlockAudio: () => null }));

const rt: any = { state: "speaking", muted: false, streams: { input: null, output: null }, captions: { tutor: "Foco.", student: "" }, provider: "live", setVolume() {}, start() {}, sendText() {}, toggleMute() {}, interrupt() {} };

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("tela de voz liga os semitons do personagem ao tocador", () => {
  it("Durão e Tranquilo (Stazi) afinam como o manifest; Durona e Tranquila (Stazia) não; fechar volta a 0", async () => {
    const { StaziaVoiceMode } = await import("../novo/app/tutor/voice/StaziaVoiceMode.jsx");
    const stazi = Number((PERSONAGENS.stazi as any).voz?.semitons ?? 0);
    const stazia = Number((PERSONAGENS.stazia as any).voz?.semitons ?? 0);
    for (const [id, esperado] of [["durao", stazi], ["acolhedor", stazi], ["durona", stazia], ["tranquila", stazia]] as const) {
      const { unmount } = render(<StaziaVoiceMode rt={rt} persona={{ id, name: id, emoji: "x" }} onClose={() => {}} />);
      expect(semitonsDaVoz()).toBe(esperado);
      unmount();
      expect(semitonsDaVoz()).toBe(0);
    }
  });

  it("decisão do dono: Stazi +3, Stazia 0 (quando o manifest já tiver o campo voz)", () => {
    const voz = (p: any) => p.voz;
    if (voz(PERSONAGENS.stazi)) expect(voz(PERSONAGENS.stazi).semitons).toBe(3);
    if (voz(PERSONAGENS.stazia)) expect(voz(PERSONAGENS.stazia).semitons).toBe(0);
  });

  it("conversa antiga (Direto) não afina, mesmo trocando o desenho; a prop semitons passa por cima", async () => {
    const { StaziaVoiceMode } = await import("../novo/app/tutor/voice/StaziaVoiceMode.jsx");
    window.localStorage.setItem("smn-tutor-personagem", "stazi");
    const { unmount } = render(<StaziaVoiceMode rt={rt} persona={{ id: "direto", name: "Direto", emoji: "x" }} onClose={() => {}} />);
    expect(semitonsDaVoz()).toBe(0);
    unmount();
    render(<StaziaVoiceMode rt={rt} persona={{ id: "durona", name: "Durona", emoji: "x" }} semitons={2} onClose={() => {}} />);
    expect(semitonsDaVoz()).toBe(2);
  });
});
