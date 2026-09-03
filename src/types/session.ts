import { MedicalArea, ConfidenceLevel, ErrorTaxonomy, Question } from "./index";

export type TrainingMode = 
  | "RAPIDO"            // Treino Rápido (10 ou 20 questões em 1 clique)
  | "ADAPTATIVO"         // Motor IA / PPS escolhe com base em gaps e matriz INEP
  | "ERROS"              // Revisão de erros e caderno de erros
  | "SIMULADO"           // Condições reais de prova, gabarito só ao final
  | "PROVA_INTEGRA"      // Provas oficiais completas do INEP (2021-2026)
  | "PERSONALIZADO";     // Construtor completo com todos os filtros manuais

export type SessionObjective = 
  | "TREINO_LIVRE"
  | "INEDITAS"
  | "OFICIAIS"
  | "MISTO"
  | "REVISAO_ERROS"
  | "REVISAO_ESPACADA"
  | "TEMAS_RECORRENTES"
  | "COMPETENCIA_ESPECIFICA"
  | "SISTER_QUESTIONS";

export type TimerMode = "NONE" | "FREE" | "RECOMMENDED" | "EXAM_STRICT";

export type FeedbackMode = "IMMEDIATE" | "END_OF_SESSION";

export type SessionOrdering = 
  | "ADAPTIVE"          // Prioriza relevância INEP onde o domínio é menor
  | "RANDOM"            // Aleatório
  | "NEWEST"            // Mais recentes primeiro
  | "OLDEST"            // Mais antigas primeiro
  | "INEP_RELEVANCE"    // Maior relevância histórica INEP
  | "DIFFICULTY_DESC"   // Mais difíceis primeiro
  | "WEAKEST_FIRST"     // Temas mais fracos do usuário
  | "ORIGINAL_ORDER";   // Ordem original no caderno de prova do INEP

export type InepRelevanceLevel = "ALL" | "MUITO_ALTA" | "ALTA" | "MODERADA";

export interface QuestionSessionConfig {
  mode: TrainingMode;
  title: string;
  objective: SessionObjective;
  areas: (MedicalArea | "ALL")[];
  topics: string[];
  competencies: string[];
  years: (number | "ALL")[];
  origin: "ALL" | "INEP_OFICIAL" | "INEDITAS";
  difficulty: "ALL" | "FACIL" | "MEDIO" | "DIFICIL";
  inepRelevance: InepRelevanceLevel;
  smartFilters: {
    onlyUnanswered: boolean;
    onlyWrong: boolean;
    onlyCorrect: boolean;
    onlyFlagged: boolean;
    onlyReincidentErrors: boolean;
    onlyWithUpdatedGuideline: boolean;
    onlyHighInepPattern: boolean;
    excludeMastered: boolean;
    onlyWithComments?: boolean;
    onlyDiscursive?: boolean;
  };
  quantity: number;
  feedbackMode: FeedbackMode;
  timerMode: TimerMode;
  showComments: boolean;
  ordering: SessionOrdering;
  examEditionId?: string; // Para provas na íntegra (ex: "REV-2024.1")
  sisterTopicTarget?: string; // Se gerado a partir de uma questão irmã
}

export interface SessionAnswerState {
  questionId: string;
  selectedOption: "A" | "B" | "C" | "D";
  isCorrect: boolean;
  timeSpentSeconds: number;
  confidence: ConfidenceLevel;
  timestamp: string;
  errorReason?: ErrorTaxonomy;
  userReflection?: string;
  isFlagged?: boolean;
}

export interface ActiveTrainingSession {
  id: string;
  title: string;
  subtitle?: string;
  mode: TrainingMode;
  config: QuestionSessionConfig;
  questionIds: string[];
  currentIndex: number;
  answers: Record<string, SessionAnswerState>;
  flaggedQuestionIds: string[];
  startTime: string;
  lastUpdated: string;
  totalDurationSeconds: number;
  isCompleted: boolean;
  completedAt?: string;
  paused: boolean;
}

export interface SessionSummaryReport {
  sessionId: string;
  title: string;
  mode: TrainingMode;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  scorePercentage: number;
  totalTimeSeconds: number;
  avgTimePerQuestion: number;
  areaPerformance: Record<MedicalArea, { total: number; correct: number; percentage: number }>;
  competencyPerformance: Record<string, { total: number; correct: number; percentage: number }>;
  errorTaxonomyBreakdown: Record<ErrorTaxonomy, number>;
  recommendedNextAction: {
    title: string;
    description: string;
    actionType: "RETRY_ERRORS" | "SISTER_QUESTIONS" | "NEW_ADAPTIVE" | "FLASHCARDS";
    targetArea?: MedicalArea;
    targetTopic?: string;
    questionIds?: string[];
  };
}

export interface PresetFilter {
  id: string;
  title: string;
  description: string;
  iconName: string;
  badge?: string;
  config: Partial<QuestionSessionConfig>;
}

export interface SisterQuestionMatch {
  question: Question;
  similarityScore: number;
  sharedCompetency: string;
  relationshipType: "SAME_COMPETENCY" | "SAME_CLINICAL_TRAP" | "SAME_GUIDELINE" | "PARALLEL_CASE";
}
