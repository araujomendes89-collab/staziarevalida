import {
  MedicalArea,
  QuestionAttempt,
  KnowledgeNode,
  StudyMission,
  ErrorTaxonomy,
} from "../types";

export interface TimeMapMetric {
  category: "FAST_CORRECT" | "FAST_WRONG" | "SLOW_CORRECT" | "SLOW_WRONG";
  area: MedicalArea;
  topic: string;
  avgTimeSeconds: number;
  insight: string;
}

export interface MetacognitiveMatrix {
  masteredConfident: number; // Alto conhecimento + Alta confiança (Consolidado)
  fragileInsecure: number;   // Alto conhecimento + Baixa confiança (Precisa consolidar segurança)
  dangerousBlindspot: number; // Baixo conhecimento + Alta confiança (ZONA DE PERIGO)
  knownGap: number;          // Baixo conhecimento + Baixa confiança (Gaps declarados)
}

export class AdaptiveEngine {
  /**
   * Computes the overall Pass Score (Prontidão do Aluno)
   */
  static calculateReadiness(nodes: KnowledgeNode[], attempts?: QuestionAttempt[]): {
    score: number;
    trend: number; // ex: +4.8%
    projectedMin: number;
    projectedMax: number;
    areaBreakdown: Record<MedicalArea, number>;
    criticalGaps: string[];
  } {
    const validNodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
    const totalAttemptsCount = attempts?.length ?? 0;

    if (validNodes.length === 0 || totalAttemptsCount === 0) {
      return {
        score: 0,
        trend: 0,
        projectedMin: 0,
        projectedMax: 0,
        areaBreakdown: {
          CLINICA_MEDICA: 0,
          CIRURGIA_GERAL: 0,
          GINECOLOGIA_OBSTETRICIA: 0,
          PEDIATRIA: 0,
          MEDICINA_FAMILIA_COMUNIDADE: 0,
        },
        criticalGaps: ["Pré-Eclâmpsia e Eclâmpsia", "Vigilância e Notificação SINAN", "Imunização PNI"],
      };
    }

    const areaScores: Record<MedicalArea, { total: number; count: number }> = {
      CLINICA_MEDICA: { total: 0, count: 0 },
      CIRURGIA_GERAL: { total: 0, count: 0 },
      GINECOLOGIA_OBSTETRICIA: { total: 0, count: 0 },
      PEDIATRIA: { total: 0, count: 0 },
      MEDICINA_FAMILIA_COMUNIDADE: { total: 0, count: 0 },
    };

    let weightedSum = 0;
    let weightTotal = 0;

    for (const node of validNodes) {
      const weight = node.incidenceWeight || 3;
      weightedSum += (node.userMastery ?? 0) * weight;
      weightTotal += weight;

      if (node.area && areaScores[node.area]) {
        areaScores[node.area].total += (node.userMastery ?? 0);
        areaScores[node.area].count += 1;
      }
    }

    const overallScore = Math.round(weightTotal > 0 ? weightedSum / weightTotal : 0);

    const areaBreakdown: Record<MedicalArea, number> = {
      CLINICA_MEDICA: Math.round(areaScores.CLINICA_MEDICA.total / (areaScores.CLINICA_MEDICA.count || 1)),
      CIRURGIA_GERAL: Math.round(areaScores.CIRURGIA_GERAL.total / (areaScores.CIRURGIA_GERAL.count || 1)),
      GINECOLOGIA_OBSTETRICIA: Math.round(areaScores.GINECOLOGIA_OBSTETRICIA.total / (areaScores.GINECOLOGIA_OBSTETRICIA.count || 1)),
      PEDIATRIA: Math.round(areaScores.PEDIATRIA.total / (areaScores.PEDIATRIA.count || 1)),
      MEDICINA_FAMILIA_COMUNIDADE: Math.round(areaScores.MEDICINA_FAMILIA_COMUNIDADE.total / (areaScores.MEDICINA_FAMILIA_COMUNIDADE.count || 1)),
    };

    // Calculate critical gaps based on highest expected point gain and low mastery
    const sortedGaps = [...validNodes]
      .filter((n) => (n.userMastery ?? 0) < 65)
      .sort((a, b) => (b.expectedPointGain ?? 0) - (a.expectedPointGain ?? 0))
      .slice(0, 3)
      .map((n) => n.name);

    // Calculate trend from recent attempts if available
    const recentCorrect = (attempts || []).slice(0, 20).filter((a) => a.isCorrect).length;
    const calculatedTrend = attempts && attempts.length > 5
      ? Number(((recentCorrect / Math.min(20, attempts.length)) * 10).toFixed(1))
      : 0;

    return {
      score: overallScore,
      trend: calculatedTrend,
      projectedMin: overallScore > 0 ? Math.max(30, overallScore - 6) : 0,
      projectedMax: overallScore > 0 ? Math.min(100, overallScore + 5) : 0,
      areaBreakdown,
      criticalGaps: sortedGaps.length ? sortedGaps : ["Pré-Eclâmpsia e Eclâmpsia", "Vigilância Epidemiológica", "Imunização PNI"],
    };
  }

