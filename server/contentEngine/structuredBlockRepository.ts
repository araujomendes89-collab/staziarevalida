import { getAdminDb } from "../firebaseAdmin";
import { SOURCE_DOCUMENTS_COLLECTION } from "./sourceDocumentRepository";
import {
  PersistedStructuredBlock,
  toPersistedStructuredBlock,
} from "./structuredContentPersistence";
import { StructuredSourceBlock } from "../../src/types/medicalTaxonomy";

export const STRUCTURED_BLOCKS_SUBCOLLECTION = "structuredBlocks";

const BATCH_CHUNK_SIZE = 400;

export class StructuredBlockRepository {
  /**
   * Persists a single StructuredSourceBlock to Firestore subcollection.
   */
  static async saveBlock(documentId: string, block: StructuredSourceBlock): Promise<void> {
    const db = getAdminDb();
    const cleanBlock = toPersistedStructuredBlock(documentId, block);
    await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(STRUCTURED_BLOCKS_SUBCOLLECTION)
      .doc(cleanBlock.id)
      .set(cleanBlock);
  }

  /**
   * Persists a batch of StructuredSourceBlocks with deduplication and chunked batches.
   * Throws STRUCTURED_BLOCK_ID_CONFLICT if duplicate IDs have conflicting payload content.
   */
  static async saveBlocks(documentId: string, blocks: StructuredSourceBlock[]): Promise<void> {
    if (!blocks || blocks.length === 0) return;

    // Deduplicate by block.id and verify payload integrity
    const uniqueBlocks = new Map<string, PersistedStructuredBlock>();

    for (const block of blocks) {
      const persisted = toPersistedStructuredBlock(documentId, block);
      const existing = uniqueBlocks.get(persisted.id);
      if (existing) {
        // Compare text and core attributes to ensure they do not conflict
        if (
          existing.originalText !== persisted.originalText ||
          existing.type !== persisted.type ||
          existing.pageNumber !== persisted.pageNumber
        ) {
          throw new Error(
            `STRUCTURED_BLOCK_ID_CONFLICT: Conflito detectado no bloco '${persisted.id}'. Múltiplos blocos com o mesmo ID possuem conteúdos diferentes.`
          );
        }
      } else {
        uniqueBlocks.set(persisted.id, persisted);
      }
    }

    const uniqueBlockList = Array.from(uniqueBlocks.values());
    const db = getAdminDb();

    for (let i = 0; i < uniqueBlockList.length; i += BATCH_CHUNK_SIZE) {
      const chunk = uniqueBlockList.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();

      for (const item of chunk) {
        const docRef = db
          .collection(SOURCE_DOCUMENTS_COLLECTION)
          .doc(documentId)
          .collection(STRUCTURED_BLOCKS_SUBCOLLECTION)
          .doc(item.id);
        batch.set(docRef, item);
      }

      await batch.commit();
    }
  }

  /**
   * Retrieves a single PersistedStructuredBlock by ID.
   */
  static async getBlock(documentId: string, blockId: string): Promise<PersistedStructuredBlock | null> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(STRUCTURED_BLOCKS_SUBCOLLECTION)
      .doc(blockId)
      .get();

    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedStructuredBlock;
  }

  /**
   * Retrieves multiple PersistedStructuredBlocks by IDs efficiently.
   */
  static async getBlocksByIds(
    documentId: string,
    blockIds: string[]
  ): Promise<Map<string, PersistedStructuredBlock>> {
    const results = new Map<string, PersistedStructuredBlock>();
    if (!blockIds || blockIds.length === 0) return results;

    const db = getAdminDb();
    const uniqueIds = Array.from(new Set(blockIds));
    const subcolRef = db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(STRUCTURED_BLOCKS_SUBCOLLECTION);

    // Fetch individual documents in chunks of 50 concurrently
    const CONCURRENCY_CHUNK = 50;
    for (let i = 0; i < uniqueIds.length; i += CONCURRENCY_CHUNK) {
      const chunk = uniqueIds.slice(i, i + CONCURRENCY_CHUNK);
      const promises = chunk.map((id) => subcolRef.doc(id).get());
      const snapshots = await Promise.all(promises);

      for (const snap of snapshots) {
        if (snap.exists) {
          const data = snap.data() as PersistedStructuredBlock;
          results.set(snap.id, data);
        }
      }
    }

    return results;
  }
}
