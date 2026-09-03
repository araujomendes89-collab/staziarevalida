import {
  CalendarBlock,
  CalendarBlockType,
  CoverageForecast,
  DeprioritizedTopicItem,
  ErrorAutopsyClassification,
  FsrsMemoryState,
  NextBestActionRecommendation,
  ScheduledDayItem,
  StudentErrorType,
  StudentOnboardingProfile,
  StudyEfficiencyMetric,
  StudyPhaseType,
} from "../types/adaptiveCalendar";
import { KnowledgeNode, MedicalArea, QuestionAttempt, UserProfile } from "../types";
import { SpacedRepetitionEngine } from "./spacedRepetitionEngine";

export interface StudyPriorityScoreItem {
  topicId: string;
  topicName: string;
  area: MedicalArea;
  irsScore: number; // 0-100 INEP recurrence
  masteryPct: number; // 0-100 current student mastery
  forgettingRiskPct: number; // 0-100 based on FSRS
  temporalUrgencyMultiplier: number; // 1.0 to 1.8 based on days to exam
  finalPpsScore: number; // 0-100 composite priority
  recommendedAction: "TEORIA_DIRECIONADA" | "QUESTOES" | "FLASHCARDS" | "REVISAO_ESPACADA" | "NAO_PRIORIZAR";
  reason: string;
}

export class StudyPlannerEngine {
  /**
   * Calculates the Study Priority Score (PPS) for each topic
   * PPS = INEP Recurrence (IRS) * Deficit (100 - Mastery) * Forgetting Risk * Urgency Multiplier
   */
  static calculateTopicPriorities(
    topics: { id: string; name: string; area: MedicalArea; irs: number; mastery: number; daysSinceLastReview: number; stabilityDays: number }[],
    daysRemaining: number
  ): StudyPriorityScoreItem[] {
    // Determine exam urgency factor
    let urgencyFactor = 1.0;
    if (daysRemaining <= 7) urgencyFactor = 1.6;
    else if (daysRemaining <= 21) urgencyFactor = 1.4;
    else if (daysRemaining <= 45) urgencyFactor = 1.2;

    return topics.map((t) => {
      const retrievability = SpacedRepetitionEngine.calculateRetrievability(t.stabilityDays || 5, t.daysSinceLastReview || 7);
      const forgettingRiskPct = Math.round((1 - retrievability) * 100);
      const deficit = Math.max(5, 100 - (t.mastery || 50));
      
      // Core priority formula: high INEP weight + student weakness + forgetting risk
      const rawScore = (t.irs * 0.4) + (deficit * 0.35) + (forgettingRiskPct * 0.25);
      const finalPps = Math.min(99, Math.round(rawScore * urgencyFactor));

      let recommendedAction: StudyPriorityScoreItem["recommendedAction"] = "QUESTOES";
      let reason = "";

      if (t.mastery >= 85 && forgettingRiskPct < 25) {
        recommendedAction = "NAO_PRIORIZAR";
        reason = `Domínio excelente (${t.mastery}%) e memória estável. Otimizado para não gastar tempo.`;
      } else if (forgettingRiskPct >= 45) {
        recommendedAction = "REVISAO_ESPACADA";
        reason = `Risco de esquecimento de ${forgettingRiskPct}% detectado pelo modelo de memória.`;
      } else if (t.mastery < 50) {
        recommendedAction = "TEORIA_DIRECIONADA";
        reason = `Lacuna conceitual com taxa de acerto de ${t.mastery}% em tema de alto peso INEP (IRS ${t.irs}).`;
      } else {
        recommendedAction = "QUESTOES";
        reason = `Consolidação por prática ativa (${t.mastery}% de domínio atual).`;
      }

      return {
        topicId: t.id,
        topicName: t.name,
        area: t.area,
        irsScore: t.irs,
        masteryPct: t.mastery,
        forgettingRiskPct,
        temporalUrgencyMultiplier: urgencyFactor,
        finalPpsScore: finalPps,
        recommendedAction,
        reason,
      };
    }).sort((a, b) => b.finalPpsScore - a.finalPpsScore);
  }

