import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  Play,
  Sparkles,
  BookOpen,
  Clock,
  RotateCcw,
  FileText,
  CheckCircle2,
  Layers,
  HelpCircle,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Check,
  Stethoscope,
  Activity,
  HeartPulse,
  Baby,
  ShieldCheck,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  MedicalArea,
  Question,
  QuestionAttempt,
  KnowledgeNode,
  UserProfile,
  ActiveTrainingSession,
  QuestionSessionConfig,
  TrainingMode,
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
  icon: React.ElementType;
  description: string;
}[] = [
  {
    id: "CLINICA_MEDICA",
    label: "Clínica Médica",
    icon: Stethoscope,
    description: "Cardio, Pneumo, Gastro, Nefro, Neuro, Infecto",
  },
  {
    id: "CIRURGIA_GERAL",
    label: "Cirurgia Geral",
    icon: Activity,
    description: "Trauma, Abdome Agudo, Pré/Pós-operatório, Queimaduras",
  },
  {
    id: "PEDIATRIA",
    label: "Pediatria",
    icon: Baby,
    description: "Neonatologia, Puericultura, PNE, Urgências infantis",
  },
  {
    id: "GINECOLOGIA_OBSTETRICIA",
    label: "Ginecologia e Obstetrícia",
    icon: HeartPulse,
    description: "Pré-natal, Ciclo Gravídico, Sangramentos, Rastreio",
  },
  {
    id: "MEDICINA_FAMILIA_COMUNIDADE",
    label: "Medicina Preventiva / MFC",
    icon: ShieldCheck,
    description: "SUS, Epidemiologia, Saúde Coletiva, Bioética",
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
  "Asma",
  "Tuberculose",
  "Pré-Eclâmpsia",
  "Hipertensão",
  "Diabetes Mellitus",
  "Apendicite Aguda",
  "Pneumonia (PAC)",
  "Sepse",
  "Vacinação Infantil",
  "Hemorragia Pós-Parto",
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
  onOpenExamSelector,
  onOpenPrintSimulado,
}) => {
  // 1. Filter States
  const [selectedAreas, setSelectedAreas] = useState<MedicalArea[]>([
    "CLINICA_MEDICA",
    "CIRURGIA_GERAL",
    "PEDIATRIA",
    "GINECOLOGIA_OBSTETRICIA",
    "MEDICINA_FAMILIA_COMUNIDADE",
  ]);

  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [topicSearch, setTopicSearch] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<string>("ALL");
  const [onlyWithComments, setOnlyWithComments] = useState<boolean>(true);
  const [onlyDiscursive, setOnlyDiscursive] = useState<boolean>(false);
  const [onlyUnanswered, setOnlyUnanswered] = useState<boolean>(false);
  const [onlyWrong, setOnlyWrong] = useState<boolean>(false);

  // 2. Quantity Slider
  const [questionCount, setQuestionCount] = useState<number>(20);

  // 3. Feedback Mode: Immediate (Estudo) vs End of Session (Simulado)
  const [studyMode, setStudyMode] = useState<"ESTUDO" | "SIMULADO">("ESTUDO");

  // 4. Expand question preview list
  const [showPreviewList, setShowPreviewList] = useState<boolean>(false);

  // Stats calculation
  const totalQuestionsInBank = questions.length;
  const answeredCount = useMemo(() => {
    return new Set(attempts.map((a) => a.questionId)).size;
  }, [attempts]);

  const wrongCount = useMemo(() => {
    return attempts.filter((a) => !a.isCorrect).length;
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
    const isAllAreas =
      selectedAreas.length === 5 || selectedAreas.length === 0;

    return {
      ...DEFAULT_SESSION_CONFIG,
      mode: studyMode === "SIMULADO" ? "SIMULADO" : "RAPIDO",
      title: topicSearch.trim()
        ? `Treino: ${topicSearch.trim()}`
        : selectedAreas.length === 1
        ? `Treino: ${
            MEDICAL_AREAS_CONFIG.find((a) => a.id === selectedAreas[0])?.label ||
            "Área Médica"
          }`
        : "Caderno Personalizado de Questões",
      objective: onlyWrong ? "REVISAO_ERROS" : "TREINO_LIVRE",
      areas: isAllAreas ? ["ALL"] : selectedAreas,
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
    selectedAreas,
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

  // Toggle individual area
  const handleToggleArea = (areaId: MedicalArea) => {
    setSelectedAreas((prev) => {
      if (prev.includes(areaId)) {
        // If clicking and it's the last one, keep it or allow deselection
        const updated = prev.filter((id) => id !== areaId);
        return updated;
      } else {
        return [...prev, areaId];
      }
    });
  };

  const handleSelectAllAreas = () => {
    if (selectedAreas.length === 5) {
      setSelectedAreas([]);
    } else {
      setSelectedAreas(MEDICAL_AREAS_CONFIG.map((a) => a.id));
    }
  };

  // Generate / Start Session
  const handleGenerateQuestions = () => {
    if (matchingQuestions.length === 0) return;
    onStartDirectSession(currentConfig);
  };

  const hasActiveSession = Boolean(activeSession && !activeSession.isCompleted);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* 1. Header & Summary Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs shadow-blue-500/50" />
            <span>Caderno de Questões</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Selecione as áreas médicas, ano da prova e temas para gerar seu caderno de questões personalizado.
          </p>
        </div>

        {/* Quick Database Stat Pill */}
        <div className="flex items-center gap-2 bg-[#0c101c] border border-zinc-800 px-3.5 py-1.5 rounded-xl text-xs text-zinc-300 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">
            {totalQuestionsInBank.toLocaleString("pt-BR")} questões
          </span>
          <span className="text-zinc-500">|</span>
          <span>{answeredCount} resolvidas</span>
          {wrongCount > 0 && (
            <>
              <span className="text-zinc-500">|</span>
              <span className="text-rose-400 font-medium">
                {wrongCount} erros
              </span>
            </>
          )}
        </div>
      </div>

      {/* 2. Active Session Card if any */}
      {hasActiveSession && activeSession && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                Sessão em andamento: {activeSession.title}
              </p>
              <p className="text-[11px] text-zinc-400">
                Questão {activeSession.currentIndex + 1} de{" "}
                {activeSession.questionIds.length} · Progresso salvo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onDiscardSession}
              className="px-3.5 py-2 text-zinc-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Descartar
            </button>
            <button
              onClick={onResumeSession}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
            >
              Continuar Sessão
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Filter Card */}
      <div className="rounded-3xl bg-[#0e1322] border border-white/[0.08] shadow-2xl overflow-hidden divide-y divide-white/[0.06]">
        
        {/* FILTRO 1: ÁREAS MÉDICAS */}
        <div className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <span>1. Áreas Médicas</span>
              <span className="text-[10px] text-zinc-400 font-normal lowercase">
                ({selectedAreas.length} de 5 selecionadas)
              </span>
            </label>
            <button
              type="button"
              onClick={handleSelectAllAreas}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer transition-colors"
            >
              {selectedAreas.length === 5
                ? "Desmarcar todas"
                : "Selecionar todas"}
            </button>
          </div>

          {/* 5 Big Area Toggle Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {MEDICAL_AREAS_CONFIG.map((area) => {
              const isSelected = selectedAreas.includes(area.id);
              const count = questionsCountPerArea[area.id] || 0;
              const Icon = area.icon;

              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => handleToggleArea(area.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                    isSelected
                      ? "bg-blue-600/20 border-blue-500 text-white shadow-sm shadow-blue-500/10 ring-1 ring-blue-500/30"
                      : "bg-[#090d18] border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-blue-500 text-white"
                          : "bg-white/[0.05] text-zinc-400"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-blue-500 border-blue-400 text-white"
                          : "border-white/20 bg-transparent"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-bold block text-white leading-tight">
                      {area.label}
                    </span>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                      {count} questões disponíveis
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* FILTRO 2: ANO / EDIÇÃO */}
        <div className="p-5 sm:p-6 space-y-3">
          <label className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
            2. Ano / Edição da Prova
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {AVAILABLE_YEARS.map((y) => {
              const isSelected = selectedYear === y.id;
              return (
                <button
                  key={y.id}
                  type="button"
                  onClick={() => setSelectedYear(y.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-blue-600 text-white font-bold shadow-xs"
                      : "bg-[#090d18] text-zinc-400 hover:text-white border border-white/[0.07] hover:border-white/20"
                  }`}
                >
                  {y.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* FILTRO 3: BUSCA POR TEMA ESPECÍFICO */}
        <div className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="topic-search-input"
              className="text-xs font-bold text-blue-400 uppercase tracking-wider block"
            >
              3. Tema Específico
            </label>
            {topicSearch && (
              <button
                type="button"
                onClick={() => setTopicSearch("")}
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Limpar tema</span>
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
            <input
              id="topic-search-input"
              type="text"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
              placeholder="Digite o tema desejado (ex: Asma, tuberculose, pneumonia, pré-eclâmpsia...)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#090d18] border border-white/[0.1] text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
          </div>

          {/* Popular Theme Pills for 1-Click Search */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[11px] text-zinc-500 font-medium mr-1">
              Sugestões frequentes:
            </span>
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
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold"
                      : "bg-white/[0.03] text-zinc-400 hover:text-zinc-200 border border-white/[0.05]"
                  }`}
                >
                  {theme}
                </button>
              );
            })}
          </div>
        </div>

        {/* FILTRO 4: BUSCA POR PROVA ESPECÍFICA */}
        <div className="p-5 sm:p-6 space-y-3">
          <label
            htmlFor="exam-select-dropdown"
            className="text-xs font-bold text-blue-400 uppercase tracking-wider block"
          >
            4. Caderno de Prova Específico
          </label>
          <div className="max-w-md">
            <select
              id="exam-select-dropdown"
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090d18] border border-white/[0.1] text-white text-xs focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
            >
              {EXAM_OPTIONS.map((exam) => (
                <option
                  key={exam.id}
                  value={exam.id}
                  className="bg-[#0e1322] text-white"
                >
                  {exam.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* FILTRO 5: TOGGLES DE CRITÉRIOS DE ESTUDO */}
        <div className="p-5 sm:p-6 space-y-3">
          <label className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
            5. Filtros de Resolução & Formato
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Toggle: Apenas com comentários */}
            <label className="p-3 rounded-2xl bg-[#090d18] border border-white/[0.07] hover:border-white/15 flex items-center justify-between gap-3 cursor-pointer transition-colors">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">
                  Apenas com comentários
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Resolução passo a passo
                </span>
              </div>
              <input
                type="checkbox"
                checked={onlyWithComments}
                onChange={(e) => setOnlyWithComments(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </label>

            {/* Toggle: Apenas discursivas */}
            <label className="p-3 rounded-2xl bg-[#090d18] border border-white/[0.07] hover:border-white/15 flex items-center justify-between gap-3 cursor-pointer transition-colors">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">
                  Apenas discursivas
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Padrão discursivo INEP
                </span>
              </div>
              <input
                type="checkbox"
                checked={onlyDiscursive}
                onChange={(e) => setOnlyDiscursive(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </label>

            {/* Toggle: Apenas não respondidas */}
            <label className="p-3 rounded-2xl bg-[#090d18] border border-white/[0.07] hover:border-white/15 flex items-center justify-between gap-3 cursor-pointer transition-colors">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">
                  Apenas não resolvidas
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Itens inéditos no seu histórico
                </span>
              </div>
              <input
                type="checkbox"
                checked={onlyUnanswered}
                onChange={(e) => setOnlyUnanswered(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </label>

            {/* Toggle: Apenas erros */}
            <label className="p-3 rounded-2xl bg-[#090d18] border border-white/[0.07] hover:border-white/15 flex items-center justify-between gap-3 cursor-pointer transition-colors">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">
                  Apenas que errei
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Caderno de revisão de erros
                </span>
              </div>
              <input
                type="checkbox"
                checked={onlyWrong}
                onChange={(e) => setOnlyWrong(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* FILTRO 6: MODO DE ESTUDO & SLIDER DE QUANTIDADE */}
        <div className="p-5 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Modo de Resolução */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                6. Modo de Resolução
              </label>
              <div className="grid grid-cols-2 gap-2 bg-[#090d18] p-1.5 rounded-2xl border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setStudyMode("ESTUDO")}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    studyMode === "ESTUDO"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Modo Estudo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudyMode("SIMULADO")}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    studyMode === "SIMULADO"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Modo Simulado</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                {studyMode === "ESTUDO"
                  ? "Comentário e gabarito liberados imediatamente após responder cada questão."
                  : "Gabarito retido e cronômetro contínuo. Resultados e análise ao final."}
              </p>
            </div>

            {/* Slider de Quantidade */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="question-quantity-slider"
                  className="text-xs font-bold text-blue-400 uppercase tracking-wider block"
                >
                  7. Quantidade de Questões
                </label>
                <div className="flex items-center gap-1 text-xs">
                  <span className="font-extrabold text-white text-base">
                    {questionCount}
                  </span>
                  <span className="text-zinc-400">questões</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">~{estimatedTimeMinutes} min</span>
                </div>
              </div>

              <input
                id="question-quantity-slider"
                type="range"
                min="5"
                max="50"
                step="5"
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                className="w-full accent-blue-600 h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />

              {/* Quick Presets */}
              <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                {[5, 10, 15, 20, 30, 50].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuestionCount(q)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                      questionCount === q
                        ? "bg-blue-600 text-white font-bold"
                        : "hover:text-white"
                    }`}
                  >
                    {q} Qs
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER CTA & LIVE COUNT */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-[#0c1222] to-[#0a0f1d] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-bold text-white">
                {matchingQuestions.length} questões encontradas
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              {matchingQuestions.length > 0
                ? `Serão selecionadas as melhores ${effectiveCount} questões para esta sessão.`
                : "Nenhuma questão disponível com os filtros atuais. Tente selecionar mais áreas."}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {matchingQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPreviewList(!showPreviewList)}
                className="px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white text-xs font-semibold border border-white/[0.08] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>{showPreviewList ? "Ocultar prévia" : "Ver lista"}</span>
                {showPreviewList ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            <button
              type="button"
              id="btn-generate-questions-main"
              onClick={handleGenerateQuestions}
              disabled={matchingQuestions.length === 0}
              className="px-7 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2.5 transition-all cursor-pointer min-h-[48px]"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>
                Gerar Questões ({effectiveCount})
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. EXPANDABLE PREVIEW LIST */}
      {showPreviewList && matchingQuestions.length > 0 && (
        <div className="p-5 rounded-3xl bg-[#0e1322] border border-white/[0.08] space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Prévia dos Itens Selecionados ({matchingQuestions.length})</span>
            </h3>
            <span className="text-[11px] text-zinc-400">
              Mostrando os primeiros {Math.min(10, matchingQuestions.length)} itens
            </span>
          </div>

          <div className="space-y-2">
            {matchingQuestions.slice(0, 10).map((q, idx) => (
              <div
                key={q.id}
                className="p-3 rounded-xl bg-[#090d18] border border-white/[0.05] hover:border-white/15 transition-all flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      {q.code || `Q-${idx + 1}`}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {q.examEdition || `${q.examYear || "INEP"}`}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium">
                      {MEDICAL_AREAS_CONFIG.find((a) => a.id === q.area)?.label || q.area}
                    </span>
                  </div>
                  <p className="text-white font-medium line-clamp-2">
                    {q.clinicalCase || q.topic}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-zinc-500 block">Tema</span>
                  <span className="text-zinc-300 font-semibold text-[11px]">
                    {q.topic}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={handleGenerateQuestions}
              className="inline-flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              <span>Iniciar sessão completa com estes itens</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Quick Access Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        {/* Treino Rápido 10 Qs */}
        <button
          type="button"
          onClick={() => {
            onStartDirectSession({
              ...DEFAULT_SESSION_CONFIG,
              mode: "RAPIDO",
              title: "Treino Rápido 10 Questões",
              quantity: 10,
              feedbackMode: "IMMEDIATE",
            });
          }}
          className="p-4 rounded-2xl bg-[#0e1322] border border-white/[0.06] hover:border-blue-500/40 text-left transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
              Treino Rápido
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            10 questões de áreas variadas para treinar em 15 minutos sem filtros.
          </p>
        </button>

        {/* Provas Completas na Íntegra */}
        {onOpenExamSelector && (
          <button
            type="button"
            onClick={onOpenExamSelector}
            className="p-4 rounded-2xl bg-[#0e1322] border border-white/[0.06] hover:border-purple-500/40 text-left transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <BookOpen className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                Provas Completas
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Edições oficiais completas (2020 a 2026) com 100 questões cronometradas.
            </p>
          </button>
        )}

        {/* Simulado Imprimível PDF */}
        {onOpenPrintSimulado && (
          <button
            type="button"
            onClick={onOpenPrintSimulado}
            className="p-4 rounded-2xl bg-[#0e1322] border border-white/[0.06] hover:border-cyan-500/40 text-left transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                Imprimir Caderno PDF
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Caderno de prova em 2 colunas com folha de respostas óptica e QR code.
            </p>
          </button>
        )}
      </div>
    </div>
  );
};
