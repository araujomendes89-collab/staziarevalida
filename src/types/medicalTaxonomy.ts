/**
 * Medical Segmentation & Taxonomy Types (Etapa 1.28C).
 * Defines the 5 canonical areas, specialty domains, StaziaMed canonical topics,
 * document segments, and structured source content.
 * Strictly preserves verbatim source fidelity with zero generative rewriting.
 */

import { ExtractedPdfTable } from "./pdfIngestion";
import { ResolvedSourceFigure } from "./pdfOcr";

/**
 * 5 Canonical Medical Areas used by StaziaMed Revalida architecture.
 */
export type CanonicalMedicalArea =
  | "CLINICA_MEDICA"
  | "CIRURGIA"
  | "PEDIATRIA"
  | "GINECOLOGIA_OBSTETRICIA"
  | "MEDICINA_PREVENTIVA";

export const CANONICAL_MEDICAL_AREAS: readonly CanonicalMedicalArea[] = [
  "CLINICA_MEDICA",
  "CIRURGIA",
  "PEDIATRIA",
  "GINECOLOGIA_OBSTETRICIA",
  "MEDICINA_PREVENTIVA",
] as const;

export const CANONICAL_AREA_LABELS: Record<CanonicalMedicalArea, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA: "Cirurgia Geral",
  PEDIATRIA: "Pediatria",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  MEDICINA_PREVENTIVA: "Medicina Preventiva e Social",
};

/**
 * Taxonomy Version Stamp
 */
export const STAZIAMED_TAXONOMY_VERSION = "2026.1.0";

/**
 * Canonical Topic Entry in StaziaMed Taxonomy Registry (STAZIAMED_CANONICAL_TOPICS)
 */
export interface CanonicalTopicDefinition {
  id: string; // e.g. "top_has", "top_ic", "top_diabetes"
  area: CanonicalMedicalArea;
  specialty: string;
  name: string;
  synonyms: string[];
  keywords: string[];
}

/**
 * Registry of StaziaMed Canonical Topics (75 topics distributed across the 5 areas).
 * Note: These are STAZIAMED_CANONICAL_TOPICS, distinct from legacy questions dataset.
 */
