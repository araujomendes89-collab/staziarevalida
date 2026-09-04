import { describe, it, expect, beforeEach } from "vitest";
import { FlashcardStorageAdapter } from "../services/flashcardStorageAdapter";
import { FlashcardProvenanceService } from "../services/flashcardProvenanceService";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import {
  StorageService,
  getFlashcardStorageKeyV4,
  getFlashcardStorageKeyV3,
  FlashcardStorageScope,
} from "../services/storageService";
import { Flashcard, Question } from "../types";
import { FSRS_CONFIG } from "../config/spacedRepetition";

describe("Flashcard Content/State Local Split V4 (Etapa 1.22E)", () => {
  const sampleQuestion: Question = {
    id: "REV-2024.1-CM-01",
    canonicalQuestionId: "CANON-2024.1-01",
    questionFingerprint: "fp_q_cardio_tamponamento_99812",
    code: "REV-2024.1-CM-01",
    origin: "INEP_OFICIAL",
    examYear: 2024,
    examEdition: "Revalida INEP 2024/1",
    area: "CLINICA_MEDICA",
    topic: "Cardiologia",
    subtopic: "Tamponamento Cardíaco",
    competencyId: "COMP-CM-01",
    competencyDescription: "Reconhecimento da Tríade de Beck",
    difficulty: "MEDIO",
    clinicalCase: "Paciente jovem com trauma torácico fechado e hipotensão.",
    options: [
      { id: "A", text: "Pericardiocentese", isCorrect: true, explanation: "Descompressão imediata" },
      { id: "B", text: "Toracotomia", isCorrect: false, explanation: "Incorreto" },
    ],
    correctAnswer: "A",
    answerFinal: "A",
    officialStatus: "valid",
    extractionConfidence: "HIGH",
    keyFinding: "Tríade de Beck: Hipotensão, abafamento de bulhas e turgência jugular",
    expectedConduct: "Pericardiocentese de alívio guiada por ultrassom",
    inepIntent: "Avaliar conduta emergencial no tamponamento cardíaco",
    sources: [{ title: "Diretriz SBC", organization: "SBC", year: 2023, reliability: "SOCIEDADE_ESPECIALIDADE" }],
    brazilContextNote: "Protocolo de emergência do SAMU 192 e Sala Vermelha SUS",
    stats: { totalAttempts: 10, successRate: 70, averageTimeSeconds: 45 },
  };

  const sampleCardV3: Flashcard = {
    id: "fc-cardio-1",
    canonicalTopicId: "TOPIC-CARDIO-01",
    area: "CLINICA_MEDICA",
    topic: "Cardiologia",
    front: "Tríade de Beck",
    back: "Hipotensão, Hipofonese de bulhas, Turgência jugular.",
    keyMnemonic: "B-E-C-K",
    provenance: FlashcardProvenanceService.createQuestionDerivedProvenance(sampleQuestion),
    contentFingerprint: FlashcardProvenanceService.createFlashcardContentFingerprint(
      "Tríade de Beck",
      "Hipotensão, Hipofonese de bulhas, Turgência jugular.",
      "B-E-C-K"
    ),
    contentFingerprintVersion: 1,
    contentVersion: 1,
    schedulerVersion: FSRS_CONFIG.schedulerVersion,
    stability: 5.5,
    difficulty: 4.2,
    elapsedDays: 2,
    scheduledDays: 6,
    reps: 3,
    lapses: 0,
    state: 2,
    lastReviewed: "2026-09-01T12:00:00.000Z",
    dueDate: "2026-09-07T12:00:00.000Z",
    intervalDays: 6,
    easeFactor: 2.5,
    repetitionCount: 3,
    masteryLevel: 65,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Adapter & Model Deconstruction", () => {
    it("should deconstruct a monolithic card into Content and UserState linked by localBridgeId", () => {
      const { content, userState } = FlashcardStorageAdapter.deconstructFlashcardItem(sampleCardV3, "user-alpha");

      // Verify Content
      expect(content.localBridgeId).toBe("fc-cardio-1");
      expect(content.front).toBe("Tríade de Beck");
      expect(content.back).toBe("Hipotensão, Hipofonese de bulhas, Turgência jugular.");
      expect(content.provenance.sourceQuestionId).toBe("REV-2024.1-CM-01");
      expect(content.contentFingerprint).toMatch(/^fc_fp_v1_[0-9a-f]{16}$/);

      // Verify UserState
      expect(userState.localBridgeId).toBe("fc-cardio-1");
      expect(userState.userId).toBe("user-alpha");
      expect(userState.stability).toBe(5.5);
      expect(userState.difficulty).toBe(4.2);
      expect(userState.dueDate).toBe("2026-09-07T12:00:00.000Z");
      expect(userState.reps).toBe(3);
      expect(userState.lapses).toBe(0);
    });

    it("should hydrate decoupled Content and UserState back into a compatible Flashcard view model", () => {
      const { content, userState } = FlashcardStorageAdapter.deconstructFlashcardItem(sampleCardV3, "user-alpha");
      const hydrated = FlashcardStorageAdapter.hydrateFlashcardItem(content, userState);

      expect(hydrated.id).toBe(sampleCardV3.id);
      expect(hydrated.front).toBe(sampleCardV3.front);
      expect(hydrated.back).toBe(sampleCardV3.back);
      expect(hydrated.stability).toBe(sampleCardV3.stability);
      expect(hydrated.dueDate).toBe(sampleCardV3.dueDate);
      expect(hydrated.reps).toBe(sampleCardV3.reps);
      expect(hydrated.provenance).toEqual(sampleCardV3.provenance);
      expect(hydrated.contentFingerprint).toBe(sampleCardV3.contentFingerprint);
    });
  });

  describe("V3 to V4 Automatic Migration", () => {
    it("should automatically migrate V3 array storage to V4 single envelope on first read", () => {
      const scope: FlashcardStorageScope = { userId: "user-mig-1", isGuest: false };
      const v3Key = getFlashcardStorageKeyV3(scope);
      const v4Key = getFlashcardStorageKeyV4(scope);

      // Plant V3 data
      localStorage.setItem(v3Key, JSON.stringify([sampleCardV3]));

      // Query via StorageService
      const cards = StorageService.getFlashcards(scope);
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe("fc-cardio-1");
      expect(cards[0].stability).toBe(5.5);

      // Verify V4 envelope was created and persisted
      const v4Raw = localStorage.getItem(v4Key);
      expect(v4Raw).not.toBeNull();
      const v4Envelope = JSON.parse(v4Raw!);
      expect(v4Envelope.schemaVersion).toBe(4);
      expect(v4Envelope.contents["fc-cardio-1"]).toBeDefined();
      expect(v4Envelope.userStates["fc-cardio-1"]).toBeDefined();
      expect(v4Envelope.userStates["fc-cardio-1"].stability).toBe(5.5);

      // Verify V3 key was preserved as rollback source
      expect(localStorage.getItem(v3Key)).not.toBeNull();
    });

    it("should be idempotent when migrated multiple times without duplicating cards or modifying FSRS", () => {
      const scope: FlashcardStorageScope = { userId: "user-mig-2", isGuest: false };
      const v3Key = getFlashcardStorageKeyV3(scope);
      const v4Key = getFlashcardStorageKeyV4(scope);

      localStorage.setItem(v3Key, JSON.stringify([sampleCardV3]));

      // First run
      const run1 = StorageService.getFlashcards(scope);
      const v4Envelope1 = JSON.parse(localStorage.getItem(v4Key)!);

      // Second run
      const run2 = StorageService.getFlashcards(scope);
      const v4Envelope2 = JSON.parse(localStorage.getItem(v4Key)!);

      expect(run1).toHaveLength(1);
      expect(run2).toHaveLength(1);
      expect(Object.keys(v4Envelope1.contents)).toHaveLength(1);
      expect(Object.keys(v4Envelope2.contents)).toHaveLength(1);
      expect(v4Envelope1.userStates["fc-cardio-1"].dueDate).toBe(v4Envelope2.userStates["fc-cardio-1"].dueDate);
      expect(v4Envelope1.userStates["fc-cardio-1"].stability).toBe(v4Envelope2.userStates["fc-cardio-1"].stability);
    });
  });

  describe("Content Immutability during Review", () => {
    it("should update ONLY UserFlashcardState during review rating while keeping FlashcardContent immutable", () => {
      const scope: FlashcardStorageScope = { userId: "user-rating-test", isGuest: false };
      const v4Key = getFlashcardStorageKeyV4(scope);

      // Save initial card
      StorageService.saveFlashcards([sampleCardV3], scope);

      const envelopeBefore = JSON.parse(localStorage.getItem(v4Key)!);
      const contentBefore = envelopeBefore.contents["fc-cardio-1"];
      const stateBefore = envelopeBefore.userStates["fc-cardio-1"];

      // Simulate FSRS rating (e.g. Good/Medium)
      const reviewedCard = SpacedRepetitionService.scheduleFSRSReview(sampleCardV3, "MEDIUM");
      StorageService.saveFlashcards([reviewedCard], scope);

      const envelopeAfter = JSON.parse(localStorage.getItem(v4Key)!);
      const contentAfter = envelopeAfter.contents["fc-cardio-1"];
      const stateAfter = envelopeAfter.userStates["fc-cardio-1"];

      // Content MUST remain 100% byte-for-byte identical
      expect(contentAfter.front).toBe(contentBefore.front);
      expect(contentAfter.back).toBe(contentBefore.back);
      expect(contentAfter.provenance).toEqual(contentBefore.provenance);
      expect(contentAfter.contentFingerprint).toBe(contentBefore.contentFingerprint);
      expect(contentAfter.contentVersion).toBe(contentBefore.contentVersion);

      // UserState MUST be updated with new FSRS metrics
      expect(stateAfter.reps).toBe(stateBefore.reps + 1);
      expect(stateAfter.stability).not.toBe(stateBefore.stability);
      expect(stateAfter.dueDate).not.toBe(stateBefore.dueDate);
    });
  });

  describe("Direct V2 Legacy Import into V4", () => {
    it("should import V2 legacy cards directly into the active user's V4 single envelope", () => {
      const scope: FlashcardStorageScope = { userId: "user-v2-import", isGuest: false };
      const v4Key = getFlashcardStorageKeyV4(scope);

      const legacyCard: Flashcard = {
        id: "fc-legacy-direct-1",
        area: "PEDIATRIA",
        topic: "Neonatologia",
        front: "APGAR no 1º e 5º minuto",
        back: "Avalia FC, respiração, tônus, irritabilidade e cor.",
        dueDate: "2026-09-03T12:00:00.000Z",
        intervalDays: 1,
        easeFactor: 2.5,
        repetitionCount: 1,
        masteryLevel: 25,
      };

      localStorage.setItem("praxis_flashcards_v2", JSON.stringify([legacyCard]));

      const imported = StorageService.importLegacyFlashcards(scope);
      expect(imported).toHaveLength(1);
      expect(imported[0].id).toBe("fc-legacy-direct-1");
      expect(imported[0].provenance?.origin).toBe("IMPORTED_LEGACY");

      // Verify V4 envelope is created directly
      const v4Raw = localStorage.getItem(v4Key);
      expect(v4Raw).not.toBeNull();
      const envelope = JSON.parse(v4Raw!);
      expect(envelope.schemaVersion).toBe(4);
      expect(envelope.contents["fc-legacy-direct-1"]).toBeDefined();
      expect(envelope.userStates["fc-legacy-direct-1"]).toBeDefined();
    });
  });
});
