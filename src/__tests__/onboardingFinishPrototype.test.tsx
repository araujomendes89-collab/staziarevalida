import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingFinishView } from "../components/onboarding/OnboardingFinishView";
import { OnboardingProgressPreviewView } from "../components/onboarding/OnboardingProgressPreviewView";
import { StorageService } from "../services/storageService";

describe("Onboarding Completion Transition Prototype (Tela 06 — Encerramento / Transição)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should render headline, primary message and subheadline correctly", () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/finish"]}>
        <OnboardingFinishView />
      </MemoryRouter>
    );

    // Headline
    expect(screen.getByText("Tudo certo.")).toBeInTheDocument();

    // Primary complementary message
    expect(
      screen.getByText("Agora a StaziaMed pode começar a organizar sua preparação.")
    ).toBeInTheDocument();

    // Subheadline
    expect(
      screen.getByText(
        "Estudo, prática e revisão podem trabalhar juntos em uma rotina feita para acompanhar sua preparação ao longo do Revalida."
      )
    ).toBeInTheDocument();

    // Primary CTA
    expect(screen.getByRole("button", { name: /Entrar na StaziaMed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar/i })).toBeInTheDocument();
  });

  it("should render the three pillars micro-pills without fake promises", () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/finish"]}>
        <OnboardingFinishView />
      </MemoryRouter>
    );

    expect(screen.getByText("Estudo orientado")).toBeInTheDocument();
    expect(screen.getByText("Prática ativa de questões")).toBeInTheDocument();
    expect(screen.getByText("Revisões no momento certo")).toBeInTheDocument();

    // Must NOT contain fake planning or completion claims
    expect(screen.queryByText(/Seu plano está pronto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seu cronograma foi criado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sua aprovação começa aqui/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b\d+%/)).not.toBeInTheDocument();
  });

  it("should handle Voltar button and call onBack when provided", () => {
    const handleBack = vi.fn();
    render(
      <MemoryRouter initialEntries={["/onboarding/finish"]}>
        <OnboardingFinishView onBack={handleBack} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("should handle primary CTA and call onComplete when provided", () => {
    const handleComplete = vi.fn();
    render(
      <MemoryRouter initialEntries={["/onboarding/finish"]}>
        <OnboardingFinishView onComplete={handleComplete} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Entrar na StaziaMed/i }));
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it("should render safely on direct route access without state or refresh", () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/finish"]}>
        <OnboardingFinishView />
      </MemoryRouter>
    );

    expect(screen.getByText("Tudo certo.")).toBeInTheDocument();
    expect(screen.getByText("StaziaMed Revalida • Preparação Médica Estruturada")).toBeInTheDocument();
  });

  it("should navigate from progress-preview to finish on continue click", () => {
    const handleContinue = vi.fn();
    render(
      <MemoryRouter initialEntries={["/onboarding/progress-preview"]}>
        <OnboardingProgressPreviewView onContinue={handleContinue} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(handleContinue).toHaveBeenCalledTimes(1);
  });

  describe("Strict Isolation & Zero Persistence Proof", () => {
    it("should never persist data, call StorageService, or mutate UserProfile", () => {
      const saveAttemptsSpy = vi.spyOn(StorageService, "saveAttempts");
      const saveProfileSpy = vi.spyOn(StorageService, "saveUserProfile");
      const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

      render(
        <MemoryRouter initialEntries={["/onboarding/finish"]}>
          <OnboardingFinishView />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: /Entrar na StaziaMed/i }));

      expect(saveAttemptsSpy).not.toHaveBeenCalled();
      expect(saveProfileSpy).not.toHaveBeenCalled();
      expect(localStorageSpy).not.toHaveBeenCalled();
    });
  });
});
