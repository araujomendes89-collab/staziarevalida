import React, { useState, useMemo } from "react";
import {
  Search,
  SlidersHorizontal,
  Play,
  RotateCcw,
  CheckCircle2,
  HelpCircle,
  X,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Activity,
  HeartPulse,
  Baby,
  ShieldCheck,
  ArrowRight,
  Filter,
  Check,
  Layers,
} from "lucide-react";
import {
  MedicalArea,
  Question,
  QuestionAttempt,
  KnowledgeNode,
  UserProfile,
  ActiveTrainingSession,
  QuestionSessionConfig,
} from "../../types";
import {
  SessionBuilderService,
  DEFAULT_SESSION_CONFIG,
} from "../../services/sessionBuilderService";

interface StudentQuestionsGeneratorViewProps {
  user: UserProfile;
  questions: Question[];
  attempts: QuestionAttempt[];
  knowledgeGraph: KnowledgeNode[];
  activeSession: ActiveTrainingSession | null;
  onResumeSession: () => void;
  onDiscardSession: () => void;
  onStartDirectSession: (config: QuestionSessionConfig) => void;
  onOpenExamSelector?: () => void;
  onOpenPrintSimulado?: () => void;
}

const MEDICAL_AREAS_CONFIG: {
  id: MedicalArea;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
}[] = [
  {
    id: "CLINICA_MEDICA",
    label: "Clínica Médica",
    shortLabel: "Clínica Médica",
    icon: Stethoscope,
  },
  {
    id: "CIRURGIA_GERAL",
    label: "Cirurgia Geral",
    shortLabel: "Cirurgia",
    icon: Activity,
  },
  {
    id: "PEDIATRIA",
    label: "Pediatria",
    shortLabel: "Pediatria",
    icon: Baby,
  },
  {
    id: "GINECOLOGIA_OBSTETRICIA",
    label: "Ginecologia e Obstetrícia",
    shortLabel: "Gineco & Obstetrícia",
    icon: HeartPulse,
  },
  {
    id: "MEDICINA_FAMILIA_COMUNIDADE",
    label: "Medicina Preventiva / MFC",
    shortLabel: "Preventiva / MFC",
    icon: ShieldCheck,
  },
];

const AVAILABLE_YEARS = [
  { id: "ALL", label: "Todos os Anos" },
  { id: "2026", label: "2026" },
  { id: "2025", label: "2025" },
  { id: "2024", label: "2024" },
  { id: "2023", label: "2023" },
  { id: "2022", label: "2022" },
  { id: "2021", label: "2021" },
  { id: "2020", label: "2020" },
];

const POPULAR_THEMES = [
  "Pré-Eclâmpsia",
  "Síndrome Coronariana",
  "Sepse",
  "Pneumonia",
  "Asma",
  "Diabetes Mellitus",
  "Hipertensão",
  "Tuberculose",
  "Apendicite Aguda",
  "Trauma Abdominal",
];

const EXAM_OPTIONS = [
  { id: "ALL", label: "Todas as Provas Oficiais" },
  { id: "2026/1", label: "Revalida INEP 2026/1" },
  { id: "2025/2", label: "Revalida INEP 2025/2" },
  { id: "2025/1", label: "Revalida INEP 2025/1" },
  { id: "2024/2", label: "Revalida INEP 2024/2" },
  { id: "2024/1", label: "Revalida INEP 2024/1" },
  { id: "2023/2", label: "Revalida INEP 2023/2" },
  { id: "2023/1", label: "Revalida INEP 2023/1" },
  { id: "2022/2", label: "Revalida INEP 2022/2" },
  { id: "2022/1", label: "Revalida INEP 2022/1" },
  { id: "2021", label: "Revalida INEP 2021" },
  { id: "2020", label: "Revalida INEP 2020" },
  { id: "ENAMED", label: "ENAMED 2025" },
];

const QUANTITY_PRESETS = [10, 20, 30, 50];

export const StudentQuestionsGeneratorView: React.FC<
  StudentQuestionsGeneratorViewProps
