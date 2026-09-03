import { MedicalArea } from "./index";

// 1. QUESTION DNA
export interface QuestionDNA {
  format: "clinical_vignette" | "direct_question" | "image_based" | "epidemiological_table" | "dialogue_vignette";
  setting: "primary_care" | "outpatient" | "emergency" | "ward" | "icu" | "maternity" | "delivery_room" | "surgery" | "home" | "public_health";
  task: 
    | "DIAGNOSIS" 
    | "MANAGEMENT" 
    | "TREATMENT" 
    | "INITIAL_APPROACH" 
    | "NEXT_STEP" 
    | "INVESTIGATION" 
    | "EXAM_INTERPRETATION" 
    | "PREVENTION" 
    | "SCREENING" 
    | "EPIDEMIOLOGY" 
    | "PROGNOSIS" 
    | "COMPLICATION" 
    | "PHARMACOLOGY" 
    | "ETHICS" 
    | "SUS" 
    | "PUBLIC_HEALTH" 
    | "LEGAL" 
    | "COMMUNICATION";
  reasoning: 
    | "RECALL" 
    | "INTERPRETATION" 
    | "CLINICAL_REASONING" 
    | "DECISION_MAKING" 
    | "PRIORITIZATION" 
    | "RISK_RECOGNITION" 
    | "PROTOCOL_APPLICATION";
  acuity: "HIGH" | "MEDIUM" | "LOW" | "ELECTIVE";
  susContext: boolean;
  requiresGuideline: boolean;
  requiresCalculation: boolean;
  requiresImage: boolean;
  patientAgeGroup: "NEONATE" | "INFANT" | "CHILD" | "ADOLESCENT" | "ADULT" | "ELDERLY" | "PREGNANT";
  distractorTrapType?: 
    | "CORRECT_DRUG_WRONG_MOMENT"
    | "APPROPRIATE_EXAM_NOT_FIRST"
    | "PLAUSIBLE_DIAGNOSIS_LACKS_CRITERIA"
    | "OVERLY_INVASIVE_CONDUCT"
    | "CONTRAINDICATED_MEDICATION"
    | "IGNORES_PRIMARY_CARE"
    | "IGNORES_INITIAL_STABILIZATION"
    | "SUS_HIERARCHY_VIOLATION";
}

// 2. SISTER QUESTION RELATIONSHIP (SQS)
export type SisterRelationshipTier = "GEMEA" | "IRMA" | "PRIMA" | "RELACIONADA";

export interface SisterQuestionLink {
  id: string;
  sourceQuestionId: string;
  targetQuestionId: string;
  targetQuestionCode: string;
  targetExamEdition: string;
  targetExamYear: number;
  targetOriginalNumber: number;
  targetArea: MedicalArea;
  targetTopic: string;
  targetCompetency: string;
  
  // SQS (Sister Question Score: 0 - 100)
  sqs: number;
  tier: SisterRelationshipTier;
  
  // SQS Sub-scores
  semanticScore: number;       // 45% peso
  topicScore: number;          // 20% peso
  competencyScore: number;     // 15% peso
  decisionScore: number;       // 10% peso
  questionTypeScore: number;   // 5% peso
  clinicalContextScore: number;// 5% peso
  
  sharedDecisionNode: string;  // Ponto decisório compartilhado
  sharedConcept: string;       // Conceito médico nuclear
  sharedTrapPattern?: string;  // Armadilha idêntica da banca
  
  // Vigilância da Questão Irmã
  isTargetGuidelineUpdated?: boolean;
  targetGuidelineNote?: string;
  
  relevanceExplanation: string; // Explicabilidade: "Por que estas questões são irmãs?"
}

// 3. TAXONOMIA E HIERARQUIA
export interface InepCompetency {
  id: string;
  area: MedicalArea;
  specialty: string;
  topic: string;
  subtopic: string;
  name: string;
  description: string;
  inReferenceMatrix: boolean;
  matrixCode?: string;
  matrixDomain?: string;
  historicalOccurrencesCount: number;
  lastEditionSeen: string;
  editionsCoveragePct: number;
}

// 4. TOPIC INTELLIGENCE (IRS & TREND)
export type InepTrendDirection = "RISING" | "STABLE" | "DECLINING" | "CYCLICAL" | "SPORADIC" | "EMERGENT" | "DORMANT" | "INSUFFICIENT_DATA";

export type InepRelevanceCategory = "MUITO_ALTA" | "ALTA" | "MODERADA" | "BAIXA" | "MUITO_BAIXA";

export interface TopicCognitiveBreakdown {
  managementPct: number;       // Conduta / Manejo
  diagnosisPct: number;        // Diagnóstico
  treatmentPct: number;        // Tratamento
  investigationPct: number;    // Investigação / Exames
  preventionPct: number;       // Prevenção / Rastreamento
  susProtocolPct: number;      // Protocolos SUS / Ética
}

export interface InepTopicMetric {
  topicId: string;
  name: string;
  area: MedicalArea;
  specialty: string;
  
