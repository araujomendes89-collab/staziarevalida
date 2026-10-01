/**
 * Segmentation Job Queue & Structured Content Store (Etapa 1.28C + Persistência Durável).
 * Handles async medical segmentation, canonical topic matching confirmations,
 * segment split/merge actions, and structural approvals with durable Firestore persistence.
 *
 * Firestore = persistent source of truth
 * Map = runtime transient cache only
 */

import {
  CanonicalMedicalArea,
  MedicalSegmentationResult,
  STAZIAMED_TAXONOMY_VERSION,
  StructuredSourceBlock,
  StructuredSourceContent,
} from "../../src/types/medicalTaxonomy";
import { SourceDocument } from "../../src/types/pdfIngestion";
import { MedicalSegmentationEngine } from "./medicalSegmentationEngine";
import { computeSha256Fingerprint } from "../../src/services/pdfValidationService";
import {
  SegmentationJobRepository,
  SegmentationJobResultSummary,
} from "./segmentationJobRepository";
import { StructuredBlockRepository } from "../contentEngine/structuredBlockRepository";
import { StructuredContentRepository } from "../contentEngine/structuredContentRepository";
import { StructuredContentHydrationService } from "../contentEngine/structuredContentHydrationService";
import { toPersistedStructuredContentHeader } from "../contentEngine/structuredContentPersistence";

export type SegmentationJobStatus =
  | "SEGMENTATION_QUEUED"
  | "SEGMENTATION_PROCESSING"
  | "CLASSIFICATION_PROCESSING"
  | "STRUCTURING"
  | "REVIEW_REQUIRED"
  | "FAILED";

export interface SegmentationJobState {
  jobId: string;
  documentId: string;
  status: SegmentationJobStatus;
  progress: number; // 0..100
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  jobFingerprint: string;
  result?: MedicalSegmentationResult;
}

export class SegmentationJobManager {
  private static instance: SegmentationJobManager;
  // In-Memory RAM Cache (Firestore is the persistent source of truth)
  private jobs: Map<string, SegmentationJobState> = new Map();
  private structuredContentsStore: Map<string, StructuredSourceContent> = new Map();
  private engine: MedicalSegmentationEngine;

  private constructor() {
    this.engine = new MedicalSegmentationEngine();
  }

  public static getInstance(): SegmentationJobManager {
    if (!SegmentationJobManager.instance) {
      SegmentationJobManager.instance = new SegmentationJobManager();
    }
    return SegmentationJobManager.instance;
  }

  public reset(): void {
    this.jobs.clear();
    this.structuredContentsStore.clear();
  }

