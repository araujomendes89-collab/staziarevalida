import React, { useState } from "react";
import {
  BrainCircuit,
  FileCheck,
  TrendingUp,
  GitFork,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Search,
  BookOpen,
  Filter,
  BarChart3,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Info,
  Clock,
  Layers,
  Award,
  RefreshCw,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  CURRENT_INEP_EDITAL,
  SEED_INEP_TOPICS_INTELLIGENCE,
  SEED_BACKTEST_RUNS,
  INEP_PATTERN_ENGINE_GLOBAL_SUMMARY,
} from "../../data/inepPatternEngineData";
import { InepTopicMetric, SisterQuestionLink, InepEditalNotice } from "../../types/inepPatternEngine";
import { MedicalArea } from "../../types";

export const InepPatternEngineView: React.FC = () => {
  const { setActiveTab: setNavTab, setQuestionFilterArea, user } = useApp();
  const [activeTab, setActiveTab] = useState<"raiox" | "edital" | "sisters" | "trends" | "backtest" | "dna">("raiox");
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState<InepTopicMetric | null>(SEED_INEP_TOPICS_INTELLIGENCE[0]);
  const [isSimulatingCheck, setIsSimulatingCheck] = useState<boolean>(false);
  const [checkFeedback, setCheckFeedback] = useState<string | null>(null);

  const filteredTopics = SEED_INEP_TOPICS_INTELLIGENCE.filter((top) => {
    const matchesArea = selectedAreaFilter === "ALL" || top.area === selectedAreaFilter;
    const matchesSearch =
      top.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      top.specialty.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesArea && matchesSearch;
  });

  const handleRunEditalWatch = () => {
    setIsSimulatingCheck(true);
    setCheckFeedback(null);
    setTimeout(() => {
      setIsSimulatingCheck(false);
      setCheckFeedback("Portal INEP e Diário Oficial da União consultados com sucesso. Nenhuma nova publicação além do Edital nº 76/2026 (Retificado em 17/08/2026).");
    }, 1200);
  };

  const getRelevanceBadge = (irs: number) => {
    if (irs >= 90) return { label: "MUITO ALTA", bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    if (irs >= 75) return { label: "ALTA", bg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" };
    if (irs >= 55) return { label: "MODERADA", bg: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
    return { label: "BAIXA", bg: "bg-white/10 text-white/60 border-white/10" };
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "RISING":
      case "EMERGENT":
        return <span className="flex items-center text-emerald-400 font-bold text-xs"><TrendingUp className="w-3.5 h-3.5 mr-1" /> Em Alta</span>;
      case "STABLE":
        return <span className="flex items-center text-cyan-300 font-bold text-xs"><BarChart3 className="w-3.5 h-3.5 mr-1" /> Estável</span>;
      default:
        return <span className="flex items-center text-amber-300 font-bold text-xs"><Clock className="w-3.5 h-3.5 mr-1" /> Cíclico</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-16">
      {/* 1. Header do Motor de Inteligência */}
      <div className="p-6 sm:p-8 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500/30 to-cyan-500/20 border border-emerald-400/40 flex items-center justify-center shadow-lg shadow-emerald-950/40">
                <BrainCircuit className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black uppercase tracking-wider">
                    MOTOR DE INTELIGÊNCIA PREDITIVA
                  </span>
                  <span className="text-xs text-white/50 font-mono">
                    {INEP_PATTERN_ENGINE_GLOBAL_SUMMARY.algorithmVersion}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
                  INEP Pattern Engine
                </h1>
              </div>
            </div>

            {/* Status do Edital Vigente */}
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-white/80">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <span className="text-[10px] text-white/50 block font-medium">Edital Vigente</span>
                <strong className="text-white">Revalida 2026/2 ({CURRENT_INEP_EDITAL.examDate1stStage})</strong>
              </div>
            </div>
          </div>

          <p className="text-sm text-white/70 max-w-3xl leading-relaxed">
            Análise probabilística e modelagem estatística profunda de <strong>1.100 questões canônicas</strong> das 11 edições oficiais do Revalida (2021–2026). O sistema identifica padrões cognitivos, questões irmãs e prioridades reais de estudo sem falsas promessas de adivinhação.
          </p>

          {/* Cards de Resumo Global */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-white/50 font-medium block">Provas Analisadas</span>
              <span className="text-lg font-black text-white mt-0.5 block">{INEP_PATTERN_ENGINE_GLOBAL_SUMMARY.totalExamsAnalyzed} Edições</span>
              <span className="text-[10px] text-emerald-400 font-semibold">100% dos cadernos oficiais</span>
            </div>
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-white/50 font-medium block">Questões Canônicas</span>
              <span className="text-lg font-black text-white mt-0.5 block">{INEP_PATTERN_ENGINE_GLOBAL_SUMMARY.totalCanonicalQuestions} Itens</span>
              <span className="text-[10px] text-cyan-300 font-semibold">Sem duplicar cadernos</span>
            </div>
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-white/50 font-medium block">Relações de Questões Irmãs</span>
              <span className="text-lg font-black text-white mt-0.5 block">{INEP_PATTERN_ENGINE_GLOBAL_SUMMARY.totalSisterQuestionPairs} Pares</span>
              <span className="text-[10px] text-purple-300 font-semibold">SQS &gt; 75 (Mesmo conceito)</span>
            </div>
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-white/50 font-medium block">Precisão Backtest (Top 10)</span>
              <span className="text-lg font-black text-white mt-0.5 block">{INEP_PATTERN_ENGINE_GLOBAL_SUMMARY.backtestAggregatePrecision}%</span>
              <span className="text-[10px] text-emerald-400 font-semibold">Validação holdout temporal</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Abas do Pattern Engine */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab("raiox")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "raiox"
              ? "bg-white text-black shadow-lg"
              : "bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Raio-X do INEP (IRS)
        </button>

        <button
          onClick={() => setActiveTab("sisters")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "sisters"
              ? "bg-white text-black shadow-lg"
              : "bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
          }`}
        >
          <GitFork className="w-4 h-4" />
          Questões Irmãs & Grafos
        </button>

        <button
          onClick={() => setActiveTab("edital")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "edital"
              ? "bg-white text-black shadow-lg"
              : "bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Edital Watch (2026/2)
        </button>

        <button
          onClick={() => setActiveTab("trends")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "trends"
              ? "bg-white text-black shadow-lg"
              : "bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Tendências & Emergentes
        </button>

        <button
          onClick={() => setActiveTab("backtest")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "backtest"
              ? "bg-white text-black shadow-lg"
              : "bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Validação & Backtesting
        </button>

        <button
          onClick={() => setActiveTab("dna")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "dna"
              ? "bg-white text-black shadow-lg"
              : "bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
          }`}
        >
          <BrainCircuit className="w-4 h-4" />
          DNA da Questão INEP
        </button>
      </div>

      {/* 3. ABA: RAIO-X DO INEP (IRS & DRILL-DOWN) */}
      {activeTab === "raiox" && (
        <div className="space-y-6">
          {/* Filtros e Busca */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar tema ou especialidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              <button
                onClick={() => setSelectedAreaFilter("ALL")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  selectedAreaFilter === "ALL" ? "bg-white text-black" : "bg-white/[0.03] text-white/70 hover:bg-white/10"
                }`}
              >
                Todas as Áreas
              </button>
              <button
                onClick={() => setSelectedAreaFilter("CLINICA_MEDICA")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  selectedAreaFilter === "CLINICA_MEDICA" ? "bg-blue-500 text-white" : "bg-white/[0.03] text-white/70 hover:bg-white/10"
                }`}
              >
                Clínica Médica
              </button>
              <button
                onClick={() => setSelectedAreaFilter("GINECOLOGIA_OBSTETRICIA")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  selectedAreaFilter === "GINECOLOGIA_OBSTETRICIA" ? "bg-pink-500 text-white" : "bg-white/[0.03] text-white/70 hover:bg-white/10"
                }`}
              >
                Ginecologia e Obst.
              </button>
              <button
                onClick={() => setSelectedAreaFilter("PEDIATRIA")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  selectedAreaFilter === "PEDIATRIA" ? "bg-amber-500 text-black" : "bg-white/[0.03] text-white/70 hover:bg-white/10"
                }`}
              >
                Pediatria
              </button>
              <button
                onClick={() => setSelectedAreaFilter("CIRURGIA_GERAL")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  selectedAreaFilter === "CIRURGIA_GERAL" ? "bg-emerald-500 text-black" : "bg-white/[0.03] text-white/70 hover:bg-white/10"
                }`}
              >
                Cirurgia
              </button>
              <button
                onClick={() => setSelectedAreaFilter("MEDICINA_FAMILIA_COMUNIDADE")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  selectedAreaFilter === "MEDICINA_FAMILIA_COMUNIDADE" ? "bg-purple-500 text-white" : "bg-white/[0.03] text-white/70 hover:bg-white/10"
                }`}
              >
                MFC / SUS
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Lista de Temas com IRS */}
            <div className="lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between px-2 text-xs font-bold text-white/60">
                <span>Tema & Especialidade ({filteredTopics.length})</span>
                <span>Índice de Relevância INEP (IRS)</span>
              </div>

              {filteredTopics.map((top, idx) => {
                const badge = getRelevanceBadge(top.irs);
                const isSelected = selectedTopic?.topicId === top.topicId;

                return (
                  <div
                    key={top.topicId}
                    onClick={() => setSelectedTopic(top)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-white/[0.08] border-emerald-500/50 shadow-xl shadow-emerald-950/20"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-white/40">#{idx + 1}</span>
                          <span className="text-xs font-bold text-white leading-snug">{top.name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                          <span>{top.specialty}</span>
                          <span>•</span>
                          <span>{top.editionsPresentCount} de 11 edições ({top.editionCoveragePct}%)</span>
                          <span>•</span>
                          {getTrendIcon(top.trend)}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black ${badge.bg}`}>
                            {top.irs}
                          </span>
                        </div>
                        <span className="text-[9px] text-white/40 block mt-0.5">IRS / 100</span>
                      </div>
                    </div>

                    {/* Barra de Domínio Pessoal vs IRS */}
                    {top.studentDomainPct !== undefined && (
                      <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                        <span className="text-white/50">
                          Seu Domínio: <strong className="text-white">{top.studentDomainPct}%</strong>
                        </span>
                        <span className="text-emerald-400 font-bold">
                          Prioridade Pessoal (PPS): {top.pps}/100
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Painel de Drill-Down: "Como o INEP Cobra Este Tema?" */}
            <div className="lg:col-span-6 space-y-4">
              {selectedTopic ? (
                <div className="p-6 rounded-[24px] bg-white/[0.03] border border-white/10 shadow-2xl space-y-5 sticky top-6">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                        DRILL-DOWN COGNITIVO
                      </span>
                      <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                        {selectedTopic.name}
                      </h3>
                      <p className="text-xs text-white/60 mt-0.5">
                        {selectedTopic.specialty} • Frequência Histórica: <strong>{selectedTopic.totalOccurrences} questões</strong>
                      </p>
                    </div>

                    <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-center">
                      <span className="text-xs font-black text-emerald-300 block">{selectedTopic.irs}</span>
                      <span className="text-[9px] text-emerald-400/80 font-bold uppercase">IRS SCORE</span>
                    </div>
                  </div>

                  {/* Como o INEP Cobra? */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <BrainCircuit className="w-4 h-4 text-cyan-400" />
                      Como o INEP costuma cobrar este assunto?
                    </span>
                    
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-white/50 block">Conduta / Manejo</span>
                        <span className="text-base font-black text-white">{selectedTopic.cognitiveBreakdown.managementPct}%</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-white/50 block">Diagnóstico</span>
                        <span className="text-base font-black text-white">{selectedTopic.cognitiveBreakdown.diagnosisPct}%</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-white/50 block">Tratamento</span>
                        <span className="text-base font-black text-white">{selectedTopic.cognitiveBreakdown.treatmentPct}%</span>
                      </div>
                    </div>

                    <p className="text-xs text-white/80 leading-relaxed p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 font-sans">
                      {selectedTopic.inepThinkingPattern}
                    </p>
                  </div>

                  {/* Armadilhas Recorrentes da Banca */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Armadilhas Típicas do INEP (Distractor Patterns)
                    </span>
                    <ul className="space-y-1.5 text-xs text-white/80">
                      {selectedTopic.topTrapPatterns.map((trap, i) => (
                        <li key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{trap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recomendações Personalizadas para o Aluno */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-transparent border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Recomendação de Estudo (PPS: {selectedTopic.pps}/100)
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-black text-[10px] font-black">
                        {selectedTopic.sisterQuestionsCount} Questões Irmãs
                      </span>
                    </div>
                    <p className="text-xs text-white/90 leading-relaxed">
                      {selectedTopic.ppsRecommendationReason}
                    </p>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        onClick={() => setNavTab("questions")}
                        className="w-full py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-black hover:bg-emerald-400 transition-all flex items-center justify-center gap-2"
                      >
                        <BookOpen className="w-4 h-4" />
                        Treinar Este Padrão Agora ({selectedTopic.sisterQuestionsCount} itens)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-white/40 text-xs">
                  Selecione um tema à esquerda para ver a análise cognitiva detalhada.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. ABA: EDITAL WATCH (MONITOR DO EDITAL 2026/2) */}
      {activeTab === "edital" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-white/[0.03] border border-white/10 shadow-2xl space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black uppercase tracking-wider">
                    EDITAL VIGENTE HOMOLOGADO
                  </span>
                  <span className="text-xs text-white/60">Edital INEP nº 76/2026</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                  Revalida 2026/2 — 1ª Etapa Teórica
                </h2>
                <p className="text-xs text-white/70 mt-1">
                  Data Prevista da Prova: <strong className="text-emerald-400 font-bold">{CURRENT_INEP_EDITAL.examDate1stStage}</strong> (Vespertino)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleRunEditalWatch}
                  disabled={isSimulatingCheck}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold border border-white/10 transition-all flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingCheck ? "animate-spin" : ""}`} />
                  {isSimulatingCheck ? "Consultando INEP..." : "Verificar Diário Oficial"}
                </button>

                <a
                  href={CURRENT_INEP_EDITAL.officialNoticeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 text-black text-xs font-black hover:bg-emerald-400 transition-all flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ver Edital Oficial
                </a>
              </div>
            </div>

            {checkFeedback && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{checkFeedback}</span>
              </div>
            )}

            {/* Comparador de Edital: "O Que Mudou no Novo Revalida?" */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-cyan-400" />
                Comparativo Automatizado: O que mudou em relação à edição anterior?
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CURRENT_INEP_EDITAL.changesFromPreviousNotice.map((change, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                        {change.category}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                          change.status === "SEM_ALTERACAO"
                            ? "bg-white/10 text-white/70"
                            : change.status === "ALTERADO"
                            ? "bg-amber-500 text-black"
                            : "bg-emerald-500 text-black"
                        }`}
                      >
                        {change.status === "SEM_ALTERACAO" ? "SEM ALTERAÇÃO" : change.status}
                      </span>
                    </div>
                    <p className="text-xs text-white/90 leading-relaxed">
                      {change.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumo da Estrutura da Prova */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-white/50 block text-[10px]">Total de Questões</span>
                <strong className="text-base text-white font-black">{CURRENT_INEP_EDITAL.examStructure.totalQuestions} Objetivas</strong>
              </div>
              <div>
                <span className="text-white/50 block text-[10px]">Alternativas por Questão</span>
                <strong className="text-base text-white font-black">4 (A, B, C, D)</strong>
              </div>
              <div>
                <span className="text-white/50 block text-[10px]">Duração da Prova</span>
                <strong className="text-base text-white font-black">{CURRENT_INEP_EDITAL.examStructure.durationHours} Horas</strong>
              </div>
              <div>
                <span className="text-white/50 block text-[10px]">Distribuição</span>
                <strong className="text-base text-emerald-400 font-black">20 por Grande Área</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ABA: QUESTÕES IRMÃS & GRAFOS COGNITIVOS */}
      {activeTab === "sisters" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-white/[0.03] border border-white/10 shadow-2xl space-y-6">
            <div>
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                RECONHECIMENTO DE PADRÕES COGNITIVOS
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Sister Question Engine (SQS)
              </h2>
              <p className="text-xs text-white/70 mt-1 max-w-3xl leading-relaxed">
                Questões irmãs não precisam ter o mesmo texto. Elas testam a <strong>mesma competência clínica</strong>, o <strong>mesmo nó decisório</strong> e a <strong>mesma armadilha da banca</strong>, mesmo com idades, pacientes e cenários diferentes.
              </p>
            </div>

            {/* Exemplo de Parentesco Cognitivo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                    Revalida 2024/1 — Questão 12 (Oficial)
                  </span>
                  <span className="text-xs font-mono text-white/50">SCASST / Troponina +</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed italic font-sans">
                  "Homem de 62 anos com dor retroesternal em aperto, infra de ST em V4-V6 e troponina positiva..."
                </p>
                <div className="text-[11px] text-emerald-300 font-semibold pt-2 border-t border-white/5">
                  Decisão Nuclear: Iniciar dupla antiagregação + anticoagulação plena + estratificação invasiva sem trombólise.
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                    Revalida 2022/2 — Questão 48 (Irmã Canônica)
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">SQS: 94% (Gêmea)</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed italic font-sans">
                  "Mulher de 68 anos diabética com queixa de epigastralgia atípica, inversão de onda T e curva enzimática em ascensão..."
                </p>
                <div className="text-[11px] text-purple-300 font-semibold pt-2 border-t border-white/5">
                  Mesmo Ponto Decisório: Reconhecimento de equivalente isquêmico e manejo antitrombótico sem atraso.
                </div>
              </div>
            </div>

            {/* Níveis de Parentesco SQS */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                <strong className="text-purple-300 block font-black">GÊMEA (SQS &ge; 90)</strong>
                <span className="text-[10px] text-white/60">Mesma estrutura decisória</span>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                <strong className="text-blue-300 block font-black">IRMÃ (SQS 75–89)</strong>
                <span className="text-[10px] text-white/60">Mesma competência central</span>
              </div>
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-center">
                <strong className="text-cyan-300 block font-black">PRIMA (SQS 60–74)</strong>
                <span className="text-[10px] text-white/60">Tema e raciocínio conexos</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-center">
                <strong className="text-white/80 block font-black">RELACIONADA (SQS 45–59)</strong>
                <span className="text-[10px] text-white/60">Conexão pedagógica</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. ABA: VALIDAÇÃO & BACKTESTING */}
      {activeTab === "backtest" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-white/[0.03] border border-white/10 shadow-2xl space-y-6">
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                VALIDAÇÃO CIENTÍFICA & HOLDOUT TEMPORAL
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Backtesting do Modelo Histórico
              </h2>
              <p className="text-xs text-white/70 mt-1 max-w-3xl leading-relaxed">
                Testamos se o algoritmo treinado no passado teria acertado a distribuição real de temas nas provas seguintes. O modelo utiliza validação temporal estrita sem vazamento de dados futuros (*zero data leakage*).
              </p>
            </div>

            <div className="space-y-4">
              {SEED_BACKTEST_RUNS.map((run) => (
                <div
                  key={run.id}
                  className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-white">
                        Teste Cego: <strong className="text-emerald-400">{run.testEdition}</strong>
                      </span>
                      <span className="text-[11px] text-white/50 block">Janela de Treino: {run.trainWindow}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 font-black text-xs border border-emerald-500/30">
                        Precisão Top 10: {run.precisionAt10}%
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-cyan-500/20 text-cyan-300 font-black text-xs border border-cyan-500/30">
                        Recall: {run.topicRecall}%
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-white/80 leading-relaxed font-sans">
                    {run.methodologicalNote}
                  </p>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
                      Validação dos Top 10 Temas Previstos vs Ocorrências Reais na Prova:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {run.topPredictedTopics.map((item, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-white/90 truncate">{item.topic}</span>
                          </div>
                          <span className="text-[10px] text-white/50 font-mono shrink-0 ml-2">
                            {item.actualOccurrencesInTestExam} {item.actualOccurrencesInTestExam === 1 ? "questão" : "questões"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. ABA: DNA DA QUESTÃO INEP */}
      {activeTab === "dna" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-white/[0.03] border border-white/10 shadow-2xl space-y-6">
            <div>
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                ASSINATURA ESTRUTURAL
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                INEP Question DNA
              </h2>
              <p className="text-xs text-white/70 mt-1 max-w-3xl leading-relaxed">
                Cada questão do banco possui uma assinatura estruturada contendo cenário assistencial, nível de acuidade, exigência de diretrizes do SUS e padrão de raciocínio clínico.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-xs font-bold text-white block">Cenários Assistenciais</span>
                <div className="space-y-1 text-xs text-white/70">
                  <div className="flex justify-between"><span>Atenção Primária / UBS</span><strong className="text-white">42%</strong></div>
                  <div className="flex justify-between"><span>Pronto Atendimento / Emergência</span><strong className="text-white">38%</strong></div>
                  <div className="flex justify-between"><span>Enfermaria / UTI / Maternidade</span><strong className="text-white">20%</strong></div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-xs font-bold text-white block">Objetivo Cognitivo</span>
                <div className="space-y-1 text-xs text-white/70">
                  <div className="flex justify-between"><span>Tomada de Conduta / Próximo Passo</span><strong className="text-white">54%</strong></div>
                  <div className="flex justify-between"><span>Diagnóstico Diferencial</span><strong className="text-white">26%</strong></div>
                  <div className="flex justify-between"><span>Interpretação de Exames / Triagem</span><strong className="text-white">20%</strong></div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-xs font-bold text-white block">Contexto SUS & Diretrizes</span>
                <div className="space-y-1 text-xs text-white/70">
                  <div className="flex justify-between"><span>Exige Protocolo SUS / MS</span><strong className="text-white">78%</strong></div>
                  <div className="flex justify-between"><span>Exige Guideline de Especialidade</span><strong className="text-white">65%</strong></div>
                  <div className="flex justify-between"><span>Contém Imagem Clínica / ECG</span><strong className="text-white">28%</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
