import { describe, it, expect, beforeEach } from "vitest";
import { FlashcardProvenanceService } from "../services/flashcardProvenanceService";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { StorageService, FlashcardStorageScope } from "../services/storageService";
import { Flashcard, Question } from "../types";
import { FSRS_CONFIG } from "../config/spacedRepetition";

describe("Flashcard Content Identity & Provenance Contract (Etapa 1.22C)", () => {
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
    verifiedByDoctor: "Dr. Revisor Especialista",
    clinicalVerifiedAt: "2024-05-10",
  };

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Content Fingerprinting", () => {
    it("should generate deterministic content fingerprint with version prefix", () => {
      const front = "Tríade de Beck — Sinais";
      const back = "Hipotensão, Hipofonese de bulhas, Turgência jugular.";
      const mnemonic = "B-E-C-K";

      const fp1 = FlashcardProvenanceService.createFlashcardContentFingerprint(front, back, mnemonic);
      const fp2 = FlashcardProvenanceService.createFlashcardContentFingerprint(front, back, mnemonic);

      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^fc_fp_v1_[0-9a-f]{16}$/);
    });

    it("should produce identical fingerprint regardless of spacing and casing variations", () => {
      const fp1 = FlashcardProvenanceService.createFlashcardContentFingerprint(
        "  Tríade   de Beck — Sinais\n\n",
        "  Hipotensão, Hipofonese de bulhas, Turgência jugular.  ",
        "B-E-C-K"
      );
      const fp2 = FlashcardProvenanceService.createFlashcardContentFingerprint(
        "tríade de beck — sinais",
        "hipotensão, hipofonese de bulhas, turgência jugular.",
        "b-e-c-k"
      );

      expect(fp1).toBe(fp2);
    });

    it("should produce distinct fingerprints for different medical contents", () => {
      const fp1 = FlashcardProvenanceService.createFlashcardContentFingerprint(
        "Tamponamento Cardíaco",
        "Pericardiocentese"
      );
      const fp2 = FlashcardProvenanceService.createFlashcardContentFingerprint(
        "Pneumotórax Hipertensivo",
        "Toracocentese no 2º ou 5º EIC"
      );

      expect(fp1).not.toBe(fp2);
    });
  });

  describe("Question-Derived Provenance Contract", () => {
    it("should capture complete question metadata into FlashcardProvenance", () => {
      const provenance = FlashcardProvenanceService.createQuestionDerivedProvenance(sampleQuestion);

      expect(provenance.origin).toBe("QUESTION_DERIVED");
      expect(provenance.sourceQuestionId).toBe("REV-2024.1-CM-01");
      expect(provenance.sourceCanonicalQuestionId).toBe("CANON-2024.1-01");
      expect(provenance.sourceQuestionFingerprint).toBe("fp_q_cardio_tamponamento_99812");
      expect(provenance.sourceArea).toBe("CLINICA_MEDICA");
      expect(provenance.sourceTopic).toBe("Cardiologia");
      expect(provenance.sourceSubtopic).toBe("Tamponamento Cardíaco");
      expect(provenance.sourceExamEdition).toBe("Revalida INEP 2024/1");
      expect(provenance.sourceExamYear).toBe(2024);
      expect(provenance.contentReviewStatus).toBe("APPROVED");
      expect(provenance.reviewedByDoctor).toBe("Dr. Revisor Especialista");
      expect(provenance.reviewedAt).toBe("2024-05-10");
    });

    it("should not invent missing canonicalTopicId if question does not possess one", () => {
      const provenance = FlashcardProvenanceService.createQuestionDerivedProvenance(sampleQuestion);
      expect(provenance.canonicalTopicId).toBeUndefined();
    });

    it("should capture canonicalTopicId when question provides a valid one", () => {
      const questionWithTopic = {
        ...sampleQuestion,
        canonicalTopicId: "TOPIC-CARDIO-TAMP-01",
      };
      const provenance = FlashcardProvenanceService.createQuestionDerivedProvenance(questionWithTopic);
      expect(provenance.canonicalTopicId).toBe("TOPIC-CARDIO-TAMP-01");
    });
  });

  describe("Provenance Completeness Classification", () => {
    it("should classify question-derived card with fingerprint as COMPLETE", () => {
      const card: Flashcard = {
        id: "fc-test-1",
        area: "CLINICA_MEDICA",
        topic: "Cardiologia",
        front: "F",
        back: "B",
        dueDate: new Date().toISOString(),
        intervalDays: 1,
        easeFactor: 2.5,
        repetitionCount: 0,
        masteryLevel: 25,
        provenance: FlashcardProvenanceService.createQuestionDerivedProvenance(sampleQuestion),
      };

      const status = FlashcardProvenanceService.getFlashcardProvenanceStatus(card);
      expect(status).toBe("COMPLETE");
    });

    it("should classify legacy cards or cards without provenance as LEGACY_OR_UNKNOWN", () => {
      const cardWithoutProv: Flashcard = {
        id: "fc-legacy-1",
        area: "CIRURGIA_GERAL",
        topic: "Trauma",
        front: "F",
        back: "B",
        dueDate: new Date().toISOString(),
        intervalDays: 1,
        easeFactor: 2.5,
        repetitionCount: 0,
        masteryLevel: 25,
      };

      const status1 = FlashcardProvenanceService.getFlashcardProvenanceStatus(cardWithoutProv);
      expect(status1).toBe("LEGACY_OR_UNKNOWN");

      const cardWithLegacyProv: Flashcard = {
        ...cardWithoutProv,
        provenance: FlashcardProvenanceService.createLegacyProvenance("LEGACY_LOCAL"),
      };
      const status2 = FlashcardProvenanceService.getFlashcardProvenanceStatus(cardWithLegacyProv);
      expect(status2).toBe("LEGACY_OR_UNKNOWN");
    });
  });

  describe("Integration with FSRS and Storage Persistence", () => {
    it("should preserve provenance and contentFingerprint across FSRS reviews", () => {
      const provenance = FlashcardProvenanceService.createQuestionDerivedProvenance(sampleQuestion);
      const initialCard = SpacedRepetitionService.createInitialFSRSCard({
        area: sampleQuestion.area,
        topic: sampleQuestion.topic,
        front: sampleQuestion.keyFinding,
        back: sampleQuestion.expectedConduct,
        provenance,
      });

      expect(initialCard.provenance?.sourceQuestionId).toBe("REV-2024.1-CM-01");
      expect(initialCard.contentFingerprint).toBeDefined();
      expect(initialCard.contentFingerprintVersion).toBe(1);
      expect(initialCard.contentVersion).toBe(1);

      // Perform FSRS review
      const reviewedCard = SpacedRepetitionService.scheduleFSRSReview(initialCard, "MEDIUM");

      // Verify FSRS state updated
      expect(reviewedCard.reps).toBe(1);
      expect(reviewedCard.stability).toBeGreaterThan(0);

      // Verify Provenance & Content Identity intact
      expect(reviewedCard.provenance).toEqual(provenance);
      expect(reviewedCard.contentFingerprint).toBe(initialCard.contentFingerprint);
      expect(reviewedCard.contentFingerprintVersion).toBe(1);
      expect(reviewedCard.contentVersion).toBe(1);
    });

    it("should serialize and restore provenance and content identity in user-scoped storage", () => {
      const scope: FlashcardStorageScope = { userId: "user-provenance-test", isGuest: false };
      const provenance = FlashcardProvenanceService.createQuestionDerivedProvenance(sampleQuestion);

      const card = SpacedRepetitionService.createInitialFSRSCard({
        area: sampleQuestion.area,
        topic: sampleQuestion.topic,
        front: sampleQuestion.keyFinding,
        back: sampleQuestion.expectedConduct,
        provenance,
      });

      StorageService.saveFlashcards([card], scope);

      const loaded = StorageService.getFlashcards(scope);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(card.id);
      expect(loaded[0].provenance?.origin).toBe("QUESTION_DERIVED");
      expect(loaded[0].provenance?.sourceQuestionId).toBe("REV-2024.1-CM-01");
      expect(loaded[0].provenance?.sourceQuestionFingerprint).toBe("fp_q_cardio_tamponamento_99812");
      expect(loaded[0].contentFingerprint).toBe(card.contentFingerprint);
    });

    it("should enrich imported legacy cards with IMPORTED_LEGACY provenance and deterministic fingerprint", () => {
      const legacyCard: Flashcard = {
        id: "fc-legacy-old-1",
        area: "PEDIATRIA",
        topic: "Pneumologia",
        front: "Bronquiolite Viral Aguda",
        back: "Oxigenoterapia e hidratação se necessário.",
        dueDate: "2026-09-03T12:00:00.000Z",
        intervalDays: 2,
        easeFactor: 2.5,
        repetitionCount: 1,
        masteryLevel: 30,
      };

      localStorage.setItem("praxis_flashcards_v2", JSON.stringify([legacyCard]));

      const scope: FlashcardStorageScope = { userId: "user-legacy-import", isGuest: false };
      const imported = StorageService.importLegacyFlashcards(scope);

      expect(imported).toHaveLength(1);
      expect(imported[0].provenance?.origin).toBe("IMPORTED_LEGACY");
      expect(imported[0].contentFingerprint).toMatch(/^fc_fp_v1_[0-9a-f]{16}$/);
      expect(imported[0].contentFingerprintVersion).toBe(1);
      expect(imported[0].schedulerVersion).toBe(FSRS_CONFIG.schedulerVersion);
    });
  });
});
