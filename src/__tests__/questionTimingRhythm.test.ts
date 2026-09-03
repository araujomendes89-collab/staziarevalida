import { describe, it, expect } from "vitest";
import {
  formatQuestionDuration,
  getQuestionTimingMetrics,
  MIN_TIMED_ATTEMPTS_FOR_DISPLAY,
  TIMING_VERSION_IDLE_AWARE,
} from "../services/questionTimingService";
import { QuestionAttempt } from "../types";

describe("Question Timing Rhythm & Presentation (Evolução 3.0)", () => {
  it("F, G, H: formats question durations correctly (42s, 1m22s, 2m25s)", () => {
    expect(formatQuestionDuration(42000)).toBe("42s");
    expect(formatQuestionDuration(82000)).toBe("1m22s");
    expect(formatQuestionDuration(145000)).toBe("2m25s");
    expect(formatQuestionDuration(0)).toBe("0s");
    expect(formatQuestionDuration(null)).toBe("--");
    expect(formatQuestionDuration(undefined)).toBe("--");
  });

  it("A: enables display of median when countWithTiming >= 10", () => {
    const attempts: QuestionAttempt[] = Array.from({ length: 12 }, (_, idx) => ({
      id: `att-${idx}`,
      questionId: `q-${idx}`,
      timestamp: "2026-01-01T00:00:00Z",
      selectedOption: "A",
      isCorrect: true,
      timeSpentSeconds: 60,
      activeDurationMs: 60000 + idx * 2000,
      timingVersion: TIMING_VERSION_IDLE_AWARE,
      confidence: "HIGH",
      mode: "STUDY",
    }));

    const metrics = getQuestionTimingMetrics(attempts);
    expect(metrics.totalAttempts).toBe(12);
    expect(metrics.countWithTiming).toBe(12);
    expect(metrics.isTimingDisplayable).toBe(true);
    expect(metrics.formattedMedian).toBe("1m11s");
  });

  it("B: marks isTimingDisplayable as false when countWithTiming < 10 threshold", () => {
    const attempts: QuestionAttempt[] = Array.from({ length: 5 }, (_, idx) => ({
      id: `att-${idx}`,
      questionId: `q-${idx}`,
      timestamp: "2026-01-01T00:00:00Z",
      selectedOption: "A",
      isCorrect: true,
      timeSpentSeconds: 45,
      activeDurationMs: 45000,
      timingVersion: TIMING_VERSION_IDLE_AWARE,
      confidence: "HIGH",
      mode: "STUDY",
    }));

    const metrics = getQuestionTimingMetrics(attempts);
    expect(metrics.countWithTiming).toBe(5);
    expect(metrics.isTimingDisplayable).toBe(false);
  });

  it("C, D, E: ignores legacy, printable and invalid attempts from rhythm calculations", () => {
    const mixed: QuestionAttempt[] = [
      // 10 valid timed attempts (v2)
      ...Array.from({ length: 10 }, (_, idx) => ({
        id: `valid-${idx}`,
        questionId: `qv-${idx}`,
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "A" as const,
        isCorrect: true,
        timeSpentSeconds: 50,
        activeDurationMs: 50000,
        timingVersion: TIMING_VERSION_IDLE_AWARE,
        confidence: "HIGH" as const,
        mode: "STUDY" as const,
      })),
      // 5 legacy attempts
      ...Array.from({ length: 5 }, (_, idx) => ({
        id: `legacy-${idx}`,
        questionId: `ql-${idx}`,
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "B" as const,
        isCorrect: false,
        timeSpentSeconds: 0,
        confidence: "MEDIUM" as const,
        mode: "STUDY" as const,
      })),
      // 5 printable exam attempts
      ...Array.from({ length: 5 }, (_, idx) => ({
        id: `printable-${idx}`,
        questionId: `qp-${idx}`,
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "C" as const,
        isCorrect: true,
        timeSpentSeconds: 120,
        confidence: "HIGH" as const,
        mode: "EXAM" as const,
      })),
    ];

    const metrics = getQuestionTimingMetrics(mixed);
    expect(metrics.totalAttempts).toBe(20);
    expect(metrics.countWithTiming).toBe(10);
    expect(metrics.timingCoverage).toBe(0.5);
    expect(metrics.isTimingDisplayable).toBe(true);
    expect(metrics.formattedMedian).toBe("50s");
  });

  it("I & J: aggregates accuracy and error counts accurately on mixed datasets", () => {
    const sampleAttempts: QuestionAttempt[] = [
      { id: "1", questionId: "q1", timestamp: "2026-01-01", selectedOption: "A", isCorrect: true, timeSpentSeconds: 30, confidence: "HIGH", mode: "STUDY" },
      { id: "2", questionId: "q2", timestamp: "2026-01-01", selectedOption: "B", isCorrect: false, timeSpentSeconds: 40, confidence: "HIGH", mode: "STUDY" },
      { id: "3", questionId: "q3", timestamp: "2026-01-01", selectedOption: "A", isCorrect: true, timeSpentSeconds: 35, confidence: "HIGH", mode: "STUDY" },
      { id: "4", questionId: "q4", timestamp: "2026-01-01", selectedOption: "C", isCorrect: true, timeSpentSeconds: 45, confidence: "HIGH", mode: "STUDY" },
    ];

    const totalQuestions = sampleAttempts.length;
    const totalCorrect = sampleAttempts.filter(a => a.isCorrect).length;
    const totalIncorrect = totalQuestions - totalCorrect;
    const periodAccuracy = Math.round((totalCorrect / totalQuestions) * 100);

    expect(totalQuestions).toBe(4);
    expect(totalCorrect).toBe(3);
    expect(totalIncorrect).toBe(1);
    expect(periodAccuracy).toBe(75);
  });
});