  public async createAndRunJob(
    sourceDoc: SourceDocument
  ): Promise<{ job: SegmentationJobState; result: MedicalSegmentationResult }> {
    const rawFingerprint = `${sourceDoc.id}_${sourceDoc.documentFingerprint}_${STAZIAMED_TAXONOMY_VERSION}`;
    const jobFingerprint = await computeSha256Fingerprint(new TextEncoder().encode(rawFingerprint));

    const jobId = `job_seg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobState: SegmentationJobState = {
      jobId,
      documentId: sourceDoc.id,
      status: "SEGMENTATION_PROCESSING",
      progress: 25,
      startedAt: new Date().toISOString(),
      jobFingerprint,
    };

    this.jobs.set(jobId, jobState);
    await SegmentationJobRepository.saveJob(jobState);

    try {
      jobState.status = "CLASSIFICATION_PROCESSING";
      jobState.progress = 60;
      await SegmentationJobRepository.updateProgress(jobId, 60, "CLASSIFICATION_PROCESSING");

      const result = await this.engine.segmentDocument(sourceDoc);

      jobState.status = "STRUCTURING";
      jobState.progress = 90;
      await SegmentationJobRepository.updateProgress(jobId, 90, "STRUCTURING");

      // 1. Persist unique StructuredSourceBlocks into sourceDocuments/{docId}/structuredBlocks
      const allBlocks: StructuredSourceBlock[] = [];
      for (const sc of result.structuredContents) {
        if (sc.blocks && Array.isArray(sc.blocks)) {
          allBlocks.push(...sc.blocks);
        }
      }
      if (allBlocks.length > 0) {
        await StructuredBlockRepository.saveBlocks(sourceDoc.id, allBlocks);
      }

      // 2. Persist lightweight StructuredSourceContent headers into structuredContents/{contentId}
      const headers = result.structuredContents.map((sc) =>
        toPersistedStructuredContentHeader(sc, jobId)
      );
      await StructuredContentRepository.saveHeaders(headers);

      // 3. Persist DocumentSegments into segmentationJobs/{jobId}/segments/{segmentId}
      if (result.segments && result.segments.length > 0) {
        await SegmentationJobRepository.saveSegments(jobId, result.segments);
      }

      // 4. Persist resultSummary and mark job REVIEW_REQUIRED / 100%
      const resultSummary: SegmentationJobResultSummary = {
        areasFoundSummary: result.areasFoundSummary,
        totalSourceBlocks: result.totalSourceBlocks,
        assignedSourceBlocks: result.assignedSourceBlocks,
        unassignedSourceBlocks: result.unassignedSourceBlocks,
        segmentationDurationMs: result.segmentationDurationMs,
        segmentCount: result.segments.length,
        structuredContentCount: result.structuredContents.length,
      };

      jobState.status = "REVIEW_REQUIRED";
      jobState.progress = 100;
      jobState.finishedAt = new Date().toISOString();
      jobState.result = result;

      await SegmentationJobRepository.saveJob(jobState, resultSummary);

      // Update runtime cache
      result.structuredContents.forEach((sc) => {
        this.structuredContentsStore.set(sc.id, sc);
      });
      this.jobs.set(jobId, jobState);

      return { job: jobState, result };
    } catch (error: any) {
      console.error(`[Segmentation Job Failed] ${jobId}:`, error);
      jobState.status = "FAILED";
      jobState.errorMessage = error?.message || "Falha na segmentação médica estruturada.";
      jobState.finishedAt = new Date().toISOString();
      await SegmentationJobRepository.saveJob(jobState);
      this.jobs.set(jobId, jobState);
      throw error;
    }
  }

  public async getJob(jobId: string): Promise<SegmentationJobState | undefined> {
    const cached = this.jobs.get(jobId);
    if (cached && cached.result) {
      return cached;
    }

    const persistedJob = await SegmentationJobRepository.getJob(jobId);
    if (!persistedJob) {
      return undefined;
    }

    // Reconstruct result from durable segments and structured content
    const segments = await SegmentationJobRepository.listSegments(jobId);
    const structuredContents = await StructuredContentHydrationService.listStructuredContentsByDocument(
      persistedJob.documentId
    );

    const areasFoundSummary = persistedJob.resultSummary?.areasFoundSummary || ({} as any);

    const result: MedicalSegmentationResult = {
      documentId: persistedJob.documentId,
      segments,
      structuredContents,
      areasFoundSummary,
      totalSourceBlocks: persistedJob.resultSummary?.totalSourceBlocks ?? 0,
      assignedSourceBlocks: persistedJob.resultSummary?.assignedSourceBlocks ?? 0,
      unassignedSourceBlocks: persistedJob.resultSummary?.unassignedSourceBlocks ?? 0,
      segmentationDurationMs: persistedJob.resultSummary?.segmentationDurationMs ?? 0,
    };

    const jobState: SegmentationJobState = {
      jobId: persistedJob.jobId,
      documentId: persistedJob.documentId,
      status: persistedJob.status,
      progress: persistedJob.progress,
      startedAt: persistedJob.startedAt,
      finishedAt: persistedJob.finishedAt,
      errorMessage: persistedJob.errorMessage,
      jobFingerprint: persistedJob.jobFingerprint,
      result,
    };

    this.jobs.set(jobId, jobState);
    return jobState;
  }

  public async getStructuredContentsByDocument(documentId: string): Promise<StructuredSourceContent[]> {
    const hydrated = await StructuredContentHydrationService.listStructuredContentsByDocument(documentId);
    if (hydrated.length > 0) {
      hydrated.forEach((sc) => this.structuredContentsStore.set(sc.id, sc));
      return hydrated;
    }

    // Cache fallback
    return Array.from(this.structuredContentsStore.values()).filter(
      (sc) => sc.sourceDocumentId === documentId
    );
  }

  public async getStructuredContentById(id: string): Promise<StructuredSourceContent | undefined> {
    const cached = this.structuredContentsStore.get(id);
    if (cached) {
      return cached;
    }

    const hydrated = await StructuredContentHydrationService.hydrateStructuredContent(id);
    if (hydrated) {
      this.structuredContentsStore.set(hydrated.id, hydrated);
      return hydrated;
    }

    return undefined;
  }

  public async confirmCanonicalTopic(
    contentId: string,
    canonicalTopicId: string
  ): Promise<StructuredSourceContent> {
    await StructuredContentRepository.confirmCanonicalTopic(contentId, canonicalTopicId);
    const item = await StructuredContentHydrationService.hydrateStructuredContent(contentId);
    if (!item) {
      throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentId}' não encontrado.`);
    }

    this.structuredContentsStore.set(contentId, item);
    return item;
  }

  public async updateMetadata(
    contentId: string,
    updates: { area?: CanonicalMedicalArea; specialty?: string; topic?: string; subtopics?: string[] }
  ): Promise<StructuredSourceContent> {
    await StructuredContentRepository.updateMetadata(contentId, updates);
    const item = await StructuredContentHydrationService.hydrateStructuredContent(contentId);
    if (!item) {
      throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentId}' não encontrado.`);
    }

    this.structuredContentsStore.set(contentId, item);
    return item;
  }

  public async approveStructure(contentId: string): Promise<StructuredSourceContent> {
    await StructuredContentRepository.approveStructure(contentId);
    const item = await StructuredContentHydrationService.hydrateStructuredContent(contentId);
    if (!item) {
      throw new Error(`CONTENT_NOT_FOUND: Conteúdo estruturado '${contentId}' não encontrado.`);
    }

    this.structuredContentsStore.set(contentId, item);
    return item;
  }

  public async splitSegment(contentId: string, splitAtIndex: number): Promise<StructuredSourceContent[]> {
    const [part1Header, part2Header] = await StructuredContentRepository.splitContent(
      contentId,
      splitAtIndex
    );

    const part1 = await StructuredContentHydrationService.hydrateStructuredContent(part1Header.id);
    const part2 = await StructuredContentHydrationService.hydrateStructuredContent(part2Header.id);

    if (!part1 || !part2) {
      throw new Error("Falha ao reidratar partes divididas do conteúdo estruturado.");
    }

    this.structuredContentsStore.delete(contentId);
    this.structuredContentsStore.set(part1.id, part1);
    this.structuredContentsStore.set(part2.id, part2);

    return [part1, part2];
  }

  public async mergeSegments(contentIdA: string, contentIdB: string): Promise<StructuredSourceContent> {
    const mergedHeader = await StructuredContentRepository.mergeContents(contentIdA, contentIdB);
    const merged = await StructuredContentHydrationService.hydrateStructuredContent(mergedHeader.id);

    if (!merged) {
      throw new Error("Falha ao reidratar conteúdo estruturado unificado.");
    }

    this.structuredContentsStore.delete(contentIdA);
    this.structuredContentsStore.delete(contentIdB);
    this.structuredContentsStore.set(merged.id, merged);

    return merged;
  }
}
