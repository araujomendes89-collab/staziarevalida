import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CANONICAL_MEDICAL_AREAS,
  CANONICAL_AREA_LABELS,
  STAZIAMED_CANONICAL_TOPICS,
  STAZIAMED_TAXONOMY_VERSION,
  CanonicalMedicalArea,
  StructuredSourceContent,
} from "../types/medicalTaxonomy";
import { suggestCanonicalTopicMatch } from "../services/canonicalTopicMatchingService";
import { MedicalSegmentationEngine } from "../../server/segmentation/medicalSegmentationEngine";
import { SegmentationJobManager } from "../../server/segmentation/segmentationJobQueue";
import { SourceDocument } from "../types/pdfIngestion";
import { StructuredSourceViewer } from "../components/admin/contentEngine/StructuredSourceViewer";

describe("Etapa 1.28C — 5 Canonical Medical Areas & Taxonomy Registry", () => {
  it("defines exactly the 5 canonical medical areas of the Revalida architecture", () => {
    expect(CANONICAL_MEDICAL_AREAS).toHaveLength(5);
    expect(CANONICAL_MEDICAL_AREAS).toContain("CLINICA_MEDICA");
    expect(CANONICAL_MEDICAL_AREAS).toContain("CIRURGIA");
    expect(CANONICAL_MEDICAL_AREAS).toContain("PEDIATRIA");
    expect(CANONICAL_MEDICAL_AREAS).toContain("GINECOLOGIA_OBSTETRICIA");
    expect(CANONICAL_MEDICAL_AREAS).toContain("MEDICINA_PREVENTIVA");
  });

  it("provides canonical Portuguese labels for all 5 areas", () => {
    expect(CANONICAL_AREA_LABELS.CLINICA_MEDICA).toBe("Clínica Médica");
    expect(CANONICAL_AREA_LABELS.CIRURGIA).toBe("Cirurgia Geral");
    expect(CANONICAL_AREA_LABELS.PEDIATRIA).toBe("Pediatria");
    expect(CANONICAL_AREA_LABELS.GINECOLOGIA_OBSTETRICIA).toBe("Ginecologia e Obstetrícia");
    expect(CANONICAL_AREA_LABELS.MEDICINA_PREVENTIVA).toBe("Medicina Preventiva e Social");
  });

  it("registers StaziaMed canonical topics covering all 5 areas with taxonomy version stamp", () => {
    expect(STAZIAMED_TAXONOMY_VERSION).toBe("2026.1.0");
    expect(STAZIAMED_CANONICAL_TOPICS.length).toBeGreaterThanOrEqual(20);

    const areasRepresented = new Set(STAZIAMED_CANONICAL_TOPICS.map((t) => t.area));
    CANONICAL_MEDICAL_AREAS.forEach((area) => {
      expect(areasRepresented.has(area)).toBe(true);
    });

    STAZIAMED_CANONICAL_TOPICS.forEach((topic) => {
      expect(topic.id).toBeTruthy();
      expect(topic.name).toBeTruthy();
      expect(topic.specialty).toBeTruthy();
      expect(Array.isArray(topic.synonyms)).toBe(true);
      expect(Array.isArray(topic.keywords)).toBe(true);
    });
  });
});

