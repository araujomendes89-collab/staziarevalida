/**
 * Durable Firestore-Backed Job Repository for Design Clone Jobs (1.27G.1).
 */

import { getAdminDb } from "../firebaseAdmin";
import { JCodesMoreCloneJob, JCodesMoreJobStatus } from "../../src/types/jcodesmoreWorker";

export interface DesignCloneJobRepository {
  createJob(job: JCodesMoreCloneJob): Promise<JCodesMoreCloneJob>;
  getJob(jobId: string): Promise<JCodesMoreCloneJob | null>;
  updateJobStatus(
    jobId: string,
    status: JCodesMoreJobStatus,
    updates?: Partial<JCodesMoreCloneJob>
  ): Promise<JCodesMoreCloneJob>;
  listJobs(limit?: number): Promise<JCodesMoreCloneJob[]>;
}

export class FirestoreDesignCloneJobRepository implements DesignCloneJobRepository {
  private inMemoryJobs: Map<string, JCodesMoreCloneJob> = new Map();
  private collectionName = "designCloneJobs";

  private getSafeDb(): any | null {
    try {
      return getAdminDb();
    } catch {
      return null;
    }
  }

  async createJob(job: JCodesMoreCloneJob): Promise<JCodesMoreCloneJob> {
    const db = this.getSafeDb();
    if (db) {
      try {
        await db.collection(this.collectionName).doc(job.id).set(job);
      } catch (err) {
        console.warn("[JobRepository] Firestore set failed, falling back to in-memory:", err);
        this.inMemoryJobs.set(job.id, job);
      }
    } else {
      this.inMemoryJobs.set(job.id, job);
    }
    return job;
  }

  async getJob(jobId: string): Promise<JCodesMoreCloneJob | null> {
    const db = this.getSafeDb();
    if (db) {
      try {
        const snap = await db.collection(this.collectionName).doc(jobId).get();
        if (snap.exists) {
          return snap.data() as JCodesMoreCloneJob;
        }
      } catch (err) {
        console.warn("[JobRepository] Firestore get failed, checking in-memory:", err);
      }
    }
    return this.inMemoryJobs.get(jobId) || null;
  }

  async updateJobStatus(
    jobId: string,
    status: JCodesMoreJobStatus,
    updates: Partial<JCodesMoreCloneJob> = {}
  ): Promise<JCodesMoreCloneJob> {
    const existing = await this.getJob(jobId);
    if (!existing) {
      throw new Error(`[JOB_NOT_FOUND] Job com ID "${jobId}" não encontrado.`);
    }

    const updated: JCodesMoreCloneJob = {
      ...existing,
      ...updates,
      status,
    };

    const db = this.getSafeDb();
    if (db) {
      try {
        await db.collection(this.collectionName).doc(jobId).update(updated as any);
      } catch (err) {
        console.warn("[JobRepository] Firestore update failed, writing in-memory:", err);
        this.inMemoryJobs.set(jobId, updated);
      }
    } else {
      this.inMemoryJobs.set(jobId, updated);
    }

    return updated;
  }

  async listJobs(limit: number = 50): Promise<JCodesMoreCloneJob[]> {
    const db = this.getSafeDb();
    if (db) {
      try {
        const querySnap = await db
          .collection(this.collectionName)
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();
        return querySnap.docs.map((d) => d.data() as JCodesMoreCloneJob);
      } catch (err) {
        console.warn("[JobRepository] Firestore list failed, returning in-memory:", err);
      }
    }
    return Array.from(this.inMemoryJobs.values())
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, limit);
  }
}

export const defaultJobRepository = new FirestoreDesignCloneJobRepository();
