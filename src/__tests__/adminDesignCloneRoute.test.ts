import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  authenticateFirebaseRequest,
  requireServerRole,
} from "../../server/auth/authMiddleware";
import * as firebaseAdminModule from "../../server/firebaseAdmin";
import * as playwrightRunnerModule from "../../server/designClone/playwrightRunner";

describe("Admin Design Clone Router Security & Gating (Etapa 1.27D)", () => {
  let mockAuth: any;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuth = {
      verifyIdToken: vi.fn(),
    };

    mockDb = {
      collection: vi.fn(),
    };

    vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue(mockAuth as any);
    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(mockDb as any);
  });

  it("should reject unauthenticated request with 401 AUTH_MISSING_TOKEN", async () => {
    const req: any = { headers: {} };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    await authenticateFirebaseRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "AUTH_MISSING_TOKEN" }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject student role with 403 AUTH_FORBIDDEN", async () => {
    const req: any = {
      auth: { uid: "usr-student-123", email: "student@staziamed.com.br", token: "tok" },
      headers: {},
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    mockDb.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            role: "STUDENT",
            tier: "FREE",
          }),
        }),
      }),
    });

    const adminMiddleware = requireServerRole("ADMIN");
    await adminMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "AUTH_FORBIDDEN" }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should allow ADMIN role", async () => {
    const req: any = {
      auth: { uid: "usr-admin-master", email: "araujomendes@staziamed.com.br", token: "tok" },
      headers: {},
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    mockDb.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            role: "ADMIN",
            tier: "PRO_PLUS",
          }),
        }),
      }),
    });

    const adminMiddleware = requireServerRole("ADMIN");
    await adminMiddleware(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(req.principal).toBeDefined();
    expect(req.principal.role).toBe("ADMIN");
  });
});