  // Frequência Histórica
  totalOccurrences: number;      // Contagem canônica única (sem duplicar cadernos)
  editionsPresentCount: number;  // Ex: 9 edições
  totalEditionsAnalyzed: number; // Ex: 11 edições
  editionCoveragePct: number;    // Ex: 81.8%
  consecutiveEditionsStreak: number;
  firstOccurrenceYear: number;
  lastOccurrenceEdition: string;
  frequencyPerExamAvg: number;   // Média por prova de 100q
  
  // Recência com decaimento temporal
  recencyWeightScore: number;    // 0-100
  
  // Trend Score
  trend: InepTrendDirection;
  trendReason: string;
  occurrencesPerYear: { year: number; edition: string; count: number }[];
  
  // INEP Relevance Score (IRS: 0-100)
  irs: number;
  relevanceCategory: InepRelevanceCategory;
  irsFormulaBreakdown: {
    recurrenceScore: number;       // 30%
    recencyScore: number;          // 20%
    editionCoverageScore: number;  // 15%
    competencyRecurrence: number;  // 15%
    sisterQuestionDensity: number; // 10%
    matrixAlignmentScore: number;  // 10%
  };
  
  // Densidade de Questões Irmãs
  sisterQuestionsCount: number;
  
  // Como o INEP cobra este tema
  cognitiveBreakdown: TopicCognitiveBreakdown;
  primaryCareLevel: "ATENCAO_PRIMARIA" | "URGENCIA_EMERGENCIA" | "AMBULATORIO_ESPECIALIZADO" | "HOSPITALAR";
  inepThinkingPattern: string;   // Ex: "O INEP historicamente foca em..."
  topTrapPatterns: string[];
  
  // Vigilância Clínica
  hasActiveGuidelineUpdate: boolean;
  guidelineStatusNote?: string;
  
  // Personal Priority Score para o Aluno logado
  studentDomainPct?: number;     // Domínio do aluno (0-100%)
  pps?: number;                  // Personal Priority Score (0-100)
  ppsPriorityRank?: number;
  ppsRecommendationReason?: string;
}

// 5. EDITAL WATCH & MONITOR DE EDITAIS
export interface InepEditalNotice {
  edition: string;               // Ex: "2026/2"
  noticeNumber: string;          // Ex: "Edital INEP nº 76, de 12 de junho de 2026"
  noticeDate: string;            // "2026-06-12"
  situation: "VIGENTE" | "RETIFICADO" | "HISTORICO";
  latestRectificationDate?: string;
  latestRectificationNotice?: string;
  officialNoticeUrl: string;
  officialRectificationUrl?: string;
  examDate1stStage: string;      // "2026-09-13"
  examStructure: {
    totalQuestions: number;      // 100
    alternativesPerQuestion: number; // 4 (A-D)
    singleCorrectAnswer: boolean;
    durationHours: number;       // 5h
    period: "MATUTINO_VESPERTINO" | "VESPERTINO";
  };
  referenceMatrixVersion: string; // "Matriz de Correspondência Revalida 2020/2026"
  lastCheckedAt: string;         // Data e hora da última verificação automática
  checkStatus: "UP_TO_DATE" | "NEW_NOTICE_DETECTED" | "MONITORING_ACTIVE";
  changesFromPreviousNotice: {
    category: "FORMATO" | "CRONOGRAMA" | "REGRAS" | "DOCUMENTOS" | "MATRIZ";
    status: "SEM_ALTERACAO" | "ALTERADO" | "NOVO";
    description: string;
  }[];
}

// 6. BACKTESTING ENGINE RECORD
export interface BacktestRunResult {
  id: string;
  trainWindow: string;          // Ex: "2021-2024"
  testEdition: string;          // Ex: "2025/1"
  testYear: number;
  algorithmVersion: string;     // Ex: "INEP_PATTERN_V2.0"
  runTimestamp: string;
  precisionAt10: number;        // Ex: 90.0%
  precisionAt20: number;        // Ex: 85.0%
  topicRecall: number;          // Ex: 82.4%
  competencyRecall: number;     // Ex: 79.1%
  coverageRate: number;         // Ex: 94.2%
  rankingQualityScore: number;  // Ex: 88.6/100
  topPredictedTopics: { topic: string; predictedIRS: number; actualOccurrencesInTestExam: number; hit: boolean }[];
  methodologicalNote: string;
}

// 7. INEP PATTERN ENGINE GLOBAL SUMMARY
export interface InepPatternEngineGlobalSummary {
  algorithmVersion: string;     // "INEP_PATTERN_V2.0-CANONICAL"
  lastModelRecalculation: string;
  totalExamsAnalyzed: number;   // 11
  totalCanonicalQuestions: number; // 1100
  totalTopicsCataloged: number;
  totalCompetenciesCataloged: number;
  totalQuestionRelationships: number;
  totalSisterQuestionPairs: number;
  averageSisterDensityPerTopic: number;
  activeGuidelineUpdatesMapped: number;
  latestNotice: InepEditalNotice;
  backtestAggregatePrecision: number;
}
