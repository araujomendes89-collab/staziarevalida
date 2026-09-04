/**
 * High-Fidelity PDF Export Types & Canonical Contracts (Etapa 1.28E & 1.28E.1).
 * Defines shared A4 print geometry, preflight gates, rights snapshots,
 * export status, and validation results for StaziaPdfExportEngine.
 */

import { ContentReferenceRightsType } from "./pdfIngestion";

export const EDITORIAL_PDF_EXPORT_VERSION = "2026.1.0";

/**
 * Single Canonical Source of Truth for A4 Print & Preview Geometry.
 * Note: PDF vector geometry has no fixed global DPI; raster assets
 * embedded for print target 300 DPI with minimum acceptable threshold of 150 DPI.
 */
export const CANONICAL_A4_PRINT_CONFIG = {
  version: "2026.1.0",
  width: "210mm",
  height: "297mm",
  widthMm: 210,
  heightMm: 297,
  widthInches: 210 / 25.4, // ~8.267 in
  heightInches: 297 / 25.4, // ~11.693 in
  safeTop: "18mm",
  safeRight: "18mm",
  safeBottom: "18mm",
  safeLeft: "18mm",
  safeTopMm: 18,
  safeRightMm: 18,
  safeBottomMm: 18,
  safeLeftMm: 18,
  rasterAssetTargetDpi: 300,
  rasterMinAcceptableDpi: 150,
  targetAspectRatio: 210 / 297,
} as const;

export type EditorialPdfExportStatus =
  | "EXPORT_QUEUED"
  | "EXPORT_PREFLIGHT"
  | "EXPORT_RENDERING"
  | "EXPORT_VALIDATING"
  | "EXPORT_READY"
  | "EXPORT_FAILED"
  | "EXPORT_BLOCKED_RIGHTS";

export type RightsReviewStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export interface EditorialRightsSnapshot {
  rightsStatus: RightsReviewStatus;
  rightsTypeOriginal?: ContentReferenceRightsType;
  assetsReviewed: string[];
  approvedBy?: string;
  approvedAt?: string;
  decisionNotes?: string;
  disclaimerText?: string;
}

export interface PreflightValidationResult {
  rightsGate: "PASS" | "FAIL";
  assetsGate: "PASS" | "FAIL";
  fontsGate: "PASS" | "FAIL";
  layoutGate: "PASS" | "FAIL";
  status: "PASS" | "FAIL";
  details: {
    missingAssets: string[];
    rightsIssues: string[];
    fontWarnings: string[];
    layoutErrors: string[];
    rasterDpiWarnings?: string[];
  };
}

export interface PrintValidationResult {
  pageCountMatch: boolean;
  expectedPageCount: number;
  actualPageCount: number;
  overflowErrors: number;
  clippingWarnings: number;
  missingImages: number;
  fontWarnings: number;
  rightsWarnings: number;
  textSelectable: boolean;
  searchableTextFound: boolean;
  parsedTextVerified: boolean;
  extractedSampleTokens: string[];
  isRasterOnly: boolean;
  status: "PASS" | "FAIL" | "WARNING";
  validationTimestamp: string;
}

export interface EditorialPdfExport {
  id: string;
  editorialDocumentId: string;
  editorialDocumentVersion: string;
  sourceDocumentId?: string;
  structuredSourceContentId?: string;
  topic: string;
  canonicalTopicId?: string;
  compositionVersion: string;
  styleProfile: "MEDICAL_EDITORIAL_V1";
  styleProfileVersion?: string;
  exportEngine: "StaziaPdfExportEngine";
  exportEngineVersion: string;
  printConfigVersion: string;
  fingerprint: string;
  status: EditorialPdfExportStatus;
  rightsSnapshot: EditorialRightsSnapshot;
  preflightResult?: PreflightValidationResult;
  validationResult?: PrintValidationResult;
  pageCount: number;
  fileSizeBytes?: number;
  storagePath?: string;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  failureCode?: string;
  errorMessage?: string;
  isStale: boolean;
}

/**
 * Editorial PDF Export Repository Contract.
 * Abstracts backend persistence for export metadata (authoritative in Firestore).
 */
export interface EditorialPdfExportRepository {
  createExport(exportRecord: EditorialPdfExport): Promise<void>;
  updateExportStatus(
    exportId: string,
    status: EditorialPdfExportStatus,
    updates?: Partial<EditorialPdfExport>
  ): Promise<void>;
  getExport(exportId: string): Promise<EditorialPdfExport | null>;
  listExportsForDraft(draftId: string): Promise<EditorialPdfExport[]>;
  markStale(draftId: string): Promise<void>;
  saveValidationResult(exportId: string, result: PrintValidationResult): Promise<void>;
  recordRightsDecision(
    draftId: string,
    status: RightsReviewStatus,
    reviewerId: string,
    notes?: string
  ): Promise<void>;
  getRightsDecision(
    draftId: string
  ): Promise<{ status: RightsReviewStatus; approvedBy?: string; approvedAt?: string; notes?: string } | null>;
}
