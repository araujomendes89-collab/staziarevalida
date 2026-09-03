import { GrandeTema, MedicalAreaInfo, MedicalAreaId } from "../../types/grandesTemas";
import { CLINICA_MEDICA_THEMES } from "./clinicalData";
import { CIRURGIA_THEMES } from "./cirurgiaData";
import { PEDIATRIA_THEMES } from "./pediatriaData";
import { GINECOLOGIA_THEMES } from "./ginecologiaData";
import { PREVENTIVA_THEMES } from "./preventivaData";

export const MEDICAL_AREAS_CONFIG: MedicalAreaInfo[] = [
  {
    id: "clinica-medica",
    name: "Clínica Médica",
    shortName: "Clínica",
    iconName: "Stethoscope",
    themeCount: CLINICA_MEDICA_THEMES.length,
    description: "Grandes emergências, cardiologia, pneumologia, nefrologia, infectologia e endocrinologia focadas nas diretrizes do SUS e Revalida INEP.",
    colorTheme: {
      bgLight: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
      accent: "#3b82f6",
      gradient: "from-blue-600 to-indigo-700",
    },
    historicalWeight: "20% da prova objetiva e estações práticas de OSCE",
    topRevalidaTopics: [
      "Hipertensão Arterial e Crise Hipertensiva",
      "Síndromes Coronarianas Agudas (SCA)",
      "Diabetes Mellitus Tipo 2 e Cetoacidose",
      "Sepse e Choque Séptico",
      "Tuberculose Pulmonar e Extrapulmonar",
    ],
  },
  {
    id: "cirurgia-geral",
    name: "Cirurgia Geral e Trauma",
    shortName: "Cirurgia",
    iconName: "Scissors",
    themeCount: CIRURGIA_THEMES.length,
    description: "Suporte Avançado de Vida no Trauma (ATLS 10ª Ed), abdome agudo, hérnias, hemorragias digestivas e queimaduras.",
    colorTheme: {
      bgLight: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      accent: "#10b981",
      gradient: "from-emerald-600 to-teal-700",
    },
    historicalWeight: "20% da prova teórica e estações de procedimentos invasivos",
    topRevalidaTopics: [
      "Trauma Abdominal e Avaliação com FAST",
      "Trauma Torácico e Drenagem em Selo d'Água",
      "Apendicite Aguda e Escore de Alvarado",
      "Colecistite Aguda e Critérios de Tóquio",
      "Hemorragia Digestiva Alta e Escore de Rockall",
    ],
  },
  {
    id: "pediatria",
    name: "Pediatria e Puericultura",
    shortName: "Pediatria",
    iconName: "Baby",
    themeCount: PEDIATRIA_THEMES.length,
    description: "Calendário PNI 2026, crescimento e desenvolvimento (marcos Denver II), aleitamento materno, diarreia aguda e doenças exantemáticas.",
    colorTheme: {
      bgLight: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      accent: "#f59e0b",
      gradient: "from-amber-600 to-orange-700",
    },
    historicalWeight: "20% da prova com ênfase em Atenção Básica e Urgências Pediátricas",
    topRevalidaTopics: [
      "Calendário Vacinal da Criança (PNI 2024/2026)",
      "Aleitamento Materno e Alimentação Complementar",
      "Doença Diarreica Aguda e Planos de Reidratação",
      "Bronquiolite Viral Aguda",
      "Doenças Exantemáticas na Infância",
    ],
  },
  {
    id: "ginecologia-obstetricia",
    name: "Ginecologia e Obstetrícia",
    shortName: "G.O.",
    iconName: "HeartPulse",
    themeCount: GINECOLOGIA_THEMES.length,
    description: "Pré-natal de alto risco, síndromes hipertensivas, trabalho de parto humanizado, hemorragia pós-parto e rastreamento de câncer.",
    colorTheme: {
      bgLight: "bg-pink-500/10",
      border: "border-pink-500/30",
      text: "text-pink-400",
      accent: "#ec4899",
      gradient: "from-pink-600 to-rose-700",
    },
    historicalWeight: "20% da prova teórica e simulações de parto e emergência obstétrica",
    topRevalidaTopics: [
      "Assistência Pré-Natal no SUS",
      "Síndromes Hipertensivas da Gestação",
      "Sangramentos da 1ª e 2ª Metades da Gestação",
      "Hemorragia Pós-Parto e Estratégia Zero Morte Materna",
      "Rastreamento do Câncer do Colo do Útero (INCA)",
    ],
  },
  {
    id: "medicina-preventiva",
    name: "Medicina Preventiva e Saúde Coletiva",
    shortName: "Preventiva",
    iconName: "ShieldCheck",
    themeCount: PREVENTIVA_THEMES.length,
    description: "Legislação do SUS, Atenção Primária (Starfield), epidemiologia, testes diagnósticos, vigilância em saúde e ética médica.",
    colorTheme: {
      bgLight: "bg-purple-500/10",
      border: "border-purple-500/30",
      text: "text-purple-400",
      accent: "#a855f7",
      gradient: "from-purple-600 to-violet-800",
    },
    historicalWeight: "20% da prova teórica e estações de acolhimento e bioética no SUS",
    topRevalidaTopics: [
      "Princípios e Diretrizes Estruturantes do SUS (Leis 8.080 e 8.142)",
      "Atributos da Atenção Primária à Saúde de Barbara Starfield",
      "Testes Diagnósticos (Sensibilidade, Especificidade, VPP e VPN)",
      "Lista Nacional de Notificação Compulsória (Imediata vs Semanal)",
      "Código de Ética Médica e Declaração de Óbito (SVO vs IML)",
    ],
  },
];

export const ALL_GRANDES_TEMAS: GrandeTema[] = [
  ...CLINICA_MEDICA_THEMES,
  ...CIRURGIA_THEMES,
  ...PEDIATRIA_THEMES,
  ...GINECOLOGIA_THEMES,
  ...PREVENTIVA_THEMES,
];

export function getGrandesTemasByArea(areaId: MedicalAreaId): GrandeTema[] {
  return ALL_GRANDES_TEMAS.filter((theme) => theme.areaId === areaId);
}

export function getGrandeTemaById(themeId: string): GrandeTema | undefined {
  return ALL_GRANDES_TEMAS.find((theme) => theme.id === themeId);
}

export function getGrandeTemaBySlug(slug: string): GrandeTema | undefined {
  return ALL_GRANDES_TEMAS.find((theme) => theme.slug === slug);
}

export function searchGrandesTemas(query: string, areaFilter?: MedicalAreaId): GrandeTema[] {
  const normalizedQuery = query.toLowerCase().trim();
  let list = ALL_GRANDES_TEMAS;

  if (areaFilter) {
    list = list.filter((t) => t.areaId === areaFilter);
  }

  if (!normalizedQuery) return list;

  return list.filter((t) => {
    return (
      t.title.toLowerCase().includes(normalizedQuery) ||
      t.summary.toLowerCase().includes(normalizedQuery) ||
      t.areaName.toLowerCase().includes(normalizedQuery) ||
      t.inepInsights.mostTestedDiagnosis.toLowerCase().includes(normalizedQuery) ||
      t.inepInsights.mostTestedConduct.toLowerCase().includes(normalizedQuery)
    );
  });
}
