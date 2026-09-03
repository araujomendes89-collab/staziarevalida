import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  QuestionTimingTracker,
  getQuestionTimingMetrics,
  isValidTiming,
  QUESTION_IDLE_TIMEOUT_MS,
  TIMING_VERSION_ACTIVE_MONOTONIC,
  TIMING_VERSION_IDLE_AWARE,
} from "../services/questionTimingService";
import { QuestionAttempt } from "../types";

describe("Question Timing Telemetry - Idle-Aware Tracking (v2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("A: counts active time normally when user has continuous activity", () => {
    const tracker = new QuestionTimingTracker(QUESTION_IDLE_TIMEOUT_MS);
    tracker.startQuestion("q-01", 0);

    // Active for 60 seconds with user activity every 10s
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(10000);
      tracker.recordActivity();
    }

    expect(tracker.getCurrentActiveDurationMs()).toBe(60000);
  });

  it("B & C: triggers idle after 5 minutes of inactivity and caps time at lastActivityAt", () => {
    const tracker = new QuestionTimingTracker(QUESTION_IDLE_TIMEOUT_MS); // 300,000 ms
    tracker.startQuestion("q-01", 0);

    // User is active for first 30 seconds
    vi.advanceTimersByTime(30000);
    tracker.recordActivity();

    // User abandons tab visible for 20 minutes (1,200,000 ms)
    vi.advanceTimersByTime(1200000);

    // The duration must be capped at 30 seconds (lastActivityAt), NOT 30s + 20min
    const duration = tracker.getCurrentActiveDurationMs();
    expect(duration).toBe(30000);

    // Advancing 10 more minutes in idle state does NOT accumulate time
    vi.advanceTimersByTime(600000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(30000);
  });

  it("D: resumes active timing when user interaction occurs after idle state", () => {
    const tracker = new QuestionTimingTracker(QUESTION_IDLE_TIMEOUT_MS);
    tracker.startQuestion("q-01", 0);

    // Active for 40 seconds
    vi.advanceTimersByTime(40000);
    tracker.recordActivity();

    // Idle for 10 minutes
    vi.advanceTimersByTime(600000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(40000);

    // User returns and interacts (e.g. clicks or touches screen)
    tracker.recordActivity();

    // Spends 20 more seconds solving
    vi.advanceTimersByTime(20000);
    tracker.recordActivity();

    // Total = 40s (pre-idle) + 20s (post-idle) = 60s
    expect(tracker.getCurrentActiveDurationMs()).toBe(60000);
  });

  it("E & F: background tab pause takes priority and does not duplicate pause with idle", () => {
    const tracker = new QuestionTimingTracker(QUESTION_IDLE_TIMEOUT_MS);
    tracker.startQuestion("q-01", 0);

    // 15 seconds active
    vi.advanceTimersByTime(15000);
    tracker.recordActivity();

    // User switches tab (hidden) for 15 minutes
    tracker.handleVisibilityChange(false);
    vi.advanceTimersByTime(900000);
    expect(tracker.getCurrentActiveDurationMs()).toBe(15000);

    // User returns to tab
    tracker.handleVisibilityChange(true);
    vi.advanceTimersByTime(10000);
    tracker.recordActivity();

    expect(tracker.getCurrentActiveDurationMs()).toBe(25000); // 15s + 10s
  });

  it("G: finishQuestion correctly commits active duration and returns timingVersion = 2", () => {
    const tracker = new QuestionTimingTracker(QUESTION_IDLE_TIMEOUT_MS);
    tracker.startQuestion("q-01", 0);

    vi.advanceTimersByTime(45000);
    tracker.recordActivity();

    const result = tracker.finishQuestion();
    expect(result.activeDurationMs).toBe(45000);
    expect(result.timeSpentSeconds).toBe(45);
    expect(result.timingVersion).toBe(TIMING_VERSION_IDLE_AWARE);
  });

  it("H & J: navigating between questions isolates timing and preserves accumulated state", () => {
    const tracker = new QuestionTimingTracker(QUESTION_IDLE_TIMEOUT_MS);

    // Question 1: 30s
    tracker.startQuestion("q-01", 0);
    vi.advanceTimersByTime(30000);
    tracker.recordActivity();

    // Question 2: 50s
    tracker.startQuestion("q-02", 0);
    vi.advanceTimersByTime(50000);
    tracker.recordActivity();
    expect(tracker.getCurrentActiveDurationMs()).toBe(50000);

    // Switch back to Question 1: 15s
    tracker.startQuestion("q-01");
    vi.advanceTimersByTime(15000);
    tracker.recordActivity();

    expect(tracker.getCurrentActiveDurationMs()).toBe(45000); // 30s + 15s
  });
});

describe("Question Timing Telemetry - Multi-Version Analytics Compatibility", () => {
  it("K: getQuestionTimingMetrics supports both v1 and v2 attempts simultaneously", () => {
    const mixedAttempts: QuestionAttempt[] = [
      // v2 idle-aware attempt
      {
        id: "att-v2-1",
        questionId: "q1",
        timestamp: "2026-01-01",
        selectedOption: "A",
        isCorrect: true,
        timeSpentSeconds: 40,
        activeDurationMs: 40000,
        timingVersion: TIMING_VERSION_IDLE_AWARE,
        confidence: "HIGH",
        mode: "STUDY",
      },
      // v1 foreground attempt
      {
        id: "att-v1-1",
        questionId: "q2",
        timestamp: "2026-01-01",
        selectedOption: "B",
        isCorrect: true,
        timeSpentSeconds: 60,
        activeDurationMs: 60000,
        timingVersion: TIMING_VERSION_ACTIVE_MONOTONIC,
        confidence: "HIGH",
        mode: "STUDY",
      },
      // legacy attempt without timingVersion
      {
        id: "att-leg-1",
        questionId: "q3",
        timestamp: "2026-01-01",
        selectedOption: "C",
        isCorrect: false,
        timeSpentSeconds: 0,
        confidence: "LOW",
        mode: "STUDY",
      },
    ];

    const metrics = getQuestionTimingMetrics(mixedAttempts);
    expect(metrics.totalAttempts).toBe(3);
    expect(metrics.countWithTiming).toBe(2);
    expect(metrics.medianActiveDurationMs).toBe(50000); // (40s + 60s)/2
    expect(metrics.formattedMedian).toBe("50s");
  });

  it("L: printable attempts and invalid values are safely ignored", () => {
    const printableAttempt: QuestionAttempt = {
      id: "att-print",
      questionId: "qp",
      timestamp: "2026-01-01",
      selectedOption: "A",
      isCorrect: true,
      timeSpentSeconds: 120, // default
      confidence: "HIGH",
      mode: "EXAM",
    };

    expect(isValidTiming(printableAttempt)).toBe(false);
  });
});
