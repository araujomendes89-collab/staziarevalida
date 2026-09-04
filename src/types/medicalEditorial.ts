/**
 * Medical Editorial Composition Engine Types & Contracts (Etapa 1.28D).
 * Implements MEDICAL_EDITORIAL_V1 visual standard, page planning,
 * block registry, and verbatim source-to-editorial composition.
 */

import { CanonicalMedicalArea } from "./medicalTaxonomy";
import { ExtractedPdfTable, ContentReferenceRightsType } from "./pdfIngestion";
import { ResolvedSourceFigure } from "./pdfOcr";

export const EDITORIAL_COMPOSITION_VERSION = "2026.1.0";

/**
 * Baseline Design Tokens for MEDICAL_EDITORIAL_V1 (Strict Paper-like Medical Identity)
 */
export const MEDICAL_EDITORIAL_TOKENS = {
  background: "#F8FAFC", // Off-white paper background
  surface: "#FFFFFF",    // Clean white card surface
  deepNavy: "#0A192F",   // Primary brand header/accent
  teal: "#0D9488",       // Stazia brand teal
  tealAccent: "#45E0CE", // Vibrant secondary teal highlight
  stickyYellow: "#FEF9C3", // Post-it note background
  warningOrange: "#FFF7ED", // Attention callout
  warningRed: "#FEF2F2",   // Emergency / High-risk alert
  protocolPurple: "#FAF5FF", // Protocol update box
  textPrimary: "#0F172A", // High-contrast body text
  textSecondary: "#475569", // Subheaders and captions
  border: "#E2E8F0",      // Clean neutral border
  tableHeaderBg: "#0A192F",
  tableHeaderText: "#FFFFFF",
} as const;

/**
 * Semantic roles for editorial content classification.
 */
export type EditorialSemanticRole =
  | "TITLE"
  | "SECTION_HEADER"
  | "SUBSECTION_HEADER"
  | "BODY"
  | "LIST"
  | "DEFINITION"
  | "TABLE"
  | "ALGORITHM"
  | "FIGURE"
  | "CAPTION"
  | "WARNING"
  | "NOTE"
  | "COMPARISON"
  | "SOURCE_SUMMARY"
  | "REFERENCE"
  | "UNRESOLVED";

/**
 * Component types available in the MEDICAL_EDITORIAL_V1 registry.
 */
export type EditorialComponentType =
  | "MedicalEditorialHero"
  | "BrushSectionHeader"
  | "EditorialSubheading"
  | "EditorialParagraph"
  | "EditorialList"
  | "StickyNoteCard"
  | "StaziaMedicalTable"
  | "ClinicalWarningCard"
  | "ProtocolUpdateCard"
  | "ComparisonCard"
  | "ClinicalAlgorithmSteps"
  | "MedicalImageBlock"
  | "MedicalFigureCaption"
  | "DefinitionCard"
  | "ReferenceBlock"
  | "QuickSummaryStrip"
  | "StaziaEditorialFooter"
  | "PageContinuationMarker"
  | "EditorialSourceWarning";

/**
 * Editorial Page Roles for structural document flow.
 */
export type PageRole =
  | "TOPIC_OPENING"
  | "CORE_CONTENT"
  | "TABLE_FOCUSED"
  | "ALGORITHM_FOCUSED"
  | "FIGURE_FOCUSED"
  | "WARNING_FOCUSED"
  | "SUMMARY_SOURCE_SECTION"
  | "REFERENCES"
  | "CONTINUATION";

/**
 * Density States for editorial layout planning.
 */
export type DensityState = "LOW" | "BALANCED" | "HIGH" | "OVERFLOW_RISK";

/**
 * Block layout hints used by page composition heuristics.
 */
export interface EditorialLayoutHints {
  densityWeight: number; // Estimated height/weight unit (1 = small para, 5 = table, etc.)
  keepWithNext?: boolean;
  avoidPageBreakInside?: boolean;
  fullWidth?: boolean;
}

/**
 * Provenance tracking for an editorial block linked back to source extraction.
 */
export interface EditorialBlockProvenance {
  documentId: string;
  sourcePage: number;
  sourceBlockId: string;
  sourceTextVerbatim: string;
}

/**
 * Individual editorial block with 100% verbatim source content.
 */
export interface EditorialBlock {
  id: string;
  type: EditorialComponentType;
  sourceBlockRefs: string[];
  content: string; // Verbatim source text (strictly un-rewritten)
  semanticRole: EditorialSemanticRole;
  styleVariant?: string; // e.g. "ATTENTION" | "HIGH_RISK" | "EMERGENCY" for warnings
  layoutHints: EditorialLayoutHints;
  provenance: EditorialBlockProvenance;
  sourceOrder: number;
  editorialOrder: number;
  tableData?: ExtractedPdfTable;
  figureData?: ResolvedSourceFigure;
  listItems?: string[];
  warningSeverity?: "ATTENTION" | "HIGH_RISK" | "EMERGENCY";
  rightsWarning?: "REPUBLICATION_REVIEW_REQUIRED";
}

/**
 * Editorial Page Plan representing a single rendered page (A4 proportion or screen slice).
 */
export interface EditorialPagePlan {
  pageIndex: number; // 1-indexed
  pageRole: PageRole;
  blocks: EditorialBlock[];
  sourceBlockRefs: string[];
  estimatedDensity: DensityState;
  densityScore: number;
  pageBreakReason?: string;
}

/**
 * Source Block Assignment state for zero-loss auditing.
 */
export interface SourceBlockAssignment {
  sourceBlockId: string;
  status: "ASSIGNED" | "ADMIN_EXCLUDED" | "REVIEW_REQUIRED";
  assignedEditorialBlockId?: string;
  exclusionReason?: string;
}

/**
 * Complete Editorial Composition Plan.
 */
export interface EditorialCompositionPlan {
  id: string;
  structuredSourceContentId: string;
  styleProfile: "MEDICAL_EDITORIAL_V1";
  documentTitle: string;
  pagePlan: EditorialPagePlan[];
  sourceBlockAssignments: SourceBlockAssignment[];
  warnings: string[];
  compositionStatus: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED_EDITORIAL";
  totalStructuredSourceBlocks: number;
  assignedEditorialBlocks: number;
  adminExcludedBlocks: number;
  reviewRequiredBlocks: number;
  unaccountedSourceBlocks: number; // Must strictly equal 0
  duplicatedSourceBlockAssignments: number; // Must strictly equal 0
}

/**
 * Complete Stazia Editorial Document Draft entity.
 */
export interface StaziaEditorialDocumentDraft {
  id: string;
  structuredSourceContentId: string;
  sourceDocumentId: string;
  segmentId: string;
  canonicalTopicId?: string;
  area?: CanonicalMedicalArea;
  specialty?: string;
  topic: string;
  subtopics: string[];
  styleProfile: "MEDICAL_EDITORIAL_V1";
  compositionVersion: string; // e.g. "2026.1.0"
  pages: EditorialPagePlan[];
  plan: EditorialCompositionPlan;
  status: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED_EDITORIAL";
  sourceRightsType?: ContentReferenceRightsType;
  assetRightsWarnings?: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}
