import {
  doc,
  getDoc,
  runTransaction,
  Firestore,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  CURRENT_ONBOARDING_VERSION,
  OnboardingStatus,
  OnboardingSection,
  UserOnboardingState,
  PersistedOnboardingPersonalization,
} from "../types/onboarding";
import { validateOnboardingPersonalization } from "./onboardingValidator";

export interface OnboardingBeginSuccess {
  success: true;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt?: string;
  completedAt?: string;
  isNewTransition: boolean;
}

export interface OnboardingBeginFailure {
  success: false;
  code:
    | "USER_NOT_FOUND"
    | "ADMIN_BYPASS"
    | "NOT_REQUIRED"
    | "ALREADY_COMPLETED"
    | "VERSION_MISMATCH"
    | "MALFORMED_STATE"
    | "TRANSACTION_ERROR";
  error: string;
}

export type OnboardingBeginResult = OnboardingBeginSuccess | OnboardingBeginFailure;

export interface OnboardingCheckpointSuccess {
  success: true;
  currentSection: "PROGRESS_PREVIEW";
  personalization: PersistedOnboardingPersonalization;
}

export interface OnboardingCheckpointFailure {
  success: false;
  code:
    | "INVALID_PAYLOAD"
    | "USER_NOT_FOUND"
    | "INVALID_STATE"
    | "NOT_IN_PROGRESS"
    | "ALREADY_COMPLETED"
    | "VERSION_MISMATCH"
    | "TRANSACTION_ERROR";
  error: string;
  errors?: string[];
}

export type OnboardingCheckpointResult =
  | OnboardingCheckpointSuccess
  | OnboardingCheckpointFailure;

export interface OnboardingCompleteSuccess {
  success: true;
  status: "COMPLETED";
  completedAt: string;
  isNewTransition: boolean;
}

export interface OnboardingCompleteFailure {
  success: false;
  code:
    | "USER_NOT_FOUND"
    | "NOT_IN_PROGRESS"
    | "MISSING_PERSONALIZATION"
    | "INVALID_PERSONALIZATION"
    | "VERSION_MISMATCH"
    | "TRANSACTION_ERROR";
  error: string;
}

export type OnboardingCompleteResult =
  | OnboardingCompleteSuccess
  | OnboardingCompleteFailure;

export class OnboardingPersistenceService {
  /**
   * Transition 1: REQUIRED -> IN_PROGRESS
   * Begins user onboarding in Firestore inside a transaction.
   * Idempotent: If already IN_PROGRESS, preserves original startedAt and returns success.
   * Disallows re-opening COMPLETED or mutating legacy NOT_REQUIRED / ADMIN users.
   */
  static async beginOnboarding(
    uid: string,
    firestoreDb: Firestore = db
  ): Promise<OnboardingBeginResult> {
    if (!uid || typeof uid !== "string") {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        error: "A valid user ID is required.",
      };
    }

