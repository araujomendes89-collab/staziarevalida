import { Router, Request, Response } from "express";
import {
  authenticateFirebaseRequest,
  requireServerRole,
} from "../auth/authMiddleware";
import {
  SourceDocument,
  SourceDocumentType,
  ContentReferenceRightsType,
  ExtractedPdfDocument,
} from "../../src/types/pdfIngestion";
import { ManualReviewAction, ResolvedSourcePage, SourceCompletenessStatus } from "../../src/types/pdfOcr";
import { validatePdfBytes } from "../../src/services/pdfValidationService";
import { StaziaNativePdfExtractor } from "../../src/services/pdfExtractionService";
import { PDF_CONTENT_ENGINE_LIMITS } from "../../src/config/pdfContentEngineLimits";
import { OcrJobManager } from "../ocr/ocrJobQueue";

export const adminPdfIngestionRouter = Router();

// Enforce Firebase Auth + Server-Side UserProfile ADMIN role check
adminPdfIngestionRouter.use(authenticateFirebaseRequest);
adminPdfIngestionRouter.use(requireServerRole("ADMIN"));

// In-Memory Storage Registry for Ingested Source Documents (Server State)
const ingestedSourceDocumentsStore: Map<string, SourceDocument> = new Map();
// Cache of binary buffers for OCR processing
const documentBinaryStore: Map<string, Buffer> = new Map();

/**
 * Helper to reset or seed store (used in testing)
 */
export function resetSourceDocumentsStore(): void {
  ingestedSourceDocumentsStore.clear();
  documentBinaryStore.clear();
  OcrJobManager.getInstance().reset();
  try {
    const { SegmentationJobManager } = require("../segmentation/segmentationJobQueue");
    SegmentationJobManager.getInstance().reset();
  } catch {}
  try {
    const { EditorialJobManager } = require("../editorial/editorialJobQueue");
    EditorialJobManager.getInstance().reset();
  } catch {}
  try {
    const { EditorialExportJobManager } = require("../editorial/editorialExportJobQueue");
    EditorialExportJobManager.getInstance().reset();
  } catch {}
}

/**
 * Helper to add document to store directly (used in testing/persistence)
 */
export function registerSourceDocumentInStore(doc: SourceDocument, rawBuffer?: Buffer): void {
  ingestedSourceDocumentsStore.set(doc.id, doc);
  if (rawBuffer) {
    documentBinaryStore.set(doc.id, rawBuffer);
  }
}

/**
 * POST /api/admin/content/pdf-ingest
 * Ingests a new PDF source document, validates integrity and signature,
 * stores private reference, and performs verbatim source extraction.
 */
