import { describe, it, expect } from "vitest";
import { Flashcard } from "../types";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { FSRS_CONFIG } from "../config/spacedRepetition";

describe("Today's Plan & FSRS Spaced Repetition Integration (Etapa 1.12)", () => {
  const deterministicNow = new Date("2026-09-03T12:00:00.000Z");

  const sampleFlashcards: Flashcard[] = [
    {
      id: "fc-overdue",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      front: "Enunciado 1",
      back: "Resposta 1",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 3.5,
      difficulty: 5.0,
      dueDate: "2026-09-02T12:00:00.000Z", // overdue
      reps: 1,
      lapses: 0,
      state: 2,
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 1,
      masteryLevel: 40,
    },
    {
      id: "fc-due-now",
      area: "CIRURGIA_GERAL",
      topic: "Trauma",
      front: "Enunciado 2",
      back: "Resposta 2",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 4.0,
      difficulty: 5.0,
      dueDate: "2026-09-03T12:00:00.000Z", // due today
      reps: 2,
      lapses: 0,
      state: 2,
      intervalDays: 3,
      easeFactor: 2.5,
      repetitionCount: 2,
      masteryLevel: 55,
    },
    {
      id: "fc-future-tomorrow",
      area: "PEDIATRIA",
      topic: "Neonatologia",
      front: "Enunciado 3",
      back: "Resposta 3",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 8.0,
      difficulty: 4.5,
      dueDate: "2026-09-04T12:00:00.000Z", // future tomorrow
      reps: 3,
      lapses: 0,
      state: 2,
      intervalDays: 5,
      easeFactor: 2.5,
      repetitionCount: 3,
      masteryLevel: 70,
    },
    {
      id: "fc-future-month",
      area: "GINECOLOGIA_OBSTETRICIA",
      topic: "Obstetrícia",
      front: "Enunciado 4",
      back: "Resposta 4",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 30.0,
      difficulty: 4.0,
      dueDate: "2026-10-03T12:00:00.000Z", // future 30 days
      reps: 5,
      lapses: 0,
      state: 2,
      intervalDays: 30,
      easeFactor: 2.5,
      repetitionCount: 5,
      masteryLevel: 90,
    },
  ];

  it("A. Overdue flashcard (dueDate < now) is included in Today's Plan", () => {
    const due = SpacedRepetitionService.getDueFlashcards(sampleFlashcards, deterministicNow);
    const hasOverdue = due.some((c) => c.id === "fc-overdue");
    expect(hasOverdue).toBe(true);
  });

  it("B. Due flashcard (dueDate <= now) scheduled for right now is included", () => {
    const due = SpacedRepetitionService.getDueFlashcards(sampleFlashcards, deterministicNow);
    const hasDueNow = due.some((c) => c.id === "fc-due-now");
    expect(hasDueNow).toBe(true);
  });

  it("C. Future flashcards (dueDate > now) are not included in Today's Plan", () => {
    const due = SpacedRepetitionService.getDueFlashcards(sampleFlashcards, deterministicNow);
    const hasFutureTomorrow = due.some((c) => c.id === "fc-future-tomorrow");
    const hasFutureMonth = due.some((c) => c.id === "fc-future-month");

    expect(hasFutureTomorrow).toBe(false);
    expect(hasFutureMonth).toBe(false);
    expect(due.length).toBe(2);
  });

  it("D. Today's Plan count strictly matches SpacedReviewView count for the same timestamp", () => {
    const planDue = SpacedRepetitionService.getDueFlashcards(sampleFlashcards, deterministicNow);
    const reviewDue = SpacedRepetitionService.getDueFlashcards(sampleFlashcards, deterministicNow, "ALL");

    expect(planDue.length).toBe(reviewDue.length);
    expect(planDue.length).toBe(2);
  });

  it("E. Reviewing and rating a card reduces the due count immediately", () => {
    const initialDue = SpacedRepetitionService.getDueFlashcards(sampleFlashcards, deterministicNow);
    expect(initialDue.length).toBe(2);

    // Rate fc-overdue with MEDIUM (Good)
    const reviewedCard = SpacedRepetitionService.scheduleFSRSReview(
      sampleFlashcards[0],
      "MEDIUM",
      deterministicNow
    );

    const updatedDeck = [
      reviewedCard,
      sampleFlashcards[1],
      sampleFlashcards[2],
      sampleFlashcards[3],
    ];

    const afterReviewDue = SpacedRepetitionService.getDueFlashcards(updatedDeck, deterministicNow);
    expect(afterReviewDue.length).toBe(1);
    expect(afterReviewDue[0].id).toBe("fc-due-now");
  });

  it("F. Completing all reviews results in zero pending cards (Revisão em dia)", () => {
    // Review both due cards
    const r1 = SpacedRepetitionService.scheduleFSRSReview(sampleFlashcards[0], "MEDIUM", deterministicNow);
    const r2 = SpacedRepetitionService.scheduleFSRSReview(sampleFlashcards[1], "EASY", deterministicNow);

    const allCompletedDeck = [r1, r2, sampleFlashcards[2], sampleFlashcards[3]];
    const due = SpacedRepetitionService.getDueFlashcards(allCompletedDeck, deterministicNow);

    expect(due.length).toBe(0);
  });

  it("G. Page reload reconstructs exact due count from persisted array", () => {
    const serialized = JSON.stringify(sampleFlashcards);
    const reloaded: Flashcard[] = JSON.parse(serialized);

    const dueAfterReload = SpacedRepetitionService.getDueFlashcards(reloaded, deterministicNow);
    expect(dueAfterReload.length).toBe(2);
    expect(dueAfterReload.map((c) => c.id)).toEqual(["fc-overdue", "fc-due-now"]);
  });

  it("H. masteryLevel does not influence inclusion in Today's Plan", () => {
    const cardLowMasteryFuture: Flashcard = {
      ...sampleFlashcards[2],
      masteryLevel: 10, // Very low mastery
    };
    const cardHighMasteryDue: Flashcard = {
      ...sampleFlashcards[0],
      masteryLevel: 100, // Mastered but due
    };

    expect(SpacedRepetitionService.isCardDue(cardLowMasteryFuture, deterministicNow)).toBe(false);
    expect(SpacedRepetitionService.isCardDue(cardHighMasteryDue, deterministicNow)).toBe(true);
  });

  it("I. Legacy intervalDays does not influence due calculation", () => {
    const cardHighLegacyIntervalDue: Flashcard = {
      ...sampleFlashcards[0],
      intervalDays: 100, // Legacy says 100 days, but dueDate is yesterday
    };

    expect(SpacedRepetitionService.isCardDue(cardHighLegacyIntervalDue, deterministicNow)).toBe(true);
  });

  it("J. Shared helper estimateReviewTimeMinutes accurately calculates estimated study time", () => {
    expect(SpacedRepetitionService.estimateReviewTimeMinutes(0)).toBe(0);
    expect(SpacedRepetitionService.estimateReviewTimeMinutes(1)).toBe(1);
    expect(SpacedRepetitionService.estimateReviewTimeMinutes(10)).toBe(7);
    expect(SpacedRepetitionService.estimateReviewTimeMinutes(18)).toBe(13);
  });
});
