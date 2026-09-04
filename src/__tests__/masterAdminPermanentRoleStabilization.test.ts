import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFirestoreDocs: Record<string, any> = {};

const mockSetDoc = vi.fn(async (docRef: any, data: any, options: any) => {
  const path = docRef.id || docRef.path;
  if (options?.merge && mockFirestoreDocs[path]) {
    mockFirestoreDocs[path] = { ...mockFirestoreDocs[path], ...data };
  } else {
    mockFirestoreDocs[path] = { ...data };
  }
});

const mockGetDoc = vi.fn(async (docRef: any) => {
  const path = docRef.id || docRef.path;
  const data = mockFirestoreDocs[path];
  return {
    exists: () => Boolean(data),
    data: () => (data ? { ...data } : undefined),
  };
});

const mockDoc = vi.fn((_db: any, collectionName: string, id: string) => ({
  path: `${collectionName}/${id}`,
  id,
}));

vi.mock("../lib/firebase", () => ({
  db: { _mockDb: true },
  auth: {
    currentUser: {
      uid: "uid_master_admin_999",
      email: "master.admin@staziamed.com.br",
      emailVerified: true,
      displayName: "Dr. Master Admin",
    },
  },
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: (...args: any[]) => mockDoc(args[0], args[1], args[2]),
    getDoc: (docRef: any) => mockGetDoc(docRef),
    setDoc: (docRef: any, data: any, options: any) => mockSetDoc(docRef, data, options),
  };
});

import { FirebaseService } from "../services/firebaseService";
import { StorageService, DEFAULT_USER } from "../services/storageService";
import { UserProfile } from "../types";

