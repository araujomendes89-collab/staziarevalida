import { getAdminDb } from "../firebaseAdmin";
import { EditorialJobState, EditorialJobStatus } from "./editorialJobQueue";
import { removeUndefinedDeep } from "../contentEngine/sourcePagePersistence";

export const EDITORIAL_JOBS_COLLECTION = "editorialJobs";

export interface PersistedEditorialJob {
  jobId: string;
  structuredContentId: string;
  draftId?: string;
  status: EditorialJobStatus;
  progress: number;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  jobFingerprint: string;
  updatedAt: string;
}

export class EditorialJobRepository {
  /**
   * Persists or updates the lightweight EditorialJob state in Firestore.
   */
  static async saveJob(jobState: EditorialJobState, draftId?: string): Promise<void> {
    const db = getAdminDb();
    const persisted: PersistedEditorialJob = {
      jobId: jobState.jobId,
      structuredContentId: jobState.structuredContentId,
      status: jobState.status,
      progress: jobState.progress,
      startedAt: jobState.startedAt,
      jobFingerprint: jobState.jobFingerprint,
      updatedAt: new Date().toISOString(),
    };

    if (draftId || jobState.draft?.id) {
      persisted.draftId = draftId || jobState.draft?.id;
    }
    if (jobState.finishedAt) persisted.finishedAt = jobState.finishedAt;
    if (jobState.errorMessage) persisted.errorMessage = jobState.errorMessage;

    const clean = removeUndefinedDeep(persisted);
    await db.collection(EDITORIAL_JOBS_COLLECTION).doc(jobState.jobId).set(clean, { merge: true });
  }

  /**
   * Retrieves lightweight job metadata by ID.
   */
  static async getJob(jobId: string): Promise<PersistedEditorialJob | null> {
    const db = getAdminDb();
    const snapshot = await db.collection(EDITORIAL_JOBS_COLLECTION).doc(jobId).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedEditorialJob;
  }

  /**
   * Finds an existing job by its SHA-256 fingerprint.
   */
  static async findByFingerprint(fingerprint: string): Promise<PersistedEditorialJob | null> {
    const db = getAdminDb();
    const query = db
      .collection(EDITORIAL_JOBS_COLLECTION)
      .where("jobFingerprint", "==", fingerprint);

    const snapshot = await (typeof (query as any).limit === "function"
      ? (query as any).limit(1).get()
      : query.get());

    if (!snapshot || snapshot.empty || !snapshot.docs || snapshot.docs.length === 0) return null;
    return snapshot.docs[0].data() as PersistedEditorialJob;
  }

  /**
   * Updates job status and progress.
   */
  static async updateProgress(
    jobId: string,
    progress: number,
    status: EditorialJobStatus
  ): Promise<void> {
    const db = getAdminDb();
    await db
      .collection(EDITORIAL_JOBS_COLLECTION)
      .doc(jobId)
      .set(
        {
          progress,
          status,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }
}
