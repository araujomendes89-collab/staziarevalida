import {
  ExtractedPdfPage,
  ExtractedPdfImage,
  ExtractedPdfTable,
  PdfPageExtractionStatus,
} from "../../src/types/pdfIngestion";
import {
  OcrBlock,
  ResolvedSourceFigure,
  ResolvedSourceTable,
  ResolutionMethod,
  PageCompleteness,
  ManualReviewAction,
  ManualSourceEdit,
  OcrPageResult,
  ResolvedSourcePage,
} from "../../src/types/pdfOcr";

/**
 * Deterministic zero-padded page identifier generator (e.g. 1 -> "0001", 10 -> "0010", 100 -> "0100").
 */
export function formatPageId(pageNumber: number): string {
  return String(pageNumber).padStart(4, "0");
}

/**
 * Helper to serialize ExtractedPdfTable safely for Firestore by stringifying 2D nested arrays.
 */
export function serializeTableForFirestore(table?: ExtractedPdfTable): any {
  if (!table) return undefined;
  return {
    ...table,
    cells: JSON.stringify(table.cells || []),
  };
}

/**
 * Helper to deserialize ExtractedPdfTable from Firestore.
 */
export function deserializeTableFromFirestore(table?: any): ExtractedPdfTable | undefined {
  if (!table) return undefined;
  let cells = table.cells;
  if (typeof cells === "string") {
    try {
      cells = JSON.parse(cells);
    } catch {
      cells = [];
    }
  }
  return {
    ...table,
    cells: Array.isArray(cells) ? cells : [],
  };
}

/**
 * Helper to serialize ResolvedSourceTable safely for Firestore.
 */
export function serializeResolvedTableForFirestore(table?: ResolvedSourceTable): any {
  if (!table) return undefined;
  return {
    ...table,
    cells: JSON.stringify(table.cells || []),
  };
}

/**
 * Helper to deserialize ResolvedSourceTable from Firestore.
 */
export function deserializeResolvedTableFromFirestore(table?: any): ResolvedSourceTable | undefined {
  if (!table) return undefined;
  let cells = table.cells;
  if (typeof cells === "string") {
    try {
      cells = JSON.parse(cells);
    } catch {
      cells = [];
    }
  }
  return {
    ...table,
    cells: Array.isArray(cells) ? cells : [],
  };
}

/**
 * Recursive sanitization helper that strips all `undefined` values so Firestore writes succeed cleanly.
 */
export function removeUndefinedDeep<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== "object") {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => removeUndefinedDeep(item)) as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      result[k] = removeUndefinedDeep(v);
    }
  }
  return result as T;
}

/**
 * Persisted contract for Native PDF extraction pages.
 */
export interface PersistedNativePage {
  documentId: string;
  pageNumber: number;
  text: string;
  textCharacterCount: number;
  hasNativeText: boolean;
  images: ExtractedPdfImage[];
  tables: ExtractedPdfTable[];
  width?: number;
  height?: number;
  extractionStatus: PdfPageExtractionStatus;
  ocrRequired?: boolean;
}

/**
 * Persisted contract for OCR extraction pages.
 * Deliberately excludes high-volume rawResponseDebug.
 */
export interface PersistedOcrPage {
  documentId: string;
  pageNumber: number;
  text: string;
  blocks: OcrBlock[];
  tables: ExtractedPdfTable[];
  figures: ResolvedSourceFigure[];
  readingOrder: number[];
  provider: string;
  providerVersion?: string;
  confidence?: number;
  startedAt: string;
  finishedAt: string;
}

/**
 * Persisted contract for Reconciled/Reviewed source pages.
 * Deliberately excludes embedded nativeExtraction and ocrExtraction.
 */
export interface PersistedResolvedPage {
  documentId: string;
  pageNumber: number;
  resolvedBlocks: OcrBlock[];
  resolvedText: string;
  resolvedTables: ResolvedSourceTable[];
  resolvedFigures: ResolvedSourceFigure[];
  resolutionMethod: ResolutionMethod;
  warnings: string[];
  sourceCompleteness: PageCompleteness;
  manualReviewStatus?: ManualReviewAction;
  manualEdit?: ManualSourceEdit;
}

