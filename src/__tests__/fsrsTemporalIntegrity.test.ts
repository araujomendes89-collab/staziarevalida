import { describe, it, expect } from "vitest";
import { Flashcard } from "../types";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { FSRS_CONFIG } from "../config/spacedRepetition";
import { State } from "ts-fsrs";

describe("FSRS Temporal Integrity & Timezone Audit (Etapa 1.13B)", () => {
  const deterministicNow = new Date("2026-09-03T12:00:00.000Z");
  const todayKey = "2026-09-03";

  it("A. Valid past dueDate (yesterday) enters today's due queue and calendar load", () => {
    const pastCard: Flashcard = {
      id: "fc-past",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      front: "P",
      back: "R",
      dueDate: "2026-09-02T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 2.0,
      difficulty: 5.0,
      reps: 1,
      lapses: 0,
      state: State.Review,
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 1,
      masteryLevel: 50,
    };

    expect(SpacedRepetitionService.isValidDate(pastCard.dueDate)).toBe(true);
    expect(SpacedRepetitionService.isCardDue(pastCard, deterministicNow)).toBe(true);

    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate([pastCard], deterministicNow);
    expect(load[todayKey]).toBeDefined();
    expect(load[todayKey].count).toBe(1);
    expect(load["2026-09-02"]).toBeUndefined();
  });

  it("B. Valid dueDate scheduled for right now enters today's queue", () => {
    const dueNowCard: Flashcard = {
      id: "fc-now",
      area: "CIRURGIA_GERAL",
      topic: "Trauma",
      front: "P",
      back: "R",
      dueDate: "2026-09-03T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 3.0,
      difficulty: 5.0,
      reps: 2,
      lapses: 0,
      state: State.Review,
      intervalDays: 3,
      easeFactor: 2.5,
      repetitionCount: 2,
      masteryLevel: 60,
    };

    expect(SpacedRepetitionService.isCardDue(dueNowCard, deterministicNow)).toBe(true);
    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate([dueNowCard], deterministicNow);
    expect(load[todayKey].count).toBe(1);
  });

  it("C. Valid future dueDate strictly remains on future date and does not enter today", () => {
    const futureCard: Flashcard = {
      id: "fc-future",
      area: "PEDIATRIA",
      topic: "Neonatologia",
      front: "P",
      back: "R",
      dueDate: "2026-09-05T12:00:00.000Z",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 10.0,
      difficulty: 5.0,
      reps: 3,
      lapses: 0,
      state: State.Review,
      intervalDays: 10,
      easeFactor: 2.5,
      repetitionCount: 3,
      masteryLevel: 75,
    };

    expect(SpacedRepetitionService.isCardDue(futureCard, deterministicNow)).toBe(false);

    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate([futureCard], deterministicNow);
    expect(load[todayKey]).toBeUndefined();
    expect(load["2026-09-05"]).toBeDefined();
    expect(load["2026-09-05"].count).toBe(1);
  });

  it("D. Empty dueDate does not produce arbitrary future dates", () => {
    const emptyDueCard: Flashcard = {
      id: "fc-empty-due",
      area: "GINECOLOGIA_OBSTETRICIA",
      topic: "Obstetrícia",
      front: "P",
      back: "R",
      dueDate: "",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 0,
      masteryLevel: 25,
    };

    expect(SpacedRepetitionService.isValidDate(emptyDueCard.dueDate)).toBe(false);
    expect(SpacedRepetitionService.toLocalDateKey(emptyDueCard.dueDate)).toBe("");
    expect(SpacedRepetitionService.isCardDue(emptyDueCard, deterministicNow)).toBe(true);

    const load = SpacedRepetitionService.getFlashcardReviewLoadByDate([emptyDueCard], deterministicNow);
    expect(load[todayKey].count).toBe(1);
  });

  it("E. Invalid dueDate string is recognized as invalid and handled safely", () => {
    const invalidDueCard: Flashcard = {
      id: "fc-invalid",
      area: "MEDICINA_FAMILIA_COMUNIDADE",
      topic: "SUS",
      front: "P",
      back: "R",
      dueDate: "not-a-valid-timestamp",
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 0,
      masteryLevel: 25,
    };

    expect(SpacedRepetitionService.isValidDate(invalidDueCard.dueDate)).toBe(false);
    expect(SpacedRepetitionService.toLocalDateKey(invalidDueCard.dueDate)).toBe("");
  });

  it("F. Canonical new card created via createInitialFSRSCard follows exact ts-fsrs semantics", () => {
    const newCard = SpacedRepetitionService.createInitialFSRSCard(
      {
        area: "CLINICA_MEDICA",
        topic: "Hematologia",
        front: "Pergunta",
        back: "Resposta",
      },
      deterministicNow
    );

    expect(newCard.state).toBe(State.New);
    expect(newCard.reps).toBe(0);
    expect(newCard.lapses).toBe(0);
    expect(newCard.stability).toBe(0);
    expect(newCard.difficulty).toBe(0);
    expect(newCard.dueDate).toBe(deterministicNow.toISOString());
    expect(SpacedRepetitionService.isCardDue(newCard, deterministicNow)).toBe(true);
  });

  it("G. Single shared function getDueFlashcards ensures 100% count consistency", () => {
    const deck: Flashcard[] = [
      {
        id: "c1",
        area: "CLINICA_MEDICA",
        topic: "T1",
        front: "F",
        back: "B",
        dueDate: "2026-09-02T12:00:00.000Z",
        intervalDays: 1,
        easeFactor: 2.5,
        repetitionCount: 1,
        masteryLevel: 50,
      },
      {
        id: "c2",
        area: "CIRURGIA_GERAL",
        topic: "T2",
        front: "F",
        back: "B",
        dueDate: "2026-09-03T12:00:00.000Z",
        intervalDays: 3,
        easeFactor: 2.5,
        repetitionCount: 2,
        masteryLevel: 60,
      },
      {
        id: "c3",
        area: "PEDIATRIA",
        topic: "T3",
        front: "F",
        back: "B",
        dueDate: "2026-09-10T12:00:00.000Z",
        intervalDays: 7,
        easeFactor: 2.5,
        repetitionCount: 3,
        masteryLevel: 80,
      },
    ];

    const dueList = SpacedRepetitionService.getDueFlashcards(deck, deterministicNow);
    const calendarLoad = SpacedRepetitionService.getFlashcardReviewLoadByDate(deck, deterministicNow);

    expect(dueList.length).toBe(2);
    expect(calendarLoad[todayKey].count).toBe(dueList.length);
  });

  it("H. Midnight boundary 00:05 local time produces the correct local calendar date key", () => {
    // 00:05 local on 2026-09-03
    const localEarly = new Date(2026, 8, 3, 0, 5, 0); // month index 8 is September
    const dateKey = SpacedRepetitionService.toLocalDateKey(localEarly);

    expect(dateKey).toBe("2026-09-03");
  });

  it("I. Midnight boundary 23:55 local time produces the correct local calendar date key", () => {
    // 23:55 local on 2026-09-03
    const localLate = new Date(2026, 8, 3, 23, 55, 0); // month index 8 is September
    const dateKey = SpacedRepetitionService.toLocalDateKey(localLate);

    expect(dateKey).toBe("2026-09-03");
  });

  it("J. ISO strings without timezone offsets are parsed without shifting the user's operational date", () => {
    const isoMidday = "2026-09-03T12:00:00.000Z";
    const dateKey = SpacedRepetitionService.toLocalDateKey(isoMidday);

    expect(dateKey).toBe("2026-09-03");
  });

  it("K. Aggregation function getFlashcardReviewLoadByDate is purely side-effect free", () => {
    const card: Flashcard = {
      id: "fc-immutable",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      front: "F",
      back: "B",
      dueDate: "2026-09-05T12:00:00.000Z",
      intervalDays: 2,
      easeFactor: 2.5,
      repetitionCount: 1,
      masteryLevel: 40,
    };
    const cardClone = JSON.stringify(card);

    SpacedRepetitionService.getFlashcardReviewLoadByDate([card], deterministicNow);

    expect(JSON.stringify(card)).toBe(cardClone);
  });

  it("L. No persisted dueDate is altered or mutated during reading or aggregation", () => {
    const card: Flashcard = {
      id: "fc-past-immutable",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      front: "F",
      back: "B",
      dueDate: "2026-09-01T12:00:00.000Z",
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 1,
      masteryLevel: 40,
    };

    SpacedRepetitionService.getDueFlashcards([card], deterministicNow);
    SpacedRepetitionService.getFlashcardReviewLoadByDate([card], deterministicNow);

    expect(card.dueDate).toBe("2026-09-01T12:00:00.000Z");
  });
});