export const STAZIAMED_CANONICAL_TOPICS: readonly CanonicalTopicDefinition[] = [
  // --- CLÍNICA MÉDICA ---
  {
    id: "top_has",
    area: "CLINICA_MEDICA",
    specialty: "Cardiologia",
    name: "Hipertensão Arterial Sistêmica",
    synonyms: ["HAS", "Hipertensão Arterial", "Pressão Alta", "Crise Hipertensiva", "Emergência Hipertensiva"],
    keywords: ["pressao", "sistolica", "diastolica", "anti-hipertensivo", "loas", "mapa", "mrpa"],
  },
  {
    id: "top_ic",
    area: "CLINICA_MEDICA",
    specialty: "Cardiologia",
    name: "Insuficiência Cardíaca",
    synonyms: ["IC", "Insuficiência Cardíaca Congestiva", "ICC", "ICFEr", "ICFEp"],
    keywords: ["fracao de ejecao", "bnp", "dapagli", "empagli", "betabloqueador", "ieca", "dispneia"],
  },
  {
    id: "top_dac",
    area: "CLINICA_MEDICA",
    specialty: "Cardiologia",
    name: "Doença Arterial Coronariana & SCA",
    synonyms: ["SCA", "Infarto Agudo do Miocárdio", "IAM", "Angina Instável", "Angina Estável"],
    keywords: ["troponina", "eletrocardiograma", "supra", "infra", "angioplastia", "dupla antiagregacao"],
  },
  {
    id: "top_diabetes",
    area: "CLINICA_MEDICA",
    specialty: "Endocrinologia",
    name: "Diabetes Mellitus Tipo 1 e Tipo 2",
    synonyms: ["DM1", "DM2", "Cetoacidose Diabética", "CAD", "EHH"],
    keywords: ["glicemia", "hba1c", "metformina", "insulina", "glicosuria", "insulinas"],
  },
  {
    id: "top_tireoide",
    area: "CLINICA_MEDICA",
    specialty: "Endocrinologia",
    name: "Doenças da Tireoide",
    synonyms: ["Hipotireoidismo", "Hipertireoidismo", "Tireoidite", "Doença de Graves", "Hashimoto"],
    keywords: ["tsh", "t4 livre", "anti-tpo", "levotiroxina", "metimazol", "propiltiouracil"],
  },
  {
    id: "top_drc",
    area: "CLINICA_MEDICA",
    specialty: "Nefrologia",
    name: "Doença Renal Crônica & Injúria Renal Aguda",
    synonyms: ["DRC", "IRA", "Insuficiência Renal", "KDIGO", "Síndrome Urêmica"],
    keywords: ["creatinina", "taxa de filtracao", "proteinuria", "hemodialise", "hipercalemia"],
  },
  {
    id: "top_asma_dpoc",
    area: "CLINICA_MEDICA",
    specialty: "Pneumologia",
    name: "Asma & DPOC",
    synonyms: ["Doença Pulmonar Obstrutiva Crônica", "Bronquite", "Enfisema", "Crise Asmática"],
    keywords: ["espirometria", "vef1", "broncodilatador", "corticoide inalatorio", "oxigenioterapia"],
  },
  {
    id: "top_pneumonia_adulto",
    area: "CLINICA_MEDICA",
    specialty: "Infectologia / Pneumologia",
    name: "Pneumonia Adquirida na Comunidade no Adulto",
    synonyms: ["PAC", "Pneumonia Comunitária", "Infeccao Pulmonar"],
    keywords: ["curb-65", "amoxicilina", "claritromicina", "ceftriaxona", "infiltrado pulmonar"],
  },
  {
    id: "top_hiv",
    area: "CLINICA_MEDICA",
    specialty: "Infectologia",
    name: "Infecção pelo HIV & Doenças Oportunistas",
    synonyms: ["HIV", "AIDS", "SIDA", "TARV", "Terapia Antirretroviral"],
    keywords: ["cd4", "carga viral", "dolutegravir", "tenofovir", "lamivudina", "pneumocistose"],
  },
  {
    id: "top_arboviroses",
    area: "CLINICA_MEDICA",
    specialty: "Infectologia",
    name: "Arboviroses (Dengue, Chikungunya e Zika)",
    synonyms: ["Dengue", "Chikungunya", "Zika", "Febre Amarela"],
    keywords: ["prova do laco", "plaquetopenia", "hematocrito", "hidratacao venosa", "grupo c", "grupo d"],
  },
  {
    id: "top_avc",
    area: "CLINICA_MEDICA",
    specialty: "Neurologia",
    name: "Acidente Vascular Cerebral (Isquêmico & Hemorrágico)",
    synonyms: ["AVC", "AVE", "AVCi", "AVCh", "Trombólise Cerebral"],
    keywords: ["nihss", "alteplase", "janela terapeutica", "tomografia de cranio", "delta t"],
  },

  // --- CIRURGIA GERAL ---
  {
    id: "top_abdomen_agudo",
    area: "CIRURGIA",
    specialty: "Cirurgia Geral",
    name: "Abdome Agudo (Inflamatório, Obstrutivo e Perfurativo)",
    synonyms: ["Apendicite Aguda", "Colecistite Aguda", "Diverticulite", "Obstrução Intestinal", "Ulcera Perfurada"],
    keywords: ["blumberg", "murphy", "laparotomia", "videolaparoscopia", "peritonite", "pneumoperitonio"],
  },
  {
    id: "top_trauma_atls",
    area: "CIRURGIA",
    specialty: "Trauma",
    name: "Atendimento Inicial ao Politraumatizado (ATLS)",
    synonyms: ["Trauma", "ATLS", "Politrauma", "Choque Hemorrágico", "FAST"],
    keywords: ["abcde", "via aerea", "pneumotorax hipertensivo", "dreno de torax", "colar cervical"],
  },
  {
    id: "top_hernias",
    area: "CIRURGIA",
    specialty: "Cirurgia Geral",
    name: "Hérnias da Parede Abdominal",
    synonyms: ["Hérnia Inguinal", "Hérnia Femoral", "Hérnia Umbilical", "Hérnia Incisional"],
    keywords: ["canal inguinal", "tela de polipropileno", "lichtenstein", "encarceramento", "estrangulamento"],
  },
  {
    id: "top_queimaduras",
    area: "CIRURGIA",
    specialty: "Trauma / Cirurgia Plástica",
    name: "Queimaduras & Manejo de Feridas",
    synonyms: ["Grande Queimado", "Fórmula de Parkland", "Regra dos Nove"],
    keywords: ["parkland", "ringer lactato", "superficie corporal queimada", "debridamento", "escara"],
  },

  // --- PEDIATRIA ---
  {
    id: "top_puericultura_desenvolvimento",
    area: "PEDIATRIA",
    specialty: "Puericultura",
    name: "Crescimento, Desenvolvimento & Aleitamento Materno",
    synonyms: ["Puericultura", "Marcos do Desenvolvimento", "Curvas da OMS", "Aleitamento Materno Exclusivo"],
    keywords: ["escore z", "percentil", "leite materno", "desmame", "marcos motores", "social"],
  },
  {
    id: "top_imunizacao_pediatrica",
    area: "PEDIATRIA",
    specialty: "Infectologia Pediátrica",
    name: "Calendário Nacional de Vacinação da Criança",
    synonyms: ["Vacinação Pediátrica", "PNI", "Vacinas da Infância", "BCG", "Pentavalente"],
    keywords: ["pni", "vacina", "calendario", "contraindicacao", "efeito adverso", "vip", "vop"],
  },
  {
    id: "top_ira_pediatrica",
    area: "PEDIATRIA",
    specialty: "Pneumologia Pediátrica",
    name: "Infecções Respiratórias Agudas na Infância",
    synonyms: ["Bronquiolite Viral Aguda", "BVA", "Pneumonia Pediátrica", "Laringite", "OMA"],
    keywords: ["vsc", "taquipneia", "tiragem subcostal", "estridor", "amoxicilina pediátrica"],
  },
  {
    id: "top_diarreia_desidratacao_pediatrica",
    area: "PEDIATRIA",
    specialty: "Gastroenterologia Pediátrica",
    name: "Doença Diarreica Aguda & Terapia de Reidratação Oral",
    synonyms: ["DDA", "Gastroenterite Aguda", "TRO", "Planos A, B e C de Reidratação"],
    keywords: ["sro", "zinco", "plano a", "plano b", "plano c", "desidratacao grave"],
  },
  {
    id: "top_neonatologia_asfixia",
    area: "PEDIATRIA",
    specialty: "Neonatologia",
    name: "Reanimação Neonatal & Icterícia Neonatal",
    synonyms: ["Apgar", "Reanimação em Sala de Parto", "Icterícia Fisiológica", "Fototerapia"],
    keywords: ["ventilacao com pressao positiva", "vpp", "clampeamento", "bilirrubina", "fototerapia"],
  },

  // --- GINECOLOGIA E OBSTETRÍCIA ---
  {
    id: "top_prenatal_baixo_alto_risco",
    area: "GINECOLOGIA_OBSTETRICIA",
    specialty: "Obstetrícia",
    name: "Assistência Pré-Natal de Baixo e Alto Risco",
    synonyms: ["Pré-Natal", "Consultas Pré-Natais", "Exames de Rotina Gestacional", "Suplementação"],
    keywords: ["idade gestacional", "dum", "acido folico", "sulfato ferroso", "sorologias", "ultrassom"],
  },
  {
    id: "top_dheg_preeclampsia",
    area: "GINECOLOGIA_OBSTETRICIA",
    specialty: "Obstetrícia",
    name: "Síndromes Hipertensivas na Gestação & Pré-Eclâmpsia",
    synonyms: ["DHEG", "Pré-Eclâmpsia", "Eclâmpsia", "Síndrome HELLP", "Sulfato de Magnésio"],
    keywords: ["sulfato de magnesio", "zuspan", "pritchard", "proteinuria", "plaquetopenia", "hellp"],
  },
  {
    id: "top_sangramento_primeira_segunda_metade",
    area: "GINECOLOGIA_OBSTETRICIA",
    specialty: "Obstetrícia",
    name: "Hemorragias da 1ª e 2ª Metades da Gestação",
    synonyms: ["Abortamento", "Gravidez Ectópica", "Mola Hidatiforme", "DPP", "Placenta Prévia"],
    keywords: ["descolamento prematuro", "placenta previa", "ectopica", "beta-hcg", "curetagem", "amiu"],
  },
  {
    id: "top_trabalho_de_parto",
    area: "GINECOLOGIA_OBSTETRICIA",
    specialty: "Obstetrícia",
    name: "Trabalho de Parto, Partograma & Hemorragia Pós-Parto",
    synonyms: ["Parto Normal", "Partograma", "Atonia Uterina", "Índice de Bishop", "Cesariana"],
    keywords: ["partograma", "dilatacao", "esvaziamento", "ocitocina", "atonia", "acido tranexamico"],
  },
  {
    id: "top_rastreio_colo_mama",
    area: "GINECOLOGIA_OBSTETRICIA",
    specialty: "Ginecologia",
    name: "Rastreamento do Câncer de Colo Uterino & Mama",
    synonyms: ["Papanicolau", "Preventivo", "Mamografia", "BI-RADS", "HPV"],
    keywords: ["colpocitologia", "zona de transformacao", "bi-rads", "mamografia bienal", "hpv"],
  },
  {
    id: "top_anticoncepcao",
    area: "GINECOLOGIA_OBSTETRICIA",
    specialty: "Ginecologia",
    name: "Planejamento Reprodutivo & Contracepção",
    synonyms: ["Anticoncepcionais", "DIU de Cobre", "DIU de Levonorgestrel", "Critérios da OMS"],
    keywords: ["criterios de elegibilidade da oms", "diu", "progestageno", "estrogenio", "trombose"],
  },

  // --- MEDICINA PREVENTIVA E SOCIAL ---
  {
    id: "top_sus_principios_diretrizes",
    area: "MEDICINA_PREVENTIVA",
    specialty: "Saúde Coletiva / SUS",
    name: "Sistema Único de Saúde (Princípios, Diretrizes e Leis Orgânicas)",
    synonyms: ["SUS", "Lei 8080", "Lei 8142", "Universalidade", "Integralidade", "Equidade"],
    keywords: ["universalidade", "integralidade", "equidade", "descentralizacao", "controle social", "conselho de saude"],
  },
  {
    id: "top_epidemiologia_estudos",
    area: "MEDICINA_PREVENTIVA",
    specialty: "Epidemiologia",
    name: "Delineamentos de Estudos Epidemiológicos & Bioestatística",
    synonyms: ["Ensaio Clínico", "Coorte", "Caso-Controle", "Transversal", "Risco Relativo", "Odds Ratio"],
    keywords: ["risco relativo", "odds ratio", "coorte", "caso-controle", "ensaio clinico randomizado", "p-valor"],
  },
  {
    id: "top_indicadores_saude",
    area: "MEDICINA_PREVENTIVA",
    specialty: "Epidemiologia",
    name: "Indicadores de Saúde, Mortalidade & Transição Demográfica",
    synonyms: ["Taxa de Mortalidade Infantil", "Mortalidade Materna", "Curvas de Nelson Moraes", "Swaroop-Uemura"],
    keywords: ["mortalidade infantil", "mortalidade materna", "nelson moraes", "swaroop uemura", "esperanca de vida"],
  },
  {
    id: "top_vigilancia_saude_notificacao",
    area: "MEDICINA_PREVENTIVA",
    specialty: "Vigilância em Saúde",
    name: "Vigilância em Saúde & Doenças de Notificação Compulsória",
    synonyms: ["SINAN", "Portaria de Notificação Compulsória", "Notificação Imediata", "Semanal"],
    keywords: ["sinan", "notificacao compulsoria", "vigilancia epidemiologica", "surto", "epidemia"],
  },
];

