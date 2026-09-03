import { Card, createEmptyCard, Rating, State, forgetting_curve } from "ts-fsrs";
import { Flashcard, MedicalArea } from "../types";
import { defaultFSRS, FSRS_CONFIG } from "../config/spacedRepetition";

export type FSRSRatingInput = "AGAIN" | "HARD" | "MEDIUM" | "EASY";

export interface FSRSIntervalProjection {
  intervalDays: number;
  label: string;
  dueDate: string;
}

export class SpacedRepetitionService {
  /**
   * Maps application rating to ts-fsrs Grade/Rating
   * AGAIN -> Again (1)
   * HARD  -> Hard (2)
   * MEDIUM -> Good (3)
   * EASY  -> Easy (4)
   */
  static mapRating(rating: FSRSRatingInput): Rating {
    switch (rating) {
      case "AGAIN":
        return Rating.Again;
      case "HARD":
        return Rating.Hard;
      case "MEDIUM":
        return Rating.Good;
      case "EASY":
        return Rating.Easy;
    }
  }

  /**
   * Converts a StaziaMed Flashcard to ts-fsrs Card object
   */
  static toFSRSCard(card: Flashcard, now: Date = new Date()): Card {
    const defaultCard = createEmptyCard(now);
    return {
      due: card.dueDate ? new Date(card.dueDate) : defaultCard.due,
      stability: card.stability ?? defaultCard.stability,
      difficulty: card.difficulty ?? defaultCard.difficulty,
      elapsed_days: card.elapsedDays ?? defaultCard.elapsed_days,
      scheduled_days: card.scheduledDays ?? card.intervalDays ?? defaultCard.scheduled_days,
      reps: card.reps ?? card.repetitionCount ?? defaultCard.reps,
      lapses: card.lapses ?? defaultCard.lapses,
      state: (card.state as State) ?? (card.reps && card.reps > 0 ? State.Review : State.New),
      last_review: card.lastReviewed ? new Date(card.lastReviewed) : undefined,
    };
  }

  /**
   * Formats day interval into a human-readable medical review string
   */
  static formatIntervalLabel(days: number): string {
    if (days <= 0) return "Hoje";
    if (days === 1) return "1 dia";
    if (days < 30) return `${days} dias`;
    const months = Math.round(days / 30);
    if (months === 1) return "1 mês";
    if (months < 12) return `${months} meses`;
    const years = Math.round(days / 365);
    return `${years} ${years === 1 ? "ano" : "anos"}`;
  }