  /**
   * Generates dynamic study session based on user's available time ("Estude Para Mim")
   * Prioritizes topics strictly by expected point gain per hour (ROI/hour) in the Final Sprint
   */
  static generateQuickSession(
    minutes: 15 | 30 | 60 | 120,
    nodes: KnowledgeNode[]
  ): StudyMission {
    // Rank topics by expected point gain (PPS / ROI per hour)
    const sortedNodes = Array.isArray(nodes) && nodes.length > 0
      ? [...nodes].sort((a, b) => (b?.expectedPointGain ?? 0) - (a?.expectedPointGain ?? 0))
      : [];
    const topNode = sortedNodes[0] || {
      id: "fallback-node",
      name: "Pré-Eclâmpsia e Hipertensão Gestacional",
      area: "GINECOLOGIA_OBSTETRICIA" as MedicalArea,
      expectedPointGain: 4.2,
      userMastery: 50,
      inepWeightPercent: 4.8,
      subtopics: ["Sulfato de Magnésio"],
    };
    const hours = minutes / 60;
    const gainInSession = Number(((topNode.expectedPointGain * (minutes / 120))).toFixed(1));
    const roiPerHour = (gainInSession / hours).toFixed(1);

    if (minutes === 15) {
      return {
        id: `session-15-${Date.now()}`,
        title: `Sprint de Alta Densidade: ${topNode.name}`,
        estimatedMinutes: 15,
        targetArea: topNode.area,
        focusTopic: topNode.name,
        rationale: `Reta Final (15 min): foco na lacuna crítica de maior retorno (+${gainInSession} pts esperados • taxa de +${roiPerHour} pts/h).`,
        tasks: [
          {
            type: "REVIEW",
            description: "Recuperação Ativa Express (Gatilhos e Doses-chave)",
            minutes: 5,
            completed: false,
          },
          {
            type: "QUESTIONS",
            description: "4 Questões Oficiais Críticas",
            count: 4,
            minutes: 8,
            completed: false,
          },
          {
            type: "ERROR_AUTOPSY",
            description: "Autópsia Rápida de Erro",
            minutes: 2,
            completed: false,
          },
        ],
      };
    }

    if (minutes === 30) {
      return {
        id: `session-30-${Date.now()}`,
        title: `Bloco Rápido de Alto Impacto: ${topNode.name}`,
        estimatedMinutes: 30,
        targetArea: topNode.area,
        focusTopic: topNode.name,
        rationale: `Reta Final (30 min): atacar ${topNode.name} gera o maior ganho esperado (+${gainInSession} pts esperados • +${roiPerHour} pts/h).`,
        tasks: [
          {
            type: "REVIEW",
            description: "Revisão Ativa: Protocolo e Conduta Ouro",
            minutes: 5,
            completed: false,
          },
          {
            type: "QUESTIONS",
            description: "8 Questões Selecionadas por IRS com cronômetro",
            count: 8,
            minutes: 15,
            completed: false,
          },
          {
            type: "ERROR_AUTOPSY",
            description: "Autópsia comentada dos distratores",
            minutes: 8,
            completed: false,
          },
          {
            type: "FLASHCARDS",
            description: "Recuperação final e flashcards de alta voltagem",
            count: 4,
            minutes: 2,
            completed: false,
          },
        ],
      };
    }

    if (minutes === 60) {
      return {
        id: `session-60-${Date.now()}`,
        title: `Ciclo 20-60-20: ${topNode.name}`,
        estimatedMinutes: 60,
        targetArea: topNode.area,
        focusTopic: topNode.name,
        rationale: `Reta Final (1h): ciclo balanceado com questões, autópsia socrática e consolidação (+${gainInSession} pts • +${roiPerHour} pts/h).`,
        tasks: [
          {
            type: "REVIEW",
            description: "Revisão Espaçada e Síntese de Diretrizes Vigentes",
            minutes: 10,
            completed: false,
          },
          {
            type: "REVIEW",
            description: "Microestudo Direcionado do Conceito Crítico",
            minutes: 15,
            completed: false,
          },
          {
            type: "QUESTIONS",
            description: "14 Questões Oficiais do Revalida INEP",
            count: 14,
            minutes: 22,
            completed: false,
          },
          {
            type: "ERROR_AUTOPSY",
            description: "Autópsia aprofundada dos erros e armadilhas",
            minutes: 10,
            completed: false,
          },
          {
            type: "FLASHCARDS",
            description: "Reteste programado e mnemônicos",
            count: 6,
            minutes: 3,
            completed: false,
          },
        ],
      };
    }

    // 120 min (Sessão Completa Recomendada 20-60-20)
    return {
      id: `session-120-${Date.now()}`,
      title: `Sessão Completa de Aprovação: ${topNode.name}`,
      estimatedMinutes: 120,
      targetArea: topNode.area,
      focusTopic: topNode.name,
      rationale: `Reta Final (2h): sessão de máxima performance. Combina revisão espaçada (20%), questões oficiais + irmãs (60%) e autópsia de distratores (20%). Ganho estimado: +${topNode.expectedPointGain.toFixed(1)} pontos (+${(topNode.expectedPointGain / 2).toFixed(1)} pts/h).`,
      tasks: [
        {
          type: "REVIEW",
          description: "Revisão Ativa Espaçada (Flashcards de Alta Voltagem)",
          minutes: 15,
          completed: false,
        },
        {
          type: "REVIEW",
          description: "Estudo Direcionado: Critérios e Protocolo Vigente no SUS",
          minutes: 25,
          completed: false,
        },
        {
          type: "QUESTIONS",
          description: "16 Questões Oficiais INEP + Questões Irmãs Selecionadas",
          count: 16,
          minutes: 45,
          completed: false,
        },
        {
          type: "ERROR_AUTOPSY",
          description: "Autópsia Profunda de Erros e Mapeamento de Distratores",
          minutes: 25,
          completed: false,
        },
        {
          type: "FLASHCARDS",
          description: "Consolidação e Registro para Reteste em D+3",
          count: 8,
          minutes: 10,
          completed: false,
        },
      ],
    };
  }

