import { describe, it, expect } from "vitest";
import { Flashcard } from "../types";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { FSRS_CONFIG } from "../config/spacedRepetition";

describe("Adaptive Calendar & FSRS Spaced Repetition Integration (Etapa 1.13)", () => {
  const deterministicNow = new Date("2026-09-03T12:00:00.000Z");
  const todayKey = "2026-09-03";

  const sampleDeck: Flashcard[] = [
    // 2 cards overdue (yesterday)
    {
      id: "fc-overdue-1",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      front: "Frente 1",
      back: "Verso 1",
      dueDate: "2026-09-02T10:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 2.0,
      difficulty: 5.0,
      reps: 1,
      lapses: 0,
      state: 2,
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 1,
      masteryLevel: 40,
    },
    {
      id: "fc-overdue-2",
      area: "CIRURGIA_GERAL",
      topic: "Trauma",
      front: "Frente 2",
      back: "Verso 2",
      dueDate: "2026-09-02T15:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 2.0,
      difficulty: 5.0,
      reps: 1,
      lapses: 0,
      state: 2,
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 1,
      masteryLevel: 45,
    },
    // 3 cards due today
    {
      id: "fc-today-1",
      area: "PEDIATRIA",
      topic: "Neonatologia",
      front: "Frente 3",
      back: "Verso 3",
      dueDate: "2026-09-03T08:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 3.0,
      difficulty: 5.0,
      reps: 2,
      lapses: 0,
      state: 2,
      intervalDays: 3,
      easeFactor: 2.5,
      repetitionCount: 2,
      masteryLevel: 60,
    },
    {
      id: "fc-today-2",
      area: "GINECOLOGIA_OBSTETRICIA",
      topic: "Obstetrícia",
      front: "Frente 4",
      back: "Verso 4",
      dueDate: "2026-09-03T11:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 3.0,
      difficulty: 5.0,
      reps: 2,
      lapses: 0,
      state: 2,
      intervalDays: 3,
      easeFactor: 2.5,
      repetitionCount: 2,
      masteryLevel: 60,
    },
    {
      id: "fc-today-3",
      area: "MEDICINA_FAMILIA_COMUNIDADE",
      topic: "Atenção Básica",
      front: "Frente 5",
      back: "Verso 5",
      dueDate: "2026-09-03T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 3.0,
      difficulty: 5.0,
      reps: 2,
      lapses: 0,
      state: 2,
      intervalDays: 3,
      easeFactor: 2.5,
      repetitionCount: 2,
      masteryLevel: 60,
    },
    // 4 cards due tomorrow (2026-09-04)
    {
      id: "fc-tomorrow-1",
      area: "CLINICA_MEDICA",
      topic: "Nefrologia",
      front: "Frente 6",
      back: "Verso 6",
      dueDate: "2026-09-04T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 6.0,
      difficulty: 5.0,
      reps: 3,
      lapses: 0,
      state: 2,
      intervalDays: 6,
      easeFactor: 2.5,
      repetitionCount: 3,
      masteryLevel: 75,
    },
    {
      id: "fc-tomorrow-2",
      area: "CIRURGIA_GERAL",
      topic: "Abdome Agudo",
      front: "Frente 7",
      back: "Verso 7",
      dueDate: "2026-09-04T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 6.0,
      difficulty: 5.0,
      reps: 3,
      lapses: 0,
      state: 2,
      intervalDays: 6,
      easeFactor: 2.5,
      repetitionCount: 3,
      masteryLevel: 75,
    },
    {
      id: "fc-tomorrow-3",
      area: "PEDIATRIA",
      topic: "Pneumologia",
      front: "Frente 8",
      back: "Verso 8",
      dueDate: "2026-09-04T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 6.0,
      difficulty: 5.0,
      reps: 3,
      lapses: 0,
      state: 2,
      intervalDays: 6,
      easeFactor: 2.5,
      repetitionCount: 3,
      masteryLevel: 75,
    },
    {
      id: "fc-tomorrow-4",
      area: "GINECOLOGIA_OBSTETRICIA",
      topic: "Ginecologia",
      front: "Frente 9",
      back: "Verso 9",
      dueDate: "2026-09-04T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 6.0,
      difficulty: 5.0,
      reps: 3,
      lapses: 0,
      state: 2,
      intervalDays: 6,
      easeFactor: 2.5,
      repetitionCount: 3,
      masteryLevel: 75,
    },
    // 2 cards due next month (2026-10-15)
    {
      id: "fc-nextmonth-1",
      area: "CLINICA_MEDICA",
      topic: "Infectologia",
      front: "Frente 10",
      back: "Verso 10",
      dueDate: "2026-10-15T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 42.0,
      difficulty: 4.0,
      reps: 6,
      lapses: 0,
      state: 2,
      intervalDays: 42,
      easeFactor: 2.5,
      repetitionCount: 6,
      masteryLevel: 95,
    },
    {
      id: "fc-nextmonth-2",
      area: "PEDIATRIA",
      topic: "Infectologia",
      front: "Frente 11",
      back: "Verso 11",
      dueDate: "2026-10-15T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 42.0,
      difficulty: 4.0,
      reps: 6,
      lapses: 0,
      state: 2,
      intervalDays: 42,
      easeFactor: 2.5,
      repetitionCount: 6,
      masteryLevel: 95,
    },
  ];

  it("A. Flashcards of the same date are cleanly aggregated into a single day load", () => {
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    expect(load["2026-09-04"]).toBeDefined();
    expect(load["2026-09-04"].count).toBe(4);
  });

  it("B. 10 Flashcards on the same day produce 1 group with count 10", () => {
    const tenCards: Flashcard[] = Array.from({ length: 10 }).map((_, i) => ({
      ...sampleDeck[0],
      id: `fc-batch-${i}`,
      dueDate: "2026-09-08T12:00:00.000Z",
    }));

    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(tenCards, deterministicNow);
    expect(load["2026-09-08"].count).toBe(10);
    expect(load["2026-09-08"].estimatedMinutes).toBe(7); // 10 * 0.7 = 7 min
  });

  it("C. Today's aggregated review count matches getDueFlashcards exactly", () => {
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    const dueList = SpacedRepetitionService.getDueFlashcards(sampleDeck, deterministicNow);

    expect(load[todayKey].count).toBe(dueList.length);
    expect(load[todayKey].count).toBe(5); // 2 overdue + 3 due today
  });

  it("D. Overdue cards (dueDate < now) are aggregated into today's load for actionable readiness", () => {
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    // Overdue cards are not kept as unaddressed past dates
    expect(load["2026-09-02"]).toBeUndefined();
    // They are counted into today
    expect(load[todayKey].count).toBe(5);
  });

  it("E. Future flashcards strictly remain on their future calendar date", () => {
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    expect(load["2026-09-04"].count).toBe(4);
    expect(load["2026-10-15"].count).toBe(2);
  });

  it("F. Reviewing a card removes it from today's pending count", () => {
    const initialLoad = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    expect(initialLoad[todayKey].count).toBe(5);

    // Review fc-today-1 with GOOD (MEDIUM)
    const reviewedCard = SpacedRepetitionService.scheduleFSRSReview(
      sampleDeck[2],
      "MEDIUM",
      deterministicNow
    );

    const updatedDeck = sampleDeck.map((c) => (c.id === reviewedCard.id ? reviewedCard : c));
    const newLoad = SpacedRepetitionService.getFlashcardReviewLoadByDate(updatedDeck, deterministicNow);

    expect(newLoad[todayKey].count).toBe(4);
  });

  it("G. Reviewed card appears on the new future dueDate calculated by FSRS", () => {
    // Review fc-today-1 with EASY
    const reviewedCard = SpacedRepetitionService.scheduleFSRSReview(
      sampleDeck[2],
      "EASY",
      deterministicNow
    );

    const newDateKey = SpacedRepetitionService.toLocalDateKey(reviewedCard.dueDate);
    expect(newDateKey).toBeDefined();
    expect(newDateKey > todayKey).toBe(true);

    const updatedDeck = sampleDeck.map((c) => (c.id === reviewedCard.id ? reviewedCard : c));
    const newLoad = SpacedRepetitionService.getFlashcardReviewLoadByDate(updatedDeck, deterministicNow);

    expect(newLoad[newDateKey]).toBeDefined();
    expect(newLoad[newDateKey].count).toBe(1);
  });

  it("H. Plano de Hoje, Flashcards and Calendar have 100% count consistency for today", () => {
    const calendarLoad = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    const flashcardsDue = SpacedRepetitionService.getDueFlashcards(sampleDeck, deterministicNow);
    const todayPlanDue = SpacedRepetitionService.getDueFlashcards(sampleDeck, deterministicNow, "ALL");

    expect(calendarLoad[todayKey].count).toBe(flashcardsDue.length);
    expect(flashcardsDue.length).toBe(todayPlanDue.length);
    expect(calendarLoad[todayKey].count).toBe(5);
  });

  it("I. Page reload reconstructs calendar load cleanly from raw stored array", () => {
    const serialized = JSON.stringify(sampleDeck);
    const deserialized: Flashcard[] = JSON.parse(serialized);

    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(deserialized, deterministicNow);
    expect(load[todayKey].count).toBe(5);
    expect(load["2026-09-04"].count).toBe(4);
    expect(load["2026-10-15"].count).toBe(2);
  });

  it("J. Flashcards produce single aggregated numbers, not individual event rows", () => {
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    // Keys in load are date strings, values are summary counts
    expect(typeof load["2026-09-04"].count).toBe("number");
    expect(load["2026-09-04"].count).toBe(4);
  });

  it("K. estimateReviewTimeMinutes is accurately reused for calendar load duration", () => {
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    expect(load[todayKey].estimatedMinutes).toBe(SpacedRepetitionService.estimateReviewTimeMinutes(5));
    expect(load["2026-09-04"].estimatedMinutes).toBe(SpacedRepetitionService.estimateReviewTimeMinutes(4));
  });

  it("L. Aggregation function is completely pure and does not mutate flashcards", () => {
    const deckClone = JSON.parse(JSON.stringify(sampleDeck));
    SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);

    expect(sampleDeck).toEqual(deckClone);
  });

  it("M. Cards across different months are correctly grouped", () => {
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(sampleDeck, deterministicNow);
    expect(load["2026-10-15"]).toBeDefined();
    expect(load["2026-10-15"].count).toBe(2);
  });

  it("N. Cards with missing or invalid dueDate are safely counted as due today", () => {
    const corruptedDeck: Flashcard[] = [
      {
        ...sampleDeck[0],
        id: "fc-no-date",
        dueDate: "",
      },
    ];

    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(corruptedDeck, deterministicNow);
    expect(load[todayKey].count).toBe(1);
  });

  it("O. masteryLevel does not affect calendar review load grouping", () => {
    const lowMasteryFuture: Flashcard[] = [
      {
        ...sampleDeck[5], // due 2026-09-04
        masteryLevel: 5,
      },
    ];

    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate(lowMasteryFuture, deterministicNow);
    expect(load[todayKey]).toBeUndefined();
    expect(load["2026-09-04"].count).toBe(1);
  });
});
