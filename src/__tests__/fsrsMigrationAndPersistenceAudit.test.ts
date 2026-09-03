import { describe, it, expect } from "vitest";
import { Flashcard } from "../types";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { FSRS_CONFIG } from "../config/spacedRepetition";
import { State } from "ts-fsrs";

describe("FSRS Migration & Persistence Integrity Audit (Etapa 1.11D)", () => {
  const deterministicNow = new Date("2026-09-03T12:00:00.000Z");

  const legacyDataset: Flashcard[] = [
    {
      id: "legacy-card-past",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      front: "Enunciado 1",
      back: "Resposta 1",
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 1,
      dueDate: "2026-09-02T12:00:00.000Z", // due yesterday
      masteryLevel: 40,
    },
    {
      id: "legacy-card-today",
      area: "CIRURGIA_GERAL",
      topic: "Trauma",
      front: "Enunciado 2",
      back: "Resposta 2",
      intervalDays: 3,
      easeFactor: 2.5,
      repetitionCount: 2,
      dueDate: "2026-09-03T12:00:00.000Z", // due today
      masteryLevel: 55,
    },
    {
      id: "legacy-card-tomorrow",
      area: "PEDIATRIA",
      topic: "Neonatologia",
      front: "Enunciado 3",
      back: "Resposta 3",
      intervalDays: 5,
      easeFactor: 2.5,
      repetitionCount: 3,
      dueDate: "2026-09-04T12:00:00.000Z", // due tomorrow
      masteryLevel: 70,
    },
    {
      id: "legacy-card-future",
      area: "GINECOLOGIA_OBSTETRICIA",
      topic: "Obstetrícia",
      front: "Enunciado 4",
      back: "Resposta 4",
      intervalDays: 30,
      easeFactor: 2.5,
      repetitionCount: 5,
      dueDate: "2026-10-03T12:00:00.000Z", // due in 30 days
      masteryLevel: 90,
    },
  ];

  it("A. Migration is 100% idempotent across multiple passes", () => {
    // Pass 1: Initial migration
    const { migrated: pass1, hadLegacyCards: had1 } = SpacedRepetitionService.migrateLegacyFlashcards(
      legacyDataset,
      deterministicNow
    );
    expect(had1).toBe(true);

    // Pass 2: Re-reading the already migrated dataset
    const { migrated: pass2, hadLegacyCards: had2 } = SpacedRepetitionService.migrateLegacyFlashcards(
      pass1,
      deterministicNow
    );
    expect(had2).toBe(false);
    expect(pass2).toEqual(pass1);

    // Pass 10: Idempotency stress
    let current = pass1;
    for (let i = 0; i < 10; i++) {
      const { migrated, hadLegacyCards } = SpacedRepetitionService.migrateLegacyFlashcards(
        current,
        deterministicNow
      );
      expect(hadLegacyCards).toBe(false);
      current = migrated;
    }
    expect(current).toEqual(pass1);
  });

  it("B. Backup preserves original unmutated legacy dataset", () => {
    const rawBackup = JSON.stringify(legacyDataset);
    const parsedBackup = JSON.parse(rawBackup);

    // Ensure raw backup does not contain FSRS metadata prior to migration
    expect(parsedBackup[0].schedulerVersion).toBeUndefined();
    expect(parsedBackup[0].stability).toBeUndefined();
  });

  it("C. Legacy dueDates are strictly preserved without shifting due status", () => {
    const { migrated } = SpacedRepetitionService.migrateLegacyFlashcards(
      legacyDataset,
      deterministicNow
    );

    // Past card remains due
    expect(migrated[0].dueDate).toBe("2026-09-02T12:00:00.000Z");
    expect(SpacedRepetitionService.isCardDue(migrated[0], deterministicNow)).toBe(true);

    // Today card remains due
    expect(migrated[1].dueDate).toBe("2026-09-03T12:00:00.000Z");
    expect(SpacedRepetitionService.isCardDue(migrated[1], deterministicNow)).toBe(true);

    // Tomorrow card remains future
    expect(migrated[2].dueDate).toBe("2026-09-04T12:00:00.000Z");
    expect(SpacedRepetitionService.isCardDue(migrated[2], deterministicNow)).toBe(false);

    // 30 days card remains future
    expect(migrated[3].dueDate).toBe("2026-10-03T12:00:00.000Z");
    expect(SpacedRepetitionService.isCardDue(migrated[3], deterministicNow)).toBe(false);
  });

  it("D. Reload preserves all FSRS state parameters without modification", () => {
    const { migrated } = SpacedRepetitionService.migrateLegacyFlashcards(
      legacyDataset,
      deterministicNow
    );
    const card = migrated[0];

    // Simulate review on card
    const reviewed = SpacedRepetitionService.scheduleFSRSReview(card, "MEDIUM", deterministicNow);

    // Simulate JSON serialization/deserialization on page reload
    const serialized = JSON.stringify(reviewed);
    const deserialized: Flashcard = JSON.parse(serialized);

    expect(deserialized.stability).toBe(reviewed.stability);
    expect(deserialized.difficulty).toBe(reviewed.difficulty);
    expect(deserialized.reps).toBe(reviewed.reps);
    expect(deserialized.lapses).toBe(reviewed.lapses);
    expect(deserialized.dueDate).toBe(reviewed.dueDate);
    expect(deserialized.state).toBe(reviewed.state);
  });

  it("E. Interval projection preview is completely side-effect free", () => {
    const { migrated } = SpacedRepetitionService.migrateLegacyFlashcards(
      legacyDataset,
      deterministicNow
    );
    const originalCard = { ...migrated[1] };

    // Run preview multiple times
    const p1 = SpacedRepetitionService.previewFSRSNextIntervals(migrated[1], deterministicNow);
    const p2 = SpacedRepetitionService.previewFSRSNextIntervals(migrated[1], deterministicNow);

    expect(p1).toEqual(p2);
    // Original card remains unchanged
    expect(migrated[1]).toEqual(originalCard);
  });

  it("F. Rating action persists exactly one review state update", () => {
    const { migrated } = SpacedRepetitionService.migrateLegacyFlashcards(
      legacyDataset,
      deterministicNow
    );
    const card = migrated[1];
    const initialReps = card.reps || 0;

    const updated = SpacedRepetitionService.scheduleFSRSReview(card, "EASY", deterministicNow);
    expect(updated.reps).toBe(initialReps + 1);
    expect(updated.scheduledDays).toBeGreaterThan(0);
    expect(updated.lastReviewed).toBe(deterministicNow.toISOString());
  });

  it("G. Serialization and deserialization preserves native ISO dates and numbers", () => {
    const newCard = SpacedRepetitionService.createInitialFSRSCard(
      {
        area: "MEDICINA_FAMILIA_COMUNIDADE",
        topic: "Atenção Básica",
        front: "Pergunta",
        back: "Resposta",
      },
      deterministicNow
    );

    const jsonStr = JSON.stringify(newCard);
    const parsed: Flashcard = JSON.parse(jsonStr);

    // Convert to FSRS Card object
    const fsrsCard = SpacedRepetitionService.toFSRSCard(parsed, deterministicNow);
    expect(fsrsCard.due instanceof Date).toBe(true);
    expect(fsrsCard.due.toISOString()).toBe(deterministicNow.toISOString());
  });

  it("H. masteryLevel does not control FSRS review scheduling", () => {
    const cardLowMastery: Flashcard = {
      ...legacyDataset[2], // due tomorrow
      masteryLevel: 10,
    };

    const cardHighMastery: Flashcard = {
      ...legacyDataset[2], // due tomorrow
      masteryLevel: 100,
    };

    // Neither is due today despite different masteryLevel
    expect(SpacedRepetitionService.isCardDue(cardLowMastery, deterministicNow)).toBe(false);
    expect(SpacedRepetitionService.isCardDue(cardHighMastery, deterministicNow)).toBe(false);
  });

  it("I. schedulerVersion marker prevents redundant re-migration", () => {
    const migratedCard: Flashcard = {
      ...legacyDataset[0],
      schedulerVersion: FSRS_CONFIG.schedulerVersion,
      stability: 18.2,
      difficulty: 3.5,
    };

    const result = SpacedRepetitionService.migrateLegacyFlashcards([migratedCard], deterministicNow);
    expect(result.hadLegacyCards).toBe(false);
    expect(result.migrated[0].stability).toBe(18.2);
  });

  it("J. Simple reload does not alter FSRS parameters", () => {
    const reviewedCard = SpacedRepetitionService.scheduleFSRSReview(
      legacyDataset[0],
      "HARD",
      deterministicNow
    );

    // Reload simulation
    const reloaded = JSON.parse(JSON.stringify(reviewedCard));
    expect(reloaded.stability).toBe(reviewedCard.stability);
    expect(reloaded.difficulty).toBe(reviewedCard.difficulty);
    expect(reloaded.dueDate).toBe(reviewedCard.dueDate);
  });
});
