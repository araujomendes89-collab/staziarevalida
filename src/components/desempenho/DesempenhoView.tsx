import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  BarChart3,
  Compass,
  PieChart,
  Layers,
  Award,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  ChevronLeft,
  BookOpen,
  Target,
  Clock,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { UnifiedProgressView } from "../progress/UnifiedProgressView";
import { KnowledgeGraphView } from "../matrix/KnowledgeGraphView";
import { InepPatternEngineView } from "../patternEngine/InepPatternEngineView";
import { formatMedicalArea } from "../../utils/formatters";
import { MedicalArea } from "../../types";

export type DesempenhoSubTab =
  | "GERAL"
  | "EVOLUCAO"
  | "MATRIZ"
  | "TENDENCIAS"
  | "AREAS";

interface DesempenhoViewProps {
  initialSubTab?: DesempenhoSubTab;
}

const MEDICAL_AREAS: MedicalArea[] = [
  "CLINICA_MEDICA",
  "CIRURGIA_GERAL",
  "GINECOLOGIA_OBSTETRICIA",
  "PEDIATRIA",
  "MEDICINA_FAMILIA_COMUNIDADE",
];

export const DesempenhoView: React.FC<DesempenhoViewProps> = ({
  initialSubTab = "GERAL",
}) => {
  const {
    activeTab,
    setActiveTab,
    attempts,
    questions,
    knowledgeGraph,
    readinessData,
    setQuestionFilterArea,
  } = useApp();

  const [currentSubTab, setCurrentSubTab] = useState<DesempenhoSubTab>(initialSubTab);
  const [selectedAreaId, setSelectedAreaId] = useState<MedicalArea>("CLINICA_MEDICA");

  useEffect(() => {
    if (activeTab === "desempenho-evolucao" || activeTab === "evolucao") {
      setCurrentSubTab("EVOLUCAO");
    } else if (activeTab === "desempenho-matriz" || activeTab === "matrix") {
      setCurrentSubTab("MATRIZ");
    } else if (
      activeTab === "desempenho-tendencias" ||
      activeTab === "pattern-engine" ||
      activeTab === "tendencias"
    ) {
      setCurrentSubTab("TENDENCIAS");
    } else if (activeTab === "desempenho-areas") {
      setCurrentSubTab("AREAS");
    } else if (
      activeTab === "desempenho-geral" ||
      activeTab === "desempenho" ||
      activeTab === "progress"
    ) {
      setCurrentSubTab("GERAL");
    }
  }, [activeTab]);

  // Dynamic Weekly Evolution Calculation
  const evolutionWeeks = useMemo(() => {
    const totalAttempts = attempts?.length ?? 0;
    if (totalAttempts === 0) {
      return [
        { week: "Semana 1", rate: 0, questions: 0, hasData: false },
        { week: "Semana 2", rate: 0, questions: 0, hasData: false },
        { week: "Semana 3", rate: 0, questions: 0, hasData: false },
        { week: "Semana Atual", rate: 0, questions: 0, hasData: false },
      ];
    }

    // Sort chronologically
    const sorted = [...attempts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const chunkSize = Math.max(1, Math.ceil(sorted.length / 4));
    const weeks = [];
    const labels = ["Semana 1", "Semana 2", "Semana 3", "Semana Atual"];

    for (let i = 0; i < 4; i++) {
      const slice = sorted.slice(i * chunkSize, (i + 1) * chunkSize);
      const count = slice.length;
      const correct = slice.filter((a) => a.isCorrect).length;
      const rate = count > 0 ? Math.round((correct / count) * 100) : 0;
      weeks.push({
        week: labels[i],
        rate,
        questions: count,
        hasData: count > 0,
      });
    }

    return weeks;
  }, [attempts]);

  // Trajectory Summary Metrics
  const trajectorySummary = useMemo(() => {
    const activeWeeks = evolutionWeeks.filter((w) => w.hasData);
    const totalQuestions = evolutionWeeks.reduce((acc, w) => acc + w.questions, 0);

    if (activeWeeks.length === 0) {
      return {
        hasData: false,
        latestRate: 0,
        firstRate: 0,
        deltaPp: 0,
        totalQuestions: 0,
      };
    }

    const firstRate = activeWeeks[0].rate;
    const latestRate = activeWeeks[activeWeeks.length - 1].rate;
    const deltaPp = latestRate - firstRate;

    return {
      hasData: true,
      latestRate,
      firstRate,
      deltaPp,
      totalQuestions,
    };
  }, [evolutionWeeks]);

  // Dynamic Area Performance Breakdown in stable canonical order
  const areaPerformance = useMemo(() => {
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    return MEDICAL_AREAS.map((area) => {
      const areaAttempts = attempts.filter((att) => {
        const q = questionMap.get(att.questionId);
        return q?.area === area;
      });

      const total = areaAttempts.length;
      const correct = areaAttempts.filter((a) => a.isCorrect).length;
      const accuracy =
        total > 0
          ? Math.round((correct / total) * 100)
          : Math.round(readinessData?.areaBreakdown?.[area] || 0);

      // Area knowledge nodes sorted by lowest mastery first
      const areaNodes = knowledgeGraph.filter((n) => n.area === area);
      const sortedNodes = [...areaNodes].sort(
        (a, b) => (a.userMastery || 0) - (b.userMastery || 0)
      );

      const weakSpot =
        sortedNodes[0]?.name || "Diagnóstico e Condutas Prioritárias";

      return {
        area,
        name: formatMedicalArea(area),
        accuracy,
        total,
        weakSpot,
        topNodes: sortedNodes.slice(0, 3),
      };
    });
  }, [attempts, questions, knowledgeGraph, readinessData]);

  const selectedAreaData = useMemo(() => {
    return (
      areaPerformance.find((item) => item.area === selectedAreaId) ||
      areaPerformance[0]
    );
  }, [areaPerformance, selectedAreaId]);

  const totalAllAttempts = attempts?.length ?? 0;

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* SUBVIEWS */}
      {/* 1. VISÃO GERAL */}
      {currentSubTab === "GERAL" && <UnifiedProgressView />}

      {/* 2. EVOLUÇÃO (REFINED VIEW) */}
      {currentSubTab === "EVOLUCAO" && (
        <div className="space-y-6">
          {/* HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-xs shadow-cyan-400/50" />
                  <span>Evolução do Desempenho</span>
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
                  Últimas 4 Semanas
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Acompanhe a trajetória de acertos e volume de prática com base no seu histórico real de resolução.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("desempenho-tendencias")}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <PieChart className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ver Tendências Históricas INEP</span>
              </button>
            </div>
          </div>

          {totalAllAttempts === 0 ? (
            /* Empty State */
            <div className="p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-center space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h2 className="text-base font-bold text-white">Ainda não há dados suficientes para mostrar sua evolução</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Resolva questões ao longo dos dias para que sua curva de aprendizado e retenção seja traçada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("praticar-questoes")}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer inline-flex items-center gap-2 shadow-md"
              >
                <span>Começar a Resolver Questões</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 3 SUMMARY METRICS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-1">
                  <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
                    Taxa Mais Recente
                  </span>
                  <div className="text-3xl font-black text-white">
                    {trajectorySummary.latestRate}%
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Acurácia na semana mais recente.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-1">
                  <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
                    Variação no Período
                  </span>
                  <div
                    className={`text-3xl font-black ${
                      trajectorySummary.deltaPp >= 0 ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {trajectorySummary.deltaPp >= 0
                      ? `+${trajectorySummary.deltaPp} p.p.`
                      : `${trajectorySummary.deltaPp} p.p.`}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Diferença em pontos percentuais vs início do período.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-1">
                  <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
                    Volume no Período
                  </span>
                  <div className="text-3xl font-black text-cyan-400">
                    {trajectorySummary.totalQuestions}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Questões resolvidas ao longo das 4 semanas.
                  </p>
                </div>
              </div>

              {/* TRAJECTORY CHART & VOLUME CONTAINER */}
              <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Trajetória Semanal de Acurácia
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Desempenho registrado em cada janela semanal de prática.
                  </p>
                </div>

                {/* SVG TRAJECTORY LINE CHART */}
                <div className="relative pt-4 pb-2">
                  <div className="grid grid-cols-4 gap-2">
                    {evolutionWeeks.map((w, idx) => (
                      <div key={idx} className="text-center space-y-2">
                        <div className="h-28 flex flex-col justify-end items-center">
                          {w.hasData ? (
                            <div className="w-full flex flex-col items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-white">
                                {w.rate}%
                              </span>
                              <div
                                className="w-full max-w-[48px] bg-cyan-500/20 border border-cyan-400/40 rounded-t-lg transition-all duration-500 hover:bg-cyan-500/30"
                                style={{ height: `${Math.max(16, (w.rate / 100) * 80)}px` }}
                              />
                            </div>
                          ) : (
                            <div className="h-8 flex items-center justify-center text-[10px] text-zinc-500 italic">
                              Sem atividade
                            </div>
                          )}
                        </div>

                        <div className="border-t border-zinc-800 pt-2 space-y-0.5">
                          <span className="text-xs font-bold text-zinc-300 block">
                            {w.week}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono block">
                            {w.hasData ? `${w.questions} questões` : "0 questões"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* FACTUAL OBSERVATION SUMMARY */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-300 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="font-bold text-white block">Leitura do Período</span>
                    <p className="text-zinc-400 text-[11px]">
                      {trajectorySummary.deltaPp > 0
                        ? `Sua taxa de acerto variou de ${trajectorySummary.firstRate}% para ${trajectorySummary.latestRate}% (+${trajectorySummary.deltaPp} p.p.) ao longo das últimas 4 semanas de prática.`
                        : trajectorySummary.deltaPp < 0
                        ? `Sua taxa de acerto variou de ${trajectorySummary.firstRate}% para ${trajectorySummary.latestRate}% (${trajectorySummary.deltaPp} p.p.) nas semanas analisadas.`
                        : `Sua taxa de acerto se manteve estável em ${trajectorySummary.latestRate}% nas semanas analisadas.`}
                    </p>
                  </div>
                </div>

                {/* INEP HISTORICAL TRENDS FOOTER BANNER */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                      <PieChart className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-white block">
                        Recorrência Histórica das Provas INEP
                      </span>
                      <span className="text-zinc-400 text-[11px] block">
                        Consulte o mapa de temas mais cobrados nas edições anteriores do Revalida.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("desempenho-tendencias")}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border border-zinc-800 transition-colors cursor-pointer self-start sm:self-center"
                  >
                    Ver Tendências Históricas INEP →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. MATRIZ DE COMPETÊNCIAS (ROTA PRESERVADA / SUBVIEW ESPECIALIZADA) */}
      {currentSubTab === "MATRIZ" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab("desempenho-areas")}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar para Desempenho por Área</span>
            </button>
          </div>
          <KnowledgeGraphView />
        </div>
      )}

      {/* 4. TENDÊNCIAS INEP (ROTA PRESERVADA / SUBVIEW ESPECIALIZADA) */}
      {currentSubTab === "TENDENCIAS" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab("desempenho-evolucao")}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar para Evolução</span>
            </button>
          </div>
          <InepPatternEngineView />
        </div>
      )}

      {/* 5. DESEMPENHO POR ÁREA (REFINED VIEW) */}
      {currentSubTab === "AREAS" && (
        <div className="space-y-6">
          {/* HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-xs shadow-cyan-400/50" />
                  <span>Desempenho por Área</span>
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
                  5 Grandes Áreas
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Compare seu rendimento e descubra quais temas exigem maior atenção em cada especialidade.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("desempenho-matriz")}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ver Matriz de Competências</span>
              </button>
            </div>
          </div>

          {totalAllAttempts === 0 ? (
            /* Empty State */
            <div className="p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-center space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h2 className="text-base font-bold text-white">Ainda não há dados suficientes para comparar</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Resolva questões nas 5 grandes áreas para visualizar seu diagnóstico comparativo de acertos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("praticar-questoes")}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer inline-flex items-center gap-2 shadow-md"
              >
                <span>Começar a Resolver Questões</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 5 AREAS COMPARATIVE SELECTOR (FIXED CANONICAL ORDER) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {areaPerformance.map((item) => {
                  const isSelected = item.area === selectedAreaId;
                  const hasData = item.total > 0;

                  return (
                    <button
                      key={item.area}
                      type="button"
                      onClick={() => setSelectedAreaId(item.area)}
                      className={`p-4 rounded-2xl text-left border transition-all flex flex-col justify-between min-h-[120px] cursor-pointer ${
                        isSelected
                          ? "bg-cyan-500/10 border-cyan-500 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500/40"
                          : "bg-zinc-950 border-zinc-800/80 hover:bg-zinc-900/60"
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-white line-clamp-1">
                          {item.name}
                        </span>

                        {hasData ? (
                          <div className="flex items-baseline gap-1">
                            <span
                              className={`text-xl font-black ${
                                item.accuracy >= 70 ? "text-emerald-400" : "text-amber-400"
                              }`}
                            >
                              {item.accuracy}%
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">acertos</span>
                          </div>
                        ) : (
                          <div className="text-xs font-medium text-zinc-500 pt-0.5">
                            Sem dados ainda
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                        {hasData ? (
                          <>
                            <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  item.accuracy >= 70 ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                                style={{ width: `${item.accuracy}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-400 block font-mono">
                              {item.total} {item.total === 1 ? "questão" : "questões"}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-zinc-600 block">
                            Nenhuma tentativa
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* SELECTED AREA DETAILED DIAGNOSTIC PANEL */}
              <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-white">
                        {selectedAreaData.name}
                      </h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                        Área Selecionada
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {selectedAreaData.total > 0
                        ? `Acurácia observada de ${selectedAreaData.accuracy}% em ${selectedAreaData.total} questões respondidas nesta especialidade.`
                        : "Ainda não há questões registradas nesta área."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQuestionFilterArea(selectedAreaId);
                        setActiveTab("praticar-questoes");
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
                    >
                      <span>Praticar Questões de {selectedAreaData.name}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* TEMAS QUE MERECEM ATENÇÃO NA ÁREA */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Temas que merecem atenção nesta área</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("desempenho-matriz")}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      Ver Matriz Completa →
                    </button>
                  </div>

                  {selectedAreaData.topNodes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {selectedAreaData.topNodes.map((node) => (
                        <div
                          key={node.id}
                          className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white line-clamp-1">{node.name}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-2">
                            {node.description || "Diagnóstico, conduta terapêutica e diretrizes do Ministério da Saúde."}
                          </p>
                          <div className="pt-1 flex items-center justify-between text-[10px] text-zinc-500 border-t border-zinc-900">
                            <span>Domínio estimado: {node.userMastery || 0}%</span>
                            <span className="text-amber-400 font-semibold">Revisão sugerida</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-400">
                      Ponto de atenção geral: <strong className="text-white">{selectedAreaData.weakSpot}</strong>.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
