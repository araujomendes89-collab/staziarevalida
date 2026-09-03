import React from "react";
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
  Stethoscope,
  FileQuestion,
  FileText,
  Flame,
  Target,
  Sparkles,
  Edit3,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { ExamEngine } from "../../services/examEngine";
import { SpacedRepetitionService } from "../../services/spacedRepetitionService";

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
  } = useApp();

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
  const formattedStudyArea = studyArea.replace(/_/g, " ");

  const questionsTask = todayMission?.tasks?.find((t) => t.type === "QUESTIONS");
  const questionsCount = questionsTask?.count || 20;

  const flashcardsTask = todayMission?.tasks?.find(
    (t) => t.type === "FLASHCARDS" || t.type === "REVIEW"
  );
  const flashcardsCount =
    flashcardsTask?.count || (dueFlashcards.length > 0 ? dueFlashcards.length : 10);

  const isMissionStarted =
    todayMission?.tasks?.some((t) => t.completed) || totalAttempts > 0;

  // Top 3 priority topics for "Prioridades Para Você"
  const priorityTopics =
    Array.isArray(knowledgeGraph) && knowledgeGraph.length >= 3
      ? [...knowledgeGraph]
          .sort((a, b) => (b?.expectedPointGain ?? 0) - (a?.expectedPointGain ?? 0))
          .slice(0, 3)
      : [
          {
            id: "kn-1",
            name: "Pré-eclâmpsia e Eclâmpsia",
            area: "GINECOLOGIA_OBSTETRICIA",
            userMastery: 25,
          },
          {
            id: "kn-2",
            name: "Síndrome Coronariana Aguda",
            area: "CLINICA_MEDICA",
            userMastery: 40,
          },
          {
            id: "kn-3",
            name: "Doenças Diarreicas & Desidratação",
            area: "PEDIATRIA",
            userMastery: 35,
          },
        ];

  return (
    <div className="space-y-6 text-slate-800 pb-16 max-w-6xl mx-auto">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Olá, {userName}! <span className="inline-block">👋</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Seu plano para hoje está pronto.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {user?.studyStreakDays && user.studyStreakDays > 0 ? (
            <div className="px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-xs font-bold text-orange-700 flex items-center gap-1.5 shadow-2xs">
              <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
              <span>{user.studyStreakDays} dias seguidos</span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
            title="Configurações de meta e perfil"
          >
            <span className="text-teal-600 font-bold">{examInfo.daysRemaining}d</span>
            <span className="text-slate-500">p/ prova</span>
          </button>
        </div>
      </div>

      {/* 2. CARD PRINCIPAL — PLANO DE HOJE (Prioridade Máxima) */}
      <div className="bg-gradient-to-br from-[#0B192C] via-[#10243E] to-[#0A1A2F] text-white rounded-3xl p-6 sm:p-8 shadow-md border border-[#1B355A] relative overflow-hidden">
        {/* Subtle decorative glow in top right */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center font-bold shrink-0">
                <Sparkles className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest text-teal-400 uppercase block">
                  AÇÃO RECOMENDADA
                </span>
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  Plano de estudo de hoje
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsStudyForMeOpen(true)}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Personalizar plano</span>
            </button>
          </div>

          {/* 3 Steps: Estudar, Praticar, Revisar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
            {/* Step 1: Estudar */}
            <div
              onClick={() => {
                if (topWeakness?.area) {
                  setQuestionFilterArea(topWeakness.area);
                }
                setActiveTab("estudar-grandes-temas");
              }}
              className="p-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-teal-400/40 transition-all cursor-pointer group space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-teal-400 tracking-wider uppercase">
                  1. ESTUDAR
                </span>
                <BookOpen className="w-4 h-4 text-teal-400 group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                {studyTopic}
              </h3>
              <p className="text-[11px] text-slate-300 capitalize">
                {formattedStudyArea}
              </p>
            </div>

            {/* Step 2: Praticar */}
            <div
              onClick={() => {
                setQuestionMode("STUDY");
                setActiveTab("praticar-questoes");
              }}
              className="p-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-purple-400/40 transition-all cursor-pointer group space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-purple-300 tracking-wider uppercase">
                  2. PRATICAR
                </span>
                <HelpCircle className="w-4 h-4 text-purple-300 group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                {questionsCount} questões oficiais
              </h3>
              <p className="text-[11px] text-slate-300">
                Banco com gabarito comentado
              </p>
            </div>

            {/* Step 3: Revisar */}
            <div
              onClick={() => setActiveTab("revisar-flashcards")}
              className="p-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-amber-400/40 transition-all cursor-pointer group space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-300 tracking-wider uppercase">
                  3. REVISAR
                </span>
                <Layers className="w-4 h-4 text-amber-300 group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                {flashcardsCount} flashcards
              </h3>
              <p className="text-[11px] text-slate-300">
                Repetição espaçada inteligente
              </p>
            </div>
          </div>

          {/* Call to Action Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-white/10">
            <span className="text-xs text-slate-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-teal-400 shrink-0" />
              Tempo estimado: ~60 minutos
            </span>

            <button
              type="button"
              onClick={() => {
                if (topWeakness?.area) {
                  setQuestionFilterArea(topWeakness.area);
                }
                setActiveTab("estudar-plano-hoje");
              }}
              className="px-6 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
            >
              <span>{isMissionStarted ? "CONTINUAR PLANO" : "COMEÇAR AGORA"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. PROVA-ALVO & SEU PROGRESSO (Lado a Lado no Desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: Prova-Alvo */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                SUA PROVA-ALVO
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                Alterar meta
              </button>
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {user?.targetEdition || "Revalida INEP 2026/2"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {examInfo?.examDate
                    ? new Date(examInfo.examDate + "T12:00:00").toLocaleDateString(
                        "pt-BR",
                        { day: "numeric", month: "long", year: "numeric" }
                      )
                    : "13 de Setembro de 2026"}
                </span>
              </p>
            </div>

            {/* Countdown Badge */}
            <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="text-xs font-semibold text-teal-900">
                  Tempo até a 1ª Etapa
                </span>
              </div>
              <span className="text-base font-extrabold text-teal-700">
                {examInfo.daysRemaining} dias
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setQuestionMode("EXAM");
              setActiveTab("praticar-simulados");
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Acessar simulados da prova</span>
            <ChevronRight className="w-4 h-4 text-teal-400" />
          </button>
        </div>

        {/* Card: Seu Progresso */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                SEU PROGRESSO
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("desempenho-geral")}
                className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Ver desempenho completo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 3 Indicadores Principais */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {/* Indicador 1: Questões */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <FileQuestion className="w-4 h-4 text-teal-600 mx-auto mb-1" />
                <span className="text-lg font-bold text-slate-900 block leading-tight">
                  {totalAttempts.toLocaleString("pt-BR")}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Questões
                </span>
              </div>

              {/* Indicador 2: Taxa de Acerto */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="text-lg font-bold text-slate-900 block leading-tight">
                  {accuracyPercentage}%
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Taxa de acerto
                </span>
              </div>

              {/* Indicador 3: Preparação Geral */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <BarChart2 className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <span className="text-lg font-bold text-slate-900 block leading-tight">
                  {readinessScore}%
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Preparação
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              Acertos totais
            </span>
            <span className="font-bold text-slate-900">
              {correctAttempts.toLocaleString("pt-BR")} de {totalAttempts.toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
      </div>

      {/* 4. PRIORIDADES PARA VOCÊ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Prioridades para você
            </h3>
            <p className="text-xs text-slate-500">
              Temas com maior potencial de ganho de pontuação no Revalida
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("estudar-grandes-temas")}
            className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Ver todas</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {priorityTopics.map((node, idx) => {
            const mastery = node.userMastery ?? 0;
            const areaFormatted = (node.area || "CLINICA_MEDICA").replace(/_/g, " ");

            return (
              <div
                key={node.id || idx}
                onClick={() => {
                  if (node.area) {
                    setQuestionFilterArea(node.area as any);
                  }
                  setActiveTab("estudar-grandes-temas");
                }}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-400 hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Target className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-teal-700 transition-colors">
                      {node.name}
                    </h4>
                    <p className="text-[10px] text-slate-400 capitalize mt-0.5 truncate">
                      {areaFormatted}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-medium">Domínio atual</span>
                    <span className="font-bold text-slate-700">{mastery}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all"
                      style={{ width: `${mastery}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. ACESSOS RÁPIDOS (Reduzidos para 4 Ações Principais) */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Acessos rápidos</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 1. Questões */}
          <button
            type="button"
            onClick={() => {
              setQuestionMode("STUDY");
              setActiveTab("praticar-questoes");
            }}
            className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-400 hover:shadow-xs transition-all text-center group cursor-pointer"
          >
            <div className="w-10 h-10 mx-auto rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <BookOpen className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
              Questões
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Banco comentado</p>
          </button>

          {/* 2. Simulados */}
          <button
            type="button"
            onClick={() => {
              setQuestionMode("EXAM");
              setActiveTab("praticar-simulados");
            }}
            className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-purple-400 hover:shadow-xs transition-all text-center group cursor-pointer"
          >
            <div className="w-10 h-10 mx-auto rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <HelpCircle className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
              Simulados
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Treino cronometrado</p>
          </button>

          {/* 3. Provas completas */}
          <button
            type="button"
            onClick={() => setActiveTab("praticar-provas")}
            className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-emerald-400 hover:shadow-xs transition-all text-center group cursor-pointer"
          >
            <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
              Provas completas
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Edições 2021 a 2026</p>
          </button>

          {/* 4. Flashcards */}
          <button
            type="button"
            onClick={() => setActiveTab("revisar-flashcards")}
            className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-amber-400 hover:shadow-xs transition-all text-center group cursor-pointer"
          >
            <div className="w-10 h-10 mx-auto rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
              Flashcards
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Revisão espaçada</p>
          </button>
        </div>
      </div>

      {/* 6. AGENDA DE HOJE (Compacta) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Agenda de hoje</h3>
            <p className="text-xs text-slate-500">
              Blocos programados para seu ciclo diário de estudos
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("planejamento-calendario")}
            className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Ver calendário completo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Bloco 1 */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-700">08:00 — Estudo Teórico</span>
              <span className="w-2 h-2 rounded-full bg-teal-500" />
            </div>
            <p className="font-semibold text-slate-900 line-clamp-1">
              {studyTopic}
            </p>
            <p className="text-[10px] text-slate-400 capitalize">{formattedStudyArea}</p>
          </div>

          {/* Bloco 2 */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-700">10:00 — Treino Prático</span>
              <span className="w-2 h-2 rounded-full bg-purple-500" />
            </div>
            <p className="font-semibold text-slate-900 line-clamp-1">
              Resolver {questionsCount} questões oficiais
            </p>
            <p className="text-[10px] text-slate-400">INEP Objetivas</p>
          </div>

          {/* Bloco 3 */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-700">16:00 — Revisão Ativa</span>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            </div>
            <p className="font-semibold text-slate-900 line-clamp-1">
              Revisar {flashcardsCount} flashcards
            </p>
            <p className="text-[10px] text-slate-400">Repetição espaçada FSRS</p>
          </div>
        </div>
      </div>
    </div>
  );
};
