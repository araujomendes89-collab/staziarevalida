// Nomes em português da classificação das questões (question_dna: subárea e competência). O banco guarda o código do motor
// (revalida_taxonomy_v2_1: "NEONATOLOGY", "EMERGENCY_STABILIZATION"); o aluno vê só o nome. Usado pelas telas do aluno
// (Desempenho, Análise Inteligente, fim da conversa do Tutor) e pelo contexto que o servidor do Tutor manda para a IA.
// Conferido em produção em 18/10/2026: todos os códigos usados em question_dna estão aqui.

export const SUBAREA_LABEL: Record<string, string> = {
  // Clínica Médica
  CARDIOLOGY: "Cardiologia",
  CLINICAL_EMERGENCIES: "Emergências clínicas",
  DERMATOLOGY: "Dermatologia",
  ENDOCRINOLOGY: "Endocrinologia",
  GASTROENTEROLOGY_HEPATOLOGY: "Gastroenterologia e hepatologia",
  GERIATRICS: "Geriatria",
  HEMATOLOGY_ONCOLOGY: "Hematologia e oncologia",
  INFECTIOUS_DISEASES: "Infectologia",
  NEPHROLOGY_ELECTROLYTES: "Nefrologia e distúrbios hidroeletrolíticos",
  NEUROLOGY: "Neurologia",
  PSYCHIATRY: "Psiquiatria",
  PULMONOLOGY: "Pneumologia",
  RHEUMATOLOGY: "Reumatologia",
  // Cirurgia Geral
  ACUTE_ABDOMEN: "Abdome agudo",
  BURNS: "Queimaduras",
  COLOPROCTOLOGY: "Coloproctologia",
  HERNIAS: "Hérnias da parede abdominal",
  ORTHOPEDICS_TRAUMA: "Ortopedia e traumatologia",
  PERIOPERATIVE_CARE: "Cuidados perioperatórios",
  TRAUMA_ATLS: "Trauma (ATLS)",
  UROLOGY: "Urologia",
  VASCULAR_SURGERY: "Cirurgia vascular",
  // Pediatria
  NEONATOLOGY: "Neonatologia",
  PEDIATRIC_EMERGENCIES: "Emergências pediátricas",
  PEDIATRIC_ENDOCRINOLOGY: "Endocrinologia pediátrica",
  PEDIATRIC_GASTRO_NUTRITION: "Gastroenterologia e nutrição pediátrica",
  PEDIATRIC_HEMATOLOGY_ONCOLOGY: "Hematologia e oncologia pediátrica",
  PEDIATRIC_INFECTIOUS_EXANTHEMS: "Infectologia pediátrica e doenças exantemáticas",
  PEDIATRIC_NEPHROLOGY: "Nefrologia pediátrica",
  PEDIATRIC_NEUROLOGY: "Neurologia pediátrica",
  PEDIATRIC_RESPIRATORY: "Pneumologia pediátrica",
  IMMUNIZATION: "Imunização na infância",
  WELL_CHILD_CARE_GROWTH_DEVELOPMENT: "Puericultura, crescimento e desenvolvimento",
  // Ginecologia e Obstetrícia
  GYNECOLOGY: "Ginecologia",
  OBSTETRICS: "Obstetrícia",
  // Medicina de Família e Comunidade / Saúde Coletiva
  EPIDEMIOLOGY_BIOSTATISTICS: "Epidemiologia e bioestatística",
  ETHICS_COMMUNICATION: "Ética médica e comunicação",
  HEALTH_SURVEILLANCE: "Vigilância em saúde",
  IMMUNIZATION_PUBLIC_HEALTH: "Vacinação em saúde pública",
  MENTAL_HEALTH_PRIMARY_CARE: "Saúde mental na atenção primária",
  OCCUPATIONAL_HEALTH: "Saúde do trabalhador",
  PREVENTION_SCREENING: "Prevenção e rastreamento",
  PRIMARY_CARE: "Atenção primária à saúde",
  SUS_HEALTH_SYSTEM: "SUS e sistemas de saúde",
};