  /**
   * Creates a new Flashcard initialized under FSRS V1
   */
  static createInitialFSRSCard(
    params: {
      id?: string;
      questionId?: string;
      area: MedicalArea;
      topic: string;
      front: string;
      back: string;
      keyMnemonic?: string;
    },
    now: Date = new Date()
  ): Flashcard {
    const fsrsCard = createEmptyCard(now);
    const cardId = params.id || `fc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    return {
      id: cardId,
      questionId: params.questionId,
      area: params.area,
      topic: params.topic,
      front: params.front,
      back: params.back,
      keyMnemonic: params.keyMnemonic,

      // FSRS Core State Fields
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: fsrsCard.stability,
      difficulty: fsrsCard.difficulty,
      elapsedDays: fsrsCard.elapsed_days,
      scheduledDays: fsrsCard.scheduled_days,
      reps: fsrsCard.reps,
      lapses: fsrsCard.lapses,
      state: fsrsCard.state,
      dueDate: fsrsCard.due.toISOString(),
      lastReviewed: undefined,

      // Legacy Compatibility Fields
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 0,
      masteryLevel: 25,
    };
  }

  /**
   * Schedules next review using the true FSRS engine
   */
  static scheduleFSRSReview(
    card: Flashcard,
    ratingInput: FSRSRatingInput,
    now: Date = new Date()
  ): Flashcard {
    const fsrsRating = this.mapRating(ratingInput);
    const fsrsCard = this.toFSRSCard(card, now);
    const schedulingRecord = defaultFSRS.repeat(fsrsCard, now);
    const updatedFSRSCard = schedulingRecord[fsrsRating].card;

    const scheduledDays = updatedFSRSCard.scheduled_days;
    const reps = updatedFSRSCard.reps;
    const lapses = updatedFSRSCard.lapses;
    const stability = Number(updatedFSRSCard.stability.toFixed(4));
    const difficulty = Number(updatedFSRSCard.difficulty.toFixed(4));

    // Calculate mastery level from stability & lapses
    // Stability >= 30 days -> Mastery >= 80%
    // Stability >= 14 days -> Mastery >= 70%
    let calculatedMastery = Math.min(
      100,
      Math.max(
        10,
        Math.round(
          stability >= 30
            ? 85 + Math.min(15, stability / 10)
            : stability >= 14
            ? 70 + ((stability - 14) / 16) * 15
            : stability >= 3
            ? 40 + ((stability - 3) / 11) * 30
            : 20 + stability * 6.6
        )
      )
    );

    if (ratingInput === "AGAIN") {
      calculatedMastery = Math.max(10, (card.masteryLevel ?? 25) - 15);
    }

    return {
      ...card,
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability,
      difficulty,
      elapsedDays: updatedFSRSCard.elapsed_days,
      scheduledDays,
      reps,
      lapses,
      state: updatedFSRSCard.state,
      dueDate: updatedFSRSCard.due.toISOString(),
      lastReviewed: now.toISOString(),

      // Legacy compatibility sync
      intervalDays: Math.max(1, scheduledDays),
      repetitionCount: reps,
      masteryLevel: calculatedMastery,
    };
  }

  /**
   * Previews future interval projections for all 4 response buttons
   */
  static previewFSRSNextIntervals(
    card: Flashcard,
    now: Date = new Date()
  ): Record<FSRSRatingInput, FSRSIntervalProjection> {
    const fsrsCard = this.toFSRSCard(card, now);
    const schedulingRecord = defaultFSRS.repeat(fsrsCard, now);

    const ratings: FSRSRatingInput[] = ["AGAIN", "HARD", "MEDIUM", "EASY"];
    const result: Partial<Record<FSRSRatingInput, FSRSIntervalProjection>> = {};

    for (const r of ratings) {
      const fsrsRating = this.mapRating(r);
      const scheduled = schedulingRecord[fsrsRating];
      const days = scheduled.card.scheduled_days;
      result[r] = {
        intervalDays: days,
        label: this.formatIntervalLabel(days),
        dueDate: scheduled.card.due.toISOString(),
      };
    }

    return result as Record<FSRSRatingInput, FSRSIntervalProjection>;
  }

  /**
   * Computes current retrievability probability (0.0 to 1.0)
   */
  static calculateRetrievability(card: Flashcard, now: Date = new Date()): number {
    if (!card.stability || card.stability <= 0) return 1.0;
    if (!card.lastReviewed) return 1.0;

    const last = new Date(card.lastReviewed).getTime();
    const elapsedDays = Math.max(0, (now.getTime() - last) / (1000 * 60 * 60 * 24));
    const r = forgetting_curve(elapsedDays, card.stability);
    return Math.max(0.0, Math.min(1.0, Number(r.toFixed(4))));
  }

  /**
   * Validates if a dueDate string is a valid ISO/date string
   */
  static isValidDate(dateStr?: string | null): boolean {
    if (!dateStr || typeof dateStr !== "string" || dateStr.trim().length === 0) {
      return false;
    }
    const timestamp = new Date(dateStr).getTime();
    return !isNaN(timestamp);
  }

  /**
   * Checks if card is currently due for review under FSRS temporal rules
   */
  static isCardDue(card: Flashcard, now: Date = new Date()): boolean {
    if (!card) return false;
    if (!this.isValidDate(card.dueDate)) {
      // Unscheduled or unreviewed new card without valid due date: due immediately for initial review
      return true;
    }
    return new Date(card.dueDate).getTime() <= now.getTime();
  }

  /**
   * Returns all cards due for review for the specified timestamp and optional area filter
   */
  static getDueFlashcards(
    cards: Flashcard[],
    now: Date = new Date(),
    areaFilter: MedicalArea | "ALL" = "ALL"
  ): Flashcard[] {
    if (!Array.isArray(cards)) return [];
    return cards.filter((card) => {
      if (areaFilter !== "ALL" && card.area !== areaFilter) {
        return false;
      }
      return this.isCardDue(card, now);
    });
  }

  /**
   * Estimates total review time in minutes based on flashcard volume
   */
  static estimateReviewTimeMinutes(cardCount: number): number {
    if (cardCount <= 0) return 0;
    return Math.ceil(cardCount * 0.7);
  }

  /**
   * Converts a date or ISO string to a canonical local YYYY-MM-DD string without timezone displacement
   */
  static toLocalDateKey(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) {
      return "";
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Computes the aggregated review load map of flashcards grouped by date.
   * Overdue cards (dueDate < now) are aggregated into today's load for operational readiness.
   * Future cards (dueDate > now) are grouped under their specific future calendar date.
   */
  static getFlashcardReviewLoadByDate(
    cards: Flashcard[],
    now: Date = new Date()
  ): Record<string, { dateKey: string; count: number; estimatedMinutes: number; isToday: boolean }> {
    const todayKey = this.toLocalDateKey(now);
    const result: Record<string, { dateKey: string; count: number; estimatedMinutes: number; isToday: boolean }> = {};

    if (!Array.isArray(cards) || !todayKey) return result;

    for (const card of cards) {
      if (this.isCardDue(card, now)) {
        // Overdue or due right now -> grouped under today
        if (!result[todayKey]) {
          result[todayKey] = {
            dateKey: todayKey,
            count: 0,
            estimatedMinutes: 0,
            isToday: true,
          };
        }
        result[todayKey].count += 1;
      } else if (this.isValidDate(card.dueDate)) {
        // Future valid due date -> grouped under its specific future dateKey
        const cardDateKey = this.toLocalDateKey(card.dueDate);
        if (cardDateKey && cardDateKey.length > 0) {
          if (!result[cardDateKey]) {
            result[cardDateKey] = {
              dateKey: cardDateKey,
              count: 0,
              estimatedMinutes: 0,
              isToday: cardDateKey === todayKey,
            };
          }
          result[cardDateKey].count += 1;
        }
      }
    }

    // Compute estimatedMinutes for all grouped days
    for (const key of Object.keys(result)) {
      result[key].estimatedMinutes = this.estimateReviewTimeMinutes(result[key].count);
    }

    return result;
  }

  /**
   * Migrates legacy flashcards conservatively without fabricating past lapses/reviews
   */
  static migrateLegacyFlashcards(
    cards: Flashcard[],
    now: Date = new Date()
  ): { migrated: Flashcard[]; hadLegacyCards: boolean } {
    let hadLegacyCards = false;

    const migrated = cards.map((card) => {
      if (card.schedulerVersion === FSRS_CONFIG.schedulerVersion) {
        return card;
      }

      hadLegacyCards = true;
      const reps = card.repetitionCount || 0;
      const intervalDays = card.intervalDays || 1;

      // Conservative baseline:
      // If card was already reviewed multiple times, assign a conservative stability proportional to interval
      const stability = reps > 0 ? Math.max(1.0, intervalDays * 0.8) : 0;
      const difficulty = 5.0; // Standard neutral difficulty (1-10 scale)

      return {
        ...card,
        schedulerVersion: FSRS_CONFIG.schedulerVersion,
        stability,
        difficulty,
        elapsedDays: 0,
        scheduledDays: intervalDays,
        reps,
        lapses: 0,
        state: reps > 0 ? State.Review : State.New,
        // Preserve existing dueDate
        dueDate: card.dueDate || now.toISOString(),
      };
    });

    return { migrated, hadLegacyCards };
  }
}