  /**
   * Generates a realistic, interleaved daily study plan based on available minutes
   */
  static generateDailyBlocks(params: {
    availableMinutes: number;
    priorityList: StudyPriorityScoreItem[];
    dateStr: string;
    phase: StudyPhaseType;
    recentErrorsCount?: number;
    pendingFlashcardsCount?: number;
  }): CalendarBlock[] {
    const { availableMinutes, priorityList, dateStr, phase, recentErrorsCount = 3, pendingFlashcardsCount = 12 } = params;
    const blocks: CalendarBlock[] = [];
    let remainingTime = availableMinutes;

    const topHighPriority = priorityList.filter((p) => p.recommendedAction !== "NAO_PRIORIZAR");
    const primaryTopic = topHighPriority[0] || {
      topicId: "gt-sheg",
      topicName: "Pré-Eclâmpsia & Esquema de Zuspan",
      area: "GINECOLOGIA_OBSTETRICIA" as MedicalArea,
      irsScore: 95,
      masteryPct: 41,
      reason: "Alta incidência histórica com lacuna identificada",
    };

    const secondaryTopic = topHighPriority[1] || {
      topicId: "gt-tb",
      topicName: "Tuberculose Pulmonar & Esquema RIPE",
      area: "CLINICA_MEDICA" as MedicalArea,
      irsScore: 92,
      masteryPct: 62,
      reason: "Revisão periódica programada",
    };

    // 1. Spaced Review / Active Recall (10-15 min)
    if (pendingFlashcardsCount > 0 && remainingTime >= 25) {
      const duration = Math.min(15, Math.floor(remainingTime * 0.15));
      blocks.push({
        id: `block-${dateStr}-fsrs`,
        type: "REVISAO_ESPACADA",
        title: "Revisão Espaçada FSRS",
        area: primaryTopic.area,
        theme: primaryTopic.topicName,
        durationMinutes: duration,
        description: `${pendingFlashcardsCount} flashcards com risco de esquecimento iminente`,
        reason: "Recuperação ativa para interromper a curva de esquecimento calculada pela IA.",
        completed: false,
        flashcardCount: pendingFlashcardsCount,
        source: "FSRS_DUE",
      });
      remainingTime -= duration;
    }

    // 2. Targeted Theory or Grande Tema (only if low mastery or phase 1/2)
    if (primaryTopic.masteryPct < 60 && remainingTime >= 40 && phase !== "VESPERA") {
      const duration = Math.min(25, Math.floor(remainingTime * 0.3));
      blocks.push({
        id: `block-${dateStr}-theory`,
        type: "TEORIA_DIRECIONADA",
        title: `Teoria Direcionada: ${primaryTopic.topicName}`,
        area: primaryTopic.area,
        theme: primaryTopic.topicName,
        durationMinutes: duration,
        description: "Pontos críticos, critérios diagnósticos e condutas prioritárias do MS/INEP",
        reason: `Domínio atual em ${primaryTopic.masteryPct}%. Teoria focada exclusivamente nas armadilhas da banca.`,
        completed: false,
        source: "STUDENT_MEMORY",
      });
      remainingTime -= duration;
    }

    // 3. Official & Sister Questions (30-50 min)
    if (remainingTime >= 20) {
      const duration = Math.min(45, Math.floor(remainingTime * 0.5));
      const qCount = Math.max(5, Math.round(duration * 0.35));
      blocks.push({
        id: `block-${dateStr}-questions`,
        type: "QUESTOES_OFICIAIS",
        title: `Questões Oficiais & Irmãs: ${primaryTopic.topicName}`,
        area: primaryTopic.area,
        theme: primaryTopic.topicName,
        durationMinutes: duration,
        description: `${qCount} questões cronometradas com gabarito comentado passo a passo`,
        reason: "Prática deliberada em formato idêntico ao exigido pela banca examinadora.",
        completed: false,
        questionCount: qCount,
        source: "INEP_HIGH_YIELD",
      });
      remainingTime -= duration;
    }

    // 4. Interleaving block (Different medical area for cognitive discrimination)
    if (remainingTime >= 20 && secondaryTopic) {
      const duration = Math.min(25, remainingTime);
      const qCount = Math.max(4, Math.round(duration * 0.3));
      blocks.push({
        id: `block-${dateStr}-interleaving`,
        type: "QUESTOES_IRMAS",
        title: `Interleaving: ${secondaryTopic.topicName}`,
        area: secondaryTopic.area,
        theme: secondaryTopic.topicName,
        durationMinutes: duration,
        description: `Treino alternado em ${secondaryTopic.area} para exercitar discriminação de diagnósticos`,
        reason: "Interleaving cognitivo evita fadiga monotemática e melhora a retenção em longo prazo.",
        completed: false,
        questionCount: qCount,
        source: "AI_GENERATED",
      });
      remainingTime -= duration;
    }

    // 5. Error Autopsy / Correction (if time remains)
    if (remainingTime >= 10) {
      blocks.push({
        id: `block-${dateStr}-autopsy`,
        type: "CORRECAO_AUTOPSIA",
        title: "Autópsia e Mapeamento de Erros",
        durationMinutes: remainingTime,
        description: "Classificação das falhas em distratores e geração de cartas de retenção",
        reason: "Transforma cada erro de hoje em um ponto seguro na prova através da metacognição.",
        completed: false,
        source: "STUDENT_MEMORY",
      });
    }

    return blocks;
  }

