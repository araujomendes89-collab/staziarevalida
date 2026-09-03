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
  const { activeTab, setActiveTab, attempts, questions, knowledgeGraph, readinessData } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<DesempenhoSubTab>(initialSubTab);

  useEffect(() => {
    if (activeTab === "desempenho-evolucao" || activeTab === "evolucao") {
      setCurrentSubTab("EVOLUCAO");
    } else if (activeTab === "desempenho-matriz" || activeTab === "matrix") {
      setCurrentSubTab("MATRIZ");
    } else if (activeTab === "desempenho-tendencias" || activeTab === "pattern-engine" || activeTab === "tendencias") {
      setCurrentSubTab("TENDENCIAS");
    } else if (activeTab === "desempenho-areas") {
      setCurrentSubTab("AREAS");
    } else if (activeTab === "desempenho-geral" || activeTab === "desempenho" || activeTab === "progress") {
      setCurrentSubTab("GERAL");
    }
  }, [activeTab]);

  // Dynamic Weekly Evolution Calculation
  const evolutionWeeks = useMemo(() => {
    const totalAttempts = attempts?.length ?? 0;
    if (totalAttempts === 0) {
      return [
        { week: "Semana 1", rate: 0, questions: 0 },
        { week: "Semana 2", rate: 0, questions: 0 },
        { week: "Semana 3", rate: 0, questions: 0 },
        { week: "Semana Atual", rate: 0, questions: 0 },
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
      });
    }

    return weeks;
  }, [attempts]);

  // Dynamic Area Performance Breakdown from real attempts & knowledge nodes
  const areaPerformance = useMemo(() => {
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    return MEDICAL_AREAS.map((area) => {
      const areaAttempts = attempts.filter((att) => {
        const q = questionMap.get(att.questionId);
        return q?.area === area;
      });

      const total = areaAttempts.length;
      const correct = areaAttempts.filter((a) => a.isCorrect).length;
      const accuracy = total > 0
        ? Math.round((correct / total) * 100)
        : Math.round(readinessData?.areaBreakdown?.[area] || 0);

      // Find weakest node for this area in knowledge graph
      const areaNodes = knowledgeGraph.filter((n) => n.area === area);
      const weakNode = areaNodes.length > 0
        ? [...areaNodes].sort((a, b) => (a.userMastery || 0) - (b.userMastery || 0))[0]
        : null;

      const weakSpot = weakNode?.name || "Diagnóstico e Condutas Prioritárias";

      return {
        area,
        accuracy,
        total,
        weakSpot,
      };
    });
  }, [attempts, questions, knowledgeGraph, readinessData]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* SUBVIEWS */}
      {/* 1. VISÃO GERAL */}
      {currentSubTab === "GERAL" && <UnifiedProgressView />}

      {/* 2. EVOLUÇÃO */}
      {currentSubTab === "EVOLUCAO" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-xs shadow-cyan-400/50" />
                  <span>Evolução do Desempenho</span>
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
                  Dados Reais
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Progresso contínuo de acertos nas últimas 4 semanas de simulados e questões resolvidas.
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

          <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 text-xs">
              <span className="font-bold text-white">Trajetória Semanal de Acurácia</span>
              <span className="text-zinc-400 font-mono">
                Total registrado: <strong className="text-cyan-400">{attempts.length} questões</strong>
              </span>
            </div>

            {/* Timeline Bars */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              {evolutionWeeks.map((w, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 text-center">
                  <span className="text-xs text-zinc-400">{w.week}</span>
                  <div className="text-2xl font-black text-cyan-400">{w.rate}%</div>
                  <span className="text-[11px] text-zinc-500">{w.questions} questões</span>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                      style={{ width: `${w.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
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

      {/* 5. DESEMPENHO POR ÁREA */}
      {currentSubTab === "AREAS" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-xs shadow-cyan-400/50" />
                  <span>Desempenho por Área Médica</span>
                </h1>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Acurácia individual e diagnóstico de pontos prioritários de revisão nas 5 Grandes Áreas do Revalida.
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {areaPerformance.map((item, idx) => (
              <div key={idx} className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{formatMedicalArea(item.area)}</span>
                  <span
                    className={`text-base font-black ${
                      item.accuracy >= 70 ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {item.accuracy}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.accuracy >= 70 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${item.accuracy}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-400">
                  <span>
                    {item.total > 0 ? `${item.total} questões resolvidas` : "Aguardando treino"}
                  </span>
                  <div className="mt-1 text-zinc-300">
                    <span className="text-amber-400 font-semibold">Ponto a revisar:</span> {item.weakSpot}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
