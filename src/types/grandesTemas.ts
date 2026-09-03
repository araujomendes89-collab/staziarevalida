export type MedicalAreaId =
  | "clinica-medica"
  | "cirurgia"
  | "cirurgia-geral"
  | "pediatria"
  | "ginecologia-obstetricia"
  | "medicina-preventiva";

export type RecurrenceLevel =
  | "altissima"
  | "alta"
  | "media"
  | "recorrente"
  | "protocolo_atualizado"
  | "prioridade_revisao";

export interface MedicalAreaInfo {
  id: MedicalAreaId;
  name: string;
  shortName: string;
  iconName: string;
  themeCount: number;
  description: string;
  colorTheme: {
    bgLight: string;
    border: string;
    text: string;
    accent: string;
    gradient: string;
  };
  historicalWeight: string;
  topRevalidaTopics: string[];
}

export type ProtocolUpdate = ProtocolUpdateInfo;

export type ThemeStatus = "nao_iniciado" | "em_andamento" | "concluido";

export interface MedicalSource {
  institution: string; // Ex: "Ministério da Saúde / CONITEC"
  document: string; // Ex: "PCDT de Hipertensão Arterial Sistêmica"
  year: string; // Ex: "2024 / 2026"
  version?: string;
  sourceType: "biblioteca_interna" | "oficial_sus" | "sociedade_especialidade" | "inep";
  url?: string;
  lastReviewedDate?: string;
}

export interface ProtocolUpdateInfo {
  previousConduct: string;
  currentConduct: string;
  previousDoc: string;
  currentDoc: string;
  year: string;
  revalidaImpact: string;
  sourceUrl?: string;
}

export interface AlgorithmNode {
  id: string;
  stepNumber: number;
  label: string;
  clinicalScenario: string;
  decisionRule: string;
  action: string;
  rationale: string;
  importantExceptions: string;
  sourceDoc: string;
  children?: string[]; // IDs dos próximos nós
}

export interface ComparativeRow {
  aspect: string;
  conditionA: string;
  conditionB: string;
  conditionC?: string;
  distinguishingKey: string;
}

export interface InepCobrançaAnalysis {
  isHistoricalData: boolean; // Separa DADO HISTÓRICO de ESTIMATIVA DA IA
  totalQuestionsInDb: number;
  observedInExams: string[];
  patientProfiles: string[];
  frequentTriggers: string[];
  mostTestedDiagnosis: string;
  mostTestedConduct: string;
  recurringDistractors: string[];
  cognitiveMatrixPattern: string;
  aiInterpretationNotes?: string;
}

export interface MicroQuestion {
  id: string;
  stageTitle: string;
  clinicalStem: string;
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
    explanation: string;
    clinicalPearl?: string;
  }[];
}

export interface ThemeQuizQuestion {
  id: string;
  type: "historica_revalida" | "inedita_cognitiva";
  yearOrTag: string; // Ex: "Revalida INEP 2024.2" ou "Inédita StaziaMed 2026"
  competency: "Diagnóstico" | "Classificação" | "Tratamento" | "Conduta Imediata" | "Exames";
  stem: string;
  options: {
    id: "A" | "B" | "C" | "D";
    text: string;
    isCorrect: boolean;
    explanation: string;
  }[];
  officialRationale: string;
  sourceRef: string;
}

export interface ThemeLearningModule {
  id: string;
  moduleNumber: number; // 1 to 16
  title: string;
  shortDescription: string;
  type:
    | "visao_geral"
    | "mapa"
    | "reconhecimento"
    | "diagnostico"
    | "classificacao"
    | "conduta"
    | "algoritmo"
    | "diferenciais"
    | "inep_cobra"
    | "pegadinhas"
    | "casos_clinicos"
    | "questoes_revalida"
    | "questoes_ineditas"
    | "revisao_alta_retencao"
    | "teste_final"
    | "fontes";
  contentMarkdown: string;
  keyConcepts?: string[];
  decoreBox?: string;
  attentionBox?: string;
  pegadinhaBox?: string;
  conductSteps?: { step: number; title: string; desc: string; alert?: string }[];
  frequentMistakes?: string[];
  microQuestions?: MicroQuestion[];
}

export interface GrandeTema {
  id: string;
  title: string;
  slug: string;
  areaId: MedicalAreaId;
  areaName: string;
  order: number;
  recurrence: RecurrenceLevel;
  recurrenceBadgeLabel: string;
  historicalFrequencyText: string;
  isHistoricalData: boolean; // DADO HISTÓRICO vs ESTIMATIVA DA IA
  estimatedMinutes: string; // Ex: "25–35 min"
  moduleCount: number; // 16
  relatedQuestionsCount: number;
  priority: "Crítica" | "Alta" | "Média";
  summary: string;
  visualTreeMap: string; // Hierarquia ASCII ou visual do tema
  lastUpdated: string;
  hasProtocolUpdate: boolean;
  protocolUpdate?: ProtocolUpdateInfo;
  modules: ThemeLearningModule[];
  sources: MedicalSource[];
  algorithmNodes?: AlgorithmNode[];
  comparativeTable?: ComparativeRow[];
  inepInsights: InepCobrançaAnalysis;
  finalTestQuestions: ThemeQuizQuestion[];
}

export interface UserThemeProgress {
  themeId: string;
  status: ThemeStatus;
  currentModuleNumber: number;
  completedModules: number[];
  domainPercent: number;
  quizScore?: number;
  quizTotal?: number;
  quizAnsweredAt?: string;
  lastStudiedAt: string;
  isFavorite?: boolean;
  notes?: string;
  weakCompetencies?: string[];
  mistakeQuestionIds?: string[];
}

export interface AreaDomainProfile {
  areaId: MedicalAreaId;
  areaName: string;
  domainPercent: number;
  completedThemesCount: number;
  totalThemesCount: number;
  colorLevel: "green" | "yellow" | "orange" | "red";
}
