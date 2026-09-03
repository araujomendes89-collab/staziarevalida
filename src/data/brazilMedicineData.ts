export interface TermMapping {
  spanishTerm: string;
  portugueseBrazilTerm: string;
  category: string;
  contextInep: string;
}

export interface SusConcept {
  acronym: string;
  fullName: string;
  description: string;
  relevanceForInep: string;
}

export interface CompulsoryDisease {
  disease: string;
  timeframe: "IMMEDIATE" | "WEEKLY";
  notes?: string;
}

export interface PniVaccine {
  age: string;
  vaccine: string;
  protectsAgainst: string;
}

export const BRAZIL_MEDICAL_TERMS: TermMapping[] = [
  {
    spanishTerm: "Guardia / Turno médico",
    portugueseBrazilTerm: "Plantão Médico / Plantonista",
    category: "Rotina Assistencial",
    contextInep: "Nas questões do Revalida, 'médico plantonista' é o profissional responsável pela sala de emergência, PA ou enfermaria."
  },
  {
    spanishTerm: "Internación / Sala",
    portugueseBrazilTerm: "Internação Hospitalar / Leito de Enfermaria",
    category: "Atenção Hospitalar",
    contextInep: "No SUS, toda internação é autorizada via AIH (Autorização de Internação Hospitalar)."
  },
  {
    spanishTerm: "Embarazo / Gestación",
    portugueseBrazilTerm: "Gravidez / Pré-Natal de Baixo Risco",
    category: "Obstetrícia",
    contextInep: "No Brasil utiliza-se DUM, IG e o Cartão da Gestante na APS com no mínimo 6 consultas e exames de triagem rápida."
  },
  {
    spanishTerm: "Centro de Salud / Policlínica",
    portugueseBrazilTerm: "Unidade Básica de Saúde (UBS) / USF",
    category: "Atenção Primária",
    contextInep: "Porta de entrada prioritária da Rede de Atenção à Saúde (RAS) estruturada com Equipes de Saúde da Família (eSF)."
  },
  {
    spanishTerm: "Triage / Clasificación",
    portugueseBrazilTerm: "Acolhimento com Classificação de Risco (Manchester)",
    category: "Urgência & Emergência",
    contextInep: "Cores: Vermelho (0min), Laranja (10min), Amarelo (50min), Verde (120min), Azul (240min)."
  },
  {
    spanishTerm: "Laboratorio de guardia / Examen de orina",
    portugueseBrazilTerm: "EAS (Elementos Anormais e Sedimento) / Urina Tipo 1",
    category: "Propedêutica",
    contextInep: "No Brasil 'EAS' ou 'Urina Tipo 1' é o exame sumário de urina (fita reagente + sedimento)."
  },
  {
    spanishTerm: "Vacunación / Esquema",
    portugueseBrazilTerm: "Programa Nacional de Imunizações (PNI)",
    category: "Saúde Coletiva / Pediatria",
    contextInep: "O PNI segue calendário oficial rigoroso e é um dos temas de maior peso nas provas do INEP."
  },
  {
    spanishTerm: "Ecografía / Ultrasonido",
    portugueseBrazilTerm: "Ultrassonografia (USG)",
    category: "Diagnóstico por Imagem",
    contextInep: "No Brasil abrevia-se frequentemente como USG (USG Obstétrica, USG Abdominal Total, etc.)."
  }
];

