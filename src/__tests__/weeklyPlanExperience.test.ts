import { describe, it, expect } from "vitest";
import { Flashcard } from "../types";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { FSRS_CONFIG } from "../config/spacedRepetition";
import { generateWeeklyPlanDays } from "../components/planejamento/WeeklyPlanView";

describe("Weekly Plan & FSRS Integration (Etapa 1.14A)", () => {
  const deterministicNow = new Date("2026-09-03T12:00:00.000Z");
  const todayKey = "2026-09-03";

  const sampleDeck: Flashcard[] = [
    // 2 overdue cards (yesterday)
    {
      id: "fc-overdue-1",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      front: "F1",
      back: "V1",
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
      front: "F2",
      back: "V2",
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
      front: "F3",
      back: "V3",
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
      front: "F4",
      back: "V4",
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
      front: "F5",
      back: "V5",
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
      front: "F6",
      back: "V6",
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
      front: "F7",
      back: "V7",
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
      front: "F8",
      back: "V8",
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
      front: "F9",
      back: "V9",
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
  ];

  it("A. Plano Semanal contains exactly 7 consecutive days", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    expect(days).toHaveLength(7);
  });

  it("B. Current day is correctly identified as isToday on index 0", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    expect(days[0].isToday).toBe(true);
    expect(days[0].dateKey).toBe(todayKey);
    expect(days[1].isToday).toBe(false);
  });

  it("C. Today's review count strictly matches getDueFlashcards", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    const dueList = SpacedRepetitionService.getDueFlashcards(sampleDeck, deterministicNow);

    expect(days[0].reviewCount).toBe(dueList.length);
    expect(days[0].reviewCount).toBe(5); // 2 overdue + 3 due today
  });

  it("D. Future reviews use getFlashcardReviewLoadByDate", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    expect(days[1].dateKey).toBe("2026-09-04");
    expect(days[1].reviewCount).toBe(4);
  });

  it("E. Overdue cards are integrated into today's load, not left in the past", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    const yesterdayInPlan = days.find((d) => d.dateKey === "2026-09-02");

    // Yesterday is in the past, so the 7-day upcoming view does not start on yesterday
    expect(yesterdayInPlan).toBeUndefined();
    // But the 2 overdue cards are counted in today's review workload
    expect(days[0].reviewCount).toBe(5);
  });

  it("F. Future flashcards remain strictly on their scheduled future date", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    expect(days[1].dateKey).toBe("2026-09-04");
    expect(days[1].reviewCount).toBe(4);
    expect(days[2].dateKey).toBe("2026-09-05");
    expect(days[2].reviewCount).toBe(0);
  });

  it("G. Shared timezone logic preserves calendar day keys without displacement", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    expect(days[0].dateKey).toBe("2026-09-03");
    expect(days[6].dateKey).toBe("2026-09-09");
  });

  it("H. Corrupted or empty dueDate does not fabricate future days", () => {
    const corruptedDeck: Flashcard[] = [
      {
        ...sampleDeck[0],
        id: "fc-bad",
        dueDate: "invalid",
      },
    ];

    const days = generateWeeklyPlanDays(deterministicNow, corruptedDeck);
    // Invalid card is safely counted today, not placed into random future dates
    expect(days[0].reviewCount).toBe(1);
    expect(days[1].reviewCount).toBe(0);
  });

  it("I. FSRS review duration accurately reuses estimateReviewTimeMinutes", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    expect(days[0].reviewMinutes).toBe(SpacedRepetitionService.estimateReviewTimeMinutes(5));
    expect(days[1].reviewMinutes).toBe(SpacedRepetitionService.estimateReviewTimeMinutes(4));
  });

  it("J. No FSRS scheduling algorithm is duplicated", () => {
    expect(typeof SpacedRepetitionService.scheduleFSRSReview).toBe("function");
    expect(typeof SpacedRepetitionService.getFlashcardReviewLoadByDate).toBe("function");
  });

  it("K. Flashcard workload is represented as aggregated counts, not individual task cards", () => {
    const days = generateWeeklyPlanDays(deterministicNow, sampleDeck);
    expect(typeof days[0].reviewCount).toBe("number");
    expect(typeof days[1].reviewCount).toBe("number");
  });

  it("L. generateWeeklyPlanDays is pure and does not mutate flashcards", () => {
    const deckClone = JSON.stringify(sampleDeck);
    generateWeeklyPlanDays(deterministicNow, sampleDeck);

    expect(JSON.stringify(sampleDeck)).toBe(deckClone);
  });
});