/**
 * Segment Types for structured document decomposition.
 */
export type DocumentSegmentType =
  | "TOPIC_SEGMENT"
  | "SUBTOPIC_SEGMENT"
  | "INTRODUCTORY_SECTION"
  | "REFERENCE_SECTION"
  | "APPENDIX_SECTION"
  | "MIXED_MEDICAL_SEGMENT"
  | "UNCLASSIFIED_SEGMENT";

/**
 * Raw structural document segment.
 */
export interface DocumentSegment {
  id: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  sourcePageRefs: number[];
  detectedTitle?: string;
  detectedHeadings: string[];
  sourceBlockRefs: string[];
  tableRefs: string[];
  figureRefs: string[];
  segmentType: DocumentSegmentType;
  segmentationConfidence: number;
  boundaryReason: string;
  status: "DRAFT" | "PROCESSED" | "REVIEWED";
  createdAt: string;
}

export type CanonicalMatchMethod =
  | "EXACT_NAME"
  | "NORMALIZED_NAME"
  | "SEMANTIC_MATCH"
  | "NO_MATCH"
  | "ADMIN_OVERRIDE";

export interface CanonicalTopicMatchResult {
  suggestedCanonicalTopicId?: string;
  matchedTopicName?: string;
  matchConfidence: number;
  matchMethod: CanonicalMatchMethod;
}

