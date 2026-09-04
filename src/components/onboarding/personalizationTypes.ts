/**
 * Personalization Types for Onboarding Draft Experience
 * Strictly local and ephemeral — completely decoupled from persistent schemas.
 */

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

export type ExamIntent = "PROXIMA" | "FUTURA" | "INDEFINIDO";

export type PersonalizationStepId =
  | "INTRO"
  | "STAGE"
  | "DAILY_TIME"
  | "DAYS"
  | "WEAK_AREAS"
  | "EXAM_INTENT"
  | "SUMMARY";

export interface OnboardingPersonalizationDraft {
  preparationStage: PreparationStage | null;
  dailyStudyAvailability: DailyAvailability | null;
  studyDays: WeekDay[];
  variableRoutine: boolean;
  selfReportedWeakAreas: string[];
  dontKnowWeakAreas: boolean;
  examIntent: ExamIntent | null;
}

export const INITIAL_PERSONALIZATION_DRAFT: OnboardingPersonalizationDraft = {
  preparationStage: null,
  dailyStudyAvailability: null,
  studyDays: [],
  variableRoutine: false,
  selfReportedWeakAreas: [],
  dontKnowWeakAreas: false,
  examIntent: null,
};
