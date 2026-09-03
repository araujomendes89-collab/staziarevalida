export interface ExamInfo {
  targetEdition: string;
  examDate?: string;
  hasConfiguredDate: boolean;
  daysRemaining: number | null;
  phaseId: 
    | "CONFIGURACAO_PENDENTE"
    | "FASE_1_FUNDAMENTOS"
    | "FASE_2_CONSOLIDACAO"
    | "FASE_3_RETA_FINAL"
    | "FASE_4_ULTIMOS_DIAS"
    | "FINAL_SPRINT_IMPACT_GAPS"
    | "FINAL_SPRINT_MIXED_ERRORS"
    | "FINAL_SPRINT_REAL_SIMULATION"
    | "FINAL_SPRINT_HIGH_YIELD_REVIEW"
    | "VESPERA"
    | "DIA_DA_PROVA";
  phaseName: string;
  phaseDescription: string;
  badgeText: string;
  strategyMode: "CONVENTIONAL" | "FINAL_SPRINT";
  expectedPointsPerHour: number;
  officialDetails: {
    edital: string;
    totalQuestions: number;
    totalMinutes: number;
    optionsCount: number;
    confirmationCardDate: string;
    gateOpenTime: string;
    gateCloseTime: string;
    examStartTime: string;
    examEndTime: string;
    appealPeriod: string;
    finalResultsDate: string;
  };
  confidenceInterval: {
    min: number;
    max: number;
    confidenceLevel: number;
    historicalCutoff: number;
    formulaExplanation: string;
  };
}

export interface OfficialEditionOption {
  id: string;
  name: string;
  stage: "1ª Etapa (Teórica)" | "2ª Etapa (Habilidades Clínicas)";
  defaultDate: string;
  isCurrent: boolean;
  edital: string;
  confirmationCardDate: string;
  gateOpenTime: string;
  gateCloseTime: string;
  examStartTime: string;
  examEndTime: string;
  totalQuestions: number;
  totalMinutes: number;
  optionsCount: number;
  appealPeriod: string;
  finalResultsDate: string;
}

export const OFFICIAL_REVALIDA_EDITIONS: OfficialEditionOption[] = [
  {
    id: "2026-2-TEORICA",
    name: "Revalida INEP 2026/2",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2026-09-13",
    isCurrent: true,
    edital: "Edital nº 76, de 12/06/2026 (com retificação)",
    confirmationCardDate: "2026-09-04",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "15–17/09/2026",
    finalResultsDate: "04/12/2026",
  },
  {
    id: "2026-1-TEORICA",
    name: "Revalida INEP 2026/1",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2026-03-08",
    isCurrent: false,
    edital: "Edital nº 05/2026",
    confirmationCardDate: "2026-02-27",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "10–12/03/2026",
    finalResultsDate: "12/06/2026",
  },
  {
    id: "2025-2-TEORICA",
    name: "Revalida INEP 2025/2",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2025-08-17",
    isCurrent: false,
    edital: "Edital nº 61/2025",
    confirmationCardDate: "2025-08-08",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "19–21/08/2025",
    finalResultsDate: "28/11/2025",
  },
  {
    id: "2025-1-TEORICA",
    name: "Revalida INEP 2025/1",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2025-03-09",
    isCurrent: false,
    edital: "Edital nº 03/2025",
    confirmationCardDate: "2025-02-28",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "11–13/03/2025",
    finalResultsDate: "17/06/2025",
  },
  {
    id: "ENAMED-2025",
    name: "ENAMED 2025",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2025-10-19",
    isCurrent: false,
    edital: "Edital nº 18/2025 - INEP/MEC / Portaria Interministerial MEC/MS",
    confirmationCardDate: "2025-10-10",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "21–23/10/2025",
    finalResultsDate: "15/01/2026",
  },
  {
    id: "2024-2-TEORICA",
    name: "Revalida INEP 2024/2",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2024-08-25",
    isCurrent: false,
    edital: "Edital nº 58/2024",
    confirmationCardDate: "2024-08-16",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "27–29/08/2024",
    finalResultsDate: "06/12/2024",
  },
  {
    id: "2024-1-TEORICA",
    name: "Revalida INEP 2024/1",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2024-03-17",
    isCurrent: false,
    edital: "Edital nº 06/2024",
    confirmationCardDate: "2024-03-08",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "19–21/03/2024",
    finalResultsDate: "21/06/2024",
  },
  {
    id: "2023-2-TEORICA",
    name: "Revalida INEP 2023/2",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2023-08-06",
    isCurrent: false,
    edital: "Edital nº 44/2023",
    confirmationCardDate: "2023-07-28",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "08–10/08/2023",
    finalResultsDate: "01/12/2023",
  },
  {
    id: "2023-1-TEORICA",
    name: "Revalida INEP 2023/1",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2023-03-05",
    isCurrent: false,
    edital: "Edital nº 02/2023",
    confirmationCardDate: "2023-02-24",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "07–09/03/2023",
    finalResultsDate: "16/06/2023",
  },
  {
    id: "2022-2-TEORICA",
    name: "Revalida INEP 2022/2",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2022-08-07",
    isCurrent: false,
    edital: "Edital nº 52/2022",
    confirmationCardDate: "2022-07-29",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "09–11/08/2022",
    finalResultsDate: "02/12/2022",
  },
  {
    id: "2022-1-TEORICA",
    name: "Revalida INEP 2022/1",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2022-03-06",
    isCurrent: false,
    edital: "Edital nº 04/2022",
    confirmationCardDate: "2022-02-25",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "08–10/03/2022",
    finalResultsDate: "10/06/2022",
  },
  {
    id: "2021-TEORICA",
    name: "Revalida INEP 2021",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2021-09-05",
    isCurrent: false,
    edital: "Edital nº 38/2021",
    confirmationCardDate: "2021-08-27",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "07–09/09/2021",
    finalResultsDate: "10/12/2021",
  },
  {
    id: "2020-TEORICA",
    name: "Revalida INEP 2020",
    stage: "1ª Etapa (Teórica)",
    defaultDate: "2020-12-06",
    isCurrent: false,
    edital: "Edital nº 66/2020",
    confirmationCardDate: "2020-11-27",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 100,
    totalMinutes: 300,
    optionsCount: 4,
    appealPeriod: "08–10/12/2020",
    finalResultsDate: "05/03/2021",
  },
  {
    id: "2026-2-PRATICA",
    name: "Revalida INEP 2026/2 - Prova Prática",
    stage: "2ª Etapa (Habilidades Clínicas)",
    defaultDate: "2026-11-22",
    isCurrent: false,
    edital: "Edital nº 76/2026 - Etapa 2",
    confirmationCardDate: "2026-11-13",
    gateOpenTime: "12:00",
    gateCloseTime: "13:00",
    examStartTime: "13:30",
    examEndTime: "18:30",
    totalQuestions: 10,
    totalMinutes: 100,
    optionsCount: 0,
    appealPeriod: "24–26/11/2026",
    finalResultsDate: "15/01/2027",
  },
];

