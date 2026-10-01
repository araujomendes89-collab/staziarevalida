import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  authenticateFirebaseRequest,
  requireServerRole,
} from "../../server/auth/authMiddleware";
import * as firebaseAdminModule from "../../server/firebaseAdmin";

describe("Backend Firebase Admin SDK Singleton & Authorization Middleware", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await firebaseAdminModule.resetAdminAppForTesting();
  });

  describe("1. Singleton Firebase Admin Initialization", () => {
    it("1.1. Should return same adminApp instance for getAdminAuth and getAdminDb", () => {
      const auth = firebaseAdminModule.getAdminAuth();
      const db = firebaseAdminModule.getAdminDb();

      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      const auth2 = firebaseAdminModule.getAdminAuth();
      const db2 = firebaseAdminModule.getAdminDb();

      expect(auth).toBe(auth2);
      expect(db).toBe(db2);
    });

    it("1.2. Should resolve default project ID staziamed-revalida-prod", () => {
      const projectId = firebaseAdminModule.resolveFirebaseProjectId();
      expect(projectId).toBe("staziamed-revalida-prod");
    });
  });

  describe("2. requireServerRole Middleware Invariants", () => {
    it("2.1. Should allow request when user has ADMIN role in Firestore (200 PASS)", async () => {
      const req: Partial<Request> = {
        auth: { uid: "uid_admin_001", email: "admin@staziamed.com.br", token: "tok_123" },
      };
      const res: Partial<Response> = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      // Mock getAdminDb
      const mockDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN", tier: "TRIAL", name: "Dr. Admin" }),
        }),
      };
      const mockCollection = {
        doc: vi.fn().mockReturnValue(mockDoc),
      };
      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      } as any);

      const middleware = requireServerRole("ADMIN");
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.principal?.role).toBe("ADMIN");
      expect(res.status).not.toHaveBeenCalled();
    });

    it("2.2. Should reject with 403 AUTH_FORBIDDEN when user has STUDENT role in Firestore", async () => {
      const req: Partial<Request> = {
        auth: { uid: "uid_student_002", email: "student@staziamed.com.br", token: "tok_456" },
      };
      const jsonMock = vi.fn();
      const res: Partial<Response> = {
        status: vi.fn().mockReturnValue({ json: jsonMock }),
      };
      const next: NextFunction = vi.fn();

      const mockDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "STUDENT", tier: "FREE", name: "Estudante" }),
        }),
      };
      const mockCollection = {
        doc: vi.fn().mockReturnValue(mockDoc),
      };
      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      } as any);

      const middleware = requireServerRole("ADMIN");
      await middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "AUTH_FORBIDDEN",
          }),
        })
      );
    });

    it("2.3. Should reject with 500 AUTHZ_BACKEND_UNAVAILABLE on database infrastructure error (DO NOT FALLBACK TO STUDENT)", async () => {
      const req: Partial<Request> = {
        auth: { uid: "uid_admin_001", email: "admin@staziamed.com.br", token: "tok_123" },
      };
      const jsonMock = vi.fn();
      const res: Partial<Response> = {
        status: vi.fn().mockReturnValue({ json: jsonMock }),
      };
      const next: NextFunction = vi.fn();

      // Simulate Firestore infrastructure error
      const mockDoc = {
        get: vi.fn().mockRejectedValue(new Error("FirebaseFirestoreError: invalid-credential")),
      };
      const mockCollection = {
        doc: vi.fn().mockReturnValue(mockDoc),
      };
      vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      } as any);

      const middleware = requireServerRole("ADMIN");
      await middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "AUTHZ_BACKEND_UNAVAILABLE",
          }),
        })
      );
    });

    it("2.4. Should reject with 401 AUTH_MISSING_TOKEN when authContext is missing", async () => {
      const req: Partial<Request> = {};
      const jsonMock = vi.fn();
      const res: Partial<Response> = {
        status: vi.fn().mockReturnValue({ json: jsonMock }),
      };
      const next: NextFunction = vi.fn();

      const middleware = requireServerRole("ADMIN");
      await middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "AUTH_MISSING_TOKEN",
          }),
        })
      );
    });
  });
});
