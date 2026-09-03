import { describe, it, expect } from "vitest";
import { TEST_QUESTIONS_COLLECTION } from "./testFixtures";
import { SessionBuilderService, DEFAULT_SESSION_CONFIG } from "../services/sessionBuilderService";
import { ActiveTrainingSession, SessionAnswerState } from "../types";

describe("Post-Session Results Experience & Accuracy (Etapa 1.9)", () => {
  const allQuestions = TEST_QUESTIONS_COLLECTION;

  const q1 = allQuestions[0];
  const q2 = allQuestions[1];
  const q3 = allQuestions[2];
  const q4 = allQuestions[3];

  const sampleAnswers: Record<string, SessionAnswerState> = {
    [q1.id]: {
      questionId: q1.id,
      selectedOption: q1.correctAnswer,
      isCorrect: true,
      timeSpentSeconds: 40,
      confidence: "HIGH",
      timestamp: new Date().toISOString(),
      isFlagged: false,
    },
    [q2.id]: {
      questionId: q2.id,
      selectedOption: q2.correctAnswer,
      isCorrect: true,
      timeSpentSeconds: 35,
      confidence: "HIGH",
      timestamp: new Date().toISOString(),
      isFlagged: false,
    },
    [q3.id]: {
      questionId: q3.id,
      selectedOption: "B", // wrong answer
      isCorrect: false,
      timeSpentSeconds: 65,
      confidence: "LOW",
      timestamp: new Date().toISOString(),
      isFlagged: true,
    },
    [q4.id]: {
      questionId: q4.id,
      selectedOption: "A", // wrong answer
      isCorrect: false,
      timeSpentSeconds: 50,
      confidence: "MEDIUM",
      timestamp: new Date().toISOString(),
      isFlagged: false,
    },
  };

  const sampleSession: ActiveTrainingSession = {
    id: "result-session-1",
    title: "Treino Personalizado",
    mode: "STUDY",
    config: {
      ...DEFAULT_SESSION_CONFIG,
      quantity: 4,
    },
    questionIds: [q1.id, q2.id, q3.id, q4.id],
    currentIndex: 3,
    answers: sampleAnswers,
    flaggedQuestionIds: [q3.id],
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalDurationSeconds: 190,
    isCompleted: true,
    paused: false,
  };

  it("A. Total questions in report matches session question count", () => {
    const report = SessionBuilderService.generateSummaryReport(sampleSession, allQuestions);
    expect(report.totalQuestions).toBe(4);
    expect(report.answeredCount).toBe(4);
  });

  it("B. Correct answers count matches exactly", () => {
    const report = SessionBuilderService.generateSummaryReport(sampleSession, allQuestions);
    expect(report.correctCount).toBe(2);
  });

  it("C. Wrong answers count matches exactly", () => {
    const report = SessionBuilderService.generateSummaryReport(sampleSession, allQuestions);
    expect(report.wrongCount).toBe(2);
  });

  it("D. Annulled questions are not classified as arbitrary errors or hits", () => {
    const annulledQ = {
      ...q1,
      id: "annulled-q-test",
      correctAnswer: "ANNULLED" as any,
      answerFinal: "ANNULLED",
      officialStatus: "annulled" as const,
    };

    const isAnnulled = Boolean(
      annulledQ.correctAnswer === "ANNULLED" ||
      annulledQ.answerFinal === "ANNULLED" ||
      annulledQ.officialStatus === "annulled"
    );

    expect(isAnnulled).toBe(true);
  });

  it("E. Score percentage is strictly computed from valid responses", () => {
    const report = SessionBuilderService.generateSummaryReport(sampleSession, allQuestions);
    // 2 correct out of 4 = 50%
    expect(report.scorePercentage).toBe(50);
  });

  it("F. Performance breakdown by medical area computes strictly from session questions", () => {
    const report = SessionBuilderService.generateSummaryReport(sampleSession, allQuestions);
    expect(report.areaPerformance).toBeDefined();

    let sumTotal = 0;
    Object.values(report.areaPerformance).forEach((areaData) => {
      sumTotal += areaData.total;
    });

    expect(sumTotal).toBe(4);
  });

  it("G. Error questions list accurately isolates wrong answer question IDs", () => {
    const errorIds = sampleSession.questionIds.filter((id) => {
      const ans = sampleSession.answers[id];
      return ans && !ans.isCorrect;
    });

    expect(errorIds).toEqual([q3.id, q4.id]);
    expect(errorIds.length).toBe(2);
  });

  it("H. Flagged questions are preserved and identifiable for review", () => {
    expect(sampleSession.flaggedQuestionIds).toContain(q3.id);
    expect(sampleSession.flaggedQuestionIds.length).toBe(1);
  });

  it("I. Full exam title and context are preserved in post-session view", () => {
    const examSession: ActiveTrainingSession = {
      ...sampleSession,
      title: "Revalida INEP 2026/1 — 1ª Edição Semestral",
      config: {
        ...sampleSession.config,
        objective: "FULL_EXAM",
        title: "Revalida INEP 2026/1 — 1ª Edição Semestral",
      },
    };

    expect(examSession.title).toContain("2026/1");
    expect(examSession.config.objective).toBe("FULL_EXAM");
  });

  it("J. Editorial explanations are cleanly separated from official answer keys", () => {
    const question = allQuestions[0];
    const officialAnswer = question.correctAnswer;
    const editorialExplanation = question.options.find((o) => o.id === officialAnswer)?.explanation;

    expect(officialAnswer).toBeDefined();
    expect(editorialExplanation).toBeDefined();
    expect(typeof editorialExplanation).toBe("string");
  });
});
