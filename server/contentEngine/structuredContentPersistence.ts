import {
  CanonicalMedicalArea,
  StructuredBlockType,
  StructuredContentStatus,
  StructuredSourceBlock,
  StructuredSourceContent,
} from "../../src/types/medicalTaxonomy";
import { ExtractedPdfTable } from "../../src/types/pdfIngestion";
import { ResolvedSourceFigure } from "../../src/types/pdfOcr";
import { removeUndefinedDeep, serializeTableForFirestore } from "./sourcePagePersistence";

/**
 * Maximum safe payload size in bytes for a single Firestore document (900 KB).
 * Leaves ample headroom below Firestore's hard 1,048,576 byte limit.
 */
export const MAX_STRUCTURED_BLOCK_BYTES = 900_000;
export const MAX_STRUCTURED_CONTENT_HEADER_BYTES = 900_000;

/**
 * Persisted contract for heavy, immutable StructuredSourceBlocks.
 * Strictly excludes `order` (order is derived dynamically from blockRefs in the content header).
 */
export interface PersistedStructuredBlock {
  id: string;
  sourceDocumentId: string;
  type: StructuredBlockType;
  pageNumber: number;
  sourceBlockId: string;
  originalText: string;
  semanticRole?: string;
  tableData?: ExtractedPdfTable;
  figureData?: ResolvedSourceFigure;
  provenance: {
    documentId: string;
    segmentId: string;
    pageNumber: number;
    sourceBlockId: string;
  };
}

/**
 * Lightweight pointer to a StructuredSourceBlock within a StructuredSourceContent header.
 */
export interface StructuredBlockRef {
  blockId: string;
  sourceBlockId: string;
  pageNumber: number;
}

/**
 * Lightweight, mutable header for StructuredSourceContent.
 * Strictly excludes `blocks[]` array to avoid bloating and exceeding document size limits.
 */
export interface PersistedStructuredContentHeader {
  id: string;
  sourceDocumentId: string;
  segmentId: string;
  area?: CanonicalMedicalArea;
  specialty?: string;
  topic: string;
  subtopics: string[];
  suggestedCanonicalTopicId?: string;
  canonicalTopicId?: string;
  sourcePages: number[];
  sourceBlockRefs: string[];
  blockRefs: StructuredBlockRef[];
  classificationConfidence: number;
  status: StructuredContentStatus;
  taxonomyVersion: string;
  totalSourceBlocks: number;
  assignedSourceBlocks: number;
  unassignedSourceBlocks: number;
  segmentationJobId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Helper to conservatively calculate the serialized byte size of an object.
 */
export function estimatePayloadBytes(obj: any): number {
  if (!obj) return 0;
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

/**
 * Serializes and validates a runtime StructuredSourceBlock for Firestore persistence.
 * Throws STRUCTURED_BLOCK_TOO_LARGE if size exceeds safety limit without truncating.
 */
export function toPersistedStructuredBlock(
  sourceDocumentId: string,
  block: StructuredSourceBlock
): PersistedStructuredBlock {
  const docId = sourceDocumentId || block.provenance?.documentId;

  const persisted: PersistedStructuredBlock = {
    id: String(block.id),
    sourceDocumentId: String(docId),
    type: block.type,
    pageNumber: Number(block.pageNumber),
    sourceBlockId: String(block.sourceBlockId || ""),
    originalText: String(block.originalText || ""),
    provenance: {
      documentId: String(block.provenance?.documentId || docId),
      segmentId: String(block.provenance?.segmentId || ""),
      pageNumber: Number(block.provenance?.pageNumber ?? block.pageNumber),
      sourceBlockId: String(block.provenance?.sourceBlockId || block.sourceBlockId || ""),
    },
  };

  if (block.semanticRole) {
    persisted.semanticRole = String(block.semanticRole);
  }
  if (block.tableData) {
    persisted.tableData = block.tableData;
  }
  if (block.figureData) {
    persisted.figureData = block.figureData;
  }

  const cleaned = removeUndefinedDeep(persisted);
  const sizeBytes = estimatePayloadBytes(cleaned);

  if (sizeBytes > MAX_STRUCTURED_BLOCK_BYTES) {
    throw new Error(
      `STRUCTURED_BLOCK_TOO_LARGE: Bloco estruturado '${block.id}' possui tamanho (${sizeBytes} bytes) que excede o limite seguro de ${MAX_STRUCTURED_BLOCK_BYTES} bytes.`
    );
  }

  return cleaned;
}

/**
 * Serializes and validates a runtime StructuredSourceContent into a lightweight header.
 * Throws STRUCTURED_CONTENT_HEADER_TOO_LARGE if size exceeds safety limit.
 */
export function toPersistedStructuredContentHeader(
  content: StructuredSourceContent,
  segmentationJobId?: string
): PersistedStructuredContentHeader {
  const blockRefs: StructuredBlockRef[] = Array.isArray(content.blocks)
    ? content.blocks.map((b) => ({
        blockId: String(b.id),
        sourceBlockId: String(b.sourceBlockId || ""),
        pageNumber: Number(b.pageNumber),
      }))
    : [];

  const header: PersistedStructuredContentHeader = {
    id: String(content.id),
    sourceDocumentId: String(content.sourceDocumentId),
    segmentId: String(content.segmentId || ""),
    topic: String(content.topic || "Tópico Sem Título"),
    subtopics: Array.isArray(content.subtopics) ? content.subtopics : [],
    sourcePages: Array.isArray(content.sourcePages) ? content.sourcePages : [],
    sourceBlockRefs: Array.isArray(content.sourceBlockRefs) ? content.sourceBlockRefs : [],
    blockRefs,
    classificationConfidence: Number(content.classificationConfidence ?? 1.0),
    status: content.status || "STRUCTURING",
    taxonomyVersion: String(content.taxonomyVersion || "2026.1.0"),
    totalSourceBlocks: Number(content.totalSourceBlocks ?? blockRefs.length),
    assignedSourceBlocks: Number(content.assignedSourceBlocks ?? blockRefs.length),
    unassignedSourceBlocks: Number(content.unassignedSourceBlocks ?? 0),
    createdAt: String(content.createdAt || new Date().toISOString()),
    updatedAt: String(content.updatedAt || new Date().toISOString()),
  };

  if (content.area) header.area = content.area;
  if (content.specialty) header.specialty = content.specialty;
  if (content.suggestedCanonicalTopicId) header.suggestedCanonicalTopicId = content.suggestedCanonicalTopicId;
  if (content.canonicalTopicId) header.canonicalTopicId = content.canonicalTopicId;
  if (segmentationJobId) header.segmentationJobId = segmentationJobId;

  const cleaned = removeUndefinedDeep(header);
  const sizeBytes = estimatePayloadBytes(cleaned);

  if (sizeBytes > MAX_STRUCTURED_CONTENT_HEADER_BYTES) {
    throw new Error(
      `STRUCTURED_CONTENT_HEADER_TOO_LARGE: Header do conteúdo estruturado '${content.id}' possui tamanho (${sizeBytes} bytes) que excede o limite seguro.`
    );
  }

  return cleaned;
}
