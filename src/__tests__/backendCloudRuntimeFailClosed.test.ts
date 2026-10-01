import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockApps: any[] = [];
const mockInitializeApp = vi.fn();
const mockApplicationDefault = vi.fn();
const mockGetFirestore = vi.fn();

vi.mock("firebase-admin/app", () => ({
  getApps: () => mockApps,
  initializeApp: (...args: any[]) => mockInitializeApp(...args),
  applicationDefault: (...args: any[]) => mockApplicationDefault(...args),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (...args: any[]) => mockGetFirestore(...args),
}));

import { resolveServerPort } from "../../server/config/serverPort";
import {
  getAdminApp,
  getAdminDb,
  resetAdminAppForTesting,
  resolveFirebaseProjectId,
  DEFAULT_FIREBASE_PROJECT_ID,
} from "../../server/firebaseAdmin";

describe("Backend Cloud Runtime Fail-Closed Test Suite", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockApps.length = 0;
    process.env = { ...originalEnv };
    delete process.env.PORT;
    delete process.env.FIRESTORE_DATABASE_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.FIREBASE_CONFIG_PROJECT_ID;
    await resetAdminAppForTesting();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await resetAdminAppForTesting();
  });

  describe("1. Express PORT Resolution & Validation (Cloud Run Ready)", () => {
    it("A. When PORT is undefined or empty, effective PORT is 3000", () => {
      expect(resolveServerPort(undefined)).toBe(3000);
      expect(resolveServerPort("")).toBe(3000);
      expect(resolveServerPort("   ")).toBe(3000);
    });

    it("B. When PORT is valid, provided value is respected", () => {
      expect(resolveServerPort("8080")).toBe(8080);
      expect(resolveServerPort("3000")).toBe(3000);
      expect(resolveServerPort("5000")).toBe(5000);
      expect(resolveServerPort("1")).toBe(1);
      expect(resolveServerPort("65535")).toBe(65535);
    });

    it("C. When PORT is invalid, fails explicitly with descriptive error", () => {
      expect(() => resolveServerPort("invalid")).toThrow(/Invalid PORT/);
      expect(() => resolveServerPort("0")).toThrow(/Invalid PORT/);
      expect(() => resolveServerPort("-1")).toThrow(/Invalid PORT/);
      expect(() => resolveServerPort("65536")).toThrow(/Invalid PORT/);
      expect(() => resolveServerPort("3000.5")).toThrow(/Invalid PORT/);
      expect(() => resolveServerPort("NaN")).toThrow(/Invalid PORT/);
    });
  });

  describe("2. Firebase Admin ADC Fail-Closed Initialization", () => {
    it("D. getAdminDb() uses default named database 'staziamed-revalida-prod' when FIRESTORE_DATABASE_ID is unset", () => {
      delete process.env.FIRESTORE_DATABASE_ID;

      const mockAppInstance = { name: "[DEFAULT]" };
      mockApps.push(mockAppInstance);
      mockGetFirestore.mockReturnValue({ databaseId: "staziamed-revalida-prod" });

      const db = getAdminDb();
      expect(db).toBeDefined();
      expect(mockGetFirestore).toHaveBeenCalledWith(mockAppInstance, "staziamed-revalida-prod");
    });

    it("E. getAdminDb() uses explicit value when FIRESTORE_DATABASE_ID is defined", () => {
      process.env.FIRESTORE_DATABASE_ID = "custom-test-db";

      const mockAppInstance = { name: "[DEFAULT]" };
      mockApps.push(mockAppInstance);
      mockGetFirestore.mockReturnValue({ databaseId: "custom-test-db" });

      const db = getAdminDb();
      expect(db).toBeDefined();
      expect(mockGetFirestore).toHaveBeenCalledWith(mockAppInstance, "custom-test-db");
    });

    it("F. getAdminDb() has NO fallback to getFirestore(app) without database ID", () => {
      const mockAppInstance = { name: "[DEFAULT]" };
      mockApps.push(mockAppInstance);

      mockGetFirestore.mockImplementation((_app: any, databaseId?: string) => {
        if (databaseId === "staziamed-revalida-prod") {
          throw new Error("Named database unavailable");
        }
        return { databaseId: "(default)" };
      });

      expect(() => getAdminDb()).toThrow("Named database unavailable");
      // Should only call getFirestore once with database ID, never with single argument
      expect(mockGetFirestore).toHaveBeenCalledTimes(1);
      expect(mockGetFirestore).toHaveBeenCalledWith(mockAppInstance, "staziamed-revalida-prod");
    });

    it("G. getAdminApp() has NO silent fallback when applicationDefault() fails (Fail-Closed)", () => {
      mockApps.length = 0;
      mockApplicationDefault.mockImplementation(() => {
        throw new Error("Could not load the default credentials");
      });

      expect(() => getAdminApp()).toThrow("Could not load the default credentials");
      // Must not call initializeApp with fallback without credential
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it("H. getAdminApp() initializes with applicationDefault() and canonical project ID on success", () => {
      mockApps.length = 0;
      const mockCredential = { type: "ADC_CREDENTIAL" };
      const mockAppInstance = { name: "[DEFAULT]" };
      mockApplicationDefault.mockReturnValue(mockCredential);
      mockInitializeApp.mockReturnValue(mockAppInstance);

      const app = getAdminApp();
      expect(app).toBe(mockAppInstance);
      expect(mockApplicationDefault).toHaveBeenCalled();
      expect(mockInitializeApp).toHaveBeenCalledWith({
        projectId: "staziamed-revalida-prod",
        credential: mockCredential,
      });
    });

    it("I. resolveFirebaseProjectId resolves canonical project ID", () => {
      expect(resolveFirebaseProjectId()).toBe(DEFAULT_FIREBASE_PROJECT_ID);

      process.env.GOOGLE_CLOUD_PROJECT = "custom-gcp-project";
      expect(resolveFirebaseProjectId()).toBe("custom-gcp-project");
    });
  });
});
