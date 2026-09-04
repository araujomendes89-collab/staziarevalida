import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PDF_CONTENT_ENGINE_LIMITS } from "../config/pdfContentEngineLimits";
import { validatePdfBytes, computeSha256Fingerprint } from "../services/pdfValidationService";
import {
  StaziaNativePdfExtractor,
  StaziaPdfOcrEngine,
  extractTextFromContentStream,
  detectTablesInPage,
} from "../services/pdfExtractionService";
import { SourceDocument } from "../types/pdfIngestion";
import { SourceDocumentPreview } from "../components/admin/contentEngine/SourceDocumentPreview";
import { AdminContentEngineView } from "../components/admin/AdminContentEngineView";

// Helper to build mock PDF bytes
function createMockPdf(content: {
  header?: string;
  pages: { text: string; hasImage?: boolean; isEncrypted?: boolean }[];
  omitEof?: boolean;
}): Uint8Array {
  const header = content.header ?? "%PDF-1.4\n";
  let body = "";

  content.pages.forEach((p, idx) => {
    const pageNum = idx + 1;
    body += `${pageNum} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n`;
    if (p.text) {
      body += `${pageNum + 10} 0 obj\n<< /Length ${p.text.length} >>\nstream\nBT\n(${p.text}) Tj\nET\nendstream\nendobj\n`;
    }
    if (p.hasImage) {
      body += `${pageNum + 20} 0 obj\n<< /Type /XObject /Subtype /Image >>\nendobj\n`;
    }
  });

  if (content.pages.some((p) => p.isEncrypted)) {
    body += `99 0 obj\n<< /Encrypt << /V 2 >> >>\nendobj\n`;
  }

  const eof = content.omitEof ? "" : "\n%%EOF";
  const full = header + body + eof;
  return new TextEncoder().encode(full);
}

describe("Etapa 1.28A — PDF Limits & Validation Service", () => {
  it("enforces central configuration limits", () => {
    expect(PDF_CONTENT_ENGINE_LIMITS.MAX_PDF_SIZE_MB).toBe(50);
    expect(PDF_CONTENT_ENGINE_LIMITS.MAX_PDF_SIZE_BYTES).toBe(50 * 1024 * 1024);
    expect(PDF_CONTENT_ENGINE_LIMITS.MAX_PDF_PAGES).toBe(500);
    expect(PDF_CONTENT_ENGINE_LIMITS.MAGIC_BYTES).toBe("%PDF-");
    expect(PDF_CONTENT_ENGINE_LIMITS.MIN_NATIVE_TEXT_CHARS_PER_PAGE).toBe(50);
  });

  it("validates a well-formed PDF with magic bytes %PDF-", async () => {
    const pdfBytes = createMockPdf({
      pages: [{ text: "StaziaMed Revalida - Protocolo Clínico de Cardiologia" }],
    });

    const result = await validatePdfBytes(pdfBytes);
    expect(result.valid).toBe(true);
    expect(result.fingerprint).toBeDefined();
    expect(result.fingerprint.length).toBeGreaterThan(0);
    expect(result.isEncrypted).toBe(false);
    expect(result.estimatedPageCount).toBe(1);
  });

  it("rejects non-PDF files missing magic bytes", async () => {
    const invalidBytes = new TextEncoder().encode("<html><body>Not a PDF</body></html>");
    const result = await validatePdfBytes(invalidBytes);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("INVALID_MAGIC_BYTES");
  });

  it("rejects empty files", async () => {
    const emptyBytes = new Uint8Array(0);
    const result = await validatePdfBytes(emptyBytes);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("EMPTY_FILE");
  });

  it("rejects encrypted PDFs with /Encrypt dictionary", async () => {
    const encryptedPdf = createMockPdf({
      pages: [{ text: "Secret Clinical Data", isEncrypted: true }],
    });

    const result = await validatePdfBytes(encryptedPdf);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("PDF_ENCRYPTED");
    expect(result.isEncrypted).toBe(true);
  });

  it("rejects malformed PDFs missing %%EOF marker", async () => {
    const malformed = createMockPdf({
      pages: [{ text: "A".repeat(300) }],
      omitEof: true,
    });

    const result = await validatePdfBytes(malformed);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("PDF_MALFORMED");
  });
});