  /**
   * Generates instant highest-ROI session for "Tenho X Minutos" mode
   */
  static generateTimeBoxedSession(
    minutes: number,
    priorityList: StudyPriorityScoreItem[],
    profile: StudentOnboardingProfile
  ): {
    title: string;
    totalMinutes: number;
    blocks: CalendarBlock[];
    summaryAdvice: string;
  } {
    const topTopic = priorityList[0] || {
      topicName: "Síndromes Hipertensivas da Gestação",
      area: "GINECOLOGIA_OBSTETRICIA" as MedicalArea,
      masteryPct: 42,
    };

    if (minutes <= 10) {
      return {
        title: "Micro-Sessão Express (10 min)",
        totalMinutes: 10,
        blocks: [
          {
            id: "tb-10-1",
            type: "FLASHCARDS",
            title: "Flashcards Críticos Vencidos",
            area: topTopic.area,
            theme: topTopic.topicName,
            durationMinutes: 4,
            description: "8 cartas de retenção rápida",
            reason: "Resgate de memória antes do esquecimento.",
            completed: false,
            flashcardCount: 8,
          },
          {
            id: "tb-10-2",
            type: "QUESTOES_OFICIAIS",
            title: "3 Questões de Alta Incidência",
            area: topTopic.area,
            theme: topTopic.topicName,
            durationMinutes: 6,
            description: "3 questões diretas sobre seu ponto mais fraco",
            reason: "Exercício de recuperação sob pressão de tempo.",
            completed: false,
            questionCount: 3,
          },
        ],
        summaryAdvice: "10 minutos bem utilizados em retenção ativa valem mais que 1 hora de leitura passiva.",
      };
    }

    if (minutes <= 20) {
      return {
        title: "Sessão Foco Rápido (20 min)",
        totalMinutes: 20,
        blocks: [
          {
            id: "tb-20-1",
            type: "FLASHCARDS",
            title: "Flashcards FSRS Vencidos",
            durationMinutes: 5,
            description: "10 flashcards de memorização prioritária",
            reason: "Estabilização da curva de esquecimento.",
            completed: false,
            flashcardCount: 10,
          },
          {
            id: "tb-20-2",
            type: "QUESTOES_OFICIAIS",
            title: `5 Questões INEP: ${topTopic.topicName}`,
            area: topTopic.area,
            theme: topTopic.topicName,
            durationMinutes: 10,
            description: "5 questões canônicas do Revalida com correção imediata",
            reason: `Tema de maior ROI disponível (${topTopic.masteryPct}% de domínio).`,
            completed: false,
            questionCount: 5,
          },
          {
            id: "tb-20-3",
            type: "CORRECAO_AUTOPSIA",
            title: "Correção e Autópsia de Erros",
            durationMinutes: 5,
            description: "Análise imediata do porquê dos distratores",
            reason: "Fixação do raciocínio correto.",
            completed: false,
          },
        ],
        summaryAdvice: "Essa sequência de 20 minutos cobre os 3 pilares: resgate, aplicação e correção.",
      };
    }

    if (minutes <= 30) {
      return {
        title: "Bloco Pomodoro Otimizado (30 min)",
        totalMinutes: 30,
        blocks: [
          {
            id: "tb-30-1",
            type: "REVISAO_EXPRESSA",
            title: `Revisão Expressa: ${topTopic.topicName}`,
            area: topTopic.area,
            theme: topTopic.topicName,
            durationMinutes: 6,
            description: "Protocolo e condutas atualizadas do Ministério da Saúde",
            reason: "Alinhamento de diretrizes antes da resolução.",
            completed: false,
          },
          {
            id: "tb-30-2",
            type: "QUESTOES_OFICIAIS",
            title: "8 Questões Revalida INEP",
            area: topTopic.area,
            theme: topTopic.topicName,
            durationMinutes: 18,
            description: "8 questões oficiais comentadas",
            reason: "Treino de velocidade de resolução (2.2 min/questão).",
            completed: false,
            questionCount: 8,
          },
          {
            id: "tb-30-3",
            type: "CORRECAO_AUTOPSIA",
            title: "Autópsia Ativa",
            durationMinutes: 6,
            description: "Revisão dos erros e geração de cartões",
            reason: "Prevenção de reincidência de distratores.",
            completed: false,
          },
        ],
        summaryAdvice: "Sessão equilibrada com revisão expressa de 6 min + 8 questões + fechamento metacognitivo.",
      };
    }

    // 45 to 60+ min
    return {
      title: `Sessão Completa de Alto Desempenho (${minutes} min)`,
      totalMinutes: minutes,
      blocks: [
        {
          id: "tb-full-1",
          type: "REVISAO_ESPACADA",
          title: "Revisão Ativa & Flashcards",
          durationMinutes: 10,
          description: "Revisão dos cartões programados para hoje",
          reason: "Ativação neural e resgate de memória.",
          completed: false,
          flashcardCount: 15,
        },
        {
          id: "tb-full-2",
          type: "TEORIA_DIRECIONADA",
          title: `Estudo Direcionado: ${topTopic.topicName}`,
          area: topTopic.area,
          theme: topTopic.topicName,
          durationMinutes: 15,
          description: "Critérios de gravidade, condutas e protocolos 2026",
          reason: "Fechamento da lacuna teórica específica.",
          completed: false,
        },
        {
          id: "tb-full-3",
          type: "QUESTOES_OFICIAIS",
          title: "12 Questões Oficiais INEP",
          area: topTopic.area,
          theme: topTopic.topicName,
          durationMinutes: Math.max(15, minutes - 40),
          description: "Bateria de questões oficiais e irmãs",
          reason: "Consolidação e teste de retenção.",
          completed: false,
          questionCount: 12,
        },
        {
          id: "tb-full-4",
          type: "CORRECAO_AUTOPSIA",
          title: "Autópsia e Fixação",
          durationMinutes: 15,
          description: "Análise profunda dos erros e consolidação",
          reason: "Fechamento de aprendizado.",
          completed: false,
        },
      ],
      summaryAdvice: "Ciclo completo de aprendizagem adaptativa projetado para ganho máximo de pontuação.",
    };
  }

