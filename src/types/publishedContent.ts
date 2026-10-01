/**
 * Student Native Content Publication Types & Contracts (Etapa 1.28F).
 * Implements immutable published snapshots, parent current-pointer document,
 * preflight gates, student-safe block model, and publication lifecycle.
 */

import { CanonicalMedicalArea } from "./medicalTaxonomy";
import { EditorialComponentType, EditorialSemanticRole, EditorialPagePlan } from "./medicalEditorial";
import { ExtractedPdfTable, ContentReferenceRightsType } from "./pdfIngestion";
import { ResolvedSourceFigure } from "./pdfOcr";

export const PUBLICATION_SCHEMA_VERSION = "2026.1.0";

/**
 * Publication Status for the Parent Topic Document
 */
export type PublicationHeaderStatus = "PUBLISHED" | "NOT_PUBLISHED" | "ARCHIVED";

/**
 * Publication Status for Version Snapshots (Derived or Initial)
 */
export type PublicationVersionStatus = "PUBLISHED" | "SUPERSEDED" | "ARCHIVED" | "PUBLICATION_DRAFT";

/**
 * Clean, Student-Safe Published Editorial Block.
 * Strictly excludes OCR data, private server paths, admin notes, and review logs.
 */
export interface PublishedEditorialBlock {
  id: string;
  type: EditorialComponentType;
  semanticRole: EditorialSemanticRole;
  content: string; // 100% Verbatim text from approved editorial source
  styleVariant?: string;
  warningSeverity?: "ATTENTION" | "HIGH_RISK" | "EMERGENCY";
  tableData?: ExtractedPdfTable;
  figureData?: ResolvedSourceFigure;
  listItems?: string[];
  order: number;
}

/**
 * Published Content Asset representation for student delivery.
 */
export interface PublishedContentAsset {
  id: string;
  publishedContentId: string;
  sourceAssetId?: string;
  mimeType: string;
  width?: number;
  height?: number;
  storagePath: string;
  rightsSnapshot: {
    rightsType: ContentReferenceRightsType;
    sourceDocumentTitle: string;
    organization?: string;
    year?: string;
  };
  fingerprint: string;
}

/**
 * Immutable Version Snapshot Document
 * Stored in: publishedTopicContents/{canonicalTopicId}/versions/{versionId}
 * 
 * INVARIANT: Once committed, this document is PERMANENTLY IMMUTABLE.
 * It is never updated, even when a newer version is published.
 */
export interface PublishedTopicContentVersion {
  id: string; // e.g. "pub_top_has_v1"
  canonicalTopicId: string; // e.g. "top_has"
  contentVersion: number; // 1, 2, 3...
  sourceEditorialDocumentId: string;
  sourceEditorialVersion: string;
  styleProfile: "MEDICAL_EDITORIAL_V1";
  styleProfileVersion: string; // "2026.1.0"
  pages: EditorialPagePlan[]; // Page distribution for provenance tracking
  blocks: PublishedEditorialBlock[]; // Linear student-safe blocks for responsive rendering
  rightsSnapshot: {
    rightsType: ContentReferenceRightsType;
    sourceDocumentTitle: string;
    organization?: string;
    year?: string;
    verifiedAt: string;
  };
  fingerprint: string;
  publishedAt: string;
  publishedBy: string;
  previousVersionId?: string;
  totalBlocks: number;
  estimatedReadMinutes: number;
}

/**
 * Parent / Current Pointer Document
 * Stored in: publishedTopicContents/{canonicalTopicId}
 */
export interface PublishedTopicHeader {
  canonicalTopicId: string;
  currentVersionId: string; // Points to active immutable version
  currentContentVersion: number; // 1, 2, 3...
  publicationStatus: PublicationHeaderStatus;
  area: CanonicalMedicalArea;
  specialty: string;
  topic: string;
  subtopics: string[];
  publishedAt: string;
  updatedAt: string;
  totalVersions: number;
  estimatedReadMinutes: number;
}

/**
 * Publication Preflight Gate Identifiers
 */
export type PublicationPreflightGate =
  | "PREFLIGHT_EDITORIAL_APPROVAL"
  | "PREFLIGHT_CANONICAL_TOPIC"
  | "PREFLIGHT_RIGHTS"
  | "PREFLIGHT_ASSETS"
  | "PREFLIGHT_CONTENT_INTEGRITY"
  | "PREFLIGHT_RENDERER_COMPATIBILITY";

export interface PreflightGateCheck {
  gate: PublicationPreflightGate;
  passed: boolean;
  message: string;
  details?: any;
}

export interface PublicationPreflightReport {
  passed: boolean;
  canonicalTopicId: string;
  canonicalTopicName: string;
  editorialDocumentId: string;
  checks: PreflightGateCheck[];
  totalBlocks: number;
  estimatedReadMinutes: number;
  fingerprint: string;
  warnings: string[];
  timestamp: string;
}

/**
 * Publication Job Lifecycle
 */
export type PublicationJobState =
  | "PUBLICATION_QUEUED"
  | "PUBLICATION_VALIDATING"
  | "PUBLICATION_CREATING_ASSETS"
  | "PUBLICATION_COMMITTING"
  | "PUBLISHED"
  | "PUBLICATION_FAILED"
  | "PUBLICATION_BLOCKED_RIGHTS"
  | "PUBLICATION_BLOCKED_CANONICAL_TOPIC_REQUIRED";

export interface PublicationJobResult {
  state: PublicationJobState;
  canonicalTopicId: string;
  versionId?: string;
  contentVersion?: number;
  publishedAt?: string;
  error?: string;
  preflightReport?: PublicationPreflightReport;
}
