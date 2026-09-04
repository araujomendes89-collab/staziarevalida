import { UserProfile } from "../types";
import {
  EffectiveOnboardingDecision,
} from "../types/onboarding";

/**
 * Pure, deterministic resolver for effective user onboarding state.
 * No side effects, no Firestore, no localStorage, no navigation.
 */
export function resolveOnboardingState(
  user: UserProfile | null | undefined
): EffectiveOnboardingDecision {
  if (!user) {
    return {
      status: "NOT_REQUIRED",
      version: null,
      shouldOnboard: false,
      reason: "LEGACY_MISSING_FIELD",
    };
  }

  // 1. ADMIN Bypass - Admins never get forced into onboarding
  if (user.role === "ADMIN") {
    return {
      status: "NOT_REQUIRED",
      version: typeof user.onboarding?.version === "number" ? user.onboarding.version : null,
      shouldOnboard: false,
      reason: "ADMIN_BYPASS",
    };
  }

  const onboarding = user.onboarding;

  // 2. Legacy user without onboarding object or missing status
  if (!onboarding || !onboarding.status) {
    return {
      status: "NOT_REQUIRED",
      version: null,
      shouldOnboard: false,
      reason: "LEGACY_MISSING_FIELD",
    };
  }

  // 3. Check for valid version (must be a finite number > 0)
  if (typeof onboarding.version !== "number" || isNaN(onboarding.version) || onboarding.version <= 0) {
    return {
      status: "NOT_REQUIRED",
      version: null,
      shouldOnboard: false,
      reason: "MALFORMED_BYPASS",
    };
  }

  // 4. Evaluate valid statuses
  switch (onboarding.status) {
    case "REQUIRED":
      return {
        status: "REQUIRED",
        version: onboarding.version,
        shouldOnboard: true,
        reason: "NEW_USER_REQUIRED",
      };

    case "IN_PROGRESS":
      return {
        status: "IN_PROGRESS",
        version: onboarding.version,
        shouldOnboard: true,
        reason: "IN_PROGRESS",
      };

    case "COMPLETED":
      return {
        status: "COMPLETED",
        version: onboarding.version,
        shouldOnboard: false,
        reason: "COMPLETED",
      };

    case "NOT_REQUIRED":
      return {
        status: "NOT_REQUIRED",
        version: onboarding.version,
        shouldOnboard: false,
        reason: "LEGACY_MISSING_FIELD",
      };

    default:
      // Unknown / malformed status fails safe to bypass so the user is not trapped
      return {
        status: "NOT_REQUIRED",
        version: onboarding.version,
        shouldOnboard: false,
        reason: "MALFORMED_BYPASS",
      };
  }
}
