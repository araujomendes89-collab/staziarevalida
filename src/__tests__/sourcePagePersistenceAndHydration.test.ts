import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import {
  formatPageId,
  removeUndefinedDeep,
  toPersistedNativePage,
  toPersistedOcrPage,
  toPersistedResolvedPage,
} from "../../server/contentEngine/sourcePagePersistence";
import {
  SourcePageRepository,
} from "../../server/contentEngine/sourcePageRepository";
import {
  SourceDocumentRepository,
} from "../../server/contentEngine/sourceDocumentRepository";
import { SourceDocumentHydrationService } from "../../server/contentEngine/sourceDocumentHydrationService";
import {
  adminPdfIngestionRouter,
  resetSourceDocumentsStore,
} from "../../server/routes/adminPdfIngestion";
import * as firebaseAdminModule from "../../server/firebaseAdmin";
import { ExtractedPdfPage } from "../types/pdfIngestion";
import { OcrPageResult, ResolvedSourcePage } from "../types/pdfOcr";

/**
 * Robust in-memory Firestore mock for nested collections, documents, batches and users.
 */
class InMemoryFirestoreMock {
  private store: Map<string, any> = new Map();

  constructor() {
    // Seed admin user for auth middleware
    this.store.set("users/admin_uid_777", {
      role: "ADMIN",
      tier: "TRIAL",
      email: "admin@staziamed.com.br",
    });
    this.store.set("users/admin_real_reviewer", {
      role: "ADMIN",
      tier: "TRIAL",
      email: "reviewer@staziamed.com.br",
    });
  }

  collection(collectionPath: string) {
    return {
      doc: (docId: string) => {
        const fullDocPath = `${collectionPath}/${docId}`;
        return {
          set: async (data: any, options?: { merge?: boolean }) => {
            if (options?.merge) {
              const existing = this.store.get(fullDocPath) || {};
              this.store.set(fullDocPath, { ...existing, ...data });
            } else {
              this.store.set(fullDocPath, { ...data });
            }
          },
          get: async () => {
            const data = this.store.get(fullDocPath);
            return {
              exists: Boolean(data),
              id: docId,
              data: () => (data ? { ...data } : undefined),
            };
          },
          collection: (subcollectionPath: string) => {
            const fullSubPath = `${fullDocPath}/${subcollectionPath}`;
            return {
              doc: (subDocId: string) => {
                const fullSubDocPath = `${fullSubPath}/${subDocId}`;
                return {
                  set: async (data: any, options?: { merge?: boolean }) => {
                    if (options?.merge) {
                      const existing = this.store.get(fullSubDocPath) || {};
                      this.store.set(fullSubDocPath, { ...existing, ...data });
                    } else {
                      this.store.set(fullSubDocPath, { ...data });
                    }
                  },
                  get: async () => {
                    const data = this.store.get(fullSubDocPath);
                    return {
                      exists: Boolean(data),
                      id: subDocId,
                      data: () => (data ? { ...data } : undefined),
                    };
                  },
                };
              },
              get: async () => {
                const prefix = `${fullSubPath}/`;
                const docs: any[] = [];
                for (const [key, value] of this.store.entries()) {
                  if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
                    docs.push({
                      id: key.slice(prefix.length),
                      data: () => ({ ...value }),
                    });
                  }
                }
                return {
                  docs,
                  empty: docs.length === 0,
                };
              },
            };
          },
        };
      },
      where: (field: string, op: string, val: any) => {
        return {
          limit: (n: number) => ({
            get: async () => {
              const prefix = `${collectionPath}/`;
              const docs: any[] = [];
              for (const [key, value] of this.store.entries()) {
                if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
                  if (op === "==" && value[field] === val) {
                    docs.push({
                      id: key.slice(prefix.length),
                      data: () => ({ ...value }),
                    });
                    if (docs.length >= n) break;
                  }
                }
              }
              return {
                docs,
                empty: docs.length === 0,
              };
            },
          }),
        };
      },
      get: async () => {
        const prefix = `${collectionPath}/`;
        const docs: any[] = [];
        for (const [key, value] of this.store.entries()) {
          if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
            docs.push({
              id: key.slice(prefix.length),
              data: () => ({ ...value }),
            });
          }
        }
        return {
          docs,
          empty: docs.length === 0,
        };
      },
    };
  }

  batch() {
    const operations: Array<() => Promise<void>> = [];
    return {
      set: (docRef: any, data: any, options?: { merge?: boolean }) => {
        operations.push(async () => {
          await docRef.set(data, options);
        });
      },
      commit: async () => {
        for (const op of operations) {
          await op();
        }
      },
    };
  }
}

