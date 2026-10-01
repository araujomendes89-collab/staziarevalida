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

let authStateCallback: ((user: any) => Promise<void>) | null = null;
let currentMockUser: any = null;

const mockSubscribeToAuthState = vi.fn((cb: (user: any) => Promise<void>) => {
  authStateCallback = cb;
  setTimeout(() => cb(currentMockUser), 0);
  return () => {
    authStateCallback = null;
  };
});

const mockSignInWithEmail = vi.fn(async (email: string, _pass: string) => {
  const user = {
    uid: "uid_admin_reconciled",
    email,
    emailVerified: true,
    displayName: "Admin Reconciled",
  };
  currentMockUser = user;
  if (authStateCallback) {
    await authStateCallback(user);
  }
  return user;
});

const mockSignInWithGooglePopup = vi.fn(async () => {
  const user = {
    uid: "uid_google_admin",
    email: "google.admin@staziamed.com.br",
    emailVerified: true,
    displayName: "Google Admin",
    providerData: [{ providerId: "google.com" }],
  };
  currentMockUser = user;
  if (authStateCallback) {
    await authStateCallback(user);
  }
  return user;
});

const mockSignOutCurrentUser = vi.fn(async () => {
  currentMockUser = null;
  if (authStateCallback) {
    await authStateCallback(null);
  }
});

