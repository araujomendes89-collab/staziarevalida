import { getAdminDb } from "../firebaseAdmin";
import {
  PersistedStructuredContentHeader,
  StructuredBlockRef,
} from "./structuredContentPersistence";
import { CanonicalMedicalArea } from "../../src/types/medicalTaxonomy";

export const STRUCTURED_CONTENTS_COLLECTION = "structuredContents";

const BATCH_CHUNK_SIZE = 400;

export class StructuredContentRepository {
  /**
   * Persists a single StructuredSourceContent header.
   */
  static async saveHeader(header: PersistedStructuredContentHeader): Promise<void> {
    const db = getAdminDb();
    await db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(header.id).set(header);
  }

  /**
   * Persists a batch of StructuredSourceContent headers in safe chunks.
   */
  static async saveHeaders(headers: PersistedStructuredContentHeader[]): Promise<void> {
    if (!headers || headers.length === 0) return;
    const db = getAdminDb();

    for (let i = 0; i < headers.length; i += BATCH_CHUNK_SIZE) {
      const chunk = headers.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();

      for (const item of chunk) {
        const docRef = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(item.id);
        batch.set(docRef, item);
      }

      await batch.commit();
    }
  }

  /**
   * Retrieves a single header by contentId.
   */
  static async getHeader(contentId: string): Promise<PersistedStructuredContentHeader | null> {
    const db = getAdminDb();
    const snapshot = await db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentId).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedStructuredContentHeader;
  }

  /**
   * Lists all headers associated with a specific SourceDocument.
   */
  static async listHeadersByDocument(documentId: string): Promise<PersistedStructuredContentHeader[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(STRUCTURED_CONTENTS_COLLECTION)
      .where("sourceDocumentId", "==", documentId)
      .get();

    return snapshot.docs.map((doc) => doc.data() as PersistedStructuredContentHeader);
  }

  /**
   * Deletes a single header.
   */
  static async deleteHeader(contentId: string): Promise<void> {
    const db = getAdminDb();
    await db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentId).delete();
  }

  /**
   * Atomically confirms canonical topic assignment in Firestore.
   */
  static async confirmCanonicalTopic(
    contentId: string,
    canonicalTopicId: string
  ): Promise<PersistedStructuredContentHeader> {
    const db = getAdminDb();
    const docRef = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentId);

    return await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentId}' não encontrado.`);
      }

      const current = snap.data() as PersistedStructuredContentHeader;
      const updated: PersistedStructuredContentHeader = {
        ...current,
        canonicalTopicId: canonicalTopicId.trim(),
        updatedAt: new Date().toISOString(),
      };

      transaction.set(docRef, updated);
      return updated;
    });
  }

  /**
   * Atomically updates metadata in Firestore.
   */
  static async updateMetadata(
    contentId: string,
    updates: {
      area?: CanonicalMedicalArea;
      specialty?: string;
      topic?: string;
      subtopics?: string[];
    }
  ): Promise<PersistedStructuredContentHeader> {
    const db = getAdminDb();
    const docRef = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentId);

    return await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentId}' não encontrado.`);
      }

      const current = snap.data() as PersistedStructuredContentHeader;
      const updated: PersistedStructuredContentHeader = {
        ...current,
        area: updates.area || current.area,
        specialty: updates.specialty !== undefined ? updates.specialty : current.specialty,
        topic: updates.topic ? updates.topic.trim() : current.topic,
        subtopics: updates.subtopics ? updates.subtopics : current.subtopics,
        updatedAt: new Date().toISOString(),
      };

      transaction.set(docRef, updated);
      return updated;
    });
  }

  /**
   * Atomically approves content structure in Firestore.
   */
  static async approveStructure(contentId: string): Promise<PersistedStructuredContentHeader> {
    const db = getAdminDb();
    const docRef = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentId);

    return await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentId}' não encontrado.`);
      }

      const current = snap.data() as PersistedStructuredContentHeader;
      const updated: PersistedStructuredContentHeader = {
        ...current,
        status: "APPROVED_STRUCTURE",
        updatedAt: new Date().toISOString(),
      };

      transaction.set(docRef, updated);
      return updated;
    });
  }

  /**
   * Atomically splits a content header into two parts without duplicating structured blocks.
   */
  static async splitContent(
    contentId: string,
    splitAtIndex: number
  ): Promise<[PersistedStructuredContentHeader, PersistedStructuredContentHeader]> {
    if (splitAtIndex <= 0) {
      throw new Error(`INVALID_SPLIT_INDEX: Índice de divisão (${splitAtIndex}) deve ser maior que zero.`);
    }

    const db = getAdminDb();
    const originalRef = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentId);
    const part1Id = `${contentId}_part1`;
    const part2Id = `${contentId}_part2`;
    const part1Ref = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(part1Id);
    const part2Ref = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(part2Id);

    return await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(originalRef);
      if (!snap.exists) {
        throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentId}' não encontrado.`);
      }

      const original = snap.data() as PersistedStructuredContentHeader;
      const blockRefs = original.blockRefs || [];

      if (splitAtIndex >= blockRefs.length) {
        throw new Error(
          `INVALID_SPLIT_INDEX: Índice de divisão (${splitAtIndex}) deve ser menor que a quantidade total de blocos (${blockRefs.length}).`
        );
      }

      const part1BlockRefs = blockRefs.slice(0, splitAtIndex);
      const part2BlockRefs = blockRefs.slice(splitAtIndex);

      const part1Pages = Array.from(new Set(part1BlockRefs.map((b) => b.pageNumber))).sort((a, b) => a - b);
      const part2Pages = Array.from(new Set(part2BlockRefs.map((b) => b.pageNumber))).sort((a, b) => a - b);

      const now = new Date().toISOString();

      const part1Header: PersistedStructuredContentHeader = {
        ...original,
        id: part1Id,
        blockRefs: part1BlockRefs,
        sourcePages: part1Pages,
        sourceBlockRefs: part1BlockRefs.map((b) => b.sourceBlockId),
        totalSourceBlocks: part1BlockRefs.length,
        assignedSourceBlocks: part1BlockRefs.length,
        updatedAt: now,
      };

      const part2Header: PersistedStructuredContentHeader = {
        ...original,
        id: part2Id,
        topic: `${original.topic} (Parte 2)`,
        blockRefs: part2BlockRefs,
        sourcePages: part2Pages,
        sourceBlockRefs: part2BlockRefs.map((b) => b.sourceBlockId),
        totalSourceBlocks: part2BlockRefs.length,
        assignedSourceBlocks: part2BlockRefs.length,
        updatedAt: now,
      };

      transaction.set(part1Ref, part1Header);
      transaction.set(part2Ref, part2Header);
      transaction.delete(originalRef);

      return [part1Header, part2Header];
    });
  }

  /**
   * Atomically merges two content headers without duplicating structured blocks.
   */
  static async mergeContents(
    contentIdA: string,
    contentIdB: string,
    generatedMergedId?: string
  ): Promise<PersistedStructuredContentHeader> {
    const db = getAdminDb();
    const mergedId =
      generatedMergedId ||
      `sc_merged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const refA = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentIdA);
    const refB = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(contentIdB);
    const mergedRef = db.collection(STRUCTURED_CONTENTS_COLLECTION).doc(mergedId);

    return await db.runTransaction(async (transaction: any) => {
      const snapA = await transaction.get(refA);
      const snapB = await transaction.get(refB);

      if (!snapA.exists) {
        throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentIdA}' não encontrado.`);
      }
      if (!snapB.exists) {
        throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentIdB}' não encontrado.`);
      }

      const itemA = snapA.data() as PersistedStructuredContentHeader;
      const itemB = snapB.data() as PersistedStructuredContentHeader;

      if (itemA.sourceDocumentId !== itemB.sourceDocumentId) {
        throw new Error(
          `CROSS_DOCUMENT_MERGE_FORBIDDEN: Não é permitido unificar conteúdos estruturados de documentos de origem distintos ('${itemA.sourceDocumentId}' vs '${itemB.sourceDocumentId}').`
        );
      }

      const mergedBlockRefs: StructuredBlockRef[] = [
        ...(itemA.blockRefs || []),
        ...(itemB.blockRefs || []),
      ];

      const mergedPages = Array.from(
        new Set([...(itemA.sourcePages || []), ...(itemB.sourcePages || [])])
      ).sort((a, b) => a - b);

      const mergedSubtopics = Array.from(
        new Set([...(itemA.subtopics || []), ...(itemB.subtopics || [])])
      );

      const now = new Date().toISOString();

      const mergedHeader: PersistedStructuredContentHeader = {
        ...itemA,
        id: mergedId,
        blockRefs: mergedBlockRefs,
        subtopics: mergedSubtopics,
        sourcePages: mergedPages,
        sourceBlockRefs: mergedBlockRefs.map((b) => b.sourceBlockId),
        totalSourceBlocks: mergedBlockRefs.length,
        assignedSourceBlocks: mergedBlockRefs.length,
        updatedAt: now,
      };

      transaction.set(mergedRef, mergedHeader);
      transaction.delete(refA);
      transaction.delete(refB);

      return mergedHeader;
    });
  }
}
