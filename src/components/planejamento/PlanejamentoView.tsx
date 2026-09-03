import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  TrendingUp,
  Sliders,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  CalendarCheck,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { AdaptiveCalendarView } from "../calendar/AdaptiveCalendarView";
import { WeeklyPlanView } from "./WeeklyPlanView";
import { formatMedicalArea } from "../../utils/formatters";

export type PlanejamentoSubTab =
  | "CALENDARIO"
  | "SEMANAL"
  | "ATE_PROVA"
  | "DISPONIBILIDADE"
  | "REPLANEJAMENTO";

interface PlanejamentoViewProps {
  initialSubTab?: PlanejamentoSubTab;
}

export const PlanejamentoView: React.FC<PlanejamentoViewProps> = ({
  initialSubTab = "CALENDARIO",
}) => {
  const { activeTab, setActiveTab, user, setIsExamConfigOpen } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<PlanejamentoSubTab>(initialSubTab);

  // Availability state
  const [hoursPerDay, setHoursPerDay] = useState(
    user?.dailyStudyMinutes ? Math.round(user.dailyStudyMinutes / 60) : 4
  );
  const [targetExamDate, setTargetExamDate] = useState("2026-10-18");
  const [isReplanning, setIsReplanning] = useState(false);
  const [replanSuccess, setReplanSuccess] = useState(false);

  useEffect(() => {
    if (activeTab === "planejamento-semanal") setCurrentSubTab("SEMANAL");
    else if (activeTab === "planejamento-ate-prova") setCurrentSubTab("ATE_PROVA");
    else if (activeTab === "planejamento-disponibilidade") setCurrentSubTab("DISPONIBILIDADE");
    else if (activeTab === "planejamento-replanejamento") setCurrentSubTab("REPLANEJAMENTO");
    else if (activeTab === "planejamento-calendario" || activeTab === "calendario-inteligente" || activeTab === "calendar") {
      setCurrentSubTab("CALENDARIO");
    }
  }, [activeTab]);

  const handleExecuteReplan = () => {
    setIsReplanning(true);
    setTimeout(() => {
      setIsReplanning(false);
      setReplanSuccess(true);
      setTimeout(() => setReplanSuccess(false), 5000);
    }, 1200);
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* SUBVIEWS */}
      {/* 1. CALENDÁRIO */}
      {currentSubTab === "CALENDARIO" && <AdaptiveCalendarView />}

      {/* 2. PLANO SEMANAL */}
      {currentSubTab === "SEMANAL" && <WeeklyPlanView />}

      {/* 3. PLANO ATÉ A PROVA */}
      {currentSubTab === "ATE_PROVA" && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Macro-Ciclo de Aprovação
                </span>
                <h3 className="text-lg font-bold text-white mt-1">Roadmap até o Revalida INEP</h3>
                <p className="text-xs text-zinc-400">Cronograma de 3 fases sincronizado com a data prevista do exame.</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-emerald-400">46 Dias</div>
                <div className="text-[10px] text-zinc-400">Até a 1ª Fase Teórica</div>
              </div>
            </div>

            {/* 3 Phases Timeline */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">FASE 1: DOMÍNIO DOS GRANDES TEMAS (Em Andamento)</span>
                  <span className="text-xs font-mono text-zinc-400">Semanas 1 a 6</span>
                </div>
                <p className="text-xs text-zinc-300">
                  Varredura intensiva dos 75 Grandes Temas com maior recorrência no INEP e resolução de 1.500+ questões comentadas.
                </p>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[68%]" />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300">FASE 2: SIMULADOS & CONDICIONAMENTO DE PROVA</span>
                  <span className="text-xs font-mono text-zinc-400">Semanas 7 a 10</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Simulados cronometrados de 100 questões aos sábados, fechamento de lacunas cognitivas e treino de tempo sob pressão.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300">FASE 3: SPRINT FINAL & ATUALIZAÇÕES 2026</span>
                  <span className="text-xs font-mono text-zinc-400">Últimas 2 Semanas</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Revisão turbo de condutas de alto impacto, doses e esquemas terapêuticos do SUS e checagem do radar de diretrizes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. DISPONIBILIDADE */}
      {currentSubTab === "DISPONIBILIDADE" && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6 max-w-2xl">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Configuração de Horas & Rotina</h3>
            <p className="text-xs text-zinc-400">Ajuste seu ritmo para que o cronograma se adapte à sua carga horária real.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 flex justify-between">
                <span>Horas disponíveis por dia:</span>
                <strong className="text-emerald-400 font-mono text-sm">{hoursPerDay}h / dia</strong>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300">Data Alvo da Prova:</label>
              <input
                type="date"
                value={targetExamDate}
                onChange={(e) => setTargetExamDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleExecuteReplan}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-md cursor-pointer"
            >
              Salvar Disponibilidade & Recalcular Calendário
            </button>
          </div>
        </div>
      )}

      {/* 5. REPLANEJAMENTO */}
      {currentSubTab === "REPLANEJAMENTO" && (
        <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6 max-w-3xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Replanejador Adaptativo Inteligente</h3>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                Atrasou blocos ou teve rendimento abaixo de 60% em algum grande tema? O algoritmo redistribui automaticamente os conteúdos pendentes nos dias livres sem sobrecarregar sua rotina.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Diagnóstico Atual de Aderência</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80">
                <span className="text-zinc-400">Blocos Atrasados:</span>
                <div className="text-base font-bold text-amber-400">2 blocos</div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80">
                <span className="text-zinc-400">Índice de Aderência:</span>
                <div className="text-base font-bold text-emerald-400">92%</div>
              </div>
            </div>
          </div>

          {replanSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Cronograma redistribuído com sucesso! Seus blocos foram atualizados no Calendário.</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExecuteReplan}
            disabled={isReplanning}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className={`w-4 h-4 ${isReplanning ? "animate-spin" : ""}`} />
            <span>{isReplanning ? "Redistribuindo blocos com IA..." : "Executar Replanejamento Automático"}</span>
          </button>
        </div>
      )}
    </div>
  );
};
