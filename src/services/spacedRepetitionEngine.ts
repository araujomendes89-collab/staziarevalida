import { FsrsMemoryState, MedicalArea } from "../types/adaptiveCalendar";
import { Flashcard } from "../types";

/**
 * Advanced Spaced Repetition Engine using FSRS / Adaptive Memory Decay principles.
 * Calculates memory stability (S), retrievability (R), difficulty (D), and dynamic intervals.
 */
export class SpacedRepetitionEngine {
  // FSRS decay constant (w_decay)
  private static DECAY_FACTOR = -0.5;
  private static DESIRED_RETENTION = 0.90; // Target 90% recall probability

  /**
   * Calculates current retrievability R(t) = (1 + factor * t / S)^(-0.5)
   * @param stability Days until retrievability drops to 90%
   * @param elapsedDays Days since last review
   */
  static calculateRetrievability(stability: number, elapsedDays: number): number {
    if (stability <= 0) return 0.5;
    if (elapsedDays <= 0) return 1.0;
    
    // FSRS forgetting curve formula: R = (1 + factor * t / S)^decay
    const factor = (Math.pow(this.DESIRED_RETENTION, 1 / this.DECAY_FACTOR) - 1);
    const retrievability = Math.pow(1 + (factor * elapsedDays) / stability, this.DECAY_FACTOR);
    return Math.max(0.05, Math.min(1.0, Number(retrievability.toFixed(3))));
  }

  /**
   * Calculates next optimal review interval (in days) to maintain target retention
   */
  static calculateNextInterval(stability: number, targetRetention: number = 0.90): number {
    const factor = (Math.pow(targetRetention, 1 / this.DECAY_FACTOR) - 1);
    const intervalDays = (stability * (Math.pow(targetRetention, 1 / this.DECAY_FACTOR) - 1)) / factor;
    return Math.max(1, Math.round(intervalDays || stability));
  }

  /**
   * Evaluates memory state after a response
   * rating: 1 = Again (Errei / Esqueci), 2 = Hard (Difícil), 3 = Good (Bom), 4 = Easy (Fácil)
   */
  static processReview(
    currentState: FsrsMemoryState,
    rating: 1 | 2 | 3 | 4,
    responseTimeSeconds?: number
  ): FsrsMemoryState {
    const { stability, difficulty, reps, lapses } = currentState;
    const now = new Date();

    let newStability = stability;
    let newDifficulty = difficulty;
    let newReps = reps + 1;
    let newLapses = lapses;

    // Adjust difficulty: Easy decreases difficulty, Again increases it
    if (rating === 1) {
      newDifficulty = Math.min(10, difficulty + 1.8);
      newLapses = lapses + 1;
      // Post-lapse stability drop
      newStability = Math.max(1.0, stability * 0.35);
    } else if (rating === 2) {
      newDifficulty = Math.min(10, difficulty + 0.6);
      newStability = Math.max(1.5, stability * 1.2);
    } else if (rating === 3) {
      newDifficulty = Math.max(1.0, difficulty - 0.2);
      newStability = Math.max(2.0, stability * 2.3 * (11 - newDifficulty) / 5);
    } else if (rating === 4) {
      newDifficulty = Math.max(1.0, difficulty - 0.8);
      newStability = Math.max(3.0, stability * 3.5 * (11 - newDifficulty) / 4);
    }

    // Time penalty if response took abnormally long
    if (responseTimeSeconds && responseTimeSeconds > 25 && rating > 2) {
      newStability *= 0.85; // Slight reduction in stability due to hesitant retrieval
    }

    const nextIntervalDays = this.calculateNextInterval(newStability, this.DESIRED_RETENTION);
    const nextDueDate = new Date(now.getTime() + nextIntervalDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Determine qualitative memory state
    let memoryStatus: FsrsMemoryState["memoryStatus"] = "APRENDENDO";
    if (newStability >= 30) {
      memoryStatus = "DOMINADO";
    } else if (newStability >= 14) {
      memoryStatus = "CONSOLIDADO";
    } else if (rating === 1 || newLapses >= 3) {
      memoryStatus = "INSTAVEL";
    }

    return {
      ...currentState,
      stability: Number(newStability.toFixed(2)),
      difficulty: Number(newDifficulty.toFixed(2)),
      retrievability: 1.0, // Freshly reviewed
      lastReviewDate: now.toISOString().split("T")[0],
      nextDueDate,
      reps: newReps,
      lapses: newLapses,
      memoryStatus,
    };
  }

  /**
   * Computes batch forgetting risks for a list of topics
   */
  static getDueTopics(states: FsrsMemoryState[]): {
    dueNow: FsrsMemoryState[];
    upcomingDue: FsrsMemoryState[];
    stable: FsrsMemoryState[];
  } {
    const today = new Date().toISOString().split("T")[0];
    const dueNow: FsrsMemoryState[] = [];
    const upcomingDue: FsrsMemoryState[] = [];
    const stable: FsrsMemoryState[] = [];

    states.forEach((item) => {
      if (item.nextDueDate <= today || item.retrievability < 0.75) {
        dueNow.push(item);
      } else {
        const dueDate = new Date(item.nextDueDate);
        const todayDate = new Date(today);
        const diffDays = Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 3) {
          upcomingDue.push(item);
        } else {
          stable.push(item);
        }
      }
    });

    return { dueNow, upcomingDue, stable };
  }
}