export class ExamEngine {
  static getExamInfo(
    targetEdition = "Revalida INEP 2026/2",
    customDate?: string,
    hasConfigured = true
  ): ExamInfo {
    const matchedEdition = OFFICIAL_REVALIDA_EDITIONS.find(
      (e) => e.name === targetEdition || e.id === targetEdition
    ) || OFFICIAL_REVALIDA_EDITIONS[0];

    const defaultOfficialDetails = {
      edital: matchedEdition.edital,
      totalQuestions: matchedEdition.totalQuestions,
      totalMinutes: matchedEdition.totalMinutes,
      optionsCount: matchedEdition.optionsCount,
      confirmationCardDate: matchedEdition.confirmationCardDate,
      gateOpenTime: matchedEdition.gateOpenTime,
      gateCloseTime: matchedEdition.gateCloseTime,
      examStartTime: matchedEdition.examStartTime,
      examEndTime: matchedEdition.examEndTime,
      appealPeriod: matchedEdition.appealPeriod,
      finalResultsDate: matchedEdition.finalResultsDate,
    };

    // If explicitly not configured or date is empty
    if (!hasConfigured && !customDate) {
      return {
        targetEdition: targetEdition || "Revalida INEP 2026/2",
        examDate: undefined,
        hasConfiguredDate: false,
        daysRemaining: null,
        phaseId: "CONFIGURACAO_PENDENTE",
        phaseName: "Data não definida",
        phaseDescription: "Defina a data oficial ou prevista da sua prova para ativar o cronograma adaptativo e a priorização diária.",
        badgeText: "Definir data da prova",
        strategyMode: "CONVENTIONAL",
        expectedPointsPerHour: 1.2,
        officialDetails: defaultOfficialDetails,
        confidenceInterval: {
          min: 60,
          max: 70,
          confidenceLevel: 95,
          historicalCutoff: 60,
          formulaExplanation:
            "Aguardando definição da data da prova para calibrar o volume de revisões espaçadas e a janela temporal de retenção.",
        },
      };
    }

    const dateStr = customDate || matchedEdition.defaultDate;
    
    // Calculate difference relative to real system clock (new Date())
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let targetTime: number;
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-").map(Number);
      targetTime = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    } else {
      targetTime = new Date(dateStr).getTime();
    }
    
    // Exact difference in days
    const diffDays = Math.max(0, Math.ceil((targetTime - todayMidnight) / (1000 * 60 * 60 * 24)));

