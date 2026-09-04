import {
  CURRENT_PERSONALIZATION_VERSION,
  PreparationStage,
  DailyAvailability,
  WeekDay,
  CanonicalMedicalArea,
  ExamIntent,
  PersistedOnboardingPersonalization,
} from "../types/onboarding";

export const VALID_PREPARATION_STAGES: readonly PreparationStage[] = [
  "COMECO",
  "JA_ESTUDO",
  "JA_FIZ_PROVAS",
  "JA_PRESTEI_REVALIDA",
] as const;

export const VALID_DAILY_AVAILABILITIES: readonly DailyAvailability[] = [
  "ATE_1H",
  "1_A_2H",
  "2_A_4H",
  "MAIS_4H",
  "INDEFINIDO",
] as const;

export const VALID_WEEK_DAYS: readonly WeekDay[] = [
  "SEG",
  "TER",
  "QUA",
  "QUI",
  "SEX",
  "SAB",
  "DOM",
] as const;

export const VALID_CANONICAL_AREAS: readonly CanonicalMedicalArea[] = [
  "CLINICA_MEDICA",
  "CIRURGIA_GERAL",
  "PEDIATRIA",
  "GINECOLOGIA_OBSTETRICIA",
  "MEDICINA_PREVENTIVA",
] as const;

export const VALID_EXAM_INTENTS: readonly ExamIntent[] = [
  "PROXIMA",
  "FUTURA",
  "INDEFINIDO",
] as const;

// Disallowed / Privileged fields that must NEVER be accepted from an onboarding payload
const FORBIDDEN_PRIVILEGED_KEYS = [
  "role",
  "tier",
  "plan",
  "subscriptionExpiresAt",
  "trialStartedAt",
  "trialEndsAt",
  "planUpdatedAt",
  "id",
  "uid",
  "email",
  "isAdmin",
  "permissions",
];

export interface ValidationSuccess {
  success: true;
  data: PersistedOnboardingPersonalization;
}

export interface ValidationFailure {
  success: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Pure runtime validator for initial onboarding personalization payload.
 * Enforces strict narrow allowlist, type safety, exclusivity invariants, and rejects privileged keys.
 */
export function validateOnboardingPersonalization(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      success: false,
      errors: ["Payload must be a non-null object."],
    };
  }

  const raw = payload as Record<string, any>;

  // 1. Security Check: Reject if payload contains any privileged keys
  for (const forbiddenKey of FORBIDDEN_PRIVILEGED_KEYS) {
    if (forbiddenKey in raw && raw[forbiddenKey] !== undefined) {
      errors.push(`Privileged field '${forbiddenKey}' is strictly forbidden in onboarding payload.`);
    }
  }

  // 2. preparationStage validation
  if (!raw.preparationStage || !VALID_PREPARATION_STAGES.includes(raw.preparationStage)) {
    errors.push(
      `Invalid preparationStage: '${raw.preparationStage}'. Must be one of: ${VALID_PREPARATION_STAGES.join(", ")}.`
    );
  }

  // 3. dailyStudyAvailability validation
  if (
    !raw.dailyStudyAvailability ||
    !VALID_DAILY_AVAILABILITIES.includes(raw.dailyStudyAvailability)
  ) {
    errors.push(
      `Invalid dailyStudyAvailability: '${raw.dailyStudyAvailability}'. Must be one of: ${VALID_DAILY_AVAILABILITIES.join(", ")}.`
    );
  }

  // 4. studyDays & variableRoutine validation
  const variableRoutine = raw.variableRoutine === true;
  const rawStudyDays = raw.studyDays;

  if (typeof raw.variableRoutine !== "boolean" && raw.variableRoutine !== undefined) {
    errors.push("variableRoutine must be a boolean value.");
  }

  if (!Array.isArray(rawStudyDays)) {
    errors.push("studyDays must be an array.");
  } else {
    const invalidDays = rawStudyDays.filter((d) => !VALID_WEEK_DAYS.includes(d));
    if (invalidDays.length > 0) {
      errors.push(`studyDays contains invalid values: ${invalidDays.join(", ")}.`);
    }

    const uniqueDays = Array.from(new Set(rawStudyDays));
    if (uniqueDays.length !== rawStudyDays.length) {
      errors.push("studyDays cannot contain duplicate days.");
    }

    // Exclusivity rule: variableRoutine vs specific days
    if (variableRoutine) {
      if (rawStudyDays.length > 0) {
        errors.push("When variableRoutine is true, studyDays must be empty.");
      }
    } else {
      if (rawStudyDays.length === 0) {
        errors.push("When variableRoutine is false, at least one study day must be selected.");
      }
    }
  }

  // 5. selfReportedWeakAreas & dontKnowWeakAreas validation
  const dontKnowWeakAreas = raw.dontKnowWeakAreas === true;
  const rawWeakAreas = raw.selfReportedWeakAreas;

  if (typeof raw.dontKnowWeakAreas !== "boolean" && raw.dontKnowWeakAreas !== undefined) {
    errors.push("dontKnowWeakAreas must be a boolean value.");
  }

  if (!Array.isArray(rawWeakAreas)) {
    errors.push("selfReportedWeakAreas must be an array.");
  } else {
    const invalidAreas = rawWeakAreas.filter((a) => !VALID_CANONICAL_AREAS.includes(a));
    if (invalidAreas.length > 0) {
      errors.push(`selfReportedWeakAreas contains invalid areas: ${invalidAreas.join(", ")}.`);
    }

    const uniqueAreas = Array.from(new Set(rawWeakAreas));
    if (uniqueAreas.length !== rawWeakAreas.length) {
      errors.push("selfReportedWeakAreas cannot contain duplicate areas.");
    }

    // Exclusivity rule: dontKnowWeakAreas vs specific areas
    if (dontKnowWeakAreas) {
      if (rawWeakAreas.length > 0) {
        errors.push("When dontKnowWeakAreas is true, selfReportedWeakAreas must be empty.");
      }
    } else {
      if (rawWeakAreas.length === 0) {
        errors.push("When dontKnowWeakAreas is false, at least one medical area must be selected.");
      }
    }
  }

  // 6. examIntent validation
  if (!raw.examIntent || !VALID_EXAM_INTENTS.includes(raw.examIntent)) {
    errors.push(
      `Invalid examIntent: '${raw.examIntent}'. Must be one of: ${VALID_EXAM_INTENTS.join(", ")}.`
    );
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  // Return clean, narrow, typed object with current personalization version
  const sanitized: PersistedOnboardingPersonalization = {
    version: CURRENT_PERSONALIZATION_VERSION,
    preparationStage: raw.preparationStage as PreparationStage,
    dailyStudyAvailability: raw.dailyStudyAvailability as DailyAvailability,
    studyDays: variableRoutine ? [] : (Array.from(new Set(raw.studyDays)) as WeekDay[]),
    variableRoutine,
    selfReportedWeakAreas: dontKnowWeakAreas
      ? []
      : (Array.from(new Set(raw.selfReportedWeakAreas)) as CanonicalMedicalArea[]),
    dontKnowWeakAreas,
    examIntent: raw.examIntent as ExamIntent,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
  };

  return {
    success: true,
    data: sanitized,
  };
}
