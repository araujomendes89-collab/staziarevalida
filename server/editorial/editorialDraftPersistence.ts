import {
  DensityState,
  EditorialBlock,
  EditorialBlockProvenance,
  EditorialComponentType,
  EditorialLayoutHints,
  EditorialPagePlan,
  EditorialSemanticRole,
  PageRole,
  SourceBlockAssignment,
  StaziaEditorialDocumentDraft,
} from "../../src/types/medicalEditorial";
import { CanonicalMedicalArea } from "../../src/types/medicalTaxonomy";
import { ContentReferenceRightsType, ExtractedPdfTable } from "../../src/types/pdfIngestion";
import { ResolvedSourceFigure } from "../../src/types/pdfOcr";
import { removeUndefinedDeep, serializeTableForFirestore } from "../contentEngine/sourcePagePersistence";

export const MAX_EDITORIAL_PAYLOAD_BYTES = 900_000;

/**
 * Lightweight, mutable header for StaziaEditorialDocumentDraft.
 * Strictly excludes `pages[]`, `plan.pagePlan[]`, and `plan.sourceBlockAssignments[]`.
 */
export interface PersistedEditorialDraftHeader {
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
  compositionVersion: string;
  status: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED_EDITORIAL";
  sourceRightsType?: ContentReferenceRightsType;
  assetRightsWarnings?: string[];
  pageCount: number;
  planSummary: {
    id: string;
    structuredSourceContentId: string;
    styleProfile: "MEDICAL_EDITORIAL_V1";
    documentTitle: string;
    warnings: string[];
    compositionStatus: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED_EDITORIAL";
    totalStructuredSourceBlocks: number;
    assignedEditorialBlocks: number;
    adminExcludedBlocks: number;
    reviewRequiredBlocks: number;
    unaccountedSourceBlocks: number;
    duplicatedSourceBlockAssignments: number;
  };
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/**
 * Persisted contract for an individual editorial page.
 * Strictly excludes `blocks[]` (stores `blockRefs: string[]` instead).
 */
export interface PersistedEditorialPage {
  pageId: string;
  pageIndex: number;
  pageRole: PageRole;
  blockRefs: string[];
  sourceBlockRefs: string[];
  estimatedDensity: DensityState;
  densityScore: number;
  pageBreakReason?: string;
}

/**
 * Persisted contract for an individual EditorialBlock.
 */
export interface PersistedEditorialBlock {
  id: string;
  type: EditorialComponentType;
  sourceBlockRefs: string[];
  content: string;
  semanticRole: EditorialSemanticRole;
  styleVariant?: string;
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
 * Persisted contract for a SourceBlockAssignment.
 */
export interface PersistedSourceBlockAssignment {
  sourceBlockId: string;
  status: "ASSIGNED" | "ADMIN_EXCLUDED" | "REVIEW_REQUIRED";
  assignedEditorialBlockId?: string;
  exclusionReason?: string;
}

export function estimatePayloadBytes(obj: any): number {
  if (!obj) return 0;
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

export function toPersistedEditorialDraftHeader(
  draft: StaziaEditorialDocumentDraft
): PersistedEditorialDraftHeader {
  const plan = draft.plan;
  const header: PersistedEditorialDraftHeader = {
    id: String(draft.id),
    structuredSourceContentId: String(draft.structuredSourceContentId),
    sourceDocumentId: String(draft.sourceDocumentId),
    segmentId: String(draft.segmentId || ""),
    topic: String(draft.topic || "Editorial"),
    subtopics: Array.isArray(draft.subtopics) ? draft.subtopics : [],
    styleProfile: "MEDICAL_EDITORIAL_V1",
    compositionVersion: String(draft.compositionVersion || "2026.1.0"),
    status: draft.status || "DRAFT",
    pageCount: Array.isArray(draft.pages) ? draft.pages.length : 0,
    planSummary: {
      id: String(plan.id || draft.id),
      structuredSourceContentId: String(plan.structuredSourceContentId || draft.structuredSourceContentId),
      styleProfile: "MEDICAL_EDITORIAL_V1",
      documentTitle: String(plan.documentTitle || draft.topic),
      warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
      compositionStatus: plan.compositionStatus || draft.status || "DRAFT",
      totalStructuredSourceBlocks: Number(plan.totalStructuredSourceBlocks ?? 0),
      assignedEditorialBlocks: Number(plan.assignedEditorialBlocks ?? 0),
      adminExcludedBlocks: Number(plan.adminExcludedBlocks ?? 0),
      reviewRequiredBlocks: Number(plan.reviewRequiredBlocks ?? 0),
      unaccountedSourceBlocks: Number(plan.unaccountedSourceBlocks ?? 0),
      duplicatedSourceBlockAssignments: Number(plan.duplicatedSourceBlockAssignments ?? 0),
    },
    createdAt: String(draft.createdAt || new Date().toISOString()),
    createdBy: String(draft.createdBy || "system-admin"),
    updatedAt: String(draft.updatedAt || new Date().toISOString()),
  };

  if (draft.canonicalTopicId) header.canonicalTopicId = draft.canonicalTopicId;
  if (draft.area) header.area = draft.area;
  if (draft.specialty) header.specialty = draft.specialty;
  if (draft.sourceRightsType) header.sourceRightsType = draft.sourceRightsType;
  if (draft.assetRightsWarnings) header.assetRightsWarnings = draft.assetRightsWarnings;

  const cleaned = removeUndefinedDeep(header);
  const sizeBytes = estimatePayloadBytes(cleaned);
  if (sizeBytes > MAX_EDITORIAL_PAYLOAD_BYTES) {
    throw new Error(
      `EDITORIAL_DRAFT_HEADER_TOO_LARGE: Header do draft editorial '${draft.id}' (${sizeBytes} bytes) excede o limite seguro.`
    );
  }

  return cleaned;
}

export function toPersistedEditorialPage(
  page: EditorialPagePlan,
  pageIdOverride?: string
): PersistedEditorialPage {
  const pageId = pageIdOverride || `page_${page.pageIndex}_${Math.random().toString(36).substring(2, 7)}`;
  const blockRefs = (page.blocks || []).map((b) => b.id);

  const pageDoc: PersistedEditorialPage = {
    pageId,
    pageIndex: Number(page.pageIndex),
    pageRole: page.pageRole || "CORE_CONTENT",
    blockRefs,
    sourceBlockRefs: Array.isArray(page.sourceBlockRefs) ? page.sourceBlockRefs : [],
    estimatedDensity: page.estimatedDensity || "BALANCED",
    densityScore: Number(page.densityScore ?? 5.0),
  };

  if (page.pageBreakReason) {
    pageDoc.pageBreakReason = page.pageBreakReason;
  }

  const cleaned = removeUndefinedDeep(pageDoc);
  const sizeBytes = estimatePayloadBytes(cleaned);
  if (sizeBytes > MAX_EDITORIAL_PAYLOAD_BYTES) {
    throw new Error(
      `EDITORIAL_PAGE_HEADER_TOO_LARGE: Header da página editorial '${pageId}' (${sizeBytes} bytes) excede o limite seguro.`
    );
  }

  return cleaned;
}

export function toPersistedEditorialBlock(block: EditorialBlock): PersistedEditorialBlock {
  const persisted: PersistedEditorialBlock = {
    id: String(block.id),
    type: block.type,
    sourceBlockRefs: Array.isArray(block.sourceBlockRefs) ? block.sourceBlockRefs : [],
    content: String(block.content || ""),
    semanticRole: block.semanticRole || "BODY",
    layoutHints: {
      densityWeight: Number(block.layoutHints?.densityWeight ?? 1),
      keepWithNext: block.layoutHints?.keepWithNext ? Boolean(block.layoutHints.keepWithNext) : undefined,
      avoidPageBreakInside: block.layoutHints?.avoidPageBreakInside
        ? Boolean(block.layoutHints.avoidPageBreakInside)
        : undefined,
      fullWidth: block.layoutHints?.fullWidth ? Boolean(block.layoutHints.fullWidth) : undefined,
    },
    provenance: {
      documentId: String(block.provenance?.documentId || ""),
      sourcePage: Number(block.provenance?.sourcePage ?? 1),
      sourceBlockId: String(block.provenance?.sourceBlockId || ""),
      sourceTextVerbatim: String(block.provenance?.sourceTextVerbatim || block.content || ""),
    },
    sourceOrder: Number(block.sourceOrder ?? 1),
    editorialOrder: Number(block.editorialOrder ?? 1),
  };

  if (block.styleVariant) persisted.styleVariant = block.styleVariant;
  if (block.tableData) persisted.tableData = serializeTableForFirestore(block.tableData);
  if (block.figureData) persisted.figureData = block.figureData;
  if (block.listItems) persisted.listItems = block.listItems;
  if (block.warningSeverity) persisted.warningSeverity = block.warningSeverity;
  if (block.rightsWarning) persisted.rightsWarning = block.rightsWarning;

  const cleaned = removeUndefinedDeep(persisted);
  const sizeBytes = estimatePayloadBytes(cleaned);
  if (sizeBytes > MAX_EDITORIAL_PAYLOAD_BYTES) {
    throw new Error(
      `EDITORIAL_BLOCK_TOO_LARGE: Bloco editorial '${block.id}' (${sizeBytes} bytes) excede o limite seguro.`
    );
  }

  return cleaned;
}

export function toPersistedSourceBlockAssignment(
  assignment: SourceBlockAssignment
): PersistedSourceBlockAssignment {
  const persisted: PersistedSourceBlockAssignment = {
    sourceBlockId: String(assignment.sourceBlockId),
    status: assignment.status || "ASSIGNED",
  };

  if (assignment.assignedEditorialBlockId) {
    persisted.assignedEditorialBlockId = String(assignment.assignedEditorialBlockId);
  }
  if (assignment.exclusionReason) {
    persisted.exclusionReason = String(assignment.exclusionReason);
  }

  const cleaned = removeUndefinedDeep(persisted);
  const sizeBytes = estimatePayloadBytes(cleaned);
  if (sizeBytes > MAX_EDITORIAL_PAYLOAD_BYTES) {
    throw new Error(
      `EDITORIAL_ASSIGNMENT_TOO_LARGE: Atribuição de bloco de fonte '${assignment.sourceBlockId}' excede o limite seguro.`
    );
  }

  return cleaned;
}
