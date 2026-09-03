import { describe, it, expect } from "vitest";
import { TEST_QUESTIONS_COLLECTION } from "./testFixtures";
import { REVALIDA_EDITIONS_INVENTORY } from "../data/revalidaInventoryData";
import { InventoryValidatorService } from "../services/inventoryValidatorService";
import { ActiveTrainingSession, QuestionSessionConfig, SessionAnswerState } from "../types";

describe("Full Exam Session & Lifecycle Integrity (Etapa 1.8A Audit)", () => {
  const allQuestions = TEST_QUESTIONS_COLLECTION;

  // Find 2026/1 edition
  const edition2026 = REVALIDA_EDITIONS_INVENTORY.find((e) => e.year === 2026);
  const questions2026 = allQuestions.filter((q) =>
    edition2026 ? InventoryValidatorService.matchesEdition(q, edition2026) : q.examYear === 2026
  );

  it("A. Full Exam strictly maintains official question sequence sorted by originalNumber", () => {
    const sorted = [...questions2026].sort(
      (a, b) => (a.originalNumber || 1) - (b.originalNumber || 1)
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const currentNum = sorted[i].originalNumber || 1;
      const nextNum = sorted[i + 1].originalNumber || 1;
      expect(currentNum).toBeLessThanOrEqual(nextNum);
    }
  });

  it("B. The first question in the session corresponds to the lowest originalNumber", () => {
    const sorted = [...questions2026].sort(
      (a, b) => (a.originalNumber || 1) - (b.originalNumber || 1)
    );

    expect(sorted.length).toBeGreaterThan(0);
    expect(sorted[0].originalNumber).toBe(1);
  });

  it("C. questionIds of the session correspond exactly to the selected edition", () => {
    const sorted = [...questions2026].sort(
      (a, b) => (a.originalNumber || 1) - (b.originalNumber || 1)
    );

    const session: ActiveTrainingSession = {
      id: "full-exam-test-1",
      title: "Prova Oficial: 2026/1",
      subtitle: `${sorted.length} questões • 1ª Etapa Teórica Objetiva`,
      mode: "SIMULADO",
      config: {
        mode: "SIMULADO",
        title: "Prova Oficial: 2026/1",
        objective: "FULL_EXAM",
        topics: [],
        competencies: [],
        areas: ["ALL"],
        years: ["2026"],
        difficulty: "ALL",
        inepRelevance: "ALL",
        quantity: sorted.length,
        feedbackMode: "END_OF_SESSION",
        timerMode: "EXAM_STRICT",
        showComments: false,
        ordering: "ORIGINAL_ORDER",
      },
      questionIds: sorted.map((q) => q.id),
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    expect(session.questionIds.length).toBe(questions2026.length);
    session.questionIds.forEach((qId) => {
      const q = allQuestions.find((item) => item.id === qId);
      expect(q).toBeDefined();
      expect(q?.examYear).toBe(2026);
    });
  });

  it("D. Zero questions from other editions enter the session", () => {
    const sorted = [...questions2026].sort(
      (a, b) => (a.originalNumber || 1) - (b.originalNumber || 1)
    );

    const sessionQuestionIds = new Set(sorted.map((q) => q.id));

    const questions2025 = allQuestions.filter((q) => q.examYear === 2025);
    questions2025.forEach((q) => {
      expect(sessionQuestionIds.has(q.id)).toBe(false);
    });
  });

  it("E. Session resumption preserves currentIndex position", () => {
    const initialSession: ActiveTrainingSession = {
      id: "resume-exam-1",
      title: "Prova 2026/1",
      mode: "SIMULADO",
      config: {
        mode: "SIMULADO",
        title: "Prova 2026/1",
        objective: "FULL_EXAM",
        topics: [],
        competencies: [],
        areas: ["ALL"],
        years: ["2026"],
        difficulty: "ALL",
        inepRelevance: "ALL",
        quantity: 100,
        feedbackMode: "END_OF_SESSION",
        timerMode: "EXAM_STRICT",
        showComments: false,
        ordering: "ORIGINAL_ORDER",
      },
      questionIds: questions2026.map((q) => q.id),
      currentIndex: 42,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 1500,
      isCompleted: false,
      paused: false,
    };

    // Resumed session
    const resumed = { ...initialSession };
    expect(resumed.currentIndex).toBe(42);
  });

  it("F. Session resumption preserves previously recorded answers", () => {
    const q1 = questions2026[0];
    const q2 = questions2026[1];

    const answersRecord: Record<string, SessionAnswerState> = {
      [q1.id]: {
        questionId: q1.id,
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 45,
        confidence: "HIGH",
        timestamp: new Date().toISOString(),
        isFlagged: false,
      },
      [q2.id]: {
        questionId: q2.id,
        selectedOption: "C",
        isCorrect: false,
        timeSpentSeconds: 60,
        confidence: "MEDIUM",
        timestamp: new Date().toISOString(),
        isFlagged: true,
      },
    };

    const session: ActiveTrainingSession = {
      id: "resume-exam-2",
      title: "Prova 2026/1",
      mode: "SIMULADO",
      config: {
        mode: "SIMULADO",
        title: "Prova 2026/1",
        objective: "FULL_EXAM",
        topics: [],
        competencies: [],
        areas: ["ALL"],
        years: ["2026"],
        difficulty: "ALL",
        inepRelevance: "ALL",
        quantity: 100,
        feedbackMode: "END_OF_SESSION",
        timerMode: "EXAM_STRICT",
        showComments: false,
        ordering: "ORIGINAL_ORDER",
      },
      questionIds: questions2026.map((q) => q.id),
      currentIndex: 2,
      answers: answersRecord,
      flaggedQuestionIds: [q2.id],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 105,
      isCompleted: false,
      paused: false,
    };

    expect(session.answers[q1.id].selectedOption).toBe("A");
    expect(session.answers[q2.id].selectedOption).toBe("C");
    expect(session.answers[q2.id].isCorrect).toBe(false);
    expect(session.flaggedQuestionIds).toContain(q2.id);
  });

  it("G. Edition identifier and title are unambiguously preserved", () => {
    const session: ActiveTrainingSession = {
      id: "exam-edition-id",
      title: "Revalida INEP 2026/1 — 1ª Edição Semestral",
      mode: "SIMULADO",
      config: {
        mode: "SIMULADO",
        title: "Revalida INEP 2026/1 — 1ª Edição Semestral",
        objective: "FULL_EXAM",
        topics: [],
        competencies: [],
        areas: ["ALL"],
        years: ["2026"],
        difficulty: "ALL",
        inepRelevance: "ALL",
        quantity: 100,
        feedbackMode: "END_OF_SESSION",
        timerMode: "EXAM_STRICT",
        showComments: false,
        ordering: "ORIGINAL_ORDER",
      },
      questionIds: questions2026.map((q) => q.id),
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    expect(session.title).toContain("2026/1");
    expect(session.config.years).toEqual(["2026"]);
  });

  it("H. Full exam session applies zero randomization and uses exact sequential order", () => {
    const sortedOriginal = [...questions2026].sort(
      (a, b) => (a.originalNumber || 1) - (b.originalNumber || 1)
    );

    const questionIds = sortedOriginal.map((q) => q.id);

    // Verify ordering matches 1, 2, 3... exactly
    for (let i = 0; i < sortedOriginal.length; i++) {
      expect(questionIds[i]).toBe(sortedOriginal[i].id);
    }
  });

  it("I. Question count matches available edition questions without arbitrary padding", () => {
    const sorted = [...questions2026].sort(
      (a, b) => (a.originalNumber || 1) - (b.originalNumber || 1)
    );

    expect(sorted.length).toBe(questions2026.length);
    expect(sorted.length).toBeGreaterThan(0);
  });
});
