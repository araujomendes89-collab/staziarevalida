/**
 * PDF Source Ingestion & Extraction Contracts (Etapa 1.28A & 1.28B).
 * Strict domain models, provenance tracking, and extraction interfaces.
 */

import type { ResolvedSourcePage, SourceCompletenessStatus, OcrPageInput, OcrPageResult } from "./pdfOcr";
import type { StructuredSourceContent, MedicalSegmentationResult } from "./medicalTaxonomy";

export type SourceDocumentType =
  | "APOSTILA"
  | "PCDT"
  | "DIRETRIZ"
  | "AULA"
  | "PROVA"
  | "ARTIGO"
  | "MATERIAL_PROPRIO"
  | "OUTRO";

export type ContentReferenceRightsType =
  | "OWNED"
  | "LICENSED"
  | "AUTHORIZED"
  | "OFFICIAL_PUBLIC_DOCUMENT"
  | "PUBLIC_REFERENCE_ONLY"
  | "OTHER_AUTHORIZED";

export type SourceDocumentStatus =
  | "UPLOADING"
  | "VALIDATING"
  | "STORED"
  | "EXTRACTING"
  | "EXTRACTED"
  | "OCR_REQUIRED"
  | "OCR_QUEUED"
  | "OCR_PROCESSING"
  | "SOURCE_RECONCILING"
  | "SOURCE_COMPLETED"
  | "SOURCE_REVIEW_REQUIRED"
  | "EXTRACTION_FAILED";

export type PdfContentMode = "TEXT_PDF" | "SCANNED_PDF" | "MIXED_PDF";

export type PdfPageExtractionStatus = "EXTRACTED" | "OCR_REQUIRED" | "FAILED";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedPdfImage {
  assetId: string;
  documentId: string;
  pageNumber: number;
  index: number;
  width?: number;
  height?: number;
  mimeType?: string;
  storagePath?: string;
  boundingBox?: BoundingBox;
  captionCandidate?: string;
}

export interface ExtractedPdfTable {
  tableId: string;
  documentId: string;
  pageNumber: number;
  columns: number;
  rows: number;
  cells: string[][];
  boundingBox?: BoundingBox;
  structureConfidence: number;
  isUnresolved?: boolean; // TABLE_STRUCTURE_UNRESOLVED
}

export interface ExtractedPdfPage {
  documentId: string;
  pageNumber: number; // 1-indexed
  text: string; // Raw verbatim text
  textCharacterCount: number;
  hasNativeText: boolean; // >= 50 native chars or heuristic check
  images: ExtractedPdfImage[];
  tables: ExtractedPdfTable[];
  width?: number;
  height?: number;
  extractionStatus: PdfPageExtractionStatus;
  ocrRequired?: boolean;
}

export interface ExtractedPdfDocument {
  documentId: string;
  pageCount: number;
  contentMode: PdfContentMode;
  pages: ExtractedPdfPage[];
  totalCharacterCount: number;
  imageCount: number;
  tableCount: number;
  pagesRequiringOcr: number;
  engineName: string;
  engineVersion: string;
  startedAt: string;
  finishedAt: string;
}

export interface SourceDocument {
  id: string; // Opaque UUID
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  documentFingerprint: string; // SHA-256
  sourceType: SourceDocumentType;
  rightsType: ContentReferenceRightsType;
  sourceYear?: number;
  institution?: string;
  contentMode: PdfContentMode;
  status: SourceDocumentStatus;
  storagePath: string; // content-engine/source-documents/{documentId}/source.pdf
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  extractedDocument?: ExtractedPdfDocument;
  resolvedPages?: ResolvedSourcePage[];
  completenessStatus?: SourceCompletenessStatus;
  ocrJobId?: string;
  failureCode?: string;
  duplicateOfDocumentId?: string;
  structuredContents?: StructuredSourceContent[];
  segmentationResult?: MedicalSegmentationResult;
}

export interface PdfValidationResult {
  valid: boolean;
  fingerprint: string;
  sizeBytes: number;
  estimatedPageCount?: number;
  isEncrypted?: boolean;
  errorCode?: "INVALID_MAGIC_BYTES" | "FILE_TOO_LARGE" | "PDF_ENCRYPTED" | "PDF_MALFORMED" | "EMPTY_FILE";
  errorMessage?: string;
}

export interface PdfExtractionEngine {
  readonly engineName: string;
  readonly engineVersion: string;
  extract(sourceDoc: SourceDocument, pdfBytes: Uint8Array | Buffer): Promise<ExtractedPdfDocument>;
}

export interface PdfOcrEngine {
  readonly providerName: string;
  readonly providerVersion: string;
  readonly isConnected: boolean;
  processPageOcr(input: OcrPageInput): Promise<OcrPageResult>;
}
