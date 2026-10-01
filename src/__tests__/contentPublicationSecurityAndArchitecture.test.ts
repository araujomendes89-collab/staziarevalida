import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import { adminContentPublicationRouter } from "../../server/routes/adminContentPublication";
import { publishedContentRouter } from "../../server/routes/publishedContent";
import { ServerContentPublicationService } from "../../server/services/serverContentPublicationService";
import * as firebaseAdminModule from "../../server/firebaseAdmin";
import { StaziaEditorialDocumentDraft } from "../types/medicalEditorial";

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

describe("Content Publication Security & Architecture Test Suite", () => {
  let app: express.Express;

  const validDraft: StaziaEditorialDocumentDraft = {
    id: "doc_test_has_001",
    topic: "Hipertensão Arterial Sistêmica",
    canonicalTopicId: "top_has",
    compositionVersion: "2026.1.0",
    styleProfileId: "MEDICAL_EDITORIAL_V1",
    status: "APPROVED_FOR_PUBLICATION",
    sourceRightsType: "OFFICIAL_PUBLIC_DOCUMENT",
    pages: [
      {
        pageNumber: 1,
        blocks: [
          {
            id: "blk_1",
            type: "EDITORIAL_SUMMARY",
            semanticRole: "CORE_CONCEPT",
            content: "Definição de HAS conforme Diretriz Brasileira de 2020.",
            order: 1,
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await firebaseAdminModule.resetAdminAppForTesting();

    app = express();
    app.use(express.json());
    app.use("/api/admin/content/publication", adminContentPublicationRouter);
    app.use("/api/published-content", publishedContentRouter);
  });

  describe("1. Admin Content Publication Router Authorization Gates", () => {
    it("A. POST /api/admin/content/publication/publish without Authorization returns 401", async () => {
      const res = await makeRequest(
        app,
        "POST",
        "/api/admin/content/publication/publish",
        {
          body: { draft: validDraft, canonicalTopicId: "top_has" },
        }
      );

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTH_MISSING_TOKEN");
    });

    it("B. POST /api/admin/content/publication/publish with STUDENT role returns 403", async () => {
      // Mock verifyIdToken for student
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "student_user_123", email: "student@test.com" }),
      } as any);

      // Mock Firestore returning STUDENT profile
      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: "STUDENT", tier: "FREE", email: "student@test.com" }),
            }),
          }),
        }),
      } as any);

      const res = await makeRequest(
        app,
        "POST",
        "/api/admin/content/publication/publish",
        {
          headers: { Authorization: "Bearer valid_student_token" },
          body: { draft: validDraft, canonicalTopicId: "top_has" },
        }
      );

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("AUTH_FORBIDDEN");
    });

    it("C. POST /api/admin/content/publication/publish with ADMIN role passes authorization", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "admin_user_999", email: "admin@staziamed.com.br" }),
      } as any);

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: "ADMIN", tier: "TRIAL", email: "admin@staziamed.com.br" }),
            }),
          }),
        }),
      } as any);

      // Mock publication service
      const publishSpy = vi
        .spyOn(ServerContentPublicationService, "publishEditorialDraft")
        .mockResolvedValue({
          state: "PUBLISHED",
          canonicalTopicId: "top_has",
          versionId: "pub_top_has_v1",
          contentVersion: 1,
          publishedAt: new Date().toISOString(),
        });

      const res = await makeRequest(
        app,
        "POST",
        "/api/admin/content/publication/publish",
        {
          headers: { Authorization: "Bearer valid_admin_token" },
          body: { draft: validDraft, canonicalTopicId: "top_has" },
        }
      );

      expect(res.status).toBe(200);
      expect(res.body.state).toBe("PUBLISHED");
      expect(publishSpy).toHaveBeenCalled();
    });

    it("D. publishedBy provided maliciously in request body MUST BE IGNORED and req.principal.uid used", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "server_principal_admin_uid", email: "admin@staziamed.com.br" }),
      } as any);

      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: "ADMIN", tier: "TRIAL", email: "admin@staziamed.com.br" }),
            }),
          }),
        }),
      } as any);

      const publishSpy = vi
        .spyOn(ServerContentPublicationService, "publishEditorialDraft")
        .mockResolvedValue({
          state: "PUBLISHED",
          canonicalTopicId: "top_has",
          versionId: "pub_top_has_v1",
          contentVersion: 1,
          publishedAt: new Date().toISOString(),
        });

      await makeRequest(
        app,
        "POST",
        "/api/admin/content/publication/publish",
        {
          headers: { Authorization: "Bearer valid_admin_token" },
          body: {
            draft: validDraft,
            canonicalTopicId: "top_has",
            publishedBy: "MALICIOUS_IMPOSTOR_NAME", // Should be ignored
          },
        }
      );

      // Assert third argument passed to publishEditorialDraft is strictly req.principal.uid
      expect(publishSpy).toHaveBeenCalledWith(
        expect.anything(),
        "top_has",
        "server_principal_admin_uid"
      );
    });
  });

  describe("2. Published Content Route Segregation", () => {
    it("E. POST /api/published-content/publish MUST NOT exist (404)", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "any_user_123", email: "user@test.com" }),
      } as any);

      const res = await makeRequest(
        app,
        "POST",
        "/api/published-content/publish",
        {
          headers: { Authorization: "Bearer valid_user_token" },
          body: { draft: validDraft, canonicalTopicId: "top_has" },
        }
      );

      expect(res.status).toBe(404);
    });

    it("F. POST /api/published-content/preflight MUST NOT exist (404)", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "any_user_123", email: "user@test.com" }),
      } as any);

      const res = await makeRequest(
        app,
        "POST",
        "/api/published-content/preflight",
        {
          headers: { Authorization: "Bearer valid_user_token" },
          body: { draft: validDraft, canonicalTopicId: "top_has" },
        }
      );

      expect(res.status).toBe(404);
    });

    it("G. GET /api/published-content/:canonicalTopicId/current without Auth returns 401", async () => {
      const res = await makeRequest(
        app,
        "GET",
        "/api/published-content/top_has/current"
      );
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTH_MISSING_TOKEN");
    });

    it("H. GET /api/published-content/:canonicalTopicId/current with valid student token resolves PUBLISHED version", async () => {
      vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "student_user_123", email: "student@test.com" }),
      } as any);

      vi.spyOn(ServerContentPublicationService, "getTopicHeader").mockResolvedValue({
        canonicalTopicId: "top_has",
        currentVersionId: "pub_top_has_v1",
        currentContentVersion: 1,
        publicationStatus: "PUBLISHED",
        area: "CLINICA_MEDICA",
        specialty: "Cardiologia",
        topic: "Hipertensão Arterial Sistêmica",
        subtopics: [],
        publishedAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        totalVersions: 1,
      });

      vi.spyOn(ServerContentPublicationService, "getVersionSnapshot").mockResolvedValue({
        id: "pub_top_has_v1",
        canonicalTopicId: "top_has",
        contentVersion: 1,
        sourceEditorialDocumentId: "doc_001",
        sourceEditorialVersion: "2026.1.0",
        styleProfile: "MEDICAL_EDITORIAL_V1",
        styleProfileVersion: "2026.1.0",
        pages: [],
        blocks: [],
        rightsSnapshot: {
          rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
          sourceDocumentTitle: "HAS",
          organization: "CLINICA_MEDICA",
          year: "2026",
          verifiedAt: "2026-09-01T00:00:00.000Z",
        },
        fingerprint: "fp_123",
        publishedAt: "2026-09-01T00:00:00.000Z",
        publishedBy: "admin_uid",
        totalBlocks: 0,
      });

      const res = await makeRequest(
        app,
        "GET",
        "/api/published-content/top_has/current",
        {
          headers: { Authorization: "Bearer valid_student_token" },
        }
      );

      expect(res.status).toBe(200);
      expect(res.body.header.publicationStatus).toBe("PUBLISHED");
      expect(res.body.version.id).toBe("pub_top_has_v1");
    });
  });

  describe("3. Code Architecture & SDK Segregation Invariants", () => {
    it("I. ServerContentPublicationService does NOT import src/lib/firebase or firebase/firestore web client SDK", () => {
      const serverServicePath = path.resolve(
        __dirname,
        "../../server/services/serverContentPublicationService.ts"
      );
      const content = fs.readFileSync(serverServicePath, "utf-8");

      expect(content).not.toContain("firebase/firestore");
      expect(content).not.toContain("src/lib/firebase");
      expect(content).not.toContain("../lib/firebase");
      expect(content).toContain("getAdminDb");
    });

    it("J. AdminPublishModal does NOT call ContentPublicationService.publishEditorialDraft directly", () => {
      const modalPath = path.resolve(
        __dirname,
        "../components/admin/contentEngine/editorial/AdminPublishModal.tsx"
      );
      const content = fs.readFileSync(modalPath, "utf-8");

      expect(content).not.toContain("ContentPublicationService.publishEditorialDraft");
      expect(content).toContain("AdminContentPublicationClientService.publishEditorialDraft");
    });
  });
});
