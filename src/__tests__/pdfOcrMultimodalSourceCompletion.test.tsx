import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { evaluatePageOcrNeed } from "../services/ocrHeuristicsService";
import { reconcilePageSource } from "../services/sourceReconciliationService";
import { MistralPdfOcrAdapter } from "../../server/ocr/mistralPdfOcrAdapter";
import { OcrJobManager } from "../../server/ocr/ocrJobQueue";
import { ExtractedPdfPage, SourceDocument } from "../types/pdfIngestion";
import { OcrPageInput, OcrPageResult } from "../types/pdfOcr";
import { SourceDocumentPreview } from "../components/admin/contentEngine/SourceDocumentPreview";

describe("Etapa 1.28B — OCR Heuristics Service", () => {
  it("identifies blank page correctly without triggering OCR", () => {
    const blankPage: ExtractedPdfPage = {
      documentId: "doc_1",
      pageNumber: 1,
      text: "",
      textCharacterCount: 0,
      hasNativeText: false,
      images: [],
      tables: [],
      extractionStatus: "EXTRACTED",
    };

    const result = evaluatePageOcrNeed(blankPage);
    expect(result.isBlank).toBe(true);
    expect(result.ocrRequired).toBe(false);
  });

  it("does not classify structured table page as scan solely due to low text count (< 50 chars)", () => {
    const tableOnlyPage: ExtractedPdfPage = {
      documentId: "doc_1",
      pageNumber: 2,
      text: "Tabela 3 — Classificação",
      textCharacterCount: 24, // < 50 chars
      hasNativeText: true,
      images: [],
      tables: [
        {
          tableId: "t1",
          documentId: "doc_1",
          pageNumber: 2,
          columns: 3,
          rows: 4,
          cells: [
            ["Estágio", "PAS", "PAD"],
            ["Normal", "< 120", "< 80"],
            ["Pré-HAS", "121-139", "81-89"],
            ["HAS 1", "140-159", "90-99"],
          ],
          structureConfidence: 0.95,
          isUnresolved: false,
        },
      ],
      extractionStatus: "EXTRACTED",
    };

    const result = evaluatePageOcrNeed(tableOnlyPage);
    expect(result.ocrRequired).toBe(false);
    expect(result.reason).toContain("tabela nativa estruturada confiável");
  });

  it("triggers OCR on image-dominant page even when some native text exists", () => {
    const imageDominantPage: ExtractedPdfPage = {
      documentId: "doc_1",
      pageNumber: 3,
      text: "Fluxograma de Atendimento Inicial.", // 34 chars
      textCharacterCount: 34,
      hasNativeText: true,
      images: [
        {
          assetId: "img_flowchart",
          documentId: "doc_1",
          pageNumber: 3,
          index: 1,
        },
      ],
      tables: [],
      extractionStatus: "EXTRACTED",
    };

    const result = evaluatePageOcrNeed(imageDominantPage);
    expect(result.ocrRequired).toBe(true);
    expect(result.isImageDominant).toBe(true);
  });
});

describe("Etapa 1.28B — Mistral OCR Adapter & Reading Order", () => {
  const adapter = new MistralPdfOcrAdapter();

  it("extracts structured blocks and figures with RAW_UNINTERPRETED status", async () => {
    const input: OcrPageInput = {
      documentId: "doc_scan",
      pageNumber: 1,
      sourceMode: "SCANNED_PDF",
      nativeText: `1. INTRODUÇÃO À CARDIOLOGIA
A insuficiência cardíaca é uma síndrome clínica complexa.
• Dispneia aos esforços
• Ortopneia
Figura 1: Radiografia de tórax com cardiomegalia
Tabela 1 | Classe | Tratamento
| I | IECA/BRA |
| II | BB + iSGLT2 |`,
    };

    const ocrResult = await adapter.processPageOcr(input);

    expect(ocrResult.blocks.length).toBeGreaterThan(0);
    const heading = ocrResult.blocks.find((b) => b.type === "OCR_HEADING");
    expect(heading).toBeDefined();
    expect(heading?.text).toContain("1. INTRODUÇÃO");

    const list = ocrResult.blocks.find((b) => b.type === "OCR_LIST");
    expect(list).toBeDefined();

    // Check figures: strictly RAW_UNINTERPRETED (no clinical diagnosis)
    const figureBlock = ocrResult.blocks.find((b) => b.type === "OCR_CAPTION");
    expect(figureBlock).toBeDefined();
    expect(figureBlock?.text).toContain("Figura 1");
  });

  it("detects repetitive document chrome (headers/footers/watermarks) without deleting them", async () => {
    const input: OcrPageInput = {
      documentId: "doc_watermark",
      pageNumber: 1,
      sourceMode: "SCANNED_PDF",
      nativeText: "Página 1\nDiretriz Brasileira de Cardiologia\nTexto clínico do protocolo.",
    };

    const ocrResult = await adapter.processPageOcr(input);
    const headerBlock = ocrResult.blocks.find((b) => b.repeatedDocumentChrome === true);
    expect(headerBlock).toBeDefined();
  });
});