export const BRAZIL_SUS_CONCEPTS: SusConcept[] = [
  {
    acronym: "APS",
    fullName: "Atenção Primária à Saúde",
    description: "Nível fundamental de atenção, ordenadora da rede e coordenadora do cuidado no SUS, implementada pela Estratégia Saúde da Família (ESF).",
    relevanceForInep: "Base de mais de 30% das questões de Medicina Preventiva e Saúde Coletiva."
  },
  {
    acronym: "SINAN",
    fullName: "Sistema de Informação de Agravos de Notificação",
    description: "Sistema oficial de vigilância epidemiológica do Ministério da Saúde para registro de doenças e agravos de notificação compulsória.",
    relevanceForInep: "Cai frequentemente exigindo identificação de prazos (Imediata até 24h vs Semanal)."
  },
  {
    acronym: "SAMU 192",
    fullName: "Serviço de Atendimento Móvel de Urgência",
    description: "Componente móvel pré-hospitalar da Rede de Atenção às Urgências, acionado pelo telefone 192 com Central de Regulação Médica.",
    relevanceForInep: "Cobra indicação correta de Suporte Básico de Vida (USB) vs Suporte Avançado (USA)."
  },
  {
    acronym: "CONITEC",
    fullName: "Comissão Nacional de Incorporação de Tecnologias no SUS",
    description: "Órgão do Ministério da Saúde que avalia evidências científicas, custo-efetividade e segurança para inclusão de medicamentos e diretrizes clínicas (PCDT).",
    relevanceForInep: "Fonte padrão-ouro para os PCDTs cobrados como gabarito oficial pelo INEP."
  }
];

export const COMPULSORY_NOTIFICATION_DISEASES: CompulsoryDisease[] = [
  { disease: "Botulismo", timeframe: "IMMEDIATE" },
  { disease: "Cólera", timeframe: "IMMEDIATE" },
  { disease: "Febre Amarela", timeframe: "IMMEDIATE" },
  { disease: "Raiva Humana e Acidentes por Animais Potencialmente Transmissores", timeframe: "IMMEDIATE" },
  { disease: "Dengue (Óbito ou Formas Graves)", timeframe: "IMMEDIATE" },
  { disease: "Meningite (Suspeita)", timeframe: "IMMEDIATE" },
  { disease: "Tuberculose", timeframe: "WEEKLY" },
  { disease: "Hanseníase", timeframe: "WEEKLY" },
  { disease: "Hepatites Virais (A, B, C)", timeframe: "WEEKLY" },
  { disease: "Sífilis (Gestante, Congênita ou Adquirida)", timeframe: "WEEKLY" },
  { disease: "Leishmaniose Tegumentar e Visceral", timeframe: "WEEKLY" },
  { disease: "Esquistossomose", timeframe: "WEEKLY" },
];

export const PNI_VACCINES: PniVaccine[] = [
  { age: "Ao nascer", vaccine: "BCG + Hepatite B", protectsAgainst: "Formas graves de Tuberculose (Miliar/Meníngea) e Hepatite B" },
  { age: "2 meses", vaccine: "Pentavalente + VIP + Pneumo 10 + VORH", protectsAgainst: "Difteria, Tétano, Coqueluche, Hib, Hep B, Pólio, Pneumococo e Rotavírus" },
  { age: "3 meses", vaccine: "Meningocócica C", protectsAgainst: "Doença meningocócica sorogrupo C" },
  { age: "4 meses", vaccine: "Pentavalente + VIP + Pneumo 10 + VORH (2ª dose)", protectsAgainst: "Reforço do esquema inicial" },
  { age: "5 meses", vaccine: "Meningocócica C (2ª dose)", protectsAgainst: "Segunda dose de imunização meningocócica" },
  { age: "6 meses", vaccine: "Pentavalente + VIP (3ª dose)", protectsAgainst: "Terceira dose pentavalente e pólio inativada" },
  { age: "9 meses", vaccine: "Febre Amarela (Dose inicial)", protectsAgainst: "Febre amarela para todo o território nacional" },
  { age: "12 meses", vaccine: "Tríplice Viral + Pneumo 10 (Reforço) + Meningo C (Reforço)", protectsAgainst: "Sarampo, Caxumba, Rubéola e reforços" },
  { age: "15 meses", vaccine: "DTP + VOP (ou VIP) + Hepatite A + Tetra Viral", protectsAgainst: "Reforços DTP e proteção varicela/sarampo" },
  { age: "4 anos", vaccine: "DTP + VOP + Febre Amarela (Reforço)", protectsAgainst: "Reforços da primeira infância" },
  { age: "9 a 14 anos", vaccine: "HPV Quadrivalente + Meningo ACWY", protectsAgainst: "Papilomavírus humano (câncer de colo de útero/pênis) e meningite ACWY" },
];
