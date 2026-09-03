import React from "react";
import {
  TrendingUp,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Flag,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { ExamEngine } from "../../services/examEngine";

export const RoadToExamView: React.FC = () => {
  const { setActiveTab, user } = useApp();

  const examInfo = ExamEngine.getExamInfo(
    user?.targetEdition,
    user?.examDate,
    user?.hasConfiguredExamDate !== false
  );

  const daysRemaining = examInfo.hasConfiguredDate ? examInfo.daysRemaining : 46;
  const targetEdition = examInfo.targetEdition || "Revalida INEP 2026/2";
  const examDateFormatted =
    examInfo.hasConfiguredDate && examInfo.examDate
      ? examInfo.examDate.split("-").reverse().join("/")
      : "13/09/2026";

  const phases = [
    {
      number: 1,
      name: "Domínio dos Grandes Temas",
      status: "IN_PROGRESS" as const,
      period: "Semanas 1 a 6",
      objective: "Cobertura estruturada dos 75 Grandes Temas StaziaMed e resolução direcionada de questões oficiais.",
      progressPct: 68,
    },
    {
      number: 2,
      name: "Simulados & Consolidação",
      status: "UPCOMING" as const,
      period: "Semanas 7 a 10",
      objective: "Simulados cronometrados de 100 questões aos sábados, fechamento de lacunas e treino sob pressão.",
    },
    {
      number: 3,
      name: "Reta Final & Atualizações",
      status: "UPCOMING" as const,
      period: "Últimas 2 Semanas",
      objective: "Revisão turbo de condutas de alto impacto, protocolos e esquemas terapêuticos do SUS.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* COMPACT CLEAN HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/50" />
              <span>Até a Prova</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {targetEdition}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Data oficial: <strong className="text-zinc-200">{examDateFormatted}</strong> •{" "}
            <span className="text-emerald-400 font-semibold">{daysRemaining} dias restantes</span> para a 1ª Etapa
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("planejamento-semanal")}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-900/20"
          >
            <span>Ver Plano Desta Semana</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MACRO JOURNEY TIMELINE (DESKTOP STEPPER / MOBILE VERTICAL) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Jornada de Preparação</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Cronograma macro em 3 fases estratégicas sincronizado com a data do exame.
          </p>
        </div>

        {/* Stepper Progress Visual Bar (Desktop) */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-4 relative">
          {phases.map((phase) => {
            const isCurrent = phase.status === "IN_PROGRESS";
            return (
              <div
                key={phase.number}
                className={`p-4 rounded-xl border transition-all space-y-2.5 flex flex-col justify-between ${
                  isCurrent
                    ? "bg-zinc-950 border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : "bg-zinc-950/60 border-zinc-800/80"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      FASE {phase.number}
                    </span>
                    {isCurrent ? (
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        EM ANDAMENTO
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500">{phase.period}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white">{phase.name}</h3>
                  {isCurrent && (
                    <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                      {phase.period}
                    </div>
                  )}
                  <p className="text-xs text-zinc-300 leading-relaxed pt-1">{phase.objective}</p>
                </div>

                {isCurrent && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                    <div className="flex justify-between text-[10px] font-semibold text-zinc-400">
                      <span>Progresso da Fase</span>
                      <span className="text-emerald-400">{phase.progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${phase.progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Vertical Stepper (Mobile / Tablet) */}
        <div className="lg:hidden space-y-3.5">
          {phases.map((phase) => {
            const isCurrent = phase.status === "IN_PROGRESS";
            return (
              <div
                key={phase.number}
                className={`p-4 rounded-xl border space-y-2 ${
                  isCurrent
                    ? "bg-zinc-950 border-emerald-500/40"
                    : "bg-zinc-950/60 border-zinc-800/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    FASE {phase.number} • {phase.period}
                  </span>
                  {isCurrent && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      EM ANDAMENTO
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">{phase.name}</h3>
                <p className="text-xs text-zinc-300">{phase.objective}</p>
                {isCurrent && (
                  <div className="space-y-1 pt-1.5">
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Progresso</span>
                      <span className="text-emerald-400 font-bold">{phase.progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${phase.progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Target Exam Final Marker */}
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Flag className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-white">Destino: 1ª Etapa {targetEdition}</span>
              <span className="text-zinc-400 text-[11px] block">
                Aplicação oficial prevista para {examDateFormatted}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("planejamento-calendario")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Ver Calendário
          </button>
        </div>
      </div>
    </div>
  );
};
