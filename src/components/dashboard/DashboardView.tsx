import React, { useState } from "react";
import {
  Calendar,
  BookOpen,
  HelpCircle,
  Layers,
  Tv,
  Target,
  BookMarked,
  Clock,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  BarChart2,
  Stethoscope,
  FileQuestion,
  FileText,
  X,
  Flame,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { ExamEngine } from "../../services/examEngine";

export const DashboardView: React.FC = () => {
  const {
    user,
    readinessData,
    knowledgeGraph,
    flashcards,
    attempts,
    setActiveTab,
    setQuestionFilterArea,
    setIsStudyForMeOpen,
    setIsExamConfigOpen,
    setQuestionMode,
  } = useApp();

  const [hasSeenWelcomeHero, setHasSeenWelcomeHero] = useState(() => {
    try {
      const stored = localStorage.getItem("revalida_has_seen_welcome_hero");
      if (stored !== null) return stored === "true";
      return (attempts?.length ?? 0) > 0 || !!user?.hasSeenWelcomeHero;
    } catch {
      return false;
    }
  });

  const dismissHero = () => {
    setHasSeenWelcomeHero(true);
    try {
      localStorage.setItem("revalida_has_seen_welcome_hero", "true");
    } catch (_) {}
  };

  const rawName = user?.name || "Doutor(a)";
  const userName = rawName.replace("Dr. ", "").replace("Dra. ", "");

  const examInfo = ExamEngine.getExamInfo(user.targetEdition, user.examDate);

  // Weakest topic from real database
  const topWeakness =
    Array.isArray(knowledgeGraph) && knowledgeGraph.length > 0
      ? [...knowledgeGraph].sort(
          (a, b) => (b?.expectedPointGain ?? 0) - (a?.expectedPointGain ?? 0)
        )[0]
      : null;

  // Real statistics without mock fallbacks
  const totalAttempts = attempts?.length ?? 0;
  const correctAttempts = attempts?.filter((a) => a.isCorrect)?.length ?? 0;
  const readinessScore = readinessData?.score ?? 0;
  const examAttemptsCount = attempts?.filter((a) => a.mode === "EXAM")?.length ?? 0;

  // Calculate actual study time from recorded attempts
  const totalSecondsSpent = (attempts || []).reduce(
    (acc, a) => acc + (a.timeSpentSeconds || 60),
    0
  );
  const studyHours = Math.floor(totalSecondsSpent / 3600);
  const studyMinutes = Math.floor((totalSecondsSpent % 3600) / 60);
  const studyTimeFormatted =
    totalAttempts > 0 ? `${studyHours}h ${studyMinutes.toString().padStart(2, "0")}m` : "0h 00m";

  const dueFlashcards = (flashcards || []).filter(
    (f) => new Date(f.dueDate) <= new Date()
  );

  // Dynamic knowledge nodes for "Continue Estudando"
  const recentTopics = Array.isArray(knowledgeGraph) && knowledgeGraph.length >= 3
    ? knowledgeGraph.slice(0, 3)
    : [
        { id: "kn-1", name: "Síndromes Hipertensivas & Pré-Eclâmpsia", area: "GINECOLOGIA_OBSTETRICIA", userMastery: 0 },
        { id: "kn-2", name: "Doenças Diarreicas & Reidratação", area: "PEDIATRIA", userMastery: 0 },
        { id: "kn-3", name: "Síndrome Coronariana Aguda", area: "CLINICA_MEDICA", userMastery: 0 },
      ];

  return (
    <div className="space-y-6 text-slate-800 pb-16">
      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT / CENTER MAIN COLUMN (8 cols on lg)                 */}
        {/* ========================================================= */}
        <div className="lg:col-span-8 space-y-6">
          {/* Mobile Greeting Card (shown only on mobile, replacing fixed header greeting) */}
          <div className="md:hidden bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5 truncate">
                Olá, {userName}! <span className="inline-block">👋</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {user?.studyStreakDays ? `🔥 ${user.studyStreakDays} dias de sequência` : "Continue firme no seu propósito de aprovação."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-700 shrink-0 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
              title="Configurar prova e meta"
            >
              <span className="text-teal-600 font-extrabold">{examInfo.daysRemaining}d</span>
              <span className="text-slate-500 font-normal">p/ prova</span>
            </button>
          </div>

          {/* 1. HERO BANNER: Revalida INEP (Compact on mobile, dismissible or hidden after first visits) */}
          {(!hasSeenWelcomeHero || typeof window === "undefined") && (
            <div className="relative rounded-2xl bg-gradient-to-br from-[#EBF5F5] via-[#F2F8F8] to-[#E5F1F3] border border-teal-100/90 p-4 sm:p-7 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={dismissHero}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-teal-500/10 transition-colors cursor-pointer z-20"
                title="Ocultar boas-vindas"
                aria-label="Ocultar cartão de boas-vindas"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative z-10 max-w-md sm:max-w-lg space-y-2 sm:space-y-3 pr-6 sm:pr-0">
                <h2 className="text-base sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
                  Revalida INEP: <span className="text-teal-700 font-extrabold">seu objetivo,</span> nosso método.
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-2 sm:line-clamp-none">
                  Questões inéditas, conteúdo atualizado e inteligência para você estudar melhor e acertar mais.
                </p>
                <div className="pt-1 sm:pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("questions")}
                    className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132644] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs transition-all hover:translate-x-0.5 cursor-pointer"
                  >
                    <span>Explorar agora</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-400" />
                  </button>
                </div>
              </div>

              {/* Visual Vector Illustration in Hero (Desktop only) */}
              <div className="hidden sm:flex absolute right-4 bottom-2 md:right-8 md:bottom-3 items-end pointer-events-none select-none opacity-90 lg:opacity-100">
                <div className="relative w-48 h-36 flex items-center justify-center">
                  {/* Tablet Frame */}
                  <div className="absolute w-36 h-28 bg-slate-900 rounded-xl border-4 border-slate-700 shadow-md transform rotate-3 flex flex-col items-center justify-center p-2 text-center">
                    <div className="w-6 h-6 rounded-full bg-teal-500 text-slate-900 flex items-center justify-center font-black text-xs mb-1">
                      ✓
                    </div>
                    <span className="text-[9px] font-bold text-teal-300 uppercase tracking-wider">
                      Revalida
                    </span>
                    <span className="text-[11px] font-black text-white">INEP</span>
                  </div>
                  {/* Stethoscope Accent */}
                  <div className="absolute -left-2 -bottom-1 w-20 h-20 rounded-full border-4 border-teal-500/40 transform -rotate-12 pointer-events-none" />
                  {/* Book Stack */}
                  <div className="absolute right-0 bottom-0 w-24 h-12 bg-teal-800 rounded-md shadow-xs transform -rotate-6 border border-teal-600 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-teal-100 uppercase tracking-widest">
                      Diretrizes
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. PLANO DE ESTUDO DE HOJE */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shrink-0">
                  <Calendar className="w-4 h-4 text-teal-600" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  Plano de estudo de hoje
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStudyForMeOpen(true)}
                id="btn-edit-study-plan"
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shrink-0 flex items-center gap-1.5 transition-colors border border-slate-200/80 shadow-2xs whitespace-nowrap cursor-pointer min-h-[34px]"
              >
                <span>✏️</span>
                <span>Editar plano</span>
              </button>
            </div>

            {/* Task Rows: Single Column on Mobile */}
            <div className="space-y-3">
              {/* Row 1: Study Topic */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 hover:border-slate-300 transition-colors">
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100 mt-0.5 sm:mt-0">
                    <BookOpen className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug break-words">
                      Estudar tema: {topWeakness?.name || "Insuficiência Cardíaca"}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {topWeakness?.area ? topWeakness.area.replace(/_/g, " ") : "Clínica Médica"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-slate-200/50 sm:border-t-0 shrink-0">
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[11px] font-semibold text-slate-600">0/45 min</span>
                    <div className="w-24 sm:w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="w-1/4 h-full bg-teal-500 rounded-full" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (topWeakness?.area) {
                        setQuestionFilterArea(topWeakness.area);
                      }
                      setActiveTab("grandes-temas");
                    }}
                    className="px-4 py-1.5 rounded-xl bg-white hover:bg-teal-600 hover:text-white text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer min-h-[36px]"
                  >
                    Estudar
                  </button>
                </div>
              </div>

              {/* Row 2: Solve Questions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 hover:border-slate-300 transition-colors">
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100 mt-0.5 sm:mt-0">
                    <HelpCircle className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug break-words">
                      Resolver 20 questões
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Questões inéditas e oficiais INEP
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-slate-200/50 sm:border-t-0 shrink-0">
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[11px] font-semibold text-slate-600">0/20</span>
                    <div className="w-24 sm:w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="w-0 h-full bg-purple-500 rounded-full" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("questions")}
                    className="px-4 py-1.5 rounded-xl bg-white hover:bg-purple-600 hover:text-white text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer min-h-[36px]"
                  >
                    Resolver
                  </button>
                </div>
              </div>

              {/* Row 3: Flashcards */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 hover:border-slate-300 transition-colors">
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-100 mt-0.5 sm:mt-0">
                    <Layers className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug break-words">
                      Revisar 10 flashcards
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Revisão espaçada ativa (FSRS)
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-slate-200/50 sm:border-t-0 shrink-0">
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {dueFlashcards.length > 0 ? `0/${dueFlashcards.length}` : "0/10"}
                    </span>
                    <div className="w-24 sm:w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="w-1/3 h-full bg-orange-500 rounded-full" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("review")}
                    className="px-4 py-1.5 rounded-xl bg-white hover:bg-orange-600 hover:text-white text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer min-h-[36px]"
                  >
                    Revisar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3. ACESSO RÁPIDO */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Acesso rápido</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Questões */}
              <button
                type="button"
                onClick={() => {
                  setQuestionMode("STUDY");
                  setActiveTab("questions");
                }}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-400 hover:shadow-xs transition-all text-center group cursor-pointer"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                  Questões
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Banco completo</p>
              </button>

              {/* Simulados */}
              <button
                type="button"
                onClick={() => {
                  setQuestionMode("EXAM");
                  setActiveTab("questions");
                }}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-purple-400 hover:shadow-xs transition-all text-center group cursor-pointer"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                  Simulados
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Simule sua prova</p>
              </button>

              {/* Aulas */}
              <button
                type="button"
                onClick={() => setActiveTab("grandes-temas")}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-emerald-400 hover:shadow-xs transition-all text-center group cursor-pointer"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Tv className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Aulas
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Videoaulas</p>
              </button>

              {/* Flashcards */}
              <button
                type="button"
                onClick={() => setActiveTab("review")}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-orange-400 hover:shadow-xs transition-all text-center group cursor-pointer"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900 group-hover:text-orange-700 transition-colors">
                  Flashcards
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Revisão ativa</p>
              </button>

              {/* Estudo por Temas */}
              <button
                type="button"
                onClick={() => setActiveTab("grandes-temas")}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-sky-400 hover:shadow-xs transition-all text-center group cursor-pointer"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Target className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                  Estudo por Temas
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Grandes temas</p>
              </button>

              {/* Caderno */}
              <button
                type="button"
                onClick={() => setActiveTab("errors")}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-400 hover:shadow-xs transition-all text-center group cursor-pointer"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <BookMarked className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900 group-hover:text-slate-700 transition-colors">
                  Caderno
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Suas anotações</p>
              </button>
            </div>
          </div>

          {/* 4. CONTINUE ESTUDANDO */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Grandes Temas Prioritários</h3>
              <button
                type="button"
                onClick={() => setActiveTab("grandes-temas")}
                className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Ver todos</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {recentTopics.map((node, idx) => {
                const colors = [
                  { bg: "bg-slate-900", icon: "text-teal-400", bar: "bg-teal-500", IconComponent: Stethoscope },
                  { bg: "bg-[#0F223D]", icon: "text-emerald-400", bar: "bg-emerald-500", IconComponent: Target },
                  { bg: "bg-purple-900/90", icon: "text-purple-300", bar: "bg-purple-500", IconComponent: HelpCircle },
                ];
                const theme = colors[idx % colors.length];
                const mastery = node.userMastery ?? 0;

                return (
                  <div
                    key={node.id || idx}
                    onClick={() => {
                      if (node.area) {
                        setQuestionFilterArea(node.area);
                      }
                      setActiveTab("grandes-temas");
                    }}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-400 hover:shadow-xs transition-all flex items-center gap-3 cursor-pointer group"
                  >
                    <div className={`w-12 h-12 rounded-xl ${theme.bg} ${theme.icon} flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}>
                      <theme.IconComponent className={`w-6 h-6 ${theme.icon}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate group-hover:text-teal-700 transition-colors">
                        {node.name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {node.area ? node.area.replace(/_/g, " ") : "Medicina"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${theme.bar} rounded-full transition-all`}
                            style={{ width: `${mastery}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{mastery}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT SIDEBAR COLUMN (4 cols on lg)                      */}
        {/* ========================================================= */}
        <div className="lg:col-span-4 space-y-6">
          {/* 1. SEU PROGRESSO GERAL */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
            <h3 className="text-sm font-bold text-slate-900">Seu progresso geral</h3>

            <div className="flex items-center gap-5">
              {/* Radial Donut Progress Chart */}
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {/* Track */}
                  <path
                    className="text-slate-100"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Progress fill */}
                  <path
                    className="text-teal-600 transition-all duration-700 ease-out"
                    strokeDasharray={`${readinessScore}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-lg font-black text-slate-900 leading-none">
                    {readinessScore}%
                  </span>
                  <span className="text-[9px] font-semibold text-slate-400 mt-0.5">
                    de avanço
                  </span>
                </div>
              </div>

              {/* Stats Key Metric Rows */}
              <div className="flex-1 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <FileQuestion className="w-3.5 h-3.5 text-slate-400" />
                    Questões resolvidas
                  </span>
                  <span className="font-bold text-slate-900">{totalAttempts.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    Acertos
                  </span>
                  <span className="font-bold text-slate-900">{correctAttempts.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Horas de estudo
                  </span>
                  <span className="font-bold text-slate-900">{studyTimeFormatted}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Simulados realizados
                  </span>
                  <span className="font-bold text-slate-900">{examAttemptsCount}</span>
                </div>
              </div>
            </div>

            {/* View Full Performance Button */}
            <button
              type="button"
              onClick={() => setActiveTab("progress")}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-between transition-colors border border-slate-200/80 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-teal-600" />
                Ver desempenho completo
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* 2. PRÓXIMO SIMULADO */}
          <div className="bg-[#0B192C] text-white rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-teal-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Edição Alvo
                </span>
                <h4 className="text-sm font-bold text-white mt-0.5">
                  {user.targetEdition || "Revalida INEP 2026/2"}
                </h4>
              </div>
            </div>

            {/* Date & Time pills */}
            <div className="flex items-center gap-4 text-xs text-slate-300 pt-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span>
                  {examInfo?.examDate
                    ? new Date(examInfo.examDate + "T12:00:00").toLocaleDateString("pt-BR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "13 de Setembro, 2026"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>{examInfo?.daysRemaining ?? 0} dias restantes</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setQuestionMode("EXAM");
                setActiveTab("questions");
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <span>Acessar simulado</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3. CRONOGRAMA DE HOJE */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Cronograma de hoje</h3>
              <button
                type="button"
                onClick={() => setActiveTab("calendario-inteligente")}
                className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                Ver calendário
              </button>
            </div>

            {/* Timeline List */}
            <div className="space-y-3.5 text-xs">
              <div className="flex items-start gap-3">
                <span className="font-bold text-slate-600 w-10 shrink-0">08:00</span>
                <span className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                <div>
                  <p className="font-bold text-slate-900">
                    Estudar: {topWeakness?.name || "Pré-Eclâmpsia e Eclâmpsia"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {topWeakness?.area ? topWeakness.area.replace(/_/g, " ") : "Ginecologia e Obstetrícia"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="font-bold text-slate-600 w-10 shrink-0">10:00</span>
                <span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                <div>
                  <p className="font-bold text-slate-900">Resolver questões oficiais</p>
                  <p className="text-[11px] text-slate-400">20 questões INEP</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="font-bold text-slate-600 w-10 shrink-0">14:00</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div>
                  <p className="font-bold text-slate-900">Autópsia dos erros & lacunas</p>
                  <p className="text-[11px] text-slate-400">Caderno de Erros</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="font-bold text-slate-600 w-10 shrink-0">16:00</span>
                <span className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                <div>
                  <p className="font-bold text-slate-900">Revisão de flashcards</p>
                  <p className="text-[11px] text-slate-400">Repetição espaçada</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
