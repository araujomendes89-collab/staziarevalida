import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OnboardingPersistenceService,
} from "../services/onboardingPersistenceService";
import {
  validateOnboardingPersonalization,
  VALID_PREPARATION_STAGES,
  VALID_DAILY_AVAILABILITIES,
  VALID_WEEK_DAYS,
  VALID_CANONICAL_AREAS,
  VALID_EXAM_INTENTS,
} from "../services/onboardingValidator";
import {
  CURRENT_ONBOARDING_VERSION,
  CURRENT_PERSONALIZATION_VERSION,
} from "../types/onboarding";

// In-memory mock Firestore store
interface MockUserDoc {
  id: string;
  role?: string;
  tier?: string;
  plan?: string;
  onboarding?: {
    version: number;
    status: string;
    startedAt?: string;
    completedAt?: string;
    currentSection?: string;
  };
  onboardingPersonalization?: any;
  isOnboardingCompleted?: boolean;
}

let mockDbStore: Record<string, MockUserDoc> = {};
let mockTransactionUpdates: Record<string, any>[] = [];

// Mock firebase/firestore module for unit testing persistence
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: (_db: any, collectionName: string, docId: string) => ({
      path: `${collectionName}/${docId}`,
      id: docId,
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const docData = mockDbStore[docRef.id];
      return {
        exists: () => Boolean(docData),
        data: () => (docData ? { ...docData } : undefined),
      };
    }),
    runTransaction: vi.fn(async (_db: any, updateFunction: (transaction: any) => Promise<any>) => {
      const mockTransaction = {
        get: vi.fn(async (docRef: any) => {
          const docData = mockDbStore[docRef.id];
          return {
            exists: () => Boolean(docData),
            data: () => (docData ? { ...docData } : undefined),
          };
        }),
        update: vi.fn((docRef: any, updates: Record<string, any>) => {
          mockTransactionUpdates.push({ docId: docRef.id, updates });
          if (mockDbStore[docRef.id]) {
            const current = mockDbStore[docRef.id];
            // Apply field-path updates
            for (const [key, val] of Object.entries(updates)) {
              if (key.startsWith("onboarding.")) {
                const subKey = key.replace("onboarding.", "");
                current.onboarding = {
                  ...(current.onboarding as any),
                  [subKey]: val,
                };
              } else {
                (current as any)[key] = val;
              }
            }
          }
        }),
        set: vi.fn(),
      };
      return await updateFunction(mockTransaction);
    }),
  };
});

