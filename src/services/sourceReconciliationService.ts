/**
 * Source Reconciliation Service (Etapa 1.28B).
 * Pure domain service for deterministic reconciliation of Native Source Extraction
 * and OCR / Multimodal Extraction.
 * Preserves fidelity and provenance without overwriting or hallucinating.
 */

import { ExtractedPdfPage, ExtractedPdfTable } from "../types/pdfIngestion";
import {
  OcrBlock,
  OcrPageResult,
  PageCompleteness,
  ResolutionMethod,
  ResolvedSourceFigure,
  ResolvedSourcePage,
  ResolvedSourceTable,
} from "../types/pdfOcr";

export interface ReconcilePageOptions {
  similarityThreshold?: number;
}

/**
 * Reconciles a single page from its native extraction and OCR results.
 */
export function reconcilePageSource(
  documentId: string,
  pageNumber: number,
  nativePage?: ExtractedPdfPage,
  ocrResult?: OcrPageResult,
  _options: ReconcilePageOptions = {}
): ResolvedSourcePage {
  const warnings: string[] = [];
  const nativeText = nativePage?.text?.trim() || "";
  const ocrText = ocrResult?.text?.trim() || "";

  // 1. Case: Blank Page
  const hasNoNative = !nativeText && (!nativePage?.images.length) && (!nativePage?.tables.length);
  const hasNoOcr = !ocrText && (!ocrResult?.figures.length) && (!ocrResult?.tables.length);

  if (hasNoNative && hasNoOcr) {
    return {
      documentId,
      pageNumber,
      nativeExtraction: nativePage,
      ocrExtraction: ocrResult,
      resolvedBlocks: [],
      resolvedText: "",
      resolvedTables: [],
      resolvedFigures: [],
      resolutionMethod: "NATIVE_ONLY",
      warnings: ["Página em branco (sem conteúdo textual ou visual relevante)."],
      sourceCompleteness: "BLANK_PAGE",
    };
  }

  // 2. Case: Native Only (No OCR performed or needed)
  if (nativeText && (!ocrResult || !ocrText)) {
    const blocks: OcrBlock[] = (nativePage?.text.split("\n\n") || []).map((para, idx) => ({
      id: `blk_nat_${documentId}_p${pageNumber}_${idx + 1}`,
      pageNumber,
      type: "OCR_PARAGRAPH",
      text: para.trim(),
      order: idx + 1,
      confidence: 1.0,
      provenance: {
        documentId,
        pageNumber,
        nativeObjectId: `native_para_${idx + 1}`,
      },
    }));

    const resolvedTables: ResolvedSourceTable[] = (nativePage?.tables || []).map((t) => ({
      tableId: t.tableId,
      pageNumber,
      columns: t.columns,
      rows: t.rows,
      cells: t.cells,
      sourceMethod: "NATIVE",
      confidence: t.structureConfidence,
      isUnresolved: t.isUnresolved,
    }));

    return {
      documentId,
      pageNumber,
      nativeExtraction: nativePage,
      ocrExtraction: ocrResult,
      resolvedBlocks: blocks,
      resolvedText: nativeText,
      resolvedTables,
      resolvedFigures: [],
      resolutionMethod: "NATIVE_ONLY",
      warnings: [],
      sourceCompleteness: "COMPLETE",
    };
  }

  // 3. Case: OCR Only (Image scan without native text)
  if (!nativeText && ocrResult && ocrText) {
    const resolvedTables: ResolvedSourceTable[] = ocrResult.tables.map((t) => ({
      tableId: t.tableId,
      pageNumber,
      columns: t.columns,
      rows: t.rows,
      cells: t.cells,
      sourceMethod: "OCR",
      confidence: t.structureConfidence || 0.9,
      isUnresolved: t.isUnresolved,
    }));

    return {
      documentId,
      pageNumber,
      nativeExtraction: nativePage,
      ocrExtraction: ocrResult,
      resolvedBlocks: ocrResult.blocks,
      resolvedText: ocrText,
      resolvedTables,
      resolvedFigures: ocrResult.figures,
      resolutionMethod: "OCR_ONLY",
      warnings: [],
      sourceCompleteness: "COMPLETE",
    };
  }

  // 4. Case: Mixed Page (Both Native and OCR present)
  let resolutionMethod: ResolutionMethod = "NATIVE_WITH_OCR_COMPLEMENT";
  let resolvedText = "";
  const resolvedBlocks: OcrBlock[] = [];

  // Deduplicate overlapping text between native and OCR
  const isOcrContainingNative = ocrText.includes(nativeText);
  const isNativeContainingOcr = nativeText.includes(ocrText);

  if (isOcrContainingNative) {
    resolvedText = ocrText;
    resolvedBlocks.push(...(ocrResult?.blocks || []));
  } else if (isNativeContainingOcr) {
    resolvedText = nativeText;
    resolvedBlocks.push(
      ...nativeText.split("\n\n").map((para, idx) => ({
        id: `blk_mix_${documentId}_p${pageNumber}_${idx + 1}`,
        pageNumber,
        type: "OCR_PARAGRAPH" as const,
        text: para.trim(),
        order: idx + 1,
        confidence: 0.98,
        provenance: { documentId, pageNumber },
      }))
    );
  } else {
    // Both have distinct text -> Combine with clear demarcation
    resolvedText = `${nativeText}\n\n[Complemento Visual OCR]:\n${ocrText}`;
    resolvedBlocks.push(
      ...nativeText.split("\n\n").map((p, idx) => ({
        id: `blk_nat_${documentId}_p${pageNumber}_${idx + 1}`,
        pageNumber,
        type: "OCR_PARAGRAPH" as const,
        text: p.trim(),
        order: idx + 1,
        confidence: 1.0,
        provenance: { documentId, pageNumber },
      })),
      ...(ocrResult?.blocks || [])
    );
  }

  // Table Reconciliation & Conflict Check
  const resolvedTables: ResolvedSourceTable[] = [];
  const nativeTables = nativePage?.tables || [];
  const ocrTables = ocrResult?.tables || [];

  if (nativeTables.length > 0 && ocrTables.length > 0) {
    nativeTables.forEach((nTab, idx) => {
      const matchingOcrTab = ocrTables[idx];
      if (matchingOcrTab) {
        const hasDimensionConflict =
          nTab.columns !== matchingOcrTab.columns || nTab.rows !== matchingOcrTab.rows;

        if (hasDimensionConflict) {
          warnings.push(
            `Conflito estrutural de tabela na página ${pageNumber}: Nativo (${nTab.rows}x${nTab.columns}) vs OCR (${matchingOcrTab.rows}x${matchingOcrTab.columns}).`
          );
          resolutionMethod = "MANUAL_REVIEW_REQUIRED";
          resolvedTables.push({
            tableId: nTab.tableId,
            pageNumber,
            columns: nTab.columns,
            rows: nTab.rows,
            cells: nTab.cells,
            sourceMethod: "NATIVE",
            isConflict: true,
          });
        } else {
          resolvedTables.push({
            tableId: nTab.tableId,
            pageNumber,
            columns: nTab.columns,
            rows: nTab.rows,
            cells: nTab.cells,
            sourceMethod: "RECONCILED",
            confidence: 0.95,
          });
        }
      } else {
        resolvedTables.push({
          tableId: nTab.tableId,
          pageNumber,
          columns: nTab.columns,
          rows: nTab.rows,
          cells: nTab.cells,
          sourceMethod: "NATIVE",
        });
      }
    });
  } else if (nativeTables.length > 0) {
    nativeTables.forEach((t) =>
      resolvedTables.push({
        tableId: t.tableId,
        pageNumber,
        columns: t.columns,
        rows: t.rows,
        cells: t.cells,
        sourceMethod: "NATIVE",
        isUnresolved: t.isUnresolved,
      })
    );
  } else if (ocrTables.length > 0) {
    ocrTables.forEach((t) =>
      resolvedTables.push({
        tableId: t.tableId,
        pageNumber,
        columns: t.columns,
        rows: t.rows,
        cells: t.cells,
        sourceMethod: "OCR",
        isUnresolved: t.isUnresolved,
      })
    );
  }

  // Figures reconciliation
  const resolvedFigures: ResolvedSourceFigure[] = ocrResult?.figures || [];

  const sourceCompleteness: PageCompleteness =
    resolutionMethod === "MANUAL_REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "COMPLETE";

  return {
    documentId,
    pageNumber,
    nativeExtraction: nativePage,
    ocrExtraction: ocrResult,
    resolvedBlocks,
    resolvedText,
    resolvedTables,
    resolvedFigures,
    resolutionMethod,
    warnings,
    sourceCompleteness,
  };
}
