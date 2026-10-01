import { getAdminDb } from "../firebaseAdmin";
import {
  PersistedEditorialBlock,
  PersistedEditorialDraftHeader,
  PersistedEditorialPage,
  PersistedSourceBlockAssignment,
  toPersistedEditorialBlock,
  toPersistedEditorialDraftHeader,
  toPersistedEditorialPage,
  toPersistedSourceBlockAssignment,
} from "./editorialDraftPersistence";
import {
  EditorialComponentType,
  StaziaEditorialDocumentDraft,
} from "../../src/types/medicalEditorial";

export const EDITORIAL_DRAFTS_COLLECTION = "editorialDrafts";
export const PAGES_SUBCOLLECTION = "pages";
export const BLOCKS_SUBCOLLECTION = "blocks";
export const SOURCE_ASSIGNMENTS_SUBCOLLECTION = "sourceAssignments";

const BATCH_CHUNK_SIZE = 400;

export class EditorialDraftRepository {
  /**
   * Persists a complete normalized StaziaEditorialDocumentDraft to Firestore.
   */
  static async saveDraft(draft: StaziaEditorialDocumentDraft): Promise<void> {
    const db = getAdminDb();
    const draftRef = db.collection(EDITORIAL_DRAFTS_COLLECTION).doc(draft.id);

    // 1. Save Header
    const header = toPersistedEditorialDraftHeader(draft);
    await draftRef.set(header);

    // Clean up existing page docs if overwriting an existing draft
    const existingPagesSnap = await draftRef.collection(PAGES_SUBCOLLECTION).get();
    if (existingPagesSnap && !existingPagesSnap.empty && existingPagesSnap.docs) {
      const deleteBatch = db.batch();
      existingPagesSnap.docs.forEach((d: any) => {
        if (d.ref) deleteBatch.delete(d.ref);
      });
      await deleteBatch.commit();
    }

    // 2. Save Pages
    const pages = draft.pages || [];
    const pageDocs = pages.map((p) => toPersistedEditorialPage(p, `page_${p.pageIndex}_${draft.id.slice(-6)}`));

    for (let i = 0; i < pageDocs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pageDocs.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const p of chunk) {
        const pRef = draftRef.collection(PAGES_SUBCOLLECTION).doc(p.pageId);
        batch.set(pRef, p);
      }
      await batch.commit();
    }

    // 3. Save Editorial Blocks
    const allBlocks: PersistedEditorialBlock[] = [];
    for (const p of pages) {
      for (const b of p.blocks || []) {
        allBlocks.push(toPersistedEditorialBlock(b));
      }
    }

