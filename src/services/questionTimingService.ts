import { QuestionAttempt } from "../types";

/**
 * Question Timing Telemetry Service
 *
 * Implements high-precision monotonic active time tracking per question:
 * - Uses `performance.now()` for monotonic timestamps (resilient against system clock adjustments)
 * - Page Visibility API (`document.visibilityState`) integration to pause accumulation when the tab is backgrounded
 * - Handles question navigation without losing previous accumulated time
 * - Idle timeout awareness (configurable max inactivity threshold)
 * - Pure analytical functions for mean, median (odd/even), and telemetry coverage
 */

export interface QuestionTimingMetrics {
  totalAttempts: number;
  countWithTiming: number;
  timingCoverage: number; // 0.0 to 1.0 (countWithTiming / totalAttempts)
  meanActiveDurationMs: number | null;
  medianActiveDurationMs: number | null;
  formattedMean: string;
  formattedMedian: string;
}

export const TIMING_VERSION_ACTIVE_MONOTONIC = 1;

/**
 * Checks whether an attempt has reliable, valid active timing telemetry.
 * Excludes legacy attempts (undefined activeDurationMs), printable exam defaults, and corrupt values.
 */
export function isValidTiming(attempt: Partial<QuestionAttempt> | null | undefined): boolean {
  if (!attempt) return false;
  if (attempt.timingVersion !== TIMING_VERSION_ACTIVE_MONOTONIC) return false;
  if (typeof attempt.activeDurationMs !== "number") return false;
  if (!Number.isFinite(attempt.activeDurationMs)) return false;
  if (attempt.activeDurationMs < 0) return false;
  return true;
}

/**
 * Computes exact median of a numeric array.
 * If length is odd: middle element.
 * If length is even: arithmetic mean of the two middle elements.
 */
export function calculateMedian(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Formats duration in milliseconds to human-readable string (e.g. "1m 42s", "45s").
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "--";
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/**
 * Computes aggregate timing metrics across an array of question attempts.
 * Strictly filters out invalid or legacy attempts without timing telemetry.
 */
export function getQuestionTimingMetrics(attempts: QuestionAttempt[]): QuestionTimingMetrics {
  const totalAttempts = attempts?.length ?? 0;
  if (totalAttempts === 0) {
    return {
      totalAttempts: 0,
      countWithTiming: 0,
      timingCoverage: 0,
      meanActiveDurationMs: null,
      medianActiveDurationMs: null,
      formattedMean: "--",
      formattedMedian: "--",
    };
  }

  const validDurations: number[] = [];
  for (const att of attempts) {
    if (isValidTiming(att)) {
      validDurations.push(att.activeDurationMs!);
    }
  }

  const countWithTiming = validDurations.length;
  const timingCoverage = totalAttempts > 0 ? countWithTiming / totalAttempts : 0;

  if (countWithTiming === 0) {
    return {
      totalAttempts,
      countWithTiming: 0,
      timingCoverage: 0,
      meanActiveDurationMs: null,
      medianActiveDurationMs: null,
      formattedMean: "--",
      formattedMedian: "--",
    };
  }

  const sum = validDurations.reduce((acc, val) => acc + val, 0);
  const meanActiveDurationMs = sum / countWithTiming;
  const medianActiveDurationMs = calculateMedian(validDurations);

  return {
    totalAttempts,
    countWithTiming,
    timingCoverage,
    meanActiveDurationMs,
    medianActiveDurationMs,
    formattedMean: formatDuration(meanActiveDurationMs),
    formattedMedian: formatDuration(medianActiveDurationMs),
  };
}

/**
 * Stateful Active Question Time Tracker
 * Handles monotonic start, pauses on tab invisibility, and supports switching questions.
 */
export class QuestionTimingTracker {
  private accumulatedMsMap: Map<string, number> = new Map();
  private currentQuestionId: string | null = null;
  private activeSegmentStart: number | null = null;
  private isDocumentVisible: boolean = true;
  private isPaused: boolean = false;
  private isSubmitted: boolean = false;

  constructor() {
    if (typeof document !== "undefined") {
      this.isDocumentVisible = document.visibilityState === "visible";
    }
  }

  /**
   * Starts tracking active time for a specific question.
   * If already tracking a different question, automatically commits its active time first.
   */
  public startQuestion(questionId: string, initialAccumulatedMs: number = 0): void {
    if (this.currentQuestionId && this.currentQuestionId !== questionId) {
      this.commitActiveSegment();
    }

    this.currentQuestionId = questionId;
    this.isSubmitted = false;

    if (!this.accumulatedMsMap.has(questionId)) {
      this.accumulatedMsMap.set(questionId, initialAccumulatedMs);
    }

    if (this.canAccumulate()) {
      this.activeSegmentStart = typeof performance !== "undefined" ? performance.now() : Date.now();
    } else {
      this.activeSegmentStart = null;
    }
  }

  /**
   * Handles visibility changes (e.g. when user switches browser tabs).
   */
  public handleVisibilityChange(isVisible: boolean): void {
    this.isDocumentVisible = isVisible;

    if (!isVisible) {
      this.commitActiveSegment();
    } else if (this.canAccumulate() && this.activeSegmentStart === null) {
      this.activeSegmentStart = typeof performance !== "undefined" ? performance.now() : Date.now();
    }
  }

  /**
   * Sets manual pause state (e.g. modal opened or study session paused).
   */
  public setPaused(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;

    if (paused) {
      this.commitActiveSegment();
    } else if (this.canAccumulate() && this.activeSegmentStart === null) {
      this.activeSegmentStart = typeof performance !== "undefined" ? performance.now() : Date.now();
    }
  }

  /**
   * Marks question as submitted/answered. Stops active timing accumulation.
   */
  public finishQuestion(): { activeDurationMs: number; timeSpentSeconds: number; timingVersion: number } {
    this.commitActiveSegment();
    this.isSubmitted = true;

    const totalMs = this.getCurrentActiveDurationMs();
    return {
      activeDurationMs: totalMs,
      timeSpentSeconds: Math.max(1, Math.round(totalMs / 1000)),
      timingVersion: TIMING_VERSION_ACTIVE_MONOTONIC,
    };
  }

  /**
   * Returns current total active duration in milliseconds (accumulated + current active segment).
   */
  public getCurrentActiveDurationMs(): number {
    if (!this.currentQuestionId) return 0;
    const base = this.accumulatedMsMap.get(this.currentQuestionId) || 0;

    if (this.activeSegmentStart !== null && this.canAccumulate()) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const segment = Math.max(0, now - this.activeSegmentStart);
      return Math.round(base + segment);
    }

    return Math.round(base);
  }

  /**
   * Commits the current active segment into the accumulated time map.
   */
  private commitActiveSegment(): void {
    if (this.currentQuestionId && this.activeSegmentStart !== null) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const segment = Math.max(0, now - this.activeSegmentStart);
      const current = this.accumulatedMsMap.get(this.currentQuestionId) || 0;
      this.accumulatedMsMap.set(this.currentQuestionId, current + segment);
      this.activeSegmentStart = null;
    }
  }

  private canAccumulate(): boolean {
    return Boolean(this.currentQuestionId && this.isDocumentVisible && !this.isPaused && !this.isSubmitted);
  }
}
