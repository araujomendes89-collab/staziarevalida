/**
 * Editorial Job Queue & Draft Manager (Etapa 1.28D + Persistência Durável).
 * Handles asynchronous composition jobs, manual block reordering,
 * component type changes, manual page breaks, and editorial approvals with durable Firestore persistence.
 *
 * Firestore = persistent source of truth
 * Map = runtime transient cache only
 */

import {
  EditorialComponentType,
  StaziaEditorialDocumentDraft,
} from "../../src/types/medicalEditorial";
import { StructuredSourceContent } from "../../src/types/medicalTaxonomy";
import { StaziaEditorialCompositionEngine } from "./staziaEditorialCompositionEngine";
import { computeSha256Fingerprint } from "../../src/services/pdfValidationService";
import { EditorialDraftRepository } from "./editorialDraftRepository";
import { EditorialDraftHydrationService } from "./editorialDraftHydrationService";
import { EditorialJobRepository } from "./editorialJobRepository";

export type EditorialJobStatus =
  | "COMPOSITION_QUEUED"
  | "COMPOSING"
  | "LAYOUT_VALIDATING"
  | "DRAFT_READY"
  | "REVIEW_REQUIRED"
  | "FAILED";

export interface EditorialJobState {
  jobId: string;
  structuredContentId: string;
  status: EditorialJobStatus;
  progress: number;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  jobFingerprint: string;
  draft?: StaziaEditorialDocumentDraft;
}

export class EditorialJobManager {
  private static instance: EditorialJobManager;
  // In-Memory RAM Cache (Firestore is the persistent source of truth)
  private jobs: Map<string, EditorialJobState> = new Map();
  private draftsStore: Map<string, StaziaEditorialDocumentDraft> = new Map();
  private engine: StaziaEditorialCompositionEngine;

  private constructor() {
    this.engine = StaziaEditorialCompositionEngine.getInstance();
  }

  public static getInstance(): EditorialJobManager {
    if (!EditorialJobManager.instance) {
      EditorialJobManager.instance = new EditorialJobManager();
    }
    return EditorialJobManager.instance;
  }

  public reset(): void {
    this.jobs.clear();
    this.draftsStore.clear();
  }

