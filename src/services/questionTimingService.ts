import { QuestionAttempt } from "../types";

/**
 * Question Timing Telemetry Service (Idle-Aware 2.0)
 *
 * Implements high-precision active time tracking per question:
 * - Uses `performance.now()` for monotonic timestamps (resilient against system clock adjustments)
 * - Page Visibility API (`document.visibilityState`) integration to pause accumulation when the tab is backgrounded
 * - Idle detection with `QUESTION_IDLE_TIMEOUT_MS`: after 5 minutes without user activity (pointer/keyboard/touch/scroll),
 *   pauses active accumulation and caps the active segment at the instant of last activity (`lastActivityAt`).
 * - Pure analytical functions for mean, median (odd/even), and telemetry coverage.
 * - Multi-version analytical compatibility (v1 = foreground only, v2 = idle-aware active time).
 */

export const MIN_TIMED_ATTEMPTS_FOR_DISPLAY = 10;
export const QUESTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes operational timeout

export const TIMING_VERSION_ACTIVE_MONOTONIC = 1;
export const TIMING_VERSION_IDLE_AWARE = 2;
export const CURRENT_TIMING_VERSION = TIMING_VERSION_IDLE_AWARE;

export interface QuestionTimingMetrics {
  totalAttempts: number;
  countWithTiming: number;
  timingCoverage: number; // 0.0 to 1.0 (countWithTiming / totalAttempts)
  meanActiveDurationMs: number | null;
  medianActiveDurationMs: number | null;
  formattedMean: string;
  formattedMedian: string;
  isTimingDisplayable: boolean; // countWithTiming >= MIN_TIMED_ATTEMPTS_FOR_DISPLAY
}

/**
 * Checks whether an attempt has reliable, valid active timing telemetry.
 * Excludes legacy attempts (undefined activeDurationMs), printable exam defaults, and corrupt values.
 * By default supports valid version 1 (foreground) and version 2 (idle-aware).
 */
export function isValidTiming(
  attempt: Partial<QuestionAttempt> | null | undefined,
  allowedVersions: number[] = [TIMING_VERSION_ACTIVE_MONOTONIC, TIMING_VERSION_IDLE_AWARE]
): boolean {
  if (!attempt) return false;
  if (typeof attempt.timingVersion !== "number" || !allowedVersions.includes(attempt.timingVersion)) {
    return false;
  }
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
 * Formats duration in milliseconds to human-readable string:
 * - 42.000 ms -> "42s"
 * - 82.000 ms -> "1m22s"
 * - 145.000 ms -> "2m25s"
 */
export function formatQuestionDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "--";
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

// Alias for backwards compatibility
export const formatDuration = formatQuestionDuration;

/**
 * Computes aggregate timing metrics across an array of question attempts.
 * Strictly filters out invalid or legacy attempts without timing telemetry.
 */
export function getQuestionTimingMetrics(
  attempts: QuestionAttempt[],
  allowedVersions: number[] = [TIMING_VERSION_ACTIVE_MONOTONIC, TIMING_VERSION_IDLE_AWARE]
): QuestionTimingMetrics {
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
      isTimingDisplayable: false,
    };
  }

  const validDurations: number[] = [];
  for (const att of attempts) {
    if (isValidTiming(att, allowedVersions)) {
      validDurations.push(att.activeDurationMs!);
    }
  }

  const countWithTiming = validDurations.length;
  const timingCoverage = totalAttempts > 0 ? countWithTiming / totalAttempts : 0;
  const isTimingDisplayable = countWithTiming >= MIN_TIMED_ATTEMPTS_FOR_DISPLAY;

  if (countWithTiming === 0) {
    return {
      totalAttempts,
      countWithTiming: 0,
      timingCoverage: 0,
      meanActiveDurationMs: null,
      medianActiveDurationMs: null,
      formattedMean: "--",
      formattedMedian: "--",
      isTimingDisplayable: false,
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
    formattedMean: formatQuestionDuration(meanActiveDurationMs),
    formattedMedian: formatQuestionDuration(medianActiveDurationMs),
    isTimingDisplayable,
  };
}

/**
 * Stateful Idle-Aware Active Question Time Tracker
 * Handles monotonic start, pauses on tab invisibility & user idle timeout, and supports switching questions.
 */
export class QuestionTimingTracker {
  private accumulatedMsMap: Map<string, number> = new Map();
  private currentQuestionId: string | null = null;
  private activeSegmentStart: number | null = null;
  private lastActivityAt: number | null = null;
  private isDocumentVisible: boolean = true;
  private isPaused: boolean = false;
  private isIdle: boolean = false;
  private isSubmitted: boolean = false;
  private idleTimeoutMs: number;

