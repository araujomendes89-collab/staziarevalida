/**
 * Domain types and contracts for OCR, Multimodal Source Extraction & Source Reconciliation (Etapa 1.28B).
 * Strictly preserves provenance and verbatim fidelity. Zero generative medical hallucination.
 */

import {
  ExtractedPdfPage,
  ExtractedPdfTable,
  PdfContentMode,
  SourceDocumentType,
  ContentReferenceRightsType,
} from "./pdfIngestion";

export type OcrBlockType =
  | "OCR_HEADING"
  | "OCR_PARAGRAPH"
  | "OCR_LIST"
  | "OCR_TABLE"
  | "OCR_FIGURE"
  | "OCR_CAPTION"
  | "OCR_FOOTNOTE"
  | "OCR_EQUATION"
  | "OCR_UNKNOWN";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrBlockProvenance {
  documentId: string;
  pageNumber: number;
  sourceBlockId?: string;
  ocrBlockId?: string;
  nativeObjectId?: string;
  boundingBox?: BoundingBox;
}

export interface OcrBlock {
  id: string;
  pageNumber: number;
  type: OcrBlockType;
  text?: string;
  boundingBox?: BoundingBox;
  order: number;
  confidence?: number;
  provenance: OcrBlockProvenance;
  repeatedDocumentChrome?: boolean; // header, footer, watermark
  watermarkNote?: string;
}

export interface OcrPageInput {
  documentId: string;
  pageNumber: number;
  sourceMode: PdfContentMode;
  pageAssetReference?: string;
  nativeText?: string;
  nativeTextConfidence?: number;
  width?: number;
  height?: number;
  pdfBytes?: Uint8Array | Buffer;
}

export interface ResolvedSourceFigure {
  figureId: string;
  pageNumber: number;
  boundingBox?: BoundingBox;
  caption?: string;
  captionRelation: "ATTACHED" | "CAPTION_RELATION_UNCERTAIN";
  ocrVisibleText?: string;
  assetReference?: string;
  interpretationStatus: "RAW_UNINTERPRETED"; // Strictly no clinical interpretation
}

export interface ResolvedSourceTable {
  tableId: string;
  pageNumber: number;
  columns: number;
  rows: number;
  cells: string[][];
  sourceMethod: "NATIVE" | "OCR" | "RECONCILED";
  confidence?: number;
  isConflict?: boolean;
  isUnresolved?: boolean; // TABLE_STRUCTURE_UNRESOLVED
  boundingBox?: BoundingBox;
}

export interface OcrPageResult {
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
  rawResponseDebug?: unknown; // Admin only, temporary
}

export type ResolutionMethod =
  | "NATIVE_ONLY"
  | "OCR_ONLY"
  | "NATIVE_WITH_OCR_COMPLEMENT"
  | "MANUAL_REVIEW_REQUIRED";

export type SourceCompletenessStatus = "COMPLETE" | "PARTIAL" | "REVIEW_REQUIRED";

export type PageCompleteness = "COMPLETE" | "BLANK_PAGE" | "PARTIAL" | "REVIEW_REQUIRED";

export type ManualReviewAction =
  | "SOURCE_APPROVED"
  | "NEEDS_REPROCESSING"
  | "NEEDS_MANUAL_CORRECTION";

export interface ManualSourceEdit {
  originalExtraction: string;
  editedSource: string;
  editedBy: string;
  editedAt: string;
  note?: string;
}

export interface ResolvedSourcePage {
  documentId: string;
  pageNumber: number;
  nativeExtraction?: ExtractedPdfPage;
  ocrExtraction?: OcrPageResult;
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

export type OcrJobStatus =
  | "OCR_QUEUED"
  | "OCR_PROCESSING"
  | "OCR_RECONCILING"
  | "OCR_COMPLETED"
  | "OCR_FAILED"
  | "OCR_PARTIAL"
  | "OCR_PROVIDER_UNAVAILABLE";

export interface OcrJobState {
  jobId: string;
  documentId: string;
  status: OcrJobStatus;
  progress: number; // 0..100
  pagesProcessed: number;
  totalPages: number;
  targetPages: number[];
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  attempts: number;
  maxAttempts: number;
  ocrJobFingerprint: string;
  provider: string;
}

export interface PageOcrHeuristicResult {
  pageNumber: number;
  ocrRequired: boolean;
  reason: string;
  isBlank: boolean;
  isImageDominant: boolean;
  nativeTextDensity: number;
  imageCount: number;
  tableCount: number;
}
