import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import {
  toPersistedSourceDocumentMetadata,
  PersistedSourceDocumentMetadata,
} from "../../server/contentEngine/sourceDocumentPersistence";
import {
  SourceDocumentRepository,
  SOURCE_DOCUMENTS_COLLECTION,
} from "../../server/contentEngine/sourceDocumentRepository";
import { SourcePageRepository } from "../../server/contentEngine/sourcePageRepository";
import {
  SourcePdfStorageService,
  CANONICAL_STORAGE_BUCKET,
} from "../../server/contentEngine/sourcePdfStorageService";
import {
  adminPdfIngestionRouter,
  resetSourceDocumentsStore,
} from "../../server/routes/adminPdfIngestion";
import * as firebaseAdminModule from "../../server/firebaseAdmin";
import { SourceDocument } from "../types/pdfIngestion";

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

describe("Source Document Persistent Firestore & Storage Pipeline", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetSourceDocumentsStore();
    await firebaseAdminModule.resetAdminAppForTesting();

    vi.spyOn(SourcePageRepository, "saveNativePage").mockResolvedValue();
    vi.spyOn(SourcePageRepository, "saveNativePages").mockResolvedValue();
    vi.spyOn(SourcePageRepository, "getNativePage").mockResolvedValue(null);
    vi.spyOn(SourcePageRepository, "listNativePages").mockResolvedValue([]);
    vi.spyOn(SourcePageRepository, "saveOcrPage").mockResolvedValue();
    vi.spyOn(SourcePageRepository, "saveOcrPages").mockResolvedValue();
    vi.spyOn(SourcePageRepository, "getOcrPage").mockResolvedValue(null);
    vi.spyOn(SourcePageRepository, "listOcrPages").mockResolvedValue([]);
    vi.spyOn(SourcePageRepository, "saveResolvedPage").mockResolvedValue();
    vi.spyOn(SourcePageRepository, "saveResolvedPages").mockResolvedValue();
    vi.spyOn(SourcePageRepository, "getResolvedPage").mockResolvedValue(null);
    vi.spyOn(SourcePageRepository, "listResolvedPages").mockResolvedValue([]);

    app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use("/api/admin/content", adminPdfIngestionRouter);
  });

  describe("1. Metadata Persistence Contract & Sanitization", () => {
    it("A. toPersistedSourceDocumentMetadata removes extractedDocument, resolvedPages, structuredContents, segmentationResult", () => {
      const largeDoc: SourceDocument = {
        id: "doc_large_001",
        title: "Diretriz de HAS 2026",
        fileName: "has.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1048576,
        pageCount: 45,
        documentFingerprint: "sha256_fake_fingerprint",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "TEXT_PDF",
        status: "EXTRACTED",
        storagePath: "content-engine/source-documents/doc_large_001/source.pdf",
        createdBy: "admin_uid",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        extractedDocument: {
          documentId: "doc_large_001",
          pageCount: 45,
          contentMode: "TEXT_PDF",
          pages: [],
          totalCharacterCount: 50000,
          imageCount: 10,
          tableCount: 5,
          pagesRequiringOcr: 0,
          engineName: "StaziaNative",
          engineVersion: "1.0",
          startedAt: "2026-09-01T00:00:00.000Z",
          finishedAt: "2026-09-01T00:00:00.000Z",
        },
        resolvedPages: [{ pageNumber: 1, resolvedText: "Huge text", resolutionMethod: "NATIVE_PRIMARY", sourceCompleteness: "COMPLETE", manualReviewStatus: "UNREVIEWED" }],
        structuredContents: [{ id: "sc_1", documentId: "doc_large_001", areaId: "CLINICA_MEDICA", topicId: "has", pageRange: [1, 10], blocks: [], summary: "Summary", createdAt: "2026-09-01T00:00:00.000Z", status: "RAW_SEGMENTED", confirmedCanonical: false, approvedStructure: false }],
        segmentationResult: { documentId: "doc_large_001", segments: [], structuredContents: [], totalPages: 45, totalSegments: 1, areasFoundSummary: ["CLINICA_MEDICA"], segmentedAt: "2026-09-01T00:00:00.000Z" },
      };

      const persisted = toPersistedSourceDocumentMetadata(largeDoc);

      expect((persisted as any).extractedDocument).toBeUndefined();
      expect((persisted as any).resolvedPages).toBeUndefined();
      expect((persisted as any).structuredContents).toBeUndefined();
      expect((persisted as any).segmentationResult).toBeUndefined();
      expect(persisted.id).toBe("doc_large_001");
      expect(persisted.title).toBe("Diretriz de HAS 2026");
      expect(persisted.storagePath).toBe("content-engine/source-documents/doc_large_001/source.pdf");
    });
  });

  describe("2. Source Document Firestore Repository Invariants", () => {
    it("B. SourceDocumentRepository uses collection 'sourceDocuments'", () => {
      expect(SOURCE_DOCUMENTS_COLLECTION).toBe("sourceDocuments");
    });

    it("C. SourceDocumentRepository uses getAdminDb() and never imports client SDK", () => {
      const repoPath = path.resolve(__dirname, "../../server/contentEngine/sourceDocumentRepository.ts");
      const content = fs.readFileSync(repoPath, "utf-8");

      expect(content).toContain("getAdminDb");
      expect(content).not.toContain("firebase/firestore");
      expect(content).not.toContain("src/lib/firebase");
    });

    it("D. SourceDocumentRepository.findByFingerprint executes where query on Firestore", async () => {
      const mockDocData: PersistedSourceDocumentMetadata = {
        id: "doc_existing_123",
        title: "Diretriz Existente",
        fileName: "diretriz.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        pageCount: 5,
        documentFingerprint: "fingerprint_abc",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "TEXT_PDF",
        status: "EXTRACTED",
        storagePath: "content-engine/source-documents/doc_existing_123/source.pdf",
        createdBy: "admin_uid",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };

      const mockGet = vi.fn().mockResolvedValue({
        empty: false,
        docs: [{ data: () => mockDocData }],
      });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: mockCollection,
      } as any);

      const found = await SourceDocumentRepository.findByFingerprint("fingerprint_abc");

      expect(mockCollection).toHaveBeenCalledWith("sourceDocuments");
      expect(mockWhere).toHaveBeenCalledWith("documentFingerprint", "==", "fingerprint_abc");
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(found).toEqual(mockDocData);
    });
  });

  describe("3. Source PDF Storage Service Invariants", () => {
    it("E. Canonical storage bucket and path structure", () => {
      expect(CANONICAL_STORAGE_BUCKET).toBe("staziamed-revalida-prod.firebasestorage.app");
    });

    it("F. Storage upload configures contentType: application/pdf without making public", () => {
      const storageServicePath = path.resolve(
        __dirname,
        "../../server/contentEngine/sourcePdfStorageService.ts"
      );
      const content = fs.readFileSync(storageServicePath, "utf-8");

      expect(content).toContain('contentType: "application/pdf"');
      expect(content).not.toContain("makePublic");
      expect(content).not.toContain("getSignedUrl");
    });
  });

  describe("4. Route Ingestion, Listing, Retrieval, and Fail-Closed OCR", () => {
    const validMinimalPdfBase64 = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources <<>> >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n180\n%%EOF"
    ).toString("base64");

    it("H & I. POST /api/admin/content/pdf-ingest persists PDF to Storage and metadata to Firestore", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "admin_uid_777", email: "admin@staziamed.com.br" }),
      } as any);

      const mockUserDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN", tier: "TRIAL", email: "admin@staziamed.com.br" }),
        }),
      };

      const mockDbSet = vi.fn().mockResolvedValue({});
      const mockDocRef = vi.fn().mockReturnValue({ set: mockDbSet, get: vi.fn() });
      const mockCollection = vi.fn((colName: string) => {
        if (colName === "users") return { doc: vi.fn().mockReturnValue(mockUserDoc) };
        return {
          doc: mockDocRef,
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) }) }),
        };
      });

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: mockCollection,
      } as any);

      const storageUploadSpy = vi.spyOn(SourcePdfStorageService, "uploadSourcePdf").mockResolvedValue();

      const res = await makeRequest(
        app,
        "POST",
        "/api/admin/content/pdf-ingest",
        {
          headers: { Authorization: "Bearer valid_admin_token" },
          body: {
            title: "Tratado de Pediatria 2026",
            fileName: "pediatria.pdf",
            base64Pdf: validMinimalPdfBase64,
            sourceType: "APOSTILA",
            rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
          },
        }
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.sourceDocument.createdBy).toBe("admin_uid_777");
      expect(storageUploadSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^content-engine\/source-documents\/src_doc_/),
        expect.any(Buffer),
        expect.objectContaining({ sourceDocumentId: expect.any(String) })
      );
      expect(mockDbSet).toHaveBeenCalled();
    });

    it("J. GET /api/admin/content/source-documents reads from Firestore repository even without RAM cache", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "admin_uid_777" }),
      } as any);

      const mockUserDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN" }),
        }),
      };

      const mockPersistedDoc: PersistedSourceDocumentMetadata = {
        id: "src_doc_persisted_999",
        title: "Protocolo Clínico",
        fileName: "pcdt.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5000,
        pageCount: 12,
        documentFingerprint: "sha_persisted_999",
        sourceType: "PCDT",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "TEXT_PDF",
        status: "EXTRACTED",
        storagePath: "content-engine/source-documents/src_doc_persisted_999/source.pdf",
        createdBy: "admin_uid",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };

      vi.spyOn(SourceDocumentRepository, "list").mockResolvedValue([mockPersistedDoc]);

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockUserDoc) }),
      } as any);

      const res = await makeRequest(
        app,
        "GET",
        "/api/admin/content/source-documents",
        {
          headers: { Authorization: "Bearer valid_admin_token" },
        }
      );

      expect(res.status).toBe(200);
      expect(res.body.totalCount).toBe(1);
      expect(res.body.documents[0].id).toBe("src_doc_persisted_999");
    });

    it("K. GET /api/admin/content/source-documents/:id finds document via Firestore repository", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "admin_uid_777" }),
      } as any);

      const mockUserDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN" }),
        }),
      };

      const mockPersistedDoc: PersistedSourceDocumentMetadata = {
        id: "src_doc_persisted_888",
        title: "Diretriz SBC 2026",
        fileName: "sbc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2000,
        pageCount: 20,
        documentFingerprint: "sha_sbc",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "TEXT_PDF",
        status: "EXTRACTED",
        storagePath: "content-engine/source-documents/src_doc_persisted_888/source.pdf",
        createdBy: "admin_uid",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };

      vi.spyOn(SourceDocumentRepository, "getById").mockResolvedValue(mockPersistedDoc);

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockUserDoc) }),
      } as any);

      const res = await makeRequest(
        app,
        "GET",
        "/api/admin/content/source-documents/src_doc_persisted_888",
        {
          headers: { Authorization: "Bearer valid_admin_token" },
        }
      );

      expect(res.status).toBe(200);
      expect(res.body.document.id).toBe("src_doc_persisted_888");
      expect(res.body.document.title).toBe("Diretriz SBC 2026");
    });

    it("L & O. OCR loads PDF from Storage when RAM cache is empty and updates status in Firestore", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "admin_uid_777" }),
      } as any);

      const mockUserDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN" }),
        }),
      };

      const mockPersistedDoc: PersistedSourceDocumentMetadata = {
        id: "src_doc_ocr_123",
        title: "Documento para OCR",
        fileName: "scan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        pageCount: 1,
        documentFingerprint: "sha_ocr_123",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "SCANNED_PDF",
        status: "OCR_REQUIRED",
        storagePath: "content-engine/source-documents/src_doc_ocr_123/source.pdf",
        createdBy: "admin_uid",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };

      vi.spyOn(SourceDocumentRepository, "getById").mockResolvedValue(mockPersistedDoc);
      const updateSpy = vi.spyOn(SourceDocumentRepository, "update").mockResolvedValue();
      const storageExistsSpy = vi.spyOn(SourcePdfStorageService, "exists").mockResolvedValue(true);
      const storageDownloadSpy = vi
        .spyOn(SourcePdfStorageService, "downloadSourcePdf")
        .mockResolvedValue(Buffer.from(validMinimalPdfBase64, "base64"));

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockUserDoc) }),
      } as any);

      const res = await makeRequest(
        app,
        "POST",
        "/api/admin/content/ocr/start-job",
        {
          headers: { Authorization: "Bearer valid_admin_token" },
          body: { documentId: "src_doc_ocr_123" },
        }
      );

      expect(res.status).toBe(200);
      expect(storageExistsSpy).toHaveBeenCalledWith("content-engine/source-documents/src_doc_ocr_123/source.pdf");
      expect(storageDownloadSpy).toHaveBeenCalledWith("content-engine/source-documents/src_doc_ocr_123/source.pdf");
      expect(updateSpy).toHaveBeenCalledWith(
        "src_doc_ocr_123",
        expect.objectContaining({ status: "OCR_PROCESSING" })
      );
    });

    it("M & N. OCR fails with 404 SOURCE_PDF_NOT_FOUND if PDF is missing in Storage and RAM (synthetic fallback eliminated)", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "admin_uid_777" }),
      } as any);

      const mockUserDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN" }),
        }),
      };

      const mockPersistedDoc: PersistedSourceDocumentMetadata = {
        id: "src_doc_missing_pdf",
        title: "Doc sem arquivo",
        fileName: "missing.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        pageCount: 1,
        documentFingerprint: "sha_missing",
        sourceType: "DIRETRIZ",
        rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
        contentMode: "SCANNED_PDF",
        status: "OCR_REQUIRED",
        storagePath: "content-engine/source-documents/src_doc_missing_pdf/source.pdf",
        createdBy: "admin_uid",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };

      vi.spyOn(SourceDocumentRepository, "getById").mockResolvedValue(mockPersistedDoc);
      vi.spyOn(SourceDocumentRepository, "update").mockResolvedValue();
      vi.spyOn(SourcePdfStorageService, "exists").mockResolvedValue(false);

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockUserDoc) }),
      } as any);

      const res = await makeRequest(
        app,
        "POST",
        "/api/admin/content/ocr/start-job",
        {
          headers: { Authorization: "Bearer valid_admin_token" },
          body: { documentId: "src_doc_missing_pdf" },
        }
      );

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("SOURCE_PDF_NOT_FOUND");
    });
  });
});