export const COMPETENCY_LABEL: Record<string, string> = {
  CONTRAINDICATION_ASSESSMENT: "Avaliação de contraindicações",
  DIAGNOSIS: "Diagnóstico",
  DIFFERENTIAL_DIAGNOSIS: "Diagnóstico diferencial",
  EMERGENCY_STABILIZATION: "Estabilização na emergência",
  EPIDEMIOLOGIC_REASONING: "Raciocínio epidemiológico",
  ETHICAL_LEGAL_DECISION: "Decisão ética e legal",
  FOLLOW_UP: "Seguimento",
  INITIAL_ASSESSMENT: "Avaliação inicial",
  INTERPRET_DIAGNOSTIC_TEST: "Interpretação de exames",
  NONPHARMACOLOGIC_TREATMENT: "Tratamento não farmacológico",
  PHARMACOLOGIC_TREATMENT: "Tratamento farmacológico",
  PREVENTION: "Prevenção",
  PROGNOSIS: "Prognóstico",
  PUBLIC_HEALTH_ACTION: "Ação em saúde pública",
  RECOGNIZE_COMPLICATION: "Reconhecimento de complicações",
  REFERRAL: "Encaminhamento",
  RISK_FACTOR_ASSESSMENT: "Avaliação de fatores de risco",
  RISK_STRATIFICATION: "Estratificação de risco",
  SCREENING: "Rastreamento",
  SELECT_DIAGNOSTIC_TEST: "Escolha do exame",
  SELECT_TREATMENT: "Escolha do tratamento",
  SURGICAL_MANAGEMENT: "Conduta cirúrgica",
  VACCINATION: "Vacinação",
};

/** Texto mostrado quando chega um código que ainda não tem nome (nunca o código cru). */
export const SUBAREA_DESCONHECIDA = "Tema em classificação";
export const COMPETENCIA_DESCONHECIDA = "Habilidade em classificação";

// código do motor: só maiúsculas, números e "_" ("NEONATOLOGY"); texto já em português passa como está
const PARECE_CODIGO = /^[A-Z0-9_]+$/;

type AoDesconhecido = (tipo: "subarea" | "competency", codigo: string) => void;

function rotulo(mapa: Record<string, string>, tipo: "subarea" | "competency", generico: string, valor: unknown, aoDesconhecido?: AoDesconhecido): string | null {
  const v = typeof valor === "string" ? valor.trim() : "";
  if (!v) return null;
  if (Object.prototype.hasOwnProperty.call(mapa, v)) return mapa[v];
  if (!PARECE_CODIGO.test(v)) return v;
  aoDesconhecido?.(tipo, v);
  return generico;
}

/** Nome da subárea em português; código sem nome vira SUBAREA_DESCONHECIDA; vazio vira null. */
export const subareaLabel = (codigo: unknown, aoDesconhecido?: AoDesconhecido): string | null =>
  rotulo(SUBAREA_LABEL, "subarea", SUBAREA_DESCONHECIDA, codigo, aoDesconhecido);

/** Nome da competência em português; código sem nome vira COMPETENCIA_DESCONHECIDA; vazio vira null. */
export const competencyLabel = (codigo: unknown, aoDesconhecido?: AoDesconhecido): string | null =>
  rotulo(COMPETENCY_LABEL, "competency", COMPETENCIA_DESCONHECIDA, codigo, aoDesconhecido);

/**
 * Para o contexto da IA (servidor do Tutor): o nome em português, ou null quando o código não tem nome
 * (assim a IA não recebe nem fala "NEONATOLOGY" nem um texto genérico sem sentido).
 */
export function subareaParaIA(codigo: unknown): string | null {
  let desconhecido = false;
  const r = subareaLabel(codigo, () => {
    desconhecido = true;
  });
  return desconhecido ? null : r;
}
