import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  authenticateFirebaseRequest,
  requireServerCapability,
  requireServerRole,
  normalizeServerRole,
  normalizeServerTier,
} from "../../server/auth/authMiddleware";
import * as firebaseAdminModule from "../../server/firebaseAdmin";

describe("Server Authentication & Authorization Foundation", () => {
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

  describe("authenticateFirebaseRequest Middleware", () => {
    it("should reject request without Authorization header with 401 AUTH_MISSING_TOKEN", async () => {
      const req: any = { headers: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await authenticateFirebaseRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_MISSING_TOKEN",
          message: expect.stringContaining("Missing Authorization header"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject malformed Authorization header with 401 AUTH_INVALID_TOKEN", async () => {
      const req: any = { headers: { authorization: "Basic some_basic_token" } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await authenticateFirebaseRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_INVALID_TOKEN",
          message: expect.stringContaining("Malformed Authorization header"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject revoked token with 401 AUTH_REVOKED_TOKEN", async () => {
      const req: any = { headers: { authorization: "Bearer revoked_token_123" } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const revokedError: any = new Error("Token revoked");
      revokedError.code = "auth/id-token-revoked";
      mockAuth.verifyIdToken.mockRejectedValue(revokedError);

      await authenticateFirebaseRequest(req, res, next);

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith("revoked_token_123", true);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_REVOKED_TOKEN",
          message: expect.stringContaining("revoked"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should populate req.auth and call next() on valid token", async () => {
      const req: any = { headers: { authorization: "Bearer valid_token_456" } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: "user_alice_123",
        email: "alice@staziamed.com",
      });

      await authenticateFirebaseRequest(req, res, next);

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith("valid_token_456", true);
      expect(req.auth).toEqual({
        uid: "user_alice_123",
        email: "alice@staziamed.com",
        token: "valid_token_456",
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe("requireServerCapability & requireServerRole Middleware", () => {
    it("should reject when req.auth is missing", async () => {
      const req: any = {};
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const middleware = requireServerRole("ADMIN");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_MISSING_TOKEN",
          message: expect.stringContaining("User is not authenticated"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject with 403 AUTH_PROFILE_NOT_FOUND when user doc does not exist", async () => {
      const req: any = {
        auth: { uid: "user_ghost", token: "tok" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({ exists: false }),
      };
      mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      });

      const middleware = requireServerRole("ADMIN");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_PROFILE_NOT_FOUND",
          message: expect.stringContaining("User profile not found"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject with 403 AUTH_USER_DISABLED when user account is disabled", async () => {
      const req: any = {
        auth: { uid: "user_banned", token: "tok" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN", disabled: true }),
        }),
      };
      mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      });

      const middleware = requireServerRole("ADMIN");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_USER_DISABLED",
          message: expect.stringContaining("disabled"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject with 403 AUTH_FORBIDDEN when role is STUDENT and required is ADMIN", async () => {
      const req: any = {
        auth: { uid: "student_bob", token: "tok" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "STUDENT", tier: "PRO" }),
        }),
      };
      mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      });

      const middleware = requireServerRole("ADMIN");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_FORBIDDEN",
          message: expect.stringContaining("Insufficient privileges"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should allow request and attach ServerPrincipal when server profile has role ADMIN", async () => {
      const req: any = {
        auth: { uid: "admin_carol", email: "carol@staziamed.com", token: "tok" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN", tier: "ADMIN", name: "Carol Admin" }),
        }),
      };
      mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      });

      const middleware = requireServerRole("ADMIN");
      await middleware(req, res, next);

      expect(req.principal).toEqual({
        uid: "admin_carol",
        email: "carol@staziamed.com",
        role: "ADMIN",
        tier: "ADMIN",
        name: "Carol Admin",
        disabled: false,
      });
      expect(next).toHaveBeenCalled();
    });

    it("SECURITY: should block client role escalation attempt in request body", async () => {
      const req: any = {
        auth: { uid: "student_attacker", token: "tok" },
        body: { role: "ADMIN", tier: "ADMIN" }, // Fake escalation in payload
        headers: { "x-role": "ADMIN" }, // Fake escalation in header
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      // Database returns real profile with STUDENT role
      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "STUDENT", tier: "TRIAL" }),
        }),
      };
      mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      });

      const middleware = requireServerRole("ADMIN");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_FORBIDDEN",
          message: expect.stringContaining("Insufficient privileges"),
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("SECURITY: should block client UID spoof attempt in body", async () => {
      const req: any = {
        auth: { uid: "real_authenticated_uid", token: "tok" },
        body: { userId: "victim_admin_uid" }, // Spoofing attempt
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ role: "ADMIN", tier: "ADMIN" }),
        }),
      };
      const mockDocFn = vi.fn().mockReturnValue(mockDocRef);
      mockDb.collection.mockReturnValue({
        doc: mockDocFn,
      });

      const middleware = requireServerRole("ADMIN");
      await middleware(req, res, next);

      // Must query database using verified req.auth.uid, NEVER body.userId
      expect(mockDocFn).toHaveBeenCalledWith("real_authenticated_uid");
      expect(req.principal.uid).toBe("real_authenticated_uid");
    });
  });

  describe("Role and Tier Normalization", () => {
    it("normalizeServerRole should normalize valid roles and fallback to STUDENT", () => {
      expect(normalizeServerRole("ADMIN")).toBe("ADMIN");
      expect(normalizeServerRole("admin")).toBe("ADMIN");
      expect(normalizeServerRole("EDITOR")).toBe("EDITOR");
      expect(normalizeServerRole("editor")).toBe("EDITOR");
      expect(normalizeServerRole("STUDENT")).toBe("STUDENT");
      expect(normalizeServerRole("HACKER")).toBe("STUDENT");
      expect(normalizeServerRole(null)).toBe("STUDENT");
      expect(normalizeServerRole(undefined)).toBe("STUDENT");
    });

    it("normalizeServerTier should normalize valid tiers and fallback to TRIAL", () => {
      expect(normalizeServerTier("ADMIN")).toBe("ADMIN");
      expect(normalizeServerTier("PRO_PLUS")).toBe("PRO_PLUS");
      expect(normalizeServerTier("PRO+")).toBe("PRO_PLUS");
      expect(normalizeServerTier("PRO")).toBe("PRO");
      expect(normalizeServerTier("EXPIRED")).toBe("EXPIRED");
      expect(normalizeServerTier("FREE")).toBe("FREE");
      expect(normalizeServerTier("INVALID")).toBe("TRIAL");
      expect(normalizeServerTier(undefined)).toBe("TRIAL");
    });
  });
});
