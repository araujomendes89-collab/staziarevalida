import { getAdminDb } from "../firebaseAdmin";
import {
  EDITORIAL_DRAFTS_COLLECTION,
  EditorialDraftRepository,
} from "./editorialDraftRepository";
import {
  EditorialBlock,
  EditorialCompositionPlan,
  EditorialPagePlan,
  StaziaEditorialDocumentDraft,
} from "../../src/types/medicalEditorial";
import { deserializeTableFromFirestore } from "../contentEngine/sourcePagePersistence";

export class EditorialDraftHydrationService {
  /**
   * Fully rehydrates a StaziaEditorialDocumentDraft from Firestore.
   * Ensures draft.pages and draft.plan.pagePlan point to the same unified structure.
   */
  static async hydrateDraft(draftId: string): Promise<StaziaEditorialDocumentDraft | null> {
    const header = await EditorialDraftRepository.getHeader(draftId);
    if (!header) {
      return null;
    }

    // 1. List pages, blocks, and assignments in parallel
    const [pageDocs, blockDocs, assignmentDocs] = await Promise.all([
      EditorialDraftRepository.listPages(draftId),
      EditorialDraftRepository.listBlocks(draftId),
      EditorialDraftRepository.listAssignments(draftId),
    ]);

    const blockMap = new Map<string, EditorialBlock>();
    for (const b of blockDocs) {
      blockMap.set(b.id, {
        id: b.id,
        type: b.type,
        sourceBlockRefs: b.sourceBlockRefs || [],
        content: b.content,
        semanticRole: b.semanticRole,
        styleVariant: b.styleVariant,
        layoutHints: b.layoutHints,
        provenance: b.provenance,
        sourceOrder: b.sourceOrder,
        editorialOrder: b.editorialOrder,
        tableData: deserializeTableFromFirestore(b.tableData),
        figureData: b.figureData,
        listItems: b.listItems,
        warningSeverity: b.warningSeverity,
        rightsWarning: b.rightsWarning,
      });
    }

    // 2. Reconstruct pages with reattached blocks in sequential order
    const pages: EditorialPagePlan[] = pageDocs.map((p) => {
      const pageBlocks: EditorialBlock[] = (p.blockRefs || [])
        .map((bId) => blockMap.get(bId))
        .filter(Boolean) as EditorialBlock[];

      const sourceBlockRefs = pageBlocks.flatMap((b) => b.sourceBlockRefs);

      return {
        pageIndex: p.pageIndex,
        pageRole: p.pageRole,
        blocks: pageBlocks,
        sourceBlockRefs: sourceBlockRefs.length > 0 ? sourceBlockRefs : p.sourceBlockRefs || [],
        estimatedDensity: p.estimatedDensity,
        densityScore: p.densityScore,
        pageBreakReason: p.pageBreakReason,
      };
    });

    // 3. Reconstruct plan with pagePlan pointing to pages
    const plan: EditorialCompositionPlan = {
      id: header.planSummary?.id || header.id,
      structuredSourceContentId:
        header.planSummary?.structuredSourceContentId || header.structuredSourceContentId,
      styleProfile: "MEDICAL_EDITORIAL_V1",
      documentTitle: header.planSummary?.documentTitle || header.topic,
      pagePlan: pages, // Single unified source of truth
      sourceBlockAssignments: assignmentDocs.map((a) => ({
        sourceBlockId: a.sourceBlockId,
        status: a.status,
        assignedEditorialBlockId: a.assignedEditorialBlockId,
        exclusionReason: a.exclusionReason,
      })),
      warnings: header.planSummary?.warnings || [],
      compositionStatus: header.planSummary?.compositionStatus || header.status || "DRAFT",
      totalStructuredSourceBlocks: header.planSummary?.totalStructuredSourceBlocks ?? 0,
      assignedEditorialBlocks: header.planSummary?.assignedEditorialBlocks ?? 0,
      adminExcludedBlocks: header.planSummary?.adminExcludedBlocks ?? 0,
      reviewRequiredBlocks: header.planSummary?.reviewRequiredBlocks ?? 0,
      unaccountedSourceBlocks: header.planSummary?.unaccountedSourceBlocks ?? 0,
      duplicatedSourceBlockAssignments: header.planSummary?.duplicatedSourceBlockAssignments ?? 0,
    };

    return {
      id: header.id,
      structuredSourceContentId: header.structuredSourceContentId,
      sourceDocumentId: header.sourceDocumentId,
      segmentId: header.segmentId,
      canonicalTopicId: header.canonicalTopicId,
      area: header.area,
      specialty: header.specialty,
      topic: header.topic,
      subtopics: header.subtopics || [],
      styleProfile: "MEDICAL_EDITORIAL_V1",
      compositionVersion: header.compositionVersion,
      pages,
      plan,
      status: header.status,
      sourceRightsType: header.sourceRightsType,
      assetRightsWarnings: header.assetRightsWarnings,
      createdAt: header.createdAt,
      createdBy: header.createdBy,
      updatedAt: header.updatedAt,
    };
  }

  /**
   * Retrieves the latest hydrated draft associated with a StructuredSourceContent item.
   */
  static async getDraftByStructuredContentId(
    contentId: string
  ): Promise<StaziaEditorialDocumentDraft | null> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(EDITORIAL_DRAFTS_COLLECTION)
      .where("structuredSourceContentId", "==", contentId)
      .get();

    if (snapshot.empty) {
      return null;
    }

    // Pick latest by updatedAt
    const sortedDocs = snapshot.docs.sort((a, b) => {
      const timeA = new Date(a.data().updatedAt || 0).getTime();
      const timeB = new Date(b.data().updatedAt || 0).getTime();
      return timeB - timeA;
    });

    return await this.hydrateDraft(sortedDocs[0].id);
  }
}
