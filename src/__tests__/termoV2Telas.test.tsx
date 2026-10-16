/**
 * Termo 2.0 nas telas: a tela de aceite mostra o texto da versão que o BANCO diz que está vigente e, quando ele pede
 * (legal.declarations_required), as declarações de maioridade e de formação em Medicina; session.acceptTerms usa
 * app_accept_terms_declared só nesse caso. Com o 1.0 vigente, tudo fica como antes. Texto: docs/voice-tutor/04-termo-voz.md.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state: { session: any } = { session: null };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => state.session }));

import { AcceptanceScreen } from "../novo/app/legal/AcceptanceScreen.jsx";
import { documentosDa, DECLARACAO_ADULTO, DECLARACAO_MEDICO } from "../novo/app/legal/documentos.js";
import { rememberGoogleAcceptance, takeGoogleAcceptance, takeGoogleAcceptanceFull } from "../novo/app/legal/googleAcceptance.js";
import { signUpMetadata } from "../novo/data/backend";
import { TUTOR_CONSENT_TEXTS } from "../novo/app/tutor/TutorConsentCard.jsx";

const FRASE = /Declaro que li e compreendi/;
const legalOf = (versao: string, extra: Record<string, unknown> = {}) => ({
  termo_uso: { current: versao, accepted: "1.0", accepted_at: "2026-10-08T12:00:00Z" },
  tutor_ia: { current: "1.0", accepted: null, accepted_at: null },
  student: true,
  phone_missing: false,
  gate_required: true,
  ...extra,
});
function open(legal: any) {
  const fns = { acceptTerms: vi.fn(async (_a: any) => {}), refresh: vi.fn(async () => {}), signOut: vi.fn() };
  state.session = { status: "ready", boot: { role: "student", legal }, ...fns };
  render(<AcceptanceScreen />);
  return fns;
}
const botao = () => screen.getByRole("button", { name: "Aceitar e continuar" }) as HTMLButtonElement;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Termo 2.0 — textos por versão", () => {
  it("1.0 é o texto de hoje e 2.0 traz maioridade, médico, fornecedores e retenção", () => {
    const v1 = documentosDa("1.0");
    const v2 = documentosDa("2.0");
    expect(v1.declaracoes).toBe(false);
    expect(v2.declaracoes).toBe(true);
    expect(v1.termo).toContain("Versão do Termo: 1.0");
    expect(v1.termo).not.toContain("QUEM PODE USAR");
    for (const trecho of ["18 anos ou mais", "graduação em Medicina concluída", "Google Cloud (Vertex AI, modelos Gemini)", "OpenAI", "ElevenLabs",
      "Anthropic (Claude)", "não grava o áudio da sua voz", "apagado automaticamente depois de 7 dias", "LIGADOS POR PADRÃO", "Durona", "Explosiva",
      "Versão do Termo: 2.0"]) {
      expect(v2.termo).toContain(trecho);
    }
    // decisões do dono de 16/10: sem rascunho, sem 30 dias, sem "só quando ativa", sem plano gratuito
    for (const fora of ["RASCUNHO", "30 dias", "somente quando", "plano gratuito", "API gratuita"]) expect(v2.termo).not.toContain(fora);
    expect(JSON.stringify(v2.privacidade)).toContain("até 7 dias");
    expect(JSON.stringify(v2.privacidade)).toContain("Vertex AI");
    // o §34 do Termo 2.0 é o mesmo texto do cartão do Tutor na versão 2.0
    expect(v2.termo).toContain(TUTOR_CONSENT_TEXTS["2.0"]);
    expect(v1.termo).toContain(TUTOR_CONSENT_TEXTS["1.0"]);
    expect(JSON.stringify(v2.privacidade)).toContain("ElevenLabs");
    expect(JSON.stringify(v1.privacidade)).not.toContain("ElevenLabs");
    // versão desconhecida cai na de versions.js (hoje 1.0)
    expect(documentosDa("9.9")).toBe(v1);
  });
});

describe("Termo 2.0 — tela de aceite", () => {
  it("com o 1.0 vigente: sem declarações e com o texto de hoje", () => {
    const fns = open(legalOf("1.0", { termo_uso: { current: "1.0", accepted: null, accepted_at: null } }));
    expect(screen.queryByRole("checkbox", { name: DECLARACAO_ADULTO })).toBeNull();
    expect(document.body.textContent).not.toContain("QUEM PODE USAR");
    fireEvent.click(screen.getByRole("checkbox", { name: FRASE }));
    expect(botao().disabled).toBe(false);
    fireEvent.click(botao());
    return waitFor(() => expect(fns.acceptTerms).toHaveBeenCalledWith({ document: "termo_uso", version: "1.0", origin: "tela_aceite", phone: undefined, declarations: undefined }));
  });

  it("com o 2.0 vigente: mostra o texto 2.0 e só aceita com as três marcações", async () => {
    const fns = open(legalOf("2.0", { declarations_required: true }));
    expect(screen.getByText("Versão 2.0")).toBeTruthy();
    expect(document.body.textContent).toContain("QUEM PODE USAR");
    const adulto = screen.getByRole("checkbox", { name: DECLARACAO_ADULTO });
    const medico = screen.getByRole("checkbox", { name: DECLARACAO_MEDICO });

    fireEvent.click(screen.getByRole("checkbox", { name: FRASE }));
    expect(botao().disabled).toBe(true);
    fireEvent.click(adulto);
    expect(botao().disabled).toBe(true);
    fireEvent.click(medico);
    expect(botao().disabled).toBe(false);
    fireEvent.click(botao());
    await waitFor(() => expect(fns.acceptTerms).toHaveBeenCalledTimes(1));
    expect(fns.acceptTerms).toHaveBeenCalledWith({
      document: "termo_uso", version: "2.0", origin: "tela_aceite", phone: undefined, declarations: { adult: true, physician: true },
    });
  });

  it("volta do Google: aceita sozinho só se o cadastro guardou as duas declarações", async () => {
    rememberGoogleAcceptance("2.0", { adult: true, physician: true });
    const ok = open(legalOf("2.0", { declarations_required: true }));
    await waitFor(() => expect(ok.acceptTerms).toHaveBeenCalledWith({ document: "termo_uso", version: "2.0", origin: "google", declarations: { adult: true, physician: true } }));
    cleanup();

    rememberGoogleAcceptance("2.0");
    const falta = open(legalOf("2.0", { declarations_required: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(falta.acceptTerms).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: DECLARACAO_MEDICO })).toBeTruthy();
  });
});

describe("Termo 2.0 — dados do cadastro e do Google", () => {
  it("signUpMetadata leva as declarações só quando marcadas", () => {
    expect(signUpMetadata({ termsVersion: "2.0", declaresAdult: true, declaresPhysician: true })).toEqual({
      terms_version: "2.0", declares_adult: "true", declares_physician: "true",
    });
    expect(signUpMetadata({ termsVersion: "2.0", declaresAdult: false, declaresPhysician: true })).toEqual({ terms_version: "2.0", declares_physician: "true" });
    expect(signUpMetadata({ termsVersion: "1.0" })).toEqual({ terms_version: "1.0" });
  });

  it("o registro do Google guarda as declarações e continua lido uma única vez", () => {
    rememberGoogleAcceptance("2.0", { adult: true, physician: true });
    expect(takeGoogleAcceptanceFull("2.0")).toEqual({ adult: true, physician: true });
    expect(takeGoogleAcceptanceFull("2.0")).toBeNull();
    rememberGoogleAcceptance("1.0");
    expect(takeGoogleAcceptanceFull("2.0")).toBeNull();
    rememberGoogleAcceptance("1.0");
    expect(takeGoogleAcceptance("1.0")).toBe(true);
  });
});
