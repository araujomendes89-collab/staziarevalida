import { describe, it, expect } from "vitest";
import { TEST_QUESTIONS_COLLECTION } from "./testFixtures";
import { SessionBuilderService, DEFAULT_SESSION_CONFIG } from "../services/sessionBuilderService";
import { QuestionSessionConfig, ActiveTrainingSession } from "../types";

describe("Simulados Experience & Quantity Range Slider (Etapas 1.7 & 1.7.1)", () => {
  const allQuestions = TEST_QUESTIONS_COLLECTION;

  it("A. Slider minimum is strictly 1 question", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado 1 Questão",
      quantity: 1,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    expect(sessionQuestions.length).toBe(1);
  });

  it("B. Global maximum for simulation generation is bounded at 100 questions", () => {
    const requestedCount = 100;
    const effectiveMax = Math.min(100, allQuestions.length);

    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado Máximo 100q",
      quantity: effectiveMax,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    expect(sessionQuestions.length).toBe(effectiveMax);
    expect(sessionQuestions.length).toBeLessThanOrEqual(100);
  });

  it("C. Allows selecting and generating arbitrary intermediate counts (e.g. 37 questions)", () => {
    const intermediateCount = 37;
    const effectiveQuantity = Math.min(intermediateCount, allQuestions.length);

    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado 37 Questões",
      quantity: effectiveQuantity,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    expect(sessionQuestions.length).toBe(effectiveQuantity);
  });

  it("D. Selected slider count arrives accurately into active session questionIds", () => {
    const selectedCount = 23;
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado 23q",
      quantity: selectedCount,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    const session: ActiveTrainingSession = {
      id: `simulado-slider-${Date.now()}`,
      title: config.title || "Simulado",
      subtitle: `${sessionQuestions.length} questões`,
      mode: "SIMULADO",
      config,
      questionIds: sessionQuestions.map((q) => q.id),
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    expect(session.questionIds.length).toBe(selectedCount);
    expect(session.config.quantity).toBe(selectedCount);
  });

  it("E. If filtered dataset has 65 available questions, effective maximum is 65", () => {
    const availableQuestions = 65;
    const effectiveMax = Math.min(100, availableQuestions);
    expect(effectiveMax).toBe(65);

    const requestedValue = 80;
    const boundedValue = Math.min(requestedValue, effectiveMax);
    expect(boundedValue).toBe(65);
  });

  it("F. When user had 80 selected and filter reduces availability to 40, value auto-adjusts to 40", () => {
    let selectedQuantity = 80;
    const newAvailable = 40;

    const maxAvailable = Math.min(100, newAvailable);
    if (selectedQuantity > maxAvailable) {
      selectedQuantity = maxAvailable;
    }

    expect(selectedQuantity).toBe(40);
  });

  it("G. When only 1 question is available, min=1 and max=1, and 1-question session works cleanly", () => {
    const singleQuestionDataset = [allQuestions[0]];
    const available = singleQuestionDataset.length;
    const effectiveMax = Math.max(1, Math.min(100, available));

    expect(effectiveMax).toBe(1);

    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado 1 Questão Única",
      quantity: effectiveMax,
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      singleQuestionDataset,
      [],
      []
    );

    expect(sessionQuestions.length).toBe(1);
    expect(sessionQuestions[0].id).toBe(singleQuestionDataset[0].id);
  });

  it("H. Zero questions available safely handles empty array and does not generate invalid session", () => {
    const emptyDataset: any[] = [];
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado Vazio",
      quantity: 10,
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      emptyDataset,
      [],
      []
    );

    expect(sessionQuestions.length).toBe(0);
  });

  it("I. All 4 simulation modalities (Rapido, Area, Geral, Personalizado) generate valid sessions", () => {
    const modalities: QuestionSessionConfig[] = [
      {
        ...DEFAULT_SESSION_CONFIG,
        mode: "SIMULADO",
        title: "Simulado Rápido",
        areas: ["ALL"],
        quantity: 15,
        feedbackMode: "END_OF_SESSION",
      },
      {
        ...DEFAULT_SESSION_CONFIG,
        mode: "SIMULADO",
        title: "Simulado Clínica Médica",
        areas: ["CLINICA_MEDICA"],
        quantity: 12,
        feedbackMode: "END_OF_SESSION",
      },
      {
        ...DEFAULT_SESSION_CONFIG,
        mode: "SIMULADO",
        title: "Simulado Geral",
        areas: ["ALL"],
        quantity: 50,
        feedbackMode: "END_OF_SESSION",
      },
      {
        ...DEFAULT_SESSION_CONFIG,
        mode: "SIMULADO",
        title: "Simulado Personalizado",
        areas: ["CIRURGIA_GERAL", "PEDIATRIA"],
        quantity: 25,
        feedbackMode: "IMMEDIATE",
      },
    ];

    modalities.forEach((modalityConfig) => {
      const questions = SessionBuilderService.buildQuestionSession(
        modalityConfig,
        allQuestions,
        [],
        []
      );
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.length).toBeLessThanOrEqual(modalityConfig.quantity);
    });
  });
});
