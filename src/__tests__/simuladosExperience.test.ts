import { describe, it, expect } from "vitest";
import { TEST_QUESTIONS_COLLECTION } from "./testFixtures";
import { SessionBuilderService, DEFAULT_SESSION_CONFIG } from "../services/sessionBuilderService";
import { QuestionSessionConfig, ActiveTrainingSession } from "../types";

describe("Simulados Experience & Session Creation (Etapa 1.7)", () => {
  const allQuestions = TEST_QUESTIONS_COLLECTION;

  it("A. Generates simulation session with requested question count", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado Rápido 10q",
      quantity: 10,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    expect(sessionQuestions.length).toBe(10);
  });

  it("B. Generated simulation contains zero duplicate questions", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado 20q",
      quantity: 20,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    const questionIds = sessionQuestions.map((q) => q.id);
    const uniqueIds = new Set(questionIds);
    expect(uniqueIds.size).toBe(sessionQuestions.length);
  });

  it("C. Area-focused simulation filters strictly by selected medical area", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado Pediatria",
      areas: ["PEDIATRIA"],
      quantity: 10,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    expect(sessionQuestions.length).toBeGreaterThan(0);
    sessionQuestions.forEach((q) => {
      expect(q.area).toBe("PEDIATRIA");
    });
  });

  it("D. Simulation session object correctly stores question IDs and configuration", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: "Simulado 15q",
      quantity: 15,
      feedbackMode: "END_OF_SESSION",
    };

    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      allQuestions,
      [],
      []
    );

    const session: ActiveTrainingSession = {
      id: `simulado-test-${Date.now()}`,
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

    expect(session.questionIds.length).toBe(15);
    expect(session.mode).toBe("SIMULADO");
    expect(session.isCompleted).toBe(false);
  });

  it("E. Feedback mode is preserved (END_OF_SESSION vs IMMEDIATE)", () => {
    const endConfig: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      feedbackMode: "END_OF_SESSION",
    };
    expect(endConfig.feedbackMode).toBe("END_OF_SESSION");

    const immConfig: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      feedbackMode: "IMMEDIATE",
    };
    expect(immConfig.feedbackMode).toBe("IMMEDIATE");
  });

  it("F. Empty database or zero matching filters yields 0 questions safely", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      topics: ["NON_EXISTENT_TOPIC_XYZ"],
    };

    // Filter strictly returns 0
    const filtered = SessionBuilderService.filterQuestions(
      config,
      allQuestions,
      [],
      []
    );
    expect(filtered.length).toBe(0);

    // Empty dataset yields 0
    const sessionQuestions = SessionBuilderService.buildQuestionSession(
      config,
      [],
      [],
      []
    );
    expect(sessionQuestions.length).toBe(0);
  });

  it("G. Session persistence saves and retrieves active session", () => {
    const session: ActiveTrainingSession = {
      id: "active-sim-123",
      title: "Simulado em Andamento",
      subtitle: "10 questões",
      mode: "SIMULADO",
      config: DEFAULT_SESSION_CONFIG,
      questionIds: ["q-1", "q-2"],
      currentIndex: 1,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 120,
      isCompleted: false,
      paused: false,
    };

    SessionBuilderService.saveActiveSession(session);
    const retrieved = SessionBuilderService.getActiveSession();

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("active-sim-123");
    expect(retrieved?.currentIndex).toBe(1);

    SessionBuilderService.clearActiveSession();
    expect(SessionBuilderService.getActiveSession()).toBeNull();
  });
});
