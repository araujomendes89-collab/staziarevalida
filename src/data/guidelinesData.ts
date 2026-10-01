import { MedicalGuideline, GuidelineAuditLog, GuidelineWatchAlert } from "../types";

export const SEED_MEDICAL_GUIDELINES: MedicalGuideline[] = [
  {
    id: "g-sbc-has-2026",
    title: "Diretrizes Brasileiras de Hipertensão Arterial — Atualização 2026",
    institution: "Sociedade Brasileira de Cardiologia (SBC) / SBH / SBN",
    specialty: "Cardiologia",
    topic: "Hipertensão Arterial Sistêmica",
    publicationYear: 2026,
    publicationDate: "2026-04-15",
    effectiveDate: "2026-05-01",
    version: "v2026.1",
    country: "BRASIL",
    sourceUrl: "https://abccardiol.org/diretriz-has-2026",
    supersedesGuidelineId: "g-sbc-has-2020",
    status: "CURRENT",
    affectedQuestionsCount: 48,
    lastCheckedAt: "2026-08-31"
  },
  {
    id: "g-sbd-dm-2026",
    title: "Diretrizes da Sociedade Brasileira de Diabetes — Edição 2026",
    institution: "Sociedade Brasileira de Diabetes (SBD)",
    specialty: "Endocrinologia & Clínica Médica",
    topic: "Diabetes Mellitus Tipo 2 e Doença Renal do Diabetes",
    publicationYear: 2026,
    publicationDate: "2026-02-20",
    effectiveDate: "2026-03-01",
    version: "v2026.2",
    country: "BRASIL",
    sourceUrl: "https://diretriz.diabetes.org.br",
    supersedesGuidelineId: "g-sbd-dm-2023",
    status: "CURRENT",
    affectedQuestionsCount: 36,
    lastCheckedAt: "2026-08-31"
  },
  {
    id: "g-gina-asthma-2026",
    title: "Global Initiative for Asthma (GINA Report 2026) — Adaptação SUS",
    institution: "GINA / Sociedade Brasileira de Pneumologia e Tisiologia (SBPT)",
    specialty: "Pneumologia & Pediatria",
    topic: "Manejo da Asma na Atenção Primária e Urgência",
    publicationYear: 2026,
    publicationDate: "2026-05-10",
    effectiveDate: "2026-05-15",
    version: "v2026-Global",
    country: "INTERNACIONAL",
    sourceUrl: "https://ginasthma.org/gina-reports",
    status: "CURRENT",
    affectedQuestionsCount: 29,
    lastCheckedAt: "2026-08-31"
  },
  {
    id: "g-febrasgo-pre-eclampsia-2026",
    title: "Manual de Hipertensão na Gestação e Pré-Eclâmpsia — FEBRASGO 2026",
    institution: "Federação Brasileira das Associações de Ginecologia e Obstetrícia (FEBRASGO)",
    specialty: "Ginecologia e Obstetrícia",
    topic: "Síndromes Hipertensivas na Gestação e Profilaxia com AAS/Cálcio",
    publicationYear: 2026,
    publicationDate: "2026-03-12",
    effectiveDate: "2026-04-01",
    version: "v2026.1",
    country: "BRASIL",
    sourceUrl: "https://febrasgo.org.br/preeclampsia-2026",
    status: "CURRENT",
    affectedQuestionsCount: 42,
    lastCheckedAt: "2026-08-31"
  },
  {
    id: "g-ms-pni-vacinas-2026",
    title: "Calendário Nacional de Vacinação do SUS — Atualizações PNI 2026",
    institution: "Ministério da Saúde (MS / SVSA)",
    specialty: "Pediatria & Saúde Coletiva",
    topic: "Imunização na Infância e Vacinas Novas (VIP / Dengue / HPV)",
    publicationYear: 2026,
    publicationDate: "2026-01-10",
    effectiveDate: "2026-01-15",
    version: "PNI-2026.1",
    country: "BRASIL",
    sourceUrl: "https://gov.br/saude/pni-2026",
    status: "CURRENT",
    affectedQuestionsCount: 31,
    lastCheckedAt: "2026-08-31"
  },
  {
    id: "g-ms-dengue-2026",
    title: "Dengue: Diagnóstico e Manejo Clínico (Adulto e Criança) — 6ª Edição Revisada MS",
    institution: "Ministério da Saúde (MS)",
    specialty: "Infectologia & Atenção Primária",
    topic: "Arboviroses e Classificação de Risco / Hidratação Venosa",
    publicationYear: 2026,
    publicationDate: "2026-02-05",
    effectiveDate: "2026-02-10",
    version: "6ª Edição",
    country: "BRASIL",
    sourceUrl: "https://gov.br/saude/dengue-manejo-2026",
    status: "CURRENT",
    affectedQuestionsCount: 24,
    lastCheckedAt: "2026-08-31"
  },
  {
    id: "g-ilas-sepsis-2026",
    title: "Diretrizes Brasileiras para Manejo da Sepse e Choque Séptico — ILAS 2026",
    institution: "Instituto Latino-Americano de Sepse (ILAS) / AMIB",
    specialty: "Medicina de Emergência & Terapia Intensiva",
    topic: "Pacote de 1 Hora da Sepse e Ressuscitação Volêmica",
    publicationYear: 2026,
    publicationDate: "2026-06-01",
    effectiveDate: "2026-06-10",
    version: "v2026.1",
    country: "BRASIL",
    sourceUrl: "https://ilas.org.br/diretrizes-2026",
    status: "CURRENT",
    affectedQuestionsCount: 19,
    lastCheckedAt: "2026-08-31"
  }
];