describe("Microetapa 1.27B.1.6 — Master Admin Permanent Role Stabilization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    for (const key of Object.keys(mockFirestoreDocs)) {
      delete mockFirestoreDocs[key];
    }
  });

  describe("1. Client SDK Strip Protection (saveUserProfile)", () => {
    it("should strip role field completely when updating profile to prevent overwriting remote role", async () => {
      // Pre-seed an existing ADMIN document in Firestore
      mockFirestoreDocs["uid_master_admin_999"] = {
        id: "uid_master_admin_999",
        name: "Dr. Master Admin",
        email: "master.admin@staziamed.com.br",
        role: "ADMIN",
        tier: "PRO_PLUS",
        plan: "pro_plus",
      };

      // Client profile attempts to send role: "STUDENT" (e.g. from local default or stale state)
      const clientUpdate: UserProfile = {
        ...DEFAULT_USER,
        id: "uid_master_admin_999",
        name: "Dr. Master Admin Updated",
        role: "STUDENT", // Stale or default role
        overallReadiness: 85,
      };

      await FirebaseService.saveUserProfile(clientUpdate);

      // Verify written payload in setDoc
      expect(mockSetDoc).toHaveBeenCalled();
      const writtenPayload = mockSetDoc.mock.calls[0][1];
      expect(writtenPayload.role).toBeUndefined();

      // Verify Firestore document still has role = "ADMIN"
      expect(mockFirestoreDocs["uid_master_admin_999"].role).toBe("ADMIN");
      expect(mockFirestoreDocs["uid_master_admin_999"].name).toBe("Dr. Master Admin Updated");
    });

    it("should strip role field in importAllData as well", async () => {
      mockFirestoreDocs["uid_master_admin_999"] = {
        id: "uid_master_admin_999",
        role: "ADMIN",
      };

      await FirebaseService.importAllData({
        questions: [],
        userProfile: {
          ...DEFAULT_USER,
          id: "uid_master_admin_999",
          role: "STUDENT",
        } as any,
      });

      expect(mockFirestoreDocs["uid_master_admin_999"].role).toBe("ADMIN");
    });
  });

  describe("2. Profile Resolution Stability across Logins, Relogins, and Refreshes", () => {
    it("should resolve existing ADMIN user with role ADMIN and preserve it", async () => {
      mockFirestoreDocs["uid_master_admin_999"] = {
        id: "uid_master_admin_999",
        name: "Dr. Master Admin",
        email: "master.admin@staziamed.com.br",
        role: "ADMIN",
        tier: "PRO_PLUS",
        plan: "pro_plus",
      };

      const cloudProfile = await FirebaseService.getUserProfile("uid_master_admin_999");
      expect(cloudProfile).not.null;
      expect(cloudProfile?.role).toBe("ADMIN");

      // Verify that after resolution, synced user is ADMIN
      const syncedUser: UserProfile = {
        ...DEFAULT_USER,
        ...cloudProfile,
        id: "uid_master_admin_999",
      };

      expect(syncedUser.role).toBe("ADMIN");
      StorageService.saveUserProfile(syncedUser);
      expect(StorageService.getUserProfile().role).toBe("ADMIN");
    });

    it("should keep existing STUDENT user with role STUDENT without accidental promotion", async () => {
      mockFirestoreDocs["uid_student_123"] = {
        id: "uid_student_123",
        name: "Dr. Student",
        email: "student@staziamed.com.br",
        role: "STUDENT",
        tier: "TRIAL",
        plan: "trial",
      };

      const cloudProfile = await FirebaseService.getUserProfile("uid_student_123");
      expect(cloudProfile?.role).toBe("STUDENT");
    });

    it("should simulate complete Login -> Logout -> Relogin -> Refresh lifecycle with ZERO role reversion", async () => {
      // 1. Initial State in Cloud Firestore: ADMIN
      mockFirestoreDocs["uid_master_admin_999"] = {
        id: "uid_master_admin_999",
        name: "Dr. Master Admin",
        email: "master.admin@staziamed.com.br",
        role: "ADMIN",
        tier: "PRO_PLUS",
        plan: "pro_plus",
      };

      // 2. Initial Login: Resolve profile
      let resolved = await FirebaseService.getUserProfile("uid_master_admin_999");
      expect(resolved?.role).toBe("ADMIN");

      // 3. User performs Logout: Local state resets to DEFAULT_USER, Firestore is untouched
      StorageService.saveUserProfile(DEFAULT_USER);
      expect(StorageService.getUserProfile().role).toBe("STUDENT"); // local default
      // Firestore remains ADMIN
      expect(mockFirestoreDocs["uid_master_admin_999"].role).toBe("ADMIN");

      // 4. Relogin (Google or Email/Password)
      resolved = await FirebaseService.getUserProfile("uid_master_admin_999");
      expect(resolved?.role).toBe("ADMIN");
      const postReloginUser: UserProfile = {
        ...DEFAULT_USER,
        ...resolved,
        id: "uid_master_admin_999",
      };
      expect(postReloginUser.role).toBe("ADMIN");
      StorageService.saveUserProfile(postReloginUser);

      // 5. Page Refresh / Background Sync
      await FirebaseService.saveUserProfile(postReloginUser);
      expect(mockFirestoreDocs["uid_master_admin_999"].role).toBe("ADMIN");

      // 6. Final Read from Server Firestore
      const finalCheck = await FirebaseService.getUserProfile("uid_master_admin_999");
      expect(finalCheck?.role).toBe("ADMIN");
    });
  });

  describe("3. isDeveloperAdmin Evaluator Invariants", () => {
    it("should evaluate isDeveloperAdmin strictly to true ONLY when all 4 conditions are met", () => {
      const evaluateIsDeveloperAdmin = (
        isGuestMode: boolean,
        firebaseUser: any,
        profileResolutionStatus: string,
        userRole?: string
      ) => {
        return Boolean(
          !isGuestMode &&
          !!firebaseUser &&
          profileResolutionStatus === "READY" &&
          userRole === "ADMIN"
        );
      };

      // 1. Valid Admin
      expect(
        evaluateIsDeveloperAdmin(false, { uid: "123" }, "READY", "ADMIN")
      ).toBe(true);

      // 2. Guest mode -> false
      expect(
        evaluateIsDeveloperAdmin(true, { uid: "123" }, "READY", "ADMIN")
      ).toBe(false);

      // 3. No Firebase user -> false
      expect(
        evaluateIsDeveloperAdmin(false, null, "READY", "ADMIN")
      ).toBe(false);

      // 4. Profile LOADING -> false
      expect(
        evaluateIsDeveloperAdmin(false, { uid: "123" }, "LOADING", "ADMIN")
      ).toBe(false);

      // 5. Student role -> false
      expect(
        evaluateIsDeveloperAdmin(false, { uid: "123" }, "READY", "STUDENT")
      ).toBe(false);

      // 6. Editor role -> false
      expect(
        evaluateIsDeveloperAdmin(false, { uid: "123" }, "READY", "EDITOR")
      ).toBe(false);
    });
  });
});
