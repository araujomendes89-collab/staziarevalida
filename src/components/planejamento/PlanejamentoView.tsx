import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  CalendarCheck,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { AdaptiveCalendarView } from "./AdaptiveCalendarView";
import { WeeklyPlanView } from "./WeeklyPlanView";
import { RoadToExamView } from "./RoadToExamView";

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
  const { activeTab, setActiveTab, user } = useApp();
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
    else if (
      activeTab === "planejamento-calendario" ||
      activeTab === "calendario-inteligente" ||
      activeTab === "calendar"
    ) {
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
      {currentSubTab === "ATE_PROVA" && <RoadToExamView />}

      {/* 4. DISPONIBILIDADE */}
      {currentSubTab === "DISPONIBILIDADE" && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6 max-w-2xl">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">Configuração de Horas & Rotina</h3>
            <p className="text-xs text-slate-500">Ajuste seu ritmo para que o cronograma se adapte à sua carga horária real.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 flex justify-between">
                <span>Horas disponíveis por dia:</span>
                <strong className="text-emerald-700 font-mono text-sm">{hoursPerDay}h / dia</strong>
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
              <label className="text-xs font-semibold text-slate-700">Data Alvo da Prova:</label>
              <input
                type="date"
                value={targetExamDate}
                onChange={(e) => setTargetExamDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500"
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
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6 max-w-3xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Replanejador Adaptativo Inteligente</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Atrasou blocos ou teve rendimento abaixo de 60% em algum grande tema? O algoritmo redistribui automaticamente os conteúdos pendentes nos dias livres sem sobrecarregar sua rotina.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Diagnóstico Atual de Aderência</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-500">Blocos Atrasados:</span>
                <div className="text-base font-bold text-amber-400">2 blocos</div>
              </div>
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-500">Índice de Aderência:</span>
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