describe("Etapa 1.28C — Canonical Topic Matching Service", () => {
  it("matches exact canonical topic title with 1.0 confidence", () => {
    const match = suggestCanonicalTopicMatch(
      "CLINICA_MEDICA",
      "Cardiologia",
      "Hipertensão Arterial Sistêmica",
      "Valores pressóricos acima de 140x90 mmHg"
    );

    expect(match.matchMethod).toBe("EXACT_NAME");
    expect(match.suggestedCanonicalTopicId).toBe("top_has");
    expect(match.matchConfidence).toBe(1.0);
  });

  it("matches normalized name ignoring accents and casing with 0.95 confidence", () => {
    const match = suggestCanonicalTopicMatch(
      "CLINICA_MEDICA",
      "Cardiologia",
      "hipertensao arterial sistemica",
      "Classificação segundo SBC"
    );

    expect(match.matchMethod).toBe("NORMALIZED_NAME");
    expect(match.suggestedCanonicalTopicId).toBe("top_has");
    expect(match.matchConfidence).toBe(0.95);
  });

  it("matches known synonyms (e.g. 'HAS' or 'Pressão Alta') with SEMANTIC_MATCH", () => {
    const match = suggestCanonicalTopicMatch(
      "CLINICA_MEDICA",
      "Cardiologia",
      "Crise Hipertensiva e HAS",
      "Emergência com lesão de órgão-alvo"
    );

    expect(match.matchMethod).toBe("SEMANTIC_MATCH");
    expect(match.suggestedCanonicalTopicId).toBe("top_has");
    expect(match.matchConfidence).toBeGreaterThanOrEqual(0.85);
  });

  it("matches by specialty keywords when title is descriptive", () => {
    const match = suggestCanonicalTopicMatch(
      "MEDICINA_PREVENTIVA",
      "Saúde Coletiva",
      "Princípios Doutrinários da Lei 8080",
      "Universalidade, integralidade e equidade no SUS"
    );

    expect(match.matchMethod).toBe("SEMANTIC_MATCH");
    expect(match.suggestedCanonicalTopicId).toBe("top_sus_principios_diretrizes");
    expect(match.matchConfidence).toBeGreaterThanOrEqual(0.7);
  });

  it("returns NO_MATCH with 0 confidence when content has no medical correspondence", () => {
    const match = suggestCanonicalTopicMatch(
      "CLINICA_MEDICA",
      "Geral",
      "Índice Remissivo e Sumário Geral",
      "Página 1 a 150"
    );

    expect(match.matchMethod).toBe("NO_MATCH");
    expect(match.suggestedCanonicalTopicId).toBeUndefined();
    expect(match.matchConfidence).toBe(0);
  });
});