export type StructuredBlockType =
  | "SOURCE_HEADING"
  | "SOURCE_PARAGRAPH"
  | "SOURCE_LIST"
  | "SOURCE_TABLE"
  | "SOURCE_FIGURE"
  | "SOURCE_CAPTION"
  | "SOURCE_DEFINITION"
  | "SOURCE_ALGORITHM"
  | "SOURCE_WARNING"
  | "SOURCE_REFERENCE"
  | "SOURCE_UNKNOWN";

export interface StructuredSourceBlock {
  id: string;
  type: StructuredBlockType;
  order: number;
  pageNumber: number;
  sourceBlockId: string;
  originalText: string;
  semanticRole?: string;
  tableData?: ExtractedPdfTable;
  figureData?: ResolvedSourceFigure;
  provenance: {
    documentId: string;
    segmentId: string;
    pageNumber: number;
    sourceBlockId: string;
  };
}

export type StructuredContentStatus =
  | "STRUCTURING"
  | "REVIEW_REQUIRED"
  | "APPROVED_STRUCTURE";

export interface StructuredSourceContent {
  id: string;
  sourceDocumentId: string;
  segmentId: string;
  area?: CanonicalMedicalArea;
  specialty?: string;
  topic: string;
  subtopics: string[];
  suggestedCanonicalTopicId?: string;
  canonicalTopicId?: string; // Only populated after explicit ADMIN confirmation
  sourcePages: number[];
  sourceBlockRefs: string[];
  blocks: StructuredSourceBlock[];
  classificationConfidence: number;
  status: StructuredContentStatus;
  taxonomyVersion: string;
  totalSourceBlocks: number;
  assignedSourceBlocks: number;
  unassignedSourceBlocks: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalSegmentationResult {
  documentId: string;
  segments: DocumentSegment[];
  structuredContents: StructuredSourceContent[];
  areasFoundSummary: Record<CanonicalMedicalArea, number>;
  totalSourceBlocks: number;
  assignedSourceBlocks: number;
  unassignedSourceBlocks: number;
  segmentationDurationMs: number;
}