  /**
   * Creates and executes a composition job for a StructuredSourceContent item.
   */
  public async createAndRunCompositionJob(
    sourceContent: StructuredSourceContent
  ): Promise<{ job: EditorialJobState; draft: StaziaEditorialDocumentDraft }> {
    const rawContentStr = JSON.stringify({
      id: sourceContent.id,
      topic: sourceContent.topic,
      blocksCount: sourceContent.blocks.length,
      updatedAt: sourceContent.updatedAt,
    });
    const jobFingerprint = await computeSha256Fingerprint(Buffer.from(rawContentStr, "utf-8"));

    // Check for existing completed job in memory or Firestore
    const existing = Array.from(this.jobs.values()).find(
      (j) => j.jobFingerprint === jobFingerprint && j.draft
    );
    if (existing && existing.draft) {
      return { job: existing, draft: existing.draft };
    }

    const existingPersisted = await EditorialJobRepository.findByFingerprint(jobFingerprint);
    if (existingPersisted && existingPersisted.status === "DRAFT_READY" && existingPersisted.draftId) {
      const hydratedDraft = await EditorialDraftHydrationService.hydrateDraft(
        existingPersisted.draftId
      );
      if (hydratedDraft) {
        const job: EditorialJobState = {
          jobId: existingPersisted.jobId,
          structuredContentId: existingPersisted.structuredContentId,
          status: existingPersisted.status,
          progress: existingPersisted.progress,
          startedAt: existingPersisted.startedAt,
          finishedAt: existingPersisted.finishedAt,
          jobFingerprint: existingPersisted.jobFingerprint,
          draft: hydratedDraft,
        };
        this.jobs.set(job.jobId, job);
        this.draftsStore.set(hydratedDraft.id, hydratedDraft);
        return { job, draft: hydratedDraft };
      }
    }

    const jobId = `job_ed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobState: EditorialJobState = {
      jobId,
      structuredContentId: sourceContent.id,
      status: "COMPOSING",
      progress: 30,
      startedAt: new Date().toISOString(),
      jobFingerprint,
    };

    this.jobs.set(jobId, jobState);
    await EditorialJobRepository.saveJob(jobState);

    try {
      const { draft } = await this.engine.composeDocument(sourceContent);

      jobState.progress = 90;
      jobState.status = "LAYOUT_VALIDATING";
      await EditorialJobRepository.updateProgress(jobId, 90, "LAYOUT_VALIDATING");

      // Validate zero loss
      if (
        draft.plan.unaccountedSourceBlocks > 0 ||
        draft.plan.duplicatedSourceBlockAssignments > 0
      ) {
        throw new Error("Falha de auditoria: blocos de fonte não atribuídos ou duplicados.");
      }

      // Persist complete normalized draft to Firestore
      await EditorialDraftRepository.saveDraft(draft);

      jobState.status = "DRAFT_READY";
      jobState.progress = 100;
      jobState.finishedAt = new Date().toISOString();
      jobState.draft = draft;

      await EditorialJobRepository.saveJob(jobState, draft.id);

      this.draftsStore.set(draft.id, draft);
      this.jobs.set(jobId, jobState);

      return { job: jobState, draft };
    } catch (err: any) {
      console.error(`[Editorial Job Failed] ${jobId}:`, err);
      jobState.status = "FAILED";
      jobState.errorMessage = err?.message || "Erro durante a composição editorial.";
      jobState.finishedAt = new Date().toISOString();
      await EditorialJobRepository.saveJob(jobState);
      this.jobs.set(jobId, jobState);
      throw err;
    }
  }

  public async getJob(jobId: string): Promise<EditorialJobState | undefined> {
    const cached = this.jobs.get(jobId);
    if (cached && cached.draft) {
      return cached;
    }

    const persisted = await EditorialJobRepository.getJob(jobId);
    if (!persisted) {
      return undefined;
    }

    let draft: StaziaEditorialDocumentDraft | undefined;
    if (persisted.draftId) {
      const hydrated = await EditorialDraftHydrationService.hydrateDraft(persisted.draftId);
      if (hydrated) {
        draft = hydrated;
      }
    }

    const jobState: EditorialJobState = {
      jobId: persisted.jobId,
      structuredContentId: persisted.structuredContentId,
      status: persisted.status,
      progress: persisted.progress,
      startedAt: persisted.startedAt,
      finishedAt: persisted.finishedAt,
      errorMessage: persisted.errorMessage,
      jobFingerprint: persisted.jobFingerprint,
      draft,
    };

    this.jobs.set(jobId, jobState);
    return jobState;
  }

  public async getDraft(draftId: string): Promise<StaziaEditorialDocumentDraft | undefined> {
    const cached = this.draftsStore.get(draftId);
    if (cached) {
      return cached;
    }

    const hydrated = await EditorialDraftHydrationService.hydrateDraft(draftId);
    if (hydrated) {
      this.draftsStore.set(hydrated.id, hydrated);
      return hydrated;
    }

    return undefined;
  }

  public async getDraftByStructuredContentId(
    contentId: string
  ): Promise<StaziaEditorialDocumentDraft | undefined> {
    const cached = Array.from(this.draftsStore.values()).find(
      (d) => d.structuredSourceContentId === contentId
    );
    if (cached) {
      return cached;
    }

    const hydrated = await EditorialDraftHydrationService.getDraftByStructuredContentId(contentId);
    if (hydrated) {
      this.draftsStore.set(hydrated.id, hydrated);
      return hydrated;
    }

    return undefined;
  }

  /**
   * Reorders blocks within an editorial page.
   */
  public async reorderPageBlocks(
    draftId: string,
    pageIndex: number,
    fromIndex: number,
    toIndex: number
  ): Promise<StaziaEditorialDocumentDraft> {
    await EditorialDraftRepository.reorderPageBlocks(draftId, pageIndex, fromIndex, toIndex);
    const draft = await EditorialDraftHydrationService.hydrateDraft(draftId);
    if (!draft) {
      throw new Error(`Draft '${draftId}' não encontrado após reordenação.`);
    }

    this.draftsStore.set(draftId, draft);
    return draft;
  }

  /**
   * Changes the visual component type of an editorial block.
   */
  public async changeComponentType(
    draftId: string,
    blockId: string,
    newType: EditorialComponentType
  ): Promise<StaziaEditorialDocumentDraft> {
    await EditorialDraftRepository.changeComponentType(draftId, blockId, newType);
    const draft = await EditorialDraftHydrationService.hydrateDraft(draftId);
    if (!draft) {
      throw new Error(`Draft '${draftId}' não encontrado após alteração de tipo.`);
    }

    this.draftsStore.set(draftId, draft);
    return draft;
  }

  /**
   * Inserts a manual page break at a specific block, moving subsequent blocks to a new page.
   */
  public async insertPageBreakAtBlock(
    draftId: string,
    blockId: string
  ): Promise<StaziaEditorialDocumentDraft> {
    await EditorialDraftRepository.insertPageBreakAtBlock(draftId, blockId);
    const draft = await EditorialDraftHydrationService.hydrateDraft(draftId);
    if (!draft) {
      throw new Error(`Draft '${draftId}' não encontrado após quebra de página.`);
    }

    this.draftsStore.set(draftId, draft);
    return draft;
  }

  /**
   * Approves the editorial layout draft.
   */
  public async approveEditorialLayout(draftId: string): Promise<StaziaEditorialDocumentDraft> {
    await EditorialDraftRepository.approveEditorialLayout(draftId);
    const draft = await EditorialDraftHydrationService.hydrateDraft(draftId);
    if (!draft) {
      throw new Error(`Draft '${draftId}' não encontrado após aprovação.`);
    }

    this.draftsStore.set(draftId, draft);
    return draft;
  }
}
