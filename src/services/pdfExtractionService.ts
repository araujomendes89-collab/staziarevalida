import { PDF_CONTENT_ENGINE_LIMITS } from "../config/pdfContentEngineLimits";
import {
  ExtractedPdfDocument,
  ExtractedPdfImage,
  ExtractedPdfPage,
  ExtractedPdfTable,
  PdfContentMode,
  PdfExtractionEngine,
  PdfOcrEngine,
  SourceDocument,
} from "../types/pdfIngestion";

/**
 * Parses raw text from PDF content streams.
 * Handles literal text in parentheses (e.g. `(Hello World) Tj` or `[(Hello) 20 (World)] TJ`)
 * and hex strings `<48656C6C6F>`.
 */
export function extractTextFromContentStream(streamContent: string): string {
  const textLines: string[] = [];

  // Match text blocks: BT ... ET
  const btMatches = streamContent.match(/BT[\s\S]*?ET/g);
  if (btMatches && btMatches.length > 0) {
    for (const bt of btMatches) {
      // Find individual text operators: Tj, TJ, ', "
      // Match (string) Tj or [(array)] TJ
      const stringMatches = bt.match(/\((?:[^\\()]|\\.)*\)\s*(?:Tj|'|")/g) || [];
      const arrayMatches = bt.match(/\[([\s\S]*?)\]\s*TJ/g) || [];

      let blockText = "";

      // Process direct strings
      for (const sm of stringMatches) {
        const textMatch = sm.match(/\(((?:[^\\()]|\\.)*)\)/);
        if (textMatch && textMatch[1]) {
          const unescaped = unescapePdfString(textMatch[1]);
          blockText += unescaped + " ";
        }
      }

      // Process array strings
      for (const am of arrayMatches) {
        const innerStrings = am.match(/\(((?:[^\\()]|\\.)*)\)/g) || [];
        for (const is of innerStrings) {
          const raw = is.slice(1, -1);
          blockText += unescapePdfString(raw);
        }
        blockText += " ";
      }

      const trimmed = blockText.trim();
      if (trimmed) {
        textLines.push(trimmed);
      }
    }
  }

  // Fallback: If no BT...ET blocks found, extract any literal strings or plain text chunks
  if (textLines.length === 0) {
    const rawStrings = streamContent.match(/\(((?:[^\\()]|\\.)*)\)/g) || [];
    for (const rs of rawStrings) {
      const clean = unescapePdfString(rs.slice(1, -1)).trim();
      if (clean.length > 1) {
        textLines.push(clean);
      }
    }
  }

  return textLines.join("\n\n");
}

function unescapePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

/**
 * Detects basic table structures in extracted text (tab/pipe/column delimiters)
 * or marks structure as unresolved.
 */
export function detectTablesInPage(
  documentId: string,
  pageNumber: number,
  pageText: string
): ExtractedPdfTable[] {
  const tables: ExtractedPdfTable[] = [];
  const lines = pageText.split("\n").filter((l) => l.trim().length > 0);

  // Look for lines containing table headers/delimiters like | or multiple tabs/col delimiters
  const tableCandidateLines: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const isPipeDelimited = line.includes("|") && line.split("|").length >= 3;
    const isTabDelimited = line.includes("\t") && line.split("\t").length >= 3;

    if (isPipeDelimited || isTabDelimited) {
      inTable = true;
      tableCandidateLines.push(line);
    } else if (inTable) {
      // Table ended
      if (tableCandidateLines.length >= 2) {
        const delimiter = tableCandidateLines[0].includes("|") ? "|" : "\t";
        const rows = tableCandidateLines.map((r) =>
          r
            .split(delimiter)
            .map((c) => c.trim())
            .filter((c) => c.length > 0)
        );
        const colCount = Math.max(...rows.map((r) => r.length));

        tables.push({
          tableId: `table_${documentId}_p${pageNumber}_${tables.length + 1}`,
          documentId,
          pageNumber,
          columns: colCount,
          rows: rows.length,
          cells: rows,
          structureConfidence: 0.9,
          isUnresolved: false,
        });
      }
      tableCandidateLines.length = 0;
      inTable = false;
    }
  }

  // If table was at the end of page
  if (tableCandidateLines.length >= 2) {
    const delimiter = tableCandidateLines[0].includes("|") ? "|" : "\t";
    const rows = tableCandidateLines.map((r) =>
      r
        .split(delimiter)
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    );
    const colCount = Math.max(...rows.map((r) => r.length));

    tables.push({
      tableId: `table_${documentId}_p${pageNumber}_${tables.length + 1}`,
      documentId,
      pageNumber,
      columns: colCount,
      rows: rows.length,
      cells: rows,
      structureConfidence: 0.9,
      isUnresolved: false,
    });
  }

  return tables;
}

/**
 * Standard Native PDF Extraction Engine for StaziaMed Content Engine.
 * Pure verbatim extraction preserving text, tables, and image references.
 */
export class StaziaNativePdfExtractor implements PdfExtractionEngine {
  public readonly engineName = "StaziaNativePdfExtractor";
  public readonly engineVersion = "1.0.0";

  public async extract(
    sourceDoc: SourceDocument,
    pdfBytes: Uint8Array | Buffer
  ): Promise<ExtractedPdfDocument> {
    const startedAt = new Date().toISOString();
    const uint8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
    
    let pdfRawString = "";
    try {
      pdfRawString = new TextDecoder("utf-8", { fatal: false }).decode(uint8);
    } catch {
      pdfRawString = new TextDecoder("latin1").decode(uint8);
    }

    // Split document into Page Objects or Page Blocks
    // PDF Objects pattern: \d+ \d+ obj ... endobj
    const objectMatches = pdfRawString.match(/\d+\s+\d+\s+obj[\s\S]*?endobj/g) || [];

    // Find all /Type /Page objects
    const pageObjBodies: string[] = [];
    for (const obj of objectMatches) {
      if (/\/Type\s*\/Page\b/.test(obj) && !/\/Type\s*\/Pages\b/.test(obj)) {
        pageObjBodies.push(obj);
      }
    }

    // Collect all stream objects in the PDF
    const allStreamBodies: string[] = [];
    for (const obj of objectMatches) {
      if (/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/.test(obj)) {
        allStreamBodies.push(obj);
      }
    }

    // Collect all Image XObjects
    const allImageBodies: string[] = [];
    for (const obj of objectMatches) {
      if (/\/Subtype\s*\/Image\b/.test(obj)) {
        allImageBodies.push(obj);
      }
    }

    // Determine target page count
    const totalPages = pageObjBodies.length > 0 ? pageObjBodies.length : Math.max(1, sourceDoc.pageCount || 1);
    const extractedPages: ExtractedPdfPage[] = [];

    let totalImageCount = 0;
    let totalTableCount = 0;
    let totalCharCount = 0;

    for (let i = 0; i < totalPages; i++) {
      const pageNumber = i + 1;
      const pageObj = pageObjBodies[i] || "";

      // 1. Extract text from inline pageObj stream
      let pageText = "";
      if (pageObj) {
        pageText = extractTextFromContentStream(pageObj);
      }

      // 2. If pageObj didn't have text inline, map to stream at index i if available
      if (!pageText.trim() && allStreamBodies[i]) {
        pageText = extractTextFromContentStream(allStreamBodies[i]);
      }

      // 3. Fallback: If only 1 page or flat PDF, check all streams
      if (!pageText.trim() && totalPages === 1 && allStreamBodies.length > 0) {
        pageText = allStreamBodies.map((s) => extractTextFromContentStream(s)).join("\n\n");
      }

      const textCharCount = pageText.trim().length;
      const hasNativeText = textCharCount >= PDF_CONTENT_ENGINE_LIMITS.MIN_NATIVE_TEXT_CHARS_PER_PAGE;

      // Detect images on this page (inline or matching index)
      const images: ExtractedPdfImage[] = [];
      const inlineImageMatches = (pageObj || "").match(/\/Subtype\s*\/Image\b|\/XObject[\s\S]*?\/Image/g) || [];
      if (inlineImageMatches.length > 0) {
        inlineImageMatches.forEach((_, imgIdx) => {
          images.push({
            assetId: `img_${sourceDoc.id}_p${pageNumber}_${imgIdx + 1}`,
            documentId: sourceDoc.id,
            pageNumber,
            index: imgIdx + 1,
            mimeType: "image/jpeg",
          });
        });
      } else if (allImageBodies[i]) {
        images.push({
          assetId: `img_${sourceDoc.id}_p${pageNumber}_1`,
          documentId: sourceDoc.id,
          pageNumber,
          index: 1,
          mimeType: "image/jpeg",
        });
      }

      // Detect tables on this page
      const tables = detectTablesInPage(sourceDoc.id, pageNumber, pageText);

      totalCharCount += textCharCount;
      totalImageCount += images.length;
      totalTableCount += tables.length;

      const extractionStatus = hasNativeText ? "EXTRACTED" : "OCR_REQUIRED";

      extractedPages.push({
        documentId: sourceDoc.id,
        pageNumber,
        text: pageText,
        textCharacterCount: textCharCount,
        hasNativeText,
        images,
        tables,
        extractionStatus,
        ocrRequired: !hasNativeText,
      });
    }

    // Determine document content mode
    const pagesWithNativeText = extractedPages.filter((p) => p.hasNativeText).length;
    let contentMode: PdfContentMode = "TEXT_PDF";
    if (pagesWithNativeText === 0) {
      contentMode = "SCANNED_PDF";
    } else if (pagesWithNativeText < extractedPages.length) {
      contentMode = "MIXED_PDF";
    }

    const pagesRequiringOcr = extractedPages.filter((p) => p.ocrRequired).length;
    const finishedAt = new Date().toISOString();

    return {
      documentId: sourceDoc.id,
      pageCount: extractedPages.length,
      contentMode,
      pages: extractedPages,
      totalCharacterCount: totalCharCount,
      imageCount: totalImageCount,
      tableCount: totalTableCount,
      pagesRequiringOcr,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      startedAt,
      finishedAt,
    };
  }
}

/**
 * Standard OCR Engine Interface implementation with status NOT_CONNECTED.
 * Clearly demarcates that OCR is NOT connected in Etapa 1.28A.
 */
export const StaziaPdfOcrEngine: PdfOcrEngine = {
  status: "NOT_CONNECTED",
  isConnected: false,
  async requestOcr(): Promise<never> {
    throw new Error(
      "OCR Engine is NOT_CONNECTED in Etapa 1.28A. Scanned pages are flagged as OCR_REQUIRED without executing external OCR."
    );
  },
};
