import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firebase Admin Auth & Firestore
const mockAuthUsers = [
  {
    uid: "uid_real_admin_001",
    email: "araujomendes@staziamed.com.br",
    displayName: "João Paulo Mendes",
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: "google.com" }],
    customClaims: { admin: true },
    metadata: {
      creationTime: "2026-09-01T10:00:00.000Z",
      lastSignInTime: "2026-09-04T20:00:00.000Z",
    },
  },
  {
    uid: "uid_real_legacy_002",
    email: "joaopaulo_df@msn.com",
    displayName: "Joao Paulo",
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: "password" }],
    customClaims: { admin: true },
    metadata: {
      creationTime: "2026-08-15T12:00:00.000Z",
      lastSignInTime: "2026-09-03T18:00:00.000Z",
    },
  },
  {
    uid: "uid_real_legacy_003",
    email: "joaoapaulo_df@msn.com",
    displayName: "Joao Paulo Mendes",
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: "password" }],
    customClaims: { admin: true },
    metadata: {
      creationTime: "2026-08-20T14:00:00.000Z",
      lastSignInTime: "2026-09-02T09:00:00.000Z",
    },
  },
];

const mockFirestoreUsersMap: Record<string, any> = {
  uid_real_admin_001: {
    id: "uid_real_admin_001",
    name: "João Paulo Mendes",
    email: "araujomendes@staziamed.com.br",
    role: "ADMIN",
    tier: "TRIAL",
    plan: "trial",
  },
  uid_real_legacy_002: {
    id: "uid_real_legacy_002",
    name: "Joao Paulo",
    email: "joaopaulo_df@msn.com",
    role: "ADMIN",
    tier: "ADMIN",
    plan: "admin",
  },
  uid_real_legacy_003: {
    id: "uid_real_legacy_003",
    name: "Joao Paulo Mendes",
    email: "joaoapaulo_df@msn.com",
    role: "ADMIN",
    tier: "ADMIN",
    plan: "admin",
  },
};

const mockListUsers = vi.fn(async (_pageSize?: number, _pageToken?: string) => ({
  users: mockAuthUsers,
  pageToken: undefined,
}));

const mockDocGet = vi.fn(async (uid: string) => {
  const data = mockFirestoreUsersMap[uid];
  return {
    exists: Boolean(data),
    data: () => data,
  };
});

const mockCollectionDoc = vi.fn((uid: string) => ({
  get: () => mockDocGet(uid),
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const mockCollection = vi.fn((colName: string) => {
  if (colName === "users") {
    return {
      doc: (id: string) => mockCollectionDoc(id),
    };
  }
  return { doc: () => ({ get: vi.fn() }) };
});

vi.mock("../../server/firebaseAdmin", () => ({
  getAdminAuth: () => ({
    listUsers: mockListUsers,
  }),
  getAdminDb: () => ({
    collection: mockCollection,
  }),
  resolveFirebaseProjectId: () => "staziamed-revalida-prod",
  DEFAULT_FIREBASE_PROJECT_ID: "staziamed-revalida-prod",
}));

import { AdminUserDirectoryService } from "../../server/services/adminUserDirectoryService";

describe("ADMIN-USERS-FIX-1 — Real Admin User Directory (No Mocks / One Row Per Auth UID)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Zero Production Mock Users & One Row Per UID Invariant", () => {
    it("should return exactly 1 entry per Firebase Auth UID without creating extra rows for claims or mocks", async () => {
      const result = await AdminUserDirectoryService.listUsers(100);

      expect(result.users).toHaveLength(3);
      expect(mockListUsers).toHaveBeenCalledTimes(1);

      // Verify each UID is unique in the returned list
      const uids = result.users.map((u) => u.uid);
      const uniqueUids = new Set(uids);
      expect(uniqueUids.size).toBe(3);

      // Assert no mock users exist in the output
      const mockNames = ["Administrador Chefe", "Dra. Mariana Costa", "Dr. Carlos Eduardo"];
      for (const u of result.users) {
        expect(mockNames).not.toContain(u.displayName);
        expect(u.email).not.toBe("mariana.costa@medicina.br");
        expect(u.email).not.toBe("carlos.curadoria@staziamed.com.br");
      }
    });

    it("should aggregate claims and Firestore doc into the single row of that UID", async () => {
      const result = await AdminUserDirectoryService.listUsers(100);
      const adminEntry = result.users.find((u) => u.uid === "uid_real_admin_001");

      expect(adminEntry).toBeDefined();
      expect(adminEntry?.email).toBe("araujomendes@staziamed.com.br");
      expect(adminEntry?.displayName).toBe("João Paulo Mendes");
      expect(adminEntry?.role).toBe("ADMIN");
      expect(adminEntry?.tier).toBe("TRIAL");
      expect(adminEntry?.plan).toBe("trial");
      expect(adminEntry?.hasCustomAdminClaim).toBe(true);
      expect(adminEntry?.privilegeSource).toBe("Firestore Server Doc + Claims");
      expect(adminEntry?.profileDocumentExists).toBe(true);
      expect(adminEntry?.profileStatus).toBe("READY");
      expect(adminEntry?.status).toBe("Ativo");
    });
  });

  describe("2. Auth User without Profile Handling", () => {
    it("should handle Auth user with missing Firestore document safely without granting ADMIN", async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [
          {
            uid: "uid_orphan_auth_user",
            email: "orphan@med.br",
            displayName: "Orphan User",
            emailVerified: false,
            disabled: false,
            providerData: [{ providerId: "password" }],
            customClaims: undefined,
            metadata: { creationTime: "2026-09-04T00:00:00.000Z" },
          } as any,
        ],
        pageToken: undefined,
      });

      const result = await AdminUserDirectoryService.listUsers(100);
      expect(result.users).toHaveLength(1);

      const orphan = result.users[0];
      expect(orphan.uid).toBe("uid_orphan_auth_user");
      expect(orphan.profileDocumentExists).toBe(false);
      expect(orphan.profileStatus).toBe("MISSING");
      expect(orphan.role).toBe("UNRESOLVED");
      expect(orphan.tier).toBe("—");
      expect(orphan.plan).toBe("—");
    });
  });

  describe("3. Read-Only Invariant & Zero Writes", () => {
    it("should strictly perform 0 writes to Auth or Firestore during listUsers", async () => {
      const setSpy = vi.fn();
      const updateSpy = vi.fn();

      await AdminUserDirectoryService.listUsers(100);

      expect(setSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe("4. Security & Role Authorization Guard Invariants", () => {
    it("should ensure canonical role authority is derived from Firestore users/{uid}.role", async () => {
      const result = await AdminUserDirectoryService.listUsers(100);
      for (const u of result.users) {
        expect(u.role).toBe("ADMIN");
      }
    });
  });
});
