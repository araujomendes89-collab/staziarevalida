import React, { useState } from "react";
import {
  BarChart3,
  Calendar,
  BrainCircuit,
  Network,
  BookMarked,
  ShieldCheck,
  TrendingUp,
  Compass,
} from "lucide-react";
import { AdaptiveCalendarView } from "../calendar/AdaptiveCalendarView";
import { InepPatternEngineView } from "../patternEngine/InepPatternEngineView";
import { KnowledgeGraphView } from "../matrix/KnowledgeGraphView";
import { BrazilMedicineGuideView } from "../brazil/BrazilMedicineGuideView";
import { useApp } from "../../context/AppContext";
import { ExamEngine } from "../../services/examEngine";

export type ProgressSubTab = "READINESS" | "CALENDAR" | "TRENDS" | "MATRIX" | "SUS";

interface UnifiedProgressViewProps {
  defaultTab?: ProgressSubTab;
}

export const UnifiedProgressView: React.FC<UnifiedProgressViewProps> = ({
  defaultTab = "READINESS",
}) => {
  const { user, readinessData, setIsWhatIfOpen } = useApp();
  const [activeTab, setActiveTab] = useState<ProgressSubTab>(defaultTab);

  const examInfo = ExamEngine.getExamInfo(user.targetEdition, user.examDate);

  const cutoff = examInfo.confidenceInterval?.historicalCutoff || 60;
  const projectedMin = readinessData.projectedMin ?? 58;
  const projectedMax = readinessData.projectedMax ?? 67;

  // Cutoff evaluation logic
  let cutoffEvaluationText = `A faixa projetada cruza o ponto de corte (${cutoff} pts)`;
  let cutoffEvaluationColor = "text-amber-400";
  if (projectedMin >= cutoff) {
    cutoffEvaluationText = `Acima do corte de referência (${cutoff} pts)`;
    cutoffEvaluationColor = "text-emerald-400";
  } else if (projectedMax < cutoff) {
    cutoffEvaluationText = `Abaixo do corte de referência (${cutoff} pts)`;
    cutoffEvaluationColor = "text-red-400";
  }

  const dynamicMargin = Math.max(2, Math.round((projectedMax - projectedMin) / 2));

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      {/* Sub-tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#111420] border border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Progresso
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Minha evolução
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {examInfo.targetEdition} · {examInfo.badgeText}
          </p>
        </div>

        {/* 5 Sub-tabs with accessible 44px min touch height */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] self-start sm:self-center">
          <button
            onClick={() => setActiveTab("READINESS")}
            id="progress-tab-readiness"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "READINESS"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Aprovação</span>
          </button>

          <button
            onClick={() => setActiveTab("CALENDAR")}
            id="progress-tab-calendar"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "CALENDAR"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendário</span>
          </button>

          <button
            onClick={() => setActiveTab("TRENDS")}
            id="progress-tab-trends"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "TRENDS"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>Tendências INEP</span>
          </button>

          <button
            onClick={() => setActiveTab("MATRIX")}
            id="progress-tab-matrix"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "MATRIX"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Matriz</span>
          </button>

          <button
            onClick={() => setActiveTab("SUS")}
            id="progress-tab-sus"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "SUS"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>SUS & Brasil</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="pt-2">
        {activeTab === "READINESS" && (
          <div className="space-y-6">
            {/* Readiness Summary Card */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#111420] border border-white/[0.08] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Probabilidade & Projeção de Nota
                  </span>
                  <h2 className="text-xl font-bold text-white tracking-tight mt-1">
                    Probabilidade estimada de superar o corte: {readinessData.score}%
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xl">
                    Referência configurada: {cutoff} pontos · {examInfo?.targetEdition || "Revalida INEP"} · {examInfo?.officialDetails?.edital || "Edital Padrão INEP"}
                  </p>
                </div>

                <button
                  onClick={() => setIsWhatIfOpen(true)}
                  className="px-5 py-3 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer min-h-[44px]"
                >
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  <span>Simular Prova Hoje</span>
                </button>
              </div>

              {/* Statistical Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                    Faixa de Nota Projetada (1ª Etapa)
                  </span>
                  <p className="text-2xl font-bold text-white">
                    {projectedMin}–{projectedMax} <span className="text-xs text-zinc-500 font-normal">/ 100</span>
                  </p>
                  <p className={`text-[10px] font-medium ${cutoffEvaluationColor}`}>
                    {cutoffEvaluationText}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                    Intervalo de Confiança (IC)
                  </span>
                  <p className="text-2xl font-bold text-white">
                    95%
                  </p>
                  <p className="text-[10px] text-zinc-400 font-medium">
                    Margem de erro: ±{dynamicMargin} pontos
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                    Evolução Recente (14d)
                  </span>
                  <p className="text-2xl font-bold text-emerald-400">
                    +{readinessData.trend}%
                  </p>
                  <p className="text-[10px] text-zinc-400 font-medium">
                    {user.totalQuestionsSolved ?? 0} questões resolvidas
                  </p>
                </div>
              </div>

              {/* Area Breakdown Progress Bars */}
              <div className="space-y-3 pt-4 border-t border-white/[0.06]">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Desempenho por área
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                    <div className="flex justify-between text-xs text-zinc-300 font-medium">
                      <span>Clínica Médica</span>
                      <span className="text-emerald-400 font-semibold">{readinessData.areaBreakdown.CLINICA_MEDICA}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${readinessData.areaBreakdown.CLINICA_MEDICA}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                    <div className="flex justify-between text-xs text-zinc-300 font-medium">
                      <span>Cirurgia Geral</span>
                      <span className="text-emerald-400 font-semibold">{readinessData.areaBreakdown.CIRURGIA_GERAL}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${readinessData.areaBreakdown.CIRURGIA_GERAL}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                    <div className="flex justify-between text-xs text-zinc-300 font-medium">
                      <span>Ginecologia & Obstetrícia</span>
                      <span className="text-amber-400 font-semibold">{readinessData.areaBreakdown.GINECOLOGIA_OBSTETRICIA}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${readinessData.areaBreakdown.GINECOLOGIA_OBSTETRICIA}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                    <div className="flex justify-between text-xs text-zinc-300 font-medium">
                      <span>Pediatria</span>
                      <span className="text-emerald-400 font-semibold">{readinessData.areaBreakdown.PEDIATRIA}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${readinessData.areaBreakdown.PEDIATRIA}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 sm:col-span-2">
                    <div className="flex justify-between text-xs text-zinc-300 font-medium">
                      <span>Medicina Preventiva, Social & SUS</span>
                      <span className="text-emerald-400 font-semibold">{readinessData.areaBreakdown.MEDICINA_FAMILIA_COMUNIDADE}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${readinessData.areaBreakdown.MEDICINA_FAMILIA_COMUNIDADE}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Method Transparency Box */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-400 leading-relaxed font-sans">
                <strong className="text-zinc-300">Como calculamos: </strong>
                {examInfo?.confidenceInterval?.formulaExplanation || "Calculado via calibração adaptativa ponderada por incidência oficial do INEP e curva de retenção."}
              </div>
            </div>
          </div>
        )}

        {activeTab === "CALENDAR" && <AdaptiveCalendarView />}
        {activeTab === "TRENDS" && <InepPatternEngineView />}
        {activeTab === "MATRIX" && <KnowledgeGraphView />}
        {activeTab === "SUS" && <BrazilMedicineGuideView />}
      </div>
    </div>
  );
};
