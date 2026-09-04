export const CURRENT_ONBOARDING_VERSION = 1;
export const CURRENT_PERSONALIZATION_VERSION = 1;

export type OnboardingStatus = "NOT_REQUIRED" | "REQUIRED" | "IN_PROGRESS" | "COMPLETED";

export type OnboardingSection =
  | "WELCOME"
  | "ECOSYSTEM"
  | "EXPERIENCE"
  | "PERSONALIZE"
  | "PROGRESS_PREVIEW"
  | "FINISH";

export interface UserOnboardingState {
  version: number;
  status: OnboardingStatus;
  startedAt?: string;
  completedAt?: string;
  currentSection?: OnboardingSection | string;
}

export type PreparationStage =
  | "COMECO"
  | "JA_ESTUDO"
  | "JA_FIZ_PROVAS"
  | "JA_PRESTEI_REVALIDA";

export type DailyAvailability =
  | "ATE_1H"
  | "1_A_2H"
  | "2_A_4H"
  | "MAIS_4H"
  | "INDEFINIDO";

export type WeekDay = "SEG" | "TER" | "QUA" | "QUI" | "SEX" | "SAB" | "DOM";

export type CanonicalMedicalArea =
  | "CLINICA_MEDICA"
  | "CIRURGIA_GERAL"
  | "PEDIATRIA"
  | "GINECOLOGIA_OBSTETRICIA"
  | "MEDICINA_PREVENTIVA";

export type ExamIntent = "PROXIMA" | "FUTURA" | "INDEFINIDO";

export interface PersistedOnboardingPersonalization {
  version: number;
  preparationStage: PreparationStage;
  dailyStudyAvailability: DailyAvailability;
  studyDays: WeekDay[];
  variableRoutine: boolean;
  selfReportedWeakAreas: CanonicalMedicalArea[];
  dontKnowWeakAreas: boolean;
  examIntent: ExamIntent;
  savedAt: string;
}

export type OnboardingDecisionReason =
  | "NEW_USER_REQUIRED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "LEGACY_MISSING_FIELD"
  | "ADMIN_BYPASS"
  | "MALFORMED_BYPASS";

export interface EffectiveOnboardingDecision {
  status: OnboardingStatus;
  version: number | null;
  shouldOnboard: boolean;
  reason: OnboardingDecisionReason;
}
