import { describe, it, expect } from "vitest";
import { PublicationPreflightService } from "../services/publicationPreflightService";
import { StaziaEditorialDocumentDraft } from "../types/medicalEditorial";

const BASE_VALID_DRAFT: StaziaEditorialDocumentDraft = {
  id: "draft_has_valid",
  structuredSourceContentId: "ssc_has_001",
  sourceDocumentId: "doc_pcdt_has_2024",
  segmentId: "seg_has_01",
  canonicalTopicId: "top_has",
  area: "CLINICA_MEDICA",
  specialty: "Cardiologia",
  topic: "Hipertensão Arterial Sistêmica",
  subtopics: ["Diagnóstico", "Classificação"],
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
          content: "1. Conceito e Diagnóstico",
          layoutHints: { densityWeight: 2 },
          provenance: {
            documentId: "doc_pcdt_has_2024",
            sourcePage: 1,
            sourceBlockId: "src_1",
            sourceTextVerbatim: "1. Conceito e Diagnóstico",
          },
          sourceOrder: 1,
          editorialOrder: 1,
          sourceBlockRefs: ["src_1"],
        },
        {
          id: "blk_2",
          type: "EditorialParagraph",
          semanticRole: "BODY",
          content: "A hipertensão arterial é definida por valores pressóricos elevados mantidos.",
          layoutHints: { densityWeight: 1 },
          provenance: {
            documentId: "doc_pcdt_has_2024",
            sourcePage: 1,
            sourceBlockId: "src_2",
            sourceTextVerbatim: "A hipertensão arterial é definida por valores pressóricos elevados mantidos.",
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

describe("Etapa 1.28F — Publication Preflight & Rights Gates", () => {
  it("should PASS all 6 gates on an approved draft with valid canonical topic and rights", () => {
    const report = PublicationPreflightService.runPreflight(BASE_VALID_DRAFT, "top_has");

    expect(report.passed).toBe(true);
    expect(report.checks.length).toBe(6);
    expect(report.checks.every((c) => c.passed)).toBe(true);
    expect(report.canonicalTopicId).toBe("top_has");
    expect(report.totalBlocks).toBe(2);
    expect(report.estimatedReadMinutes).toBeGreaterThan(0);
  });

  it("should FAIL PREFLIGHT_EDITORIAL_APPROVAL if status is not APPROVED_EDITORIAL", () => {
    const draft: StaziaEditorialDocumentDraft = {
      ...BASE_VALID_DRAFT,
      status: "DRAFT",
    };

    const report = PublicationPreflightService.runPreflight(draft, "top_has");
    expect(report.passed).toBe(false);

    const approvalCheck = report.checks.find((c) => c.gate === "PREFLIGHT_EDITORIAL_APPROVAL");
    expect(approvalCheck?.passed).toBe(false);
  });

  it("should FAIL PREFLIGHT_CANONICAL_TOPIC if canonical topic is invalid or not in STAZIAMED_CANONICAL_TOPICS", () => {
    const report = PublicationPreflightService.runPreflight(BASE_VALID_DRAFT, "top_nonexistent_xyz");
    expect(report.passed).toBe(false);

    const topicCheck = report.checks.find((c) => c.gate === "PREFLIGHT_CANONICAL_TOPIC");
    expect(topicCheck?.passed).toBe(false);
  });

  it("should FAIL PREFLIGHT_RIGHTS if any block has REPUBLICATION_REVIEW_REQUIRED without clearance", () => {
    const draft: StaziaEditorialDocumentDraft = {
      ...BASE_VALID_DRAFT,
      pages: [
        {
          ...BASE_VALID_DRAFT.pages[0],
          blocks: [
            ...BASE_VALID_DRAFT.pages[0].blocks,
            {
              id: "blk_unlicensed_img",
              type: "MedicalImageBlock",
              semanticRole: "FIGURE",
              content: "Fluxograma proprietário sem licença de uso",
              rightsWarning: "REPUBLICATION_REVIEW_REQUIRED",
              layoutHints: { densityWeight: 3 },
              provenance: {
                documentId: "doc_pcdt_has_2024",
                sourcePage: 2,
                sourceBlockId: "src_img",
                sourceTextVerbatim: "Fluxograma proprietário",
              },
              sourceOrder: 3,
              editorialOrder: 3,
              sourceBlockRefs: ["src_img"],
            },
          ],
        },
      ],
    };

    const report = PublicationPreflightService.runPreflight(draft, "top_has");
    expect(report.passed).toBe(false);

    const rightsCheck = report.checks.find((c) => c.gate === "PREFLIGHT_RIGHTS");
    expect(rightsCheck?.passed).toBe(false);
  });

  it("should FAIL PREFLIGHT_CONTENT_INTEGRITY if unaccounted source blocks exist", () => {
    const draft: StaziaEditorialDocumentDraft = {
      ...BASE_VALID_DRAFT,
      plan: {
        ...BASE_VALID_DRAFT.plan,
        unaccountedSourceBlocks: 2, // Non-zero indicates lost source blocks
      },
    };

    const report = PublicationPreflightService.runPreflight(draft, "top_has");
    expect(report.passed).toBe(false);

    const integrityCheck = report.checks.find((c) => c.gate === "PREFLIGHT_CONTENT_INTEGRITY");
    expect(integrityCheck?.passed).toBe(false);
  });

  it("should FAIL PREFLIGHT_RENDERER_COMPATIBILITY if unsupported block type is used", () => {
    const draft: StaziaEditorialDocumentDraft = {
      ...BASE_VALID_DRAFT,
      pages: [
        {
          ...BASE_VALID_DRAFT.pages[0],
          blocks: [
            {
              id: "blk_unknown",
              type: "UnsupportedExternalWidget" as any,
              semanticRole: "UNRESOLVED",
              content: "Widget não suportado",
              layoutHints: { densityWeight: 1 },
              provenance: {
                documentId: "doc_pcdt_has_2024",
                sourcePage: 1,
                sourceBlockId: "src_1",
                sourceTextVerbatim: "Widget",
              },
              sourceOrder: 1,
              editorialOrder: 1,
              sourceBlockRefs: ["src_1"],
            },
          ],
        },
      ],
    };

    const report = PublicationPreflightService.runPreflight(draft, "top_has");
    expect(report.passed).toBe(false);

    const rendererCheck = report.checks.find((c) => c.gate === "PREFLIGHT_RENDERER_COMPATIBILITY");
    expect(rendererCheck?.passed).toBe(false);
  });
});
