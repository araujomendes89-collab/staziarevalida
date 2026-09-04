import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateCanonicalFlashcardDocument,
  parseCanonicalFlashcard,
} from "../services/canonicalFlashcardValidator";
import {
  CanonicalFlashcardCatalogService,
  CANONICAL_FLASHCARDS_COLLECTION,
} from "../services/canonicalFlashcardCatalogService";
import { CanonicalFlashcardContent } from "../types/canonicalFlashcard";
import * as firestoreModule from "firebase/firestore";

// Mock Firebase Firestore
vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<any>("firebase/firestore");
  return {
    ...actual,
    doc: vi.fn(),
    getDoc: vi.fn(),
    collection: vi.fn(),
    getDocs: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
});

describe("Canonical Flashcard Validator & Parser", () => {
  const validPublishedPayload: CanonicalFlashcardContent = {
    contentId: "c_fc_2026_test_01",
    currentRevision: 1,
    currentSemanticVersion: 1,
    front: "Qual a conduta imediata na crise hipertensiva com lesão de órgão-alvo?",
    back: "Transferência para UTI e redução pressórica com nitroprussiato ou nitroglicerina IV.",
    keyMnemonic: "NIPRIDE_EMERGENCIA",
    canonicalTopicId: "cm-01", // Hipertensão Arterial Sistêmica
    areaId: "clinica-medica",
    area: "CLINICA_MEDICA",
    cardPurpose: "MANAGEMENT",
    contentFingerprint: "fc_fp_v1_abcdef123456",
    contentFingerprintVersion: 1,
    reviewStatus: "MEDICAL_REVIEWED",
    editorialReviewStatus: "EDITORIAL_REVIEWED",
    publicationStatus: "PUBLISHED",
    assessmentSource: {
      examYear: 2024,
      examEdition: "Revalida INEP 2024/1",
      originalNumber: 12,
      itemCode: "REV-2024.1-CM-12",
    },
    medicalEvidence: {
      sourceType: "GOVERNMENT_HEALTH",
      title: "Diretriz Brasileira de Hipertensão Arterial",
      publisher: "SBC / Ministério da Saúde",
      publicationYear: 2020,
      url: "https://www.gov.br/saude",
      versionStatus: "CURRENT_VERIFIED",
      verificationStatus: "VERIFIED_PRIMARY_SOURCE",
    },
    publishedAt: "2026-01-15T10:00:00Z",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
  };

  it("should validate and parse a fully conformant PUBLISHED canonical flashcard", () => {
    const result = validateCanonicalFlashcardDocument(validPublishedPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.contentId).toBe("c_fc_2026_test_01");
    expect(result.parsed?.area).toBe("CLINICA_MEDICA");
    expect(result.parsed?.areaId).toBe("clinica-medica");
    expect(result.parsed?.cardPurpose).toBe("MANAGEMENT");
  });

  it("should reject payload with missing contentId", () => {
    const payload = { ...validPublishedPayload, contentId: "" };
    const result = validateCanonicalFlashcardDocument(payload);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing or invalid 'contentId'");
  });

  it("should reject payload with missing front or back", () => {
    const payloadMissingFront = { ...validPublishedPayload, front: "   " };
    const res1 = validateCanonicalFlashcardDocument(payloadMissingFront);
    expect(res1.valid).toBe(false);
    expect(res1.errors).toContain("Missing or invalid 'front'");

    const payloadMissingBack = { ...validPublishedPayload, back: "" };
    const res2 = validateCanonicalFlashcardDocument(payloadMissingBack);
    expect(res2.valid).toBe(false);
    expect(res2.errors).toContain("Missing or invalid 'back'");
  });

  it("should reject payload with missing or invalid canonicalTopicId", () => {
    const payloadMissingTopic = { ...validPublishedPayload, canonicalTopicId: "" };
    const res1 = validateCanonicalFlashcardDocument(payloadMissingTopic);
    expect(res1.valid).toBe(false);
    expect(res1.errors).toContain("Missing 'canonicalTopicId'");

    const payloadInvalidTopic = { ...validPublishedPayload, canonicalTopicId: "topic-999-invalid" };
    const res2 = validateCanonicalFlashcardDocument(payloadInvalidTopic);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes("not found in canonical taxonomy"))).toBe(true);
  });

  it("should reject payload with invalid publicationStatus", () => {
    const payload = { ...validPublishedPayload, publicationStatus: "INVALID_STATUS" as any };
    const result = validateCanonicalFlashcardDocument(payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("publicationStatus"))).toBe(true);
  });

  it("should tolerate and preserve safe unknown fields forward-compatibly", () => {
    const payloadWithExtra = {
      ...validPublishedPayload,
      futureExtensionMetadata: { customScore: 99 },
      extraTag: "revalida_2026",
    };
    const parsed = parseCanonicalFlashcard(payloadWithExtra);
    expect(parsed).not.toBeNull();
    expect(parsed?.contentId).toBe("c_fc_2026_test_01");
  });

  it("should correctly derive area and areaId for pediatrics topic", () => {
    const pedPayload = {
      ...validPublishedPayload,
      contentId: "c_fc_ped_01",
      canonicalTopicId: "ped-01", // Neonatologia / Reanimação Neonatal
      front: "Qual o primeiro passo na reanimação do RN > 34 semanas que não respira?",
      back: "Prover calor, posicionar a cabeça, aspirar se necessário e secar.",
      cardPurpose: "DIAGNOSTIC_WORKUP" as const,
    };
    const parsed = parseCanonicalFlashcard(pedPayload);
    expect(parsed).not.toBeNull();
    expect(parsed?.area).toBe("PEDIATRIA");
    expect(parsed?.areaId).toBe("pediatria");
  });

  it("parseCanonicalFlashcard should return null for malformed payloads", () => {
    expect(parseCanonicalFlashcard(null)).toBeNull();
    expect(parseCanonicalFlashcard(undefined)).toBeNull();
    expect(parseCanonicalFlashcard("string")).toBeNull();
    expect(parseCanonicalFlashcard([])).toBeNull();
  });
});

