import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "../firebaseAdmin";

export const CANONICAL_STORAGE_BUCKET = "staziamed-revalida-prod.firebasestorage.app";

export class SourcePdfStorageService {
  private static getBucket() {
    const bucketName = process.env.STORAGE_BUCKET || CANONICAL_STORAGE_BUCKET;
    return getStorage(getAdminApp()).bucket(bucketName);
  }

  /**
   * Uploads raw PDF bytes to the canonical storage path with private permissions and metadata.
   */
  static async uploadSourcePdf(
    storagePath: string,
    pdfBuffer: Buffer,
    customMetadata?: { sourceDocumentId?: string; documentFingerprint?: string }
  ): Promise<void> {
    const bucket = this.getBucket();
    const file = bucket.file(storagePath);

    await file.save(pdfBuffer, {
      contentType: "application/pdf",
      resumable: false,
      metadata: {
        contentType: "application/pdf",
        metadata: {
          sourceDocumentId: customMetadata?.sourceDocumentId || "",
          documentFingerprint: customMetadata?.documentFingerprint || "",
          uploadedAt: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Checks if a source PDF exists at the specified storage path.
   */
  static async exists(storagePath: string): Promise<boolean> {
    const bucket = this.getBucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    return exists;
  }

  /**
   * Downloads raw PDF buffer from Firebase Storage.
   */
  static async downloadSourcePdf(storagePath: string): Promise<Buffer> {
    const bucket = this.getBucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();
    return buffer;
  }
}
