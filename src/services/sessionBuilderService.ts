import {
  Question,
  QuestionAttempt,
  KnowledgeNode,
  UserProfile,
  MedicalArea,
  QuestionSessionConfig,
  ActiveTrainingSession,
  SessionSummaryReport,
  PresetFilter,
  SisterQuestionMatch,
  TrainingMode,
  ErrorTaxonomy,
} from "../types";

const ACTIVE_SESSION_STORAGE_KEY = "praxis_active_training_session_v1";

export const DEFAULT_SESSION_CONFIG: QuestionSessionConfig = {
  mode: "RAPIDO",
  title: "Treino Rápido Geral",
  objective: "TREINO_LIVRE",
  areas: ["ALL"],
  topics: [],
  competencies: [],
  years: ["ALL"],
  origin: "ALL",
  difficulty: "ALL",
  inepRelevance: "ALL",
  smartFilters: {
    onlyUnanswered: false,
    onlyWrong: false,
    onlyCorrect: false,
    onlyFlagged: false,
    onlyReincidentErrors: false,
    onlyWithUpdatedGuideline: false,
    onlyHighInepPattern: false,
    excludeMastered: false,
    onlyWithComments: false,
    onlyDiscursive: false,
  },
  quantity: 10,
  feedbackMode: "IMMEDIATE",
  timerMode: "FREE",
  showComments: true,
  ordering: "ADAPTIVE",
};

export const PRESET_TRAINING_TEMPLATES: PresetFilter[] = [
  {
    id: "preset-10-quick",
    title: "10 Questões Rápidas",
    description: "Sessão mista de alta velocidade para manter o ritmo e a consistência diária.",
    iconName: "Zap",
    badge: "12 min",
    config: {
      mode: "RAPIDO",
      title: "10 Questões Rápidas",
      objective: "TREINO_LIVRE",
      areas: ["ALL"],
      quantity: 10,
      feedbackMode: "IMMEDIATE",
      timerMode: "FREE",
      ordering: "ADAPTIVE",
    },
  },
  {
    id: "preset-20-high-yield",
    title: "20 Questões de Alto Rendimento",
    description: "Microcompetências com maior peso histórico e frequência de cobrança no Revalida INEP.",
    iconName: "Flame",
    badge: "Alta Relevância INEP",
    config: {
      mode: "ADAPTATIVO",
      title: "20 Questões de Alto Rendimento",
      objective: "TEMAS_RECORRENTES",
      areas: ["ALL"],
      inepRelevance: "MUITO_ALTA",
      quantity: 20,
      feedbackMode: "IMMEDIATE",
      timerMode: "RECOMMENDED",
      ordering: "INEP_RELEVANCE",
    },
  },
  {
    id: "preset-my-recent-errors",
    title: "Meus Erros Recentes",
    description: "Foco imediato nas questões em que você errou ou caiu em distratores nas últimas sessões.",
    iconName: "RotateCcw",
    badge: "Caderno de Erros",
    config: {
      mode: "ERROS",
      title: "Revisão dos Meus Erros",
      objective: "REVISAO_ERROS",
      areas: ["ALL"],
      smartFilters: {
        ...DEFAULT_SESSION_CONFIG.smartFilters,
        onlyWrong: true,
      },
      quantity: 15,
      feedbackMode: "IMMEDIATE",
      timerMode: "FREE",
      ordering: "WEAKEST_FIRST",
    },
  },
  {
    id: "preset-unanswered",
    title: "Questões Não Feitas",
    description: "Expanda seu repertório resolvendo itens que você ainda não experimentou.",
    iconName: "Sparkles",
    badge: "Novas Questões",
    config: {
      mode: "RAPIDO",
      title: "Itens Inéditos no Seu Histórico",
      objective: "TREINO_LIVRE",
      areas: ["ALL"],
      smartFilters: {
        ...DEFAULT_SESSION_CONFIG.smartFilters,
        onlyUnanswered: true,
      },
      quantity: 15,
      feedbackMode: "IMMEDIATE",
      timerMode: "FREE",
      ordering: "NEWEST",
    },
  },
  {
    id: "preset-guideline-updates",
    title: "Diretrizes Atualizadas 2026",
    description: "Questões que sofreram atualização de conduta médica (MS, SBC, FEBRASGO, SBP).",
    iconName: "ShieldAlert",
    badge: "Vigilância Clínica",
    config: {
      mode: "PERSONALIZADO",
      title: "Diretrizes Atualizadas (2026-Ready)",
      objective: "TREINO_LIVRE",
      areas: ["ALL"],
      smartFilters: {
        ...DEFAULT_SESSION_CONFIG.smartFilters,
        onlyWithUpdatedGuideline: true,
      },
      quantity: 10,
      feedbackMode: "IMMEDIATE",
      timerMode: "FREE",
      ordering: "NEWEST",
    },
  },
  {
    id: "preset-simulated-exam",
    title: "Simulado Padrão INEP",
    description: "Ambiente estrito de prova com cronômetro real e gabarito liberado apenas ao final.",
    iconName: "ShieldCheck",
    badge: "Modo Prova",
    config: {
      mode: "SIMULADO",
      title: "Simulado Padrão Revalida INEP",
      objective: "OFICIAIS",
      areas: ["ALL"],
      quantity: 25,
      feedbackMode: "END_OF_SESSION",
      timerMode: "EXAM_STRICT",
      showComments: false,
      ordering: "RANDOM",
    },
  },
];

