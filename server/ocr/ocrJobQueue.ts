/**
 * Async OCR Job Queue & State Manager (Etapa 1.28B).
 * Enforces idempotency via ocrJobFingerprint, controlled retry mechanism (max 3 attempts),
 * and automatic source reconciliation upon completion.
 */

import { OcrJobState, OcrJobStatus, OcrPageInput, OcrPageResult, ResolvedSourcePage } from "../../src/types/pdfOcr";
import { SourceDocument } from "../../src/types/pdfIngestion";
import { MistralPdfOcrAdapter } from "./mistralPdfOcrAdapter";
import { reconcilePageSource } from "../../src/services/sourceReconciliationService";
import { computeSha256Fingerprint } from "../../src/services/pdfValidationService";

export class OcrJobManager {
  private static instance: OcrJobManager;
  private jobs: Map<string, OcrJobState> = new Map();
  private fingerprintToJobId: Map<string, string> = new Map();
  private ocrAdapter: MistralPdfOcrAdapter;

  private constructor() {
    this.ocrAdapter = new MistralPdfOcrAdapter();
  }

  public static getInstance(): OcrJobManager {
    if (!OcrJobManager.instance) {
      OcrJobManager.instance = new OcrJobManager();
    }
    return OcrJobManager.instance;
  }

  /**
   * Resets internal state (used in testing)
   */
  public reset(): void {
    this.jobs.clear();
    this.fingerprintToJobId.clear();
  }

  /**
   * Creates or retrieves an idempotent OCR job.
   */
  public async createJob(
    documentId: string,
    targetPages: number[],
    sourceFingerprint: string
  ): Promise<OcrJobState> {
    const rawFingerprint = `${documentId}_${sourceFingerprint}_${targetPages.sort().join(",")}_${this.ocrAdapter.providerVersion}`;
    const ocrJobFingerprint = await computeSha256Fingerprint(new TextEncoder().encode(rawFingerprint));

    // Check Idempotency
    const existingJobId = this.fingerprintToJobId.get(ocrJobFingerprint);
    if (existingJobId) {
      const existingJob = this.jobs.get(existingJobId);
      if (existingJob && existingJob.status !== "OCR_FAILED") {
        return existingJob;
      }
    }

    const jobId = `job_ocr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobState: OcrJobState = {
      jobId,
      documentId,
      status: "OCR_QUEUED",
      progress: 0,
      pagesProcessed: 0,
      totalPages: targetPages.length,
      targetPages,
      startedAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3,
      ocrJobFingerprint,
      provider: this.ocrAdapter.providerName,
    };

    this.jobs.set(jobId, jobState);
    this.fingerprintToJobId.set(ocrJobFingerprint, jobId);

    return jobState;
  }

  /**
   * Executes OCR processing on targeted pages with retries.
   */
  public async processJob(
    jobId: string,
    sourceDoc: SourceDocument,
    pdfBytes: Uint8Array | Buffer
  ): Promise<{ job: OcrJobState; resolvedPages: ResolvedSourcePage[] }> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' não encontrado.`);
    }

    job.status = "OCR_PROCESSING";
    job.attempts++;

    const resolvedPages: ResolvedSourcePage[] = [];
    const extractedPages = sourceDoc.extractedDocument?.pages || [];
    const totalPages = sourceDoc.pageCount || extractedPages.length || 1;

    try {
      for (let i = 0; i < totalPages; i++) {
        const pageNumber = i + 1;
        const isTargeted = job.targetPages.includes(pageNumber);
        const nativePage = extractedPages.find((p) => p.pageNumber === pageNumber);

        if (isTargeted) {
          // Process via OCR Adapter
          const input: OcrPageInput = {
            documentId: sourceDoc.id,
            pageNumber,
            sourceMode: sourceDoc.contentMode,
            nativeText: nativePage?.text,
            pdfBytes,
          };

          const ocrResult = await this.executeWithRetry(input);
          const resolved = reconcilePageSource(sourceDoc.id, pageNumber, nativePage, ocrResult);
          resolvedPages.push(resolved);

          job.pagesProcessed++;
          job.progress = Math.round((job.pagesProcessed / job.totalPages) * 90);
        } else {
          // Native Only Page Reconciliation
          const resolved = reconcilePageSource(sourceDoc.id, pageNumber, nativePage, undefined);
          resolvedPages.push(resolved);
        }
      }

      job.status = "OCR_RECONCILING";
      job.progress = 95;

      // Finalize Status
      job.status = "OCR_COMPLETED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();

      return { job, resolvedPages };
    } catch (error: any) {
      console.error(`[OCR Job Error] ${jobId}:`, error);
      job.status = job.attempts >= job.maxAttempts ? "OCR_FAILED" : "OCR_PARTIAL";
      job.errorMessage = error?.message || "Falha na execução do job de OCR.";
      job.finishedAt = new Date().toISOString();
      throw error;
    }
  }

  private async executeWithRetry(input: OcrPageInput): Promise<OcrPageResult> {
    let lastError: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.ocrAdapter.processPageOcr(input);
      } catch (err: any) {
        lastError = err;
        // Wait exponential backoff for attempt 1, 2
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 50));
        }
      }
    }
    throw lastError || new Error("Falha repetida na extração OCR após 3 tentativas.");
  }

  public getJob(jobId: string): OcrJobState | undefined {
    return this.jobs.get(jobId);
  }
}