export function toPersistedNativePage(page: ExtractedPdfPage, documentId: string): PersistedNativePage {
  const persisted: PersistedNativePage = {
    documentId: String(page.documentId || documentId),
    pageNumber: Number(page.pageNumber),
    text: String(page.text || ""),
    textCharacterCount: Number(page.textCharacterCount || (page.text ? page.text.length : 0)),
    hasNativeText: Boolean(page.hasNativeText),
    images: Array.isArray(page.images) ? page.images : [],
    tables: Array.isArray(page.tables) ? page.tables.map(serializeTableForFirestore) : [],
    extractionStatus: page.extractionStatus || "EXTRACTED",
  };

  if (page.width !== undefined && page.width !== null) {
    persisted.width = Number(page.width);
  }
  if (page.height !== undefined && page.height !== null) {
    persisted.height = Number(page.height);
  }
  if (page.ocrRequired !== undefined && page.ocrRequired !== null) {
    persisted.ocrRequired = Boolean(page.ocrRequired);
  }

  return removeUndefinedDeep(persisted);
}

export function toPersistedOcrPage(page: OcrPageResult, documentId: string): PersistedOcrPage {
  const persisted: PersistedOcrPage = {
    documentId: String(page.documentId || documentId),
    pageNumber: Number(page.pageNumber),
    text: String(page.text || ""),
    blocks: Array.isArray(page.blocks) ? page.blocks : [],
    tables: Array.isArray(page.tables) ? page.tables.map(serializeTableForFirestore) : [],
    figures: Array.isArray(page.figures) ? page.figures : [],
    readingOrder: Array.isArray(page.readingOrder) ? page.readingOrder : [],
    provider: String(page.provider || "GeminiVisionOCR"),
    startedAt: String(page.startedAt || new Date().toISOString()),
    finishedAt: String(page.finishedAt || new Date().toISOString()),
  };

  if (page.providerVersion !== undefined && page.providerVersion !== null) {
    persisted.providerVersion = String(page.providerVersion);
  }
  if (page.confidence !== undefined && page.confidence !== null) {
    persisted.confidence = Number(page.confidence);
  }

  return removeUndefinedDeep(persisted);
}

export function toPersistedResolvedPage(page: ResolvedSourcePage, documentId: string): PersistedResolvedPage {
  const persisted: PersistedResolvedPage = {
    documentId: String(page.documentId || documentId),
    pageNumber: Number(page.pageNumber),
    resolvedBlocks: Array.isArray(page.resolvedBlocks) ? page.resolvedBlocks : [],
    resolvedText: String(page.resolvedText || ""),
    resolvedTables: Array.isArray(page.resolvedTables) ? page.resolvedTables.map(serializeResolvedTableForFirestore) : [],
    resolvedFigures: Array.isArray(page.resolvedFigures) ? page.resolvedFigures : [],
    resolutionMethod: page.resolutionMethod || "NATIVE_ONLY",
    warnings: Array.isArray(page.warnings) ? page.warnings : [],
    sourceCompleteness: page.sourceCompleteness || "COMPLETE",
  };

  if (page.manualReviewStatus !== undefined && page.manualReviewStatus !== null) {
    persisted.manualReviewStatus = page.manualReviewStatus;
  }
  if (page.manualEdit !== undefined && page.manualEdit !== null) {
    persisted.manualEdit = {
      originalExtraction: String(page.manualEdit.originalExtraction || ""),
      editedSource: String(page.manualEdit.editedSource || ""),
      editedBy: String(page.manualEdit.editedBy || ""),
      editedAt: String(page.manualEdit.editedAt || new Date().toISOString()),
      note: page.manualEdit.note ? String(page.manualEdit.note) : undefined,
    };
  }

  return removeUndefinedDeep(persisted);
}
