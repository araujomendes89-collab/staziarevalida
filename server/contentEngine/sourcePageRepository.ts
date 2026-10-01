import { getAdminDb } from "../firebaseAdmin";
import { SOURCE_DOCUMENTS_COLLECTION } from "./sourceDocumentRepository";
import {
  formatPageId,
  PersistedNativePage,
  PersistedOcrPage,
  PersistedResolvedPage,
  toPersistedNativePage,
  toPersistedOcrPage,
  toPersistedResolvedPage,
} from "./sourcePagePersistence";
import { ExtractedPdfPage } from "../../src/types/pdfIngestion";
import { OcrPageResult, ResolvedSourcePage } from "../../src/types/pdfOcr";

export const NATIVE_PAGES_SUBCOLLECTION = "nativePages";
export const OCR_PAGES_SUBCOLLECTION = "ocrPages";
export const RESOLVED_PAGES_SUBCOLLECTION = "resolvedPages";

const BATCH_CHUNK_SIZE = 400;

export class SourcePageRepository {
  // ---------------------------------------------------------------------------
  // NATIVE PAGES
  // ---------------------------------------------------------------------------

  static async saveNativePage(documentId: string, page: ExtractedPdfPage): Promise<void> {
    const db = getAdminDb();
    const cleanPage = toPersistedNativePage(page, documentId);
    const pageId = formatPageId(cleanPage.pageNumber);
    await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(NATIVE_PAGES_SUBCOLLECTION)
      .doc(pageId)
      .set(cleanPage);
  }

  static async saveNativePages(documentId: string, pages: ExtractedPdfPage[]): Promise<void> {
    if (!pages || pages.length === 0) return;
    const db = getAdminDb();

    for (let i = 0; i < pages.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pages.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const page of chunk) {
        const cleanPage = toPersistedNativePage(page, documentId);
        const pageId = formatPageId(cleanPage.pageNumber);
        const docRef = db
          .collection(SOURCE_DOCUMENTS_COLLECTION)
          .doc(documentId)
          .collection(NATIVE_PAGES_SUBCOLLECTION)
          .doc(pageId);
        batch.set(docRef, cleanPage);
      }
      await batch.commit();
    }
  }

  static async getNativePage(documentId: string, pageNumber: number): Promise<PersistedNativePage | null> {
    const db = getAdminDb();
    const pageId = formatPageId(pageNumber);
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(NATIVE_PAGES_SUBCOLLECTION)
      .doc(pageId)
      .get();

    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedNativePage;
  }

  static async listNativePages(documentId: string): Promise<PersistedNativePage[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(NATIVE_PAGES_SUBCOLLECTION)
      .get();

    const pages = snapshot.docs.map((d) => d.data() as PersistedNativePage);
    return pages.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  // ---------------------------------------------------------------------------
  // OCR PAGES
  // ---------------------------------------------------------------------------

  static async saveOcrPage(documentId: string, page: OcrPageResult): Promise<void> {
    const db = getAdminDb();
    const cleanPage = toPersistedOcrPage(page, documentId);
    const pageId = formatPageId(cleanPage.pageNumber);
    await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(OCR_PAGES_SUBCOLLECTION)
      .doc(pageId)
      .set(cleanPage);
  }

  static async saveOcrPages(documentId: string, pages: OcrPageResult[]): Promise<void> {
    if (!pages || pages.length === 0) return;
    const db = getAdminDb();

    for (let i = 0; i < pages.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pages.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const page of chunk) {
        const cleanPage = toPersistedOcrPage(page, documentId);
        const pageId = formatPageId(cleanPage.pageNumber);
        const docRef = db
          .collection(SOURCE_DOCUMENTS_COLLECTION)
          .doc(documentId)
          .collection(OCR_PAGES_SUBCOLLECTION)
          .doc(pageId);
        batch.set(docRef, cleanPage);
      }
      await batch.commit();
    }
  }

  static async getOcrPage(documentId: string, pageNumber: number): Promise<PersistedOcrPage | null> {
    const db = getAdminDb();
    const pageId = formatPageId(pageNumber);
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(OCR_PAGES_SUBCOLLECTION)
      .doc(pageId)
      .get();

    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedOcrPage;
  }

  static async listOcrPages(documentId: string): Promise<PersistedOcrPage[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(OCR_PAGES_SUBCOLLECTION)
      .get();

    const pages = snapshot.docs.map((d) => d.data() as PersistedOcrPage);
    return pages.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  // ---------------------------------------------------------------------------
  // RESOLVED PAGES
  // ---------------------------------------------------------------------------

  static async saveResolvedPage(documentId: string, page: ResolvedSourcePage): Promise<void> {
    const db = getAdminDb();
    const cleanPage = toPersistedResolvedPage(page, documentId);
    const pageId = formatPageId(cleanPage.pageNumber);
    await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(RESOLVED_PAGES_SUBCOLLECTION)
      .doc(pageId)
      .set(cleanPage);
  }

  static async saveResolvedPages(documentId: string, pages: ResolvedSourcePage[]): Promise<void> {
    if (!pages || pages.length === 0) return;
    const db = getAdminDb();

    for (let i = 0; i < pages.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pages.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const page of chunk) {
        const cleanPage = toPersistedResolvedPage(page, documentId);
        const pageId = formatPageId(cleanPage.pageNumber);
        const docRef = db
          .collection(SOURCE_DOCUMENTS_COLLECTION)
          .doc(documentId)
          .collection(RESOLVED_PAGES_SUBCOLLECTION)
          .doc(pageId);
        batch.set(docRef, cleanPage);
      }
      await batch.commit();
    }
  }

  static async getResolvedPage(documentId: string, pageNumber: number): Promise<PersistedResolvedPage | null> {
    const db = getAdminDb();
    const pageId = formatPageId(pageNumber);
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(RESOLVED_PAGES_SUBCOLLECTION)
      .doc(pageId)
      .get();

    if (!snapshot.exists) return null;
    return snapshot.data() as PersistedResolvedPage;
  }

  static async listResolvedPages(documentId: string): Promise<PersistedResolvedPage[]> {
    const db = getAdminDb();
    const snapshot = await db
      .collection(SOURCE_DOCUMENTS_COLLECTION)
      .doc(documentId)
      .collection(RESOLVED_PAGES_SUBCOLLECTION)
      .get();

    const pages = snapshot.docs.map((d) => d.data() as PersistedResolvedPage);
    return pages.sort((a, b) => a.pageNumber - b.pageNumber);
  }
}
