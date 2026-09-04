/**
 * Editorial Export Job Queue & Durable Export Store (Etapa 1.28E & 1.28E.1).
 * Manages asynchronous PDF exports, idempotent fingerprinting,
 * durable export metadata persistence via EditorialPdfExportRepository (Firestore authoritative),
 * stale export detection, and streaming download buffer management.
 */

import fs from "fs/promises";
import path from "path";
import { StaziaEditorialDocumentDraft } from "../../src/types/medicalEditorial";
import {
  EditorialPdfExport,
  EditorialPdfExportRepository,
  RightsReviewStatus,
} from "../../src/types/editorialPdfExport";
import { StaziaPdfExportEngine } from "./staziaPdfExportEngine";
import {
  FirestoreEditorialPdfExportRepository,
  MemoryEditorialPdfExportRepository,
} from "./repositories/firestoreEditorialPdfExportRepository";

export class EditorialExportJobManager {
  private static instance: EditorialExportJobManager;
  private repository: EditorialPdfExportRepository;
  private pdfBuffersStore: Map<string, Buffer> = new Map();
  private engine: StaziaPdfExportEngine;

  private constructor(repository?: EditorialPdfExportRepository) {
    this.engine = StaziaPdfExportEngine.getInstance();
    // Default to Firestore in production, with fallback memory repository when testing/offline
    this.repository =
      repository ||
      (process.env.NODE_ENV === "test" || !process.env.GOOGLE_CLOUD_PROJECT
        ? new MemoryEditorialPdfExportRepository()
        : new FirestoreEditorialPdfExportRepository());
  }

  public static getInstance(repository?: EditorialPdfExportRepository): EditorialExportJobManager {
    if (!EditorialExportJobManager.instance) {
      EditorialExportJobManager.instance = new EditorialExportJobManager(repository);
    } else if (repository) {
      EditorialExportJobManager.instance.setRepository(repository);
    }
    return EditorialExportJobManager.instance;
  }

  public static createIsolatedInstance(
    repository: EditorialPdfExportRepository
  ): EditorialExportJobManager {
    return new EditorialExportJobManager(repository);
  }

  public setRepository(repo: EditorialPdfExportRepository): void {
    this.repository = repo;
  }

  public getRepository(): EditorialPdfExportRepository {
    return this.repository;
  }

  public reset(): void {
    this.pdfBuffersStore.clear();
    if (this.repository instanceof MemoryEditorialPdfExportRepository) {
      this.repository.clear();
    }
  }

  /**
   * Records an explicit administrative rights review decision.
   */
  public async recordRightsDecision(
    draftId: string,
    status: RightsReviewStatus,
    adminUserId: string = "admin-master",
    notes?: string
  ): Promise<void> {
    await this.repository.recordRightsDecision(draftId, status, adminUserId, notes);
  }

  public async getRightsDecision(draftId: string): Promise<RightsReviewStatus> {
    const decision = await this.repository.getRightsDecision(draftId);
    return decision ? decision.status : "NOT_REQUIRED";
  }

  /**
   * Requests or executes an export job for an approved draft.
   */
  public async requestExport(
    draft: StaziaEditorialDocumentDraft,
    adminUserId: string = "admin-master",
    adminNotes?: string
  ): Promise<{ exportRecord: EditorialPdfExport; pdfBuffer: Buffer }> {
    const rightsDecision = await this.repository.getRightsDecision(draft.id);
    const rightsStatus = rightsDecision ? rightsDecision.status : "NOT_REQUIRED";

    // Execute through engine
    const { exportRecord, pdfBuffer } = await this.engine.exportToPdf({
      draft,
      rightsReviewStatus: rightsStatus,
      adminUserId,
      adminNotes: adminNotes || rightsDecision?.notes,
    });

    // Save metadata authoritatively to repository
    await this.repository.createExport(exportRecord);
    this.pdfBuffersStore.set(exportRecord.id, pdfBuffer);

    return { exportRecord, pdfBuffer };
  }

  /**
   * Retrieves an export record by ID, updating stale state dynamically.
   */
  public async getExport(
    exportId: string,
    currentDraft?: StaziaEditorialDocumentDraft
  ): Promise<EditorialPdfExport | null> {
    const rec = await this.repository.getExport(exportId);
    if (!rec) return null;

    // Check if current draft has been modified since export
    if (currentDraft && currentDraft.id === rec.editorialDocumentId) {
      const draftUpdatedAt = currentDraft.updatedAt || currentDraft.createdAt;
      const isStale = new Date(draftUpdatedAt) > new Date(rec.createdAt);
      if (rec.isStale !== isStale) {
        rec.isStale = isStale;
        await this.repository.updateExportStatus(exportId, rec.status, { isStale });
      }
    }

    return rec;
  }

  /**
   * Retrieves binary PDF buffer for authenticated streaming download.
   */
  public async getExportBinary(exportId: string): Promise<Buffer | null> {
    if (this.pdfBuffersStore.has(exportId)) {
      return this.pdfBuffersStore.get(exportId)!;
    }

    const rec = await this.repository.getExport(exportId);
    if (rec && rec.storagePath) {
      try {
        const fullPath = path.resolve(process.cwd(), rec.storagePath);
        const buf = await fs.readFile(fullPath);
        this.pdfBuffersStore.set(exportId, buf);
        return buf;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Lists export history for a specific editorial draft.
   */
  public async listExportsForDraft(
    draftId: string,
    currentDraft?: StaziaEditorialDocumentDraft
  ): Promise<EditorialPdfExport[]> {
    const all = await this.repository.listExportsForDraft(draftId);

    if (currentDraft) {
      const draftUpdatedAt = currentDraft.updatedAt || currentDraft.createdAt;
      for (const rec of all) {
        const isStale = new Date(draftUpdatedAt) > new Date(rec.createdAt);
        if (rec.isStale !== isStale) {
          rec.isStale = isStale;
          await this.repository.updateExportStatus(rec.id, rec.status, { isStale });
        }
      }
    }

    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Marks stale state in repository.
   */
  public async markDraftStale(draftId: string): Promise<void> {
    await this.repository.markStale(draftId);
  }
}
