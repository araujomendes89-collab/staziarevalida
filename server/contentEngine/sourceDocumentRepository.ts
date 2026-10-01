import { getAdminDb } from "../firebaseAdmin";
import {
  PersistedSourceDocumentMetadata,
  toPersistedSourceDocumentMetadata,
} from "./sourceDocumentPersistence";

export const SOURCE_DOCUMENTS_COLLECTION = "sourceDocuments";

export class SourceDocumentRepository {
  /**
   * Persists new or full SourceDocument metadata to Firestore.
   */
  static async save(metadata: PersistedSourceDocumentMetadata): Promise<void> {
    const db = getAdminDb();
    const cleanDoc = toPersistedSourceDocumentMetadata(metadata);
    await db.collection(SOURCE_DOCUMENTS_COLLECTION).doc(cleanDoc.id).set(cleanDoc);
  }

  /**
   * Updates partial metadata for an existing SourceDocument.
   */
  static async update(
    documentId: string,
    partial: Partial<PersistedSourceDocumentMetadata>
  ): Promise<void> {
    const db = getAdminDb();
    const cleanDoc: Record<string, any> = {};

    for (const [key, value] of Object.entries(partial)) {
      if (
        value !== undefined &&
        key !== "extractedDocument" &&
        key !== "resolvedPages" &&
        key !== "structuredContents" &&
        key !== "segmentationResult"
      ) {
        cleanDoc[key] = value;
      }
    }

    cleanDoc.updatedAt = cleanDoc.updatedAt || new Date().toISOString();
    await db.collection(SOURCE_DOCUMENTS_COLLECTION).doc(documentId).set(cleanDoc, { merge: true });
  }

  /**
   * Retrieves persistent metadata by ID.
   */
  static async getById(documentId: string): Promise<PersistedSourceDocumentMetadata | null> {
    const db = getAdminDb();
    const snapshot = await db.collection(SOURCE_DOCUMENTS_COLLECTION).doc(documentId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as PersistedSourceDocumentMetadata;
  }

  /**
   * Finds an existing document by its SHA-256 fingerprint.
   */
  static async findByFingerprint(fingerprint: string): Promise<PersistedSourceDocumentMetadata | null> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .where("documentFingerprint", "==", fingerprint)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as PersistedSourceDocumentMetadata;
  }

  /**
   * Lists all persisted SourceDocuments.
   */
  static async list(): Promise<PersistedSourceDocumentMetadata[]> {
    const db = getAdminDb();
    const snapshot = await db.collection(SOURCE_DOCUMENTS_COLLECTION).get();
    const docs = snapshot.docs.map((doc) => doc.data() as PersistedSourceDocumentMetadata);
    // Sort in-memory by createdAt descending
    return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