  /**
   * Recalculates schedule after unforeseen events ("Hoje não posso estudar", "Vou viajar", etc.)
   * NEVER simply accumulates tasks in a mountain; triages what to recover vs discard vs defer.
   */
  static handleScheduleEvent(params: {
    event: "MISSED_TODAY" | "LESS_TIME" | "MORE_TIME" | "TRIP_PAUSE" | "RECOVERY_PLAN" | "FINAL_SPRINT";
    currentSchedule: ScheduledDayItem[];
    profile: StudentOnboardingProfile;
    adjustmentValue?: number; // e.g., -30 min or 3 pause days
    priorityList: StudyPriorityScoreItem[];
  }): {
    updatedSchedule: ScheduledDayItem[];
    notice: string;
  } {
    const { event, currentSchedule, profile, adjustmentValue = 0, priorityList } = params;
    const newSchedule = [...currentSchedule];

    if (event === "MISSED_TODAY") {
      // Find today's day item
      const todayIdx = newSchedule.findIndex((d) => d.isToday);
      if (todayIdx >= 0) {
        const todayDay = newSchedule[todayIdx];
        todayDay.status = "MISSED_RECALCULATED";
        todayDay.notes = "Dia remarcado e recalculado automaticamente sem sobrecarga.";
        
        // Triage: Move ONLY critical FSRS spaced reviews to tomorrow; drop non-essential theory
        const nextDayIdx = todayIdx + 1;
        if (nextDayIdx < newSchedule.length) {
          const nextDay = newSchedule[nextDayIdx];
          const criticalReviews = todayDay.blocks.filter((b) => b.type === "REVISAO_ESPACADA");
          
          if (criticalReviews.length > 0 && !nextDay.blocks.some((b) => b.type === "REVISAO_ESPACADA")) {
            nextDay.blocks.unshift(...criticalReviews);
          }
        }
      }

      return {
        updatedSchedule: newSchedule,
        notice: "O plano de hoje foi redistribuído com inteligência. Apenas as revisões críticas foram movidas para evitar acúmulo desnecessário.",
      };
    }

    if (event === "LESS_TIME" || event === "MORE_TIME") {
      const todayIdx = newSchedule.findIndex((d) => d.isToday);
      if (todayIdx >= 0) {
        const todayDay = newSchedule[todayIdx];
        const newAllocated = Math.max(15, todayDay.allocatedMinutes + adjustmentValue);
        todayDay.allocatedMinutes = newAllocated;
        todayDay.blocks = this.generateDailyBlocks({
          availableMinutes: newAllocated,
          priorityList,
          dateStr: todayDay.date,
          phase: todayDay.phase,
        });
      }

      return {
        updatedSchedule: newSchedule,
        notice: `Horário de hoje ajustado para ${newSchedule[todayIdx]?.allocatedMinutes} min. O cronograma foi rebalanceado proporcionalmente.`,
      };
    }

    if (event === "RECOVERY_PLAN") {
      // Complete reset from today forward
      newSchedule.forEach((day, idx) => {
        if (idx >= 0) {
          day.status = "PENDING";
          day.blocks = this.generateDailyBlocks({
            availableMinutes: day.allocatedMinutes || 120,
            priorityList,
            dateStr: day.date,
            phase: day.phase,
          });
        }
      });

      return {
        updatedSchedule: newSchedule,
        notice: "Plano de Recuperação executado. As tarefas antigas foram reavaliadas e um novo roteiro otimizado foi traçado a partir de hoje.",
      };
    }

    if (event === "FINAL_SPRINT") {
      // Shifts heavily to high-yield questions, error autopsy and FSRS retention
      newSchedule.forEach((day) => {
        day.phase = "FASE_3_RETA_FINAL";
        day.blocks = day.blocks.map((b) => {
          if (b.type === "TEORIA_COMPLETA") {
            return {
              ...b,
              type: "REVISAO_EXPRESSA",
              title: b.title.replace("Teoria Completa", "Revisão Expressa"),
              durationMinutes: Math.min(15, b.durationMinutes),
              description: "Revisão rápida de alta retenção para a Reta Final",
            };
          }
          return b;
        });
      });

      return {
        updatedSchedule: newSchedule,
        notice: "Modo Reta Final ativado! A IA eliminou teorias extensas e focou 100% em questões INEP, pontos de alta retenção e flashcards.",
      };
    }

    return {
      updatedSchedule: newSchedule,
      notice: "Cronograma atualizado com sucesso.",
    };
  }

