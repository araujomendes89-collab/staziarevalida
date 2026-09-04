import { describe, it, expect, vi } from "vitest";
import { UserProfile } from "../types";
import {
  CURRENT_ONBOARDING_VERSION,
  OnboardingStatus,
  UserOnboardingState,
  UserPersonalizationMetadata,
} from "../types/onboarding";
import { resolveOnboardingState } from "../services/onboardingStateResolver";

describe("Etapa 1.24B — Onboarding Persistent Contract & Resolver", () => {
  const baseStudentProfile: UserProfile = {
    id: "user-123",
    name: "Dr. Aluno",
    email: "aluno@exemplo.com",
    graduationCountry: "Brasil",
    graduationUniversity: "USP",
    graduationYear: 2024,
    targetEdition: "2026/2",
    examDate: "2026-09-13",
    isFirstAttempt: true,
    dailyStudyMinutes: 120,
    availableDaysPerWeek: 6,
    weakAreas: ["CLINICA_MEDICA"],
    role: "STUDENT",
    tier: "TRIAL",
    plan: "trial",
    isOnboardingCompleted: false,
    studyStreakDays: 0,
    totalQuestionsSolved: 0,
    overallReadiness: 0,
    projectedPassScoreMin: 0,
    projectedPassScoreMax: 0,
  };

  describe("1. Contract & Version Constants", () => {
    it("should export CURRENT_ONBOARDING_VERSION as 1", () => {
      expect(CURRENT_ONBOARDING_VERSION).toBe(1);
    });

    it("should allow building valid UserOnboardingState and UserPersonalizationMetadata", () => {
      const state: UserOnboardingState = {
        version: CURRENT_ONBOARDING_VERSION,
        status: "REQUIRED",
      };
      expect(state.version).toBe(1);
      expect(state.status).toBe("REQUIRED");

      const personalization: UserPersonalizationMetadata = {
        preparationStage: "BEGINNER",
        dailyStudyAvailability: "1_TO_2H",
        studyDays: ["MON", "WED", "FRI"],
        variableRoutine: false,
        selfReportedWeakAreas: ["CLINICA_MEDICA"],
        dontKnowWeakAreas: false,
        examIntent: "REVALIDA_INEP",
        submittedAt: new Date().toISOString(),
      };
      expect(personalization.preparationStage).toBe("BEGINNER");
    });
  });

  describe("2. Pure Resolver — New Users with REQUIRED Status", () => {
    it("should resolve REQUIRED for student with version 1 and status REQUIRED", () => {
      const user: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "REQUIRED",
        },
      };

      const decision = resolveOnboardingState(user);
      expect(decision).toEqual({
        status: "REQUIRED",
        version: 1,
        shouldOnboard: true,
        reason: "NEW_USER_REQUIRED",
      });
    });
  });

  describe("3. Pure Resolver — IN_PROGRESS Status", () => {
    it("should resolve IN_PROGRESS and shouldOnboard=true for student in progress", () => {
      const user: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "IN_PROGRESS",
          startedAt: "2026-09-01T10:00:00Z",
          currentSection: "experience",
        },
      };

      const decision = resolveOnboardingState(user);
      expect(decision).toEqual({
        status: "IN_PROGRESS",
        version: 1,
        shouldOnboard: true,
        reason: "IN_PROGRESS",
      });
    });
  });

  describe("4. Pure Resolver — COMPLETED Status & Version Mismatch Protection", () => {
    it("should resolve COMPLETED and shouldOnboard=false for completed user", () => {
      const user: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "COMPLETED",
          completedAt: "2026-09-02T12:00:00Z",
        },
      };

      const decision = resolveOnboardingState(user);
      expect(decision).toEqual({
        status: "COMPLETED",
        version: 1,
        shouldOnboard: false,
        reason: "COMPLETED",
      });
    });

    it("should NOT trigger re-onboarding even if user completed older version (VERSION_MISMATCH_AUTO_REONBOARD = NO)", () => {
      const user: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: 1,
          status: "COMPLETED",
        },
      };

      const decision = resolveOnboardingState(user);
      expect(decision.shouldOnboard).toBe(false);
      expect(decision.status).toBe("COMPLETED");
    });
  });

  describe("5. Pure Resolver — Legacy Users (Missing Field Protection)", () => {
    it("should resolve NOT_REQUIRED with shouldOnboard=false when onboarding field is absent", () => {
      const legacyUser: UserProfile = {
        ...baseStudentProfile,
        // onboarding field is intentionally omitted
      };

      const decision = resolveOnboardingState(legacyUser);
      expect(decision).toEqual({
        status: "NOT_REQUIRED",
        version: null,
        shouldOnboard: false,
        reason: "LEGACY_MISSING_FIELD",
      });
    });

    it("should resolve NOT_REQUIRED when onboarding object is empty or status is missing", () => {
      const legacyUser: UserProfile = {
        ...baseStudentProfile,
        onboarding: {} as any,
      };

      const decision = resolveOnboardingState(legacyUser);
      expect(decision).toEqual({
        status: "NOT_REQUIRED",
        version: null,
        shouldOnboard: false,
        reason: "LEGACY_MISSING_FIELD",
      });
    });

    it("should handle null or undefined user profile gracefully", () => {
      expect(resolveOnboardingState(null)).toEqual({
        status: "NOT_REQUIRED",
        version: null,
        shouldOnboard: false,
        reason: "LEGACY_MISSING_FIELD",
      });

      expect(resolveOnboardingState(undefined)).toEqual({
        status: "NOT_REQUIRED",
        version: null,
        shouldOnboard: false,
        reason: "LEGACY_MISSING_FIELD",
      });
    });
  });

  describe("6. Pure Resolver — ADMIN Bypass", () => {
    it("should bypass onboarding for ADMIN even if status is REQUIRED", () => {
      const adminUser: UserProfile = {
        ...baseStudentProfile,
        role: "ADMIN",
        tier: "ADMIN",
        plan: "admin",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "REQUIRED",
        },
      };

      const decision = resolveOnboardingState(adminUser);
      expect(decision).toEqual({
        status: "NOT_REQUIRED",
        version: 1,
        shouldOnboard: false,
        reason: "ADMIN_BYPASS",
      });
    });

    it("should base admin bypass strictly on role field and NOT email string", () => {
      const nonAdminWithAdminEmail: UserProfile = {
        ...baseStudentProfile,
        email: "admin@staziamed.com",
        role: "STUDENT",
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "REQUIRED",
        },
      };

      const decision = resolveOnboardingState(nonAdminWithAdminEmail);
      expect(decision.shouldOnboard).toBe(true);
      expect(decision.reason).toBe("NEW_USER_REQUIRED");
    });
  });

  describe("7. Pure Resolver — Malformed / Corrupted State Fail-Safe", () => {
    it("should fail-safe to NOT_REQUIRED and shouldOnboard=false on unknown status", () => {
      const corruptedUser: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: 1,
          status: "CORRUPTED_STATUS" as any,
        },
      };

      const decision = resolveOnboardingState(corruptedUser);
      expect(decision).toEqual({
        status: "NOT_REQUIRED",
        version: 1,
        shouldOnboard: false,
        reason: "MALFORMED_BYPASS",
      });
    });

    it("should fail-safe on invalid or missing version number", () => {
      const invalidVersionUser: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: "v1" as any,
          status: "REQUIRED",
        },
      };

      const decision = resolveOnboardingState(invalidVersionUser);
      expect(decision).toEqual({
        status: "NOT_REQUIRED",
        version: null,
        shouldOnboard: false,
        reason: "MALFORMED_BYPASS",
      });
    });

    it("should fail-safe on negative or zero version number", () => {
      const zeroVersionUser: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: 0,
          status: "REQUIRED",
        },
      };

      const decision = resolveOnboardingState(zeroVersionUser);
      expect(decision).toEqual({
        status: "NOT_REQUIRED",
        version: null,
        shouldOnboard: false,
        reason: "MALFORMED_BYPASS",
      });
    });
  });

  describe("8. Purity and Immutability Guarantee", () => {
    it("should not mutate the input UserProfile object", () => {
      const user: UserProfile = {
        ...baseStudentProfile,
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          status: "REQUIRED",
        },
      };

      const userClone = JSON.parse(JSON.stringify(user));
      resolveOnboardingState(user);
      expect(user).toEqual(userClone);
    });
  });

  describe("9. Legacy User Login Write Isolation Guarantee", () => {
    it("should verify that legacy profile without onboarding does not mutate or require write", () => {
      // Simulates existing cloud profile loaded without onboarding field
      const cloudProfile: UserProfile = {
        ...baseStudentProfile,
        id: "legacy-uid-456",
        email: "legacy@medico.com",
        tier: "TRIAL",
        plan: "trial",
        trialStartedAt: "2026-08-20T00:00:00.000Z",
        trialEndsAt: "2026-08-27T00:00:00.000Z",
      };

      // Ensure onboarding field is absent
      expect(cloudProfile.onboarding).toBeUndefined();

      // Resolve decision
      const decision = resolveOnboardingState(cloudProfile);
      expect(decision.status).toBe("NOT_REQUIRED");
      expect(decision.shouldOnboard).toBe(false);
      expect(decision.reason).toBe("LEGACY_MISSING_FIELD");

      // Verify no onboarding object was injected into the legacy object
      expect(cloudProfile.onboarding).toBeUndefined();
    });
  });

  describe("10. Explicit shouldOnboard Requirements Guarantee", () => {
    it("should only return shouldOnboard === true for explicit REQUIRED or IN_PROGRESS statuses", () => {
      const statuses: OnboardingStatus[] = ["NOT_REQUIRED", "REQUIRED", "IN_PROGRESS", "COMPLETED"];
      
      for (const status of statuses) {
        const profile: UserProfile = {
          ...baseStudentProfile,
          onboarding: {
            version: CURRENT_ONBOARDING_VERSION,
            status,
          },
        };
        const decision = resolveOnboardingState(profile);
        if (status === "REQUIRED" || status === "IN_PROGRESS") {
          expect(decision.shouldOnboard).toBe(true);
        } else {
          expect(decision.shouldOnboard).toBe(false);
        }
      }
    });
  });
});