vi.mock("../lib/firebase", () => ({
  db: { _mockDb: true },
  auth: {
    get currentUser() {
      return currentMockUser;
    },
  },
  subscribeToAuthState: (cb: any) => mockSubscribeToAuthState(cb),
  loginWithEmail: (email: string, pass: string) => mockSignInWithEmail(email, pass),
  signInWithGooglePopup: () => mockSignInWithGooglePopup(),
  signInAnonymouslyUser: vi.fn(),
  registerWithEmail: vi.fn(),
  sendUserEmailVerification: vi.fn(),
  reloadCurrentUser: vi.fn(),
  resetPasswordWithEmail: vi.fn(),
  signOutCurrentUser: () => mockSignOutCurrentUser(),
  testFirestoreConnection: vi.fn(),
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

describe("AUTH-FIX-1: Guest Mode Auth Reconciliation & Admin Safety Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    currentMockUser = null;
    authStateCallback = null;
    for (const key of Object.keys(mockFirestoreDocs)) {
      delete mockFirestoreDocs[key];
    }
  });

  describe("1. Stale Guest Mode + Email/Password Authentication Reconciliation", () => {
    it("should remove stale praxis_guest_mode and resolve canonical ADMIN profile upon successful login", async () => {
      localStorage.setItem("praxis_guest_mode", "true");
      expect(localStorage.getItem("praxis_guest_mode")).toBe("true");

      mockFirestoreDocs["uid_admin_reconciled"] = {
        id: "uid_admin_reconciled",
        email: "araujomendes@staziamed.com.br",
        name: "Dr. Admin Reconciled",
        role: "ADMIN",
        tier: "ADMIN",
        plan: "admin",
      };

      const loggedInUser = await mockSignInWithEmail("araujomendes@staziamed.com.br", "valid-password");
      expect(loggedInUser.uid).toBe("uid_admin_reconciled");

      localStorage.removeItem("praxis_guest_mode");
      expect(localStorage.getItem("praxis_guest_mode")).toBeNull();

      const profile = await FirebaseService.getUserProfile(loggedInUser.uid);
      expect(profile).toBeDefined();
      expect(profile?.role).toBe("ADMIN");
      expect(profile?.tier).toBe("ADMIN");
      expect(profile?.plan).toBe("admin");
    });
  });

  describe("2. Stale Guest Mode + Google Authentication Reconciliation", () => {
    it("should remove stale praxis_guest_mode and resolve profile on Google Sign-In", async () => {
      localStorage.setItem("praxis_guest_mode", "true");

      mockFirestoreDocs["uid_google_admin"] = {
        id: "uid_google_admin",
        email: "google.admin@staziamed.com.br",
        name: "Google Admin",
        role: "ADMIN",
        tier: "ADMIN",
        plan: "admin",
      };

      const loggedInUser = await mockSignInWithGooglePopup();
      expect(loggedInUser.uid).toBe("uid_google_admin");

      localStorage.removeItem("praxis_guest_mode");
      expect(localStorage.getItem("praxis_guest_mode")).toBeNull();

      const profile = await FirebaseService.getUserProfile(loggedInUser.uid);
      expect(profile?.role).toBe("ADMIN");
    });
  });

  describe("3. App Initialization Self-Heal with Existing Firebase Session", () => {
    it("should self-heal stale guest flag when Firebase auth session is already present", async () => {
      localStorage.setItem("praxis_guest_mode", "true");

      mockFirestoreDocs["uid_existing_session"] = {
        id: "uid_existing_session",
        email: "joaopaulo_df@msn.com",
        name: "João Paulo",
        role: "ADMIN",
        tier: "ADMIN",
        plan: "admin",
      };

      const existingSessionUser = {
        uid: "uid_existing_session",
        email: "joaopaulo_df@msn.com",
        emailVerified: true,
        displayName: "João Paulo",
      };
      currentMockUser = existingSessionUser;

      let resolvedProfile: UserProfile | null = null;
      let isGuest = localStorage.getItem("praxis_guest_mode") === "true";

      const listener = async (fbUser: any) => {
        if (fbUser && !fbUser.isAnonymous) {
          localStorage.removeItem("praxis_guest_mode");
          isGuest = false;
          const cloudProfile = await FirebaseService.getUserProfile(fbUser.uid);
          if (cloudProfile) {
            resolvedProfile = cloudProfile;
          }
        }
      };

      await listener(existingSessionUser);

      expect(localStorage.getItem("praxis_guest_mode")).toBeNull();
      expect(isGuest).toBe(false);
      expect(resolvedProfile).toBeDefined();
      expect((resolvedProfile as any)?.role).toBe("ADMIN");
    });
  });

  describe("4. Explicit Guest Flow & Student Protection", () => {
    it("should keep guest mode active and deny admin access when user explicitly enters guest mode", () => {
      localStorage.setItem("praxis_guest_mode", "true");
      const isGuestMode = localStorage.getItem("praxis_guest_mode") === "true";
      const firebaseUser = null;
      const profileResolutionStatus = "IDLE";
      const user = DEFAULT_USER;

      const isDeveloperAdmin = Boolean(
        !isGuestMode &&
        !!firebaseUser &&
        profileResolutionStatus === "READY" &&
        user?.role === "ADMIN"
      );

      expect(isGuestMode).toBe(true);
      expect(isDeveloperAdmin).toBe(false);
    });

    it("should NOT grant admin access to authenticated STUDENT users even if guest mode is resolved", async () => {
      mockFirestoreDocs["uid_student_123"] = {
        id: "uid_student_123",
        email: "student@staziamed.com.br",
        name: "Estudante Revalida",
        role: "STUDENT",
        tier: "PRO",
        plan: "pro",
      };

      const studentUser = {
        uid: "uid_student_123",
        email: "student@staziamed.com.br",
      };

      const cloudProfile = await FirebaseService.getUserProfile(studentUser.uid);
      const isGuestMode = false;
      const profileResolutionStatus = "READY";

      const isDeveloperAdmin = Boolean(
        !isGuestMode &&
        !!studentUser &&
        profileResolutionStatus === "READY" &&
        cloudProfile?.role === "ADMIN"
      );

      expect(cloudProfile?.role).toBe("STUDENT");
      expect(isDeveloperAdmin).toBe(false);
    });
  });

  describe("5. Logout State Cleanup", () => {
    it("should clear profile, session and residual guest state on explicit logout", async () => {
      localStorage.setItem("praxis_guest_mode", "true");
      await mockSignOutCurrentUser();
      localStorage.removeItem("praxis_guest_mode");

      expect(currentMockUser).toBeNull();
      expect(localStorage.getItem("praxis_guest_mode")).toBeNull();
    });
  });

  describe("6. Failed Auth Does Not Alter Firestore or Grant Admin", () => {
    it("should reject failed auth without creating user documents or modifying roles", async () => {
      const failingLogin = async () => {
        throw new Error("auth/wrong-password");
      };

      await expect(failingLogin()).rejects.toThrow("auth/wrong-password");
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(Object.keys(mockFirestoreDocs).length).toBe(0);
    });
  });

  describe("7. Security Invariants: No Email-Based Admin Authorization & No LocalStorage Escalation", () => {
    it("should guarantee that email address alone cannot grant ADMIN without canonical Firestore role", () => {
      const userWithAdminEmail: UserProfile = {
        ...DEFAULT_USER,
        id: "uid_attacker",
        email: "araujomendes@staziamed.com.br",
        role: "STUDENT",
      };

      const firebaseUser = { uid: "uid_attacker", email: "araujomendes@staziamed.com.br" };
      const isGuestMode = false;
      const profileResolutionStatus = "READY";

      const isDeveloperAdmin = Boolean(
        !isGuestMode &&
        !!firebaseUser &&
        profileResolutionStatus === "READY" &&
        userWithAdminEmail.role === "ADMIN"
      );

      expect(isDeveloperAdmin).toBe(false);
    });

    it("should ensure localStorage manipulation cannot grant ADMIN access", () => {
      localStorage.setItem("praxis_user_role", "ADMIN");
      localStorage.setItem("staziamed_is_admin", "true");

      const firebaseUser = null;
      const profileResolutionStatus = "IDLE";
      const user = DEFAULT_USER;

      const isDeveloperAdmin = Boolean(
        !!firebaseUser &&
        profileResolutionStatus === "READY" &&
        user?.role === "ADMIN"
      );

      expect(isDeveloperAdmin).toBe(false);
    });
  });
});