    try {
      return await runTransaction(firestoreDb, async (transaction) => {
        const userRef = doc(firestoreDb, "users", uid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          return {
            success: false,
            code: "USER_NOT_FOUND",
            error: `User document 'users/${uid}' not found.`,
          };
        }

        const data = userDoc.data();

        // 1. ADMIN Bypass: Admins are not subject to onboarding mutations
        if (data?.role === "ADMIN") {
          return {
            success: false,
            code: "ADMIN_BYPASS",
            error: "Admin users bypass onboarding.",
          };
        }

        // 2. Legacy / Missing Onboarding: Never auto-migrate or force begin
        if (!data?.onboarding || !data.onboarding.status || data.onboarding.status === "NOT_REQUIRED") {
          return {
            success: false,
            code: "NOT_REQUIRED",
            error: "Onboarding is not required for this user.",
          };
        }

        // 3. Version Mismatch: Never auto-upgrade or re-onboard silently
        if (data.onboarding.version !== CURRENT_ONBOARDING_VERSION) {
          return {
            success: false,
            code: "VERSION_MISMATCH",
            error: `Stored onboarding version ${data.onboarding.version} does not match current version ${CURRENT_ONBOARDING_VERSION}.`,
          };
        }

        // 4. Idempotency: Already COMPLETED -> safe no-op
        if (data.onboarding.status === "COMPLETED") {
          return {
            success: true,
            status: "COMPLETED",
            startedAt: data.onboarding.startedAt,
            completedAt: data.onboarding.completedAt,
            isNewTransition: false,
          };
        }

        // 5. Idempotency: Already IN_PROGRESS -> safe no-op, preserve startedAt
        if (data.onboarding.status === "IN_PROGRESS") {
          return {
            success: true,
            status: "IN_PROGRESS",
            startedAt: data.onboarding.startedAt,
            isNewTransition: false,
          };
        }

        // 6. Valid Transition: REQUIRED -> IN_PROGRESS
        if (data.onboarding.status === "REQUIRED") {
          const nowIso = new Date().toISOString();
          transaction.update(userRef, {
            "onboarding.status": "IN_PROGRESS",
            "onboarding.startedAt": nowIso,
            "onboarding.currentSection": "WELCOME",
          });

          return {
            success: true,
            status: "IN_PROGRESS",
            startedAt: nowIso,
            isNewTransition: true,
          };
        }

        return {
          success: false,
          code: "MALFORMED_STATE",
          error: `Unknown onboarding status: '${data.onboarding.status}'.`,
        };
      });
    } catch (err: any) {
      console.error("[OnboardingPersistenceService] Error in beginOnboarding:", err);
      return {
        success: false,
        code: "TRANSACTION_ERROR",
        error: err?.message || "Transaction failed while starting onboarding.",
      };
    }
  }

  /**
   * Transition 2: Checkpoint IN_PROGRESS -> IN_PROGRESS
   * Saves validated initial personalization and advances currentSection atomically.
   * Precondition: onboarding.status must be IN_PROGRESS.
   */
  static async saveOnboardingPersonalization(
    uid: string,
    rawPayload: unknown,
    firestoreDb: Firestore = db
  ): Promise<OnboardingCheckpointResult> {
    if (!uid || typeof uid !== "string") {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        error: "A valid user ID is required.",
      };
    }

    // Step 1: Pure runtime validation of payload (rejects invalid data before calling Firestore)
    const validation = validateOnboardingPersonalization(rawPayload);
    if (!validation.success) {
      return {
        success: false,
        code: "INVALID_PAYLOAD",
        error: `Personalization validation failed: ${validation.errors.join("; ")}`,
        errors: validation.errors,
      };
    }

    try {
      return await runTransaction(firestoreDb, async (transaction) => {
        const userRef = doc(firestoreDb, "users", uid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          return {
            success: false,
            code: "USER_NOT_FOUND",
            error: `User document 'users/${uid}' not found.`,
          };
        }

        const data = userDoc.data();

        // Check if admin or legacy
        if (data?.role === "ADMIN") {
          return {
            success: false,
            code: "INVALID_STATE",
            error: "Admin users bypass onboarding.",
          };
        }

        if (!data?.onboarding || data.onboarding.status !== "IN_PROGRESS") {
          return {
            success: false,
            code: "NOT_IN_PROGRESS",
            error: `Cannot save checkpoint: onboarding status is '${data?.onboarding?.status || "NONE"}', expected 'IN_PROGRESS'.`,
          };
        }

        if (data.onboarding.version !== CURRENT_ONBOARDING_VERSION) {
          return {
            success: false,
            code: "VERSION_MISMATCH",
            error: `Stored onboarding version ${data.onboarding.version} does not match current ${CURRENT_ONBOARDING_VERSION}.`,
          };
        }

        // Atomic field-path update
        transaction.update(userRef, {
          onboardingPersonalization: validation.data,
          "onboarding.currentSection": "PROGRESS_PREVIEW",
        });

        return {
          success: true,
          currentSection: "PROGRESS_PREVIEW",
          personalization: validation.data,
        };
      });
    } catch (err: any) {
      console.error("[OnboardingPersistenceService] Error in saveOnboardingPersonalization:", err);
      return {
        success: false,
        code: "TRANSACTION_ERROR",
        error: err?.message || "Transaction failed while saving personalization checkpoint.",
      };
    }
  }

  /**
   * Transition 3: IN_PROGRESS -> COMPLETED
   * Completes onboarding in Firestore inside a transaction.
   * Direct finish protection: Requires valid stored onboardingPersonalization to complete.
   * Idempotent: If already COMPLETED, preserves original completedAt.
   */
  static async completeOnboarding(
    uid: string,
    firestoreDb: Firestore = db
  ): Promise<OnboardingCompleteResult> {
    if (!uid || typeof uid !== "string") {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        error: "A valid user ID is required.",
      };
    }

    try {
      return await runTransaction(firestoreDb, async (transaction) => {
        const userRef = doc(firestoreDb, "users", uid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          return {
            success: false,
            code: "USER_NOT_FOUND",
            error: `User document 'users/${uid}' not found.`,
          };
        }

        const data = userDoc.data();

        // 1. Idempotency: Already completed -> safe no-op, preserve completedAt
        if (data?.onboarding?.status === "COMPLETED") {
          return {
            success: true,
            status: "COMPLETED",
            completedAt: data.onboarding.completedAt || new Date().toISOString(),
            isNewTransition: false,
          };
        }

        // 2. Precondition: status must be IN_PROGRESS
        if (!data?.onboarding || data.onboarding.status !== "IN_PROGRESS") {
          return {
            success: false,
            code: "NOT_IN_PROGRESS",
            error: `Cannot complete onboarding: status is '${data?.onboarding?.status || "NONE"}', expected 'IN_PROGRESS'.`,
          };
        }

        // 3. Version Check
        if (data.onboarding.version !== CURRENT_ONBOARDING_VERSION) {
          return {
            success: false,
            code: "VERSION_MISMATCH",
            error: `Stored onboarding version ${data.onboarding.version} does not match current ${CURRENT_ONBOARDING_VERSION}.`,
          };
        }

        // 4. DIRECT FINISH PROTECTION: Must have valid persisted personalization
        if (!data.onboardingPersonalization) {
          return {
            success: false,
            code: "MISSING_PERSONALIZATION",
            error: "Direct finish prohibited: initial personalization has not been saved.",
          };
        }

        const validation = validateOnboardingPersonalization(data.onboardingPersonalization);
        if (!validation.success) {
          return {
            success: false,
            code: "INVALID_PERSONALIZATION",
            error: "Direct finish prohibited: stored personalization failed validation.",
          };
        }

        // 5. Valid Transition: IN_PROGRESS -> COMPLETED
        const nowIso = new Date().toISOString();
        transaction.update(userRef, {
          "onboarding.status": "COMPLETED",
          "onboarding.completedAt": nowIso,
          "onboarding.currentSection": "FINISH",
        });

        return {
          success: true,
          status: "COMPLETED",
          completedAt: nowIso,
          isNewTransition: true,
        };
      });
    } catch (err: any) {
      console.error("[OnboardingPersistenceService] Error in completeOnboarding:", err);
      return {
        success: false,
        code: "TRANSACTION_ERROR",
        error: err?.message || "Transaction failed while completing onboarding.",
      };
    }
  }

  /**
   * Read-only helper: retrieves current stored onboarding state and personalization doc.
   */
  static async getOnboardingState(
    uid: string,
    firestoreDb: Firestore = db
  ): Promise<{
    onboarding: UserOnboardingState | null;
    personalization: PersistedOnboardingPersonalization | null;
  }> {
    try {
      const userRef = doc(firestoreDb, "users", uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        return { onboarding: null, personalization: null };
      }
      const data = userDoc.data();
      return {
        onboarding: data?.onboarding || null,
        personalization: data?.onboardingPersonalization || null,
      };
    } catch (err) {
      console.warn("[OnboardingPersistenceService] Error fetching onboarding state:", err);
      return { onboarding: null, personalization: null };
    }
  }
}
