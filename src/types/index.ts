export type MedicalArea = 
  | "CLINICA_MEDICA" 
  | "CIRURGIA_GERAL" 
  | "GINECOLOGIA_OBSTETRICIA" 
  | "PEDIATRIA" 
  | "MEDICINA_FAMILIA_COMUNIDADE";

export type QuestionOrigin = "INEP_OFICIAL" | "INEDITA_PRAXIS" | "PLATFORM_ORIGINAL" | "EDITORIAL";

export * from "./questionFactory";
export * from "./session";
import { TrainingMode, QuestionSessionConfig, SessionAnswerState, SessionSummaryReport } from "./session";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export type ErrorTaxonomy = 
  | "KNOWLEDGE_GAP"             // Não sabia o conteúdo teórico
  | "DISTRACTOR_TRAP"           // Caiu em distrator da banca
  | "DIAGNOSIS_VS_CONDUCT"      // Sabia diagnóstico, mas errou a conduta
  | "READING_HASTE"             // Leu rápido demais / desatenção
  | "PROTOCOL_CONFUSION"        // Confundiu protocolo SUS / diretriz
  | "ELIMINATED_RIGHT_ANSWER"   // Fiquei entre duas e troquei
  | "TIME_PRESSURE"             // Errou por falta de tempo
  | "OUTDATED_GUIDELINE"        // Estudou por diretriz desatualizada
  | "GUESS";                    // Chute

// Protocolo de Vigilância Clínica e Normativa
export type ContentStatus = 
  | "CURRENT"                     // Compatível com as diretrizes atuais
  | "REVIEW_REQUIRED"            // Possível atualização detectada (aguardando revisão médica)
  | "UPDATED_GUIDELINE"          // Nova diretriz publicada relevante
  | "PARTIALLY_OUTDATED"         // Parte do conteúdo continua válida, mas alguma recomendação mudou
  | "OUTDATED"                   // A conduta não corresponde mais à recomendação atual
  | "CONTROVERSIAL"              // Diferenças entre diretrizes ou evidências atuais
  | "OFFICIAL_ANSWER_HISTORICAL";// Gabarito oficial preservado, mas conduta atual é diferente

export type GuidelineImpactLevel = "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";

export type ClinicalChangeType = 
  | "DIAGNOSTIC_CRITERIA"
  | "TREATMENT"
  | "DRUG"
  | "DOSAGE"
  | "CONTRAINDICATION"
  | "SCREENING"
  | "PREVENTION"
  | "VACCINATION"
  | "CLASSIFICATION"
  | "RISK_STRATIFICATION"
  | "FOLLOW_UP"
  | "SURGICAL_INDICATION"
  | "LAB_REFERENCE"
  | "PUBLIC_HEALTH_POLICY"
  | "SUS_PROTOCOL"
  | "LEGISLATION"
  | "ETHICS"
  | "OTHER";

export interface GuidelineUpdateInfo {
  status: ContentStatus;
  impactLevel: GuidelineImpactLevel;
  changeType: ClinicalChangeType;
  officialHistoricalAnswer: "A" | "B" | "C" | "D";
  currentRecommendedAnswer: "A" | "B" | "C" | "D";
  atExamTime: string;          // Como era a conduta na época da prova
  currently: string;           // Como é a conduta atual
  reasonForChange: string;     // Por que mudou (evidências, novos trials)
  revalidaImpact: string;      // Impacto para as próximas provas do Revalida
  whatToStudyToday: string;    // O que o médico deve saber hoje
  guidelineTitle: string;
  institution: string;         // Ex: SBC, SBD, MS, FEBRASGO, SBP, GINA, GOLD
  publicationYear: number;
  publicationDate: string;
  lastCheckedDate: string;
  sourceUrl?: string;
  divergentGuidelineNote?: string; // Divergência entre diretriz brasileira vs internacional no contexto SUS
  knowledgeLastReviewedAt: string; // Data da última revisão médica humana
  reviewedBy?: string;         // Médico especialista responsável
  editorialVersion: string;    // Ex: "v3.2"
}

