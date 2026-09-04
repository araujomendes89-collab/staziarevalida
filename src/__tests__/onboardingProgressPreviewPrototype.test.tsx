import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingProgressPreviewView } from "../components/onboarding/OnboardingProgressPreviewView";
import { OnboardingPersonalizationView } from "../components/onboarding/OnboardingPersonalizationView";
import { StorageService } from "../services/storageService";

describe("Onboarding Progress Preview Prototype (Tela 05 — Acompanhe sua evolução)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should render headline, subheadline and preview badge", () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/progress-preview"]}>
        <OnboardingProgressPreviewView />
      </MemoryRouter>
    );

    expect(screen.getByText("Acompanhe sua evolução de verdade.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "À medida que você estuda, a StaziaMed organiza seu histórico para mostrar onde você avançou e o que ainda precisa revisar."
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("Prévia do seu acompanhamento").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /Voltar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeInTheDocument();
  });

  it("should render the 3 main blocks: Desempenho por área, Evolução, and Revisões", () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/progress-preview"]}>
        <OnboardingProgressPreviewView />
      </MemoryRouter>
    );

    // Block 1: Desempenho por área
    expect(screen.getByText("Desempenho por área")).toBeInTheDocument();
    expect(
      screen.getByText("Taxa de acerto e consistência nas 5 grandes áreas médicas")
    ).toBeInTheDocument();

    // Block 2: Evolução ao longo do tempo
    expect(screen.getByText("Sua evolução ao longo do tempo")).toBeInTheDocument();
    expect(
      screen.getByText("Seu histórico começa a ser construído conforme você pratica.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("A StaziaMed mostra sua evolução com base no que você realmente faz na plataforma.")
    ).toBeInTheDocument();

    // Block 3: Revisões no momento certo
    expect(screen.getByText("Revisões no momento certo")).toBeInTheDocument();
    expect(
      screen.getByText("A StaziaMed organiza os conteúdos que precisam voltar para sua rotina de estudo.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Você estuda sem se preocupar em calcular quando rever cada tema. A plataforma prioriza automaticamente os pontos que pedem reforço."
      )
    ).toBeInTheDocument();
  });

  it("should render all 5 canonical medical areas with honest placeholder text and NO fake metrics", () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/progress-preview"]}>
        <OnboardingProgressPreviewView />
      </MemoryRouter>
    );

    const areas = [
      "Clínica Médica",
      "Cirurgia Geral",
      "Pediatria",
      "Ginecologia e Obstetrícia",
      "Medicina Preventiva / Saúde Coletiva",
    ];

    areas.forEach((area) => {
      expect(screen.getByText(area)).toBeInTheDocument();
    });

    const placeholders = screen.getAllByText("Seu histórico aparecerá aqui");
    expect(placeholders).toHaveLength(5);

    // Ensure ZERO fake metrics, percentages or scores are displayed
    expect(screen.queryByText(/\b\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b\d+\s*pontos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bnota\s*\d/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/chance de aprovação/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/probabilidade de aprovação/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/18 revisões/i)).not.toBeInTheDocument();
  });

  it("should display self-reported areas with honest self-perception framing", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/onboarding/progress-preview",
            state: {
              selfReportedWeakAreas: ["CLINICA_MEDICA", "PEDIATRIA"],
              dontKnowWeakAreas: false,
            },
          },
        ]}
      >
        <OnboardingProgressPreviewView />
      </MemoryRouter>
    );

    expect(screen.getByText("Você indicou que quer dar mais atenção a:")).toBeInTheDocument();
    expect(screen.getByText("(com base na sua percepção inicial)")).toBeInTheDocument();

    // Must NOT state "áreas fracas" or "pior desempenho"
    expect(screen.queryByText(/áreas fracas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pior desempenho/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/baixo desempenho/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/prioridade pps/i)).not.toBeInTheDocument();
  });

  it("should handle 'Ainda não sei' self-report branch gracefully", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/onboarding/progress-preview",
            state: {
              selfReportedWeakAreas: [],
              dontKnowWeakAreas: true,
            },
          },
        ]}
      >
        <OnboardingProgressPreviewView />
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        "Tudo bem. Conforme você pratica, seu desempenho real vai ajudar a identificar onde vale concentrar mais atenção."
      )
    ).toBeInTheDocument();
  });

  it("should render safely on direct route access without state", () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/progress-preview"]}>
        <OnboardingProgressPreviewView />
      </MemoryRouter>
    );

    expect(screen.getByText("Acompanhe sua evolução de verdade.")).toBeInTheDocument();
    expect(screen.queryByText("Você indicou que quer dar mais atenção a:")).not.toBeInTheDocument();
  });

  it("should handle CTA buttons safely", () => {
    const handleBack = vi.fn();
    const handleContinue = vi.fn();

    render(
      <MemoryRouter initialEntries={["/onboarding/progress-preview"]}>
        <OnboardingProgressPreviewView onBack={handleBack} onContinue={handleContinue} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(handleBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(handleContinue).toHaveBeenCalledTimes(1);

    // Must NOT claim that study plan is ready
    expect(screen.queryByText(/Seu plano está pronto/i)).not.toBeInTheDocument();
  });

  describe("Strict Isolation & Zero Persistence Proof", () => {
    it("should never call StorageService or write to localStorage during progress preview", () => {
      const saveAttemptsSpy = vi.spyOn(StorageService, "saveAttempts");
      const saveProfileSpy = vi.spyOn(StorageService, "saveUserProfile");
      const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

      render(
        <MemoryRouter initialEntries={["/onboarding/progress-preview"]}>
          <OnboardingProgressPreviewView />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));

      expect(saveAttemptsSpy).not.toHaveBeenCalled();
      expect(saveProfileSpy).not.toHaveBeenCalled();
      expect(localStorageSpy).not.toHaveBeenCalled();
    });
  });
});
