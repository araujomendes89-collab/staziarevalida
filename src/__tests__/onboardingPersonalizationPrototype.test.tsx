import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingPersonalizationView } from "../components/onboarding/OnboardingPersonalizationView";
import { OnboardingDemoQuestionView } from "../components/onboarding/OnboardingDemoQuestionView";
import { StorageService } from "../services/storageService";

describe("Onboarding Initial Personalization Prototype (Tela 04 — Personalização Inicial)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should render intro step with headline, subheadline and continue button", () => {
    render(
      <MemoryRouter>
        <OnboardingPersonalizationView />
      </MemoryRouter>
    );

    expect(screen.getByText("Agora vamos montar sua preparação.")).toBeInTheDocument();
    expect(
      screen.getByText("São só algumas perguntas para entender sua rotina de estudos.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar/i })).toBeInTheDocument();
  });

  it("should navigate through all 5 questions sequentially with validation enablement", () => {
    const handleComplete = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingPersonalizationView onCompletePersonalization={handleComplete} />
      </MemoryRouter>
    );

    const continueBtn = () => screen.getByRole("button", { name: /Continuar/i });

    // Step 0 (Intro) -> Question 1
    fireEvent.click(continueBtn());

    // --- Question 1: Momento da preparação ---
    expect(
      screen.getByText("Em que momento da sua preparação você está?")
    ).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();

    // Select Option A
    const optStage = screen.getByText("Estou começando agora").closest("button");
    fireEvent.click(optStage!);
    expect(continueBtn()).not.toBeDisabled();
    fireEvent.click(continueBtn());

    // --- Question 2: Tempo disponível ---
    expect(
      screen.getByText("Quanto tempo você consegue estudar em um dia de estudo?")
    ).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();

    // Select "2 a 4 horas"
    const optTime = screen.getByText("2 a 4 horas").closest("button");
    fireEvent.click(optTime!);
    expect(continueBtn()).not.toBeDisabled();
    fireEvent.click(continueBtn());

    // --- Question 3: Dias da semana ---
    expect(
      screen.getByText("Em quais dias você normalmente consegue estudar?")
    ).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();

    // Select Seg, Qua, Sex
    fireEvent.click(screen.getByText("Seg").closest("button")!);
    fireEvent.click(screen.getByText("Qua").closest("button")!);
    fireEvent.click(screen.getByText("Sex").closest("button")!);
    expect(continueBtn()).not.toBeDisabled();
    fireEvent.click(continueBtn());

    // --- Question 4: Áreas de maior dificuldade ---
    expect(
      screen.getByText("Quais áreas hoje exigem mais atenção de você?")
    ).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();

    // Select Clínica Médica and Pediatria
    fireEvent.click(screen.getByText("Clínica Médica").closest("button")!);
    fireEvent.click(screen.getByText("Pediatria").closest("button")!);
    expect(continueBtn()).not.toBeDisabled();
    fireEvent.click(continueBtn());

    // --- Question 5: Objetivo de prova ---
    expect(
      screen.getByText("Você já sabe para qual edição do Revalida pretende se preparar?")
    ).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();

    // Select "Próxima edição"
    fireEvent.click(screen.getByText("Próxima edição").closest("button")!);
    expect(continueBtn()).not.toBeDisabled();
    fireEvent.click(continueBtn());

    // --- Summary Step ---
    expect(screen.getByText("Perfeito. Já temos o essencial.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Com essas informações, a StaziaMed poderá organizar sua rotina de estudo com mais contexto."
      )
    ).toBeInTheDocument();

    // Must NOT state that plan is generated
    expect(screen.queryByText(/Seu plano está pronto/i)).not.toBeInTheDocument();

    // Summary displays formatted values
    expect(screen.getAllByText("2 a 4 horas").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Seg • Qua • Sex")).toBeInTheDocument();
    expect(screen.getByText("Clínica Médica • Pediatria")).toBeInTheDocument();
    expect(screen.getAllByText("Próxima edição").length).toBeGreaterThanOrEqual(1);

    // Final CTA
    fireEvent.click(continueBtn());
    expect(handleComplete).toHaveBeenCalledTimes(1);
    expect(handleComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        preparationStage: "COMECO",
        dailyStudyAvailability: "2_A_4H",
        studyDays: ["SEG", "QUA", "SEX"],
        selfReportedWeakAreas: ["CLINICA_MEDICA", "PEDIATRIA"],
        examIntent: "PROXIMA",
      })
    );
  });

  it("should handle variable routine toggle on Question 3", () => {
    render(
      <MemoryRouter>
        <OnboardingPersonalizationView />
      </MemoryRouter>
    );

    const continueBtn = () => screen.getByRole("button", { name: /Continuar/i });

    // Intro -> Q1 -> Q2 -> Q3
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByText("Estou começando agora").closest("button")!);
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByText("1 a 2 horas").closest("button")!);
    fireEvent.click(continueBtn());

    // Q3: Select "Minha rotina varia muito"
    expect(continueBtn()).toBeDisabled();
    const variableOpt = screen.getByText("Minha rotina varia muito").closest("button");
    fireEvent.click(variableOpt!);
    expect(continueBtn()).not.toBeDisabled();
  });

  it("should handle 'Ainda não sei' toggle on Question 4", () => {
    render(
      <MemoryRouter>
        <OnboardingPersonalizationView />
      </MemoryRouter>
    );

    const continueBtn = () => screen.getByRole("button", { name: /Continuar/i });

    // Intro -> Q1 -> Q2 -> Q3 -> Q4
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByText("Estou começando agora").closest("button")!);
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByText("1 a 2 horas").closest("button")!);
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByText("Minha rotina varia muito").closest("button")!);
    fireEvent.click(continueBtn());

    // Q4: Select "Ainda não sei"
    expect(continueBtn()).toBeDisabled();
    const dontKnowOpt = screen.getByText("Ainda não sei").closest("button");
    fireEvent.click(dontKnowOpt!);
    expect(continueBtn()).not.toBeDisabled();
  });

  it("should preserve selected answers when navigating backwards", () => {
    render(
      <MemoryRouter>
        <OnboardingPersonalizationView />
      </MemoryRouter>
    );

    const continueBtn = () => screen.getByRole("button", { name: /Continuar/i });
    const backBtn = () => screen.getByRole("button", { name: /Voltar/i });

    // Intro -> Q1
    fireEvent.click(continueBtn());
    const optB = screen.getByText("Já estudo há algum tempo").closest("button");
    fireEvent.click(optB!);
    expect(optB).toHaveAttribute("aria-checked", "true");

    // Q1 -> Q2
    fireEvent.click(continueBtn());
    expect(
      screen.getByText("Quanto tempo você consegue estudar em um dia de estudo?")
    ).toBeInTheDocument();

    // Q2 -> Back to Q1
    fireEvent.click(backBtn());
    expect(
      screen.getByText("Em que momento da sua preparação você está?")
    ).toBeInTheDocument();
    const optBAgain = screen.getByText("Já estudo há algum tempo").closest("button");
    expect(optBAgain).toHaveAttribute("aria-checked", "true");
  });

  it("should connect Demo Question CTA to Personalize route", () => {
    const handleComplete = vi.fn();
    render(
      <MemoryRouter initialEntries={["/onboarding/experience"]}>
        <OnboardingDemoQuestionView onCompleteDemo={handleComplete} />
      </MemoryRouter>
    );

    // Select option B and reveal feedback
    fireEvent.click(screen.getByText("Apendicite aguda").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /Ver explicação/i }));

    // Click Continuar
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  // Strict Isolation & Zero Persistence Proof Tests
  describe("Strict Isolation & Zero Persistence Proof", () => {
    it("should never call StorageService or write to localStorage during personalization", () => {
      const saveAttemptsSpy = vi.spyOn(StorageService, "saveAttempts");
      const saveProfileSpy = vi.spyOn(StorageService, "saveUserProfile");
      const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

      render(
        <MemoryRouter>
          <OnboardingPersonalizationView />
        </MemoryRouter>
      );

      const continueBtn = () => screen.getByRole("button", { name: /Continuar/i });

      // Step through all screens
      fireEvent.click(continueBtn());
      fireEvent.click(screen.getByText("Estou começando agora").closest("button")!);
      fireEvent.click(continueBtn());
      fireEvent.click(screen.getByText("1 a 2 horas").closest("button")!);
      fireEvent.click(continueBtn());
      fireEvent.click(screen.getByText("Minha rotina varia muito").closest("button")!);
      fireEvent.click(continueBtn());
      fireEvent.click(screen.getByText("Ainda não sei").closest("button")!);
      fireEvent.click(continueBtn());
      fireEvent.click(screen.getByText("Próxima edição").closest("button")!);
      fireEvent.click(continueBtn());
      fireEvent.click(continueBtn()); // Summary finish

      expect(saveAttemptsSpy).not.toHaveBeenCalled();
      expect(saveProfileSpy).not.toHaveBeenCalled();
      expect(localStorageSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("praxis_user_profile"),
        expect.anything()
      );
    });
  });
});