async function makeRequest(
  app: express.Express,
  method: "GET" | "POST",
  routePath: string,
  options?: { headers?: Record<string, string>; body?: any }
) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        return reject(new Error("Unable to obtain port"));
      }
      const port = address.port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${routePath}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
        });
        const contentType = res.headers.get("content-type");
        let body: any = null;
        if (contentType && contentType.includes("application/json")) {
          body = await res.json();
        } else {
          body = await res.text();
        }
        server.close(() => {
          resolve({ status: res.status, body });
        });
      } catch (err) {
        server.close(() => {
          reject(err);
        });
      }
    });
  });
}

describe("Content Engine - Source Page Persistence & Hydration Suite", () => {
  let app: express.Express;
  let inMemoryDb: InMemoryFirestoreMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetSourceDocumentsStore();
    inMemoryDb = new InMemoryFirestoreMock();

    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(inMemoryDb as any);
    vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "valid_admin_token") {
          return { uid: "admin_uid_777", email: "admin@staziamed.com.br" };
        }
        if (token === "reviewer_admin_token") {
          return { uid: "admin_real_reviewer", email: "reviewer@staziamed.com.br" };
        }
        throw new Error("Invalid ID Token");
      }),
    } as any);

    app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use("/api/admin/content", adminPdfIngestionRouter);
  });

  describe("1. Page Formatting & Serialization Contracts", () => {
    it("A. formatPageId zero-pads page numbers to 4 digits consistently", () => {
      expect(formatPageId(1)).toBe("0001");
      expect(formatPageId(9)).toBe("0009");
      expect(formatPageId(10)).toBe("0010");
      expect(formatPageId(99)).toBe("0099");
      expect(formatPageId(100)).toBe("0100");
      expect(formatPageId(1000)).toBe("1000");
    });

    it("B. removeUndefinedDeep strips undefined properties deeply without altering null, false, 0 or arrays", () => {
      const input = {
        a: 1,
        b: undefined,
        c: null,
        d: false,
        e: 0,
        f: {
          g: undefined,
          h: "ok",
          i: [1, undefined, { j: undefined, k: "val" }],
        },
      };
      const cleaned = removeUndefinedDeep(input);
      expect(cleaned).toEqual({
        a: 1,
        c: null,
        d: false,
        e: 0,
        f: {
          h: "ok",
          i: [1, undefined, { k: "val" }],
        },
      });
      expect((cleaned as any).b).toBeUndefined();
      expect((cleaned as any).f.g).toBeUndefined();
    });

    it("C. toPersistedNativePage serializes ExtractedPdfPage without undefined values", () => {
      const page: ExtractedPdfPage = {
        documentId: "doc_123",
        pageNumber: 1,
        text: "Verbatim text from page 1",
        textCharacterCount: 26,
        hasNativeText: true,
        images: [],
        tables: [],
        width: 595,
        height: 842,
        extractionStatus: "EXTRACTED",
        ocrRequired: false,
      };

      const persisted = toPersistedNativePage(page, "doc_123");
      expect(persisted.documentId).toBe("doc_123");
      expect(persisted.pageNumber).toBe(1);
      expect(persisted.text).toBe("Verbatim text from page 1");
      expect(persisted.textCharacterCount).toBe(26);
      expect(persisted.hasNativeText).toBe(true);
      expect(persisted.width).toBe(595);
      expect(persisted.height).toBe(842);
      expect(persisted.extractionStatus).toBe("EXTRACTED");
      expect(persisted.ocrRequired).toBe(false);
    });

    it("D. toPersistedOcrPage excludes rawResponseDebug to prevent high-volume bloating in Firestore", () => {
      const ocrPage: OcrPageResult & { rawResponseDebug?: any } = {
        documentId: "doc_123",
        pageNumber: 2,
        text: "OCR recognized text",
        blocks: [
          {
            blockId: "blk_1",
            documentId: "doc_123",
            pageNumber: 2,
            text: "OCR recognized text",
            type: "PARAGRAPH",
            readingOrder: 1,
            confidence: 0.98,
          },
        ],
        tables: [],
        figures: [],
        readingOrder: [1],
        provider: "GeminiVisionOCR",
        providerVersion: "gemini-1.5-pro",
        confidence: 0.98,
        startedAt: "2026-09-04T12:00:00.000Z",
        finishedAt: "2026-09-04T12:00:02.000Z",
        rawResponseDebug: {
          hugeJsonDump: "x".repeat(50000),
          tokenCount: 4500,
        },
      };

      const persisted = toPersistedOcrPage(ocrPage, "doc_123");
      expect(persisted.pageNumber).toBe(2);
      expect(persisted.text).toBe("OCR recognized text");
      expect(persisted.blocks.length).toBe(1);
      expect(persisted.provider).toBe("GeminiVisionOCR");
      expect((persisted as any).rawResponseDebug).toBeUndefined();
    });

    it("E. toPersistedResolvedPage excludes embedded nativeExtraction and ocrExtraction", () => {
      const resolvedPage: ResolvedSourcePage = {
        documentId: "doc_123",
        pageNumber: 3,
        resolvedBlocks: [],
        resolvedText: "Reconciled text",
        resolvedTables: [],
        resolvedFigures: [],
        resolutionMethod: "OCR_PRIMARY",
        warnings: [],
        sourceCompleteness: "COMPLETE",
        manualReviewStatus: "SOURCE_APPROVED",
        nativeExtraction: {
          documentId: "doc_123",
          pageNumber: 3,
          text: "Old native text",
          textCharacterCount: 15,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        ocrExtraction: {
          documentId: "doc_123",
          pageNumber: 3,
          text: "Reconciled text",
          blocks: [],
          tables: [],
          figures: [],
          readingOrder: [],
          provider: "GeminiVisionOCR",
          startedAt: "2026-09-04T12:00:00.000Z",
          finishedAt: "2026-09-04T12:00:01.000Z",
        },
      };

      const persisted = toPersistedResolvedPage(resolvedPage, "doc_123");
      expect(persisted.pageNumber).toBe(3);
      expect(persisted.resolvedText).toBe("Reconciled text");
      expect(persisted.manualReviewStatus).toBe("SOURCE_APPROVED");
      expect((persisted as any).nativeExtraction).toBeUndefined();
      expect((persisted as any).ocrExtraction).toBeUndefined();
    });
  });

  describe("2. SourcePageRepository Subcollection Operations", () => {
    const docId = "doc_repo_test_001";

    it("A. saves and lists native pages ordered by pageNumber", async () => {
      const pages: ExtractedPdfPage[] = [
        {
          documentId: docId,
          pageNumber: 2,
          text: "Page 2 native text",
          textCharacterCount: 18,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
        {
          documentId: docId,
          pageNumber: 1,
          text: "Page 1 native text",
          textCharacterCount: 18,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
        },
      ];

      await SourcePageRepository.saveNativePages(docId, pages);

      const retrieved = await SourcePageRepository.listNativePages(docId);
      expect(retrieved.length).toBe(2);
      expect(retrieved[0].pageNumber).toBe(1);
      expect(retrieved[1].pageNumber).toBe(2);
      expect(retrieved[0].text).toBe("Page 1 native text");

      const single = await SourcePageRepository.getNativePage(docId, 1);
      expect(single).not.toBeNull();
      expect(single?.pageNumber).toBe(1);
    });

    it("B. saves and retrieves OCR pages", async () => {
      const ocrPage: OcrPageResult = {
        documentId: docId,
        pageNumber: 1,
        text: "OCR text 1",
        blocks: [],
        tables: [],
        figures: [],
        readingOrder: [1],
        provider: "GeminiVisionOCR",
        startedAt: "2026-09-04T12:00:00.000Z",
        finishedAt: "2026-09-04T12:00:01.000Z",
      };

      await SourcePageRepository.saveOcrPage(docId, ocrPage);

      const retrieved = await SourcePageRepository.getOcrPage(docId, 1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.text).toBe("OCR text 1");

      const list = await SourcePageRepository.listOcrPages(docId);
      expect(list.length).toBe(1);
      expect(list[0].pageNumber).toBe(1);
    });

    it("C. saves and retrieves resolved pages", async () => {
      const resolvedPage: ResolvedSourcePage = {
        documentId: docId,
        pageNumber: 1,
        resolvedBlocks: [],
        resolvedText: "Final resolved text",
        resolvedTables: [],
        resolvedFigures: [],
        resolutionMethod: "OCR_PRIMARY",
        warnings: [],
        sourceCompleteness: "COMPLETE",
      };

      await SourcePageRepository.saveResolvedPage(docId, resolvedPage);

      const retrieved = await SourcePageRepository.getResolvedPage(docId, 1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.resolvedText).toBe("Final resolved text");

      const list = await SourcePageRepository.listResolvedPages(docId);
      expect(list.length).toBe(1);
    });
  });

  describe("3. SourceDocumentHydrationService Reconstruction", () => {
    it("A. returns null if document metadata does not exist", async () => {
      const doc = await SourceDocumentHydrationService.hydrateSourceDocument("non_existent_doc");
      expect(doc).toBeNull();
    });

    it("B. hydrates full SourceDocument reconstructing extractedDocument and resolvedPages with native/ocr links", async () => {
      const docId = "doc_hydrate_001";

      // 1. Save metadata with nativeExtractionSummary
      await SourceDocumentRepository.save({
        id: docId,
        title: "Manual de Terapia Intensiva",
        fileName: "uti.pdf",
        mimeType: "application/pdf",
        sizeBytes: 204800,
        pageCount: 2,
        documentFingerprint: "sha256_uti_hash",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "MIXED_PDF",
        status: "SOURCE_COMPLETED",
        storagePath: `content-engine/source-documents/${docId}/source.pdf`,
        createdBy: "admin_uid",
        createdAt: "2026-09-04T10:00:00.000Z",
        updatedAt: "2026-09-04T10:05:00.000Z",
        nativeExtractionSummary: {
          pageCount: 2,
          contentMode: "MIXED_PDF",
          totalCharacterCount: 1500,
          imageCount: 1,
          tableCount: 0,
          pagesRequiringOcr: 1,
          engineName: "StaziaNativePdfExtractor",
          engineVersion: "1.0.0",
          startedAt: "2026-09-04T10:00:00.000Z",
          finishedAt: "2026-09-04T10:00:02.000Z",
        },
      });

      // 2. Save Native pages
      await SourcePageRepository.saveNativePages(docId, [
        {
          documentId: docId,
          pageNumber: 1,
          text: "Native text on page 1",
          textCharacterCount: 21,
          hasNativeText: true,
          images: [],
          tables: [],
          extractionStatus: "EXTRACTED",
          ocrRequired: false,
        },
        {
          documentId: docId,
          pageNumber: 2,
          text: "",
          textCharacterCount: 0,
          hasNativeText: false,
          images: [],
          tables: [],
          extractionStatus: "OCR_REQUIRED",
          ocrRequired: true,
        },
      ]);

      // 3. Save OCR page for page 2
      await SourcePageRepository.saveOcrPage(docId, {
        documentId: docId,
        pageNumber: 2,
        text: "OCR recovered text for page 2",
        blocks: [],
        tables: [],
        figures: [],
        readingOrder: [1],
        provider: "GeminiVisionOCR",
        startedAt: "2026-09-04T10:01:00.000Z",
        finishedAt: "2026-09-04T10:01:02.000Z",
      });

      // 4. Save Resolved pages
      await SourcePageRepository.saveResolvedPages(docId, [
        {
          documentId: docId,
          pageNumber: 1,
          resolvedBlocks: [],
          resolvedText: "Native text on page 1",
          resolvedTables: [],
          resolvedFigures: [],
          resolutionMethod: "NATIVE_ONLY",
          warnings: [],
          sourceCompleteness: "COMPLETE",
        },
        {
          documentId: docId,
          pageNumber: 2,
          resolvedBlocks: [],
          resolvedText: "OCR recovered text for page 2",
          resolvedTables: [],
          resolvedFigures: [],
          resolutionMethod: "OCR_PRIMARY",
          warnings: [],
          sourceCompleteness: "COMPLETE",
        },
      ]);

      // 5. Perform Hydration
      const hydrated = await SourceDocumentHydrationService.hydrateSourceDocument(docId);
      expect(hydrated).not.toBeNull();
      expect(hydrated?.id).toBe(docId);
      expect(hydrated?.title).toBe("Manual de Terapia Intensiva");
      expect(hydrated?.extractedDocument).toBeDefined();
      expect(hydrated?.extractedDocument?.pages.length).toBe(2);
      expect(hydrated?.extractedDocument?.pages[0].text).toBe("Native text on page 1");
      expect(hydrated?.extractedDocument?.pages[1].ocrRequired).toBe(true);

      expect(hydrated?.resolvedPages).toBeDefined();
      expect(hydrated?.resolvedPages?.length).toBe(2);

      // Page 1 joined with nativeExtraction
      expect(hydrated?.resolvedPages?.[0].nativeExtraction).toBeDefined();
      expect(hydrated?.resolvedPages?.[0].nativeExtraction?.pageNumber).toBe(1);

      // Page 2 joined with ocrExtraction
      expect(hydrated?.resolvedPages?.[1].ocrExtraction).toBeDefined();
      expect(hydrated?.resolvedPages?.[1].ocrExtraction?.pageNumber).toBe(2);
      expect(hydrated?.resolvedPages?.[1].ocrExtraction?.text).toBe("OCR recovered text for page 2");
    });
  });

  describe("4. End-to-End Pipeline Resilience Across Cold Restarts", () => {
    it("A. GET /source-documents/:id reconstructs document when RAM store is empty", async () => {
      const docId = "doc_cold_001";
      await SourceDocumentRepository.save({
        id: docId,
        title: "Cold Doc",
        fileName: "cold.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5000,
        pageCount: 1,
        documentFingerprint: "sha256_cold",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "TEXT_PDF",
        status: "EXTRACTED",
        storagePath: `content-engine/source-documents/${docId}/source.pdf`,
        createdBy: "admin_uid_777",
        createdAt: "2026-09-04T11:00:00.000Z",
        updatedAt: "2026-09-04T11:00:00.000Z",
      });
      await SourcePageRepository.saveNativePage(docId, {
        documentId: docId,
        pageNumber: 1,
        text: "Cold restart page 1 text",
        textCharacterCount: 24,
        hasNativeText: true,
        images: [],
        tables: [],
        extractionStatus: "EXTRACTED",
      });

      // Clear memory cache
      resetSourceDocumentsStore();

      const authHeaders = {
        Authorization: "Bearer valid_admin_token",
      };

      const res = await makeRequest(app, "GET", `/api/admin/content/source-documents/${docId}`, {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.document.id).toBe(docId);
      expect(res.body.document.extractedDocument.pages[0].text).toBe("Cold restart page 1 text");
    });

    it("B. POST /source-documents/:id/manual-review works after RAM wipe and persists edit to subcollection", async () => {
      const docId = "doc_manual_review_001";

      await SourceDocumentRepository.save({
        id: docId,
        title: "Manual Review Test",
        fileName: "review.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5000,
        pageCount: 1,
        documentFingerprint: "sha256_review",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "TEXT_PDF",
        status: "SOURCE_REVIEW_REQUIRED",
        storagePath: `content-engine/source-documents/${docId}/source.pdf`,
        createdBy: "admin_uid_777",
        createdAt: "2026-09-04T11:00:00.000Z",
        updatedAt: "2026-09-04T11:00:00.000Z",
      });

      await SourcePageRepository.saveResolvedPage(docId, {
        documentId: docId,
        pageNumber: 1,
        resolvedBlocks: [],
        resolvedText: "Text with typo here",
        resolvedTables: [],
        resolvedFigures: [],
        resolutionMethod: "OCR_PRIMARY",
        warnings: ["LOW_CONFIDENCE"],
        sourceCompleteness: "REVIEW_REQUIRED",
      });

      // Clear RAM cache completely
      resetSourceDocumentsStore();

      const authHeaders = {
        Authorization: "Bearer reviewer_admin_token",
      };

      const reviewRes = await makeRequest(
        app,
        "POST",
        `/api/admin/content/source-documents/${docId}/manual-review`,
        {
          headers: authHeaders,
          body: {
            pageNumber: 1,
            action: "NEEDS_MANUAL_CORRECTION",
            editedText: "Corrected clinical guidelines text",
            note: "Fixed OCR typo in dosage",
          },
        }
      );

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.success).toBe(true);
      expect(reviewRes.body.updatedPage.resolvedText).toBe("Corrected clinical guidelines text");
      expect(reviewRes.body.updatedPage.manualEdit.editedBy).toBe("admin_real_reviewer");

      // Verify directly from Firestore subcollection that page was updated
      const persistedPage = await SourcePageRepository.getResolvedPage(docId, 1);
      expect(persistedPage).not.toBeNull();
      expect(persistedPage?.resolvedText).toBe("Corrected clinical guidelines text");
      expect(persistedPage?.manualEdit?.editedBy).toBe("admin_real_reviewer");
      expect(persistedPage?.manualEdit?.originalExtraction).toBe("Text with typo here");
    });

    it("C. POST /source-documents/:id/manual-review fails closed if principal UID is missing or token is invalid", async () => {
      const docId = "doc_auth_check_001";

      await SourceDocumentRepository.save({
        id: docId,
        title: "Auth Check",
        fileName: "auth.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5000,
        pageCount: 1,
        documentFingerprint: "sha256_auth",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "TEXT_PDF",
        status: "SOURCE_REVIEW_REQUIRED",
        storagePath: `content-engine/source-documents/${docId}/source.pdf`,
        createdBy: "admin_uid_777",
        createdAt: "2026-09-04T11:00:00.000Z",
        updatedAt: "2026-09-04T11:00:00.000Z",
      });

      await SourcePageRepository.saveResolvedPage(docId, {
        documentId: docId,
        pageNumber: 1,
        resolvedBlocks: [],
        resolvedText: "Text",
        resolvedTables: [],
        resolvedFigures: [],
        resolutionMethod: "NATIVE_ONLY",
        warnings: [],
        sourceCompleteness: "REVIEW_REQUIRED",
      });

      // Clear memory cache
      resetSourceDocumentsStore();

      // Missing principal / invalid token
      const res = await makeRequest(
        app,
        "POST",
        `/api/admin/content/source-documents/${docId}/manual-review`,
        {
          headers: {
            Authorization: "Bearer invalid_empty_token",
          },
          body: {
            pageNumber: 1,
            action: "SOURCE_APPROVED",
          },
        }
      );

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("AUTH_INVALID_TOKEN");
    });
  });
});
