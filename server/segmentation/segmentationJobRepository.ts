import { getAdminDb } from "../firebaseAdmin";
import {
  CanonicalMedicalArea,
  DocumentSegment,
} from "../../src/types/medicalTaxonomy";
import {
  SegmentationJobState,
  SegmentationJobStatus,
} from "./segmentationJobQueue";
import { removeUndefinedDeep } from "../contentEngine/sourcePagePersistence";

export const SEGMENTATION_JOBS_COLLECTION = "segmentationJobs";
export const SEGMENTS_SUBCOLLECTION = "segments";

const BATCH_CHUNK_SIZE = 400;

export interface SegmentationJobResultSummary {
  areasFoundSummary: Record<CanonicalMedicalArea, number>;
  totalSourceBlocks: number;
  assignedSourceBlocks: number;
  unassignedSourceBlocks: number;
  segmentationDurationMs: number;
  segmentCount: number;
  structuredContentCount: number;
}

export interface PersistedSegmentationJob {
  jobId: string;
  documentId: string;
  status: SegmentationJobStatus;
  progress: number;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  jobFingerprint: string;
  resultSummary?: SegmentationJobResultSummary;
  updatedAt?: string;
}

export class SegmentationJobRepository {
  /**
   * Persists or updates the lightweight SegmentationJob state to Firestore.
   * Deliberately excludes embedding the full MedicalSegmentationResult.
   */
  static async saveJob(
    jobState: SegmentationJobState,
    resultSummary?: SegmentationJobResultSummary
  ): Promise<void> {
    const db = getAdminDb();
    const persisted: PersistedSegmentationJob = {
      jobId: jobState.jobId,
      documentId: jobState.documentId,
      status: jobState.status,
      progress: jobState.progress,
      startedAt: jobState.startedAt,
      jobFingerprint: jobState.jobFingerprint,
      updatedAt: new Date().toISOString(),
    };

    if (jobState.finishedAt) persisted.finishedAt = jobState.finishedAt;
    if (jobState.errorMessage) persisted.errorMessage = jobState.errorMessage;
    if (resultSummary) persisted.resultSummary = resultSummary;

    const clean = removeUndefinedDeep(persisted);
    await db.collection(SEGMENTATION_JOBS_COLLECTION).doc(jobState.jobId).set(clean, { merge: true });
  }

  /**
   * Retrieves lightweight job metadata from Firestore.
   */
  static async getJob(jobId: string): Promise<PersistedSegmentationJob | null> {
    const db = getAdminDb();
    const snapshot = await db.collection(SEGMENTATION_JOBS_COLLECTION).doc(jobId).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedSegmentationJob;
  }

  /**
   * Updates job status and progress.
   */
  static async updateProgress(
    jobId: string,
    progress: number,
    status: SegmentationJobStatus
  ): Promise<void> {
    const db = getAdminDb();
    await db
      .collection(SEGMENTATION_JOBS_COLLECTION)
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

  /**
   * Persists DocumentSegments in the subcollection `segmentationJobs/{jobId}/segments/{segmentId}`.
   */
  static async saveSegments(jobId: string, segments: DocumentSegment[]): Promise<void> {
    if (!segments || segments.length === 0) return;
    const db = getAdminDb();

    for (let i = 0; i < segments.length; i += BATCH_CHUNK_SIZE) {
      const chunk = segments.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();

      for (const seg of chunk) {
        const cleanSeg = removeUndefinedDeep(seg);
        const docRef = db
          .collection(SEGMENTATION_JOBS_COLLECTION)
          .doc(jobId)
          .collection(SEGMENTS_SUBCOLLECTION)
          .doc(seg.id);
        batch.set(docRef, cleanSeg);
      }

      await batch.commit();
    }
  }

  /**
   * Lists all DocumentSegments belonging to a specific SegmentationJob.
   */
  static async listSegments(jobId: string): Promise<DocumentSegment[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(SEGMENTATION_JOBS_COLLECTION)
      .doc(jobId)
      .collection(SEGMENTS_SUBCOLLECTION)
      .get();

    return snapshot.docs.map((doc) => doc.data() as DocumentSegment);
  }
}