adminPdfIngestionRouter.post("/pdf-ingest", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      fileName = "document.pdf",
      base64Pdf,
      sourceType = "DIRETRIZ",
      rightsType = "PUBLIC_REFERENCE_ONLY",
      sourceYear,
      institution,
    } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_TITLE",
          message: "O título do documento é obrigatório.",
        },
      });
      return;
    }

    if (!base64Pdf || typeof base64Pdf !== "string") {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PDF_DATA",
          message: "Os dados binários do PDF (base64) são obrigatórios.",
        },
      });
      return;
    }

    // Decode base64 to buffer
    const pdfBuffer = Buffer.from(base64Pdf, "base64");

    // 1. Validate PDF
    const validation = await validatePdfBytes(pdfBuffer);
    if (!validation.valid) {
      res.status(422).json({
        success: false,
        error: {
          code: validation.errorCode || "INVALID_PDF",
          message: validation.errorMessage || "Falha na validação estrutural do PDF.",
        },
      });
      return;
    }

    // 2. Check for duplicate SHA-256 fingerprint
    let duplicateOfDocumentId: string | undefined;
    for (const existingDoc of ingestedSourceDocumentsStore.values()) {
      if (existingDoc.documentFingerprint === validation.fingerprint) {
        duplicateOfDocumentId = existingDoc.id;
        break;
      }
    }

    const documentId = `src_doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const storagePath = `${PDF_CONTENT_ENGINE_LIMITS.STORAGE_BASE_PATH}/${documentId}/source.pdf`;
    const createdBy = req.principal?.uid || "admin-system";
    const now = new Date().toISOString();

    const initialSourceDoc: SourceDocument = {
      id: documentId,
      title: title.trim(),
      fileName: fileName.trim(),
      mimeType: "application/pdf",
      sizeBytes: validation.sizeBytes,
      pageCount: validation.estimatedPageCount || 1,
      documentFingerprint: validation.fingerprint,
      sourceType: sourceType as SourceDocumentType,
      rightsType: rightsType as ContentReferenceRightsType,
      sourceYear: sourceYear ? Number(sourceYear) : undefined,
      institution: institution ? String(institution).trim() : undefined,
      contentMode: "TEXT_PDF",
      status: "EXTRACTING",
      storagePath,
      createdBy,
      createdAt: now,
      updatedAt: now,
      duplicateOfDocumentId,
    };

    // 3. Perform Verbatim Native Extraction
    const extractor = new StaziaNativePdfExtractor();
    const extractedDocument: ExtractedPdfDocument = await extractor.extract(initialSourceDoc, pdfBuffer);

    // 4. Finalize Document Status and Store
    const finalStatus = extractedDocument.pagesRequiringOcr > 0 ? "OCR_REQUIRED" : "EXTRACTED";
    const finalizedDoc: SourceDocument = {
      ...initialSourceDoc,
      pageCount: extractedDocument.pageCount,
      contentMode: extractedDocument.contentMode,
      status: finalStatus,
      updatedAt: new Date().toISOString(),
      extractedDocument,
    };

    ingestedSourceDocumentsStore.set(documentId, finalizedDoc);
    documentBinaryStore.set(documentId, pdfBuffer);

    res.status(201).json({
      success: true,
      sourceDocument: finalizedDoc,
      extractedDocument,
      isDuplicate: Boolean(duplicateOfDocumentId),
      duplicateOfDocumentId,
    });
  } catch (error: any) {
    console.error("[AdminPdfIngestion Error]:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INGESTION_INTERNAL_ERROR",
        message: error?.message || "Erro interno durante a ingestão do PDF.",
      },
    });
  }
});

/**
 * GET /api/admin/content/source-documents
 * Lists all registered source documents.
 */
adminPdfIngestionRouter.get("/source-documents", (_req: Request, res: Response): void => {
  const documents = Array.from(ingestedSourceDocumentsStore.values());
  res.json({
    success: true,
    totalCount: documents.length,
    documents,
  });
});

/**
 * GET /api/admin/content/source-documents/:id
 * Retrieves detailed source document with extracted elements.
 */
adminPdfIngestionRouter.get("/source-documents/:id", (req: Request, res: Response): void => {
  const { id } = req.params;
  const doc = ingestedSourceDocumentsStore.get(id);

  if (!doc) {
    res.status(404).json({
      success: false,
      error: {
        code: "DOCUMENT_NOT_FOUND",
        message: `Documento com id '${id}' não foi encontrado.`,
      },
    });
    return;
  }

  res.json({
    success: true,
    document: doc,
  });
});

/**
 * POST /api/admin/content/ocr/start-job
 * Starts an asynchronous OCR and Multimodal extraction job for a target document.
 */
adminPdfIngestionRouter.post("/ocr/start-job", async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId, targetPages: requestedTargetPages, base64Pdf } = req.body;

    if (!documentId || typeof documentId !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_DOCUMENT_ID", message: "Campo 'documentId' é obrigatório." },
      });
      return;
    }

    const doc = ingestedSourceDocumentsStore.get(documentId);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: "DOCUMENT_NOT_FOUND", message: `Documento '${documentId}' não encontrado.` },
      });
      return;
    }

    // Determine target pages
    let targetPages: number[] = [];
    if (Array.isArray(requestedTargetPages) && requestedTargetPages.length > 0) {
      targetPages = requestedTargetPages.map(Number).filter((n) => n > 0 && n <= doc.pageCount);
    } else {
      // Default to pages requiring OCR or all pages
      const extractedPages = doc.extractedDocument?.pages || [];
      const ocrPages = extractedPages.filter((p) => p.ocrRequired).map((p) => p.pageNumber);
      targetPages = ocrPages.length > 0 ? ocrPages : Array.from({ length: doc.pageCount }, (_, i) => i + 1);
    }

    const ocrManager = OcrJobManager.getInstance();
    const jobState = await ocrManager.createJob(doc.id, targetPages, doc.documentFingerprint);

    // Update document status to queued/processing
    doc.status = "OCR_PROCESSING";
    doc.ocrJobId = jobState.jobId;
    doc.updatedAt = new Date().toISOString();

    // Retrieve or decode binary buffer
    let pdfBuffer = documentBinaryStore.get(doc.id);
    if (!pdfBuffer && base64Pdf) {
      pdfBuffer = Buffer.from(base64Pdf, "base64");
      documentBinaryStore.set(doc.id, pdfBuffer);
    }

    if (!pdfBuffer) {
      // Fallback empty buffer for simulated parsing if original buffer not in memory
      pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF");
    }

    // Execute job asynchronously (or immediately await for synchronous response)
    const { job: completedJob, resolvedPages } = await ocrManager.processJob(jobState.jobId, doc, pdfBuffer);

    // Determine overall completeness status
    const hasReviewNeeded = resolvedPages.some((p) => p.resolutionMethod === "MANUAL_REVIEW_REQUIRED");
    const finalCompleteness: SourceCompletenessStatus = hasReviewNeeded ? "REVIEW_REQUIRED" : "COMPLETE";
    const finalDocStatus = hasReviewNeeded ? "SOURCE_REVIEW_REQUIRED" : "SOURCE_COMPLETED";

    doc.status = finalDocStatus;
    doc.resolvedPages = resolvedPages;
    doc.completenessStatus = finalCompleteness;
    doc.updatedAt = new Date().toISOString();

    ingestedSourceDocumentsStore.set(doc.id, doc);

    res.json({
      success: true,
      job: completedJob,
      document: doc,
      resolvedPagesCount: resolvedPages.length,
      completenessStatus: finalCompleteness,
    });
  } catch (error: any) {
    console.error("[OCR Start Job Error]:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "OCR_JOB_FAILED",
        message: error?.message || "Falha ao inicializar o processamento de OCR.",
      },
    });
  }
});

/**
 * GET /api/admin/content/ocr/jobs/:jobId
 * Retrieves status and progress of an OCR background job.
 */
adminPdfIngestionRouter.get("/ocr/jobs/:jobId", (req: Request, res: Response): void => {
  const { jobId } = req.params;
  const ocrManager = OcrJobManager.getInstance();
  const job = ocrManager.getJob(jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: `Job de OCR '${jobId}' não encontrado.` },
    });
    return;
  }

  res.json({
    success: true,
    job,
  });
});

/**
 * POST /api/admin/content/source-documents/:id/manual-review
 * Records ADMIN manual review, approval, or verbatim correction for a resolved page source.
 * Preserves original extraction and full provenance.
 */
adminPdfIngestionRouter.post("/source-documents/:id/manual-review", (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { pageNumber, action, editedText, note } = req.body;

    const doc = ingestedSourceDocumentsStore.get(id);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: "DOCUMENT_NOT_FOUND", message: `Documento '${id}' não encontrado.` },
      });
      return;
    }

    const validActions: ManualReviewAction[] = [
      "SOURCE_APPROVED",
      "NEEDS_REPROCESSING",
      "NEEDS_MANUAL_CORRECTION",
    ];

    if (!validActions.includes(action)) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_ACTION", message: `Ação inválida. Opções: ${validActions.join(", ")}` },
      });
      return;
    }

    const pageNum = Number(pageNumber);
    const resolvedPages = doc.resolvedPages || [];
    const pageIndex = resolvedPages.findIndex((p) => p.pageNumber === pageNum);

    if (pageIndex === -1) {
      res.status(404).json({
        success: false,
        error: { code: "PAGE_NOT_FOUND", message: `Página ${pageNum} não encontrada nos fontes resolvidos.` },
      });
      return;
    }

    const existingPage = resolvedPages[pageIndex];
    const updatedPage: ResolvedSourcePage = {
      ...existingPage,
      manualReviewStatus: action as ManualReviewAction,
      sourceCompleteness: action === "SOURCE_APPROVED" ? "COMPLETE" : "REVIEW_REQUIRED",
    };

    if (action === "NEEDS_MANUAL_CORRECTION" && typeof editedText === "string") {
      updatedPage.manualEdit = {
        originalExtraction: existingPage.resolvedText,
        editedSource: editedText,
        editedBy: req.principal?.uid || "admin-master",
        editedAt: new Date().toISOString(),
        note,
      };
      updatedPage.resolvedText = editedText;
    }

    resolvedPages[pageIndex] = updatedPage;
    doc.resolvedPages = resolvedPages;

    const hasPendingReview = resolvedPages.some((p) => p.sourceCompleteness === "REVIEW_REQUIRED");
    doc.completenessStatus = hasPendingReview ? "REVIEW_REQUIRED" : "COMPLETE";
    doc.status = hasPendingReview ? "SOURCE_REVIEW_REQUIRED" : "SOURCE_COMPLETED";
    doc.updatedAt = new Date().toISOString();

    ingestedSourceDocumentsStore.set(doc.id, doc);

    res.json({
      success: true,
      document: doc,
      updatedPage,
    });
  } catch (error: any) {
    console.error("[Manual Review Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "MANUAL_REVIEW_FAILED", message: error?.message || "Erro ao salvar revisão manual." },
    });
  }
});

/**
 * POST /api/admin/content/segmentation/start-job
 * Starts asynchronous medical segmentation on a SourceDocument.
 */
adminPdfIngestionRouter.post("/segmentation/start-job", async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.body;

    if (!documentId || typeof documentId !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_DOCUMENT_ID", message: "Campo 'documentId' é obrigatório." },
      });
      return;
    }

    const doc = ingestedSourceDocumentsStore.get(documentId);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: "DOCUMENT_NOT_FOUND", message: `Documento '${documentId}' não encontrado.` },
      });
      return;
    }

    const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
    const { job, result } = await segManager.createAndRunJob(doc);

    res.json({
      success: true,
      job,
      segmentCount: result.segments.length,
      structuredContentsCount: result.structuredContents.length,
      areasFoundSummary: result.areasFoundSummary,
    });
  } catch (error: any) {
    console.error("[Segmentation Start Job Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "SEGMENTATION_JOB_FAILED", message: error?.message || "Erro ao processar segmentação médica." },
    });
  }
});

/**
 * GET /api/admin/content/segmentation/jobs/:jobId
 * Retrieves status of a segmentation job.
 */
adminPdfIngestionRouter.get("/segmentation/jobs/:jobId", async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;
  const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
  const job = segManager.getJob(jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: `Job '${jobId}' não encontrado.` },
    });
    return;
  }

  res.json({ success: true, job });
});

/**
 * GET /api/admin/content/source-documents/:id/structured-content
 * Retrieves all structured source content items for a source document.
 */
adminPdfIngestionRouter.get("/source-documents/:id/structured-content", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
  const contents = segManager.getStructuredContentsByDocument(id);

  res.json({
    success: true,
    documentId: id,
    totalItems: contents.length,
    structuredContents: contents,
  });
});

/**
 * POST /api/admin/content/structured-content/:id/confirm-canonical
 * Explicitly confirms and assigns a canonical topic ID after Admin approval.
 */
adminPdfIngestionRouter.post("/structured-content/:id/confirm-canonical", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { canonicalTopicId } = req.body;

    if (!canonicalTopicId || typeof canonicalTopicId !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_CANONICAL_ID", message: "Campo 'canonicalTopicId' é obrigatório." },
      });
      return;
    }

    const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
    const updated = segManager.confirmCanonicalTopic(id, canonicalTopicId.trim());

    res.json({
      success: true,
      structuredContent: updated,
    });
  } catch (error: any) {
    console.error("[Confirm Canonical Topic Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "CONFIRM_CANONICAL_FAILED", message: error?.message || "Erro ao confirmar tema canônico." },
    });
  }
});

/**
 * POST /api/admin/content/structured-content/:id/approve-structure
 * Marks a StructuredSourceContent as APPROVED_STRUCTURE (ready for future editorial layer).
 */
adminPdfIngestionRouter.post("/structured-content/:id/approve-structure", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
    const updated = segManager.approveStructure(id);

    res.json({
      success: true,
      structuredContent: updated,
    });
  } catch (error: any) {
    console.error("[Approve Structure Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "APPROVE_STRUCTURE_FAILED", message: error?.message || "Erro ao aprovar estrutura." },
    });
  }
});

/**
 * POST /api/admin/content/structured-content/:id/split
 * Splits a segment into two parts at a given block index.
 */
adminPdfIngestionRouter.post("/structured-content/:id/split", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { splitAtIndex } = req.body;

    const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
    const resultParts = segManager.splitSegment(id, Number(splitAtIndex));

    res.json({
      success: true,
      parts: resultParts,
    });
  } catch (error: any) {
    console.error("[Split Segment Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "SPLIT_SEGMENT_FAILED", message: error?.message || "Erro ao dividir segmento." },
    });
  }
});

/**
 * POST /api/admin/content/structured-content/merge
 * Merges two adjacent segments.
 */
adminPdfIngestionRouter.post("/structured-content/merge", async (req: Request, res: Response): Promise<void> => {
  try {
    const { contentIdA, contentIdB } = req.body;
    const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
    const merged = segManager.mergeSegments(contentIdA, contentIdB);

    res.json({
      success: true,
      mergedContent: merged,
    });
  } catch (error: any) {
    console.error("[Merge Segments Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "MERGE_SEGMENTS_FAILED", message: error?.message || "Erro ao unir segmentos." },
    });
  }
});

/**
 * POST /api/admin/content/editorial/start-job
 * Starts asynchronous composition of an approved StructuredSourceContent into an editorial draft.
 */
adminPdfIngestionRouter.post("/editorial/start-job", async (req: Request, res: Response): Promise<void> => {
  try {
    const { structuredContentId } = req.body;
    if (!structuredContentId || typeof structuredContentId !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_CONTENT_ID", message: "Campo 'structuredContentId' é obrigatório." },
      });
      return;
    }

    const segManager = (await import("../segmentation/segmentationJobQueue")).SegmentationJobManager.getInstance();
    const structuredContent = segManager.getStructuredContent(structuredContentId);

    if (!structuredContent) {
      res.status(404).json({
        success: false,
        error: { code: "CONTENT_NOT_FOUND", message: `Conteúdo estruturado '${structuredContentId}' não encontrado.` },
      });
      return;
    }

    const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
    const { job, draft } = await edManager.createAndRunCompositionJob(structuredContent);

    res.json({
      success: true,
      job,
      draft,
    });
  } catch (error: any) {
    console.error("[Editorial Start Job Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "EDITORIAL_JOB_FAILED", message: error?.message || "Erro ao gerar composição editorial." },
    });
  }
});

/**
 * GET /api/admin/content/editorial/jobs/:jobId
 * Retrieves status of an editorial composition job.
 */
adminPdfIngestionRouter.get("/editorial/jobs/:jobId", async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;
  const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
  const job = edManager.getJob(jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: `Job editorial '${jobId}' não encontrado.` },
    });
    return;
  }

  res.json({ success: true, job });
});

/**
 * GET /api/admin/content/editorial/drafts/:draftId
 * Retrieves an editorial document draft by ID.
 */
adminPdfIngestionRouter.get("/editorial/drafts/:draftId", async (req: Request, res: Response): Promise<void> => {
  const { draftId } = req.params;
  const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
  const draft = edManager.getDraft(draftId);

  if (!draft) {
    res.status(404).json({
      success: false,
      error: { code: "DRAFT_NOT_FOUND", message: `Draft editorial '${draftId}' não encontrado.` },
    });
    return;
  }

  res.json({ success: true, draft });
});

/**
 * POST /api/admin/content/editorial/drafts/:draftId/reorder
 * Reorders blocks within an editorial page.
 */
adminPdfIngestionRouter.post("/editorial/drafts/:draftId/reorder", async (req: Request, res: Response): Promise<void> => {
  try {
    const { draftId } = req.params;
    const { pageIndex, fromIndex, toIndex } = req.body;

    const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
    const updatedDraft = edManager.reorderPageBlocks(draftId, Number(pageIndex), Number(fromIndex), Number(toIndex));

    res.json({ success: true, draft: updatedDraft });
  } catch (error: any) {
    console.error("[Reorder Blocks Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "REORDER_FAILED", message: error?.message || "Erro ao reordenar blocos." },
    });
  }
});

/**
 * POST /api/admin/content/editorial/drafts/:draftId/change-component-type
 * Changes visual component type of an editorial block.
 */
adminPdfIngestionRouter.post("/editorial/drafts/:draftId/change-component-type", async (req: Request, res: Response): Promise<void> => {
  try {
    const { draftId } = req.params;
    const { blockId, newType } = req.body;

    const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
    const updatedDraft = edManager.changeComponentType(draftId, blockId, newType);

    res.json({ success: true, draft: updatedDraft });
  } catch (error: any) {
    console.error("[Change Component Type Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "CHANGE_TYPE_FAILED", message: error?.message || "Erro ao alterar tipo de componente." },
    });
  }
});

/**
 * POST /api/admin/content/editorial/drafts/:draftId/insert-page-break
 * Inserts a manual page break at a specific block.
 */
adminPdfIngestionRouter.post("/editorial/drafts/:draftId/insert-page-break", async (req: Request, res: Response): Promise<void> => {
  try {
    const { draftId } = req.params;
    const { blockId } = req.body;

    const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
    const updatedDraft = edManager.insertPageBreakAtBlock(draftId, blockId);

    res.json({ success: true, draft: updatedDraft });
  } catch (error: any) {
    console.error("[Insert Page Break Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "PAGE_BREAK_FAILED", message: error?.message || "Erro ao inserir quebra de página." },
    });
  }
});

/**
 * POST /api/admin/content/editorial/drafts/:draftId/approve-layout
 * Marks draft as APPROVED_EDITORIAL layout.
 */
adminPdfIngestionRouter.post("/editorial/drafts/:draftId/approve-layout", async (req: Request, res: Response): Promise<void> => {
  try {
    const { draftId } = req.params;
    const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
    const approvedDraft = edManager.approveEditorialLayout(draftId);

    res.json({ success: true, draft: approvedDraft });
  } catch (error: any) {
    console.error("[Approve Layout Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "APPROVE_LAYOUT_FAILED", message: error?.message || "Erro ao aprovar layout editorial." },
    });
  }
});

/**
 * POST /api/admin/content/editorial/drafts/:draftId/export-pdf
 * Initiates an A4 PDF export for an APPROVED_EDITORIAL document.
 */
adminPdfIngestionRouter.post("/editorial/drafts/:draftId/export-pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const { draftId } = req.params;
    const { adminNotes } = req.body || {};

    const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
    const draft = edManager.getDraft(draftId);

    if (!draft) {
      res.status(404).json({
        success: false,
        error: { code: "DRAFT_NOT_FOUND", message: `Documento editorial '${draftId}' não encontrado.` },
      });
      return;
    }

    const exportManager = (await import("../editorial/editorialExportJobQueue")).EditorialExportJobManager.getInstance();
    const result = await exportManager.requestExport(draft, (req as any).user?.uid || "admin-master", adminNotes);

    res.json({
      success: true,
      export: result.exportRecord,
    });
  } catch (error: any) {
    console.error("[Export PDF Error]:", error);
    const failureCode = error?.code || "EXPORT_FAILED";
    res.status(400).json({
      success: false,
      error: {
        code: failureCode,
        message: error?.message || "Falha na geração do PDF editorial A4.",
        exportRecord: error?.exportRecord,
      },
    });
  }
});

/**
 * GET /api/admin/content/editorial/exports/:exportId
 * Retrieves export record status and validation result.
 */
adminPdfIngestionRouter.get("/editorial/exports/:exportId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { exportId } = req.params;
    const exportManager = (await import("../editorial/editorialExportJobQueue")).EditorialExportJobManager.getInstance();
    const exportRecord = await exportManager.getExport(exportId);

    if (!exportRecord) {
      res.status(404).json({
        success: false,
        error: { code: "EXPORT_NOT_FOUND", message: `Registro de exportação '${exportId}' não encontrado.` },
      });
      return;
    }

    res.json({ success: true, export: exportRecord });
  } catch (error: any) {
    console.error("[Get Export Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "GET_EXPORT_FAILED", message: error?.message || "Erro ao consultar exportação." },
    });
  }
});

/**
 * GET /api/admin/content/editorial/exports/:exportId/download
 * Authenticated ADMIN streaming download endpoint for exported A4 PDF.
 */
adminPdfIngestionRouter.get("/editorial/exports/:exportId/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const { exportId } = req.params;
    const exportManager = (await import("../editorial/editorialExportJobQueue")).EditorialExportJobManager.getInstance();
    const exportRecord = await exportManager.getExport(exportId);

    if (!exportRecord) {
      res.status(404).json({
        success: false,
        error: { code: "EXPORT_NOT_FOUND", message: `Registro de exportação '${exportId}' não encontrado.` },
      });
      return;
    }

    const pdfBuffer = await exportManager.getExportBinary(exportId);
    if (!pdfBuffer) {
      res.status(404).json({
        success: false,
        error: { code: "PDF_FILE_NOT_FOUND", message: "Arquivo PDF não encontrado no storage privado." },
      });
      return;
    }

    // Sanitized file name
    const sanitizedTopic = exportRecord.topic
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const fileName = `staziamed-${sanitizedTopic || "editorial"}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("[Download Export Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "DOWNLOAD_FAILED", message: error?.message || "Erro ao realizar download do PDF." },
    });
  }
});

