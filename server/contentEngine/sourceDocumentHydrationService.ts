import { SourceDocument, ExtractedPdfDocument, ExtractedPdfPage } from "../../src/types/pdfIngestion";
import { OcrPageResult, ResolvedSourcePage } from "../../src/types/pdfOcr";
import { SourceDocumentRepository } from "./sourceDocumentRepository";
import { SourcePageRepository } from "./sourcePageRepository";
import {
  deserializeTableFromFirestore,
  deserializeResolvedTableFromFirestore,
} from "./sourcePagePersistence";

export class SourceDocumentHydrationService {
  /**
   * Reconstitutes a full in-memory SourceDocument from durable Firestore metadata
   * and page subcollections (nativePages, ocrPages, resolvedPages).
   */
  static async hydrateSourceDocument(documentId: string): Promise<SourceDocument | null> {
    const meta = await SourceDocumentRepository.getById(documentId);
    if (!meta) {
      return null;
    }

    // 1. Load native pages
    const nativePages = await SourcePageRepository.listNativePages(documentId);

    // 2. Reconstruct extractedDocument if summary or native pages exist
    let extractedDocument: ExtractedPdfDocument | undefined;
    const nativePageMap = new Map<number, ExtractedPdfPage>();

    if (meta.nativeExtractionSummary || nativePages.length > 0) {
      const summary = meta.nativeExtractionSummary;
      const pages: ExtractedPdfPage[] = nativePages.map((np) => ({
        documentId: np.documentId,
        pageNumber: np.pageNumber,
        text: np.text,
        textCharacterCount: np.textCharacterCount,
        hasNativeText: np.hasNativeText,
        images: np.images || [],
        tables: (np.tables || []).map(deserializeTableFromFirestore).filter(Boolean) as any[],
        width: np.width,
        height: np.height,
        extractionStatus: np.extractionStatus,
        ocrRequired: np.ocrRequired,
      }));

      for (const p of pages) {
        nativePageMap.set(p.pageNumber, p);
      }

      extractedDocument = {
        documentId: meta.id,
        pageCount: summary?.pageCount ?? meta.pageCount ?? nativePages.length,
        contentMode: summary?.contentMode ?? meta.contentMode ?? "TEXT_PDF",
        pages,
        totalCharacterCount:
          summary?.totalCharacterCount ??
          nativePages.reduce((acc, p) => acc + (p.textCharacterCount || 0), 0),
        imageCount:
          summary?.imageCount ?? nativePages.reduce((acc, p) => acc + (p.images?.length || 0), 0),
        tableCount:
          summary?.tableCount ?? nativePages.reduce((acc, p) => acc + (p.tables?.length || 0), 0),
        pagesRequiringOcr:
          summary?.pagesRequiringOcr ?? nativePages.filter((p) => p.ocrRequired).length,
        engineName: summary?.engineName ?? "PdfNativeExtractor",
        engineVersion: summary?.engineVersion ?? "1.0.0",
        startedAt: summary?.startedAt ?? meta.createdAt,
        finishedAt: summary?.finishedAt ?? meta.updatedAt,
      };
    }

    // 3. Load resolved pages
    const resolvedPagesData = await SourcePageRepository.listResolvedPages(documentId);
    let resolvedPages: ResolvedSourcePage[] | undefined;

    if (resolvedPagesData.length > 0) {
      // 4. Load OCR pages to attach to resolved pages
      const ocrPagesData = await SourcePageRepository.listOcrPages(documentId);
      const ocrPageMap = new Map<number, OcrPageResult>();

      for (const op of ocrPagesData) {
        ocrPageMap.set(op.pageNumber, {
          documentId: op.documentId,
          pageNumber: op.pageNumber,
          text: op.text,
          blocks: op.blocks || [],
          tables: (op.tables || []).map(deserializeTableFromFirestore).filter(Boolean) as any[],
          figures: op.figures || [],
          readingOrder: op.readingOrder || [],
          provider: op.provider as any,
          providerVersion: op.providerVersion,
          confidence: op.confidence,
          startedAt: op.startedAt,
          finishedAt: op.finishedAt,
        });
      }

      resolvedPages = resolvedPagesData.map((rp) => {
        const pageNum = rp.pageNumber;
        const nativeExt = nativePageMap.get(pageNum);
        const ocrExt = ocrPageMap.get(pageNum);

        const page: ResolvedSourcePage = {
          documentId: rp.documentId,
          pageNumber: rp.pageNumber,
          resolvedBlocks: rp.resolvedBlocks || [],
          resolvedText: rp.resolvedText || "",
          resolvedTables: (rp.resolvedTables || []).map(deserializeResolvedTableFromFirestore).filter(Boolean) as any[],
          resolvedFigures: rp.resolvedFigures || [],
          resolutionMethod: rp.resolutionMethod,
          warnings: rp.warnings || [],
          sourceCompleteness: rp.sourceCompleteness,
          manualReviewStatus: rp.manualReviewStatus,
          manualEdit: rp.manualEdit,
          nativeExtraction: nativeExt,
          ocrExtraction: ocrExt,
        };
        return page;
      });
    }

    const doc: SourceDocument = {
      id: meta.id,
      title: meta.title,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      pageCount: meta.pageCount,
      documentFingerprint: meta.documentFingerprint,
      sourceType: meta.sourceType,
      rightsType: meta.rightsType,
      sourceYear: meta.sourceYear,
      institution: meta.institution,
      contentMode: meta.contentMode,
      status: meta.status,
      storagePath: meta.storagePath,
      createdBy: meta.createdBy,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      completenessStatus: meta.completenessStatus,
      ocrJobId: meta.ocrJobId,
      failureCode: meta.failureCode,
      duplicateOfDocumentId: meta.duplicateOfDocumentId,
      extractedDocument,
      resolvedPages,
    };

    return doc;
  }
}
