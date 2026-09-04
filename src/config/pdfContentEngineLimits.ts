/**
 * Central configuration limits for the StaziaMed PDF Content Engine (Etapa 1.28A).
 * Standardizes constraints across client validation, server ingestion, and extraction engine.
 */

export const PDF_CONTENT_ENGINE_LIMITS = {
  /** Maximum file size in Megabytes */
  MAX_PDF_SIZE_MB: 50,
  /** Maximum file size in Bytes (50MB) */
  MAX_PDF_SIZE_BYTES: 50 * 1024 * 1024,
  /** Maximum allowed page count per source document */
  MAX_PDF_PAGES: 500,
  /** Expected PDF file signature (Magic Bytes: %PDF-) */
  MAGIC_BYTES: "%PDF-",
  /** Minimum characters of native text required to classify a page as having native text */
  MIN_NATIVE_TEXT_CHARS_PER_PAGE: 50,
  /** Standard storage path template for raw original source documents */
  STORAGE_BASE_PATH: "content-engine/source-documents",
} as const;
