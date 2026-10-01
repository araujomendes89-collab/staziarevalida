import { StructuredContentRepository } from "./structuredContentRepository";
import { StructuredBlockRepository } from "./structuredBlockRepository";
import {
  StructuredSourceBlock,
  StructuredSourceContent,
} from "../../src/types/medicalTaxonomy";
import { PersistedStructuredContentHeader } from "./structuredContentPersistence";
import { deserializeTableFromFirestore } from "./sourcePagePersistence";

export class StructuredContentHydrationService {
  /**
   * Hydrates a complete runtime StructuredSourceContent by joining its lightweight header
   * with its underlying StructuredSourceBlocks from the sourceDocuments subcollection.
   */
  static async hydrateStructuredContent(contentId: string): Promise<StructuredSourceContent | null> {
    const header = await StructuredContentRepository.getHeader(contentId);
    if (!header) {
      return null;
    }

    const blockIds = (header.blockRefs || []).map((r) => r.blockId);
    const blockMap = await StructuredBlockRepository.getBlocksByIds(
      header.sourceDocumentId,
      blockIds
    );

    return this.reconstructStructuredContent(header, blockMap);
  }

  /**
   * Lists and hydrates all StructuredSourceContent items for a target source document.
   */
  static async listStructuredContentsByDocument(
    documentId: string
  ): Promise<StructuredSourceContent[]> {
    const headers = await StructuredContentRepository.listHeadersByDocument(documentId);
    if (!headers || headers.length === 0) {
      return [];
    }

    // Collect all block IDs to fetch in a single batched lookup
    const allBlockIds: string[] = [];
    for (const header of headers) {
      for (const ref of header.blockRefs || []) {
        allBlockIds.push(ref.blockId);
      }
    }

    const blockMap = await StructuredBlockRepository.getBlocksByIds(documentId, allBlockIds);

    return headers.map((header) => this.reconstructStructuredContent(header, blockMap));
  }

  /**
   * Helper to reconstruct runtime StructuredSourceContent with order derived from blockRefs index.
   */
  private static reconstructStructuredContent(
    header: PersistedStructuredContentHeader,
    blockMap: Map<string, any>
  ): StructuredSourceContent {
    const blocks: StructuredSourceBlock[] = (header.blockRefs || []).map((ref, idx) => {
      const pb = blockMap.get(ref.blockId);
      if (pb) {
        return {
          id: pb.id,
          type: pb.type,
          order: idx + 1,
          pageNumber: pb.pageNumber,
          sourceBlockId: pb.sourceBlockId,
          originalText: pb.originalText,
          semanticRole: pb.semanticRole,
          tableData: pb.tableData,
          figureData: pb.figureData,
          provenance: pb.provenance,
        };
      }

      return {
        id: ref.blockId,
        type: "SOURCE_PARAGRAPH",
        order: idx + 1,
        pageNumber: ref.pageNumber,
        sourceBlockId: ref.sourceBlockId,
        originalText: "",
        provenance: {
          documentId: header.sourceDocumentId,
          segmentId: header.segmentId,
          pageNumber: ref.pageNumber,
          sourceBlockId: ref.sourceBlockId,
        },
      };
    });

    return {
      id: header.id,
      sourceDocumentId: header.sourceDocumentId,
      segmentId: header.segmentId,
      area: header.area,
      specialty: header.specialty,
      topic: header.topic,
      subtopics: header.subtopics || [],
      suggestedCanonicalTopicId: header.suggestedCanonicalTopicId,
      canonicalTopicId: header.canonicalTopicId,
      sourcePages: header.sourcePages || [],
      sourceBlockRefs: header.sourceBlockRefs || [],
      blocks,
      classificationConfidence: header.classificationConfidence,
      status: header.status,
      taxonomyVersion: header.taxonomyVersion,
      totalSourceBlocks: header.totalSourceBlocks,
      assignedSourceBlocks: header.assignedSourceBlocks,
      unassignedSourceBlocks: header.unassignedSourceBlocks,
      createdAt: header.createdAt,
      updatedAt: header.updatedAt,
    };
  }
}