export interface QuestionOption {
  id: "A" | "B" | "C" | "D";
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuestionSource {
  title: string;
  organization: string; // Ex: Ministério da Saúde, FEBRASGO, SBC, SBP
  year: number;
  url?: string;
  reliability: "OFICIAL_INEP" | "DIRETRIZ_MS" | "SOCIEDADE_ESPECIALIDADE" | "EDITORIAL";
}

export interface QuestionOccurrence {
  booklet: string;       // Ex: "Caderno 1 - Azul", "Caderno 2 - Amarelo"
  bookletColor: string;  // "Azul" | "Amarelo" | "Branco" | "Verde"
  originalNumber: number; // Ex: 37
  sourcePage: number;    // Ex: 14
}

export interface QuestionImage {
  file: string;          // Ex: "REV-2023.2-Q0045-01.png"
  caption?: string;
  position: "after_stem" | "in_option" | "clinical_exam";
  originalPage: number;
  url?: string;
}

export interface Question {
  id: string;
  canonicalQuestionId: string; // ID canônico para deduplicação entre cadernos
  questionFingerprint: string;  // Hash do texto normalizado do enunciado
  code: string;                // Ex: REV-2024.1-CM-12
  origin: QuestionOrigin;
  examYear?: number;
  examEdition?: string;        // Ex: "2024/1 - 1ª Etapa Teórica"
  stage?: "TEORICA_OBJETIVA" | "TEORICA_DISCURSIVA";
  originalBooklet?: string;    // Caderno de referência original
  originalNumber?: number;     // Número original no caderno
  sourcePage?: number;         // Página original no PDF oficial do INEP
  sourceDocument?: string;     // Nome do PDF oficial baixado
  sourceDocumentUrl?: string;  // Link oficial no portal gov.br / INEP
  documentSha256?: string;     // Hash SHA-256 do documento oficial

  area: MedicalArea;
  specialty?: string;          // Ex: Cardiologia, Neonatologia, Mastologia
  topic: string;               // Ex: Síndrome Coronariana Aguda, Pré-Eclâmpsia
  subtopic: string;
  competencyId: string;
  competencyDescription: string;
  reasoningType?: "DIAGNOSTICO" | "CONDUTA" | "TRATAMENTO" | "INVESTIGACAO" | "PREVENCAO" | "EPIDEMIOLOGIA" | "SUS" | "EMERGENCIA";
  tags?: string[];
  
  difficulty: "FACIL" | "MEDIO" | "DIFICIL";
  difficultySource?: "INEP" | "AI_ESTIMATE" | "EMPIRICAL_STATS";
  
  clinicalCase: string;
  images?: QuestionImage[];
  imagePromptUrl?: string;
  options: QuestionOption[];
  
  // Gabarito Oficial vs Status
  correctAnswer: "A" | "B" | "C" | "D";
  answerPreliminary?: "A" | "B" | "C" | "D";
  answerFinal: "A" | "B" | "C" | "D" | "ANNULLED";
  officialStatus: "valid" | "annulled" | "changed_after_appeal" | "pending_validation";
  extractionConfidence: "HIGH" | "MEDIUM" | "LOW";

  // Protocolo Permanente de Vigilância de Diretrizes
  guidelineUpdate?: GuidelineUpdateInfo;

  keyFinding: string;          // Pista diagnóstica decisiva
  expectedConduct: string;     // Conduta ouro esperada
  inepIntent: string;          // O que a banca do INEP está avaliando aqui
  sources: QuestionSource[];
  brazilContextNote?: string;  // Dica contextual sobre fluxo no SUS ou termos brasileiros
  occurrences?: QuestionOccurrence[]; // Mapeamento nos outros cadernos

