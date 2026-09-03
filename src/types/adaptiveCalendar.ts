import { MedicalArea } from "./index";
export type { MedicalArea };

export type StudyPhaseType = 
  | "FASE_1_CONSTRUCAO"      // > 90 dias
  | "FASE_2_CONSOLIDACAO"    // 45 a 90 dias
  | "FASE_3_RETA_FINAL"      // 7 a 45 dias
  | "FASE_4_ULTIMOS_DIAS"    // < 7 dias
  | "VESPERA"                // D-1
  | "DIA_DA_PROVA";          // D-Day

export type StudyIntensity = "LEVE" | "MODERADO" | "INTENSIVO" | "RETA_FINAL";
export type CalendarMode = "FLEXIVEL" | "FIXO";

export type CalendarBlockType = 
  | "TEORIA_COMPLETA"
  | "TEORIA_DIRECIONADA"
  | "TEORIA_EXPRESSA"
  | "REVISAO_EXPRESSA"
  | "QUESTOES_OFICIAIS" 
  | "QUESTOES_IRMAS"
  | "QUESTOES_INEDITAS_IA"
  | "FLASHCARDS"
  | "FLASHCARDS_FSRS"
  | "RECUPERACAO_ATIVA"
  | "REVISAO_ESPACADA" 
  | "SIMULADO_PARCIAL" 
  | "SIMULADO_COMPLETO"
  | "SIMULADO_CRONOMETRADO"
  | "SIMULADO_PROVA_INTEIRA"
  | "CORRECAO_AUTOPSIA"
  | "AUTOPSIA_ERROS"
  | "CASO_CLINICO"
  | "GRANDE_TEMA"
  | "RECUPERACAO_LACUNA"
  | "BUFFER_RECUPERACAO" 
  | "DESCANSO"
  | "CHECKLIST_VESPERA"
  | "EXECUCAO_PROVA"
  | "ESTUDO_DIRECIONADO";

export type QuadrantType = "A" | "B" | "C" | "D";

export type StudentErrorType =
  | "LACUNA_CONCEITUAL"
  | "MEMORIA"
  | "INTERPRETAÇÃO"
  | "DISTRAÇÃO"
  | "RACIOCÍNIO"
  | "CONDUTA"
  | "PROTOCOLO_DESATUALIZADO"
  | "CONFUSAO_DIAGNOSTICA"
  | "GESTAO_TEMPO";

export interface ErrorAutopsyClassification {
  errorType: StudentErrorType | string;
  count: number;
  label: string;
  color: string;
  recommendedIntervention?: string;
}

export interface DayAvailabilityConfig {
  dayOfWeek: "SEG" | "TER" | "QUA" | "QUI" | "SEX" | "SAB" | "DOM";
  dayName: string;
  availableMinutes: number; // e.g., 120
  enabled: boolean;
  timeWindows?: { start: string; end: string }[]; // e.g., [{ start: "06:30", end: "07:30" }]
  blockedReason?: "Plantão" | "Trabalho" | "Faculdade" | "Família" | "Academia" | "Descanso" | "Outro";
}

export interface FsrsMemoryState {
  topicId: string;
  topicName: string;
  area: MedicalArea;
  stability: number; // Days until R drops to 0.9
  difficulty: number; // 1 to 10
  retrievability: number; // 0.0 to 1.0 (estimated probability of recall today)
  lastReviewDate: string;
  nextDueDate: string;
  reps: number;
  lapses: number;
  memoryStatus: "NOVO" | "APRENDENDO" | "INSTAVEL" | "CONSOLIDADO" | "DOMINADO";
}

export interface CalendarBlock {
  id: string;
  type: CalendarBlockType;
  title: string;
  area?: MedicalArea;
  theme?: string;
  subtheme?: string;
  durationMinutes: number;
  description: string;
  reason?: string; // "Por que você vai estudar isso?"
  priorityScore?: number; // 0 to 100 PPS
  completed: boolean;
  questionCount?: number;
  flashcardCount?: number;
  grandeTemaId?: string;
  source?: "AI_GENERATED" | "STUDENT_MEMORY" | "INEP_HIGH_YIELD" | "USER_CUSTOM" | "FSRS_DUE";
  plannedTimeWindow?: string; // e.g. "19:00 - 19:30"
}

