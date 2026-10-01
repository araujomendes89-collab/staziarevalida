import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFirestore: Record<string, any> = {};
let shouldSimulateTransactionFailure = false;

vi.mock("../lib/firebase", () => ({
  db: { _mockDb: true },
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: (_db: any, ...segments: string[]) => ({
      path: segments.join("/"),
      id: segments[segments.length - 1],
    }),
    getDoc: async (docRef: any) => {
      const data = mockFirestore[docRef.path];
      return {
        exists: () => Boolean(data),
        data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      };
    },
    setDoc: async (docRef: any, data: any, options: any) => {
      if (options?.merge && mockFirestore[docRef.path]) {
        mockFirestore[docRef.path] = { ...mockFirestore[docRef.path], ...data };
      } else {
        mockFirestore[docRef.path] = JSON.parse(JSON.stringify(data));
      }
    },
    runTransaction: async (_db: any, updateFunction: (tx: any) => Promise<any>) => {
      if (shouldSimulateTransactionFailure) {
        throw new Error("Simulated Firestore Transaction Failure on Parent Pointer Update");
      }
      const tx = {
        get: async (docRef: any) => {
          const data = mockFirestore[docRef.path];
          return {
            exists: () => Boolean(data),
            data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
          };
        },
        set: (docRef: any, data: any, options: any) => {
          if (options?.merge && mockFirestore[docRef.path]) {
            mockFirestore[docRef.path] = { ...mockFirestore[docRef.path], ...data };
          } else {
            mockFirestore[docRef.path] = JSON.parse(JSON.stringify(data));
          }
        },
      };
      return await updateFunction(tx);
    },
  };
});

import { ContentPublicationService } from "../services/contentPublicationService";
import { StaziaEditorialDocumentDraft } from "../types/medicalEditorial";

const SAMPLE_APPROVED_DRAFT_V1: StaziaEditorialDocumentDraft = {
  id: "draft_has_001",
  structuredSourceContentId: "ssc_has_001",
  sourceDocumentId: "doc_pcdt_has_2024",
  segmentId: "seg_has_01",
  canonicalTopicId: "top_has",
  area: "CLINICA_MEDICA",
  specialty: "Cardiologia",
  topic: "Hipertensão Arterial Sistêmica",
  subtopics: ["Definição", "Classificação", "Tratamento"],
  styleProfile: "MEDICAL_EDITORIAL_V1",
  compositionVersion: "2026.1.0",
  status: "APPROVED_EDITORIAL",
  pages: [
    {
      pageIndex: 1,
      pageRole: "TOPIC_OPENING",
      estimatedDensity: "BALANCED",
      densityScore: 50,
      sourceBlockRefs: ["b1"],
      blocks: [
        {
          id: "blk_1",
          type: "EditorialParagraph",
          semanticRole: "BODY",
          content: "A hipertensão arterial sistêmica é uma condição clínica multifatorial.",
          layoutHints: { densityWeight: 1 },
          provenance: {
            documentId: "doc_pcdt_has_2024",
            sourcePage: 1,
            sourceBlockId: "src_1",
            sourceTextVerbatim: "A hipertensão arterial sistêmica é uma condição clínica multifatorial.",
          },
          sourceOrder: 1,
          editorialOrder: 1,
          sourceBlockRefs: ["src_1"],
        },
      ],
    },
  ],
  plan: {
    id: "plan_has_001",
    structuredSourceContentId: "ssc_has_001",
    styleProfile: "MEDICAL_EDITORIAL_V1",
    documentTitle: "HAS PCDT",
    pagePlan: [],
    sourceBlockAssignments: [],
    warnings: [],
    compositionStatus: "APPROVED_EDITORIAL",
    totalStructuredSourceBlocks: 1,
    assignedEditorialBlocks: 1,
    adminExcludedBlocks: 0,
    reviewRequiredBlocks: 0,
    unaccountedSourceBlocks: 0,
    duplicatedSourceBlockAssignments: 0,
  },
  createdAt: "2026-09-04T12:00:00.000Z",
  createdBy: "ADMIN",
  updatedAt: "2026-09-04T12:00:00.000Z",
};

const INVALID_DRAFT_V2: StaziaEditorialDocumentDraft = {
  ...SAMPLE_APPROVED_DRAFT_V1,
  id: "draft_has_002_invalid",
  status: "REVIEW_REQUIRED", // Preflight will block
};

describe("Etapa 1.28F — Publication Failure & Resiliency Guarantees", () => {
  beforeEach(() => {
    shouldSimulateTransactionFailure = false;
    for (const key of Object.keys(mockFirestore)) {
      delete mockFirestore[key];
    }
  });

  it("should preserve V1 as CURRENT when V2 preflight fails (V1_REMAINS_CURRENT = YES)", async () => {
    // 1. Publish V1
    const res1 = await ContentPublicationService.publishEditorialDraft(
      SAMPLE_APPROVED_DRAFT_V1,
      "top_has"
    );
    expect(res1.state).toBe("PUBLISHED");

    const headerV1 = await ContentPublicationService.getTopicHeader("top_has");
    expect(headerV1?.currentVersionId).toBe("pub_top_has_v1");
    expect(headerV1?.currentContentVersion).toBe(1);

    // 2. Attempt publishing invalid V2
    const res2 = await ContentPublicationService.publishEditorialDraft(
      INVALID_DRAFT_V2,
      "top_has"
    );
    expect(res2.state).toBe("PUBLICATION_FAILED");

    // 3. Confirm V1 is still CURRENT and untouched
    const headerAfter = await ContentPublicationService.getTopicHeader("top_has");
    expect(headerAfter?.currentVersionId).toBe("pub_top_has_v1");
    expect(headerAfter?.currentContentVersion).toBe(1);
  });

  it("should preserve V1 as CURRENT when short atomic commit transaction fails", async () => {
    // 1. Publish V1
    await ContentPublicationService.publishEditorialDraft(
      SAMPLE_APPROVED_DRAFT_V1,
      "top_has"
    );

    // 2. Trigger transaction failure on next commit
    shouldSimulateTransactionFailure = true;

    const validDraftV2: StaziaEditorialDocumentDraft = {
      ...SAMPLE_APPROVED_DRAFT_V1,
      id: "draft_has_002_valid",
      compositionVersion: "2026.2.0",
    };

    const res2 = await ContentPublicationService.publishEditorialDraft(
      validDraftV2,
      "top_has"
    );
    expect(res2.state).toBe("PUBLICATION_FAILED");

    // 3. Confirm parent pointer in Firestore was NOT corrupted and points to V1
    const headerAfter = await ContentPublicationService.getTopicHeader("top_has");
    expect(headerAfter?.currentVersionId).toBe("pub_top_has_v1");
    expect(headerAfter?.currentContentVersion).toBe(1);
  });

  it("should prevent duplicate versions if identical fingerprint is republished", async () => {
    // Publish V1
    const res1 = await ContentPublicationService.publishEditorialDraft(
      SAMPLE_APPROVED_DRAFT_V1,
      "top_has"
    );
    expect(res1.state).toBe("PUBLISHED");
    expect(res1.contentVersion).toBe(1);

    // Republish identical V1
    const resDuplicate = await ContentPublicationService.publishEditorialDraft(
      SAMPLE_APPROVED_DRAFT_V1,
      "top_has"
    );
    expect(resDuplicate.state).toBe("PUBLISHED");
    expect(resDuplicate.contentVersion).toBe(1); // Not incremented to 2

    const header = await ContentPublicationService.getTopicHeader("top_has");
    expect(header?.totalVersions).toBe(1);
  });
});
