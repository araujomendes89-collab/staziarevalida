import { describe, it, expect } from "vitest";
import {
  getQuestionTimingMetrics,
  isValidTiming,
  TIMING_VERSION_ACTIVE_MONOTONIC,
  TIMING_VERSION_IDLE_AWARE,
} from "../services/questionTimingService";
import { QuestionAttempt } from "../types";

describe("Question Timing Version Policy (Etapa 1.16J)", () => {
  it("Critical Test: 8 attempts v2 + 20 attempts v1 does NOT display timing metric (v2Count < 10)", () => {
    const attempts: QuestionAttempt[] = [
      // 8 v2 idle-aware attempts
      ...Array.from({ length: 8 }, (_, idx) => ({
        id: `v2-${idx}`,
        questionId: `qv2-${idx}`,
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "A" as const,
        isCorrect: true,
        timeSpentSeconds: 60,
        activeDurationMs: 60000,
        timingVersion: TIMING_VERSION_IDLE_AWARE,
        confidence: "HIGH" as const,
        mode: "STUDY" as const,
      })),
      // 20 v1 foreground attempts
      ...Array.from({ length: 20 }, (_, idx) => ({
        id: `v1-${idx}`,
        questionId: `qv1-${idx}`,
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "B" as const,
        isCorrect: true,
        timeSpentSeconds: 80,
        activeDurationMs: 80000,
        timingVersion: TIMING_VERSION_ACTIVE_MONOTONIC,
        confidence: "HIGH" as const,
        mode: "STUDY" as const,
      })),
    ];

    const metrics = getQuestionTimingMetrics(attempts);

    expect(metrics.totalAttempts).toBe(28);
    expect(metrics.v1Count).toBe(20);
    expect(metrics.v2Count).toBe(8);
    expect(metrics.countWithTiming).toBe(8); // Only v2 counts for primary metric
    expect(metrics.isTimingDisplayable).toBe(false); // Below threshold of 10
    expect(metrics.formattedMedian).toBe("1m00s");
  });

  it("Threshold Test: 10 attempts v2 enables display of rhythm metric based strictly on v2", () => {
    const attempts: QuestionAttempt[] = Array.from({ length: 10 }, (_, idx) => ({
      id: `v2-${idx}`,
      questionId: `qv2-${idx}`,
      timestamp: "2026-01-01T00:00:00Z",
      selectedOption: "A" as const,
      isCorrect: true,
      timeSpentSeconds: 50 + idx * 5,
      activeDurationMs: (50 + idx * 5) * 1000,
      timingVersion: TIMING_VERSION_IDLE_AWARE,
      confidence: "HIGH" as const,
      mode: "STUDY" as const,
    }));

    const metrics = getQuestionTimingMetrics(attempts);

    expect(metrics.v2Count).toBe(10);
    expect(metrics.countWithTiming).toBe(10);
    expect(metrics.isTimingDisplayable).toBe(true);
    // Median of [50, 55, 60, 65, 70, 75, 80, 85, 90, 95] -> (70 + 75)/2 = 72.5s -> 73s / 1m13s
    expect(metrics.formattedMedian).toBe("1m13s");
  });

  it("Contamination Prevention: v1 outlier values (20min, 30min, 40min) do NOT alter v2 median", () => {
    const attempts: QuestionAttempt[] = [
      // 3 extreme v1 foreground attempts
      {
        id: "v1-1",
        questionId: "qv1-1",
        timestamp: "2026-01-01",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 1200,
        activeDurationMs: 1200000, // 20 min
        timingVersion: TIMING_VERSION_ACTIVE_MONOTONIC,
        confidence: "HIGH",
        mode: "STUDY",
      },
      {
        id: "v1-2",
        questionId: "qv1-2",
        timestamp: "2026-01-01",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 1800,
        activeDurationMs: 1800000, // 30 min
        timingVersion: TIMING_VERSION_ACTIVE_MONOTONIC,
        confidence: "HIGH",
        mode: "STUDY",
      },
      {
        id: "v1-3",
        questionId: "qv1-3",
        timestamp: "2026-01-01",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 2400,
        activeDurationMs: 2400000, // 40 min
        timingVersion: TIMING_VERSION_ACTIVE_MONOTONIC,
        confidence: "HIGH",
        mode: "STUDY",
      },
      // 10 clean v2 idle-aware attempts: 60s, 70s, 80s, 90s, 100s, 110s, 120s, 130s, 140s, 150s
      ...[60, 70, 80, 90, 100, 110, 120, 130, 140, 150].map((s, idx) => ({
        id: `v2-${idx}`,
        questionId: `qv2-${idx}`,
        timestamp: "2026-01-01",
        selectedOption: "A" as const,
        isCorrect: true,
        timeSpentSeconds: s,
        activeDurationMs: s * 1000,
        timingVersion: TIMING_VERSION_IDLE_AWARE,
        confidence: "HIGH" as const,
        mode: "STUDY" as const,
      })),
    ];

    const metrics = getQuestionTimingMetrics(attempts);

    expect(metrics.v1Count).toBe(3);
    expect(metrics.v2Count).toBe(10);
    expect(metrics.countWithTiming).toBe(10);
    expect(metrics.isTimingDisplayable).toBe(true);

    // Median of [60, 70, 80, 90, 100, 110, 120, 130, 140, 150] is (100 + 110)/2 = 105s -> 1m45s
    expect(metrics.medianActiveDurationMs).toBe(105000);
    expect(metrics.formattedMedian).toBe("1m45s");

    // v1 median is independently accessible
    expect(metrics.v1MedianActiveDurationMs).toBe(1800000); // 30 min
  });

  it("Legacy and printable exam attempts are completely excluded from v2 metrics", () => {
    const mixed: QuestionAttempt[] = [
      {
        id: "leg-1",
        questionId: "ql1",
        timestamp: "2026-01-01",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 0,
        confidence: "MEDIUM",
        mode: "STUDY",
      },
      {
        id: "print-1",
        questionId: "qp1",
        timestamp: "2026-01-01",
        selectedOption: "B",
        isCorrect: true,
        timeSpentSeconds: 120,
        confidence: "HIGH",
        mode: "EXAM",
      },
    ];

    const metrics = getQuestionTimingMetrics(mixed);
    expect(metrics.totalAttempts).toBe(2);
    expect(metrics.countWithTiming).toBe(0);
    expect(metrics.v1Count).toBe(0);
    expect(metrics.v2Count).toBe(0);
    expect(metrics.isTimingDisplayable).toBe(false);
  });
});
