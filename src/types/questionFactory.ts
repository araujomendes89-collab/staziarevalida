import { MedicalArea, QuestionOption, QuestionSource, GuidelineUpdateInfo, QuestionOccurrence } from "./index";
import { QuestionDNA } from "./inepPatternEngine";

// 1. Origem e Status de Geração
export type QuestionOriginExtended = 
  | "INEP_OFICIAL" 
  | "PLATFORM_ORIGINAL" 
  | "INEDITA_PRAXIS" 
  | "EDITORIAL";

export type GenerationStatus = 
  | "AI_GENERATED"          // Recém gerada por IA (em validação técnica)
  | "AUTO_VALIDATED"        // Passou nas validações automáticas de IA
  | "MEDICAL_REVIEW"        // Em fila de revisão médica humana
  | "APPROVED"              // Aprovada por médico especialista
  | "BETA"                  // Publicada em modo beta (coletando psicometria)
  | "PUBLISHED"             // Publicada oficialmente para todos os alunos
  | "REJECTED"              // Rejeitada no controle de qualidade
  | "ARCHIVED";             // Arquivada / Substituída

// 2. Análise Estruturada de Distratores (Distractor Engine)
export type DistractorTrapType =
  | "CORRECT_BUT_NOT_FIRST_STEP"       // Conduta correta, mas não no momento inicial
  | "PLAUSIBLE_DIFFERENTIAL"           // Diagnóstico diferencial verossímil sem critérios completos
  | "WRONG_TIMING"                     // Momento terapêutico incorreto
  | "WRONG_DRUG"                       // Fármaco não indicado
  | "WRONG_DOSE"                       // Posologia incorreta
  | "UNNECESSARY_TEST"                 // Exame invasivo/caro desnecessário
  | "INCOMPLETE_MANAGEMENT"            // Conduta incompleta (esqueceu pilar essencial)
  | "OUTDATED_CONDUCT"                 // Conduta de diretriz antiga
  | "MISAPPLIED_GUIDELINE"             // Diretriz aplicada em contexto inadequado
  | "IGNORES_STABILIZATION"            // Pula estabilização clínica (ABCDE)
  | "IGNORES_SUS_CONTEXT";             // Viola fluxos/hierarquia da rede SUS

export interface DistractorAnalysisItem {
  optionId: "A" | "B" | "C" | "D";
  trapType: DistractorTrapType;
  clinicalJustification: string;
  plausibilityScore: number; // 0-100 (quão plausível é para um médico desatento)
}

// 3. Revisão Adversarial (Adversarial Review)
export interface AdversarialReview {
  passed: boolean;
  reviewerModel: string;
  testedAmbiguity: boolean;
  testedSingleBestAnswer: boolean;
  identifiedFlaws: string[];
  clinicalNotes: string;
  timestamp: string;
  recommendedAction: "APPROVE" | "REWRITE_DISTRACTORS" | "REWRITE_CASE" | "FLAG_AMBIGUOUS" | "REJECT";
}

// 4. Checagem de Originalidade & Copy Risk
export interface OriginalityAssessment {
  copyRiskScore: number; // 0-100 (<30 Aceito, 31-50 Revisão, >50 Rejeitado)
  verdict: "ACCEPT" | "REVIEW" | "REJECT";
  stemSimilarityPct: number;
  caseSimilarityPct: number;
  optionSimilarityPct: number;
  structureSimilarityPct: number;
  topNearestOfficialQuestions: {
    questionId: string;
    code: string;
    topic: string;
    similarityScore: number; // 0-100
    sharedConcept: string;
    differentiatingAspect: string;
  }[];
}

// 5. Versionamento de Questões
export interface QuestionVersionRecord {
  version: number;
  changedBy: string;
  changeReason: string;
  timestamp: string;
  previousStem?: string;
  previousCorrectAnswer?: "A" | "B" | "C" | "D";
}

// 6. Psicometria & Calibração
export interface PsychometricMetrics {
  totalAnswers: number;
  correctRatePct: number;       // Taxa de acerto (0-100%)
  difficultyIndex: number;      // Grau de facilidade/dificuldade (0.0 - 1.0)
  discriminationIndex: number;  // Índice de discriminação D (-1.0 a +1.0)
  averageTimeSeconds: number;
  distractorEfficiency: {
    optionA: number; // % escolhas
    optionB: number;
    optionC: number;
    optionD: number;
  };
  flags: ("HIGH_DISCRIMINATION" | "LOW_DISCRIMINATION" | "NEGATIVE_DISCRIMINATION" | "ANOMALOUS_DISTRACTOR" | "HEALTHY")[];
}

// 7. CONTENT GAP ENGINE
export interface ContentGapItem {
  id: string;
  competencyId: string;
  competencyName: string;
  area: MedicalArea;
  specialty: string;
  topic: string;
  subtopic: string;
  