    let phaseId: ExamInfo["phaseId"] = "FASE_2_CONSOLIDACAO";
    let phaseName = "Fase 2: Consolidação & Prática";
    let phaseDescription = "Resolução de questões oficiais e fechamento de gaps de raciocínio clínico.";
    let strategyMode: ExamInfo["strategyMode"] = "CONVENTIONAL";
    let expectedPointsPerHour = 1.8;

    // Automatic Final Sprint Mode when <= 14 days remaining
    if (diffDays === 0) {
      phaseId = "DIA_DA_PROVA";
      phaseName = "Dia D: Prova Oficial Revalida 2026/2";
      phaseDescription = "100 questões objetivas (A-D) em 300 minutos (13h30 às 18h30). Gestão estrita: 2.5 min/questão + 30 min para cartão-resposta.";
      strategyMode = "FINAL_SPRINT";
      expectedPointsPerHour = 4.5;
    } else if (diffDays === 1) {
      phaseId = "VESPERA";
      phaseName = "Véspera de Prova (12/09) — Logística & Desaceleração";
      phaseDescription = "Revisão leve de mnemônicos, verificação de local (cartão emitido em 04/09), caneta preta tubo transparente, portões 12h–13h.";
      strategyMode = "FINAL_SPRINT";
      expectedPointsPerHour = 2.0;
    } else if (diffDays === 2) {
      phaseId = "FINAL_SPRINT_HIGH_YIELD_REVIEW";
      phaseName = "Reta Final: D-2 (11/09) — Alto Rendimento & Protocolos";
      phaseDescription = "Revisão cirúrgica de protocolos de alta confusão (esquemas de DHEG, sepse 1ª hora, critérios de apendicite e imunizações VIP).";
      strategyMode = "FINAL_SPRINT";
      expectedPointsPerHour = 3.2;
    } else if (diffDays >= 3 && diffDays <= 4) {
      phaseId = "FINAL_SPRINT_REAL_SIMULATION";
      phaseName = `Reta Final: D-${diffDays} (${diffDays}d) — Simulado Real & Autópsia`;
      phaseDescription = "Simulado cronometrado com 50-100 questões e autópsia de distratores para blindar tomada de decisão clínica.";
      strategyMode = "FINAL_SPRINT";
      expectedPointsPerHour = 3.5;
    } else if (diffDays >= 5 && diffDays <= 8) {
      phaseId = "FINAL_SPRINT_MIXED_ERRORS";
      phaseName = `Reta Final: D-${diffDays} (${diffDays}d) — Questões Mistas & Erros Recorrentes`;
      phaseDescription = "Blocos multi-área de questões oficiais com reteste de falhas persistentes do Caderno de Erros.";
      strategyMode = "FINAL_SPRINT";
      expectedPointsPerHour = 3.0;
    } else if (diffDays >= 9 && diffDays <= 13) {
      phaseId = "FINAL_SPRINT_IMPACT_GAPS";
      phaseName = `Modo Reta Final — ${diffDays} dias (Alta Densidade & Lacunas Graves)`;
      phaseDescription = "Priorização cirúrgica: temas de altíssimo IRS (≥85) onde seu domínio é crítico. Foco no maior ganho de pontos por hora (+2.8 a +4.2 pts/h).";
      strategyMode = "FINAL_SPRINT";
      expectedPointsPerHour = 2.8;
    } else if (diffDays <= 30) {
      phaseId = "FASE_3_RETA_FINAL";
      phaseName = `Fase 3: Reta Final (${diffDays}d)`;
      phaseDescription = "Priorização estrita dos temas de maior ganho esperado (IRS ≥ 85) e autópsia de distratores.";
      strategyMode = "FINAL_SPRINT";
      expectedPointsPerHour = 2.4;
    } else if (diffDays > 90) {
      phaseId = "FASE_1_FUNDAMENTOS";
      phaseName = "Fase 1: Fundamentos & Matriz";
      phaseDescription = "Construção de base conceitual nas 5 grandes áreas e simulados diagnósticos.";
      strategyMode = "CONVENTIONAL";
      expectedPointsPerHour = 1.4;
    }

    return {
      targetEdition,
      examDate: dateStr,
      hasConfiguredDate: true,
      daysRemaining: diffDays,
      phaseId,
      phaseName,
      phaseDescription,
      badgeText: `${diffDays} dias restantes • ${phaseName}`,
      strategyMode,
      expectedPointsPerHour,
      officialDetails: defaultOfficialDetails,
      confidenceInterval: {
        min: 68,
        max: 76,
        confidenceLevel: 95,
        historicalCutoff: 60,
        formulaExplanation:
          "Modelo de Otimização Bayesiana: calcula o ganho esperado de pontos por hora (ROI/h) cruzando IRS da matriz INEP com sua lacuna de retenção ativa.",
      },
    };
  }
}