  stats: {
    totalAttempts: number;
    successRate: number; // 0-100
    averageTimeSeconds: number;
  };

  // Metadados do Módulo de Questões Inéditas & Governança Editorial
  generationStatus?: "AI_GENERATED" | "AUTO_VALIDATED" | "MEDICAL_REVIEW" | "APPROVED" | "BETA" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  reviewStatus?: string; // Para compatibilidade retroativa
  is2026Ready?: boolean;
  inepPatternScore?: number; // 0-100
  copyRiskScore?: number;    // 0-100 (<30 excelente)
  qualityScore?: number;     // 0-100
  contentGapScore?: number;  // 0-100
  clinicalVerifiedAt?: string;
  verifiedByDoctor?: string;
  generatorModel?: string;
  generatorPromptVersion?: string;
  reviewModel?: string;
  reviewPromptVersion?: string;
  sisterQuestionIds?: string[];
  distractorAnalysis?: {
    optionId: "A" | "B" | "C" | "D";
    trapType: string;
    clinicalJustification: string;
    plausibilityScore: number;
  }[];
  adversarialReview?: {
    passed: boolean;
    reviewerModel: string;
    testedAmbiguity: boolean;
    testedSingleBestAnswer: boolean;
    identifiedFlaws: string[];
    clinicalNotes: string;
    timestamp: string;
    recommendedAction?: string;
  };
  psychometrics?: {
    totalAnswers: number;
    correctRatePct: number;
    difficultyIndex: number;
    discriminationIndex: number;
    averageTimeSeconds: number;
    distractorEfficiency?: {
      optionA: number;
      optionB: number;
      optionC: number;
      optionD: number;
    };
    flags?: string[];
  };
  versions?: {
    version: number;
    changedBy: string;
    changeReason: string;
    timestamp: string;
    previousStem?: string;
    previousCorrectAnswer?: "A" | "B" | "C" | "D";
  }[];
}

export interface QuestionAttempt {
  id: string;
  questionId: string;
  timestamp: string;
  selectedOption: "A" | "B" | "C" | "D";
  isCorrect: boolean;
  timeSpentSeconds: number;
  activeDurationMs?: number; // Monotonic active time spent on question in ms
  timingVersion?: number; // 1 = High precision monotonic active timing
  confidence: ConfidenceLevel;
  errorReason?: ErrorTaxonomy;
  errorTaxonomy?: ErrorTaxonomy;
  userReflection?: string;
  mode: "STUDY" | "EXAM" | "PRESSURE" | "DUEL";
}

export interface Flashcard {
  id: string;
  questionId?: string;
  area: MedicalArea;
  topic: string;
  front: string; // Pergunta / Gatilho clínico
  back: string; // Resposta / Conduta ouro
  keyMnemonic?: string;

  // FSRS Core State Fields (Source of Truth for Scheduling)
  schedulerVersion?: "FSRS_V1" | "LEGACY_V1";
  stability?: number; // S: Memory stability in days
  difficulty?: number; // D: Difficulty rating (1-10)
  elapsedDays?: number; // Days elapsed since last review
  scheduledDays?: number; // Target days for this interval
  reps?: number; // Total number of reviews
  lapses?: number; // Total number of failed reviews (Again)
  state?: number; // FSRS State: 0=New, 1=Learning, 2=Review, 3=Relearning
  lastReviewed?: string; // ISO date string of last review
  dueDate: string; // ISO date string when card is due for review

