import { MedicalArea, Question } from "../types";
import { GrandeTema, MedicalAreaId } from "../types/grandesTemas";
import { ALL_GRANDES_TEMAS, getGrandeTemaById } from "../data/grandesTemas";

export type StagingTaxonomyStatus =
  | "OCR_RAW"
  | "STRUCTURED"
  | "ANSWER_KEY_MATCHED"
  | "TAXONOMY_PENDING"
  | "REVIEW_REQUIRED"
  | "VERIFIED"
  | "PUBLISHED";

export interface QuestionTaxonomyContract {
  canonicalTopicId: string;
  area: MedicalArea;
  topic: string;
  subtopic?: string;
  taxonomyStatus?: StagingTaxonomyStatus;
  taxonomyConfidence?: number;
  taxonomyNotes?: string;
}

export interface TaxonomyValidationResult {
  valid: boolean;
  canonicalTopicId: string | null;
  canonicalTopicTitle: string | null;
  area: MedicalArea | null;
  areaCompatible: boolean;
  issues: string[];
  confidence: number;
}

export type TopicMatchType =
  | "DIRECT_ID"
  | "CANONICAL_NAME"
  | "EXPLICIT_ALIAS"
  | "AREA_MISMATCH"
  | "AMBIGUOUS"
  | "UNMAPPED";

export interface CanonicalTopicResolution {
  canonicalTopicId: string | null;
  canonicalTopicTitle: string | null;
  area: MedicalArea | null;
  areaId: MedicalAreaId | null;
  irsScore: number;
  matchType: TopicMatchType;
  confidence: number; // 0.0 to 1.0
  matchedTerm: string;
  notes?: string;
}

export interface QuestionTopicInput {
  id?: string;
  area?: MedicalArea | string;
  topic?: string;
  subtopic?: string;
  canonicalTopicId?: string;
  taxonomyStatus?: StagingTaxonomyStatus;
  taxonomyConfidence?: number;
  taxonomyNotes?: string;
}

/**
 * Normalizes text for deterministic matching:
 * - Trims and converts to uppercase
 * - Strips diacritics (accents)
 * - Collapses spaces
 * - Strips non-alphanumeric punctuation
 */
export function normalizeTopicLabel(text?: string | null): string {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ") // replace punctuation with spaces
    .replace(/\s+/g, " ") // collapse multiple spaces
    .trim();
}

/**
 * Area mapping between MedicalArea and MedicalAreaId
 */
export const AREA_MAP_TO_ID: Record<MedicalArea, MedicalAreaId> = {
  CLINICA_MEDICA: "clinica-medica",
  CIRURGIA_GERAL: "cirurgia-geral",
  PEDIATRIA: "pediatria",
  GINECOLOGIA_OBSTETRICIA: "ginecologia-obstetricia",
  MEDICINA_FAMILIA_COMUNIDADE: "medicina-preventiva",
};

export const AREA_ID_TO_MEDICAL_AREA: Record<string, MedicalArea> = {
  "clinica-medica": "CLINICA_MEDICA",
  "cirurgia": "CIRURGIA_GERAL",
  "cirurgia-geral": "CIRURGIA_GERAL",
  "pediatria": "PEDIATRIA",
  "ginecologia-obstetricia": "GINECOLOGIA_OBSTETRICIA",
  "medicina-preventiva": "MEDICINA_FAMILIA_COMUNIDADE",
};

/**
 * Ambiguous aliases that require explicit qualifiers
 */
const AMBIGUOUS_TERMS = new Set([
  "CHOQUE",
  "CANCER",
  "FEBRE",
  "DOR",
  "SANGRAMENTO",
  "TRAUMA",
  "INTOXICACAO",
  "INFECCAO",
  "HEMORRAGIA",
  "URGENCIA",
  "EMERGENCIA",
  "DISTURBIO",
]);

/**
 * Curated Canonical Aliases Table for all 75 Grandes Temas
 */
