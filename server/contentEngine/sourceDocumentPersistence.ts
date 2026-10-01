import {
  SourceDocument,
  SourceDocumentType,
  ContentReferenceRightsType,
  PdfContentMode,
  SourceDocumentStatus,
} from "../../src/types/pdfIngestion";
import { SourceCompletenessStatus } from "../../src/types/pdfOcr";

export interface NativeExtractionSummary {
  pageCount: number;
  contentMode: PdfContentMode;
  totalCharacterCount: number;
  imageCount: number;
  tableCount: number;
  pagesRequiringOcr: number;
  engineName: string;
  engineVersion: string;
  startedAt: string;
  finishedAt: string;
}

/**
 * Small persistent metadata representation of a SourceDocument stored in Firestore.
 * Deliberately excludes high-volume extraction & segmentation payloads:
 * - extractedDocument (except small nativeExtractionSummary)
 * - resolvedPages
 * - structuredContents
 * - segmentationResult
 */
export type PersistedSourceDocumentMetadata = Omit<
  SourceDocument,
  "extractedDocument" | "resolvedPages" | "structuredContents" | "segmentationResult"
> & {
  nativeExtractionSummary?: NativeExtractionSummary;
};

/**
 * Strips large transient fields and returns a clean, sanitized metadata object ready for Firestore.
 */
export function toPersistedSourceDocumentMetadata(
  doc: Partial<SourceDocument> & { nativeExtractionSummary?: NativeExtractionSummary }
): PersistedSourceDocumentMetadata {
  const metadata: PersistedSourceDocumentMetadata = {
    id: String(doc.id),
    title: String(doc.title || ""),
    fileName: String(doc.fileName || ""),
    mimeType: doc.mimeType || "application/pdf",
    sizeBytes: Number(doc.sizeBytes || 0),
    pageCount: Number(doc.pageCount || 1),
    documentFingerprint: String(doc.documentFingerprint || ""),
    sourceType: (doc.sourceType || "DIRETRIZ") as SourceDocumentType,
    rightsType: (doc.rightsType || "PUBLIC_REFERENCE_ONLY") as ContentReferenceRightsType,
    contentMode: (doc.contentMode || "TEXT_PDF") as PdfContentMode,
    status: (doc.status || "STORED") as SourceDocumentStatus,
    storagePath: String(doc.storagePath || ""),
    createdBy: String(doc.createdBy || ""),
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || new Date().toISOString()),
  };

  if (doc.sourceYear !== undefined && doc.sourceYear !== null) {
    metadata.sourceYear = Number(doc.sourceYear);
  }
  if (doc.institution !== undefined && doc.institution !== null && String(doc.institution).trim()) {
    metadata.institution = String(doc.institution).trim();
  }
  if (doc.ocrJobId !== undefined && doc.ocrJobId !== null) {
    metadata.ocrJobId = String(doc.ocrJobId);
  }
  if (doc.failureCode !== undefined && doc.failureCode !== null) {
    metadata.failureCode = String(doc.failureCode);
  }
  if (doc.duplicateOfDocumentId !== undefined && doc.duplicateOfDocumentId !== null) {
    metadata.duplicateOfDocumentId = String(doc.duplicateOfDocumentId);
  }
  if (doc.completenessStatus !== undefined && doc.completenessStatus !== null) {
    metadata.completenessStatus = doc.completenessStatus as SourceCompletenessStatus;
  }

  // Preserve or extract nativeExtractionSummary without pages[]
  if (doc.nativeExtractionSummary) {
    metadata.nativeExtractionSummary = {
      pageCount: Number(doc.nativeExtractionSummary.pageCount || 0),
      contentMode: doc.nativeExtractionSummary.contentMode || "TEXT_PDF",
      totalCharacterCount: Number(doc.nativeExtractionSummary.totalCharacterCount || 0),
      imageCount: Number(doc.nativeExtractionSummary.imageCount || 0),
      tableCount: Number(doc.nativeExtractionSummary.tableCount || 0),
      pagesRequiringOcr: Number(doc.nativeExtractionSummary.pagesRequiringOcr || 0),
      engineName: String(doc.nativeExtractionSummary.engineName || "StaziaNativePdfExtractor"),
      engineVersion: String(doc.nativeExtractionSummary.engineVersion || "1.0"),
      startedAt: String(doc.nativeExtractionSummary.startedAt || metadata.createdAt),
      finishedAt: String(doc.nativeExtractionSummary.finishedAt || metadata.updatedAt),
    };
  } else if (doc.extractedDocument) {
    metadata.nativeExtractionSummary = {
      pageCount: Number(doc.extractedDocument.pageCount || 0),
      contentMode: doc.extractedDocument.contentMode || "TEXT_PDF",
      totalCharacterCount: Number(doc.extractedDocument.totalCharacterCount || 0),
      imageCount: Number(doc.extractedDocument.imageCount || 0),
      tableCount: Number(doc.extractedDocument.tableCount || 0),
      pagesRequiringOcr: Number(doc.extractedDocument.pagesRequiringOcr || 0),
      engineName: String(doc.extractedDocument.engineName || "StaziaNativePdfExtractor"),
      engineVersion: String(doc.extractedDocument.engineVersion || "1.0"),
      startedAt: String(doc.extractedDocument.startedAt || metadata.createdAt),
      finishedAt: String(doc.extractedDocument.finishedAt || metadata.updatedAt),
    };
  }

  return metadata;
}
