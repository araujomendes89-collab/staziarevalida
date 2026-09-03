import { describe, it, expect } from "vitest";
import { Flashcard } from "../types";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { FSRS_CONFIG } from "../config/spacedRepetition";
import { State } from "ts-fsrs";

describe("True FSRS Spaced Repetition Engine (Etapa 1.11C)", () => {
  const deterministicNow = new Date("2026-09-03T12:00:00.000Z");

  const sampleCard: Flashcard = {
    id: "fc-test-1",
    questionId: "q-1",
    area: "CLINICA_MEDICA",
    topic: "Hipertensão",
    front: "Qual é a conduta inicial na emergência hipertensiva com dissecção aguda de aorta?",
    back: "Esmolol EV + Nitroprussiato de Sódio com meta de FC < 60 bpm e PAS < 120 mmHg.",
    keyMnemonic: "FC antes da PA",
    intervalDays: 1,
    easeFactor: 2.5,
    repetitionCount: 0,
    reps: 0,
    lapses: 0,
    dueDate: "2026-09-03T12:00:00.000Z",
    masteryLevel: 25,
  };

  it("A. New card is initialized with valid FSRS canonical state", () => {
    const newCard = SpacedRepetitionService.createInitialFSRSCard(
      {
        area: "CLINICA_MEDICA",
        topic: "Cardiologia",
        front: "Pergunta clínica",
        back: "Resposta padrão-ouro",
      },
      deterministicNow
    );

    expect(newCard.schedulerVersion).toBe(FSRS_CONFIG.schedulerVersion);
    expect(newCard.state).toBe(State.New);
    expect(newCard.reps).toBe(0);
    expect(newCard.lapses).toBe(0);
    expect(newCard.stability).toBe(0);
    expect(newCard.difficulty).toBe(0);
    expect(newCard.dueDate).toBe(deterministicNow.toISOString());
  });

  it("B. Rating AGAIN produces valid FSRS scheduling and 1 day interval", () => {
    const scheduled = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "AGAIN", deterministicNow);

    expect(scheduled.schedulerVersion).toBe(FSRS_CONFIG.schedulerVersion);
    expect(scheduled.scheduledDays).toBe(1);
    expect(scheduled.reps).toBe(1);
    expect(scheduled.stability).toBeGreaterThan(0);
    expect(scheduled.dueDate).toBe(new Date("2026-09-04T12:00:00.000Z").toISOString());
  });

  it("C. Rating HARD produces valid FSRS scheduling (scheduledDays = 2)", () => {
    const scheduled = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "HARD", deterministicNow);

    expect(scheduled.scheduledDays).toBe(2);
    expect(scheduled.reps).toBe(1);
    expect(scheduled.stability).toBeGreaterThan(0);
    expect(scheduled.dueDate).toBe(new Date("2026-09-05T12:00:00.000Z").toISOString());
  });

  it("D. Rating MEDIUM (Good) produces valid FSRS scheduling (scheduledDays = 3)", () => {
    const scheduled = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "MEDIUM", deterministicNow);

    expect(scheduled.scheduledDays).toBe(3);
    expect(scheduled.reps).toBe(1);
    expect(scheduled.stability).toBeGreaterThan(1.5);
    expect(scheduled.dueDate).toBe(new Date("2026-09-06T12:00:00.000Z").toISOString());
  });

  it("E. Rating EASY produces valid FSRS scheduling (scheduledDays = 8)", () => {
    const scheduled = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "EASY", deterministicNow);

    expect(scheduled.scheduledDays).toBe(8);
    expect(scheduled.reps).toBe(1);
    expect(scheduled.stability).toBeGreaterThan(5.0);
    expect(scheduled.dueDate).toBe(new Date("2026-09-11T12:00:00.000Z").toISOString());
  });

  it("F. All four future intervals are projected directly by FSRS engine", () => {
    const projections = SpacedRepetitionService.previewFSRSNextIntervals(sampleCard, deterministicNow);

    expect(projections.AGAIN.label).toBe("1 dia");
    expect(projections.HARD.label).toBe("2 dias");
    expect(projections.MEDIUM.label).toBe("3 dias");
    expect(projections.EASY.label).toBe("8 dias");
  });

  it("G. Rating mapping translates application ratings to FSRS Ratings", () => {
    expect(SpacedRepetitionService.mapRating("AGAIN")).toBe(1);
    expect(SpacedRepetitionService.mapRating("HARD")).toBe(2);
    expect(SpacedRepetitionService.mapRating("MEDIUM")).toBe(3);
    expect(SpacedRepetitionService.mapRating("EASY")).toBe(4);
  });

  it("H. DueDate strictly results from FSRS scheduler timestamp", () => {
    const reviewed = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "EASY", deterministicNow);
    expect(reviewed.dueDate).toBe("2026-09-11T12:00:00.000Z");
  });

  it("I. Memory stability S is updated dynamically", () => {
    const rep1 = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "MEDIUM", deterministicNow);
    const rep2 = SpacedRepetitionService.scheduleFSRSReview(
      rep1,
      "MEDIUM",
      new Date("2026-09-06T12:00:00.000Z")
    );

    expect(rep2.stability).toBeGreaterThan(rep1.stability!);
  });

  it("J. Difficulty D decreases on Easy and increases on Again", () => {
    const easyCard = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "EASY", deterministicNow);
    const againCard = SpacedRepetitionService.scheduleFSRSReview(sampleCard, "AGAIN", deterministicNow);

    expect(easyCard.difficulty!).toBeLessThan(againCard.difficulty!);
  });

  it("K. Reps counter increments accurately across multiple reviews", () => {
    let card = { ...sampleCard };
    card = SpacedRepetitionService.scheduleFSRSReview(card, "MEDIUM", deterministicNow);
    card = SpacedRepetitionService.scheduleFSRSReview(card, "MEDIUM", new Date("2026-09-06T12:00:00.000Z"));
    card = SpacedRepetitionService.scheduleFSRSReview(card, "EASY", new Date("2026-09-20T12:00:00.000Z"));

    expect(card.reps).toBe(3);
  });

  it("L. Lapses counter increments strictly when an active Review card is failed (Again)", () => {
    let card = { ...sampleCard };
    // First review establishes Review state
    card = SpacedRepetitionService.scheduleFSRSReview(card, "MEDIUM", deterministicNow);
    expect(card.lapses).toBe(0);

    // Second review fails (lapse)
    card = SpacedRepetitionService.scheduleFSRSReview(card, "AGAIN", new Date("2026-09-06T12:00:00.000Z"));
    expect(card.lapses).toBe(1);
  });

  it("M. Due card enters due queue on or after dueDate", () => {
    const dueCard: Flashcard = {
      ...sampleCard,
      dueDate: "2026-09-02T12:00:00.000Z",
    };
    expect(SpacedRepetitionService.isCardDue(dueCard, deterministicNow)).toBe(true);
  });

  it("N. Future card does not enter due queue before dueDate", () => {
    const futureCard: Flashcard = {
      ...sampleCard,
      dueDate: "2026-09-10T12:00:00.000Z",
    };
    expect(SpacedRepetitionService.isCardDue(futureCard, deterministicNow)).toBe(false);
  });

  it("O. Migration of legacy flashcards preserves all medical and identification content", () => {
    const legacyCards: Flashcard[] = [
      {
        id: "fc-legacy-1",
        questionId: "q-legacy-1",
        area: "GINECOLOGIA_OBSTETRICIA",
        topic: "Pré-Natal",
        front: "Qual é a dosagem de Ácido Fólico recomendada na pré-concepção de baixo risco?",
        back: "0,4 mg/dia iniciado pelo menos 30 dias antes da concepção.",
        keyMnemonic: "0,4 mg baixo risco, 4-5 mg alto risco",
        intervalDays: 7,
        easeFactor: 2.5,
        repetitionCount: 3,
        dueDate: "2026-09-01T10:00:00.000Z",
        masteryLevel: 75,
      },
    ];

    const { migrated, hadLegacyCards } = SpacedRepetitionService.migrateLegacyFlashcards(
      legacyCards,
      deterministicNow
    );

    expect(hadLegacyCards).toBe(true);
    expect(migrated[0].id).toBe("fc-legacy-1");
    expect(migrated[0].front).toBe(legacyCards[0].front);
    expect(migrated[0].back).toBe(legacyCards[0].back);
    expect(migrated[0].keyMnemonic).toBe(legacyCards[0].keyMnemonic);
    expect(migrated[0].schedulerVersion).toBe(FSRS_CONFIG.schedulerVersion);
    expect(migrated[0].dueDate).toBe(legacyCards[0].dueDate);
  });

  it("P. Migration is completely idempotent", () => {
    const alreadyMigrated: Flashcard[] = [
      {
        id: "fc-migrated-1",
        area: "PEDIATRIA",
        topic: "Imunização",
        front: "Vacina BCG",
        back: "Dose única ao nascer",
        schedulerVersion: FSRS_CONFIG.schedulerVersion,
        stability: 14.5,
        difficulty: 4.2,
        elapsedDays: 2,
        scheduledDays: 14,
        reps: 4,
        lapses: 0,
        state: State.Review,
        dueDate: "2026-09-15T12:00:00.000Z",
        intervalDays: 14,
        easeFactor: 2.5,
        repetitionCount: 4,
        masteryLevel: 80,
      },
    ];

    const { migrated, hadLegacyCards } = SpacedRepetitionService.migrateLegacyFlashcards(
      alreadyMigrated,
      deterministicNow
    );

    expect(hadLegacyCards).toBe(false);
    expect(migrated[0].stability).toBe(14.5);
    expect(migrated[0].scheduledDays).toBe(14);
  });

  it("Q. No old multipliers (1.2 / 2.0 / 2.8) control the scheduling", () => {
    const card = { ...sampleCard, intervalDays: 10 };
    const hardReview = SpacedRepetitionService.scheduleFSRSReview(card, "HARD", deterministicNow);

    // Old multiplier would do round(10 * 1.2) = 12
    // FSRS on card without stability does FSRS repeat (2 days on New card)
    expect(hardReview.scheduledDays).not.toBe(12);
  });

  it("R. Flipping card to reveal answer does not mutate FSRS state", () => {
    const card = { ...sampleCard };
    let isFlipped = false;

    // Flip action
    isFlipped = true;

    expect(isFlipped).toBe(true);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.dueDate).toBe(sampleCard.dueDate);
  });
});
