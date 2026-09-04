import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  ChevronDown,
  ChevronUp,
  Save,
  Clock,
  Play,
  X,
  History,
  Check,
  Calendar,
  Layers,
  ArrowUpDown,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { formatMedicalArea } from "../../utils/formatters";
import { MedicalArea } from "../../types";
import { SessionBuilderService, DEFAULT_SESSION_CONFIG } from "../../services/sessionBuilderService";
import { getAreaVisualTheme } from "../../config/areaThemes";
import {
  buildErrorCases,
  filterErrorCases,
  sortErrorCases,
  getQuestionAnswerProvenance,
  ErrorCase,
  ErrorNotebookStatusFilter,
  ErrorNotebookSortOption,
} from "../../services/errorNotebookService";

const INITIAL_VISIBLE_COUNT = 25;

export const ErrorNotebookView: React.FC = () => {
  const {
    attempts,
    questions,
    errorAutopsies,
    updateErrorAutopsyReflection,
    setActiveTab,
    setQuestionMode,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<ErrorNotebookStatusFilter>("PENDING");
  const [areaFilter, setAreaFilter] = useState<MedicalArea | "ALL">("ALL");
  const [yearFilter, setYearFilter] = useState<number | "ALL">("ALL");
  const [sortOption, setSortOption] = useState<ErrorNotebookSortOption>("NEWEST");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [historyOpenCaseId, setHistoryOpenCaseId] = useState<string | null>(null);
  const [reflectionTexts, setReflectionTexts] = useState<Record<string, string>>({});
  const [savedReflections, setSavedReflections] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_VISIBLE_COUNT);

  // 1. Build authoritative derived ErrorCases from attempts
  const allDerivedCases = useMemo(() => {
    return buildErrorCases(attempts, questions, errorAutopsies, reflectionTexts);
  }, [attempts, questions, errorAutopsies, reflectionTexts]);

  // Available exam years from error cases
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const ec of allDerivedCases) {
      if (ec.question.examYear) years.add(ec.question.examYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allDerivedCases]);

  // 2. Filter ErrorCases
  const filteredCases = useMemo(() => {
    return filterErrorCases(allDerivedCases, {
      statusFilter,
      areaFilter,
      yearFilter,
      searchQuery,
    });
  }, [allDerivedCases, statusFilter, areaFilter, yearFilter, searchQuery]);

  // 3. Sort ErrorCases
  const sortedCases = useMemo(() => {
    return sortErrorCases(filteredCases, sortOption);
  }, [filteredCases, sortOption]);

  // Visible sliced list
  const visibleCases = useMemo(() => {
    return sortedCases.slice(0, visibleCount);
  }, [sortedCases, visibleCount]);

  // KPI calculations
  const totalUniqueCases = allDerivedCases.length;
  const pendingCasesCount = allDerivedCases.filter((ec) => !ec.isRemediated).length;
  const remediatedCasesCount = allDerivedCases.filter((ec) => ec.isRemediated).length;
  const recurrentCasesCount = allDerivedCases.filter((ec) => ec.wrongAttemptCount >= 2).length;

  // Handle Save Reflection
  const handleSaveReflection = async (errorCase: ErrorCase, text: string) => {
    const { questionId, latestWrongAttempt } = errorCase;
    setReflectionTexts((prev) => ({
      ...prev,
      [latestWrongAttempt.id]: text,
      [questionId]: text,
    }));

    if (updateErrorAutopsyReflection) {
      const autopsy = errorAutopsies?.find(
        (ea) => ea.questionId === questionId || ea.id === latestWrongAttempt.id
      );
      if (autopsy) {
        await updateErrorAutopsyReflection(autopsy.id, autopsy.resolutionStatus, text);
      }
    }

    setSavedReflections((prev) => new Set(prev).add(questionId));
    setTimeout(() => {
      setSavedReflections((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }, 2500);
  };

  // Start Batch Training Session with all filtered error questions
  const handleTrainErrorQuestions = (casesToTrain = filteredCases) => {
    const targetQIds = Array.from(new Set(casesToTrain.map((ec) => ec.questionId)));
    if (targetQIds.length === 0) return;

    const config = {
      ...DEFAULT_SESSION_CONFIG,
      title: "Treino de Caderno de Erros",
      mode: "ESTUDO" as const,
      objective: "TREINO_ERROS" as any,
      quantity: targetQIds.length,
      feedbackMode: "IMMEDIATE" as const,
      timerMode: "FREE" as const,
    };

    const newSession = {
      id: `error-session-${Date.now()}`,
      title: config.title,
      subtitle: `${targetQIds.length} questões do Caderno de Erros`,
      mode: "ESTUDO" as const,
      config,
      questionIds: targetQIds,
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    SessionBuilderService.saveActiveSession(newSession);
    setQuestionMode("EXAM");
    setActiveTab("praticar-questoes");
  };

  // Retrain single question
  const handleRetrainSingleQuestion = (questionId: string) => {
    const config = {
      ...DEFAULT_SESSION_CONFIG,
      title: "Revisão de Questão",
      mode: "SIMULADO" as const,
      quantity: 1,
      feedbackMode: "IMMEDIATE" as const,
      timerMode: "FREE" as const,
    };

    const newSession = {
      id: `single-retrain-${Date.now()}`,
      title: "Revisão de Questão",
      subtitle: "1 questão para fixação e remediação",
      mode: "SIMULADO" as const,
      config,
      questionIds: [questionId],
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    SessionBuilderService.saveActiveSession(newSession);
    setQuestionMode("EXAM");
    setActiveTab("praticar-questoes");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* 1. CABEÇALHO COMPACTO & NÃO PUNITIVO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 px-2 py-0.5 rounded-md">
              Revisão Ativa
            </span>
            <span className="text-xs text-slate-400">
              {pendingCasesCount} {pendingCasesCount === 1 ? "caso para revisar" : "casos para revisar"}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            Caderno de Erros
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Revise os erros que ainda precisam ser corrigidos e consolide lacunas clínicas.
          </p>
        </div>

        {pendingCasesCount > 0 && (
          <button
            type="button"
            onClick={() => handleTrainErrorQuestions(allDerivedCases.filter((ec) => !ec.isRemediated))}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs transition-all hover:scale-[1.02] cursor-pointer shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>TREINAR {pendingCasesCount} ERROS PENDENTES</span>
          </button>
        )}
      </div>

      {/* 2. KPIS DE REMEDIAÇÃO (3 Indicadores Focados) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => setStatusFilter("PENDING")}
          className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all cursor-pointer shadow-xs space-y-1 ${
            statusFilter === "PENDING"
              ? "border-rose-500 ring-2 ring-rose-500/10"
              : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Para Revisar
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-mono block">
            {pendingCasesCount}
          </span>
          <p className="text-xs text-slate-400">
            Casos ainda não superados em novos testes
          </p>
        </div>

        <div
          onClick={() => setStatusFilter("REMEDIATED")}
          className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all cursor-pointer shadow-xs space-y-1 ${
            statusFilter === "REMEDIATED"
              ? "border-emerald-500 ring-2 ring-emerald-500/10"
              : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Superados
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-mono block">
            {remediatedCasesCount}
          </span>
          <p className="text-xs text-slate-400">
            Acertados em revisões posteriores
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Questões Recorrentes
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-mono block">
            {recurrentCasesCount}
          </span>
          <p className="text-xs text-slate-400">
            Questões erradas 2 ou mais vezes
          </p>
        </div>
      </div>

      {/* 3. FILTROS, ORDENAÇÃO & BUSCA */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
            {[
              { id: "PENDING" as const, label: `Para Revisar (${pendingCasesCount})` },
              { id: "REMEDIATED" as const, label: `Superados (${remediatedCasesCount})` },
              { id: "ALL" as const, label: `Todos (${totalUniqueCases})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Sort Row */}
          <div className="flex items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                placeholder="Buscar por tema, subtema ou enunciado..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Selector */}
            <div className="relative shrink-0">
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as ErrorNotebookSortOption)}
                aria-label="Ordenar erros por"
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              >
                <option value="NEWEST">Mais recentes</option>
                <option value="OLDEST">Mais antigas</option>
                <option value="MOST_ERRORS">Maior incidência</option>
              </select>
            </div>
          </div>
        </div>

        {/* Filter Chips: Area & Year */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1 shrink-0">
            Área:
          </span>
          {[
            { id: "ALL" as const, label: "Todas" },
            { id: "CLINICA_MEDICA" as const, label: "Clínica Médica" },
            { id: "CIRURGIA_GERAL" as const, label: "Cirurgia Geral" },
            { id: "PEDIATRIA" as const, label: "Pediatria" },
            { id: "GINECOLOGIA_OBSTETRICIA" as const, label: "Ginecologia & Obstetrícia" },
            { id: "MEDICINA_FAMILIA_COMUNIDADE" as const, label: "Preventiva / SUS" },
          ].map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => {
                setAreaFilter(area.id);
                setVisibleCount(INITIAL_VISIBLE_COUNT);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                areaFilter === area.id
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold shadow-2xs"
                  : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-750"
              }`}
            >
              {area.label}
            </button>
          ))}

          {availableYears.length > 1 && (
            <>
              <span className="text-[11px] font-bold text-slate-400 uppercase ml-2 mr-1 shrink-0">
                Ano:
              </span>
              <button
                type="button"
                onClick={() => setYearFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  yearFilter === "ALL"
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                }`}
              >
                Todos
              </button>
              {availableYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setYearFilter(year)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    yearFilter === year
                      ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold shadow-2xs"
                      : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                  }`}
                >
                  {year}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 4. LISTA DE CASOS DERIVADOS / ESTADO VAZIO */}
      {sortedCases.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {totalUniqueCases === 0
                ? "Nenhum erro registrado no Caderno de Erros"
                : statusFilter === "PENDING"
                ? "Nenhum erro pendente para revisar"
                : statusFilter === "REMEDIATED"
                ? "Nenhum erro superado ainda"
                : "Nenhum erro encontrado com os filtros selecionados"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              {totalUniqueCases === 0
                ? "Continue praticando! Conforme você responder simulados e treinos, os pontos que merecem revisão aparecerão organizados aqui."
                : statusFilter === "PENDING"
                ? "Excelente! Todos os erros anteriores foram superados ou você não possui casos pendentes com os filtros atuais."
                : statusFilter === "REMEDIATED"
                ? "Conforme você refizer as questões erradas e acertar em novos treinos, elas aparecerão como superadas aqui."
                : "Tente redefinir a busca ou selecionar outra área médica."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("praticar-questoes")}
            className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold text-xs shadow-2xs transition-all cursor-pointer"
          >
            Resolver Questões
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleCases.map((ec) => {
            const q = ec.question;
            const theme = getAreaVisualTheme(q.area);
            const provenance = getQuestionAnswerProvenance(q);
            const isExpanded = expandedCaseId === ec.questionId;
            const isHistoryOpen = historyOpenCaseId === ec.questionId;
            const isSaved = savedReflections.has(ec.questionId);
            const correctOption = q.options?.find((o) => o.isCorrect);

            return (
              <div
                key={ec.questionId}
                className={`rounded-2xl border bg-white dark:bg-slate-900 shadow-xs transition-all overflow-hidden border-l-4 ${theme.borderLeft} ${
                  isExpanded
                    ? "border-slate-300 dark:border-slate-700"
                    : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300"
                }`}
              >
                {/* Compact Consolidated Card Header */}
                <div
                  onClick={() => setExpandedCaseId(isExpanded ? null : ec.questionId)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    {/* Identification Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                        {q.code || `Q${q.originalNumber || 1}`}
                      </span>

                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${theme.badgeBg} ${theme.badgeText} dark:bg-opacity-20`}>
                        {formatMedicalArea(q.area)}
                      </span>

                      {q.examEdition && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {q.examEdition}
                        </span>
                      )}

                      {/* Recurrence Badge (Factual: how many times user failed this question) */}
                      {ec.wrongAttemptCount > 1 && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Errou {ec.wrongAttemptCount} vezes
                        </span>
                      )}

                      {/* Topic Recurrence Warning */}
                      {ec.recurrentTopicErrorCount >= 2 && ec.wrongAttemptCount === 1 && (
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md">
                          {ec.recurrentTopicErrorCount} erros no tema
                        </span>
                      )}

                      {/* Status Badge */}
                      {ec.isRemediated ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Superado
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-800 bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 px-2 py-0.5 rounded-md">
                          Para Revisar
                        </span>
                      )}
                    </div>

                    {/* Topic Title */}
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {q.topic} {q.subtopic ? `• ${q.subtopic}` : ""}
                    </h4>

                    {/* Enunciado curto / Scanability snippet */}
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                      {q.clinicalCase}
                    </p>
                  </div>

                  {/* Right Side: Answer Comparison & Expand Indicator */}
                  <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5 text-xs text-rose-700 dark:text-rose-400 font-bold">
                        <span>Marcou {ec.latestWrongAttempt.selectedOption}</span>
                        <span className="text-rose-500 font-bold">✕</span>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 text-[11px] text-teal-700 dark:text-teal-400 font-semibold">
                        <span>{provenance.compactLabel}: {provenance.isAnnulled ? "Anulada" : (q.correctAnswer || correctOption?.id || "-")}</span>
                        <span className="text-teal-600 font-bold">✓</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={isExpanded ? "Recolher detalhes" : "Expandir detalhes"}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-5 bg-slate-50/70 dark:bg-slate-850 border-t border-slate-200/80 dark:border-slate-800 space-y-4 text-xs">
                    {/* Caso Clínico Completo */}
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Caso Clínico Integral
                      </span>
                      <p className="text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {q.clinicalCase}
                      </p>
                    </div>

                    {/* Resposta Marcada vs Gabarito Oficial / Resposta Correta (Semantic & Accessible) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-3.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-rose-200 dark:bg-rose-900/80 text-rose-800 dark:text-rose-300 flex items-center justify-center font-bold text-[10px]">
                            ✕
                          </span>
                          <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase">
                            Sua Resposta Registrada
                          </span>
                        </div>
                        <span className="text-sm font-bold text-rose-900 dark:text-rose-200 mt-1 block">
                          Alternativa {ec.latestWrongAttempt.selectedOption}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900/60">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-teal-200 dark:bg-teal-900/80 text-teal-800 dark:text-teal-300 flex items-center justify-center font-bold text-[10px]">
                            ✓
                          </span>
                          <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 uppercase">
                            {provenance.detailedLabel}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-teal-900 dark:text-teal-200 mt-1 block">
                          {provenance.displayAnswerText}
                        </span>
                      </div>
                    </div>

                    {/* Comentário Editorial StaziaMed */}
                    {correctOption?.explanation && (
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                          Comentário Editorial StaziaMed
                        </span>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          {correctOption.explanation}
                        </p>
                      </div>
                    )}

                    {/* Reflexão do Aluno: POR QUE EU ERREI? */}
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                          Por que eu errei esta questão? (Reflexão Pessoal)
                        </label>
                        {isSaved && (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 dark:bg-teal-950/50 dark:text-teal-400 px-2 py-0.5 rounded-md">
                            ✓ Salvo com sucesso
                          </span>
                        )}
                      </div>

                      <textarea
                        rows={2}
                        value={ec.reflection}
                        onChange={(e) => {
                          const val = e.target.value;
                          setReflectionTexts((prev) => ({
                            ...prev,
                            [ec.latestWrongAttempt.id]: val,
                            [ec.questionId]: val,
                          }));
                        }}
                        placeholder="Ex: Confundi os critérios de internação para pneumonia; não me atentei à frequência respiratória no enunciado."
                        className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                      />

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveReflection(ec, ec.reflection)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Reflexão</span>
                        </button>
                      </div>
                    </div>

                    {/* Histórico de Tentativas Secundário (se houver mais de 1 tentativa) */}
                    {ec.allAttempts.length > 1 && (
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryOpenCaseId(isHistoryOpen ? null : ec.questionId)
                          }
                          className="flex items-center justify-between w-full text-left font-bold text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <History className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              Histórico de Tentativas ({ec.allAttempts.length} tentativas registradas)
                            </span>
                          </div>
                          <span className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline">
                            {isHistoryOpen ? "Ocultar histórico" : "Ver histórico"}
                          </span>
                        </button>

                        {isHistoryOpen && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                            {ec.allAttempts.map((att, idx) => {
                              const isAttCorrect = att.isCorrect;
                              const attDate = new Date(att.timestamp).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                              return (
                                <div
                                  key={att.id || idx}
                                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`w-2 h-2 rounded-full ${
                                        isAttCorrect ? "bg-emerald-500" : "bg-rose-500"
                                      }`}
                                    />
                                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                                      {attDate}
                                    </span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                                      Modo {att.mode || "ESTUDO"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-600 dark:text-slate-400">
                                      Marcou <strong>{att.selectedOption}</strong>
                                    </span>
                                    <span
                                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                        isAttCorrect
                                          ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                                          : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300"
                                      }`}
                                    >
                                      {isAttCorrect ? "Acertou" : "Errou"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ações do Card */}
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">
                        Último erro em{" "}
                        {new Date(ec.lastErrorAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRetrainSingleQuestion(q.id)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Refazer Esta Questão</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Progressive Presentation Button */}
          {sortedCases.length > visibleCount && (
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + INITIAL_VISIBLE_COUNT)}
                className="px-6 py-2.5 rounded-xl bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                Mostrar mais ({sortedCases.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
