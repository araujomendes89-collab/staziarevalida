import { describe, it, expect, vi, beforeEach } from "vitest";

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
    collection: (_db: any, ...segments: string[]) => ({
      path: segments.join("/"),
    }),
    getDocs: async (colRef: any) => {
      const prefix = colRef.path;
      const docs = Object.keys(mockFirestore)
        .filter((k) => k.startsWith(prefix) && !k.replace(prefix + "/", "").includes("/"))
        .map((k) => ({
          id: k.split("/").pop()!,
          data: () => JSON.parse(JSON.stringify(mockFirestore[k])),
        }));
      return { docs };
    },
  };
});

import { ContentPublicationService } from "../services/contentPublicationService";
import { StudentTopicContentClientService } from "../services/studentTopicContentClientService";
import { StaziaEditorialDocumentDraft } from "../types/medicalEditorial";

const SAMPLE_DRAFT: StaziaEditorialDocumentDraft = {
  id: "draft_has_sec",
  structuredSourceContentId: "ssc_has_001",
  sourceDocumentId: "doc_pcdt_has_2024",
  segmentId: "seg_has_01",
  canonicalTopicId: "top_has",
  area: "CLINICA_MEDICA",
  specialty: "Cardiologia",
  topic: "Hipertensão Arterial Sistêmica",
  subtopics: ["Diagnóstico"],
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
          id: "blk_secret_1",
          type: "EditorialParagraph",
          semanticRole: "BODY",
          content: "Texto estritamente médico aprovado.",
          layoutHints: { densityWeight: 1 },
          provenance: {
            documentId: "/private/admin/vault/pcdt.pdf",
            sourcePage: 1,
            sourceBlockId: "ocr_block_raw_999",
            sourceTextVerbatim: "Texto estritamente médico aprovado.",
          },
          sourceOrder: 1,
          editorialOrder: 1,
          sourceBlockRefs: ["ocr_block_raw_999"],
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

describe("Etapa 1.28F — Published Content Access Security & Sanitization", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockFirestore)) {
      delete mockFirestore[key];
    }
  });

  it("should sanitize published blocks and remove internal administrative metadata", () => {
    const studentBlocks = ContentPublicationService.extractStudentSafeBlocks(SAMPLE_DRAFT);

    expect(studentBlocks.length).toBe(1);
    const block = studentBlocks[0];

    // Content is 100% verbatim
    expect(block.content).toBe("Texto estritamente médico aprovado.");

    // Sanitized checks: No private provenance paths or raw OCR references
    expect((block as any).provenance).toBeUndefined();
    expect((block as any).sourceBlockRefs).toBeUndefined();
    expect((block as any).rawOcr).toBeUndefined();
    expect((block as any).adminNotes).toBeUndefined();
  });

  it("should fail-closed and return NOT_PUBLISHED for un-published canonical topics", async () => {
    const res = await StudentTopicContentClientService.getPublishedTopic("top_diabetes");

    expect(res.status).toBe("NOT_PUBLISHED");
    expect(res.version).toBeUndefined();
  });

  it("should successfully fetch published version when parent pointer is active", async () => {
    // Seed Firestore with published header and immutable version
    mockFirestore["publishedTopicContents/top_has"] = {
      canonicalTopicId: "top_has",
      currentVersionId: "pub_top_has_v1",
      currentContentVersion: 1,
      publicationStatus: "PUBLISHED",
      area: "CLINICA_MEDICA",
      specialty: "Cardiologia",
      topic: "Hipertensão Arterial Sistêmica",
      subtopics: [],
      publishedAt: "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
      totalVersions: 1,
      estimatedReadMinutes: 10,
    };

    mockFirestore["publishedTopicContents/top_has/versions/pub_top_has_v1"] = {
      id: "pub_top_has_v1",
      canonicalTopicId: "top_has",
      contentVersion: 1,
      sourceEditorialDocumentId: "draft_has_sec",
      sourceEditorialVersion: "2026.1.0",
      styleProfile: "MEDICAL_EDITORIAL_V1",
      styleProfileVersion: "2026.1.0",
      pages: [],
      blocks: [
        {
          id: "b1",
          type: "EditorialParagraph",
          semanticRole: "BODY",
          content: "Texto publicado para aluno.",
          order: 1,
        },
      ],
      rightsSnapshot: {
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        sourceDocumentTitle: "PCDT HAS",
        verifiedAt: "2026-09-04T12:00:00.000Z",
      },
      fingerprint: "fp_999",
      publishedAt: "2026-09-04T12:00:00.000Z",
      publishedBy: "ADMIN",
      totalBlocks: 1,
      estimatedReadMinutes: 10,
    };

    const res = await StudentTopicContentClientService.getPublishedTopic("top_has");
    expect(res.status).toBe("READY");
    expect(res.header?.currentVersionId).toBe("pub_top_has_v1");
    expect(res.version?.blocks[0].content).toBe("Texto publicado para aluno.");
  });
});