  constructor(idleTimeoutMs: number = QUESTION_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs;
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
    this.isIdle = false;

    if (!this.accumulatedMsMap.has(questionId)) {
      this.accumulatedMsMap.set(questionId, initialAccumulatedMs);
    }

    const now = this.getNow();
    this.lastActivityAt = now;

    if (this.canAccumulate()) {
      this.activeSegmentStart = now;
    } else {
      this.activeSegmentStart = null;
    }
  }

  /**
   * Records lightweight user activity (pointerdown, keydown, touchstart, scroll, throttled mousemove).
   * If the tracker was idle-paused, commits time up to last activity and starts a fresh segment.
   */
  public recordActivity(): void {
    const now = this.getNow();

    if (this.currentQuestionId && this.activeSegmentStart !== null && this.lastActivityAt !== null) {
      if (now - this.lastActivityAt >= this.idleTimeoutMs) {
        // Idle period detected: commit segment up to lastActivityAt
        const segment = Math.max(0, this.lastActivityAt - this.activeSegmentStart);
        const current = this.accumulatedMsMap.get(this.currentQuestionId) || 0;
        this.accumulatedMsMap.set(this.currentQuestionId, current + segment);
        this.activeSegmentStart = now;
      }
    }

    this.lastActivityAt = now;
    this.isIdle = false;

    if (this.canAccumulate() && this.activeSegmentStart === null) {
      this.activeSegmentStart = now;
    }
  }

  /**
   * Handles visibility changes (e.g. when user switches browser tabs).
   */
  public handleVisibilityChange(isVisible: boolean): void {
    this.isDocumentVisible = isVisible;

    if (!isVisible) {
      this.commitActiveSegment();
    } else {
      const now = this.getNow();
      this.lastActivityAt = now;
      this.isIdle = false;

      if (this.canAccumulate() && this.activeSegmentStart === null) {
        this.activeSegmentStart = now;
      }
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
    } else {
      const now = this.getNow();
      this.lastActivityAt = now;
      this.isIdle = false;

      if (this.canAccumulate() && this.activeSegmentStart === null) {
        this.activeSegmentStart = now;
      }
    }
  }

  /**
   * Marks question as submitted/answered. Stops active timing accumulation.
   */
  public finishQuestion(): { activeDurationMs: number; timeSpentSeconds: number; timingVersion: number } {
    this.recordActivity();
    this.commitActiveSegment();
    this.isSubmitted = true;

    const totalMs = this.getCurrentActiveDurationMs();
    return {
      activeDurationMs: totalMs,
      timeSpentSeconds: Math.max(1, Math.round(totalMs / 1000)),
      timingVersion: TIMING_VERSION_IDLE_AWARE,
    };
  }

  /**
   * Returns current total active duration in milliseconds (accumulated + current valid active segment).
   * Evaluates idle timeout on-the-fly.
   */
  public getCurrentActiveDurationMs(): number {
    if (!this.currentQuestionId) return 0;
    const base = this.accumulatedMsMap.get(this.currentQuestionId) || 0;

    if (this.activeSegmentStart !== null && this.canAccumulate()) {
      const now = this.getNow();
      const lastAct = this.lastActivityAt ?? now;

      // Check if idle threshold reached
      if (now - lastAct >= this.idleTimeoutMs) {
        // Cap segment at last activity timestamp (exclude idle waiting duration)
        const cappedSegment = Math.max(0, lastAct - this.activeSegmentStart);
        return Math.round(base + cappedSegment);
      }

      const segment = Math.max(0, now - this.activeSegmentStart);
      return Math.round(base + segment);
    }

    return Math.round(base);
  }

  /**
   * Commits the current active segment into the accumulated time map.
   * If idle timeout was exceeded, caps accumulated time at lastActivityAt.
   */
  private commitActiveSegment(): void {
    if (this.currentQuestionId && this.activeSegmentStart !== null) {
      const now = this.getNow();
      const lastAct = this.lastActivityAt ?? now;
      let segment = 0;

      if (now - lastAct >= this.idleTimeoutMs) {
        // Capped at last activity timestamp (excludes idle waiting period)
        segment = Math.max(0, lastAct - this.activeSegmentStart);
        this.isIdle = true;
      } else {
        segment = Math.max(0, now - this.activeSegmentStart);
      }

      const current = this.accumulatedMsMap.get(this.currentQuestionId) || 0;
      this.accumulatedMsMap.set(this.currentQuestionId, current + segment);
      this.activeSegmentStart = null;
    }
  }

  private canAccumulate(): boolean {
    return Boolean(this.currentQuestionId && this.isDocumentVisible && !this.isPaused && !this.isSubmitted && !this.isIdle);
  }

  private getNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }
}