  // Legacy Compatibility Fields (Kept in sync for visual components)
  intervalDays: number;
  easeFactor: number; // Legacy SM-2 field (decorative)
  repetitionCount: number;
  masteryLevel: number; // 0-100 indicator
}

export interface KnowledgeNode {
  id: string;
  area: MedicalArea;
  name: string;
  description?: string;
  parentTopic?: string;
  incidenceWeight: number; // Peso no Revalida INEP (1-5)
  userMastery: number; // 0-100%
  expectedPointGain: number; // Ganho esperado de pontos no exame
  riskLevel: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
  totalQuestionsAnswered: number;
  lastStudied?: string;
}

export interface OSCEPatientProfile {
  name: string;
  age: string;
  gender: string;
  personality: string;
  personalityDescription: string;
  chiefComplaint: string;
  hda: string;
  history: string;
  hiddenFindings: string;
  vitalSigns: {
    bp: string;
    hr: string;
    rr: string;
    temp: string;
    sat: string;
  };
  physicalExamFindings: string;
  labAndImagingResults: {
    name: string;
    result: string;
    isAppropriate: boolean;
  }[];
}

export interface OSCEChecklistItem {
  id: string;
  category: "ACOLHIMENTO" | "ANAMNESE" | "EXAME_FISICO" | "RACIOCINIO" | "CONDUTA" | "ORIENTACOES";
  description: string;
  points: number; // peso
  isCritical: boolean; // se zerar perde a estação
}

export interface OSCEStation {
  id: string;
  title: string;
  area: MedicalArea;
  scenarioDescription: string;
  candidateInstructions: string;
  timeLimitSeconds: number; // Padrão Revalida: 600 segundos (10 min)
  difficulty?: "Fácil" | "Média" | "Difícil";
  caseType?: "Oficial INEP" | "Adaptada" | "Inédita";
  competencies?: string[];
  patient: OSCEPatientProfile;
  checklist: OSCEChecklistItem[];
  goldenConduct: string;
  brazilPublicHealthTip: string;
  availableLabs?: { id?: string; name: string; result: string; isAppropriate?: boolean; category?: string }[];
}

export interface OSCEStationAttempt {
  id: string;
  stationId: string;
  timestamp: string;
  durationSeconds: number;
  conversationTranscript: {
    sender: "doctor" | "patient" | "system";
    text: string;
    timestamp: string;
  }[];
  requestedLabs: string[];
  performedPhysicalExams: string[];
  score: number; // 0-100
  scoresByCategory: {
    communication: number;
    anamnesis: number;
    physicalExam: number;
    clinicalReasoning: number;
    conduct: number;
  };
  evaluatedChecklist: {
    itemId: string;
    description: string;
    achieved: boolean;
    feedback: string;
  }[];
  examinerDebrief: string;
  missedCriticalItems: string[];
  unnecessaryActions: string[];
}

export interface RadarUpdate {
  id: string;
  type: "EDITAL" | "PROTOCOLO" | "ATENCAO" | "EPIDEMIOLOGIA";
  badge: string;
  title: string;
  date: string;
  source: string;
  link: string;
  impact: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
  impactDescription: string;
  actionRequired: string;
  urgency?: string;
  category?: string;
  affectedArea?: string;
  summary?: string;
  impactOnExam?: string;
  sourceUrl?: string;
}

export interface UserPreferences {
  studyHoursPerDay?: number;
  studyDaysPerWeek?: number;
  planIntensity?: "MODERADO" | "INTENSIVO" | "REVISAO";
  priorityAreas?: MedicalArea[];
  studyRemindersEnabled?: boolean;
  studyReminderTime?: string;
  appTheme?: "dark" | "light" | "system";
  textSize?: "standard" | "large";
  audioSpeed?: "1.0" | "1.25" | "1.5" | "1.75" | "2.0";
  notificationsEmail?: boolean;
  notificationsPush?: boolean;
  notificationsAlerts?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarSeed?: string;
  graduationCountry: string; // Ex: Bolívia, Paraguai, Argentina, Cuba, etc.
  graduationUniversity: string;
  graduationYear: number;
  targetEdition: string; // Ex: "Revalida INEP 2026/2"
  examType?: "REVALIDA" | "ENAMED";
  examEdition?: string; // Ex: "2026/2"
  examDate: string; // Ex: "2026-09-13"
  isFirstAttempt: boolean;
  previousScore?: number;
  dailyStudyMinutes: number;
  availableDaysPerWeek: number;
  weakAreas: MedicalArea[];
  role: "STUDENT" | "EDITOR" | "ADMIN";
  tier: "TRIAL" | "EXPIRED" | "FREE" | "PRO" | "PRO_PLUS" | "ADMIN";
  plan?: "trial" | "expired" | "pro" | "pro_plus" | "admin";
  trialStartedAt?: string;
  trialEndsAt?: string;
  subscriptionExpiresAt?: string;
  planUpdatedAt?: string;
  isOnboardingCompleted: boolean;
  hasConfiguredExamDate?: boolean;
  hasSeenWelcomeHero?: boolean;
  studyStreakDays: number;
  totalQuestionsSolved: number;
  overallReadiness: number; // 0-100%
  projectedPassScoreMin: number;
  projectedPassScoreMax: number;
  preferences?: UserPreferences;
}

export interface StudyMission {
  id: string;
  title: string;
  estimatedMinutes: number;
  targetArea: MedicalArea;
  focusTopic: string;
  rationale: string;
  tasks: {
    type: "REVIEW" | "QUESTIONS" | "ERROR_AUTOPSY" | "FLASHCARDS" | "OSCE";
    description: string;
    count?: number;
    minutes: number;
    completed: boolean;
  }[];
}

// Inventário Oficial de Provas (2021-2026)
export interface RevalidaEditionInventory {
  id: string;
  year: number;
  editionLabel: string; // Ex: "2024/1 - 1ª Edição"
  officialNotice: string; // Edital nº X/INEP
  examDate: string;
  stage: "1ª Etapa (Teórica)" | "2ª Etapa (Habilidades Clínicas)" | "Prova Única Objetiva";
  booklets: {
    color: string;
    code: string;
    pdfFileName: string;
    officialUrl: string;
    sha256: string;
    pages: number;
    status: "DOWNLOADED" | "VALIDATED" | "EXTRACTED" | "CANONICALIZED";
  }[];
  objectiveCount: number; // 100
  annulledQuestions: number[]; // e.g. [14, 42]
  excludedQuestions?: number[]; // e.g. [2, 40, 88] por TRI
  alteredQuestions: { questionNumber: number; from: string; to: string }[];
  preliminaryKeyUrl: string;
  finalKeyUrl: string;
  status: "100% EXTRAÍDO E VALIDADO" | "VALIDAÇÃO EM ANDAMENTO";
}

// Banco de Diretrizes e Protocolos (Guideline Watch)
export interface MedicalGuideline {
  id: string;
  title: string;
  institution: string; // SBC, SBD, MS, FEBRASGO, SBP, GINA, GOLD, ILAS, etc.
  specialty: string;
  topic: string;
  publicationYear: number;
  publicationDate: string;
  effectiveDate: string;
  version: string;
  country: "BRASIL" | "INTERNACIONAL";
  sourceUrl: string;
  supersedesGuidelineId?: string; // e.g. "guideline-sbc-2020"
  status: "CURRENT" | "SUPERSEDED" | "UNDER_REVISION";
  affectedQuestionsCount: number;
  lastCheckedAt: string;
}

// Log de Auditoria Editorial
export interface GuidelineAuditLog {
  id: string;
  questionId: string;
  questionCode: string;
  previousStatus: ContentStatus;
  newStatus: ContentStatus;
  guidelineTitle: string;
  changedBy: string;
  approvedBy: string;
  timestamp: string;
  reason: string;
  impactLevel: GuidelineImpactLevel;
}

// Alerta de Guideline Watch
export interface GuidelineWatchAlert {
  id: string;
  guidelineId: string;
  guidelineTitle: string;
  institution: string;
  detectedDate: string;
  affectedQuestionsCount: number;
  criticalChangesCount: number;
  summary: string;
  actionRequired: string;
  status: "PENDING_REVIEW" | "REVIEWED" | "APPLIED";
}

// -------------------------------------------------------------
// FIRESTORE COLLECTIONS SCHEMAS
// -------------------------------------------------------------

/**
 * Schema for 'users' collection (/users/{userId})
 */
export interface UserProfileDoc extends UserProfile {
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Schema for 'sessions' collection (/sessions/{sessionId})
 */
export interface TrainingSessionDoc {
  id: string;
  userId: string;
  title: string;
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
  paused?: boolean;
  summaryReport?: SessionSummaryReport;
}

/**
 * Schema for 'progress' collection (/progress/{progressId})
 */
export interface UserProgressDoc {
  id: string;
  userId: string;
  missionDate: string;
  todayMission: StudyMission;
  knowledgeGraphNodes: KnowledgeNode[];
  studyStreakDays: number;
  totalQuestionsSolved: number;
  overallReadiness: number;
  projectedPassScoreMin: number;
  projectedPassScoreMax: number;
  flashcardStats?: {
    total: number;
    dueToday: number;
    mastered: number;
  };
  lastActiveDate: string;
  updatedAt: string;
}

/**
 * Schema for 'errors' collection (/errors/{errorId}) - Error Autopsy & Remediation
 */
export interface ErrorAutopsyDoc {
  id: string;
  userId: string;
  questionId: string;
  questionCode: string;
  area: MedicalArea;
  topic: string;
  subtopic: string;
  selectedOption: "A" | "B" | "C" | "D";
  correctOption: "A" | "B" | "C" | "D";
  timeSpentSeconds: number;
  confidence: ConfidenceLevel;
  errorReason: ErrorTaxonomy;
  userReflection?: string;
  keyFinding?: string;
  expectedConduct?: string;
  inepIntent?: string;
  remedialCardCreated?: boolean;
  remedialCardId?: string;
  resolutionStatus: "PENDING_REVIEW" | "REMEDIATED" | "MASTERED";
  retestAttempts?: {
    timestamp: string;
    isCorrect: boolean;
    mode: string;
  }[];
  timestamp: string;
  updatedAt?: string;
}

// -------------------------------------------------------------
// GROUNDED RADAR, AUDIO FLASH & CALENDAR SYNC TYPES
// -------------------------------------------------------------

export interface GroundedGuidelineAuditResult {
  guidelineId: string;
  guidelineTitle: string;
  institution: string;
  status: "CONFIRMED_CURRENT" | "OUTDATED_DETECTED" | "CONTROVERSIAL";
  groundingSources: {
    title: string;
    url: string;
    snippet: string;
  }[];
  verifiedDate: string;
  clinicalSummary: string;
  inepImpactLevel: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
  recommendedConduct: string;
  obsoleteConducts: string[];
}

export interface ClinicalAudioSummary {
  id: string;
  theme: string;
  area: MedicalArea;
  title: string;
  durationSeconds: number;
  keyPoints: string[];
  audioScript: string;
  guidelineRef: string;
  highYieldDoseOrProtocol: string;
}

export interface WeeklyReadinessBulletin {
  id: string;
  generatedDate: string;
  reportDate?: string;
  userEmail: string;
  userName: string;
  targetEdition: string;
  daysRemaining: number;
  currentPPS: number;
  previousPPS: number;
  deltaPPS: number;
  overallReadiness: number;
  projectedPassScoreMin: number;
  projectedPassScoreMax: number;
  status: "APROVADO_PROJETADO" | "ZONA_LIMÍTROFE" | "ZONA_DE_ALERTA";
  studyStreakDays: number;
  questionsSolvedThisWeek: number;
  totalQuestionsSolved: number;
  areaPerformances: {
    area: MedicalArea;
    accuracy: number;
    weight: number;
    status: "EXCELENTE" | "ADEQUADO" | "CRITICO";
  }[];
  topYieldTopicsToGainPoints: {
    area: MedicalArea;
    topic: string;
    estimatedPointGain: number;
    currentMastery: number;
    incidenceWeight: number;
    urgency: "ALTA" | "CRITICA" | "MEDIA";
    reason: string;
    actionableAdvice: string;
  }[];
  errorAutopsySummary: {
    mostFrequentErrorType: ErrorTaxonomy;
    totalErrorsRecorded: number;
    pendingReviewCount: number;
    remediatedCount: number;
    recommendedRemediation: string;
  };
  aiStudyPrescription: string;
  updatedAt?: string;
}

// -------------------------------------------------------------
// PROTOCOLOS & ATUALIZAÇÕES REVALIDA 2025-2026 SCHEMAS
// -------------------------------------------------------------

export type UpdatePriority =
  | "PRIORIDADE_1_MUITO_ALTA"
  | "PRIORIDADE_2_ALTA"
  | "PRIORIDADE_3_MODERADA"
  | "PRIORIDADE_4_BAIXA";

export type UpdateYearTag =
  | "ATUALIZACAO_2025"
  | "ATUALIZACAO_2026"
  | "ATUALIZADO_2025_E_2026";

export type ValidationEditorialStatus =
  | "VALIDADO_OFICIAL_SUS"
  | "AGUARDANDO_VALIDACAO_EDITORIAL";

export interface ProtocolAffectedQuestion {
  questionId: string;
  examCode: string;
  questionNumber: number;
  year: number;
  gabarito_original: string;
  o_que_mudou_2025: string;
  o_que_mudou_2026?: string;
  conduta_vigente: string;
  aviso_desatualizacao: string;
}

export interface ProtocolFlashcard {
  id: string;
  type: "O_QUE_MUDOU" | "DATA_PROTOCOLO" | "PEGADINHA";
  front: string;
  back: string;
  tag: string;
}

export interface ProtocolIneditaQuestion {
  id: string;
  difficulty: "FACIL" | "MEDIO" | "DIFICIL" | "COMPARATIVA_ANTIGO_VS_ATUAL";
  statement: string;
  options: {
    id: "A" | "B" | "C" | "D";
    text: string;
    justification: string;
    isOldProtocolTrap?: boolean;
  }[];
  correctAnswer: "A" | "B" | "C" | "D";
  commentary: string;
  protocolo: string;
  fonte_oficial: string;
  ano_atualizacao: "2025" | "2026";
}

export interface ProtocolUpdate {
  id: string;
  tema: string;
  area: MedicalArea;
  subtema: string;
  tag_ano: UpdateYearTag;
  nivel_prioridade: UpdatePriority;
  data_publicacao: string; // MM/AAAA
  instituicao: string; // MS, CONITEC, PNI, INCA, ANVISA, SBC, SBD, FEBRASGO, SBP, etc.
  nome_documento: string;
  url_oficial: string;
  
  // Comparação Temporal Obrigatória
  recomendacao_pre_2025: string;
  atualizacao_2025: string;
  atualizacao_2026?: string;
  conduta_vigente: string;
  
  // Impacto e Pegadinhas
  impacto_clinico: string;
  impacto_revalida: string;
  pegadinha: string;
  
  // Governança Editorial
  ultima_verificacao: string;
  status: ValidationEditorialStatus;
  
  // Módulos complementares integrados
  affected_exam_questions?: ProtocolAffectedQuestion[];
  flashcards?: ProtocolFlashcard[];
  ineditas?: ProtocolIneditaQuestion[];
}

export interface ProtocolUpdatesSummaryDoc {
  id: string;
  totalUpdates: number;
  updates2025Count: number;
  updates2026Count: number;
  bothYearsCount: number;
  priority1Count: number;
  priority2Count: number;
  priority3Count: number;
  priority4Count: number;
  lastSyncAt: string;
}




