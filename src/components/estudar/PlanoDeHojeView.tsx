import React from "react";
import {
  CalendarCheck,
  BookOpen,
  HelpCircle,
  Layers,
  Clock,
  CheckCircle2,
  ArrowRight,
  Edit3,
  Target,
  Sparkles,
} from "lucide-react";
import { useApp } from "../../context/AppContext";

export const PlanoDeHojeView: React.FC = () => {
  const {
    todayMission,
    knowledgeGraph,
    flashcards,
    attempts,
    setActiveTab,
    setQuestionMode,
    setQuestionFilterArea,
    setIsStudyForMeOpen,
  } = useApp();

  const topWeakness =
    Array.isArray(knowledgeGraph) && knowledgeGraph.length > 0
      ? [...knowledgeGraph].sort(
          (a, b) => (b?.expectedPointGain ?? 0) - (a?.expectedPointGain ?? 0)
        )[0]
      : null;

  const dueFlashcards = (flashcards || []).filter(
    (f) => new Date(f.dueDate) <= new Date()
  );

  const focusTopic =
    todayMission?.focusTopic || topWeakness?.name || "Pré-Eclâmpsia e Eclâmpsia";
  const targetArea =
    todayMission?.targetArea || topWeakness?.area || "GINECOLOGIA_OBSTETRICIA";
  const formattedArea = targetArea.replace(/_/g, " ");

  const studyTask = todayMission?.tasks?.find((t) => t.type === "REVIEW");
  const questionsTask = todayMission?.tasks?.find((t) => t.type === "QUESTIONS");
  const flashcardsTask = todayMission?.tasks?.find(
    (t) => t.type === "FLASHCARDS" || t.type === "ERROR_AUTOPSY"
  );

  const tasks = todayMission?.tasks || [
    { type: "REVIEW", description: `Estudo: ${focusTopic}`, minutes: 30, completed: false },
    { type: "QUESTIONS", description: "Resolver 20 questões oficiais", count: 20, minutes: 40, completed: false },
    { type: "FLASHCARDS", description: "Revisar flashcards pendentes", count: dueFlashcards.length || 10, minutes: 15, completed: false },
  ];

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Card */}
      <div className="bg-gradient-to-br from-[#0B192C] via-[#10243E] to-[#0A1A2F] text-white rounded-3xl p-6 sm:p-8 shadow-md border border-[#1B355A] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center shrink-0">
                <CalendarCheck className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest text-teal-400 uppercase block">
                  CICLO DIÁRIO RECOMENDADO
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {todayMission?.title || "Plano de Estudo de Hoje"}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsStudyForMeOpen(true)}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Personalizar plano</span>
            </button>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
            {todayMission?.rationale ||
              "Este ciclo foi otimizado para preencher lacunas nos temas de maior incidência histórica do Revalida INEP."}
          </p>

          {/* Progress Bar */}
          <div className="pt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Progresso de Hoje</span>
              <span className="font-bold text-teal-400">
                {completedTasks} de {totalTasks} tarefas concluídas ({progressPercent}%)
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sequential 3-Step Study Cycle */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">
          Etapas do Ciclo de Hoje
        </h3>

        {/* Step 1: ESTUDAR */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center font-bold text-sm shrink-0">
              1
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider text-teal-700 uppercase bg-teal-50 px-2 py-0.5 rounded-md">
                  ESTUDAR
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {studyTask?.minutes || 30} min
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2">
                {focusTopic}
              </h4>
              <p className="text-xs text-slate-500 capitalize">
                {formattedArea}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (targetArea) setQuestionFilterArea(targetArea as any);
              setActiveTab("estudar-grandes-temas");
            }}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <span>Estudar tema</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step 2: PRATICAR */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center font-bold text-sm shrink-0">
              2
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider text-purple-700 uppercase bg-purple-50 px-2 py-0.5 rounded-md">
                  PRATICAR
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {questionsTask?.minutes || 40} min
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2">
                Resolver {questionsTask?.count || 20} questões oficiais
              </h4>
              <p className="text-xs text-slate-500">
                Questões comentadas com distratores mapeados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setQuestionMode("STUDY");
              if (targetArea) setQuestionFilterArea(targetArea as any);
              setActiveTab("praticar-questoes");
            }}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <span>Resolver questões</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step 3: REVISAR */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-bold text-sm shrink-0">
              3
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider text-amber-700 uppercase bg-amber-50 px-2 py-0.5 rounded-md">
                  REVISAR
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {flashcardsTask?.minutes || 15} min
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2">
                Revisar {flashcardsTask?.count || (dueFlashcards.length || 10)} flashcards
              </h4>
              <p className="text-xs text-slate-500">
                Algoritmo FSRS de repetição espaçada ativa
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("revisar-flashcards")}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <span>Revisar flashcards</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