const CANONICAL_ALIASES: Record<string, string[]> = {
  // CLÍNICA MÉDICA (cm-01 to cm-15)
  "cm-01": [
    "HAS",
    "HIPERTENSAO",
    "HIPERTENSAO ARTERIAL",
    "HIPERTENSAO ARTERIAL SISTEMICA",
    "EMERGENCIA HIPERTENSIVA",
    "URGENCIA HIPERTENSIVA",
    "CRISE HIPERTENSIVA",
    "MAPA MRPA",
    "PRESSAO ARTERIAL",
  ],
  "cm-02": [
    "DIABETES",
    "DIABETES MELLITUS",
    "DM2",
    "DM1",
    "CAD",
    "CETOACIDOSE",
    "CETOACIDOSE DIABETICA",
    "EHH",
    "ESTADO HIPEROSMOLAR",
    "HIPOGLICEMIA",
  ],
  "cm-03": [
    "SCA",
    "SCASST",
    "SCACST",
    "IAM",
    "INFARTO",
    "INFARTO AGUDO DO MIOCARDIO",
    "ANGINA",
    "ANGINA INSTAVEL",
    "SINDROME CORONARIANA AGUDA",
    "CORONARIOPATIA",
  ],
  "cm-04": [
    "IC",
    "INSUFICIENCIA CARDIACA",
    "ICFER",
    "ICFEP",
    "EDEMA AGUDO DE PULMAO",
    "EAP",
    "CARDIOMIOPATIA",
  ],
  "cm-05": [
    "ARRITMIAS",
    "FIBRILACAO ATRIAL",
    "FA",
    "FLUTTER ATRIAL",
    "TAQUICARDIA SUPRAVENTRICULAR",
    "TSV",
    "BRADICARDIA",
    "BLOQUEIO ATRIOVENTRICULAR",
    "BAV",
  ],
  "cm-06": [
    "AVC",
    "AVE",
    "ACIDENTE VASCULAR CEREBRAL",
    "AVC ISQUEMICO",
    "AVC HEMORRAGICO",
    "TROMBOLISE",
    "NIHSS",
    "ATAQUE ISQUEMICO TRANSITORIO",
    "AIT",
  ],
  "cm-07": [
    "PNEUMONIA",
    "PAC",
    "CURB 65",
    "CURB65",
    "INFECCAO RESPIRATORIA",
    "DERRAME PLEURAL",
    "PNEUMONIA ADQUIRIDA NA COMUNIDADE",
  ],
  "cm-08": [
    "ASMA",
    "DPOC",
    "BRONCOESPASMO",
    "EXACERBACAO DE ASMA",
    "DOENCA PULMONAR OBSTRUTIVA CRONICA",
  ],
  "cm-09": [
    "TUBERCULOSE",
    "TB",
    "ESQUEMA RIPE",
    "BACILOSCOPIA",
    "BAAR",
    "TRM TB",
    "TUBERCULOSE PULMONAR",
    "PPD",
    "PROVA TUBERCULINICA",
  ],
  "cm-10": [
    "HIV",
    "AIDS",
    "TARV",
    "INFECCAO OPORTUNISTA",
    "PNEUMOCISTOSE",
    "CARGA VIRAL",
    "CD4",
  ],
  "cm-11": [
    "SEPSE",
    "CHOQUE SEPTICO",
    "QUICK SOFA",
    "QSOFA",
    "SOFA",
    "LACTATO",
    "PACOTE DE 1 HORA",
  ],
  "cm-12": [
    "LRA",
    "DRC",
    "LESAO RENAL AGUDA",
    "DOENCA RENAL CRONICA",
    "KDIGO",
    "GLOMERULOPATIA",
    "SINDROME NEFROTICA",
    "SINDROME NEFRITICA",
  ],
  "cm-13": [
    "CIRROSE",
    "HIPERTENSAO PORTAL",
    "ASCITE",
    "PBE",
    "PERITONITE BACTERIANA ESPONTANEA",
    "VARIZES ESOFAGICAS",
    "ENCEFALOPATIA HEPATICA",
  ],
  "cm-14": [
    "DISTURBIOS HIDROELETROLITICOS",
    "HIPONATREMIA",
    "HIPERNATREMIA",
    "HIPOCALEMIA",
    "HIPERCALEMIA",
    "ACIDOSE METABOLICA",
    "ALCALOSE METABOLICA",
    "GASOMETRIA",
  ],
  "cm-15": [
    "ANEMIAS",
    "ANEMIA FERROPRIVA",
    "ANEMIA MEGALOBLASTICA",
    "ANEMIA FALCIFORME",
    "ANEMIA HEMOLITICA",
    "TALASSEMIA",
    "FERRITINA",
  ],

  // CIRURGIA GERAL (cir-01 to cir-15)
  "cir-01": [
    "ATLS",
    "POLITRAUMATIZADO",
    "ATENDIMENTO INICIAL AO POLITRAUMATIZADO",
    "ABCDE DO TRAUMA",
    "TRAUMA GRAVE",
  ],
  "cir-02": [
    "TCE",
    "TRAUMA CRANIOENCEFALICO",
    "GLASGOW",
    "HEMATOMA EPIDURAL",
    "HEMATOMA SUBDURAL",
    "CONCLUSAO",
  ],
  "cir-03": [
    "TRAUMA TORACICO",
    "PNEUMOTORAX",
    "PNEUMOTORAX HIPERTENSIVO",
    "HEMOTORAX",
    "TAMPONAMENTO CARDIACO",
    "DRENAGEM PLEURAL",
    "SELO D AGUA",
  ],
  "cir-04": [
    "TRAUMA ABDOMINAL",
    "FAST",
    "E FAST",
    "TRAUMA PELVICO",
    "LAVADO PERITONEAL",
    "LAPAROTOMIA EXPLORADORA",
  ],
  "cir-05": [
    "ABDOME AGUDO",
    "ABDOME AGUDO CIRURGICO",
    "ABDOME AGUDO PERFURATIVO",
    "ABDOME AGUDO VASCULAR",
    "PNEUMOPERITONIO",
  ],
  "cir-06": [
    "APENDICITE",
    "APENDICITE AGUDA",
    "ESCORE DE ALVARADO",
    "BLUMBERG",
    "APENDICECTOMIA",
  ],
  "cir-07": [
    "COLECISTITE",
    "COLANGITE",
    "COLELITIASE",
    "COLEDOCOLITIASE",
    "SINAL DE MURPHY",
    "TRIADE DE CHARCOT",
    "PENTADE DE REYNOLDS",
  ],
  "cir-08": [
    "PANCREATITE",
    "PANCREATITE AGUDA",
    "CRITERIOS DE RANSON",
    "LIPASE",
    "AMILASE",
    "BALTHAZAR",
  ],
  "cir-09": [
    "OBSTRUCAO INTESTINAL",
    "ILEO PARALITICO",
    "VOLVO",
    "VOLVO DE SIGMOIDE",
    "BRIDA",
    "ADERENCIAS",
    "NIVEL HIDROAEREO",
  ],
  "cir-10": [
    "HDA",
    "HDB",
    "HEMORRAGIA DIGESTIVA",
    "HEMORRAGIA DIGESTIVA ALTA",
    "HEMORRAGIA DIGESTIVA BAIXA",
    "MELENA",
    "HEMATEMESE",
    "ENTERORRAGIA",
  ],
  "cir-11": [
    "HERNIAS",
    "HERNIA INGUINAL",
    "HERNIA FEMORAL",
    "HERNIA UMBILICAL",
    "HERNIA INCISIONAL",
    "HERNIA ESTRANGULADA",
    "HERNIA ENCARCERADA",
  ],
  "cir-12": [
    "QUEIMADURAS",
    "QUEIMADOS",
    "REGRA DOS NOVES",
    "FORMULA DE PARKLAND",
    "RESSUSCITACAO VOLEMICA EM QUEIMADOS",
  ],
  "cir-13": [
    "PRE OPERATORIO",
    "POS OPERATORIO",
    "AVALIACAO CIRURGICA",
    "RISCO CIRURGICO",
    "ASA",
    "JEJUM PRE OPERATORIO",
  ],
  "cir-14": [
    "ISC",
    "INFECCAO DE SITIO CIRURGICO",
    "FISTULA",
    "DEISCENCIA",
    "COMPLICACOES CIRURGICAS",
  ],
  "cir-15": [
    "CANCER COLORRETAL",
    "CCR",
    "ADENOCARCINOMA COLORRETAL",
    "COLONOSCOPIA DE RASTREIO",
    "POLIPOS",
  ],

  // PEDIATRIA (ped-01 to ped-15)
  "ped-01": [
    "CRESCIMENTO E DESENVOLVIMENTO",
    "MARCOS DO DESENVOLVIMENTO",
    "DENVER",
    "DENVER II",
    "ESTATURA",
    "PERCENTIL",
    "ESCORE Z",
  ],
  "ped-02": [
    "PUERICULTURA",
    "CONSULTA DA CRIANCA",
    "ACOMPANHAMENTO INFANTIL",
    "SAUDE DA CRIANCA",
  ],
  "ped-03": [
    "ALEITAMENTO",
    "ALEITAMENTO MATERNO",
    "LEITE MATERNO",
    "PEGA",
    "FISSURA MAMARIA",
    "MASTITE",
    "APLV",
  ],
  "ped-04": [
    "ALIMENTACAO COMPLEMENTAR",
    "INTRODUCAO ALIMENTAR",
    "GUIA ALIMENTAR",
  ],
  "ped-05": [
    "VACINACAO INFANTIL",
    "CALENDARIO VACINAL DA CRIANCA",
    "CALENDARIO NACIONAL DE VACINACAO",
    "IMUNIZACAO PEDIATRICA",
    "IMUNIZACAO DA CRIANCA",
    "PNI",
    "BCG",
    "PENTAVALENTE",
    "VIP",
    "VOP",
    "TRIPLICE VIRAL",
  ],
  "ped-06": [
    "RECEM NASCIDO",
    "RN",
    "ASSISTENCIA AO RN",
    "SALA DE PARTO",
    "APGAR",
    "TESTE DO PEZINHO",
    "TRIAGEM NEONATAL",
  ],
  "ped-07": [
    "REANIMACAO NEONATAL",
    "VPP NEONATAL",
    "CLAMPEAMENTO DE CORDAO",
    "ASPIRACAO DE MECONIO",
  ],
  "ped-08": [
    "ICTERICIA NEONATAL",
    "FOTOTERAPIA",
    "EXSANGUINEOTRANSFUSAO",
    "ICTERICIA FISIOLOGICA",
    "ICTERICIA DO LEITE MATERNO",
    "KERNICTERUS",
  ],
  "ped-09": [
    "PREMATURIDADE",
    "PRE MATURO",
    "IDADE GESTACIONAL CORRIGIDA",
    "MEMBRANA HIALINA",
    "SURFACTANTE",
    "ENTEROCOLITE NECROTIZANTE",
  ],
  "ped-10": [
    "IVA",
    "INFECCAO DE VIAS AEREAS",
    "FARINGITE",
    "AMIGDALITE",
    "OTITE MEDIA AGUDA",
    "OMA",
    "SINUSITE PEDIATRICA",
    "LARINGITE",
    "CRUPE",
  ],
  "ped-11": [
    "BRONQUIOLITE",
    "BRONQUIOLITE VIRAL AGUDA",
    "BVA",
    "VRS",
    "VIRUS SINCICIAL RESPIRATORIO",
  ],
  "ped-12": [
    "ASMA NA INFANCIA",
    "ASMA PEDIATRICA",
    "SIBILANCIA INFANTIL",
    "LACTENTE SIBILANTE",
  ],
  "ped-13": [
    "DOENCA DIARREICA AGUDA",
    "DIARREIA AGUDA",
    "DIARREIA PEDIATRICA",
    "DDA PEDIATRICA",
    "DESIDRATACAO INFANTIL",
    "TRO",
    "PLANO A",
    "PLANO B",
    "PLANO C",
    "ZINCO NA DIARREIA",
  ],
  "ped-14": [
    "FEBRE SEM SINAIS LOCALIZATORIOS",
    "FSSL",
    "SEPSE NEONATAL",
    "SEPSE PEDIATRICA",
    "MENINGITE PEDIATRICA",
    "DOENCAS EXANTEMATICAS",
    "SARAMPO",
    "VARICELA",
    "ESCARLATINA",
    "EXANTEMA SUBITO",
  ],
  "ped-15": [
    "DESNUTRICAO",
    "DESNUTRICAO INFANTIL",
    "KWASHIORKOR",
    "MARASMO",
    "DEFICIENCIA NUTRICIONAL",
    "RAQUITISMO",
  ],

  // GINECOLOGIA E OBSTETRÍCIA (go-01 to go-15)
  "go-01": [
    "PRE NATAL",
    "ASSISTENCIA PRE NATAL",
    "CONSULTA PRE NATAL",
    "EXAMES DO PRE NATAL",
    "CARTAO DA GESTANTE",
    "SUPLEMENTACAO NA GESTACAO",
  ],
  "go-02": [
    "DHEG",
    "PRE ECLAMPSIA",
    "ECLAMPSIA",
    "PRE-ECLAMPSIA",
    "ZUSPAN",
    "SINDROME HELLP",
    "HIPERTENSAO GESTACIONAL",
    "SULFATO DE MAGNESIO",
  ],
  "go-03": [
    "DMG",
    "DIABETES GESTACIONAL",
    "DIABETES NA GESTACAO",
    "TOTG",
    "GLICEMIA DE JEJUM GESTANTE",
  ],
  "go-04": [
    "SANGRAMENTO 1 METADE",
    "ABORTO",
    "ABORTELES",
    "AMEU",
    "GRAVIDEZ ECTOPICA",
    "DOENCA TROFOBLASTICA",
    "MOLA HIDATIFORME",
  ],
  "go-05": [
    "SANGRAMENTO 2 METADE",
    "DESCOLAMENTO PREMATURO DE PLACENTA",
    "DPP",
    "PLACENTA PREVIA",
    "ROTURA UTERINA",
    "VASA PREVIA",
  ],
  "go-06": [
    "TRABALHO DE PARTO",
    "MECANISMO DO PARTO",
    "PERIODO DILATACAO",
    "PERIODO EXPULSIVO",
    "DECTADURA",
  ],
  "go-07": [
    "PARTO HUMANIZADO",
    "ASSISTENCIA AO PARTO",
    "BOAS PRATICAS NO PARTO",
    "EPISIOTOMIA",
    "METODOS NAO FARMACOLOGICOS",
  ],
  "go-08": [
    "INDUCAO DO PARTO",
    "INDICE DE BISHOP",
    "MISOPROSTOL",
    "OCITOCINA",
  ],
  "go-09": [
    "DISTOCIAS",
    "PARTOGRAMA",
    "PARADA SECUNDARIA DA DILATACAO",
    "PARTO PRECIPITADO",
    "DISTOCIA DE OMBRO",
  ],
  "go-10": [
    "RPMO",
    "ROTURA PREMATURA DE MEMBRANAS",
    "AMNIORREXE PREMATURA",
    "CORIOAMNIONITE",
  ],
  "go-11": [
    "HPP",
    "HEMORRAGIA POS PARTO",
    "ATONIA UTERINA",
    "OS 4TS",
    "ZERO MORTE MATERNA",
    "ACIDO TRANEXAMICO",
    "BALAO DE BAKRI",
  ],
  "go-12": [
    "TORCH",
    "SIFILIS NA GESTACAO",
    "SIFILIS CONGENITA",
    "TOXOPLASMOSE NA GESTACAO",
    "HIV NA GESTACAO",
    "ESTREPTOCOCO DO GRUPO B",
    "GBS",
  ],
  "go-13": [
    "PLANEJAMENTO REPRODUTIVO",
    "CONTRACEPCAO",
    "CRITERIOS DE ELEGIBILIDADE OMS",
    "DIU",
    "ANTICONCEPCIONAL",
    "PILULA COMBINADA",
    "LAQUEADURA",
  ],
  "go-14": [
    "PAPANICOLAU",
    "PREVENTIVO",
    "RASTREAMENTO COLO DO UTERO",
    "CANCER DE COLO DE UTERO",
    "INCA",
    "HPV",
    "LIEBG",
    "LIEAG",
    "COLPOSCOPIA",
  ],
  "go-15": [
    "IST",
    "DIP",
    "DOENCA INFLAMATORIA PELVICA",
    "CORRIMENTO VAGINAL",
    "VAGINOSE BACTERIANA",
    "CANDIDIASE",
    "TRICOMONIASE",
    "ULCERA GENITAL",
  ],

  // MEDICINA PREVENTIVA E SAÚDE COLETIVA (prev-01 to prev-15)
  "prev-01": [
    "LEGISLACAO DO SUS",
    "PRINCIPIOS DO SUS",
    "LEI 8080",
    "LEI 8142",
    "DECRETO 7508",
    "UNIVERSALIDADE",
    "INTEGRALIDADE",
    "EQUIDADE",
    "DESCENTRALIZACAO",
    "PARTICIPACAO POPULAR",
    "CONTROLE SOCIAL",
  ],
  "prev-02": [
    "APS",
    "ATENCAO PRIMARIA",
    "ATENCAO PRIMARIA A SAUDE",
    "ATRIBUTOS DE STARFIELD",
    "ACESSO DE PRIMEIRO CONTATO",
    "LONGITUDINALIDADE",
    "INTEGRALIDADE DA APS",
    "COORDENACAO DO CUIDADO",
  ],
  "prev-03": [
    "ESF",
    "ESTRATEGIA SAUDE DA FAMILIA",
    "PNAB",
    "POLITICA NACIONAL DE ATENCAO BASICA",
    "AGENTE COMUNITARIO DE SAUDE",
    "ACS",
    "EAP",
    "NASF",
    "MATRICIAMENTO",
  ],
  "prev-04": [
    "DELINEAMENTOS",
    "ESTUDOS EPIDEMIOLOGICOS",
    "ENSAIO CLINICO",
    "ENSAIO CLINICO RANDOMIZADO",
    "COORTE",
    "CASO CONTROLE",
    "TRANSVERSAL",
    "ESTUDO ECOLOGICO",
  ],
  "prev-05": [
    "MEDIDAS DE FREQUENCIA",
    "INCIDENCIA",
    "PREVALENCIA",
    "RISCO RELATIVO",
    "RR",
    "ODDS RATIO",
    "OR",
    "RAZAO DE PREVALENCIA",
    "NNT",
    "REDUCAO DO RISCO ABSOLUTO",
  ],
  "prev-06": [
    "TESTES DIAGNOSTICOS",
    "SENSIBILIDADE",
    "ESPECIFICIDADE",
    "VPP",
    "VPN",
    "VALOR PREDITIVO POSITIVO",
    "VALOR PREDITIVO NEGATIVO",
    "CURVA ROC",
    "RAZAO DE VEROSSIMILHANCA",
    "RASTREAMENTO",
  ],
  "prev-07": [
    "VIGILANCIA EPIDEMIOLOGICA",
    "INVESTIGACAO DE SURTOS",
    "TAXA DE ATAQUE",
    "CURVA EPIDEMICA",
    "ENDEMIA",
    "EPIDEMIA",
    "PANDEMIA",
  ],
  "prev-08": [
    "SINAN",
    "NOTIFICACAO COMPULSORIA",
    "DOENCAS DE NOTIFICACAO COMPULSORIA",
    "LISTA NACIONAL DE NOTIFICACAO",
    "NOTIFICACAO IMEDIATA",
    "NOTIFICACAO SEMANAL",
    "ARBOVIROSES",
    "DENGUE",
    "CHIKUNGUNYA",
    "ZIKA",
    "FEBRE AMARELA",
    "MALARIA",
    "LEPTOSPIROSE",
    "LEISHMANIOSE",
  ],
  "prev-09": [
    "ANVISA",
    "VIGILANCIA SANITARIA",
    "BOAS PRATICAS SANITARIAS",
    "CONTROLE DE MEDICAMENTOS",
  ],
  "prev-10": [
    "PNVS",
    "POLITICA NACIONAL DE VIGILANCIA EM SAUDE",
    "VIGILANCIA AMBIENTAL",
    "VIGISOLO",
    "VIGIAGUA",
    "SAUDE AMBIENTAL",
  ],
  "prev-11": [
    "PNI POLITICAS",
    "COBERTURA VACINAL",
    "HESITACAO VACINAL",
    "REDE DE FRIO",
    "EVENTOS ADVERSOS POS VACINACAO",
    "EAPV",
  ],
  "prev-12": [
    "SAUDE DO TRABALHADOR",
    "DOENCAS OCUPACIONAIS",
    "CAT",
    "COMUNICACAO DE ACIDENTE DE TRABALHO",
    "LER DORT",
    "PNEUMOCONIOSE",
    "SATURNISMO",
    "CEREST",
  ],
  "prev-13": [
    "INDICADORES DE SAUDE",
    "COEFICIENTE DE MORTALIDADE INFANTIL",
    "MORTALIDADE MATERNA",
    "MORTALIDADE INFANTIL",
    "RAZAO DE MORTALIDADE MATERNA",
    "CURVAS DE NELSON MORAES",
  ],
  "prev-14": [
    "ETICA MEDICA",
    "CODIGO DE ETICA MEDICA",
    "CEM",
    "SIGILO MEDICO",
    "AUTONOMIA DO PACIENTE",
    "CONSENTIMENTO INFORMADO",
    "BIOETICA",
    "BENEFICENCIA",
    "NAO MALEFICENCIA",
    "JUSTICA",
  ],
  "prev-15": [
    "DECLARACAO DE OBITO",
    "DO",
    "ATESTADO DE OBITO",
    "SVO",
    "IML",
    "SERVICO DE VERIFICACAO DE OBITO",
    "INSTITUTO MEDICO LEGAL",
    "MORTE NATURAL",
    "MORTE VIOLENTA",
  ],
};