    for (let i = 0; i < allBlocks.length; i += BATCH_CHUNK_SIZE) {
      const chunk = allBlocks.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const b of chunk) {
        const bRef = draftRef.collection(BLOCKS_SUBCOLLECTION).doc(b.id);
        batch.set(bRef, b);
      }
      await batch.commit();
    }

    // 4. Save Source Block Assignments
    const assignments = draft.plan?.sourceBlockAssignments || [];
    const assignmentDocs = assignments.map((a) => toPersistedSourceBlockAssignment(a));

    for (let i = 0; i < assignmentDocs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = assignmentDocs.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const a of chunk) {
        const aRef = draftRef.collection(SOURCE_ASSIGNMENTS_SUBCOLLECTION).doc(a.sourceBlockId);
        batch.set(aRef, a);
      }
      await batch.commit();
    }
  }

  /**
   * Retrieves draft header from Firestore.
   */
  static async getHeader(draftId: string): Promise<PersistedEditorialDraftHeader | null> {
    const db = getAdminDb();
    const snapshot = await db.collection(EDITORIAL_DRAFTS_COLLECTION).doc(draftId).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedEditorialDraftHeader;
  }

  /**
   * Lists all pages belonging to a draft, sorted by pageIndex ascending.
   */
  static async listPages(draftId: string): Promise<PersistedEditorialPage[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(EDITORIAL_DRAFTS_COLLECTION)
      .doc(draftId)
      .collection(PAGES_SUBCOLLECTION)
      .get();

    const pages = snapshot.docs.map((d) => d.data() as PersistedEditorialPage);
    return pages.sort((a, b) => a.pageIndex - b.pageIndex);
  }

  /**
   * Lists all blocks belonging to a draft.
   */
  static async listBlocks(draftId: string): Promise<PersistedEditorialBlock[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(EDITORIAL_DRAFTS_COLLECTION)
      .doc(draftId)
      .collection(BLOCKS_SUBCOLLECTION)
      .get();

    return snapshot.docs.map((d) => d.data() as PersistedEditorialBlock);
  }

  /**
   * Lists all source block assignments belonging to a draft.
   */
  static async listAssignments(draftId: string): Promise<PersistedSourceBlockAssignment[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(EDITORIAL_DRAFTS_COLLECTION)
      .doc(draftId)
      .collection(SOURCE_ASSIGNMENTS_SUBCOLLECTION)
      .get();

    return snapshot.docs.map((d) => d.data() as PersistedSourceBlockAssignment);
  }

  /**
   * Atomically reorders blocks within a page header and updates editorial orders.
   */
  static async reorderPageBlocks(
    draftId: string,
    pageIndex: number,
    fromIndex: number,
    toIndex: number
  ): Promise<void> {
    const db = getAdminDb();
    const draftRef = db.collection(EDITORIAL_DRAFTS_COLLECTION).doc(draftId);

    await db.runTransaction(async (transaction: any) => {
      const draftSnap = await transaction.get(draftRef);
      if (!draftSnap.exists) {
        throw new Error(`DRAFT_NOT_FOUND: Draft '${draftId}' não encontrado.`);
      }

      const pagesSnap = await draftRef.collection(PAGES_SUBCOLLECTION).get();
      const pages = pagesSnap.docs.map((d: any) => d.data() as PersistedEditorialPage);
      const targetPage = pages.find((p) => p.pageIndex === pageIndex);

      if (!targetPage) {
        throw new Error(`PAGE_NOT_FOUND: Página '${pageIndex}' não encontrada no draft.`);
      }

      if (
        fromIndex < 0 ||
        fromIndex >= targetPage.blockRefs.length ||
        toIndex < 0 ||
        toIndex >= targetPage.blockRefs.length
      ) {
        throw new Error("INVALID_REORDER_INDICES: Índices de reordenação inválidos.");
      }

      const updatedBlockRefs = [...targetPage.blockRefs];
      const [moved] = updatedBlockRefs.splice(fromIndex, 1);
      updatedBlockRefs.splice(toIndex, 0, moved);

      // Update target page header
      const pageRef = draftRef.collection(PAGES_SUBCOLLECTION).doc(targetPage.pageId);
      transaction.set(pageRef, { ...targetPage, blockRefs: updatedBlockRefs });

      // Update editorialOrder on affected blocks
      for (let i = 0; i < updatedBlockRefs.length; i++) {
        const blockId = updatedBlockRefs[i];
        const blockRef = draftRef.collection(BLOCKS_SUBCOLLECTION).doc(blockId);
        transaction.set(blockRef, { editorialOrder: i + 1 }, { merge: true });
      }

      // Update draft updatedAt
      transaction.set(draftRef, { updatedAt: new Date().toISOString() }, { merge: true });
    });
  }

  /**
   * Updates the component type of a specific editorial block.
   */
  static async changeComponentType(
    draftId: string,
    blockId: string,
    newType: EditorialComponentType
  ): Promise<void> {
    const db = getAdminDb();
    const draftRef = db.collection(EDITORIAL_DRAFTS_COLLECTION).doc(draftId);
    const blockRef = draftRef.collection(BLOCKS_SUBCOLLECTION).doc(blockId);

    await db.runTransaction(async (transaction: any) => {
      const blockSnap = await transaction.get(blockRef);
      if (!blockSnap.exists) {
        throw new Error(`BLOCK_NOT_FOUND: Bloco '${blockId}' não encontrado.`);
      }

      transaction.set(blockRef, { type: newType }, { merge: true });
      transaction.set(draftRef, { updatedAt: new Date().toISOString() }, { merge: true });
    });
  }

  /**
   * Atomically inserts a page break at a specific block, moving subsequent blocks to a new page.
   */
  static async insertPageBreakAtBlock(
    draftId: string,
    blockId: string,
    newPageIdOverride?: string
  ): Promise<void> {
    const db = getAdminDb();
    const draftRef = db.collection(EDITORIAL_DRAFTS_COLLECTION).doc(draftId);
    const newPageId = newPageIdOverride || `page_break_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db.runTransaction(async (transaction: any) => {
      const draftSnap = await transaction.get(draftRef);
      if (!draftSnap.exists) {
        throw new Error(`DRAFT_NOT_FOUND: Draft '${draftId}' não encontrado.`);
      }

      const pagesSnap = await draftRef.collection(PAGES_SUBCOLLECTION).get();
      const pages = pagesSnap.docs
        .map((d: any) => d.data() as PersistedEditorialPage)
        .sort((a, b) => a.pageIndex - b.pageIndex);

      let targetPageIndex = -1;
      let targetBlockIndex = -1;
      let targetPage: PersistedEditorialPage | null = null;

      for (let pIdx = 0; pIdx < pages.length; pIdx++) {
        const bIdx = pages[pIdx].blockRefs.indexOf(blockId);
        if (bIdx !== -1) {
          targetPageIndex = pIdx;
          targetBlockIndex = bIdx;
          targetPage = pages[pIdx];
          break;
        }
      }

      if (targetPageIndex === -1 || !targetPage || targetBlockIndex === -1) {
        throw new Error(`BLOCK_NOT_FOUND: Bloco '${blockId}' não encontrado para quebra de página.`);
      }

      const curBlockRefs = targetPage.blockRefs.slice(0, targetBlockIndex);
      const remainingBlockRefs = targetPage.blockRefs.slice(targetBlockIndex);

      // Update current page
      const curPageRef = draftRef.collection(PAGES_SUBCOLLECTION).doc(targetPage.pageId);
      transaction.set(curPageRef, {
        ...targetPage,
        blockRefs: curBlockRefs,
      });

      // Create new page
      const newPageRef = draftRef.collection(PAGES_SUBCOLLECTION).doc(newPageId);
      const newPage: PersistedEditorialPage = {
        pageId: newPageId,
        pageIndex: targetPage.pageIndex + 1,
        pageRole: "CORE_CONTENT",
        blockRefs: remainingBlockRefs,
        sourceBlockRefs: [],
        estimatedDensity: "BALANCED",
        densityScore: 5.0,
        pageBreakReason: "Quebra manual inserida pelo Administrador",
      };
      transaction.set(newPageRef, newPage);

      // Increment pageIndex on all subsequent pages
      for (let i = targetPageIndex + 1; i < pages.length; i++) {
        const laterPage = pages[i];
        const laterPageRef = draftRef.collection(PAGES_SUBCOLLECTION).doc(laterPage.pageId);
        transaction.set(laterPageRef, {
          ...laterPage,
          pageIndex: laterPage.pageIndex + 1,
        });
      }

      // Update draft header page count & updatedAt
      const draftData = draftSnap.data() as PersistedEditorialDraftHeader;
      transaction.set(
        draftRef,
        {
          pageCount: (draftData.pageCount || pages.length) + 1,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
  }

  /**
   * Atomically approves editorial layout.
   */
  static async approveEditorialLayout(draftId: string): Promise<void> {
    const db = getAdminDb();
    const draftRef = db.collection(EDITORIAL_DRAFTS_COLLECTION).doc(draftId);

    await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(draftRef);
      if (!snap.exists) {
        throw new Error(`DRAFT_NOT_FOUND: Draft '${draftId}' não encontrado.`);
      }

      const draft = snap.data() as PersistedEditorialDraftHeader;
      if (draft.planSummary && draft.planSummary.unaccountedSourceBlocks > 0) {
        throw new Error("CANNOT_APPROVE_UNACCOUNTED_BLOCKS: Não é possível aprovar layout com blocos de fonte não atribuídos.");
      }

      const now = new Date().toISOString();
      const updatedPlanSummary = draft.planSummary
        ? { ...draft.planSummary, compositionStatus: "APPROVED_EDITORIAL" as const }
        : undefined;

      transaction.set(
        draftRef,
        {
          status: "APPROVED_EDITORIAL",
          planSummary: updatedPlanSummary,
          updatedAt: now,
        },
        { merge: true }
      );
    });
  }
}