describe("CanonicalFlashcardCatalogService (Firestore Reader)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockValidDocData = {
    contentId: "c_fc_cm_01_001",
    currentRevision: 1,
    currentSemanticVersion: 1,
    front: "Quando indicar tratamento farmacológico na HAS estágio 1 de baixo risco cardiovascular?",
    back: "Após 3 a 6 meses de MEV sem controle pressórico adequado.",
    canonicalTopicId: "cm-01",
    areaId: "clinica-medica",
    area: "CLINICA_MEDICA",
    cardPurpose: "TREATMENT",
    contentFingerprint: "fc_fp_v1_123",
    contentFingerprintVersion: 1,
    reviewStatus: "MEDICAL_REVIEWED",
    editorialReviewStatus: "EDITORIAL_REVIEWED",
    publicationStatus: "PUBLISHED",
    updatedAt: "2026-02-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("getPublishedFlashcardById should return parsed flashcard if status is PUBLISHED", async () => {
    (firestoreModule.doc as any).mockReturnValue({ path: "flashcardContents/c_fc_cm_01_001" });
    (firestoreModule.getDoc as any).mockResolvedValue({
      exists: () => true,
      id: "c_fc_cm_01_001",
      data: () => mockValidDocData,
    });

    const card = await CanonicalFlashcardCatalogService.getPublishedFlashcardById("c_fc_cm_01_001");
    expect(card).not.toBeNull();
    expect(card?.contentId).toBe("c_fc_cm_01_001");
    expect(card?.publicationStatus).toBe("PUBLISHED");
    expect(card?.canonicalTopicId).toBe("cm-01");
  });

  it("getPublishedFlashcardById should return null if document does not exist", async () => {
    (firestoreModule.doc as any).mockReturnValue({ path: "flashcardContents/nonexistent" });
    (firestoreModule.getDoc as any).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    const card = await CanonicalFlashcardCatalogService.getPublishedFlashcardById("nonexistent");
    expect(card).toBeNull();
  });

  it("getPublishedFlashcardById should return null if status is DRAFT or not PUBLISHED", async () => {
    (firestoreModule.doc as any).mockReturnValue({ path: "flashcardContents/draft_card" });
    (firestoreModule.getDoc as any).mockResolvedValue({
      exists: () => true,
      id: "draft_card",
      data: () => ({ ...mockValidDocData, publicationStatus: "DRAFT" }),
    });

    const card = await CanonicalFlashcardCatalogService.getPublishedFlashcardById("draft_card");
    expect(card).toBeNull();
  });

  it("getPublishedFlashcardById should handle Firestore exceptions safely without crashing", async () => {
    (firestoreModule.doc as any).mockReturnValue({ path: "flashcardContents/error_doc" });
    (firestoreModule.getDoc as any).mockRejectedValue(new Error("Permission denied or offline"));

    const card = await CanonicalFlashcardCatalogService.getPublishedFlashcardById("error_doc");
    expect(card).toBeNull();
  });

  it("getPublishedFlashcardsByTopic should query with PUBLISHED constraint and filter valid cards", async () => {
    (firestoreModule.collection as any).mockReturnValue({ path: CANONICAL_FLASHCARDS_COLLECTION });
    (firestoreModule.query as any).mockReturnValue({});
    (firestoreModule.where as any).mockImplementation((field, op, val) => ({ field, op, val }));

    const mockDocs = [
      {
        id: "c_fc_cm_01_001",
        data: () => mockValidDocData,
      },
      {
        id: "c_fc_cm_01_002_draft",
        data: () => ({ ...mockValidDocData, contentId: "c_fc_cm_01_002_draft", publicationStatus: "DRAFT" }),
      },
    ];

    (firestoreModule.getDocs as any).mockResolvedValue({
      forEach: (cb: any) => mockDocs.forEach(cb),
    });

    const results = await CanonicalFlashcardCatalogService.getPublishedFlashcardsByTopic("cm-01");
    expect(results).toHaveLength(1);
    expect(results[0].contentId).toBe("c_fc_cm_01_001");
  });

  it("getPublishedFlashcardsByArea should query with area filter and return published cards", async () => {
    (firestoreModule.collection as any).mockReturnValue({ path: CANONICAL_FLASHCARDS_COLLECTION });
    (firestoreModule.query as any).mockReturnValue({});

    const mockDocs = [
      {
        id: "c_fc_cm_01_001",
        data: () => mockValidDocData,
      },
    ];

    (firestoreModule.getDocs as any).mockResolvedValue({
      forEach: (cb: any) => mockDocs.forEach(cb),
    });

    const results = await CanonicalFlashcardCatalogService.getPublishedFlashcardsByArea("CLINICA_MEDICA");
    expect(results).toHaveLength(1);
    expect(results[0].area).toBe("CLINICA_MEDICA");
  });

  it("empty parameters should return empty array safely without querying Firestore", async () => {
    const res1 = await CanonicalFlashcardCatalogService.getPublishedFlashcardsByTopic("");
    expect(res1).toEqual([]);

    const res2 = await CanonicalFlashcardCatalogService.getPublishedFlashcardById("");
    expect(res2).toBeNull();
  });
});