export class TopicTaxonomyService {
  private static lookupMap: Map<string, { topicId: string; areaId: MedicalAreaId }> = new Map();
  private static initialized = false;

  private static initialize() {
    if (this.initialized) return;

    // 1. Index direct canonical IDs and titles
    for (const theme of ALL_GRANDES_TEMAS) {
      const normalizedTitle = normalizeTopicLabel(theme.title);
      const normalizedSlug = normalizeTopicLabel(theme.slug.replace(/-/g, " "));

      this.lookupMap.set(normalizeTopicLabel(theme.id), {
        topicId: theme.id,
        areaId: theme.areaId,
      });

      if (normalizedTitle) {
        this.lookupMap.set(normalizedTitle, {
          topicId: theme.id,
          areaId: theme.areaId,
        });
      }

      if (normalizedSlug && normalizedSlug !== normalizedTitle) {
        this.lookupMap.set(normalizedSlug, {
          topicId: theme.id,
          areaId: theme.areaId,
        });
      }
    }

    // 2. Index curated aliases
    for (const [topicId, aliases] of Object.entries(CANONICAL_ALIASES)) {
      const theme = getGrandeTemaById(topicId);
      if (!theme) continue;

      for (const alias of aliases) {
        const normalizedAlias = normalizeTopicLabel(alias);
        if (normalizedAlias && !AMBIGUOUS_TERMS.has(normalizedAlias)) {
          this.lookupMap.set(normalizedAlias, {
            topicId: theme.id,
            areaId: theme.areaId,
          });
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Resolves a Question or string inputs to a canonical Grande Tema (1 of the 75)
   */
  static resolveCanonicalTopic(input: QuestionTopicInput | Question): CanonicalTopicResolution {
    this.initialize();

    const area = input.area as MedicalArea | undefined;
    const topic = input.topic || "";
    const subtopic = input.subtopic || "";
    const directCanonicalId = (input as any).canonicalTopicId;

    // Helper: build unmapped result
    const makeUnmapped = (term: string, notes?: string): CanonicalTopicResolution => ({
      canonicalTopicId: null,
      canonicalTopicTitle: null,
      area: area || null,
      areaId: area && AREA_MAP_TO_ID[area] ? AREA_MAP_TO_ID[area] : null,
      irsScore: 50,
      matchType: "UNMAPPED",
      confidence: 0,
      matchedTerm: term,
      notes,
    });

    // 1. Direct Canonical ID Check
    if (directCanonicalId) {
      const theme = getGrandeTemaById(directCanonicalId);
      if (theme) {
        const expectedMedicalArea = AREA_ID_TO_MEDICAL_AREA[theme.areaId];
        const isAreaMismatch = area && expectedMedicalArea && area !== expectedMedicalArea;

        return {
          canonicalTopicId: theme.id,
          canonicalTopicTitle: theme.title,
          area: expectedMedicalArea,
          areaId: theme.areaId,
          irsScore: this.getIrsForTheme(theme),
          matchType: isAreaMismatch ? "AREA_MISMATCH" : "DIRECT_ID",
          confidence: isAreaMismatch ? 0.5 : 1.0,
          matchedTerm: directCanonicalId,
          notes: isAreaMismatch
            ? `Área da questão (${area}) difere da área canônica do tema (${expectedMedicalArea})`
            : undefined,
        };
      }
    }

    const normalizedTopic = normalizeTopicLabel(topic);
    const normalizedSubtopic = normalizeTopicLabel(subtopic);

    if (!normalizedTopic && !normalizedSubtopic) {
      return makeUnmapped("", "Nenhum tópico ou subtema fornecido");
    }

    // 2. Check for Ambiguous Terms
    if (AMBIGUOUS_TERMS.has(normalizedTopic)) {
      return {
        canonicalTopicId: null,
        canonicalTopicTitle: null,
        area: area || null,
        areaId: area && AREA_MAP_TO_ID[area] ? AREA_MAP_TO_ID[area] : null,
        irsScore: 50,
        matchType: "AMBIGUOUS",
        confidence: 0.2,
        matchedTerm: normalizedTopic,
        notes: `Termo ambíguo [${normalizedTopic}] requer qualificador clínico específico`,
      };
    }

    // Helper: try matching a string candidate
    const tryLookup = (candidate: string) => {
      if (!candidate || AMBIGUOUS_TERMS.has(candidate)) return null;
      return this.lookupMap.get(candidate);
    };

    // 3. Match by Normalized Topic (Exact -> Strip Parentheses -> Inside Parentheses)
    const topicCandidates: string[] = [normalizedTopic];
    if (topic && topic.includes("(")) {
      const withoutParen = normalizeTopicLabel(topic.replace(/\(.*?\)/g, " "));
      const insideParen = normalizeTopicLabel(topic.match(/\((.*?)\)/)?.[1] || "");
      if (withoutParen && withoutParen !== normalizedTopic) topicCandidates.push(withoutParen);
      if (insideParen && !AMBIGUOUS_TERMS.has(insideParen)) topicCandidates.push(insideParen);
    }

    for (const cand of topicCandidates) {
      const match = tryLookup(cand);
      if (match) {
        const theme = getGrandeTemaById(match.topicId);
        if (theme) {
          const expectedMedicalArea = AREA_ID_TO_MEDICAL_AREA[theme.areaId];
          const isAreaMismatch = area && expectedMedicalArea && area !== expectedMedicalArea;
          const isCanonicalTitle = normalizeTopicLabel(theme.title) === cand;

          return {
            canonicalTopicId: theme.id,
            canonicalTopicTitle: theme.title,
            area: expectedMedicalArea,
            areaId: theme.areaId,
            irsScore: this.getIrsForTheme(theme),
            matchType: isAreaMismatch
              ? "AREA_MISMATCH"
              : isCanonicalTitle
              ? "CANONICAL_NAME"
              : "EXPLICIT_ALIAS",
            confidence: isAreaMismatch ? 0.6 : isCanonicalTitle ? 1.0 : 0.95,
            matchedTerm: cand,
            notes: isAreaMismatch
              ? `Área da questão (${area}) difere da área canônica do tema (${expectedMedicalArea})`
              : undefined,
          };
        }
      }
    }

    // 4. Match by Normalized Subtopic
    const subtopicCandidates: string[] = [normalizedSubtopic];
    if (subtopic && subtopic.includes("(")) {
      const withoutParen = normalizeTopicLabel(subtopic.replace(/\(.*?\)/g, " "));
      const insideParen = normalizeTopicLabel(subtopic.match(/\((.*?)\)/)?.[1] || "");
      if (withoutParen && withoutParen !== normalizedSubtopic) subtopicCandidates.push(withoutParen);
      if (insideParen && !AMBIGUOUS_TERMS.has(insideParen)) subtopicCandidates.push(insideParen);
    }

    for (const cand of subtopicCandidates) {
      const subMatch = tryLookup(cand);
      if (subMatch) {
        const theme = getGrandeTemaById(subMatch.topicId);
        if (theme) {
          const expectedMedicalArea = AREA_ID_TO_MEDICAL_AREA[theme.areaId];
          const isAreaMismatch = area && expectedMedicalArea && area !== expectedMedicalArea;

          return {
            canonicalTopicId: theme.id,
            canonicalTopicTitle: theme.title,
            area: expectedMedicalArea,
            areaId: theme.areaId,
            irsScore: this.getIrsForTheme(theme),
            matchType: isAreaMismatch ? "AREA_MISMATCH" : "EXPLICIT_ALIAS",
            confidence: isAreaMismatch ? 0.5 : 0.85,
            matchedTerm: cand,
            notes: `Mapeado através do subtema [${cand}]`,
          };
        }
      }
    }

    // 5. Whole-Phrase Containment in Curated Aliases
    for (const [candTopic, candArea] of [
      [normalizedTopic, area],
      [normalizedSubtopic, area],
    ] as const) {
      if (!candTopic || candTopic.length < 5) continue;
      for (const [aliasKey, entry] of this.lookupMap.entries()) {
        if (aliasKey.length >= 6 && !AMBIGUOUS_TERMS.has(aliasKey)) {
          if (candTopic.includes(aliasKey) || aliasKey.includes(candTopic)) {
            const theme = getGrandeTemaById(entry.topicId);
            if (theme) {
              const expectedMedicalArea = AREA_ID_TO_MEDICAL_AREA[theme.areaId];
              // Prefer match in the same medical area if area is provided
              if (!candArea || candArea === expectedMedicalArea) {
                return {
                  canonicalTopicId: theme.id,
                  canonicalTopicTitle: theme.title,
                  area: expectedMedicalArea,
                  areaId: theme.areaId,
                  irsScore: this.getIrsForTheme(theme),
                  matchType: "EXPLICIT_ALIAS",
                  confidence: 0.90,
                  matchedTerm: aliasKey,
                  notes: `Mapeado por contenção de alias [${aliasKey}]`,
                };
              }
            }
          }
        }
      }
    }

    // 6. Unmapped Fallback
    return makeUnmapped(topic || subtopic, "Nenhuma correspondência canônica inequívoca encontrada");
  }

  /**
   * Validates a question against the canonical ingestion contract for the 75 Grandes Temas.
   * New published verified questions MUST pass this validation.
   */
  static validateQuestionTaxonomy(input: QuestionTopicInput | Question): TaxonomyValidationResult {
    this.initialize();

    const issues: string[] = [];
    const area = input.area as MedicalArea | undefined;
    const directCanonicalId = (input as any).canonicalTopicId;

    if (!area) {
      issues.push("Área médica não especificada na questão");
    }

    // 1. If explicit canonicalTopicId is present
    if (directCanonicalId) {
      const theme = getGrandeTemaById(directCanonicalId);
      if (!theme) {
        issues.push(
          `canonicalTopicId '${directCanonicalId}' não existe na taxonomia canônica dos 75 Grandes Temas`
        );
        return {
          valid: false,
          canonicalTopicId: directCanonicalId,
          canonicalTopicTitle: null,
          area: area || null,
          areaCompatible: false,
          issues,
          confidence: 0,
        };
      }

      const expectedArea = AREA_ID_TO_MEDICAL_AREA[theme.areaId];
      const areaCompatible = Boolean(area && expectedArea && area === expectedArea);

      if (!areaCompatible) {
        issues.push(
          `Área informada (${area || "vazia"}) é incompatível com a área canônica do tema (${expectedArea})`
        );
      }

      return {
        valid: areaCompatible && issues.length === 0,
        canonicalTopicId: theme.id,
        canonicalTopicTitle: theme.title,
        area: expectedArea || null,
        areaCompatible,
        issues,
        confidence: areaCompatible ? 1.0 : 0.5,
      };
    }

    // 2. If canonicalTopicId is missing (Legacy or unclassified ingestion)
    const resolution = this.resolveCanonicalTopic(input);
    if (
      resolution.matchType === "DIRECT_ID" ||
      resolution.matchType === "CANONICAL_NAME" ||
      resolution.matchType === "EXPLICIT_ALIAS"
    ) {
      issues.push(
        `Questão não possui canonicalTopicId explícito (resolvido por alias para '${resolution.canonicalTopicId}')`
      );
      return {
        valid: false, // Ingestion contract requires explicit canonicalTopicId for new VERIFIED questions
        canonicalTopicId: resolution.canonicalTopicId,
        canonicalTopicTitle: resolution.canonicalTopicTitle,
        area: resolution.area,
        areaCompatible: (resolution.matchType as string) !== "AREA_MISMATCH",
        issues,
        confidence: resolution.confidence,
      };
    }

    issues.push(resolution.notes || "Taxonomia indefinida ou incompatível");
    return {
      valid: false,
      canonicalTopicId: null,
      canonicalTopicTitle: null,
      area: area || null,
      areaCompatible: false,
      issues,
      confidence: resolution.confidence,
    };
  }

  /**
   * Retrieves canonical IRS for a Grande Tema
   */
  static getIrsForTheme(theme: GrandeTema): number {
    switch (theme.recurrence as string) {
      case "altissima":
        return 95;
      case "alta":
        return 85;
      case "recorrente":
      case "media":
        return 70;
      case "baixa":
      default:
        return 50;
    }
  }

  /**
   * Validates integrity of all 75 canonical themes
   */
  static auditCanonicalTaxonomy(): {
    totalThemes: number;
    duplicateIds: string[];
    duplicateAliases: string[];
    themesWithoutArea: string[];
    themesWithoutIrs: string[];
  } {
    this.initialize();

    const ids = new Set<string>();
    const duplicateIds: string[] = [];
    const themesWithoutArea: string[] = [];
    const themesWithoutIrs: string[] = [];

    for (const theme of ALL_GRANDES_TEMAS) {
      if (ids.has(theme.id)) {
        duplicateIds.push(theme.id);
      }
      ids.add(theme.id);

      if (!theme.areaId || !AREA_ID_TO_MEDICAL_AREA[theme.areaId]) {
        themesWithoutArea.push(theme.id);
      }

      const irs = this.getIrsForTheme(theme);
      if (typeof irs !== "number" || isNaN(irs) || irs <= 0) {
        themesWithoutIrs.push(theme.id);
      }
    }

    return {
      totalThemes: ALL_GRANDES_TEMAS.length,
      duplicateIds,
      duplicateAliases: [],
      themesWithoutArea,
      themesWithoutIrs,
    };
  }
}
