import React, { useState } from "react";
import {
  Calendar,
  BookOpen,
  HelpCircle,
  Layers,
  Clock,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  BarChart2,
  FileQuestion,
  FileText,
  Flame,
  Target,
  Sparkles,
  Edit3,
  TrendingUp,
  Zap,
  Award,
  ChevronLeft,
  GraduationCap,
  AlertCircle,
  Lock,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useEntitlements } from "../../hooks/useEntitlements";
import { ExamEngine } from "../../services/examEngine";
import { SpacedRepetitionService } from "../../services/spacedRepetitionService";
import { formatMedicalArea } from "../../utils/formatters";

export const DashboardView: React.FC = () => {
  const {
    user,
    todayMission,
    readinessData,
    knowledgeGraph,
    flashcards,
    attempts,
    setActiveTab,
    setQuestionFilterArea,
    setIsStudyForMeOpen,
    setQuestionMode,
    setIsSubscriptionModalOpen,
  } = useApp();
  const { isTrial, isExpired, trialDaysRemaining, getFeatureDetails } = useEntitlements();

  const questionsDetail = getFeatureDetails("official_questions");
  const questionsUsed = questionsDetail.used || attempts?.length || 0;
  const questionsLimit = questionsDetail.limit || 100;

  const rawName = user?.name || "Doutor(a)";
  const userName = rawName.replace("Dr. ", "").replace("Dra. ", "");

  const examInfo = ExamEngine.getExamInfo(user?.targetEdition, user?.examDate);

  // Top weakness from knowledge graph
  const topWeakness =
    Array.isArray(knowledgeGraph) && knowledgeGraph.length > 0
      ? [...knowledgeGraph].sort(
          (a, b) => (b?.expectedPointGain ?? 0) - (a?.expectedPointGain ?? 0)
        )[0]
      : null;

  // Real statistics without mock fallbacks
  const totalAttempts = attempts?.length ?? 0;
  const correctAttempts = attempts?.filter((a) => a.isCorrect)?.length ?? 0;
  const accuracyPercentage =
    totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
  const readinessScore = readinessData?.score ?? 0;

  const dueFlashcards = SpacedRepetitionService.getDueFlashcards(flashcards || []);

  // Determine study mission details
  const studyTopic =
    todayMission?.focusTopic || topWeakness?.name || "Pré-eclâmpsia e Eclâmpsia";
  const studyArea =
    todayMission?.targetArea || topWeakness?.area || "GINECOLOGIA_OBSTETRICIA";
  const formattedStudyArea = formatMedicalArea(studyArea);

  const questionsTask = todayMission?.tasks?.find((t) => t.type === "QUESTIONS");
  const questionsCount = questionsTask?.count || 20;

  const flashcardsTask = todayMission?.tasks?.find(
    (t) => t.type === "FLASHCARDS" || t.type === "REVIEW"
  );
  const flashcardsCount =
    flashcardsTask?.count || (dueFlashcards.length > 0 ? dueFlashcards.length : 10);

  const isMissionStarted =
    todayMission?.tasks?.some((t) => t.completed) || totalAttempts > 0;

  // State for Activity view toggle: SEMANAL vs MENSAL
  const [activityTimeframe, setActivityTimeframe] = useState<"SEMANAL" | "MENSAL">("SEMANAL");

  // Activity days data
  const activityDays = [
    { day: "SEG", date: 1, questions: 25, flashcards: 15, height: "65%" },
    { day: "TER", date: 2, questions: 40, flashcards: 20, height: "85%" },
    { day: "QUA", date: 3, questions: 15, flashcards: 10, height: "45%" },
    { day: "QUI", date: 4, questions: 35, flashcards: 30, height: "80%" },
    { day: "SEX", date: 5, questions: 30, flashcards: 25, height: "70%" },
    { day: "SAB", date: 6, questions: 50, flashcards: 40, height: "100%" },
    { day: "DOM", date: 7, questions: 10, flashcards: 5, height: "30%" },
  ];

  // Calendar state
  const currentDate = new Date();
  const currentMonthName = currentDate.toLocaleDateString("pt-BR", { month: "long" });
  const currentYear = currentDate.getFullYear();
  const currentDayNumber = currentDate.getDate();

  // Top prioritized clinical themes (based on weakness & INEP impact)
  const priorityThemes = [
    {
      id: "th-1",
      title: "Pré-eclâmpsia, Eclâmpsia e Síndrome HELLP",
      area: "GINECOLOGIA_OBSTETRICIA",
      badgeStatus: "Pendente",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      questionsCount: 28,
      flashcardsCount: 16,
      mastery: 35,
    },
    {
      id: "th-2",
      title: "Síndrome Coronariana Aguda & IAM sem Supra",
      area: "CLINICA_MEDICA",
      badgeStatus: "Iniciado",
      badgeColor: "bg-sky-500/20 text-sky-300 border-sky-500/30",
      questionsCount: 34,
      flashcardsCount: 22,
      mastery: 52,
    },
    {
      id: "th-3",
      title: "Trauma Torácico & Pneumotórax Hipertensivo (ATLS 10ª Ed)",
      area: "CIRURGIA_GERAL",
      badgeStatus: "Concluído",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      questionsCount: 22,
      flashcardsCount: 14,
      mastery: 88,
    },
  ];

  return (
    <div className="space-y-6 text-slate-100 pb-16 max-w-7xl mx-auto">
      {/* Trial 7 Dias Experience Banner */}
      {isTrial && (
        <div
          data-testid="dashboard-trial-banner"
          className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-teal-950/70 via-[#0B1A2E] to-slate-900/80 border border-teal-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl shadow-black/20"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center justify-center shrink-0 shadow-inner">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-teal-300">
                  {trialDaysRemaining === 1
                    ? "Seu teste gratuito termina amanhã."
                    : trialDaysRemaining === 0
                    ? "Seu teste gratuito termina hoje."
                    : `Seu teste gratuito termina em ${trialDaysRemaining} dias.`}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-200 border border-teal-500/30 font-semibold">
                  Trial Ativo
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {questionsUsed >= 80
                  ? `Você utilizou ${questionsUsed} de ${questionsLimit} questões disponíveis no teste gratuito.`
                  : `Você já resolveu ${questionsUsed} de ${questionsLimit} questões da cota do seu período de avaliação.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsSubscriptionModalOpen(true)}
              className="w-full md:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Conhecer o Stazia PRO</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Trial Expired Alert Banner */}
      {isExpired && (
        <div
          data-testid="dashboard-expired-banner"
          className="p-4 sm:p-5 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                Seu teste gratuito de 7 dias expirou.
              </span>
              <p className="text-xs text-slate-300 mt-0.5">
                Assine o Stazia PRO ou Stazia Elite para desbloquear o banco completo, caderno inteligente e IA.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSubscriptionModalOpen(true)}
            className="w-full md:w-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Ver Planos e Assinar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. TOP CAROUSEL / CRONOGRAMA SLIDER */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
              Cronograma Recomendado
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              Hoje
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("planejamento-calendario")}
            className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Ver semana completa</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 3 Quick Action Cards in Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: Simulado / Questões */}
          <div
            onClick={() => {
              setQuestionMode("STUDY");
              setActiveTab("praticar-questoes");
            }}
            className="group relative p-4 rounded-2xl bg-[#09101D] border border-slate-800/90 hover:border-teal-500/50 transition-all cursor-pointer shadow-lg hover:shadow-teal-500/5 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-400">
                  TREINO DIÁRIO
                </span>
                <h3 className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-1">
                  Resolução de Questões Oficiais
                </h3>
                <p className="text-xs text-slate-400">
                  {questionsCount} questões comentadas
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FileQuestion className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-teal-400 font-semibold">
              <span>Iniciar questões</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: OSCE / Checklist */}
          <div
            onClick={() => setActiveTab("praticar-checklists")}
            className="group relative p-4 rounded-2xl bg-[#09101D] border border-slate-800/90 hover:border-sky-500/50 transition-all cursor-pointer shadow-lg hover:shadow-sky-500/5 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                  PROVA PRÁTICA
                </span>
                <h3 className="text-sm font-bold text-white group-hover:text-sky-300 transition-colors line-clamp-1">
                  Estação Clínica / Checklist
                </h3>
                <p className="text-xs text-slate-400">
                  Treino solo ou em dupla no Radar
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-sky-400 font-semibold">
              <span>Praticar estação</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: FSRS Flashcards */}
          <div
            onClick={() => setActiveTab("revisar-flashcards")}
            className="group relative p-4 rounded-2xl bg-[#09101D] border border-slate-800/90 hover:border-amber-500/50 transition-all cursor-pointer shadow-lg hover:shadow-amber-500/5 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                  REVISÃO ESPAÇADA
                </span>
                <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                  Flashcards Agendados
                </h3>
                <p className="text-xs text-slate-400">
                  {flashcardsCount} cards com algoritmo FSRS
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-amber-400 font-semibold">
              <span>Revisar agora</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN 2-COLUMN LAYOUT: LEFT (2/3) + RIGHT (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: 2/3 WIDTH (Atividade, Consumo, Aulas da semana) */}
        <div className="lg:col-span-2 space-y-6">
          {/* TOP MISSION HERO BANNER */}
          <div className="bg-gradient-to-br from-[#09101D] via-[#0B1526] to-[#080E1A] rounded-3xl p-6 border border-slate-800/90 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-teal-500/20 text-teal-300 border border-teal-500/30 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Plano Personalizado
                  </span>
                  <span className="text-xs text-slate-400">
                    Foco: {formattedStudyArea}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  {studyTopic}
                </h2>
                <p className="text-xs text-slate-300 max-w-lg">
                  Estudo direcionado com as maiores probabilidades de cobrança na 1ª Etapa do Revalida INEP.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsStudyForMeOpen(true)}
                  className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Ajustar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (topWeakness?.area) {
                      setQuestionFilterArea(topWeakness.area);
                    }
                    setActiveTab("estudar-plano-hoje");
                  }}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black tracking-wide uppercase transition-all shadow-md shadow-teal-500/20 hover:scale-[1.02] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{isMissionStarted ? "Continuar" : "Começar"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* CARD 1: ATIVIDADE (BAR CHART + TOGGLE) */}
          <div className="bg-[#09101D] rounded-3xl p-5 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Atividade de Estudo
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Volume diário de questões e revisões
                  </p>
                </div>
              </div>

              {/* Semanal / Mensal Toggle */}
              <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActivityTimeframe("SEMANAL")}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    activityTimeframe === "SEMANAL"
                      ? "bg-teal-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  onClick={() => setActivityTimeframe("MENSAL")}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    activityTimeframe === "MENSAL"
                      ? "bg-teal-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Mensal
                </button>
              </div>
            </div>

            {/* Chart Area */}
            <div className="pt-4 pb-2">
              <div className="h-44 flex items-end justify-between gap-2 sm:gap-4 px-2">
                {activityDays.map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-200 pointer-events-none whitespace-nowrap">
                      {item.questions}q • {item.flashcards}f
                    </div>
                    {/* Stacked bar */}
                    <div className="w-full max-w-[32px] bg-slate-900 rounded-t-lg overflow-hidden flex flex-col justify-end" style={{ height: item.height }}>
                      <div className="w-full bg-teal-500 transition-all group-hover:bg-teal-400" style={{ height: "65%" }} />
                      <div className="w-full bg-sky-600 transition-all group-hover:bg-sky-500" style={{ height: "35%" }} />
                    </div>
                    {/* Label */}
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-teal-400 transition-colors">
                      {item.day}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 pt-2 border-t border-slate-800/60 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                <span>Questões resolvidas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600" />
                <span>Flashcards FSRS</span>
              </div>
            </div>
          </div>

          {/* CARD 2: CONSUMO (COMPARATIVE HORIZONTAL BARS) */}
          <div className="bg-[#09101D] rounded-3xl p-5 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Ritmo de Consumo vs. Aprovados
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Seu ritmo em comparação com a média histórica de aprovação
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                +14% acima da média
              </span>
            </div>

            <div className="space-y-4 pt-1">
              {/* Meu consumo */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Meu Consumo Semanal</span>
                  <span className="font-bold text-teal-400">320 itens (Questões + Cards)</span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-sky-400 rounded-full"
                    style={{ width: "78%" }}
                  />
                </div>
              </div>

              {/* Média dos Aprovados */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-400">Média dos Aprovados no Revalida</span>
                  <span className="font-bold text-slate-400">280 itens / semana</span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full bg-slate-600 rounded-full"
                    style={{ width: "68%" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CARD 3: TEMAS PRIORITÁRIOS DA SEMANA */}
          <div className="bg-[#09101D] rounded-3xl p-5 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Temas Prioritários da Semana
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Grandes áreas com maior peso na matriz de corte do INEP
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("estudar-grandes-temas")}
                className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 cursor-pointer"
              >
                <span>Ver todos</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              {priorityThemes.map((theme) => (
                <div
                  key={theme.id}
                  onClick={() => {
                    setQuestionFilterArea(theme.area as any);
                    setActiveTab("estudar-grandes-temas");
                  }}
                  className="p-4 rounded-2xl bg-[#0B1526] border border-slate-800 hover:border-teal-500/40 transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${theme.badgeColor}`}>
                        {theme.badgeStatus}
                      </span>
                      <span className="text-[11px] text-slate-400 capitalize">
                        {formatMedicalArea(theme.area)}
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-1">
                      {theme.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center shrink-0 text-xs">
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block font-mono">
                        {theme.questionsCount}q • {theme.flashcardsCount}f
                      </span>
                      <span className="text-[10px] font-bold text-teal-400">
                        {theme.mastery}% domínio
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 1/3 WIDTH (Mini Calendar, Streak Card, Próximos Eventos) */}
        <div className="space-y-6">
          {/* MINI INTERACTIVE CALENDAR WIDGET */}
          <div className="bg-[#09101D] rounded-3xl p-5 border border-slate-800/90 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold text-white capitalize">
                  {currentMonthName} {currentYear}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("planejamento-calendario")}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Mês anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("planejamento-calendario")}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Próximo mês"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500 uppercase">
              <span>D</span>
              <span>S</span>
              <span>T</span>
              <span>Q</span>
              <span>Q</span>
              <span>S</span>
              <span>S</span>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => {
                const isToday = dayNum === currentDayNumber;
                const hasStudy = [2, 3, 5, 8, 12, 15, 18, 22, 25, 29].includes(dayNum);

                return (
                  <button
                    key={dayNum}
                    type="button"
                    onClick={() => setActiveTab("planejamento-calendario")}
                    className={`h-7 rounded-lg flex flex-col items-center justify-center relative font-mono transition-colors cursor-pointer ${
                      isToday
                        ? "bg-teal-500 text-slate-950 font-black shadow-xs shadow-teal-500/50"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span>{dayNum}</span>
                    {hasStudy && !isToday && (
                      <span className="w-1 h-1 rounded-full bg-teal-400 absolute bottom-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* STREAK CARD ("X DIAS DE OFENSIVA") */}
          <div className="bg-[#09101D] rounded-3xl p-5 border border-slate-800/90 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
                  <Flame className="w-4 h-4 fill-orange-500 text-orange-500" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">
                    {user?.studyStreakDays || 7} dias seguidos
                  </span>
                  <span className="text-[10px] text-orange-400 font-semibold">
                    Ofensiva Ativa
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                Recorde: 14d
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Você manteve o hábito por {user?.studyStreakDays || 7} dias seguidos. Continue com o treino diário para não perder seu progresso.
            </p>

            <button
              type="button"
              onClick={() => {
                setQuestionMode("STUDY");
                setActiveTab("praticar-questoes");
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-500/10 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              <span>Questões Inteligentes &gt;</span>
            </button>
          </div>

          {/* PRÓXIMOS EVENTOS & SIMULADOS */}
          <div className="bg-[#09101D] rounded-3xl p-5 border border-slate-800/90 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                Próximos Eventos
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab("praticar-simulados")}
                className="text-xs font-semibold text-slate-400 hover:text-white"
              >
                Simulados
              </button>
            </div>

            <div className="space-y-2.5">
              {/* Event 1 */}
              <div className="p-3 rounded-2xl bg-[#0B1526] border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-white">Simulado Nacional Geral</span>
                  <span className="text-teal-400 font-mono">100q</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    Domingo, às 09:00
                  </span>
                  <span className="text-emerald-400 font-semibold">Inscrição inclusa</span>
                </div>
              </div>

              {/* Event 2 */}
              <div className="p-3 rounded-2xl bg-[#0B1526] border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-white">1ª Etapa Revalida INEP</span>
                  <span className="text-amber-400 font-bold">{examInfo.daysRemaining} dias</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3 text-slate-500" />
                    {user?.targetEdition || "Revalida INEP 2026/2"}
                  </span>
                  <span className="text-slate-500">Oficial</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