export class SessionBuilderService {
  /**
   * Filter questions based on configuration without slicing
   */
  static filterQuestions(
    config: QuestionSessionConfig,
    allQuestions: Question[],
    attempts: QuestionAttempt[],
    knowledgeGraph: KnowledgeNode[]
  ): Question[] {
    const attemptedQuestionIds = new Set(attempts.map((a) => a.questionId));
    
    // Map questionId -> last attempt
    const lastAttemptMap = new Map<string, QuestionAttempt>();
    const wrongCountMap = new Map<string, number>();

    // Process attempts in chronological order
    const sortedAttempts = [...attempts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const att of sortedAttempts) {
      lastAttemptMap.set(att.questionId, att);
      if (!att.isCorrect) {
        wrongCountMap.set(att.questionId, (wrongCountMap.get(att.questionId) || 0) + 1);
      }
    }

    // Map area/topic mastery
    const topicMasteryMap = new Map<string, number>();
    for (const node of knowledgeGraph) {
      topicMasteryMap.set(node.name.toLowerCase(), node.userMastery);
    }

    return allQuestions.filter((q) => {
      // 1. Specific Exam Edition Filter
      if (config.examEditionId && config.examEditionId !== "ALL") {
        const queryLower = config.examEditionId.toLowerCase().trim();
        const parsedYear = parseInt(config.examEditionId);
        const matchesExam =
          (q.examEdition && q.examEdition.toLowerCase().includes(queryLower)) ||
          (q.code && q.code.toLowerCase().includes(queryLower)) ||
          (q.originalBooklet && q.originalBooklet.toLowerCase().includes(queryLower)) ||
          (parsedYear && q.examYear === parsedYear);
        if (!matchesExam) return false;
      }

      // 2. Area Filter: allow ALL if includes "ALL" or empty
      if (config.areas && config.areas.length > 0 && !config.areas.includes("ALL")) {
        if (!config.areas.includes(q.area)) return false;
      }

      // 3. Topics Filter: match topic, subtopic, tags, specialty or clinicalCase (supports comma-separated queries)
      if (config.topics && config.topics.length > 0) {
        const matchesTopic = config.topics.some((t) => {
          const rawTerms = t.split(/[,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
          if (rawTerms.length === 0) return true;
          return rawTerms.some((term) =>
            q.topic?.toLowerCase().includes(term) ||
            q.subtopic?.toLowerCase().includes(term) ||
            q.specialty?.toLowerCase().includes(term) ||
            q.clinicalCase?.toLowerCase().includes(term) ||
            (q.tags && q.tags.some((tag) => tag.toLowerCase().includes(term) || term.includes(tag.toLowerCase())))
          );
        });
        if (!matchesTopic) return false;
      }

      // 4. Competencies Filter
      if (config.competencies && config.competencies.length > 0) {
        const matchesComp = config.competencies.some(
          (c) =>
            q.reasoningType === c ||
            q.competencyId?.toLowerCase().includes(c.toLowerCase()) ||
            q.competencyDescription?.toLowerCase().includes(c.toLowerCase())
        );
        if (!matchesComp) return false;
      }

      // 5. Origin Filter
      if (config.origin === "INEP_OFICIAL" && q.origin !== "INEP_OFICIAL") return false;
      if (
        config.origin === "INEDITAS" &&
        q.origin !== "PLATFORM_ORIGINAL" &&
        q.origin !== "INEDITA_PRAXIS" &&
        !q.is2026Ready
      ) {
        return false;
      }

      // 6. Year Filter
      if (config.years && config.years.length > 0 && !config.years.includes("ALL")) {
        if (!q.examYear || !config.years.includes(q.examYear)) return false;
      }

      // 7. Difficulty Filter
      if (config.difficulty && config.difficulty !== "ALL" && q.difficulty !== config.difficulty) return false;

      // 8. INEP Relevance Filter
      if (config.inepRelevance && config.inepRelevance !== "ALL") {
        const score = q.inepPatternScore || (q.stats ? q.stats.totalAttempts : 50);
        if (config.inepRelevance === "MUITO_ALTA" && score < 85) return false;
        if (config.inepRelevance === "ALTA" && score < 70) return false;
        if (config.inepRelevance === "MODERADA" && score < 50) return false;
      }

      // 9. Smart Filters
      const lastAttempt = lastAttemptMap.get(q.id);
      const isAnswered = attemptedQuestionIds.has(q.id);
      const wrongCount = wrongCountMap.get(q.id) || 0;

      if (config.smartFilters?.onlyUnanswered && isAnswered) return false;
      if (config.smartFilters?.onlyWrong && (!lastAttempt || lastAttempt.isCorrect)) return false;
      if (config.smartFilters?.onlyCorrect && (!lastAttempt || !lastAttempt.isCorrect)) return false;
      if (config.smartFilters?.onlyReincidentErrors && wrongCount < 2) return false;
      if (config.smartFilters?.onlyWithUpdatedGuideline) {
        const hasGuideline = Boolean(
          q.guidelineUpdate ||
          q.tags?.some((t) => t.toLowerCase().includes("2026") || t.toLowerCase().includes("2025") || t.toLowerCase().includes("pcdt"))
        );
        if (!hasGuideline) return false;
      }
      if (config.smartFilters?.onlyHighInepPattern && (q.inepPatternScore || 0) < 85) return false;
      if (config.smartFilters?.excludeMastered) {
        const mastery = topicMasteryMap.get(q.topic?.toLowerCase()) || 50;
        if (mastery >= 85 && lastAttempt?.isCorrect) return false;
      }

      // Filter: Apenas questões com comentários
      if (config.smartFilters?.onlyWithComments) {
        const hasComments =
          (q.options && q.options.some((o) => o.explanation && o.explanation.trim().length > 0)) ||
          Boolean(q.keyFinding || q.expectedConduct || q.inepIntent);
        if (!hasComments) return false;
      }

      // Filter: Apenas questões discursivas
      if (config.smartFilters?.onlyDiscursive) {
        if (q.stage !== "TEORICA_DISCURSIVA") return false;
      }

      // Sister topic target
      if (config.sisterTopicTarget && q.topic !== config.sisterTopicTarget) {
        return false;
      }

      return true;
    });
  }

  /**
   * Filter and Rank Questions for a Session
   */
  static buildQuestionSession(
    config: QuestionSessionConfig,
    allQuestions: Question[],
    attempts: QuestionAttempt[],
    knowledgeGraph: KnowledgeNode[]
  ): Question[] {
    let filtered = this.filterQuestions(config, allQuestions, attempts, knowledgeGraph);

    // If no questions matched strict filters and not strictly an error-only review, fallback to broader selection
    if (filtered.length === 0 && !config.smartFilters?.onlyWrong && !config.smartFilters?.onlyReincidentErrors) {
      filtered = allQuestions;
    }

    if (filtered.length === 0) {
      return [];
    }

    // Map questionId -> last attempt
    const lastAttemptMap = new Map<string, QuestionAttempt>();
    for (const att of attempts) {
      lastAttemptMap.set(att.questionId, att);
    }

    // Map topic mastery
    const topicMasteryMap = new Map<string, number>();
    for (const node of knowledgeGraph) {
      topicMasteryMap.set(node.name.toLowerCase(), node.userMastery);
    }

    // 10. Scoring and Ordering
    const scoredQuestions = filtered.map((q) => {
      let priorityScore = 50;
      const lastAttempt = lastAttemptMap.get(q.id);
      const mastery = topicMasteryMap.get(q.topic?.toLowerCase()) || 60;
      const inepScore = q.inepPatternScore || (q.origin === "INEP_OFICIAL" ? 90 : 80);

      // PPS: Personal Priority Score
      // If user failed recently, priority increases significantly
      if (lastAttempt && !lastAttempt.isCorrect) {
        priorityScore += 40;
      } else if (!lastAttempt) {
        priorityScore += 20; // Unanswered
      } else if (lastAttempt.confidence === "LOW") {
        priorityScore += 25; // Low confidence
      }

      // Lower mastery in topic increases priority
      priorityScore += Math.max(0, (100 - mastery) * 0.3);

      // INEP Pattern Score bonus
      priorityScore += (inepScore / 100) * 20;

      return { question: q, priorityScore };
    });

    // Apply Sorting Strategy
    if (config.ordering === "ADAPTIVE") {
      scoredQuestions.sort((a, b) => b.priorityScore - a.priorityScore);
    } else if (config.ordering === "INEP_RELEVANCE") {
      scoredQuestions.sort(
        (a, b) => (b.question.inepPatternScore || 80) - (a.question.inepPatternScore || 80)
      );
    } else if (config.ordering === "NEWEST") {
      scoredQuestions.sort((a, b) => (b.question.examYear || 2024) - (a.question.examYear || 2024));
    } else if (config.ordering === "OLDEST") {
      scoredQuestions.sort((a, b) => (a.question.examYear || 2021) - (b.question.examYear || 2021));
    } else if (config.ordering === "DIFFICULTY_DESC") {
      const diffWeight = { DIFICIL: 3, MEDIO: 2, FACIL: 1 };
      scoredQuestions.sort(
        (a, b) => (diffWeight[b.question.difficulty] || 2) - (diffWeight[a.question.difficulty] || 2)
      );
    } else if (config.ordering === "RANDOM") {
      scoredQuestions.sort(() => Math.random() - 0.5);
    }

    const selectedQuestions = scoredQuestions.slice(0, config.quantity).map((sq) => sq.question);
    return selectedQuestions;
  }

  /**
   * Find Sister Questions (questões com mesmo padrão clínico, tema ou distrator)
   */
  static getSisterQuestions(
    targetQuestion: Question,
    allQuestions: Question[]
  ): SisterQuestionMatch[] {
    return allQuestions
      .filter((q) => q.id !== targetQuestion.id)
      .map((q) => {
        let score = 0;
        let relationshipType: SisterQuestionMatch["relationshipType"] = "PARALLEL_CASE";

        if (q.competencyId && q.competencyId === targetQuestion.competencyId) {
          score += 50;
          relationshipType = "SAME_COMPETENCY";
        }
        if (q.topic === targetQuestion.topic) {
          score += 35;
        }
        if (q.area === targetQuestion.area) {
          score += 15;
        }
        if (q.reasoningType === targetQuestion.reasoningType) {
          score += 15;
          if (relationshipType !== "SAME_COMPETENCY") {
            relationshipType = "SAME_CLINICAL_TRAP";
          }
        }
        if (q.guidelineUpdate && targetQuestion.guidelineUpdate) {
          score += 20;
          relationshipType = "SAME_GUIDELINE";
        }

        return {
          question: q,
          similarityScore: Math.min(100, score),
          sharedCompetency: q.competencyDescription || q.topic,
          relationshipType,
        };
      })
      .filter((item) => item.similarityScore >= 50)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 4);
  }

  /**
   * Builds the 1-Click "Recomendado para Você" Session
   */
  static buildRecommendedSession(
    user: UserProfile,
    knowledgeGraph: KnowledgeNode[],
    attempts: QuestionAttempt[],
    allQuestions: Question[]
  ): {
    title: string;
    subtitle: string;
    targetAreas: MedicalArea[];
    questionCount: number;
    estimatedMinutes: number;
    rationale: string;
    config: QuestionSessionConfig;
  } {
    // Find weakest area or lowest mastery nodes
    const validGraph = Array.isArray(knowledgeGraph) ? [...knowledgeGraph].filter(Boolean) : [];
    const weakestNodes = validGraph.sort((a, b) => (a?.userMastery ?? 0) - (b?.userMastery ?? 0));
    const primaryWeakNode = (weakestNodes && weakestNodes.length > 0 ? weakestNodes[0] : null) || { area: "GINECOLOGIA_OBSTETRICIA" as MedicalArea, name: "Pré-Eclâmpsia e Hipertensão Gestacional" };
    const secondaryWeakNode = (weakestNodes && weakestNodes.length > 1 ? weakestNodes[1] : null) || { area: "MEDICINA_FAMILIA_COMUNIDADE" as MedicalArea, name: "Vigilância e Notificação SINAN" };

    const targetAreas: MedicalArea[] = [
      primaryWeakNode?.area || ("GINECOLOGIA_OBSTETRICIA" as MedicalArea),
      secondaryWeakNode?.area || ("MEDICINA_FAMILIA_COMUNIDADE" as MedicalArea),
    ];
    const questionCount = 20;
    const estimatedMinutes = 28;

    const primaryName = primaryWeakNode?.name || "Pré-Eclâmpsia";
    const secondaryName = secondaryWeakNode?.name || "Vigilância";

    const config: QuestionSessionConfig = {
      mode: "ADAPTATIVO",
      title: `Treino Adaptativo de Alta Prioridade: ${primaryName}`,
      objective: "TEMAS_RECORRENTES",
      areas: targetAreas,
      topics: [primaryName, secondaryName],
      competencies: [],
      years: ["ALL"],
      origin: "ALL",
      difficulty: "ALL",
      inepRelevance: "MUITO_ALTA",
      smartFilters: {
        ...DEFAULT_SESSION_CONFIG.smartFilters,
        excludeMastered: true,
      },
      quantity: questionCount,
      feedbackMode: "IMMEDIATE",
      timerMode: "RECOMMENDED",
      showComments: true,
      ordering: "ADAPTIVE",
    };

    const primaryShortName = (primaryName || "").split(" ")[0] || "Pré-Eclâmpsia";
    const secondaryShortName = (secondaryName || "").split(" ")[0] || "Vigilância";

    return {
      title: `Treino de ${questionCount} Questões: ${primaryShortName} + ${secondaryShortName}`,
      subtitle: "Baseado nos seus erros recentes e na matriz de incidência do Revalida INEP",
      targetAreas,
      questionCount,
      estimatedMinutes,
      rationale: `O algoritmo identificou uma oportunidade de ganho de até +6.5 pontos ao consolidar ${primaryName} (${primaryWeakNode?.area || "GINECOLOGIA_OBSTETRICIA"}) e ${secondaryName}.`,
      config,
    };
  }

  /**
   * Calculate Estimated Minutes
   */
  static calculateEstimatedMinutes(questionCount: number, avgSecondsPerQuestion = 85): number {
    return Math.max(1, Math.round((questionCount * avgSecondsPerQuestion) / 60));
  }

  /**
   * Active Session Persistence & Autosave
   */
  static getActiveSession(): ActiveTrainingSession | null {
    try {
      const data = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (!data) return null;
      const parsed: ActiveTrainingSession = JSON.parse(data);
      if (parsed.isCompleted) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  static saveActiveSession(session: ActiveTrainingSession): void {
    try {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.error("Failed to autosave active session", e);
    }
  }

  static clearActiveSession(): void {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  }

  /**
   * Compute Summary Report at the End of Session
   */
  static generateSummaryReport(
    session: ActiveTrainingSession,
    allQuestions: Question[]
  ): SessionSummaryReport {
    const questionMap = new Map((allQuestions || []).map((q) => [q.id, q]));
    const totalQuestions = session.questionIds?.length || 0;
    const answersList = Object.values(session.answers || {}).filter(Boolean);
    const answeredCount = answersList.length;
    const correctCount = answersList.filter((a) => a?.isCorrect).length;
    const wrongCount = answersList.filter((a) => !a?.isCorrect).length;
    const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    const totalTimeSeconds = session.totalDurationSeconds || answersList.reduce((acc, a) => acc + (a?.timeSpentSeconds || 0), 0);
    const avgTimePerQuestion = answeredCount > 0 ? Math.round(totalTimeSeconds / answeredCount) : 0;

    // Breakdown by Area
    const areaPerformance: Record<MedicalArea, { total: number; correct: number; percentage: number }> = {
      CLINICA_MEDICA: { total: 0, correct: 0, percentage: 0 },
      CIRURGIA_GERAL: { total: 0, correct: 0, percentage: 0 },
      GINECOLOGIA_OBSTETRICIA: { total: 0, correct: 0, percentage: 0 },
      PEDIATRIA: { total: 0, correct: 0, percentage: 0 },
      MEDICINA_FAMILIA_COMUNIDADE: { total: 0, correct: 0, percentage: 0 },
    };

    // Competency breakdown
    const competencyPerformance: Record<string, { total: number; correct: number; percentage: number }> = {};

    // Taxonomy breakdown
    const errorTaxonomyBreakdown: Record<ErrorTaxonomy, number> = {
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

    const wrongQuestionIds: string[] = [];

    for (const qId of (session.questionIds || [])) {
      const q = questionMap.get(qId);
      const ans = session.answers ? session.answers[qId] : undefined;
      if (!q) continue;

      if (q.area && areaPerformance[q.area]) {
        areaPerformance[q.area].total += 1;
      }
      const compKey = q.reasoningType || "CONDUTA";
      if (!competencyPerformance[compKey]) {
        competencyPerformance[compKey] = { total: 0, correct: 0, percentage: 0 };
      }
      competencyPerformance[compKey].total += 1;

      if (ans) {
        if (ans.isCorrect) {
          if (q.area && areaPerformance[q.area]) {
            areaPerformance[q.area].correct += 1;
          }
          competencyPerformance[compKey].correct += 1;
        } else {
          wrongQuestionIds.push(q.id);
          const reason = ans.errorReason || "KNOWLEDGE_GAP";
          if (errorTaxonomyBreakdown[reason] !== undefined) {
            errorTaxonomyBreakdown[reason] = (errorTaxonomyBreakdown[reason] || 0) + 1;
          }
        }
      }
    }

    // Compute percentages
    for (const area of Object.keys(areaPerformance) as MedicalArea[]) {
      const data = areaPerformance[area];
      data.percentage = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    }
    for (const comp of Object.keys(competencyPerformance)) {
      const data = competencyPerformance[comp];
      data.percentage = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    }

    // Recommended Next Action
    let recommendedNextAction: SessionSummaryReport["recommendedNextAction"] = {
      title: "Consolidar Erros Desta Sessão",
      description: `Refaça os ${wrongCount} itens que você errou para fixar os pontos-chave de conduta e diretrizes do SUS.`,
      actionType: "RETRY_ERRORS",
      questionIds: wrongQuestionIds,
    };

    if (wrongCount === 0) {
      recommendedNextAction = {
        title: "Avançar para Simulado Cronometrado",
        description: "Excelente desempenho! Suba o nível de desafio com 25 questões sob pressão de tempo.",
        actionType: "NEW_ADAPTIVE",
      };
    } else if (errorTaxonomyBreakdown.DISTRACTOR_TRAP > 1) {
      recommendedNextAction = {
        title: "Treinar Questões Irmãs (Antídoto de Distratores)",
        description: "Você caiu em pegadinhas conceituais da banca. Treine casos clínicos paralelos para neutralizar o viés.",
        actionType: "SISTER_QUESTIONS",
        questionIds: wrongQuestionIds,
      };
    }

    return {
      sessionId: session.id,
      title: session.title,
      mode: session.mode,
      totalQuestions,
      answeredCount,
      correctCount,
      wrongCount,
      scorePercentage,
      totalTimeSeconds,
      avgTimePerQuestion,
      areaPerformance,
      competencyPerformance,
      errorTaxonomyBreakdown,
      recommendedNextAction,
    };
  }
}