export interface ScheduledDayItem {
  id: string;
  date: string;               // YYYY-MM-DD
  dateFormatted?: string;
  dayOfWeek: string;          // "SEG", "TER", etc.
  dayNumber: number;          // 31, 1, 2...
  month: string;              // "AGO", "SET"
  isToday: boolean;
  isExamDay?: boolean;
  isEveDay?: boolean;
  daysRemaining: number;
  phase: StudyPhaseType;
  allocatedMinutes: number;   // Ex: 120 min
  targetMinutes?: number;
  primaryArea: MedicalArea;
  primaryTopicName: string;
  focusTheme?: string;
  topicIrs: number;
  studentDomain: number;
  ppsScore: number;
  expectedScoreGain: number;  // Ganho de pontos estimado (ex: +3.8 pts)
  blocks: CalendarBlock[];
  notes?: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "MISSED_RECALCULATED";
}

export interface StudentOnboardingProfile {
  examDate: string;           // "2026-09-13" or "2027-06-07"
  dailyAvailableMinutes: number; // Ex: 120 min
  weeklyStudyDays: number;    // Ex: 6 dias
  dayWithMostTime: string;    // "SABADO"
  dayWithLeastTime: string;   // "QUARTA"
  isFirstAttempt: boolean;
  previousExamScore?: number;
  perceivedWeakAreas: MedicalArea[];
  perceivedStrongAreas: MedicalArea[];
  avgQuestionsPerDayCapacity: number; // Ex: 35
  studyPhase: StudyPhaseType;
  intensity: StudyIntensity;
  calendarMode: CalendarMode;
  weeklySchedule: DayAvailabilityConfig[];
  timeBlocks: {
    name: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }[];
  notificationsEnabled: {
    sessionReminder: boolean;
    dueReviews: boolean;
    dailyPlan: boolean;
    planRecalculated: boolean;
  };
}

export interface NextBestActionRecommendation {
  id: string;
  title: string;
  topicName: string;
  area: MedicalArea;
  durationMinutes: number;
  pps: number;
  expectedGainPoints: number;
  urgencyReason: string;
  steps: {
    stepNumber: number;
    name: string;
    durationMinutes: number;
    type: string;
    actionTarget?: "QUESTIONS" | "GRANDES_TEMAS" | "FLASHCARDS" | "ERROR_AUTOPSY";
  }[];
  activeRecallPrompt: string;
  officialQuestionsCount: number;
  sisterQuestionsCount: number;
}

export interface DeprioritizedTopicItem {
  id: string;
  topicName: string;
  area: MedicalArea;
  reason: string;
  masteryPct: number;
  inepIncidence: "BAIXA" | "MEDIA" | "ALTA";
  advice: string;
}

export interface CoverageForecast {
  highPriorityPct: number;    // e.g. 94%
  mediumPriorityPct: number;  // e.g. 72%
  lowPriorityPct: number;     // e.g. 38%
  weeklyHoursAvailable: number;
  weeklyHoursRecommended: number;
  isOverloaded: boolean;
  aiDiagnosis: string;
}

export interface StudyEfficiencyMetric {
  masteryGainPerHour: number; // e.g. +1.4% / hora
  effectiveMinutesStudied: number;
  retentionRatePct: number;   // e.g. 88%
  errorReductionPct: number;  // e.g. -24%
  overallScore: number;
}

export interface WeeklyRouteReport {
  weekPeriod: string;
  totalHoursStudied: number;
  totalQuestionsResolved: number;
  accuracyRatePct: number;
  domainGainPct: number;
  strongestEvolutionArea: MedicalArea;
  highestRiskArea: MedicalArea;
  consolidatedCompetenciesCount: number;
  nextWeekStrategyNote: string;
}