  // Relevância
  inepRelevanceScore: number;    // IRS (0-100)
  matrixRelevance: number;        // Peso na matriz do edital (0-100)
  recentTrendWeight: number;      // Tendência recente (0-100)
  
  // Quantitativo de Questões
  officialQuestionsCount: number;
  originalQuestionsCount: number;
  totalQuestionsCount: number;
  
  // Déficits e Riscos
  competencyDeficit: number;      // Grau de carência da competência (0-100)
  questionScarcity: number;       // Escassez de itens atualizados (0-100)
  outdatedGuidelineRisk: boolean; // Se as questões oficiais existentes usam diretriz antiga
  
  // Score Final de Lacuna
  contentGapScore: number;        // Content Gap Score (0-100)
  priorityTier: "URGENTE" | "ALTA" | "MEDIA" | "BAIXA";
  recommendedGenerationCount: number;
  
  // Vínculos
  topRelatedOfficialQuestionIds: string[];
  currentGuidelineTitle: string;
  currentGuidelineYear: number;
  currentGuidelineOrg: string;
}

// 8. PLANO DE GERAÇÃO & JOBS
export interface GenerationPlanAreaBreakdown {
  area: MedicalArea;
  areaName: string;
  count: number;
  percentage: number;
  primaryGaps: string[];
}

export interface GenerationPlan {
  id: string;
  name: string;
  createdAt: string;
  targetCount: number;
  distributionByArea: GenerationPlanAreaBreakdown[];
  selectedCompetencyIds: string[];
  totalCompetenciesCount: number;
  highPriorityCount: number;
  matrixCoverageGapsCount: number;
  basedOnRecentUpdatesCount: number;
  status: "DRAFT" | "APPROVED" | "EXECUTING" | "COMPLETED";
  estimatedTimeSeconds: number;
}

export type PipelineStage = 
  | "IDLE"
  | "LOAD_THEME"
  | "SELECT_COMPETENCY"
  | "ANALYZE_CONTENT_GAP"
  | "LOAD_INEP_PATTERN"
  | "LOAD_OFFICIAL_QUESTIONS"
  | "BUILD_QUESTION_DNA"
  | "LOAD_CURRENT_GUIDELINE"
  | "GENERATE_CLINICAL_CASE"
  | "GENERATE_CORRECT_ANSWER"
  | "GENERATE_DISTRACTORS"
  | "GENERATE_EXPLANATION"
  | "VALIDATE_MEDICINE"
  | "VALIDATE_SINGLE_BEST_ANSWER"
  | "CHECK_ORIGINALITY"
  | "CALCULATE_QUALITY"
  | "SEND_TO_REVIEW"
  | "COMPLETED"
  | "FAILED";

export interface GenerationJobLog {
  timestamp: string;
  stage: PipelineStage;
  message: string;
  type: "info" | "success" | "warning" | "error";
  details?: any;
}

export interface GenerationJob {
  id: string;
  planId?: string;
  competencyId: string;
  competencyName: string;
  topic: string;
  area: MedicalArea;
  requestedCount: number;
  generatedCount: number;
  approvedCount: number;
  failedCount: number;
  currentStage: PipelineStage;
  progressPct: number;
  status: "QUEUED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";
  logs: GenerationJobLog[];
  generatedQuestionId?: string;
  createdAt: string;
  completedAt?: string;
}

// 9. COBERTURA DA MATRIZ DO INEP
export interface MatrixAreaCoverage {
  area: MedicalArea;
  areaName: string;
  totalCompetencies: number;
  coveredCompetencies: number;
  coveragePct: number;
  coveragePercentage?: number;
  officialQuestionsCount: number;
  originalQuestionsCount: number;
  gapCount: number;
  gapsIdentified?: string[];
  topDeficitTopics: { topic: string; deficitScore: number; covered: boolean }[];
}

// 10. THEME INEP DNA (ENGENHARIA REVERSA DO TEMA)
export interface ThemeGuidelineSource {
  title: string;
  institution: string;
  publicationDate: string;
  version: string;
  country: string;
  url: string;
  verifiedAt: string;
  superseded: boolean;
  hierarchyLevel: 1 | 2 | 3; // 1 = MS/PCDT/CONITEC/ANVISA/PNI/SUS; 2 = Sociedades Brasileiras; 3 = Internacionais (WHO/PAHO/GINA/GOLD/ADA/KDIGO/etc.)
}

