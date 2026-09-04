/**
 * Firestore Editorial PDF Export Repository (Etapa 1.28E & 1.28E.1).
 * Authoritative backend-only persistence for PDF export metadata,
 * rights decisions, and validation records using Firebase Admin SDK.
 */

import {
  EditorialPdfExport,
  EditorialPdfExportRepository,
  EditorialPdfExportStatus,
  PrintValidationResult,
  RightsReviewStatus,
} from "../../../src/types/editorialPdfExport";
import { getAdminDb } from "../../firebaseAdmin";

export class FirestoreEditorialPdfExportRepository implements EditorialPdfExportRepository {
  private collectionName = "editorialPdfExports";
  private rightsCollectionName = "editorialRightsReviews";

  /**
   * Creates or overwrites an export metadata document in Firestore.
   */
  public async createExport(exportRecord: EditorialPdfExport): Promise<void> {
    const db = getAdminDb();
    const docRef = db.collection(this.collectionName).doc(exportRecord.id);
    await docRef.set({
      ...exportRecord,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Updates export status and optional fields.
   */
  public async updateExportStatus(
    exportId: string,
    status: EditorialPdfExportStatus,
    updates?: Partial<EditorialPdfExport>
  ): Promise<void> {
    const db = getAdminDb();
    const docRef = db.collection(this.collectionName).doc(exportId);
    await docRef.set(
      {
        status,
        ...(updates || {}),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  /**
   * Retrieves an export by ID.
   */
  public async getExport(exportId: string): Promise<EditorialPdfExport | null> {
    const db = getAdminDb();
    const docSnap = await db.collection(this.collectionName).doc(exportId).get();
    if (!docSnap.exists) {
      return null;
    }
    return docSnap.data() as EditorialPdfExport;
  }

  /**
   * Lists all export records for an editorial draft.
   */
  public async listExportsForDraft(draftId: string): Promise<EditorialPdfExport[]> {
    const db = getAdminDb();
    const querySnap = await db
      .collection(this.collectionName)
      .where("editorialDocumentId", "==", draftId)
      .get();

    const results: EditorialPdfExport[] = [];
    querySnap.forEach((doc) => {
      results.push(doc.data() as EditorialPdfExport);
    });

    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Marks all exports for a draft as stale (e.g. after draft modifications).
   */
  public async markStale(draftId: string): Promise<void> {
    const db = getAdminDb();
    const querySnap = await db
      .collection(this.collectionName)
      .where("editorialDocumentId", "==", draftId)
      .get();

    const batch = db.batch();
    querySnap.forEach((doc) => {
      batch.update(doc.ref, {
        isStale: true,
        updatedAt: new Date().toISOString(),
      });
    });

    if (!querySnap.empty) {
      await batch.commit();
    }
  }

  /**
   * Saves post-export validation results.
   */
  public async saveValidationResult(
    exportId: string,
    result: PrintValidationResult
  ): Promise<void> {
    const db = getAdminDb();
    const docRef = db.collection(this.collectionName).doc(exportId);
    await docRef.set(
      {
        validationResult: result,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  /**
   * Records an administrative rights review decision.
   */
  public async recordRightsDecision(
    draftId: string,
    status: RightsReviewStatus,
    reviewerId: string = "admin-master",
    notes?: string
  ): Promise<void> {
    const db = getAdminDb();
    const docRef = db.collection(this.rightsCollectionName).doc(draftId);
    await docRef.set({
      draftId,
      status,
      approvedBy: status === "APPROVED" ? reviewerId : undefined,
      approvedAt: status === "APPROVED" ? new Date().toISOString() : undefined,
      notes,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Retrieves recorded rights decision.
   */
  public async getRightsDecision(
    draftId: string
  ): Promise<{ status: RightsReviewStatus; approvedBy?: string; approvedAt?: string; notes?: string } | null> {
    const db = getAdminDb();
    const docSnap = await db.collection(this.rightsCollectionName).doc(draftId).get();
    if (!docSnap.exists) {
      return null;
    }
    return docSnap.data() as any;
  }
}

/**
 * In-Memory / Isolated Test Repository.
 * Can be shared across test instances or initialized separately to verify multi-instance consistency.
 */
export class MemoryEditorialPdfExportRepository implements EditorialPdfExportRepository {
  private exports: Map<string, EditorialPdfExport>;
  private rightsDecisions: Map<string, { status: RightsReviewStatus; approvedBy?: string; approvedAt?: string; notes?: string }>;

  constructor(
    sharedStore?: {
      exports: Map<string, EditorialPdfExport>;
      rightsDecisions: Map<string, any>;
    }
  ) {
    this.exports = sharedStore ? sharedStore.exports : new Map();
    this.rightsDecisions = sharedStore ? sharedStore.rightsDecisions : new Map();
  }

  public async createExport(exportRecord: EditorialPdfExport): Promise<void> {
    this.exports.set(exportRecord.id, {
      ...exportRecord,
      updatedAt: new Date().toISOString(),
    });
  }

  public async updateExportStatus(
    exportId: string,
    status: EditorialPdfExportStatus,
    updates?: Partial<EditorialPdfExport>
  ): Promise<void> {
    const existing = this.exports.get(exportId);
    if (existing) {
      this.exports.set(exportId, {
        ...existing,
        status,
        ...(updates || {}),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  public async getExport(exportId: string): Promise<EditorialPdfExport | null> {
    const rec = this.exports.get(exportId);
    return rec ? { ...rec } : null;
  }

  public async listExportsForDraft(draftId: string): Promise<EditorialPdfExport[]> {
    const list = Array.from(this.exports.values()).filter(
      (e) => e.editorialDocumentId === draftId
    );
    return list
      .map((e) => ({ ...e }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async markStale(draftId: string): Promise<void> {
    for (const [id, rec] of this.exports.entries()) {
      if (rec.editorialDocumentId === draftId) {
        this.exports.set(id, {
          ...rec,
          isStale: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  public async saveValidationResult(
    exportId: string,
    result: PrintValidationResult
  ): Promise<void> {
    const existing = this.exports.get(exportId);
    if (existing) {
      this.exports.set(exportId, {
        ...existing,
        validationResult: result,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  public async recordRightsDecision(
    draftId: string,
    status: RightsReviewStatus,
    reviewerId: string = "admin-master",
    notes?: string
  ): Promise<void> {
    this.rightsDecisions.set(draftId, {
      status,
      approvedBy: status === "APPROVED" ? reviewerId : undefined,
      approvedAt: status === "APPROVED" ? new Date().toISOString() : undefined,
      notes,
    });
  }

  public async getRightsDecision(
    draftId: string
  ): Promise<{ status: RightsReviewStatus; approvedBy?: string; approvedAt?: string; notes?: string } | null> {
    const decision = this.rightsDecisions.get(draftId);
    return decision ? { ...decision } : null;
  }

  public clear(): void {
    this.exports.clear();
    this.rightsDecisions.clear();
  }
}