> = ({
  user,
  questions,
  attempts,
  knowledgeGraph,
  activeSession,
  onResumeSession,
  onDiscardSession,
  onStartDirectSession,
}) => {
  // 1. Filter States
  const [selectedArea, setSelectedArea] = useState<MedicalArea | "ALL">("ALL");
  const [topicSearch, setTopicSearch] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<string>("ALL");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");

  // Advanced Filters State
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [onlyWithComments, setOnlyWithComments] = useState<boolean>(true);
  const [onlyUnanswered, setOnlyUnanswered] = useState<boolean>(false);
  const [onlyWrong, setOnlyWrong] = useState<boolean>(false);
  const [onlyDiscursive, setOnlyDiscursive] = useState<boolean>(false);
  const [studyMode, setStudyMode] = useState<"ESTUDO" | "SIMULADO">("ESTUDO");

  // 2. Quantity
  const [questionCount, setQuestionCount] = useState<number>(20);

  // Statistics from actual in-memory database
  const totalQuestionsInBank = questions.length;
  const answeredCount = useMemo(() => {
    return new Set(attempts.map((a) => a.questionId)).size;
  }, [attempts]);

  // Questions count per area
  const questionsCountPerArea = useMemo(() => {
    const map: Record<string, number> = {};
    for (const area of MEDICAL_AREAS_CONFIG) {
      map[area.id] = questions.filter((q) => q.area === area.id).length;
    }
    return map;
  }, [questions]);

  // Active configuration for SessionBuilderService
  const currentConfig = useMemo<QuestionSessionConfig>(() => {
    return {
      ...DEFAULT_SESSION_CONFIG,
      mode: studyMode === "SIMULADO" ? "SIMULADO" : "RAPIDO",
      title: topicSearch.trim()
        ? `Treino: ${topicSearch.trim()}`
        : selectedArea !== "ALL"
        ? `Treino: ${
            MEDICAL_AREAS_CONFIG.find((a) => a.id === selectedArea)?.label ||
            "Área Médica"
          }`
        : "Treino Personalizado de Questões",
      objective: onlyWrong ? "REVISAO_ERROS" : "TREINO_LIVRE",
      areas: selectedArea === "ALL" ? ["ALL"] : [selectedArea],
      topics: topicSearch.trim() ? [topicSearch.trim()] : [],
      years: selectedYear === "ALL" ? ["ALL"] : [parseInt(selectedYear)],
      examEditionId: selectedExam !== "ALL" ? selectedExam : undefined,
      quantity: questionCount,
      feedbackMode: studyMode === "SIMULADO" ? "END_OF_SESSION" : "IMMEDIATE",
      timerMode: studyMode === "SIMULADO" ? "EXAM_STRICT" : "FREE",
      showComments: onlyWithComments,
      smartFilters: {
        ...DEFAULT_SESSION_CONFIG.smartFilters,
        onlyUnanswered,
        onlyWrong,
        onlyWithComments,
        onlyDiscursive,
      },
    };
  }, [
    studyMode,
    topicSearch,
    selectedArea,
    onlyWrong,
    selectedYear,
    selectedExam,
    questionCount,
    onlyWithComments,
    onlyUnanswered,
    onlyDiscursive,
  ]);

  // Real-time matching questions from the actual database
  const matchingQuestions = useMemo(() => {
    return SessionBuilderService.filterQuestions(
      currentConfig,
      questions,
      attempts,
      knowledgeGraph
    );
  }, [currentConfig, questions, attempts, knowledgeGraph]);

  const effectiveCount = Math.min(questionCount, matchingQuestions.length);
  const estimatedTimeMinutes = Math.ceil(effectiveCount * 2);

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedArea("ALL");
    setTopicSearch("");
    setSelectedExam("ALL");
    setSelectedYear("ALL");
    setOnlyWithComments(true);
    setOnlyUnanswered(false);
    setOnlyWrong(false);
    setOnlyDiscursive(false);
    setStudyMode("ESTUDO");
    setQuestionCount(20);
  };

  // Active filters list
  const activeFilterChips = useMemo(() => {
    const chips: { id: string; label: string; onRemove: () => void }[] = [];

    if (selectedArea !== "ALL") {
      const conf = MEDICAL_AREAS_CONFIG.find((c) => c.id === selectedArea);
      if (conf) {
        chips.push({
          id: `area-${selectedArea}`,
          label: conf.label,
          onRemove: () => setSelectedArea("ALL"),
        });
      }
    }

    if (topicSearch.trim()) {
      chips.push({
        id: "topic",
        label: `Tema: ${topicSearch.trim()}`,
        onRemove: () => setTopicSearch(""),
      });
    }

    if (selectedExam !== "ALL") {
      const examLabel = EXAM_OPTIONS.find((e) => e.id === selectedExam)?.label || selectedExam;
      chips.push({
        id: "exam",
        label: `Prova: ${examLabel}`,
        onRemove: () => setSelectedExam("ALL"),
      });
    }

    if (selectedYear !== "ALL") {
      chips.push({
        id: "year",
        label: `Ano: ${selectedYear}`,
        onRemove: () => setSelectedYear("ALL"),
      });
    }

    if (onlyWrong) {
      chips.push({
        id: "wrong",
        label: "Apenas erros anteriores",
        onRemove: () => setOnlyWrong(false),
      });
    }

    if (onlyUnanswered) {
      chips.push({
        id: "unanswered",
        label: "Apenas não resolvidas",
        onRemove: () => setOnlyUnanswered(false),
      });
    }

    if (onlyDiscursive) {
      chips.push({
        id: "discursive",
        label: "Apenas discursivas",
        onRemove: () => setOnlyDiscursive(false),
      });
    }

    return chips;
  }, [
    selectedArea,
    topicSearch,
    selectedExam,
    selectedYear,
    onlyWrong,
    onlyUnanswered,
    onlyDiscursive,
  ]);

  // Start Session handler
  const handleStartTreino = () => {
    if (matchingQuestions.length === 0) return;
    onStartDirectSession(currentConfig);
  };

  const hasActiveSession = Boolean(activeSession && !activeSession.isCompleted);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Banco de Questões
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Monte seu treino com questões do Revalida.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 shrink-0 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <span className="font-bold text-slate-900">
            {totalQuestionsInBank.toLocaleString("pt-BR")} questões disponíveis
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">{answeredCount} resolvidas</span>
        </div>
      </div>

      {/* 2. SESSÃO EM ANDAMENTO (Se houver) */}
      {hasActiveSession && activeSession && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                Sessão em andamento: {activeSession.title}
              </p>
              <p className="text-[11px] text-amber-700">
                Questão {activeSession.currentIndex + 1} de{" "}
                {activeSession.questionIds.length} · Progresso salvo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onDiscardSession}
              className="px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={onResumeSession}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Continuar Sessão
            </button>
          </div>
        </div>
      )}

      {/* 3. CARD PRINCIPAL DE CONFIGURAÇÃO DO TREINO */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-xs space-y-6">
        {/* BUSCA POR TEMA OU ASSUNTO */}
        <div className="space-y-2">
          <label
            htmlFor="topic-search-input"
            className="text-xs font-bold text-slate-700 uppercase tracking-wider block"
          >
            Buscar Tema ou Assunto
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              id="topic-search-input"
              type="text"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
              placeholder="Buscar tema ou assunto (ex: Asma, sepse, pré-eclâmpsia...)"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
            />
            {topicSearch && (
              <button
                type="button"
                onClick={() => setTopicSearch("")}
                className="absolute right-3 top-3 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sugestões Rápidas de Tema */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[11px] text-slate-400 mr-1">Sugestões:</span>
            {POPULAR_THEMES.map((theme) => {
              const isActive =
                topicSearch.toLowerCase().trim() === theme.toLowerCase();
              return (
                <button
                  key={theme}
                  type="button"
                  onClick={() => setTopicSearch(isActive ? "" : theme)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    isActive
                      ? "bg-teal-50 text-teal-700 border border-teal-200 font-bold"
                      : "bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200/70"
                  }`}
                >
                  {theme}
                </button>
              );
            })}
          </div>
        </div>

        {/* GRANDE ÁREA */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            Grande Área
          </label>

          {/* Seletores de Grande Área */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Botão [ Todas ] */}
            <button
              type="button"
              onClick={() => setSelectedArea("ALL")}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                selectedArea === "ALL"
                  ? "bg-teal-600 text-white border-teal-600 shadow-xs font-bold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <span className="text-xs font-bold block">Todas</span>
              <span className={`text-[10px] block ${selectedArea === "ALL" ? "text-teal-100" : "text-slate-400"}`}>
                {totalQuestionsInBank} q.
              </span>
            </button>

            {/* 5 Áreas Médicas */}
            {MEDICAL_AREAS_CONFIG.map((area) => {
              const isSelected = selectedArea === area.id;
              const count = questionsCountPerArea[area.id] || 0;
              const Icon = area.icon;

              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedArea(area.id)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    isSelected
                      ? "bg-teal-600 text-white border-teal-600 shadow-xs font-bold"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-0.5 ${isSelected ? "text-white" : "text-slate-400"}`} />
                  <span className="text-xs font-bold block leading-tight">
                    {area.shortLabel}
                  </span>
                  <span className={`text-[10px] block ${isSelected ? "text-teal-100" : "text-slate-400"}`}>
                    {count} q.
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PROVA / EDIÇÃO */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label
            htmlFor="exam-select-dropdown"
            className="text-xs font-bold text-slate-700 uppercase tracking-wider block"
          >
            Prova / Edição
          </label>
          <div className="max-w-md">
            <select
              id="exam-select-dropdown"
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:outline-none focus:border-teal-500 transition-all cursor-pointer"
            >
              {EXAM_OPTIONS.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* FILTROS AVANÇADOS (Accordion Colapsável) */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <button
            type="button"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="flex items-center justify-between w-full text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
              Filtros Avançados
            </span>
            {isAdvancedOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isAdvancedOpen && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 animate-in fade-in duration-200">
              {/* Ano da Prova */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Ano da Prova
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {AVAILABLE_YEARS.map((y) => {
                    const isSelected = selectedYear === y.id;
                    return (
                      <button
                        key={y.id}
                        type="button"
                        onClick={() => setSelectedYear(y.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-teal-600 text-white font-bold shadow-2xs"
                            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                        }`}
                      >
                        {y.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Toggles de Filtros Especiais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                {/* Apenas com comentários */}
                <label className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-xs text-slate-700 font-medium">
                    Apenas com gabarito comentado
                  </span>
                  <input
                    type="checkbox"
                    checked={onlyWithComments}
                    onChange={(e) => setOnlyWithComments(e.target.checked)}
                    className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
                  />
                </label>

                {/* Apenas não resolvidas */}
                <label className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-xs text-slate-700 font-medium">
                    Apenas não resolvidas
                  </span>
                  <input
                    type="checkbox"
                    checked={onlyUnanswered}
                    onChange={(e) => setOnlyUnanswered(e.target.checked)}
                    className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
                  />
                </label>

                {/* Apenas erros anteriores */}
                <label className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-xs text-slate-700 font-medium">
                    Apenas erros anteriores
                  </span>
                  <input
                    type="checkbox"
                    checked={onlyWrong}
                    onChange={(e) => setOnlyWrong(e.target.checked)}
                    className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
                  />
                </label>

                {/* Apenas discursivas */}
                <label className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-xs text-slate-700 font-medium">
                    Apenas discursivas
                  </span>
                  <input
                    type="checkbox"
                    checked={onlyDiscursive}
                    onChange={(e) => setOnlyDiscursive(e.target.checked)}
                    className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
                  />
                </label>
              </div>

              {/* Modo de Feedback */}
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-xs text-slate-700 font-medium">
                  Modo de Feedback
                </span>
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setStudyMode("ESTUDO")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      studyMode === "ESTUDO"
                        ? "bg-teal-600 text-white font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Imediato
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudyMode("SIMULADO")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      studyMode === "SIMULADO"
                        ? "bg-teal-600 text-white font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    No final
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* QUANTIDADE DE QUESTÕES */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Quantidade de Questões
            </label>
            <span className="text-xs font-bold text-teal-700">
              {questionCount} questões selecionadas
            </span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-2">
            {QUANTITY_PRESETS.map((count) => {
              const isSelected = questionCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>

        {/* FILTROS ATIVOS CHIPS (Se houver filtros aplicados) */}
        {activeFilterChips.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Filtros Ativos ({activeFilterChips.length})
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
              >
                Limpar todos os filtros
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs border border-slate-200"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="p-0.5 hover:text-rose-600 cursor-pointer"
                    title="Remover filtro"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ESTADO 0 RESULTADOS OU CTA PRINCIPAL */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          {matchingQuestions.length === 0 ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
              <p className="text-xs font-bold text-amber-900">
                Nenhuma questão encontrada com esses filtros.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-base font-extrabold text-slate-900 block">
                  {matchingQuestions.length} questões encontradas
                </span>
                <span className="text-xs text-slate-500">
                  Tempo estimado de treino: ~{estimatedTimeMinutes} min
                </span>
              </div>

              <button
                type="button"
                onClick={handleStartTreino}
                disabled={matchingQuestions.length === 0}
                className="px-8 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>COMEÇAR TREINO</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