export interface CompetencyBlueprintItem {
  id: string;
  competency: string;
  microcompetencies: string[];
  targetCount: number;
  officialCount: number;
  ineditaApprovedCount: number;
  clinicalSetting: "PRIMARY_CARE" | "OUTPATIENT" | "EMERGENCY" | "WARD" | "ICU" | "SURGERY" | "MATERNITY" | "DELIVERY_ROOM" | "PUBLIC_HEALTH";
  reasoningType: "RECALL" | "INTERPRETATION" | "CLINICAL_REASONING" | "DECISION_MAKING" | "PRIORITIZATION" | "PROTOCOL_APPLICATION";
  questionType: "DIAGNOSIS" | "NEXT_BEST_STEP" | "INITIAL_MANAGEMENT" | "TREATMENT" | "INVESTIGATION" | "EXAM_INTERPRETATION" | "COMPLICATION" | "PREVENTION" | "SCREENING" | "RISK_STRATIFICATION" | "PHARMACOLOGY" | "EPIDEMIOLOGY" | "SUS" | "ETHICS" | "PUBLIC_HEALTH";
}

export interface ThemeInepDna {
  id: string;
  theme: string;
  area: MedicalArea;
  specialty: string;
  parentTopic?: string;
  
  // Frequência Histórica no INEP
  canonicalOfficialQuestionsCount: number;
  canonicalQuestionIds: string[];
  
  // 1. Padrões Históricos de Cobrança (%)
  historical_patterns: {
    diagnosis: number;
    severity_recognition: number;
    initial_management: number;
    pharmacology_protocol: number;
    delivery_decision?: number;
    complications: number;
    epidemiology_sus: number;
    [key: string]: number | undefined;
  };

  // 2. Tipos de Raciocínio (%)
  reasoning: {
    clinical_decision: number;
    interpretation: number;
    prioritization: number;
    protocol_application: number;
    recall?: number;
  };

  // 3. Níveis Assistenciais / Ambientes Clínicos (%)
  settings: {
    emergency: number;
    primary_care: number;
    maternity?: number;
    outpatient: number;
    ward_icu: number;
    public_health: number;
  };

  // 4. Padrões Recorrentes de Distratores (%)
  distractor_patterns: {
    plausible_differential: number;
    correct_but_not_first_step: number;
    incomplete_management: number;
    wrong_timing: number;
    wrong_drug_or_dose: number;
    unnecessary_test: number;
    outdated_conduct: number;
    misapplied_guideline: number;
    ignores_stabilization: number;
    ignores_sus_context: number;
  };

  // 5. Diretriz Vigente 2026
  currentGuideline: ThemeGuidelineSource;

  // 6. Matriz Revalida e Status 2026
  matrixRelevance: number; // 0-100
  inepRelevanceScore: number; // IRS 0-100
  is2026Ready: boolean;
  contentGapScore: number;
}

// 11. QUESTION BLUEPRINT (META DE 50 QUESTÕES INÉDITAS POR TEMA)
export interface FiftyQuestionBlueprint {
  themeId: string;
  theme: string;
  area: MedicalArea;
  specialty: string;
  targetCount: 50;
  
  // Status Quantitativo
  approvedCount: number;
  inReviewCount: number;
  rejectedCount: number;
  missingCount: number;
  coveragePct: number; // (approvedCount / 50) * 100
  
  // Distribuição Balanceada das 50 Questões
  competenciesDistribution: CompetencyBlueprintItem[];
  
  // Índices de Qualidade da Amostra
  diversityScore: number; // 0-100
  averageQqs: number;     // 0-100
  averageCopyRisk: number; // 0-100
  adversarialPassRate: number; // 0-100
  singleBestAnswerRate: number; // %
  
  // Relatório de Cobertura
  coverageReport: {
    totalCompetencies: number;
    coveredCompetencies: number;
    historicalIneDistributionVs50: {
      category: string;
      historicalPct: number;
      blueprint50Pct: number;
    }[];
    matrixCompetenciesCovered: string[];
    outdatedGuidelineCount: number;
    lastGeneratedBatchAt?: string;
  };

  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED_50" | "SOURCE_REQUIRED" | "NEEDS_UPDATE";
}

export interface IneditaQuestionMetadata {
  is2026Ready: boolean;
  inepPatternScore: number; // 0-100
  copyRiskScore: number;   // 0-100
  qualityScore: number;    // 0-100
  generationStatus: GenerationStatus;
  clinicalVerifiedAt?: string;
  verifiedByDoctor?: string;
  generatorModel?: string;
  generatorPromptVersion?: string;
  reviewModel?: string;
  reviewPromptVersion?: string;
  sisterQuestionIds: string[];
  questionDNA?: QuestionDNA;
  distractorAnalysis?: DistractorAnalysisItem[];
  adversarialReview?: AdversarialReview;
  originality?: OriginalityAssessment;
  psychometrics?: PsychometricMetrics;
  versions?: QuestionVersionRecord[];
  contentGapScore?: number;
}
