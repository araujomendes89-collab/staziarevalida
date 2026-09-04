/**
 * Editorial Job Queue & Draft Manager (Etapa 1.28D).
 * Handles asynchronous composition jobs, manual block reordering,
 * component type changes, manual page breaks, and editorial approvals.
 */

import {
  EditorialComponentType,
  EditorialPagePlan,
  StaziaEditorialDocumentDraft,
} from "../../src/types/medicalEditorial";
import { StructuredSourceContent } from "../../src/types/medicalTaxonomy";
import { StaziaEditorialCompositionEngine } from "./staziaEditorialCompositionEngine";
import { computeSha256Fingerprint } from "../../src/services/pdfValidationService";

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
    const jobFingerprint = computeSha256Fingerprint(Buffer.from(rawContentStr, "utf-8"));

    // Check for existing completed job
    const existing = Array.from(this.jobs.values()).find(
      (j) => j.jobFingerprint === jobFingerprint && j.draft
    );
    if (existing && existing.draft) {
      return { job: existing, draft: existing.draft };
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

    try {
      const { draft } = await this.engine.composeDocument(sourceContent);

      jobState.progress = 90;
      jobState.status = "LAYOUT_VALIDATING";

      // Validate zero loss
      if (draft.plan.unaccountedSourceBlocks > 0 || draft.plan.duplicatedSourceBlockAssignments > 0) {
        throw new Error("Falha de auditoria: blocos de fonte não atribuídos ou duplicados.");
      }

      jobState.status = "DRAFT_READY";
      jobState.progress = 100;
      jobState.finishedAt = new Date().toISOString();
      jobState.draft = draft;

      this.draftsStore.set(draft.id, draft);
      return { job: jobState, draft };
    } catch (err: any) {
      jobState.status = "FAILED";
      jobState.errorMessage = err?.message || "Erro durante a composição editorial.";
      jobState.finishedAt = new Date().toISOString();
      throw err;
    }
  }

  public getJob(jobId: string): EditorialJobState | undefined {
    return this.jobs.get(jobId);
  }

  public getDraft(draftId: string): StaziaEditorialDocumentDraft | undefined {
    return this.draftsStore.get(draftId);
  }

  public getDraftByStructuredContentId(contentId: string): StaziaEditorialDocumentDraft | undefined {
    return Array.from(this.draftsStore.values()).find(
      (d) => d.structuredSourceContentId === contentId
    );
  }

  /**
   * Reorders blocks within an editorial page.
   */
  public reorderPageBlocks(
    draftId: string,
    pageIndex: number,
    fromIndex: number,
    toIndex: number
  ): StaziaEditorialDocumentDraft {
    const draft = this.draftsStore.get(draftId);
    if (!draft) throw new Error(`Draft '${draftId}' não encontrado.`);

    const targetPage = draft.pages.find((p) => p.pageIndex === pageIndex);
    if (!targetPage) throw new Error(`Página '${pageIndex}' não encontrada no draft.`);

    if (fromIndex < 0 || fromIndex >= targetPage.blocks.length || toIndex < 0 || toIndex >= targetPage.blocks.length) {
      throw new Error("Índices de reordenação inválidos.");
    }

    const [moved] = targetPage.blocks.splice(fromIndex, 1);
    targetPage.blocks.splice(toIndex, 0, moved);

    // Update editorial orders
    targetPage.blocks.forEach((b, idx) => {
      b.editorialOrder = idx + 1;
    });

    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  /**
   * Changes the visual component type of an editorial block (e.g. Paragraph -> StickyNoteCard).
   */
  public changeComponentType(
    draftId: string,
    blockId: string,
    newType: EditorialComponentType
  ): StaziaEditorialDocumentDraft {
    const draft = this.draftsStore.get(draftId);
    if (!draft) throw new Error(`Draft '${draftId}' não encontrado.`);

    let targetBlock = null;
    for (const page of draft.pages) {
      const found = page.blocks.find((b) => b.id === blockId);
      if (found) {
        targetBlock = found;
        break;
      }
    }

    if (!targetBlock) throw new Error(`Bloco '${blockId}' não encontrado.`);

    targetBlock.type = newType;
    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  /**
   * Inserts a manual page break at a specific block, moving subsequent blocks to a new page.
   */
  public insertPageBreakAtBlock(
    draftId: string,
    blockId: string
  ): StaziaEditorialDocumentDraft {
    const draft = this.draftsStore.get(draftId);
    if (!draft) throw new Error(`Draft '${draftId}' não encontrado.`);

    let targetPageIndex = -1;
    let targetBlockIndex = -1;

    for (let pIdx = 0; pIdx < draft.pages.length; pIdx++) {
      const bIdx = draft.pages[pIdx].blocks.findIndex((b) => b.id === blockId);
      if (bIdx !== -1) {
        targetPageIndex = pIdx;
        targetBlockIndex = bIdx;
        break;
      }
    }

    if (targetPageIndex === -1 || targetBlockIndex === -1) {
      throw new Error(`Bloco '${blockId}' não encontrado para quebra de página.`);
    }

    const curPage = draft.pages[targetPageIndex];
    const remainingBlocks = curPage.blocks.splice(targetBlockIndex);

    curPage.sourceBlockRefs = curPage.blocks.flatMap((b) => b.sourceBlockRefs);

    const newPage: EditorialPagePlan = {
      pageIndex: targetPageIndex + 2,
      pageRole: "CORE_CONTENT",
      blocks: remainingBlocks,
      sourceBlockRefs: remainingBlocks.flatMap((b) => b.sourceBlockRefs),
      estimatedDensity: "BALANCED",
      densityScore: 5.0,
      pageBreakReason: "Quebra manual inserida pelo Administrador",
    };

    // Insert new page and shift subsequent page numbers
    draft.pages.splice(targetPageIndex + 1, 0, newPage);
    for (let i = targetPageIndex + 1; i < draft.pages.length; i++) {
      draft.pages[i].pageIndex = i + 1;
    }

    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  /**
   * Approves the editorial layout draft.
   */
  public approveEditorialLayout(draftId: string): StaziaEditorialDocumentDraft {
    const draft = this.draftsStore.get(draftId);
    if (!draft) throw new Error(`Draft '${draftId}' não encontrado.`);

    if (draft.plan.unaccountedSourceBlocks > 0) {
      throw new Error("Não é possível aprovar layout com blocos de fonte não atribuídos.");
    }

    draft.status = "APPROVED_EDITORIAL";
    draft.plan.compositionStatus = "APPROVED_EDITORIAL";
    draft.updatedAt = new Date().toISOString();
    return draft;
  }
}
