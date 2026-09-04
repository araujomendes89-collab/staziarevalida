/**
 * Segmentation Job Queue & Structured Content Store (Etapa 1.28C).
 * Handles async medical segmentation, canonical topic matching confirmations,
 * segment split/merge actions, and structural approvals without source loss.
 */

import {
  CanonicalMedicalArea,
  MedicalSegmentationResult,
  STAZIAMED_TAXONOMY_VERSION,
  StructuredSourceContent,
} from "../../src/types/medicalTaxonomy";
import { SourceDocument } from "../../src/types/pdfIngestion";
import { MedicalSegmentationEngine } from "./medicalSegmentationEngine";
import { computeSha256Fingerprint } from "../../src/services/pdfValidationService";

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

    try {
      jobState.status = "CLASSIFICATION_PROCESSING";
      jobState.progress = 60;

      const result = await this.engine.segmentDocument(sourceDoc);

      jobState.status = "STRUCTURING";
      jobState.progress = 90;

      // Register generated structured content items
      result.structuredContents.forEach((sc) => {
        this.structuredContentsStore.set(sc.id, sc);
      });

      jobState.status = "REVIEW_REQUIRED";
      jobState.progress = 100;
      jobState.finishedAt = new Date().toISOString();
      jobState.result = result;

      return { job: jobState, result };
    } catch (error: any) {
      console.error(`[Segmentation Job Failed] ${jobId}:`, error);
      jobState.status = "FAILED";
      jobState.errorMessage = error?.message || "Falha na segmentação médica estruturada.";
      jobState.finishedAt = new Date().toISOString();
      throw error;
    }
  }

  public getJob(jobId: string): SegmentationJobState | undefined {
    return this.jobs.get(jobId);
  }

  public getStructuredContentsByDocument(documentId: string): StructuredSourceContent[] {
    return Array.from(this.structuredContentsStore.values()).filter(
      (sc) => sc.sourceDocumentId === documentId
    );
  }

  public getStructuredContentById(id: string): StructuredSourceContent | undefined {
    return this.structuredContentsStore.get(id);
  }

  public confirmCanonicalTopic(contentId: string, canonicalTopicId: string): StructuredSourceContent {
    const item = this.structuredContentsStore.get(contentId);
    if (!item) throw new Error(`Conteúdo estruturado '${contentId}' não encontrado.`);

    item.canonicalTopicId = canonicalTopicId;
    item.updatedAt = new Date().toISOString();
    this.structuredContentsStore.set(contentId, item);
    return item;
  }

  public updateMetadata(
    contentId: string,
    updates: { area?: CanonicalMedicalArea; specialty?: string; topic?: string; subtopics?: string[] }
  ): StructuredSourceContent {
    const item = this.structuredContentsStore.get(contentId);
    if (!item) throw new Error(`Conteúdo estruturado '${contentId}' não encontrado.`);

    if (updates.area) item.area = updates.area;
    if (updates.specialty) item.specialty = updates.specialty;
    if (updates.topic) item.topic = updates.topic;
    if (updates.subtopics) item.subtopics = updates.subtopics;
    item.updatedAt = new Date().toISOString();

    this.structuredContentsStore.set(contentId, item);
    return item;
  }

  public approveStructure(contentId: string): StructuredSourceContent {
    const item = this.structuredContentsStore.get(contentId);
    if (!item) throw new Error(`Conteúdo estruturado '${contentId}' não encontrado.`);

    item.status = "APPROVED_STRUCTURE";
    item.updatedAt = new Date().toISOString();
    this.structuredContentsStore.set(contentId, item);
    return item;
  }

  public splitSegment(contentId: string, splitAtIndex: number): StructuredSourceContent[] {
    const item = this.structuredContentsStore.get(contentId);
    if (!item) throw new Error(`Conteúdo estruturado '${contentId}' não encontrado.`);

    if (splitAtIndex <= 0 || splitAtIndex >= item.blocks.length) {
      throw new Error(`Índice de divisão inválido (${splitAtIndex}).`);
    }

    const blocksPart1 = item.blocks.slice(0, splitAtIndex);
    const blocksPart2 = item.blocks.slice(splitAtIndex);

    const part1Pages = Array.from(new Set(blocksPart1.map((b) => b.pageNumber)));
    const part2Pages = Array.from(new Set(blocksPart2.map((b) => b.pageNumber)));

    const itemPart1: StructuredSourceContent = {
      ...item,
      id: `${item.id}_part1`,
      blocks: blocksPart1,
      sourcePages: part1Pages,
      sourceBlockRefs: blocksPart1.map((b) => b.sourceBlockId),
      totalSourceBlocks: blocksPart1.length,
      assignedSourceBlocks: blocksPart1.length,
      updatedAt: new Date().toISOString(),
    };

    const itemPart2: StructuredSourceContent = {
      ...item,
      id: `${item.id}_part2`,
      topic: `${item.topic} (Parte 2)`,
      blocks: blocksPart2,
      sourcePages: part2Pages,
      sourceBlockRefs: blocksPart2.map((b) => b.sourceBlockId),
      totalSourceBlocks: blocksPart2.length,
      assignedSourceBlocks: blocksPart2.length,
      updatedAt: new Date().toISOString(),
    };

    this.structuredContentsStore.delete(contentId);
    this.structuredContentsStore.set(itemPart1.id, itemPart1);
    this.structuredContentsStore.set(itemPart2.id, itemPart2);

    return [itemPart1, itemPart2];
  }

  public mergeSegments(contentIdA: string, contentIdB: string): StructuredSourceContent {
    const itemA = this.structuredContentsStore.get(contentIdA);
    const itemB = this.structuredContentsStore.get(contentIdB);

    if (!itemA || !itemB) throw new Error("Segmentos para união não encontrados.");

    const mergedBlocks = [...itemA.blocks, ...itemB.blocks].map((b, idx) => ({
      ...b,
      order: idx + 1,
    }));

    const mergedPages = Array.from(new Set([...itemA.sourcePages, ...itemB.sourcePages])).sort((a, b) => a - b);

    const mergedItem: StructuredSourceContent = {
      ...itemA,
      id: `sc_merged_${Date.now()}`,
      subtopics: Array.from(new Set([...itemA.subtopics, ...itemB.subtopics])),
      sourcePages: mergedPages,
      sourceBlockRefs: mergedBlocks.map((b) => b.sourceBlockId),
      blocks: mergedBlocks,
      totalSourceBlocks: mergedBlocks.length,
      assignedSourceBlocks: mergedBlocks.length,
      updatedAt: new Date().toISOString(),
    };

    this.structuredContentsStore.delete(contentIdA);
    this.structuredContentsStore.delete(contentIdB);
    this.structuredContentsStore.set(mergedItem.id, mergedItem);

    return mergedItem;
  }
}