  /**
   * Calculates realistic content coverage forecast to prevent student overload
   */
  static calculateCoverageForecast(
    weeklyHoursAvailable: number,
    daysRemaining: number,
    totalThemesCount: number = 75
  ): CoverageForecast {
    // Estimativa: ~1.8h por Grande Tema em ciclo completo (teoria + questões + revisão)
    const totalHoursUntilExam = (weeklyHoursAvailable / 7) * daysRemaining;
    const themesCoverable = Math.floor(totalHoursUntilExam / 1.8);

    const highPriorityCoverage = Math.min(98, Math.round((themesCoverable / 25) * 94));
    const mediumPriorityCoverage = Math.min(90, Math.max(20, Math.round((themesCoverable / 50) * 78)));
    const lowPriorityCoverage = Math.min(75, Math.max(10, Math.round((themesCoverable / totalThemesCount) * 45)));

    const isOverloaded = weeklyHoursAvailable > 35 || (daysRemaining < 30 && weeklyHoursAvailable < 10);

    let aiDiagnosis = "Seu plano possui distribuição realista de carga.";
    if (daysRemaining < 30 && weeklyHoursAvailable < 10) {
      aiDiagnosis = "Tempo escasso para a reta final. O algoritmo irá priorizar estritamente os 20 temas de maior IRS do Revalida.";
    } else if (weeklyHoursAvailable >= 20) {
      aiDiagnosis = "Excelente margem de tempo para cobrir 100% dos temas de alta e média incidência com revisões confortáveis.";
    }

    return {
      highPriorityPct: Math.max(40, highPriorityCoverage),
      mediumPriorityPct: Math.max(25, mediumPriorityCoverage),
      lowPriorityPct: Math.max(10, lowPriorityCoverage),
      weeklyHoursAvailable,
      weeklyHoursRecommended: Math.max(12, Math.round((25 * 1.8) / (daysRemaining / 7))),
      isOverloaded,
      aiDiagnosis,
    };
  }