describe("1.26C — Onboarding Persistence Foundation & Validation", () => {
  const validPayload = {
    preparationStage: "COMECO",
    dailyStudyAvailability: "1_A_2H",
    studyDays: ["SEG", "QUA", "SEX"],
    variableRoutine: false,
    selfReportedWeakAreas: ["CLINICA_MEDICA", "PEDIATRIA"],
    dontKnowWeakAreas: false,
    examIntent: "PROXIMA",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbStore = {};
    mockTransactionUpdates = [];
  });

  /* ------------------------------------------------------------- */
  /* 1. RUNTIME VALIDATION TESTS                                    */
  /* ------------------------------------------------------------- */
  describe("1. Runtime Personalization Validator", () => {
    it("should validate and sanitize a valid standard payload", () => {
      const res = validateOnboardingPersonalization(validPayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.version).toBe(CURRENT_PERSONALIZATION_VERSION);
        expect(res.data.preparationStage).toBe("COMECO");
        expect(res.data.studyDays).toEqual(["SEG", "QUA", "SEX"]);
        expect(res.data.variableRoutine).toBe(false);
        expect(res.data.selfReportedWeakAreas).toEqual(["CLINICA_MEDICA", "PEDIATRIA"]);
        expect(res.data.dontKnowWeakAreas).toBe(false);
        expect(res.data.savedAt).toBeDefined();
      }
    });

    it("should validate payload with variableRoutine=true and empty studyDays", () => {
      const payload = {
        ...validPayload,
        variableRoutine: true,
        studyDays: [],
      };
      const res = validateOnboardingPersonalization(payload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.variableRoutine).toBe(true);
        expect(res.data.studyDays).toEqual([]);
      }
    });

    it("should validate payload with dontKnowWeakAreas=true and empty selfReportedWeakAreas", () => {
      const payload = {
        ...validPayload,
        dontKnowWeakAreas: true,
        selfReportedWeakAreas: [],
      };
      const res = validateOnboardingPersonalization(payload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.dontKnowWeakAreas).toBe(true);
        expect(res.data.selfReportedWeakAreas).toEqual([]);
      }
    });

    it("should reject non-object or null payloads", () => {
      expect(validateOnboardingPersonalization(null).success).toBe(false);
      expect(validateOnboardingPersonalization(undefined).success).toBe(false);
      expect(validateOnboardingPersonalization("string").success).toBe(false);
      expect(validateOnboardingPersonalization([]).success).toBe(false);
    });

    it("should reject invalid preparationStage", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        preparationStage: "INVALID_STAGE",
      });
      expect(res.success).toBe(false);
    });

    it("should reject invalid dailyStudyAvailability", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        dailyStudyAvailability: "INVALID_HOURS",
      });
      expect(res.success).toBe(false);
    });

    it("should reject invalid examIntent", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        examIntent: "INVALID_INTENT",
      });
      expect(res.success).toBe(false);
    });

    it("should reject invalid weak areas", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        selfReportedWeakAreas: ["DERMATOLOGIA_INVALIDA"],
      });
      expect(res.success).toBe(false);
    });

    it("should reject variableRoutine=true with non-empty studyDays", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        variableRoutine: true,
        studyDays: ["SEG"],
      });
      expect(res.success).toBe(false);
    });

    it("should reject variableRoutine=false with empty studyDays", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        variableRoutine: false,
        studyDays: [],
      });
      expect(res.success).toBe(false);
    });

    it("should reject dontKnowWeakAreas=true with non-empty weak areas", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        dontKnowWeakAreas: true,
        selfReportedWeakAreas: ["CLINICA_MEDICA"],
      });
      expect(res.success).toBe(false);
    });

    it("should reject dontKnowWeakAreas=false with empty weak areas", () => {
      const res = validateOnboardingPersonalization({
        ...validPayload,
        dontKnowWeakAreas: false,
        selfReportedWeakAreas: [],
      });
      expect(res.success).toBe(false);
    });

    it("SECURITY: should reject payload containing privileged fields like role or tier", () => {
      const privilegedPayload = {
        ...validPayload,
        role: "ADMIN",
        tier: "PRO_PLUS",
        plan: "pro_plus",
        subscriptionExpiresAt: "2099-01-01",
      };
      const res = validateOnboardingPersonalization(privilegedPayload);
      expect(res.success).toBe(false);
    });
  });

  /* ------------------------------------------------------------- */
  /* 2. BEGIN ONBOARDING TESTS                                      */
  /* ------------------------------------------------------------- */
  describe("2. Begin Onboarding (REQUIRED -> IN_PROGRESS)", () => {
    it("should transition REQUIRED user to IN_PROGRESS and record startedAt", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "REQUIRED",
        },
      };

      const result = await OnboardingPersistenceService.beginOnboarding("user-1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.status).toBe("IN_PROGRESS");
        expect(result.startedAt).toBeDefined();
        expect(result.isNewTransition).toBe(true);
      }

      const updated = mockDbStore["user-1"];
      expect(updated.onboarding?.status).toBe("IN_PROGRESS");
      expect(updated.onboarding?.startedAt).toBeDefined();
      expect(updated.onboarding?.currentSection).toBe("WELCOME");
    });

    it("IDEMPOTENCY: should be idempotent when already IN_PROGRESS and preserve original startedAt", async () => {
      const originalStartedAt = "2026-09-01T10:00:00.000Z";
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
          startedAt: originalStartedAt,
          currentSection: "EXPERIENCE",
        },
      };

      const result = await OnboardingPersistenceService.beginOnboarding("user-1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.status).toBe("IN_PROGRESS");
        expect(result.startedAt).toBe(originalStartedAt);
        expect(result.isNewTransition).toBe(false);
      }

      // No updates made
      expect(mockTransactionUpdates).toHaveLength(0);
      expect(mockDbStore["user-1"].onboarding?.startedAt).toBe(originalStartedAt);
    });

    it("should not re-open COMPLETED onboarding", async () => {
      const originalCompletedAt = "2026-09-02T12:00:00.000Z";
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "COMPLETED",
          startedAt: "2026-09-01T10:00:00.000Z",
          completedAt: originalCompletedAt,
        },
      };

      const result = await OnboardingPersistenceService.beginOnboarding("user-1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.status).toBe("COMPLETED");
        expect(result.isNewTransition).toBe(false);
      }
      expect(mockTransactionUpdates).toHaveLength(0);
    });

    it("should reject begin for legacy users without onboarding field", async () => {
      mockDbStore["user-legacy"] = {
        id: "user-legacy",
        role: "STUDENT",
        tier: "TRIAL",
      };

      const result = await OnboardingPersistenceService.beginOnboarding("user-legacy");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("NOT_REQUIRED");
      }
      expect(mockTransactionUpdates).toHaveLength(0);
    });

    it("should reject begin for ADMIN role", async () => {
      mockDbStore["user-admin"] = {
        id: "user-admin",
        role: "ADMIN",
        tier: "ADMIN",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "REQUIRED",
        },
      };

      const result = await OnboardingPersistenceService.beginOnboarding("user-admin");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("ADMIN_BYPASS");
      }
      expect(mockTransactionUpdates).toHaveLength(0);
    });

    it("VERSION MISMATCH: should reject begin if stored version != current version", async () => {
      mockDbStore["user-v2"] = {
        id: "user-v2",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: 99,
          status: "REQUIRED",
        },
      };

      const result = await OnboardingPersistenceService.beginOnboarding("user-v2");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("VERSION_MISMATCH");
      }
      expect(mockTransactionUpdates).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------- */
  /* 3. CHECKPOINT & PERSONALIZATION PERSISTENCE TESTS              */
  /* ------------------------------------------------------------- */
  describe("3. Save Personalization Checkpoint", () => {
    it("should atomically persist personalization and advance currentSection to PROGRESS_PREVIEW when IN_PROGRESS", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
          startedAt: "2026-09-01T10:00:00.000Z",
          currentSection: "PERSONALIZE",
        },
      };

      const result = await OnboardingPersistenceService.saveOnboardingPersonalization(
        "user-1",
        validPayload
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.currentSection).toBe("PROGRESS_PREVIEW");
        expect(result.personalization.preparationStage).toBe("COMECO");
      }

      const updated = mockDbStore["user-1"];
      expect(updated.onboarding?.currentSection).toBe("PROGRESS_PREVIEW");
      expect(updated.onboardingPersonalization).toBeDefined();
      expect(updated.onboardingPersonalization.version).toBe(CURRENT_PERSONALIZATION_VERSION);
      expect(updated.onboardingPersonalization.preparationStage).toBe("COMECO");
    });

    it("should reject checkpoint when user status is REQUIRED (not begun)", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "REQUIRED",
        },
      };

      const result = await OnboardingPersistenceService.saveOnboardingPersonalization(
        "user-1",
        validPayload
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("NOT_IN_PROGRESS");
      }
      expect(mockDbStore["user-1"].onboardingPersonalization).toBeUndefined();
    });

    it("should reject invalid payload before calling transaction", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
        },
      };

      const invalidPayload = { ...validPayload, preparationStage: "INVALID" };
      const result = await OnboardingPersistenceService.saveOnboardingPersonalization(
        "user-1",
        invalidPayload
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_PAYLOAD");
      }
      expect(mockTransactionUpdates).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------- */
  /* 4. COMPLETE ONBOARDING TESTS                                   */
  /* ------------------------------------------------------------- */
  describe("4. Complete Onboarding (IN_PROGRESS -> COMPLETED)", () => {
    it("should complete onboarding when IN_PROGRESS and valid personalization is persisted", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
          startedAt: "2026-09-01T10:00:00.000Z",
          currentSection: "PROGRESS_PREVIEW",
        },
        onboardingPersonalization: {
          version: CURRENT_PERSONALIZATION_VERSION,
          preparationStage: "COMECO",
          dailyStudyAvailability: "1_A_2H",
          studyDays: ["SEG"],
          variableRoutine: false,
          selfReportedWeakAreas: ["CLINICA_MEDICA"],
          dontKnowWeakAreas: false,
          examIntent: "PROXIMA",
          savedAt: "2026-09-01T10:05:00.000Z",
        },
      };

      const result = await OnboardingPersistenceService.completeOnboarding("user-1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.status).toBe("COMPLETED");
        expect(result.completedAt).toBeDefined();
        expect(result.isNewTransition).toBe(true);
      }

      const updated = mockDbStore["user-1"];
      expect(updated.onboarding?.status).toBe("COMPLETED");
      expect(updated.onboarding?.completedAt).toBeDefined();
      expect(updated.onboarding?.currentSection).toBe("FINISH");
      // Confirm isOnboardingCompleted was NOT written
      expect(updated.isOnboardingCompleted).toBeUndefined();
    });

    it("DIRECT FINISH PROTECTION: should reject completion if personalization was never saved", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
          startedAt: "2026-09-01T10:00:00.000Z",
          currentSection: "WELCOME",
        },
        // Missing onboardingPersonalization!
      };

      const result = await OnboardingPersistenceService.completeOnboarding("user-1");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("MISSING_PERSONALIZATION");
      }
      expect(mockDbStore["user-1"].onboarding?.status).toBe("IN_PROGRESS");
    });

    it("DIRECT FINISH PROTECTION: should reject completion if persisted personalization is malformed", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
          startedAt: "2026-09-01T10:00:00.000Z",
        },
        onboardingPersonalization: {
          // Corrupted / missing required fields
          preparationStage: "INVALID",
        },
      };

      const result = await OnboardingPersistenceService.completeOnboarding("user-1");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_PERSONALIZATION");
      }
      expect(mockDbStore["user-1"].onboarding?.status).toBe("IN_PROGRESS");
    });

    it("IDEMPOTENCY: calling completeOnboarding on already COMPLETED user preserves completedAt", async () => {
      const originalCompletedAt = "2026-09-01T10:10:00.000Z";
      mockDbStore["user-1"] = {
        id: "user-1",
        role: "STUDENT",
        tier: "TRIAL",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "COMPLETED",
          startedAt: "2026-09-01T10:00:00.000Z",
          completedAt: originalCompletedAt,
          currentSection: "FINISH",
        },
        onboardingPersonalization: {
          version: CURRENT_PERSONALIZATION_VERSION,
          preparationStage: "COMECO",
          dailyStudyAvailability: "1_A_2H",
          studyDays: ["SEG"],
          variableRoutine: false,
          selfReportedWeakAreas: ["CLINICA_MEDICA"],
          dontKnowWeakAreas: false,
          examIntent: "PROXIMA",
          savedAt: "2026-09-01T10:05:00.000Z",
        },
      };

      const result = await OnboardingPersistenceService.completeOnboarding("user-1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.status).toBe("COMPLETED");
        expect(result.completedAt).toBe(originalCompletedAt);
        expect(result.isNewTransition).toBe(false);
      }
      expect(mockTransactionUpdates).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------- */
  /* 5. GET ONBOARDING STATE HELPER TESTS                           */
  /* ------------------------------------------------------------- */
  describe("5. Get Onboarding State Helper", () => {
    it("should retrieve stored onboarding and personalization state", async () => {
      mockDbStore["user-1"] = {
        id: "user-1",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
          startedAt: "2026-09-01T10:00:00.000Z",
        },
        onboardingPersonalization: {
          version: CURRENT_PERSONALIZATION_VERSION,
          preparationStage: "COMECO",
          dailyStudyAvailability: "1_A_2H",
          studyDays: ["SEG"],
          variableRoutine: false,
          selfReportedWeakAreas: ["CLINICA_MEDICA"],
          dontKnowWeakAreas: false,
          examIntent: "PROXIMA",
          savedAt: "2026-09-01T10:05:00.000Z",
        },
      };

      const state = await OnboardingPersistenceService.getOnboardingState("user-1");
      expect(state.onboarding?.status).toBe("IN_PROGRESS");
      expect(state.personalization?.preparationStage).toBe("COMECO");
    });

    it("should return null for non-existing user", async () => {
      const state = await OnboardingPersistenceService.getOnboardingState("non-existent");
      expect(state.onboarding).toBeNull();
      expect(state.personalization).toBeNull();
    });
  });
});
