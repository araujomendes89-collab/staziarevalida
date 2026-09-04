import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingDemoQuestionView } from "../components/onboarding/OnboardingDemoQuestionView";
import { OnboardingDemoQuestionCard } from "../components/onboarding/OnboardingDemoQuestionCard";
import { ONBOARDING_DEMO_QUESTION } from "../components/onboarding/onboardingDemoQuestionData";
import { OnboardingEcosystemView } from "../components/onboarding/OnboardingEcosystemView";
import { StorageService } from "../services/storageService";

describe("Onboarding Demo Question Experience Prototype (Tela 03 — Experiência Demonstrativa)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should render demo question with disclaimer, case statement, and 4 options", () => {
    render(
      <MemoryRouter>
        <OnboardingDemoQuestionView />
      </MemoryRouter>
    );

    // Demonstration disclaimer
    expect(screen.getByText("Questão demonstrativa")).toBeInTheDocument();
    expect(
      screen.getByText("Sua resposta aqui não conta para o seu desempenho.")
    ).toBeInTheDocument();

    // Clinical case and question
    expect(
      screen.getByText(/Um homem de 24 anos procura atendimento com dor abdominal/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Qual é o diagnóstico mais provável?")).toBeInTheDocument();

    // 4 Options
    expect(screen.getByText("Gastroenterite aguda")).toBeInTheDocument();
    expect(screen.getByText("Apendicite aguda")).toBeInTheDocument();
    expect(screen.getByText("Colecistite aguda")).toBeInTheDocument();
    expect(screen.getByText("Pancreatite aguda")).toBeInTheDocument();

    // Must NOT contain false official exam branding
    expect(screen.queryByText(/Questão Revalida/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/INEP/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Questão oficial/i)).not.toBeInTheDocument();
  });

  it("should start with no option selected and disabled 'Ver explicação' button", () => {
    render(
      <MemoryRouter>
        <OnboardingDemoQuestionView />
      </MemoryRouter>
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    radios.forEach((radio) => {
      expect(radio).toHaveAttribute("aria-checked", "false");
    });

    const revealBtn = screen.getByRole("button", { name: /Ver explicação/i });
    expect(revealBtn).toBeDisabled();
  });

  it("should allow local selection without revealing feedback before clicking 'Ver explicação'", () => {
    render(
      <MemoryRouter>
        <OnboardingDemoQuestionView />
      </MemoryRouter>
    );

    const optionB = screen.getByText("Apendicite aguda").closest("button");
    expect(optionB).toBeInTheDocument();

    // Click option B
    fireEvent.click(optionB!);
    expect(optionB).toHaveAttribute("aria-checked", "true");

    // Feedback should NOT be visible yet
    expect(screen.queryByText("Você escolheu a resposta correta.")).not.toBeInTheDocument();
    expect(screen.queryByText("Ponto-chave:")).not.toBeInTheDocument();

    const revealBtn = screen.getByRole("button", { name: /Ver explicação/i });
    expect(revealBtn).not.toBeDisabled();
  });

  it("should reveal positive feedback when correct answer (B) is confirmed", () => {
    render(
      <MemoryRouter>
        <OnboardingDemoQuestionView />
      </MemoryRouter>
    );

    // Select B (Apendicite aguda)
    const optionB = screen.getByText("Apendicite aguda").closest("button");
    fireEvent.click(optionB!);

    // Reveal feedback
    const revealBtn = screen.getByRole("button", { name: /Ver explicação/i });
    fireEvent.click(revealBtn);

    // Positive confirmation
    expect(screen.getByText("Você escolheu a resposta correta.")).toBeInTheDocument();
    expect(screen.getByText(/Resposta correta:/i)).toBeInTheDocument();
    expect(screen.getByText(/B — Apendicite aguda/i)).toBeInTheDocument();

    // Pedagogical explanation and key point
    expect(
      screen.getByText(/A migração da dor da região periumbilical para a fossa ilíaca direita/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Dor que migra para a fossa ilíaca direita é um achado clássico/i)
    ).toBeInTheDocument();

    // Product value note
    expect(
      screen.getByText(
        /Na StaziaMed, cada questão ajuda você a entender o raciocínio e identificar o conteúdo que precisa revisar./i
      )
    ).toBeInTheDocument();

    // Forward CTA appears
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeInTheDocument();
  });

  it("should reveal constructive non-punitive feedback when incorrect answer (A) is confirmed", () => {
    render(
      <MemoryRouter>
        <OnboardingDemoQuestionView />
      </MemoryRouter>
    );

    // Select A (Gastroenterite aguda)
    const optionA = screen.getByText("Gastroenterite aguda").closest("button");
    fireEvent.click(optionA!);

    // Reveal feedback
    const revealBtn = screen.getByRole("button", { name: /Ver explicação/i });
    fireEvent.click(revealBtn);

    // Non-punitive feedback
    expect(screen.getByText("Veja o raciocínio da questão.")).toBeInTheDocument();
    expect(screen.queryByText(/Você errou/i)).not.toBeInTheDocument();

    // Still reveals correct answer and clinical explanation
    expect(screen.getByText(/B — Apendicite aguda/i)).toBeInTheDocument();
    expect(
      screen.getByText(/A migração da dor da região periumbilical para a fossa ilíaca direita/i)
    ).toBeInTheDocument();
  });

  it("should navigate back to ecosystem when back button is clicked", () => {
    const handleBack = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingDemoQuestionView onBackToEcosystem={handleBack} />
      </MemoryRouter>
    );

    const backBtn = screen.getByRole("button", { name: /Voltar/i });
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("should connect Ecosystem final CTA ('Quero experimentar') to Experience route", () => {
    const handleComplete = vi.fn();
    render(
      <MemoryRouter initialEntries={["/onboarding/ecosystem"]}>
        <OnboardingEcosystemView onComplete={handleComplete} />
      </MemoryRouter>
    );

    // Advance to step 6 in carousel
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    }

    const expBtn = screen.getByRole("button", { name: /Quero experimentar/i });
    fireEvent.click(expBtn);
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  // Strict Isolation & Zero Persistence Proof Tests
  describe("Strict Isolation & Zero Persistence Proof", () => {
    it("should never call StorageService.saveAttempts or persist any question attempt", () => {
      const saveAttemptsSpy = vi.spyOn(StorageService, "saveAttempts");
      const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

      render(
        <MemoryRouter>
          <OnboardingDemoQuestionView />
        </MemoryRouter>
      );

      // Select option and submit
      const optionB = screen.getByText("Apendicite aguda").closest("button");
      fireEvent.click(optionB!);
      const revealBtn = screen.getByRole("button", { name: /Ver explicação/i });
      fireEvent.click(revealBtn);

      expect(saveAttemptsSpy).not.toHaveBeenCalled();
      expect(localStorageSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("attempt"),
        expect.anything()
      );
      expect(localStorageSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("flashcard"),
        expect.anything()
      );
    });
  });
});
