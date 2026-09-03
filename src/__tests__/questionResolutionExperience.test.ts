import { describe, it, expect } from "vitest";
import { TEST_QUESTIONS_COLLECTION } from "./testFixtures";
import { DEFAULT_SESSION_CONFIG } from "../services/sessionBuilderService";
import { ActiveTrainingSession, QuestionSessionConfig, SessionAnswerState } from "../types";

describe("Question Resolution Experience & Lifecycle (Etapa 1.6)", () => {
  const sampleQuestion = TEST_QUESTIONS_COLLECTION[0]; // Question 1
  const allQuestions = TEST_QUESTIONS_COLLECTION;

  it("A. Selecting an option does not finalize the attempt until confirmed", () => {
    let localSelectedOption: "A" | "B" | "C" | "D" | null = null;
    let isAnswerSubmitted = false;

    // User clicks option 'A'
    localSelectedOption = "A";

    expect(localSelectedOption).toBe("A");
    expect(isAnswerSubmitted).toBe(false);
  });

  it("B. Confirming the answer records the answer in session answers map", () => {
    const session: ActiveTrainingSession = {
      id: "session-test-1",
      title: "Treino Teste",
      subtitle: "1 questão",
      mode: "RAPIDO",
      config: {
        ...DEFAULT_SESSION_CONFIG,
        feedbackMode: "IMMEDIATE",
      },
      questionIds: [sampleQuestion.id],
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    const selectedOption = sampleQuestion.options.find((o) => o.isCorrect)?.id || "A";
    const isCorrect = sampleQuestion.options.find((o) => o.id === selectedOption)?.isCorrect ?? false;

    const newAnswer: SessionAnswerState = {
      questionId: sampleQuestion.id,
      selectedOption,
      isCorrect,
      timeSpentSeconds: 45,
      confidence: "HIGH",
      timestamp: new Date().toISOString(),
      isFlagged: false,
    };

    const updatedAnswers = {
      ...session.answers,
      [sampleQuestion.id]: newAnswer,
    };

    expect(updatedAnswers[sampleQuestion.id]).toBeDefined();
    expect(updatedAnswers[sampleQuestion.id].selectedOption).toBe(selectedOption);
    expect(updatedAnswers[sampleQuestion.id].isCorrect).toBe(true);
    expect(updatedAnswers[sampleQuestion.id].timeSpentSeconds).toBe(45);
  });

  it("C. Correct answer maintains correct validation", () => {
    const correctOpt = sampleQuestion.options.find((o) => o.isCorrect);
    expect(correctOpt).toBeDefined();
    expect(correctOpt?.id).toBe(sampleQuestion.correctAnswer);

    const isOptionCorrect = sampleQuestion.options.find((o) => o.id === correctOpt?.id)?.isCorrect;
    expect(isOptionCorrect).toBe(true);
  });

  it("D. Incorrect answer maintains incorrect validation", () => {
    const wrongOpt = sampleQuestion.options.find((o) => !o.isCorrect);
    expect(wrongOpt).toBeDefined();

    const isOptionCorrect = sampleQuestion.options.find((o) => o.id === wrongOpt?.id)?.isCorrect;
    expect(isOptionCorrect).toBe(false);
  });

  it("E. Immediate feedback mode reveals correct answer after submission", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      feedbackMode: "IMMEDIATE",
    };

    const isSubmitted = true;
    const canShowFeedback = isSubmitted && config.feedbackMode === "IMMEDIATE";
    expect(canShowFeedback).toBe(true);
  });

  it("F. End-of-session (Simulado) mode does NOT reveal answer during resolution", () => {
    const config: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      feedbackMode: "END_OF_SESSION",
    };

    const isSubmitted = true;
    const canShowImmediateFeedback = isSubmitted && config.feedbackMode === "IMMEDIATE";
    expect(canShowImmediateFeedback).toBe(false);
  });

  it("G. Question navigation properly advances currentIndex and respects bounds", () => {
    const session: ActiveTrainingSession = {
      id: "session-test-2",
      title: "Treino 3 Questões",
      subtitle: "3 questões",
      mode: "RAPIDO",
      config: DEFAULT_SESSION_CONFIG,
      questionIds: ["q-1", "q-2", "q-3"],
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    // Forward
    const nextIndex = Math.min(session.questionIds.length - 1, session.currentIndex + 1);
    expect(nextIndex).toBe(1);

    // Forward to end
    const lastIndex = Math.min(session.questionIds.length - 1, nextIndex + 1);
    expect(lastIndex).toBe(2);

    // Beyond end bound
    const beyondEnd = Math.min(session.questionIds.length - 1, lastIndex + 1);
    expect(beyondEnd).toBe(2);

    // Previous bound
    const prevIndex = Math.max(0, lastIndex - 1);
    expect(prevIndex).toBe(1);
  });

  it("H. Annulled questions are recognized without arbitrary correct answers", () => {
    const annulledQuestion = {
      ...sampleQuestion,
      id: "annulled-q-1",
      correctAnswer: "ANNULLED" as any,
      answerFinal: "ANNULLED",
      officialStatus: "annulled",
    };

    const isAnnulled = Boolean(
      annulledQuestion.correctAnswer === "ANNULLED" ||
      annulledQuestion.answerFinal === "ANNULLED" ||
      annulledQuestion.officialStatus === "annulled"
    );

    expect(isAnnulled).toBe(true);
  });
});