  /**
   * Evaluates Metacognitive Confidence Matrix
   */
  static analyzeMetacognition(attempts: QuestionAttempt[]): MetacognitiveMatrix {
    let masteredConfident = 0;
    let fragileInsecure = 0;
    let dangerousBlindspot = 0;
    let knownGap = 0;

    for (const a of attempts) {
      if (a.isCorrect && (a.confidence === "HIGH" || a.confidence === "MEDIUM")) {
        masteredConfident++;
      } else if (a.isCorrect && a.confidence === "LOW") {
        fragileInsecure++;
      } else if (!a.isCorrect && a.confidence === "HIGH") {
        dangerousBlindspot++;
      } else {
        knownGap++;
      }
    }

    return {
      masteredConfident,
      fragileInsecure,
      dangerousBlindspot,
      knownGap,
    };
  }

  /**
   * Categorizes errors into Automatic Error Notebook categories
   */
  static categorizeErrors(attempts: QuestionAttempt[]): {
    persistentErrors: QuestionAttempt[];
    resolvedErrors: QuestionAttempt[];
    returnedErrors: QuestionAttempt[];
    newErrors: QuestionAttempt[];
    byTaxonomy: Record<ErrorTaxonomy, number>;
  } {
    const wrongAttempts = attempts.filter((a) => !a.isCorrect);

    const byTaxonomy: Record<ErrorTaxonomy, number> = {
      KNOWLEDGE_GAP: 0,
      DISTRACTOR_TRAP: 0,
      DIAGNOSIS_VS_CONDUCT: 0,
      READING_HASTE: 0,
      PROTOCOL_CONFUSION: 0,
      ELIMINATED_RIGHT_ANSWER: 0,
      TIME_PRESSURE: 0,
      OUTDATED_GUIDELINE: 0,
      GUESS: 0,
    };

    for (const a of wrongAttempts) {
      const reason = a.errorReason || "KNOWLEDGE_GAP";
      byTaxonomy[reason] = (byTaxonomy[reason] || 0) + 1;
    }

    // Partition attempts
    const newErrors = wrongAttempts.slice(0, 5);
    const persistentErrors = wrongAttempts.filter(
      (a) => a.errorReason === "DISTRACTOR_TRAP" || a.errorReason === "PROTOCOL_CONFUSION"
    );
    const returnedErrors = wrongAttempts.filter(
      (a) => a.errorReason === "ELIMINATED_RIGHT_ANSWER"
    );
    const resolvedErrors: QuestionAttempt[] = []; // In a real db, tracked across successive attempts

    return {
      persistentErrors,
      resolvedErrors,
      returnedErrors,
      newErrors,
      byTaxonomy,
    };
  }
}