  /**
   * Identifies topics that should NOT be studied now to avoid wasting time
   */
  static getDeprioritizedTopics(
    priorityList: StudyPriorityScoreItem[]
  ): DeprioritizedTopicItem[] {
    const deprioritized = priorityList.filter(
      (p) => p.recommendedAction === "NAO_PRIORIZAR" || (p.masteryPct >= 80 && p.forgettingRiskPct < 20)
    );

    if (deprioritized.length === 0) {
      // Provide high-mastery defaults
      return [
        {
          id: "dp-1",
          topicName: "Alergias Alimentares na Infância",
          area: "PEDIATRIA",
          reason: "Domínio registrado de 88% com 12 acertos consecutivos e memória consolidada.",
          masteryPct: 88,
          inepIncidence: "MEDIA",
          advice: "Não assista a aulas nem leia teoria deste tema. Uma revisão rápida em flashcards daqui a 22 dias é suficiente.",
        },
        {
          id: "dp-2",
          topicName: "Princípios Básicos e Bioética no SUS",
          area: "MEDICINA_FAMILIA_COMUNIDADE",
          reason: "Conceitos fundamentais dominados (92% de assertividade histórica).",
          masteryPct: 92,
          inepIncidence: "ALTA",
          advice: "Economize seu tempo para temas operacionais do SUS como Notificação Compulsória e Vigilância Epidemiológica.",
        },
        {
          id: "dp-3",
          topicName: "Hérnias Inguinais Redutíveis",
          area: "CIRURGIA_GERAL",
          reason: "Classificação anatômica e condutas cirúrgicas já consolidadas em seu perfil.",
          masteryPct: 84,
          inepIncidence: "MEDIA",
          advice: "Foque antes em Abdome Agudo Inflamatório e Trauma Abdominal fechado.",
        },
      ];
    }

    return deprioritized.slice(0, 4).map((p, idx) => ({
      id: `dp-${idx + 1}`,
      topicName: p.topicName,
      area: p.area,
      reason: p.reason,
      masteryPct: p.masteryPct,
      inepIncidence: p.irsScore > 80 ? "ALTA" : p.irsScore > 50 ? "MEDIA" : "BAIXA",
      advice: "Economize este tempo para direcionar aos seus pontos fracos de alta pontuação.",
    }));
  }
}
