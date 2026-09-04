import { PDF_CONTENT_ENGINE_LIMITS } from "../config/pdfContentEngineLimits";
import { PdfValidationResult } from "../types/pdfIngestion";

/**
 * Computes SHA-256 hash string for Uint8Array / Buffer in cross-environment (Node + Browser).
 */
export async function computeSha256Fingerprint(data: Uint8Array): Promise<string> {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback for Node without crypto.subtle (if any)
  try {
    // Dynamic import/require for Node
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(Buffer.from(data)).digest("hex");
  } catch {
    // Basic fallback hash calculation
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data[i];
      hash |= 0;
    }
    return `sha256-fallback-${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Validates PDF bytes against magic header (%PDF-), size limit (50MB),
 * encryption detection, and structural integrity.
 */
export async function validatePdfBytes(
  bytes: Uint8Array | ArrayBuffer | Buffer
): Promise<PdfValidationResult> {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sizeBytes = uint8.byteLength;

  if (sizeBytes === 0) {
    return {
      valid: false,
      fingerprint: "",
      sizeBytes: 0,
      errorCode: "EMPTY_FILE",
      errorMessage: "O arquivo enviado está vazio.",
    };
  }

  if (sizeBytes > PDF_CONTENT_ENGINE_LIMITS.MAX_PDF_SIZE_BYTES) {
    return {
      valid: false,
      fingerprint: "",
      sizeBytes,
      errorCode: "FILE_TOO_LARGE",
      errorMessage: `O arquivo excede o limite máximo permitido de ${PDF_CONTENT_ENGINE_LIMITS.MAX_PDF_SIZE_MB}MB.`,
    };
  }

  // Check Magic Bytes "%PDF-" (0x25, 0x50, 0x44, 0x46, 0x2D)
  // Usually in the first 1024 bytes
  const headerSlice = uint8.subarray(0, Math.min(1024, sizeBytes));
  const headerStr = new TextDecoder("latin1").decode(headerSlice);
  if (!headerStr.includes(PDF_CONTENT_ENGINE_LIMITS.MAGIC_BYTES)) {
    return {
      valid: false,
      fingerprint: "",
      sizeBytes,
      errorCode: "INVALID_MAGIC_BYTES",
      errorMessage: "O arquivo não é um PDF válido (cabeçalho %PDF- ausente).",
    };
  }

  const fingerprint = await computeSha256Fingerprint(uint8);

  // Convert binary to string for lightweight structural inspection
  const fullText = new TextDecoder("latin1").decode(uint8);

  // Check for Encryption
  if (/\/Encrypt\b/.test(fullText)) {
    return {
      valid: false,
      fingerprint,
      sizeBytes,
      isEncrypted: true,
      errorCode: "PDF_ENCRYPTED",
      errorMessage: "O PDF está protegido por senha ou criptografado e não pode ser processado.",
    };
  }

  // Check for EOF marker
  const hasEof = /%%EOF/.test(fullText);
  if (!hasEof && sizeBytes > 200) {
    return {
      valid: false,
      fingerprint,
      sizeBytes,
      errorCode: "PDF_MALFORMED",
      errorMessage: "Estrutura do PDF corrompida ou incompleta (marcador %%EOF ausente).",
    };
  }

  // Estimate page count by matching Page objects
  // Count matches of "/Type /Page" or "/Type/Page" where it's not "/Type /Pages"
  const pageMatches = fullText.match(/\/Type\s*\/Page\b/g);
  let estimatedPageCount = pageMatches ? pageMatches.length : 1;

  // Check /Count inside /Pages if available
  const countMatch = fullText.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  if (countMatch && countMatch[1]) {
    const parsed = parseInt(countMatch[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      estimatedPageCount = parsed;
    }
  }

  if (estimatedPageCount > PDF_CONTENT_ENGINE_LIMITS.MAX_PDF_PAGES) {
    return {
      valid: false,
      fingerprint,
      sizeBytes,
      estimatedPageCount,
      errorCode: "FILE_TOO_LARGE",
      errorMessage: `O documento possui ${estimatedPageCount} páginas, excedendo o limite de ${PDF_CONTENT_ENGINE_LIMITS.MAX_PDF_PAGES} páginas.`,
    };
  }

  return {
    valid: true,
    fingerprint,
    sizeBytes,
    estimatedPageCount: Math.max(1, estimatedPageCount),
    isEncrypted: false,
  };
}
