import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeSetUserRole,
  ALLOWED_ROLES,
  maskEmail,
  maskUid,
} from "../../scripts/setUserRole";
import * as firebaseAdminModule from "../../server/firebaseAdmin";

describe("Microetapa 1.27B.1.3 — Authoritative Master Admin Provisioning", () => {
  let mockAuth: any;
  let mockDb: any;
  let mockDocRef: any;
  let mockProfileDoc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProfileDoc = {
      id: "uid_admin_12345678",
      name: "Dr. Admin Test",
      email: "test.admin@staziamed.com.br",
      role: "STUDENT",
      tier: "PRO_PLUS",
      plan: "pro_plus",
      trialStartedAt: "2026-08-01T00:00:00.000Z",
      trialEndsAt: "2026-08-08T00:00:00.000Z",
    };

    mockDocRef = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ ...mockProfileDoc }),
      }),
      update: vi.fn().mockImplementation(async (updates) => {
        Object.assign(mockProfileDoc, updates);
      }),
    };

    mockAuth = {
      getUserByEmail: vi.fn().mockResolvedValue({
        uid: "uid_admin_12345678",
        email: "test.admin@staziamed.com.br",
        emailVerified: true,
        displayName: "Dr. Admin Test",
      }),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      }),
    };

    vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue(mockAuth as any);
    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(mockDb as any);
    vi.spyOn(firebaseAdminModule, "resolveFirebaseProjectId").mockReturnValue("staziamed-revalida-prod");
  });

  describe("1. Masking & Utility Helpers", () => {
    it("should safely mask email addresses to protect PII", () => {
      expect(maskEmail("araujomendes@staziamed.com.br")).toBe("ar***@staziamed.com.br");
      expect(maskEmail("ab@test.com")).toBe("ab***@test.com");
    });

    it("should safely mask UIDs", () => {
      expect(maskUid("abcdef1234567890xyz")).toBe("abcdef...0xyz");
    });
  });

  describe("2. Parameter Validation & Role Allowlist", () => {
    it("should reject empty or missing email with INVALID_EMAIL", async () => {
      const result = await executeSetUserRole({ email: "", role: "ADMIN" });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_EMAIL");
    });

    it("should reject unallowed roles with INVALID_ROLE", async () => {
      const result = await executeSetUserRole({
        email: "test.admin@staziamed.com.br",
        role: "SUPER_ROOT_ADMIN",
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_ROLE");
      expect(result.error).toContain("must be one of: [ADMIN, EDITOR, STUDENT]");
    });

    it("should accept valid allowed roles", () => {
      expect(ALLOWED_ROLES).toContain("ADMIN");
      expect(ALLOWED_ROLES).toContain("EDITOR");
      expect(ALLOWED_ROLES).toContain("STUDENT");
    });
  });

  describe("3. Pre-Write Safety & Protection Against Wrong Accounts", () => {
    it("should fail with AUTH_USER_NOT_FOUND when user does not exist in Firebase Auth", async () => {
      mockAuth.getUserByEmail.mockRejectedValueOnce({ code: "auth/user-not-found" });

      const result = await executeSetUserRole({
        email: "nonexistent@staziamed.com.br",
        role: "ADMIN",
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("AUTH_USER_NOT_FOUND");
    });

    it("should fail with USER_PROFILE_NOT_FOUND when users/{uid} document does not exist", async () => {
      mockDocRef.get.mockResolvedValueOnce({ exists: false });

      const result = await executeSetUserRole({
        email: "test.admin@staziamed.com.br",
        role: "ADMIN",
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("USER_PROFILE_NOT_FOUND");
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it("should fail with PROFILE_EMAIL_MISMATCH when document email diverges from Auth email", async () => {
      mockProfileDoc.email = "different.email@staziamed.com.br";

      const result = await executeSetUserRole({
        email: "test.admin@staziamed.com.br",
        role: "ADMIN",
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("PROFILE_EMAIL_MISMATCH");
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });
  });

  describe("4. Authoritative Write & Invariant Preservation", () => {
    it("should execute dry run without writing changes", async () => {
      const result = await executeSetUserRole({
        email: "test.admin@staziamed.com.br",
        role: "ADMIN",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.roleBefore).toBe("STUDENT");
      expect(result.roleAfter).toBe("ADMIN");
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it("should update ONLY the role field to ADMIN and preserve tier, plan, and other fields", async () => {
      const result = await executeSetUserRole({
        email: "test.admin@staziamed.com.br",
        role: "ADMIN",
      });

      expect(result.success).toBe(true);
      expect(result.roleBefore).toBe("STUDENT");
      expect(result.roleAfter).toBe("ADMIN");
      expect(result.tierBefore).toBe("PRO_PLUS");
      expect(result.tierAfter).toBe("PRO_PLUS");
      expect(result.planBefore).toBe("pro_plus");
      expect(result.planAfter).toBe("pro_plus");

      expect(mockDocRef.update).toHaveBeenCalledWith({
        role: "ADMIN",
        updatedAt: expect.any(String),
      });

      // Confirm tier & plan were NOT modified in update payload
      const updatePayload = mockDocRef.update.mock.calls[0][0];
      expect(updatePayload.tier).toBeUndefined();
      expect(updatePayload.plan).toBeUndefined();
    });

    it("should support demoting or resetting role back to STUDENT when needed", async () => {
      mockProfileDoc.role = "ADMIN";

      const result = await executeSetUserRole({
        email: "test.admin@staziamed.com.br",
        role: "STUDENT",
      });

      expect(result.success).toBe(true);
      expect(result.roleBefore).toBe("ADMIN");
      expect(result.roleAfter).toBe("STUDENT");
    });
  });
});