export const SEED_GUIDELINE_WATCH_ALERTS: GuidelineWatchAlert[] = [
  {
    id: "alert-001",
    guidelineId: "g-sbc-has-2026",
    guidelineTitle: "Diretrizes Brasileiras de Hipertensão Arterial — 2026",
    institution: "Sociedade Brasileira de Cardiologia (SBC)",
    detectedDate: "2026-04-18",
    affectedQuestionsCount: 48,
    criticalChangesCount: 3,
    summary: "Revisão das metas pressóricas e indicação precoce de combinação de fármacos em dose fixa no estágio 1 com risco cardiovascular moderado/alto.",
    actionRequired: "Revisar questões de 2021 e 2022 com monoterapia inicial em hipertensos estágio 1 com múltiplos fatores de risco.",
    status: "REVIEWED"
  },
  {
    id: "alert-002",
    guidelineId: "g-sbd-dm-2026",
    guidelineTitle: "Diretrizes SBD 2026: iSGLT2 e análogos de GLP-1 na DRC/IC",
    institution: "Sociedade Brasileira de Diabetes (SBD)",
    detectedDate: "2026-02-25",
    affectedQuestionsCount: 36,
    criticalChangesCount: 2,
    summary: "Inibidores de SGLT2 passam a ser recomendados como primeira linha independente da HbA1c em pacientes com DM2 e Doença Renal ou Insuficiência Cardíaca.",
    actionRequired: "Atualizar questões históricas onde a Metformina era considerada única opção obrigatória isolada inicial.",
    status: "APPLIED"
  },
  {
    id: "alert-003",
    guidelineId: "g-ms-pni-vacinas-2026",
    guidelineTitle: "Substituição definitiva da VOP pela VIP em todas as doses do Calendário SUS",
    institution: "Ministério da Saúde (MS)",
    detectedDate: "2026-01-12",
    affectedQuestionsCount: 31,
    criticalChangesCount: 4,
    summary: "A vacina oral da poliomielite (VOP - gotinha) foi 100% substituída pela vacina inativada poliomielite injetável (VIP) no esquema básico e reforços.",
    actionRequired: "Sinalizar com alerta de desatualização todas as questões de 2021-2023 que cobravam esquema com VOP aos 15 meses e 4 anos.",
    status: "APPLIED"
  }
];

export const SEED_GUIDELINE_AUDIT_LOGS: GuidelineAuditLog[] = [
  {
    id: "log-001",
    questionId: "q-cm-03-has",
    questionCode: "REV-2022.1-CM-34",
    previousStatus: "CURRENT",
    newStatus: "OFFICIAL_ANSWER_HISTORICAL",
    guidelineTitle: "Diretrizes Brasileiras de Hipertensão Arterial — 2026 (SBC)",
    changedBy: "Dr. Rodrigo Valente Mendes (CRM-SP 184.920 - Cardiologia)",
    approvedBy: "Dra. Carolina Albuquerque (Conselho Editorial StaziaMed)",
    timestamp: "2026-05-14T10:30:00Z",
    reason: "Gabarito histórico da prova de 2022 considerou monoterapia com IECA (Alternativa B), porém sob a diretriz de 2026 a conduta indicada é combinação fixa IECA + BCC (Alternativa C).",
    impactLevel: "ALTO"
  },
  {
    id: "log-002",
    questionId: "q-ped-02-vip",
    questionCode: "REV-2021-PED-19",
    previousStatus: "CURRENT",
    newStatus: "OUTDATED",
    guidelineTitle: "Calendário Nacional de Vacinação do SUS — PNI 2026",
    changedBy: "Dra. Mariana Rios (CRM-RJ 142.110 - Pediatria)",
    approvedBy: "Dr. Rodrigo Valente Mendes (Conselho Editorial StaziaMed)",
    timestamp: "2026-02-01T14:15:00Z",
    reason: "A VOP foi descontinuada no Brasil em 2024/2025; o esquema atual é 100% VIP injetável. Gabarito histórico mantido com alerta clínico.",
    impactLevel: "CRITICO"
  },
  {
    id: "log-003",
    questionId: "q-cm-04-dm",
    questionCode: "REV-2023.1-CM-41",
    previousStatus: "REVIEW_REQUIRED",
    newStatus: "UPDATED_GUIDELINE",
    guidelineTitle: "Diretrizes SBD 2026: Nefroproteção no DM2",
    changedBy: "Dr. Lucas Fontes (CRM-MG 98.740 - Endocrinologia)",
    approvedBy: "Dra. Carolina Albuquerque (Conselho Editorial StaziaMed)",
    timestamp: "2026-03-10T16:45:00Z",
    reason: "Adicionada nota de atualização sobre indicação de Dapagliflozina/Empagliflozina independente do controle glicêmico na presença de albuminúria > 30 mg/g.",
    impactLevel: "MEDIO"
  }
];
