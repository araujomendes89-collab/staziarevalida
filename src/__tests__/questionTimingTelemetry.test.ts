import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  QuestionTimingTracker,
  getQuestionTimingMetrics,
  calculateMedian,
  formatDuration,
  isValidTiming,
  TIMING_VERSION_ACTIVE_MONOTONIC,
  TIMING_VERSION_IDLE_AWARE,
} from "../services/questionTimingService";
import { QuestionAttempt } from "../types";

describe("Question Timing Telemetry - QuestionTimingTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("A: tracks active time when tab is visible", () => {
    const tracker = new QuestionTimingTracker();
    tracker.startQuestion("q-01", 0);

    vi.advanceTimersByTime(5000); // 5 seconds

    const duration = tracker.getCurrentActiveDurationMs();
    expect(duration).toBe(5000);
  });

  it("B & C: pauses accumulation when visibilityState is hidden and resumes when visible", () => {
    const tracker = new QuestionTimingTracker();
    tracker.startQuestion("q-01", 0);

    // Active for 3 seconds
    vi.advanceTimersByTime(3000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(3000);

    // Tab hidden (user leaves tab for 10 seconds)
    tracker.handleVisibilityChange(false);
    vi.advanceTimersByTime(10000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(3000); // Must NOT accumulate background time

    // Tab visible again (user returns and spends 4 more seconds)
    tracker.handleVisibilityChange(true);
    vi.advanceTimersByTime(4000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(7000); // 3000 + 4000
  });

  it("D: preserves accumulated time when navigating between questions in a session", () => {
    const tracker = new QuestionTimingTracker();

    // Start on q-01 for 4 seconds
    tracker.startQuestion("q-01", 0);
    vi.advanceTimersByTime(4000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(4000);

    // Switch to q-02 for 6 seconds
    tracker.startQuestion("q-02", 0);
    vi.advanceTimersByTime(6000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(6000);

    // Switch back to q-01 and spend 3 more seconds
    tracker.startQuestion("q-01");
    vi.advanceTimersByTime(3000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(7000); // 4000 + 3000
  });

  it("E: finishes question, returns versioned payload, and stops further accumulation", () => {
    const tracker = new QuestionTimingTracker();
    tracker.startQuestion("q-01", 0);

    vi.advanceTimersByTime(45000); // 45 seconds

    const result = tracker.finishQuestion();
    expect(result.activeDurationMs).toBe(45000);
    expect(result.timeSpentSeconds).toBe(45);
    expect(result.timingVersion).toBe(TIMING_VERSION_IDLE_AWARE);

    // Advancing timers after finish should NOT increase active time
    vi.advanceTimersByTime(10000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(45000);
  });
});

describe("Question Timing Telemetry - Metrics & Analytical Calculations", () => {
  it("F & M: legacy attempts without timing telemetry are NOT coerced to zero and do not pollute metrics", () => {
    const legacyAttempts: QuestionAttempt[] = [
      {
        id: "att-1",
        questionId: "q-1",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 0,
        confidence: "MEDIUM",
        mode: "STUDY",
      },
      {
        id: "att-2",
        questionId: "q-2",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "B",
        isCorrect: false,
        timeSpentSeconds: 60,
        // no activeDurationMs, no timingVersion
        confidence: "HIGH",
        mode: "STUDY",
      },
    ];

    const metrics = getQuestionTimingMetrics(legacyAttempts);
    expect(metrics.totalAttempts).toBe(2);
    expect(metrics.countWithTiming).toBe(0);
    expect(metrics.timingCoverage).toBe(0);
    expect(metrics.meanActiveDurationMs).toBeNull();
    expect(metrics.medianActiveDurationMs).toBeNull();
    expect(metrics.formattedMean).toBe("--");
    expect(metrics.formattedMedian).toBe("--");
  });

  it("G & H: invalid timing values (negative, NaN, Infinity) are safely rejected", () => {
    expect(isValidTiming({ activeDurationMs: -500, timingVersion: 1 } as any)).toBe(false);
    expect(isValidTiming({ activeDurationMs: NaN, timingVersion: 1 } as any)).toBe(false);
    expect(isValidTiming({ activeDurationMs: Infinity, timingVersion: 1 } as any)).toBe(false);
    expect(isValidTiming({ activeDurationMs: 5000, timingVersion: undefined } as any)).toBe(false);
    expect(isValidTiming(null)).toBe(false);
  });

  it("I: computes arithmetic mean correctly for valid telemetry attempts", () => {
    const attempts: QuestionAttempt[] = [
      {
        id: "att-1",
        questionId: "q-1",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 30,
        activeDurationMs: 30000,
        timingVersion: 1,
        confidence: "HIGH",
        mode: "STUDY",
      },
      {
        id: "att-2",
        questionId: "q-2",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "B",
        isCorrect: true,
        timeSpentSeconds: 90,
        activeDurationMs: 90000,
        timingVersion: 1,
        confidence: "HIGH",
        mode: "STUDY",
      },
    ];

    const metrics = getQuestionTimingMetrics(attempts);
    expect(metrics.countWithTiming).toBe(2);
    expect(metrics.meanActiveDurationMs).toBe(60000); // (30s + 90s)/2 = 60s
    expect(metrics.formattedMean).toBe("1m00s");
  });

  it("J: computes median correctly for odd number of items", () => {
    // 30s, 60s, 120s -> median = 60s
    const values = [120000, 30000, 60000];
    const median = calculateMedian(values);
    expect(median).toBe(60000);
    expect(formatDuration(median)).toBe("1m00s");
  });

  it("K: computes median correctly for even number of items", () => {
    // 30s, 50s, 70s, 120s -> median = (50s + 70s)/2 = 60s
    const values = [70000, 30000, 120000, 50000];
    const median = calculateMedian(values);
    expect(median).toBe(60000);
  });

  it("L: computes timing coverage correctly", () => {
    const mixedAttempts: QuestionAttempt[] = [
      // 2 with valid telemetry
      {
        id: "att-1",
        questionId: "q-1",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 40,
        activeDurationMs: 40000,
        timingVersion: 1,
        confidence: "HIGH",
        mode: "STUDY",
      },
      {
        id: "att-2",
        questionId: "q-2",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "B",
        isCorrect: true,
        timeSpentSeconds: 50,
        activeDurationMs: 50000,
        timingVersion: 1,
        confidence: "HIGH",
        mode: "STUDY",
      },
      // 2 legacy attempts without telemetry
      {
        id: "att-3",
        questionId: "q-3",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "C",
        isCorrect: false,
        timeSpentSeconds: 0,
        confidence: "LOW",
        mode: "STUDY",
      },
      {
        id: "att-4",
        questionId: "q-4",
        timestamp: "2026-01-01T00:00:00Z",
        selectedOption: "D",
        isCorrect: false,
        timeSpentSeconds: 120, // printable exam default without timingVersion: 1
        confidence: "LOW",
        mode: "EXAM",
      },
    ];

    const metrics = getQuestionTimingMetrics(mixedAttempts);
    expect(metrics.totalAttempts).toBe(4);
    expect(metrics.countWithTiming).toBe(2);
    expect(metrics.timingCoverage).toBe(0.5); // 50%
    expect(metrics.medianActiveDurationMs).toBe(45000); // (40s + 50s)/2
    expect(metrics.formattedMedian).toBe("45s");
  });
});
