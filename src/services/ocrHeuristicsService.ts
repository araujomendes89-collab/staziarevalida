/**
 * Multi-signal OCR Heuristics Service (Etapa 1.28B).
 * Evaluates whether a PDF page truly requires OCR or Multimodal extraction,
 * avoiding naive string-length-only decisions.
 */

import { ExtractedPdfPage } from "../types/pdfIngestion";
import { PageOcrHeuristicResult } from "../types/pdfOcr";

export interface PageHeuristicOptions {
  minTextCharsThreshold?: number; // Default 50
  imageDominanceThreshold?: number; // Default >= 1 image with text density < 150
}

/**
 * Evaluates multi-signal heuristics for a given extracted page.
 */
export function evaluatePageOcrNeed(
  page: ExtractedPdfPage,
  options: PageHeuristicOptions = {}
): PageOcrHeuristicResult {
  const { minTextCharsThreshold = 50 } = options;

  const trimmedText = page.text.trim();
  const charCount = trimmedText.length;
  const imageCount = page.images.length;
  const tableCount = page.tables.length;

  // 1. Truly Blank Page Check
  if (charCount === 0 && imageCount === 0 && tableCount === 0) {
    return {
      pageNumber: page.pageNumber,
      ocrRequired: false,
      reason: "Página vazia (sem texto, sem imagens, sem tabelas).",
      isBlank: true,
      isImageDominant: false,
      nativeTextDensity: 0,
      imageCount: 0,
      tableCount: 0,
    };
  }

  // 2. Low-Text Page with Structured Table Check
  // E.g., "Tabela 3 — Metas" + a 4x4 table. Has few plain text characters outside table,
  // but table parser already extracted the structured native matrix.
  const isStructuredTableOnly =
    tableCount > 0 &&
    page.tables.some((t) => t.rows >= 2 && !t.isUnresolved) &&
    imageCount === 0;

  if (isStructuredTableOnly && charCount < minTextCharsThreshold) {
    return {
      pageNumber: page.pageNumber,
      ocrRequired: false,
      reason: "Página com baixa densidade de texto livre, mas com tabela nativa estruturada confiável.",
      isBlank: false,
      isImageDominant: false,
      nativeTextDensity: charCount / Math.max(1, tableCount),
      imageCount,
      tableCount,
    };
  }

  // 3. Image-Dominant Page Check (Diagrams, flowcharts, medical scans with text)
  // Even if there are some native text characters, the presence of raster images suggests visual text inside the image.
  const isImageDominant = imageCount > 0 && charCount < 300;
  if (isImageDominant) {
    return {
      pageNumber: page.pageNumber,
      ocrRequired: true,
      reason: `Página com presença de elementos visuais (${imageCount} imagem(ns)) requerendo extração multimodal/OCR de texto embutido.`,
      isBlank: false,
      isImageDominant: true,
      nativeTextDensity: charCount,
      imageCount,
      tableCount,
    };
  }

  // 4. Scanned / Zero Native Text Page Check
  if (charCount < minTextCharsThreshold) {
    return {
      pageNumber: page.pageNumber,
      ocrRequired: true,
      reason: `Densidade de texto nativo insuficiente (${charCount} caracteres). Necessita OCR.`,
      isBlank: false,
      isImageDominant: imageCount > 0,
      nativeTextDensity: charCount,
      imageCount,
      tableCount,
    };
  }

  // 5. Clean Native Text Page
  return {
    pageNumber: page.pageNumber,
    ocrRequired: false,
    reason: `Texto nativo íntegro (${charCount} caracteres). OCR dispensado.`,
    isBlank: false,
    isImageDominant: false,
    nativeTextDensity: charCount,
    imageCount,
    tableCount,
  };
}
