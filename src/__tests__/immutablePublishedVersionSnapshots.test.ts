import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory mock Firestore store
const mockFirestore: Record<string, any> = {};

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
      sourceBlockRefs: ["b1", "b2"],
      blocks: [
        {
          id: "blk_1",
          type: "BrushSectionHeader",
          semanticRole: "SECTION_HEADER",
          content: "1. Conceito e Diagnóstico de HAS",
          layoutHints: { densityWeight: 2 },
          provenance: {
            documentId: "doc_pcdt_has_2024",
            sourcePage: 1,
            sourceBlockId: "src_1",
            sourceTextVerbatim: "1. Conceito e Diagnóstico de HAS",
          },
          sourceOrder: 1,
          editorialOrder: 1,
          sourceBlockRefs: ["src_1"],
        },
        {
          id: "blk_2",
          type: "EditorialParagraph",
          semanticRole: "BODY",
          content: "A hipertensão arterial é definida por PAS >= 140 mmHg e/ou PAD >= 90 mmHg.",
          layoutHints: { densityWeight: 1 },
          provenance: {
            documentId: "doc_pcdt_has_2024",
            sourcePage: 1,
            sourceBlockId: "src_2",
            sourceTextVerbatim: "A hipertensão arterial é definida por PAS >= 140 mmHg e/ou PAD >= 90 mmHg.",
          },
          sourceOrder: 2,
          editorialOrder: 2,
          sourceBlockRefs: ["src_2"],
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
    totalStructuredSourceBlocks: 2,
    assignedEditorialBlocks: 2,
    adminExcludedBlocks: 0,
    reviewRequiredBlocks: 0,
    unaccountedSourceBlocks: 0,
    duplicatedSourceBlockAssignments: 0,
  },
  createdAt: "2026-09-04T12:00:00.000Z",
  createdBy: "ADMIN",
  updatedAt: "2026-09-04T12:00:00.000Z",
};

const SAMPLE_APPROVED_DRAFT_V2: StaziaEditorialDocumentDraft = {
  ...SAMPLE_APPROVED_DRAFT_V1,
  id: "draft_has_002",
  compositionVersion: "2026.2.0",
  pages: [
    {
      ...SAMPLE_APPROVED_DRAFT_V1.pages[0],
      blocks: [
        ...SAMPLE_APPROVED_DRAFT_V1.pages[0].blocks,
        {
          id: "blk_3",
          type: "ClinicalWarningCard",
          semanticRole: "WARNING",
          content: "Crise hipertensiva com lesão de órgão-alvo exige internamento imediato.",
          warningSeverity: "EMERGENCY",
          layoutHints: { densityWeight: 3 },
          provenance: {
            documentId: "doc_pcdt_has_2024",
            sourcePage: 2,
            sourceBlockId: "src_3",
            sourceTextVerbatim: "Crise hipertensiva com lesão de órgão-alvo exige internamento imediato.",
          },
          sourceOrder: 3,
          editorialOrder: 3,
          sourceBlockRefs: ["src_3"],
        },
      ],
    },
  ],
};

describe("Etapa 1.28F — Immutable Published Version Snapshots", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockFirestore)) {
      delete mockFirestore[key];
    }
  });

  it("should publish V1, create parent pointer and immutable V1 snapshot", async () => {
    const res1 = await ContentPublicationService.publishEditorialDraft(
      SAMPLE_APPROVED_DRAFT_V1,
      "top_has",
      "ADMIN_1"
    );

    expect(res1.state).toBe("PUBLISHED");
    expect(res1.contentVersion).toBe(1);
    expect(res1.versionId).toBe("pub_top_has_v1");

    // Verify parent document pointer
    const parentDoc = mockFirestore["publishedTopicContents/top_has"];
    expect(parentDoc).toBeDefined();
    expect(parentDoc.currentVersionId).toBe("pub_top_has_v1");
    expect(parentDoc.currentContentVersion).toBe(1);
    expect(parentDoc.publicationStatus).toBe("PUBLISHED");

    // Verify V1 version document
    const v1Doc = mockFirestore["publishedTopicContents/top_has/versions/pub_top_has_v1"];
    expect(v1Doc).toBeDefined();
    expect(v1Doc.contentVersion).toBe(1);
    expect(v1Doc.blocks.length).toBe(2);
  });

  it("should publish V2 without ANY mutation to V1 document (OLD_VERSION_MUTATION = NO)", async () => {
    // 1. Publish V1
    await ContentPublicationService.publishEditorialDraft(
      SAMPLE_APPROVED_DRAFT_V1,
      "top_has",
      "ADMIN_1"
    );

    // 2. Capture deep frozen snapshot of V1
    const v1SnapshotBefore = JSON.stringify(
      mockFirestore["publishedTopicContents/top_has/versions/pub_top_has_v1"]
    );

    // 3. Publish V2
    const res2 = await ContentPublicationService.publishEditorialDraft(
      SAMPLE_APPROVED_DRAFT_V2,
      "top_has",
      "ADMIN_2"
    );

    expect(res2.state).toBe("PUBLISHED");
    expect(res2.contentVersion).toBe(2);
    expect(res2.versionId).toBe("pub_top_has_v2");

    // 4. Capture V1 after V2 was published
    const v1SnapshotAfter = JSON.stringify(
      mockFirestore["publishedTopicContents/top_has/versions/pub_top_has_v1"]
    );

    // ZERO MUTATION ASSERTION: V1 must be byte/field-equivalent before and after V2 publish
    expect(v1SnapshotAfter).toBe(v1SnapshotBefore);

    // Verify parent pointer moved to V2
    const parentDoc = mockFirestore["publishedTopicContents/top_has"];
    expect(parentDoc.currentVersionId).toBe("pub_top_has_v2");
    expect(parentDoc.currentContentVersion).toBe(2);

    // Verify V2 version document
    const v2Doc = mockFirestore["publishedTopicContents/top_has/versions/pub_top_has_v2"];
    expect(v2Doc).toBeDefined();
    expect(v2Doc.contentVersion).toBe(2);
    expect(v2Doc.blocks.length).toBe(3);
    expect(v2Doc.previousVersionId).toBe("pub_top_has_v1");
  });

  it("should derive superseded status without modifying version documents", async () => {
    await ContentPublicationService.publishEditorialDraft(SAMPLE_APPROVED_DRAFT_V1, "top_has");
    await ContentPublicationService.publishEditorialDraft(SAMPLE_APPROVED_DRAFT_V2, "top_has");

    const header = await ContentPublicationService.getTopicHeader("top_has");
    const v1 = await ContentPublicationService.getVersionSnapshot("top_has", "pub_top_has_v1");
    const v2 = await ContentPublicationService.getVersionSnapshot("top_has", "pub_top_has_v2");

    // Derived logic: version is CURRENT if id matches parent header, SUPERSEDED if it differs
    const isV1Current = v1?.id === header?.currentVersionId;
    const isV2Current = v2?.id === header?.currentVersionId;

    expect(isV1Current).toBe(false); // V1 is superseded
    expect(isV2Current).toBe(true);  // V2 is current
  });
});