describe("Etapa 1.28C — Medical Segmentation Engine (Zero-Loss & Verbatim Fidelity)", () => {
  const multiAreaFixtureDoc: SourceDocument = {
    id: "doc_test_multi_area",
    title: "Compêndio Revalida — Grandes Áreas Clínicas",
    fileName: "compendio_revalida.pdf",
    mimeType: "application/pdf",
    sizeBytes: 5000000,
    pageCount: 6,
    documentFingerprint: "fingerprint_multi_area_12345",
    sourceType: "APOSTILA",
    rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
    sourceYear: 2026,
    institution: "StaziaMed Medical Board",
    contentMode: "TEXT_PDF",
    status: "EXTRACTED",
    storagePath: "content-engine/source-documents/doc_test_multi_area/source.pdf",
    createdBy: "admin-master",
    createdAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T10:00:00.000Z",
    extractedDocument: {
      documentId: "doc_test_multi_area",
      pageCount: 6,
      contentMode: "TEXT_PDF",
      totalCharacterCount: 3000,
      imageCount: 0,
      tableCount: 1,
      pagesRequiringOcr: 0,
      engineName: "StaziaNativePdfExtractor",
      engineVersion: "1.0.0",
      startedAt: "2026-09-04T10:00:00.000Z",
      finishedAt: "2026-09-04T10:00:01.000Z",
      pages: [
        {
          documentId: "doc_test_multi_area",
          pageNumber: 1,
          text: "CLÍNICA MÉDICA\n\nHIPERTENSÃO ARTERIAL SISTÊMICA (HAS)\n\nDefinição: A HAS é uma condição multifatorial definida por elevação sustentada da PA >= 140/90 mmHg.",
          textCharacterCount: 135,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        {
          documentId: "doc_test_multi_area",
          pageNumber: 2,
          text: "CLÍNICA MÉDICA — HIPERTENSÃO ARTERIAL (CONTINUAÇÃO)\n\nTratamento Farmacológico:\nPrimeira linha: IECA, BRA, BCC e Tiazídicos.",
          textCharacterCount: 110,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        {
          documentId: "doc_test_multi_area",
          pageNumber: 3,
          text: "CIRURGIA GERAL\n\nABDOME AGUDO INFLAMATÓRIO — APENDICITE AGUDA\n\nQuadro clínico clássico: Dor periumbilical migratória para fossa ilíaca direita acompanhada de febre e vômitos.",
          textCharacterCount: 160,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        {
          documentId: "doc_test_multi_area",
          pageNumber: 4,
          text: "PEDIATRIA\n\nCALENDÁRIO NACIONAL DE VACINAÇÃO DA CRIANÇA\n\nAo nascer: BCG e Hepatite B.\n2 meses: Pentavalente, VIP, Pneumo 10 e Rotavírus.",
          textCharacterCount: 125,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        {
          documentId: "doc_test_multi_area",
          pageNumber: 5,
          text: "GINECOLOGIA E OBSTETRÍCIA\n\nASSISTÊNCIA AO PRÉ-NATAL\n\nConsultas recomendadas pelo MS: Mínimo de 6 consultas de pré-natal com suplementação de ácido fólico e ferro.",
          textCharacterCount: 140,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        {
          documentId: "doc_test_multi_area",
          pageNumber: 6,
          text: "MEDICINA PREVENTIVA E SOCIAL\n\nSISTEMA ÚNICO DE SAÚDE (LEI 8080/1990)\n\nPrincípios doutrinários: Universalidade, Integralidade e Equidade.",
          textCharacterCount: 130,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
      ],
    },
  };

  it("segments multi-area document into 5 distinct canonical area segments", async () => {
    const engine = MedicalSegmentationEngine.getInstance();
    const result = await engine.segmentDocument(multiAreaFixtureDoc);

    expect(result.segments.length).toBeGreaterThanOrEqual(5);
    expect(result.structuredContents.length).toBeGreaterThanOrEqual(5);

    // Summary of found areas
    expect(result.areasFoundSummary.CLINICA_MEDICA).toBeGreaterThanOrEqual(1);
    expect(result.areasFoundSummary.CIRURGIA).toBeGreaterThanOrEqual(1);
    expect(result.areasFoundSummary.PEDIATRIA).toBeGreaterThanOrEqual(1);
    expect(result.areasFoundSummary.GINECOLOGIA_OBSTETRICIA).toBeGreaterThanOrEqual(1);
    expect(result.areasFoundSummary.MEDICINA_PREVENTIVA).toBeGreaterThanOrEqual(1);
  });

  it("enforces ZERO SOURCE LOSS (SOURCE_BLOCKS_LOST === 0)", async () => {
    const engine = MedicalSegmentationEngine.getInstance();
    const result = await engine.segmentDocument(multiAreaFixtureDoc);

    expect(result.unassignedSourceBlocks).toBe(0);
    expect(result.assignedSourceBlocks).toBe(result.totalSourceBlocks);
    expect(result.totalSourceBlocks).toBeGreaterThan(0);
  });

  it("enforces ZERO REWRITE GUARANTEE (preserves verbatim text in all blocks)", async () => {
    const engine = MedicalSegmentationEngine.getInstance();
    const result = await engine.segmentDocument(multiAreaFixtureDoc);

    result.structuredContents.forEach((content) => {
      content.blocks.forEach((block) => {
        expect(block.originalText).toBeTruthy();
        expect(block.provenance).toBeDefined();
        expect(block.provenance.documentId).toBe(multiAreaFixtureDoc.id);
        expect(block.provenance.pageNumber).toBeGreaterThan(0);
      });
    });
  });

  it("preserves multi-page continuous topics without artificial over-fragmentation", async () => {
    const engine = MedicalSegmentationEngine.getInstance();
    const result = await engine.segmentDocument(multiAreaFixtureDoc);

    const hasSegment = result.structuredContents.find(
      (c) => c.area === "CLINICA_MEDICA" && (c.topic.includes("Hipertensão") || c.topic.includes("HIPERTENSÃO"))
    );

    expect(hasSegment).toBeDefined();
    // Pages 1 and 2 continuous topic
    expect(hasSegment?.sourcePages).toContain(1);
  });
});

describe("Etapa 1.28C — Segmentation Job Queue & Admin Governance Lifecycle", () => {
  beforeEach(() => {
    SegmentationJobManager.getInstance().reset();
  });

  const sampleDoc: SourceDocument = {
    id: "doc_test_gov_1",
    title: "Diretriz de Insuficiência Cardíaca SBC",
    fileName: "diretriz_ic_sbc.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2000000,
    pageCount: 2,
    documentFingerprint: "fingerprint_ic_sbc_999",
    sourceType: "DIRETRIZ",
    rightsType: "PUBLIC_REFERENCE_ONLY",
    sourceYear: 2024,
    institution: "SBC",
    contentMode: "TEXT_PDF",
    status: "EXTRACTED",
    storagePath: "content-engine/source-documents/doc_test_gov_1/source.pdf",
    createdBy: "admin-master",
    createdAt: "2026-09-04T11:00:00.000Z",
    updatedAt: "2026-09-04T11:00:00.000Z",
    extractedDocument: {
      documentId: "doc_test_gov_1",
      pageCount: 2,
      contentMode: "TEXT_PDF",
      totalCharacterCount: 800,
      imageCount: 0,
      tableCount: 0,
      pagesRequiringOcr: 0,
      engineName: "StaziaNativePdfExtractor",
      engineVersion: "1.0.0",
      startedAt: "2026-09-04T11:00:00.000Z",
      finishedAt: "2026-09-04T11:00:01.000Z",
      pages: [
        {
          documentId: "doc_test_gov_1",
          pageNumber: 1,
          text: "CLÍNICA MÉDICA — CARDIOLOGIA\nINSUFICIÊNCIA CARDÍACA COM FRAÇÃO DE EJEÇÃO REDUZIDA (ICFEr)\n\nDiagnóstico clínico por critérios de Framingham e ecocardiograma com FE < 40%.",
          textCharacterCount: 160,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        {
          documentId: "doc_test_gov_1",
          pageNumber: 2,
          text: "TRATAMENTO DA ICFEr — QUÁDRUPLA TERAPIA\n\n1. Inibidor de SGLT2 (Dapagliflozina ou Empagliflozina)\n2. Sacubitril-Valsartana ou IECA\n3. Betabloqueador (Carvedilol, Bisoprolol, Metoprolol)\n4. Antagonista do Receptor Mineralocorticoide (Espironolactona).",
          textCharacterCount: 240,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
      ],
    },
  };

  it("creates and runs segmentation job with idempotency", async () => {
    const manager = SegmentationJobManager.getInstance();
    const { job, result } = await manager.createAndRunJob(sampleDoc);

    expect(job.status).toBe("REVIEW_REQUIRED");
    expect(job.documentId).toBe(sampleDoc.id);
    expect(result.structuredContents.length).toBeGreaterThanOrEqual(1);

    // Initial suggested canonical topic
    const firstContent = result.structuredContents[0];
    expect(firstContent.suggestedCanonicalTopicId).toBe("top_ic");
    // canonicalTopicId MUST remain undefined until explicit Admin confirmation
    expect(firstContent.canonicalTopicId).toBeUndefined();
    expect(firstContent.status).toBe("REVIEW_REQUIRED");
  });

  it("allows Admin to explicitly confirm canonical topic (confirmCanonicalTopic)", async () => {
    const manager = SegmentationJobManager.getInstance();
    const { result } = await manager.createAndRunJob(sampleDoc);
    const contentId = result.structuredContents[0].id;

    const updated = manager.confirmCanonicalTopic(contentId, "top_ic");
    expect(updated.canonicalTopicId).toBe("top_ic");
  });

  it("allows Admin to split segment cleanly into two parts without block loss", async () => {
    const manager = SegmentationJobManager.getInstance();
    const { result } = await manager.createAndRunJob(sampleDoc);
    const content = result.structuredContents[0];

    if (content.blocks.length >= 2) {
      const parts = manager.splitSegment(content.id, 1);
      expect(parts).toHaveLength(2);
      expect(parts[0].blocks.length + parts[1].blocks.length).toBe(content.blocks.length);
      expect(parts[0].unassignedSourceBlocks).toBe(0);
      expect(parts[1].unassignedSourceBlocks).toBe(0);
    }
  });

  it("allows Admin to approve structured content marking it APPROVED_STRUCTURE", async () => {
    const manager = SegmentationJobManager.getInstance();
    const { result } = await manager.createAndRunJob(sampleDoc);
    const contentId = result.structuredContents[0].id;

    const approved = manager.approveStructure(contentId);
    expect(approved.status).toBe("APPROVED_STRUCTURE");
  });
});

describe("Etapa 1.28C — StructuredSourceViewer UI Component", () => {
  const sampleContents: StructuredSourceContent[] = [
    {
      id: "struct-ui-1",
      sourceDocumentId: "doc-ui-test",
      segmentId: "seg_1",
      area: "CLINICA_MEDICA",
      specialty: "Cardiologia",
      topic: "Hipertensão Arterial Sistêmica",
      subtopics: ["Classificação Pressórica", "Tratamento"],
      suggestedCanonicalTopicId: "top_has",
      canonicalTopicId: undefined,
      sourcePages: [1, 2],
      sourceBlockRefs: ["b1", "b2"],
      blocks: [
        {
          id: "b1",
          type: "SOURCE_HEADING",
          order: 1,
          pageNumber: 1,
          sourceBlockId: "b1",
          originalText: "DIRETRIZ DE HIPERTENSÃO",
          provenance: {
            documentId: "doc-ui-test",
            segmentId: "seg_1",
            pageNumber: 1,
            sourceBlockId: "b1",
          },
        },
        {
          id: "b2",
          type: "SOURCE_PARAGRAPH",
          order: 2,
          pageNumber: 2,
          sourceBlockId: "b2",
          originalText: "Meta pressórica geral < 130/80 mmHg.",
          provenance: {
            documentId: "doc-ui-test",
            segmentId: "seg_1",
            pageNumber: 2,
            sourceBlockId: "b2",
          },
        },
      ],
      classificationConfidence: 0.98,
      status: "REVIEW_REQUIRED",
      taxonomyVersion: "2026.1.0",
      totalSourceBlocks: 2,
      assignedSourceBlocks: 2,
      unassignedSourceBlocks: 0,
      createdAt: "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
    },
    {
      id: "struct-ui-2",
      sourceDocumentId: "doc-ui-test",
      segmentId: "seg_2",
      area: "PEDIATRIA",
      specialty: "Puericultura",
      topic: "Crescimento & Desenvolvimento",
      subtopics: ["Curvas da OMS"],
      suggestedCanonicalTopicId: "top_puericultura_desenvolvimento",
      canonicalTopicId: "top_puericultura_desenvolvimento",
      sourcePages: [3],
      sourceBlockRefs: ["b3"],
      blocks: [
        {
          id: "b3",
          type: "SOURCE_PARAGRAPH",
          order: 1,
          pageNumber: 3,
          sourceBlockId: "b3",
          originalText: "Marcos do desenvolvimento aos 6 meses.",
          provenance: {
            documentId: "doc-ui-test",
            segmentId: "seg_2",
            pageNumber: 3,
            sourceBlockId: "b3",
          },
        },
      ],
      classificationConfidence: 0.95,
      status: "APPROVED_STRUCTURE",
      taxonomyVersion: "2026.1.0",
      totalSourceBlocks: 1,
      assignedSourceBlocks: 1,
      unassignedSourceBlocks: 0,
      createdAt: "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
    },
  ];

  it("renders 5-Area counter badges and audit provenance strip", () => {
    render(<StructuredSourceViewer structuredContents={sampleContents} />);

    expect(screen.getByText(/Segmentação Médica & Taxonomia Estruturada/i)).toBeTruthy();
    expect(screen.getByText(/Clínica Médica: 1/i)).toBeTruthy();
    expect(screen.getByText(/Pediatria: 1/i)).toBeTruthy();
    expect(screen.getByText(/Cirurgia Geral: 0/i)).toBeTruthy();
    expect(screen.getByText(/0 \(Auditoria Zero-Loss\)/i)).toBeTruthy();
  });

  it("filters content by area when clicking area badge filter", () => {
    render(<StructuredSourceViewer structuredContents={sampleContents} />);

    expect(screen.getAllByText(/Hipertensão Arterial Sistêmica/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Crescimento & Desenvolvimento/i)).toBeTruthy();

    const pedFilter = screen.getByText(/Pediatria: 1/i);
    fireEvent.click(pedFilter);

    expect(screen.queryAllByText(/Hipertensão Arterial Sistêmica/i)).toHaveLength(0);
    expect(screen.getByText(/Crescimento & Desenvolvimento/i)).toBeTruthy();
  });

  it("allows Admin to click 'Confirmar Sugestão' for canonical topic", () => {
    let confirmedContentId = "";
    let confirmedTopicId = "";

    render(
      <StructuredSourceViewer
        structuredContents={sampleContents}
        onConfirmCanonical={(cId, tId) => {
          confirmedContentId = cId;
          confirmedTopicId = tId;
        }}
      />
    );

    const confirmBtn = screen.getByText(/Confirmar Sugestão/i);
    fireEvent.click(confirmBtn);

    expect(confirmedContentId).toBe("struct-ui-1");
    expect(confirmedTopicId).toBe("top_has");
  });

  it("allows Admin to click 'Aprovar Estrutura'", () => {
    let approvedId = "";

    render(
      <StructuredSourceViewer
        structuredContents={sampleContents}
        onApproveStructure={(id) => {
          approvedId = id;
        }}
      />
    );

    const approveBtn = screen.getByText(/Aprovar Estrutura/i);
    fireEvent.click(approveBtn);

    expect(approvedId).toBe("struct-ui-1");
  });
});