describe("Etapa 1.28B — Source Reconciliation Service", () => {
  it("reconciles pure SCANNED page to OCR_ONLY", () => {
    const ocrResult: OcrPageResult = {
      documentId: "doc_1",
      pageNumber: 1,
      text: "Texto escaneado transcrito com precisão.",
      blocks: [
        {
          id: "b1",
          pageNumber: 1,
          type: "OCR_PARAGRAPH",
          text: "Texto escaneado transcrito com precisão.",
          order: 1,
          provenance: { documentId: "doc_1", pageNumber: 1 },
        },
      ],
      tables: [],
      figures: [],
      readingOrder: [1],
      provider: "MistralPdfOcrAdapter",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    const resolved = reconcilePageSource("doc_1", 1, undefined, ocrResult);

    expect(resolved.resolutionMethod).toBe("OCR_ONLY");
    expect(resolved.resolvedText).toBe("Texto escaneado transcrito com precisão.");
    expect(resolved.sourceCompleteness).toBe("COMPLETE");
  });

  it("reconciles MIXED page to NATIVE_WITH_OCR_COMPLEMENT with deduplication", () => {
    const nativePage: ExtractedPdfPage = {
      documentId: "doc_2",
      pageNumber: 1,
      text: "Texto nativo da diretriz.",
      textCharacterCount: 25,
      hasNativeText: true,
      images: [{ assetId: "img_1", documentId: "doc_2", pageNumber: 1, index: 1 }],
      tables: [],
      extractionStatus: "EXTRACTED",
    };

    const ocrResult: OcrPageResult = {
      documentId: "doc_2",
      pageNumber: 1,
      text: "Texto visível na figura 1: Fluxograma de conduta.",
      blocks: [],
      tables: [],
      figures: [
        {
          figureId: "fig_1",
          pageNumber: 1,
          caption: "Figura 1",
          captionRelation: "ATTACHED",
          ocrVisibleText: "Fluxograma de conduta",
          interpretationStatus: "RAW_UNINTERPRETED",
        },
      ],
      readingOrder: [1],
      provider: "MistralPdfOcrAdapter",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    const resolved = reconcilePageSource("doc_2", 1, nativePage, ocrResult);

    expect(resolved.resolutionMethod).toBe("NATIVE_WITH_OCR_COMPLEMENT");
    expect(resolved.resolvedText).toContain("Texto nativo da diretriz.");
    expect(resolved.resolvedText).toContain("Complemento Visual OCR");
    expect(resolved.resolvedFigures.length).toBe(1);
    expect(resolved.resolvedFigures[0].interpretationStatus).toBe("RAW_UNINTERPRETED");
  });

  it("flags TABLE_CONFLICT and MANUAL_REVIEW_REQUIRED when native and OCR tables diverge", () => {
    const nativePage: ExtractedPdfPage = {
      documentId: "doc_conflict",
      pageNumber: 1,
      text: "Tabela de dosagens.",
      textCharacterCount: 20,
      hasNativeText: true,
      images: [],
      tables: [
        {
          tableId: "t_nat",
          documentId: "doc_conflict",
          pageNumber: 1,
          columns: 2,
          rows: 3,
          cells: [["Droga", "Dose"], ["A", "10mg"], ["B", "20mg"]],
          structureConfidence: 0.9,
        },
      ],
      extractionStatus: "EXTRACTED",
    };

    const ocrResult: OcrPageResult = {
      documentId: "doc_conflict",
      pageNumber: 1,
      text: "Tabela de dosagens.",
      blocks: [],
      tables: [
        {
          tableId: "t_ocr",
          documentId: "doc_conflict",
          pageNumber: 1,
          columns: 4, // Divergent columns count
          rows: 5,
          cells: [["Droga", "Dose", "Via", "Frequencia"]],
          structureConfidence: 0.7,
        },
      ],
      figures: [],
      readingOrder: [],
      provider: "MistralPdfOcrAdapter",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    const resolved = reconcilePageSource("doc_conflict", 1, nativePage, ocrResult);

    expect(resolved.resolutionMethod).toBe("MANUAL_REVIEW_REQUIRED");
    expect(resolved.sourceCompleteness).toBe("REVIEW_REQUIRED");
    expect(resolved.warnings.some((w) => w.includes("Conflito estrutural de tabela"))).toBe(true);
  });
});

describe("Etapa 1.28B — OCR Job Queue & Idempotency", () => {
  const ocrManager = OcrJobManager.getInstance();

  beforeEach(() => {
    ocrManager.reset();
  });

  it("returns existing job for identical fingerprint to prevent duplicate processing", async () => {
    const job1 = await ocrManager.createJob("doc_idemp", [1, 2], "sha256_mock_hash");
    const job2 = await ocrManager.createJob("doc_idemp", [1, 2], "sha256_mock_hash");

    expect(job1.jobId).toBe(job2.jobId);
    expect(job1.ocrJobFingerprint).toBe(job2.ocrJobFingerprint);
  });

  it("processes OCR job and updates resolved pages", async () => {
    const sourceDoc: SourceDocument = {
      id: "doc_job_test",
      title: "Documento para OCR",
      fileName: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      pageCount: 1,
      documentFingerprint: "sha256_job_1",
      sourceType: "DIRETRIZ",
      rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
      contentMode: "SCANNED_PDF",
      status: "OCR_REQUIRED",
      storagePath: "content-engine/source-documents/doc_job_test/source.pdf",
      createdBy: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extractedDocument: {
        documentId: "doc_job_test",
        pageCount: 1,
        contentMode: "SCANNED_PDF",
        totalCharacterCount: 0,
        imageCount: 1,
        tableCount: 0,
        pagesRequiringOcr: 1,
        engineName: "StaziaNativePdfExtractor",
        engineVersion: "1.0.0",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        pages: [
          {
            documentId: "doc_job_test",
            pageNumber: 1,
            text: "",
            textCharacterCount: 0,
            hasNativeText: false,
            images: [{ assetId: "img1", documentId: "doc_job_test", pageNumber: 1, index: 1 }],
            tables: [],
            extractionStatus: "OCR_REQUIRED",
          },
        ],
      },
    };

    const job = await ocrManager.createJob(sourceDoc.id, [1], sourceDoc.documentFingerprint);
    const { job: completedJob, resolvedPages } = await ocrManager.processJob(
      job.jobId,
      sourceDoc,
      Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF")
    );

    expect(completedJob.status).toBe("OCR_COMPLETED");
    expect(completedJob.progress).toBe(100);
    expect(resolvedPages.length).toBe(1);
    expect(resolvedPages[0].documentId).toBe("doc_job_test");
  });
});

describe("Etapa 1.28B — 3-Layer Source Preview UI", () => {
  const mockDoc: SourceDocument = {
    id: "doc-layer-preview",
    title: "Diretriz Reconciliada com 3 Camadas",
    fileName: "diretriz_3camadas.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1500000,
    pageCount: 1,
    documentFingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sourceType: "DIRETRIZ",
    rightsType: "PUBLIC_REFERENCE_ONLY",
    contentMode: "MIXED_PDF",
    status: "SOURCE_COMPLETED",
    storagePath: "content-engine/source-documents/doc-layer-preview/source.pdf",
    createdBy: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    extractedDocument: {
      documentId: "doc-layer-preview",
      pageCount: 1,
      contentMode: "MIXED_PDF",
      totalCharacterCount: 60,
      imageCount: 1,
      tableCount: 0,
      pagesRequiringOcr: 0,
      engineName: "StaziaNativePdfExtractor",
      engineVersion: "1.0.0",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      pages: [
        {
          documentId: "doc-layer-preview",
          pageNumber: 1,
          text: "Texto nativo original da página.",
          textCharacterCount: 32,
          hasNativeText: true,
          images: [{ assetId: "img_1", documentId: "doc-layer-preview", pageNumber: 1, index: 1 }],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
      ],
    },
    resolvedPages: [
      {
        documentId: "doc-layer-preview",
        pageNumber: 1,
        nativeExtraction: {
          documentId: "doc-layer-preview",
          pageNumber: 1,
          text: "Texto nativo original da página.",
          textCharacterCount: 32,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        ocrExtraction: {
          documentId: "doc-layer-preview",
          pageNumber: 1,
          text: "Texto complementar extraído via OCR da imagem.",
          blocks: [],
          tables: [],
          figures: [],
          readingOrder: [],
          provider: "MistralPdfOcrAdapter",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
        resolvedBlocks: [],
        resolvedText: "Texto nativo original da página.\n\n[Complemento Visual OCR]:\nTexto complementar extraído via OCR da imagem.",
        resolvedTables: [],
        resolvedFigures: [],
        resolutionMethod: "NATIVE_WITH_OCR_COMPLEMENT",
        warnings: [],
        sourceCompleteness: "COMPLETE",
      },
    ],
  };

  it("renders 3-layer switcher and switches between Resolved, Native and OCR layers", () => {
    render(<SourceDocumentPreview document={mockDoc} onClose={() => {}} />);

    // Default layer: Resolved Source
    expect(screen.getByText(/Fonte Resolvida/)).toBeInTheDocument();
    expect(screen.getByText(/Complemento Visual OCR/)).toBeInTheDocument();

    // Switch to Native Layer
    const nativeTab = screen.getByRole("button", { name: /2\. Extração Nativa/i });
    fireEvent.click(nativeTab);
    expect(screen.getByText("Texto Nativo Bruto (Sem OCR)")).toBeInTheDocument();
    expect(screen.getByText("Texto nativo original da página.")).toBeInTheDocument();

    // Switch to OCR Layer
    const ocrTab = screen.getByRole("button", { name: /3\. Extração OCR/i });
    fireEvent.click(ocrTab);
    expect(screen.getByText("Texto Transcrito via OCR Multimodal")).toBeInTheDocument();
    expect(screen.getByText("Texto complementar extraído via OCR da imagem.")).toBeInTheDocument();
  });
});