describe("Etapa 1.28A — Verbatim Native Extraction Service", () => {
  const extractor = new StaziaNativePdfExtractor();

  it("extracts TEXT_PDF when all pages contain >= 50 native characters", async () => {
    const textP1 = "Diretriz Brasileira de Hipertensão Arterial 2024. Classificação: Normal PA <= 120/80 mmHg.";
    const textP2 = "Estratificação de Risco Cardiovascular Adicional. Pacientes com LOA são de alto risco.";
    const pdfBytes = createMockPdf({
      pages: [{ text: textP1 }, { text: textP2 }],
    });

    const sourceDoc: SourceDocument = {
      id: "doc_test_1",
      title: "Diretriz HAS",
      fileName: "has.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      pageCount: 2,
      documentFingerprint: "sha256_mock_1",
      sourceType: "DIRETRIZ",
      rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
      contentMode: "TEXT_PDF",
      status: "EXTRACTING",
      storagePath: "content-engine/source-documents/doc_test_1/source.pdf",
      createdBy: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const extracted = await extractor.extract(sourceDoc, pdfBytes);

    expect(extracted.contentMode).toBe("TEXT_PDF");
    expect(extracted.pageCount).toBe(2);
    expect(extracted.pagesRequiringOcr).toBe(0);
    expect(extracted.pages[0].hasNativeText).toBe(true);
    expect(extracted.pages[0].extractionStatus).toBe("EXTRACTED");
    expect(extracted.pages[0].text).toContain("Diretriz Brasileira de Hipertensão");
    expect(extracted.pages[1].text).toContain("Estratificação de Risco");
  });

  it("extracts SCANNED_PDF when all pages have < 50 native characters and flags OCR_REQUIRED", async () => {
    const pdfBytes = createMockPdf({
      pages: [{ text: "", hasImage: true }, { text: "Scan", hasImage: true }],
    });

    const sourceDoc: SourceDocument = {
      id: "doc_test_scanned",
      title: "Apostila Escaneada",
      fileName: "scanned.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      pageCount: 2,
      documentFingerprint: "sha256_mock_scan",
      sourceType: "APOSTILA",
      rightsType: "PUBLIC_REFERENCE_ONLY",
      contentMode: "TEXT_PDF",
      status: "EXTRACTING",
      storagePath: "content-engine/source-documents/doc_test_scanned/source.pdf",
      createdBy: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const extracted = await extractor.extract(sourceDoc, pdfBytes);

    expect(extracted.contentMode).toBe("SCANNED_PDF");
    expect(extracted.pagesRequiringOcr).toBe(2);
    expect(extracted.pages[0].hasNativeText).toBe(false);
    expect(extracted.pages[0].ocrRequired).toBe(true);
    expect(extracted.pages[0].extractionStatus).toBe("OCR_REQUIRED");
  });

  it("extracts MIXED_PDF when some pages have text and some are scanned", async () => {
    const textP1 = "Protocolo Clínico e Diretrizes Terapêuticas de Diabetes Mellitus Tipo 2 no SUS.";
    const pdfBytes = createMockPdf({
      pages: [{ text: textP1 }, { text: "", hasImage: true }],
    });

    const sourceDoc: SourceDocument = {
      id: "doc_test_mixed",
      title: "PCDT Diabetes Misto",
      fileName: "mixed.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      pageCount: 2,
      documentFingerprint: "sha256_mock_mixed",
      sourceType: "PCDT",
      rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
      contentMode: "TEXT_PDF",
      status: "EXTRACTING",
      storagePath: "content-engine/source-documents/doc_test_mixed/source.pdf",
      createdBy: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const extracted = await extractor.extract(sourceDoc, pdfBytes);

    expect(extracted.contentMode).toBe("MIXED_PDF");
    expect(extracted.pagesRequiringOcr).toBe(1);
    expect(extracted.pages[0].hasNativeText).toBe(true);
    expect(extracted.pages[1].hasNativeText).toBe(false);
    expect(extracted.pages[1].ocrRequired).toBe(true);
  });

  it("detects table structures and delimiter matrices", () => {
    const samplePageWithTable = `
Tabela de Metas Pressóricas
| Categoria | PA Sistólica | PA Diastólica |
| Ótima | < 120 | < 80 |
| Normal | 120-129 | 80-84 |
| Pré-HAS | 130-139 | 85-89 |
`;
    const tables = detectTablesInPage("doc-1", 1, samplePageWithTable);
    expect(tables.length).toBe(1);
    expect(tables[0].columns).toBe(3);
    expect(tables[0].rows).toBe(4);
    expect(tables[0].cells[0]).toEqual(["Categoria", "PA Sistólica", "PA Diastólica"]);
  });

  it("confirms StaziaPdfOcrEngine is NOT_CONNECTED in Etapa 1.28A", async () => {
    expect(StaziaPdfOcrEngine.status).toBe("NOT_CONNECTED");
    expect(StaziaPdfOcrEngine.isConnected).toBe(false);
    if (StaziaPdfOcrEngine.requestOcr) {
      await expect(
        StaziaPdfOcrEngine.requestOcr({} as any, [1])
      ).rejects.toThrow("OCR Engine is NOT_CONNECTED");
    }
  });
});

describe("Etapa 1.28A — Source Document Preview & UI Integration", () => {
  const mockDoc: SourceDocument = {
    id: "doc-test-preview",
    title: "Diretriz Brasileira de Insuficiência Cardíaca",
    fileName: "diretriz_ic_2024.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1500000,
    pageCount: 2,
    documentFingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sourceType: "DIRETRIZ",
    rightsType: "PUBLIC_REFERENCE_ONLY",
    sourceYear: 2024,
    institution: "SBC",
    contentMode: "TEXT_PDF",
    status: "EXTRACTED",
    storagePath: "content-engine/source-documents/doc-test-preview/source.pdf",
    createdBy: "admin",
    createdAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T10:00:00.000Z",
    extractedDocument: {
      documentId: "doc-test-preview",
      pageCount: 2,
      contentMode: "TEXT_PDF",
      totalCharacterCount: 520,
      imageCount: 0,
      tableCount: 1,
      pagesRequiringOcr: 0,
      engineName: "StaziaNativePdfExtractor",
      engineVersion: "1.0.0",
      startedAt: "2026-09-04T10:00:00.000Z",
      finishedAt: "2026-09-04T10:00:01.000Z",
      pages: [
        {
          documentId: "doc-test-preview",
          pageNumber: 1,
          text: "DIRETRIZ DE INSUFICIÊNCIA CARDÍACA - PÁGINA 1\nTratamento farmacológico padrão com iSGLT2 e BB.",
          textCharacterCount: 95,
          hasNativeText: true,
          images: [],
          tables: [
            {
              tableId: "tab_1",
              documentId: "doc-test-preview",
              pageNumber: 1,
              columns: 2,
              rows: 2,
              cells: [
                ["Classe", "Fármaco"],
                ["iSGLT2", "Dapagliflozina / Empagliflozina"],
              ],
              structureConfidence: 0.95,
            },
          ],
          extractionStatus: "EXTRACTED",
          ocrRequired: false,
        },
        {
          documentId: "doc-test-preview",
          pageNumber: 2,
          text: "PÁGINA 2 - Critérios de Internação Hospitalar na IC Descompensada.",
          textCharacterCount: 65,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
          ocrRequired: false,
        },
      ],
    },
  };

  it("renders SourceDocumentPreview modal with metadata, table, and pagination", () => {
    let closed = false;
    render(
      <SourceDocumentPreview
        document={mockDoc}
        onClose={() => {
          closed = true;
        }}
      />
    );

    expect(screen.getByText("Diretriz Brasileira de Insuficiência Cardíaca")).toBeInTheDocument();
    expect(screen.getByText("PDF Nativo (Texto Direto)")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByText(/Tratamento farmacológico padrão/)).toBeInTheDocument();
    expect(screen.getByText("Dapagliflozina / Empagliflozina")).toBeInTheDocument();

    // Advance to page 2
    const nextBtn = screen.getByRole("button", { name: "Página seguinte" });
    fireEvent.click(nextBtn);
    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
    expect(screen.getByText(/Critérios de Internação Hospitalar/)).toBeInTheDocument();
  });

  it("renders AdminContentEngineView and allows switching to Documentos-fonte tab", () => {
    render(<AdminContentEngineView />);

    expect(screen.getByText("Motor de Ingestão & Curadoria Médica Estruturada")).toBeInTheDocument();

    // Click on "Documentos-fonte" tab
    const sourcesTab = screen.getByRole("button", { name: /Documentos-fonte/i });
    fireEvent.click(sourcesTab);

    expect(screen.getByText("Documentos-Fonte Cadastrados")).toBeInTheDocument();
    expect(screen.getByText("Diretriz Brasileira de Hipertensão Arterial 2020/2024")).toBeInTheDocument();
    expect(screen.getByText("PCDT Diabetes Mellitus Tipo 2 — MS")).toBeInTheDocument();
  });
});

describe("Etapa 1.28A — Backend Ingestion Store & Provenance", () => {
  it("formats canonical storage path under content-engine/source-documents/{documentId}/source.pdf", () => {
    const docId = "src_doc_123456";
    const expectedPath = `${PDF_CONTENT_ENGINE_LIMITS.STORAGE_BASE_PATH}/${docId}/source.pdf`;
    expect(expectedPath).toBe("content-engine/source-documents/src_doc_123456/source.pdf");
  });

  it("calculates exact SHA-256 fingerprint for identical files", async () => {
    const pdfBytesA = createMockPdf({
      pages: [{ text: "Protocolo Clínico de Asma Grave no SUS" }],
    });
    const pdfBytesB = createMockPdf({
      pages: [{ text: "Protocolo Clínico de Asma Grave no SUS" }],
    });

    const hashA = await computeSha256Fingerprint(pdfBytesA);
    const hashB = await computeSha256Fingerprint(pdfBytesB);

    expect(hashA).toBe(hashB);
  });
});

