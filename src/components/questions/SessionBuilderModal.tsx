import React, { useState, useMemo } from "react";
import {
  X,
  Sparkles,
  Sliders,
  Check,
  Zap,
  Flame,
  Shield,
  Layers,
  Clock,
  RotateCcw,
  BookOpen,
  Filter,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import {
  MedicalArea,
  Question,
  QuestionAttempt,
  KnowledgeNode,
  QuestionSessionConfig,
  SessionObjective,
  SessionOrdering,
  FeedbackMode,
  TimerMode,
  InepRelevanceLevel,
} from "../../types";
import {
  SessionBuilderService,
  DEFAULT_SESSION_CONFIG,
} from "../../services/sessionBuilderService";

interface SessionBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSession: (config: QuestionSessionConfig) => void;
  allQuestions: Question[];
  attempts: QuestionAttempt[];
  knowledgeGraph: KnowledgeNode[];
  initialConfig?: Partial<QuestionSessionConfig>;
}

export const SessionBuilderModal: React.FC<SessionBuilderModalProps> = ({
  isOpen,
  onClose,
  onStartSession,
  allQuestions,
  attempts,
  knowledgeGraph,
  initialConfig,
}) => {
  const [config, setConfig] = useState<QuestionSessionConfig>(() => ({
    ...DEFAULT_SESSION_CONFIG,
    ...initialConfig,
  }));

  const [topicSearch, setTopicSearch] = useState("");

  // Extract unique topics with counts and areas
  const topicStats = useMemo(() => {
    const map = new Map<string, { count: number; area: MedicalArea }>();
    allQuestions.forEach((q) => {
      if (q.topic) {
        const existing = map.get(q.topic) || { count: 0, area: q.area };
        map.set(q.topic, { count: existing.count + 1, area: q.area });
      }
    });
    return map;
  }, [allQuestions]);

  const availableTopics = useMemo(() => {
    const isAllAreas = config.areas.includes("ALL");
    const topics: { topic: string; count: number; area: MedicalArea }[] = [];
    topicStats.forEach((val, key) => {
      if (isAllAreas || config.areas.includes(val.area)) {
        topics.push({ topic: key, count: val.count, area: val.area });
      }
    });
    return topics.sort((a, b) => b.count - a.count);
  }, [topicStats, config.areas]);

  const filteredTopics = useMemo(() => {
    if (!topicSearch.trim()) return availableTopics;
    const query = topicSearch.toLowerCase();
    return availableTopics.filter((item) =>
      item.topic.toLowerCase().includes(query)
    );
  }, [availableTopics, topicSearch]);

  // Real-time matching questions pool from filterQuestions (all available matching questions)
  const matchingPool = useMemo(() => {
    return SessionBuilderService.filterQuestions(
      config,
      allQuestions,
      attempts,
      knowledgeGraph
    );
  }, [config, allQuestions, attempts, knowledgeGraph]);

  const sessionQuestionsCount = useMemo(() => {
    if (matchingPool.length === 0) return 0;
    return Math.min(config.quantity, matchingPool.length);
  }, [matchingPool, config.quantity]);

  const estimatedMinutes = SessionBuilderService.calculateEstimatedMinutes(
    sessionQuestionsCount || config.quantity
  );

  if (!isOpen) return null;

  // Toggle Area
  const handleToggleArea = (area: MedicalArea) => {
    let currentAreas = config.areas.filter((a) => a !== "ALL") as MedicalArea[];
    if (currentAreas.includes(area)) {
      currentAreas = currentAreas.filter((a) => a !== area);
    } else {
      currentAreas.push(area);
    }

    setConfig((prev) => ({
      ...prev,
      areas: currentAreas.length === 0 ? ["ALL"] : currentAreas,
    }));
  };

  // Toggle Topic
  const handleToggleTopic = (topic: string) => {
    const current = config.topics || [];
    const next = current.includes(topic)
      ? current.filter((t) => t !== topic)
      : [...current, topic];
    setConfig((prev) => ({ ...prev, topics: next }));
  };

  // Toggle Competency
  const handleToggleCompetency = (comp: string) => {
    const current = config.competencies || [];
    const next = current.includes(comp)
      ? current.filter((c) => c !== comp)
      : [...current, comp];
    setConfig((prev) => ({ ...prev, competencies: next }));
  };

  // Toggle Year
  const handleToggleYear = (year: number) => {
    let current = config.years.filter((y) => y !== "ALL") as number[];
    if (current.includes(year)) {
      current = current.filter((y) => y !== year);
    } else {
      current.push(year);
    }
    setConfig((prev) => ({
      ...prev,
      years: current.length === 0 ? ["ALL"] : current,
    }));
  };

  const handleStart = () => {
    onStartSession(config);
    onClose();
  };

  const areasList: { id: MedicalArea; label: string }[] = [
    { id: "CLINICA_MEDICA", label: "Clínica Médica" },
    { id: "CIRURGIA_GERAL", label: "Cirurgia Geral" },
    { id: "GINECOLOGIA_OBSTETRICIA", label: "Ginecologia & Obstetrícia" },
    { id: "PEDIATRIA", label: "Pediatria" },
    { id: "MEDICINA_FAMILIA_COMUNIDADE", label: "Medicina de Família / SUS" },
  ];

  const objectivesList: { id: SessionObjective; label: string; desc: string }[] = [
    { id: "TREINO_LIVRE", label: "Treino Livre", desc: "Equilíbrio geral de questões" },
    { id: "TEMAS_RECORRENTES", label: "Temas Recorrentes", desc: "Prioriza alto peso no INEP" },
    { id: "REVISAO_ERROS", label: "Revisão de Erros", desc: "Apenas questões erradas" },
    { id: "INEDITAS", label: "Inéditas 2026", desc: "Questões novas no padrão INEP" },
    { id: "OFICIAIS", label: "Oficiais INEP", desc: "Itens de provas anteriores" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#090910] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row my-auto max-h-[92vh]">
        {/* LEFT / MAIN CONFIG BUILDER (SCROLLABLE) */}
        <div className="flex-1 p-5 sm:p-8 overflow-y-auto space-y-8 scrollbar-thin">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5" />
                <span>Construtor de Sessão</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                Montar Treino Personalizado
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* BLOCO 1: OBJETIVO */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              1. Objetivo do Treino
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {objectivesList.map((obj) => {
                const isSelected = config.objective === obj.id;
                return (
                  <button
                    key={obj.id}
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        objective: obj.id,
                        origin:
                          obj.id === "INEDITAS"
                            ? "INEDITAS"
                            : obj.id === "OFICIAIS"
                            ? "INEP_OFICIAL"
                            : prev.origin,
                        smartFilters: {
                          ...prev.smartFilters,
                          onlyWrong: obj.id === "REVISAO_ERROS",
                        },
                      }))
                    }
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600/25 border-indigo-400 text-white shadow-md ring-1 ring-indigo-400/50"
                        : "bg-white/[0.02] border-white/10 text-white/70 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold block text-white">{obj.label}</span>
                    <span className="text-[11px] text-white/50 block mt-0.5">{obj.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BLOCO 2: CONTEÚDO */}
          <div className="space-y-5 border-t border-white/10 pt-6">
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              2. Conteúdo e Filtros Clínicos
            </h3>

            {/* Grandes Áreas */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">
                Grandes Áreas Médicas:
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setConfig((prev) => ({ ...prev, areas: ["ALL"] }))}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    config.areas.includes("ALL")
                      ? "bg-white text-black border-white shadow-sm"
                      : "bg-white/[0.02] border-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  Todas as 5 Áreas
                </button>
                {areasList.map((a) => {
                  const isSelected = config.areas.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => handleToggleArea(a.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? "bg-indigo-500/25 border-indigo-400 text-white shadow-sm ring-1 ring-indigo-400/40"
                          : "bg-white/[0.02] border-white/10 text-white/60 hover:text-white"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Busca Rápida de Temas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/70">
                  Temas e Doenças Específicas:
                </label>
                {config.topics.length > 0 && (
                  <button
                    onClick={() => setConfig((prev) => ({ ...prev, topics: [] }))}
                    className="text-[11px] text-indigo-300 hover:underline"
                  >
                    Limpar ({config.topics.length})
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Buscar por tema (ex: Pré-eclâmpsia, Infarto, Sepse, SUS, Tuberculose)..."
                value={topicSearch}
                onChange={(e) => setTopicSearch(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-400"
              />
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 scrollbar-thin">
                {filteredTopics.map((item) => {
                  const isSelected = config.topics.includes(item.topic);
                  return (
                    <button
                      key={item.topic}
                      onClick={() => handleToggleTopic(item.topic)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center gap-1.5 transition-all ${
                        isSelected
                          ? "bg-indigo-500/30 border-indigo-400 text-white shadow-sm ring-1 ring-indigo-400/40"
                          : "bg-white/[0.02] border-white/10 text-white/70 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <span className="truncate max-w-[220px]">{item.topic}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                          isSelected
                            ? "bg-indigo-400 text-black font-bold"
                            : "bg-white/10 text-white/50"
                        }`}
                      >
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Raciocínio Clínico / Competência */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">
                Tipo de Raciocínio Clínico (Competência):
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "CONDUTA", label: "Conduta Terapêutica" },
                  { id: "DIAGNOSTICO", label: "Diagnóstico Clínico" },
                  { id: "TRATAMENTO", label: "Tratamento Farmacológico" },
                  { id: "INVESTIGACAO", label: "Investigação / Exames" },
                  { id: "PREVENCAO", label: "Prevenção & Rastreamento" },
                  { id: "SUS", label: "Fluxos SUS & Notificação" },
                ].map((comp) => {
                  const isSelected = config.competencies.includes(comp.id);
                  return (
                    <button
                      key={comp.id}
                      onClick={() => handleToggleCompetency(comp.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        isSelected
                          ? "bg-purple-500/25 border-purple-400 text-purple-200 shadow-sm"
                          : "bg-white/[0.02] border-white/10 text-white/60 hover:text-white"
                      }`}
                    >
                      {comp.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Anos de Prova */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">
                Edições do Revalida INEP:
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setConfig((prev) => ({ ...prev, years: ["ALL"] }))}
                  className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                    config.years.includes("ALL")
                      ? "bg-white text-black border-white"
                      : "bg-white/[0.02] border-white/10 text-white/60"
                  }`}
                >
                  Todos os Anos
                </button>
                {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((yr) => {
                  const isSelected = config.years.includes(yr);
                  return (
                    <button
                      key={yr}
                      onClick={() => handleToggleYear(yr)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                          : "bg-white/[0.02] border-white/10 text-white/60"
                      }`}
                    >
                      {yr}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Smart Filters (Toggles) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">
                Filtros Inteligentes:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    key: "onlyUnanswered",
                    label: "Apenas questões não feitas",
                    active: config.smartFilters.onlyUnanswered,
                  },
                  {
                    key: "onlyWrong",
                    label: "Apenas questões que errei",
                    active: config.smartFilters.onlyWrong,
                  },
                  {
                    key: "onlyWithUpdatedGuideline",
                    label: "Com diretrizes atualizadas (2026)",
                    active: config.smartFilters.onlyWithUpdatedGuideline,
                  },
                  {
                    key: "onlyHighInepPattern",
                    label: "Alto padrão INEP DNA (Score ≥ 85%)",
                    active: config.smartFilters.onlyHighInepPattern,
                  },
                  {
                    key: "excludeMastered",
                    label: "Evitar temas já dominados (>85%)",
                    active: config.smartFilters.excludeMastered,
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        smartFilters: {
                          ...prev.smartFilters,
                          [item.key]: !prev.smartFilters[item.key as keyof typeof prev.smartFilters],
                        },
                      }))
                    }
                    className={`p-2.5 rounded-xl border text-left text-xs font-medium flex items-center justify-between transition-all ${
                      item.active
                        ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                        : "bg-white/[0.02] border-white/10 text-white/60 hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                        item.active
                          ? "bg-indigo-500 border-indigo-400 text-white"
                          : "border-white/20"
                      }`}
                    >
                      {item.active && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* BLOCO 3: CONFIGURAÇÃO DA SESSÃO */}
          <div className="space-y-5 border-t border-white/10 pt-6">
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              3. Configuração do Treino
            </h3>

            {/* Quantidade */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">
                Quantidade de Questões:
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {[10, 20, 30, 50, 100].map((qty) => (
                  <button
                    key={qty}
                    onClick={() => setConfig((prev) => ({ ...prev, quantity: qty }))}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                      config.quantity === qty
                        ? "bg-white text-black border-white shadow-sm scale-105"
                        : "bg-white/[0.02] border-white/10 text-white/60 hover:text-white"
                    }`}
                  >
                    {qty} questões
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback Mode */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">
                Liberação de Gabarito e Feedback:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    id: "IMMEDIATE",
                    label: "Imediato após cada questão",
                    desc: "Ideal para estudo e fixação de condutas",
                  },
                  {
                    id: "END_OF_SESSION",
                    label: "Apenas ao final da sessão (Modo Prova)",
                    desc: "Simula o ambiente real do Revalida INEP",
                  },
                ].map((fb) => (
                  <button
                    key={fb.id}
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, feedbackMode: fb.id as FeedbackMode }))
                    }
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      config.feedbackMode === fb.id
                        ? "bg-indigo-600/20 border-indigo-400 text-white ring-1 ring-indigo-400/40"
                        : "bg-white/[0.02] border-white/10 text-white/60"
                    }`}
                  >
                    <span className="text-xs font-bold block text-white">{fb.label}</span>
                    <span className="text-[11px] text-white/50 block mt-0.5">{fb.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ordering Strategy */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">
                Estratégia de Ordenação:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: "ADAPTIVE",
                    label: "Adaptativa (PPS)",
                    desc: "Prioriza suas fraquezas de alto peso",
                  },
                  {
                    id: "INEP_RELEVANCE",
                    label: "Relevância INEP",
                    desc: "Itens com maior DNA de prova",
                  },
                  {
                    id: "NEWEST",
                    label: "Mais Recentes",
                    desc: "Provas 2024 e inéditas 2026",
                  },
                ].map((ord) => (
                  <button
                    key={ord.id}
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, ordering: ord.id as SessionOrdering }))
                    }
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                      config.ordering === ord.id
                        ? "bg-indigo-500/20 border-indigo-400 text-white"
                        : "bg-white/[0.02] border-white/10 text-white/60"
                    }`}
                  >
                    <span className="font-bold block text-white">{ord.label}</span>
                    <span className="text-[10px] text-white/50 block">{ord.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT / STICKY SUMMARY PANEL (DESKTOP) & BOTTOM BAR (MOBILE) */}
        <div className="w-full lg:w-80 bg-white/[0.02] border-t lg:border-t-0 lg:border-l border-white/10 p-5 sm:p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              Resumo da Sessão
            </h4>

            {/* Real-time stats */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">Disponíveis no Banco:</span>
                <span className="font-mono text-sm font-bold text-white">
                  {matchingPool.length} {matchingPool.length === 1 ? "questão" : "questões"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">Na sua sessão:</span>
                <span className="font-mono text-sm font-bold text-indigo-300">
                  {sessionQuestionsCount} {sessionQuestionsCount === 1 ? "questão" : "questões"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-2">
                <span className="text-xs text-white/60">Tempo Estimado:</span>
                <span className="font-mono text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  ~{estimatedMinutes} minutos
                </span>
              </div>
            </div>

            {/* Active filters chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-white/50">Filtros aplicados:</span>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/80">
                  {config.objective.replace(/_/g, " ")}
                </span>
                {config.areas.includes("ALL") ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/80">
                    5 Áreas
                  </span>
                ) : (
                  config.areas.map((a) => (
                    <span key={a} className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">
                      {a}
                    </span>
                  ))
                )}
                {config.topics.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="space-y-2 pt-4 border-t border-white/10">
            <button
              onClick={handleStart}
              disabled={matchingPool.length === 0}
              id="start-custom-session-btn"
              className="w-full py-3.5 rounded-2xl bg-white text-black font-extrabold text-xs hover:scale-[1.02] active:scale-95 transition-transform shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span>
                {matchingPool.length === 0
                  ? "NENHUMA QUESTÃO ENCONTRADA"
                  : `COMEÇAR ${sessionQuestionsCount} ${sessionQuestionsCount === 1 ? "QUESTÃO" : "QUESTÕES"}`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[10px] text-white/40 text-center">
              Você pode pausar ou sair a qualquer momento com salvamento automático.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