/**
 * POST /api/admin/content/editorial/drafts/:draftId/rights-review
 * Records an administrative rights decision (APPROVED / REJECTED) for a draft.
 */
adminPdfIngestionRouter.post("/editorial/drafts/:draftId/rights-review", async (req: Request, res: Response): Promise<void> => {
  try {
    const { draftId } = req.params;
    const { status, notes } = req.body;

    if (!status || (status !== "APPROVED" && status !== "REJECTED" && status !== "NOT_REQUIRED")) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_RIGHTS_STATUS", message: "Status de direitos inválido. Use APPROVED, REJECTED ou NOT_REQUIRED." },
      });
      return;
    }

    const exportManager = (await import("../editorial/editorialExportJobQueue")).EditorialExportJobManager.getInstance();
    await exportManager.recordRightsDecision(draftId, status, (req as any).user?.uid || "admin-master", notes);

    res.json({ success: true, rightsStatus: status });
  } catch (error: any) {
    console.error("[Rights Review Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "RIGHTS_REVIEW_FAILED", message: error?.message || "Erro ao registrar decisão de direitos." },
    });
  }
});

/**
 * GET /api/admin/content/editorial/drafts/:draftId/exports-history
 * Lists all exports for a given draft.
 */
adminPdfIngestionRouter.get("/editorial/drafts/:draftId/exports-history", async (req: Request, res: Response): Promise<void> => {
  try {
    const { draftId } = req.params;
    const edManager = (await import("../editorial/editorialJobQueue")).EditorialJobManager.getInstance();
    const draft = edManager.getDraft(draftId);

    const exportManager = (await import("../editorial/editorialExportJobQueue")).EditorialExportJobManager.getInstance();
    const history = await exportManager.listExportsForDraft(draftId, draft);

    res.json({ success: true, exports: history });
  } catch (error: any) {
    console.error("[Exports History Error]:", error);
    res.status(500).json({
      success: false,
      error: { code: "HISTORY_FAILED", message: error?.message || "Erro ao listar histórico de exportações." },
    });
  }
});


