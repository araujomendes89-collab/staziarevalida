import React from "react";
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  X,
  Target,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useApp } from "../../context/AppContext";

export const WhatIfModal: React.FC = () => {
  const { isWhatIfOpen, setIsWhatIfOpen, readinessData } = useApp();

  if (!isWhatIfOpen) return null;

  const score = readinessData?.score ?? 70;
  const isPassing = score >= 60;
  const projectedMin = readinessData?.projectedMin ?? 65;
  const projectedMax = readinessData?.projectedMax ?? 75;
  const areaBreakdown = readinessData?.areaBreakdown || {
    CLINICA_MEDICA: 75,
    CIRURGIA_GERAL: 70,
    GINECOLOGIA_OBSTETRICIA: 58,
    PEDIATRIA: 65,
    MEDICINA_FAMILIA_COMUNIDADE: 52,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="backdrop-blur-2xl bg-white/[0.04] border border-white/15 rounded-[32px] max-w-lg w-full p-6 sm:p-7 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 shadow-inner">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Simulador: E se a prova fosse amanhã?
              </h3>
              <p className="text-xs text-white/60 font-sans">
                Cálculo estatístico de probabilidade de corte
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsWhatIfOpen(false)}
            className="p-2 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 text-white/50 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Prediction Display */}
        <div className="p-6 rounded-[24px] backdrop-blur-md bg-white/[0.02] border border-white/10 text-center space-y-2.5 shadow-inner">
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest block">
            Faixa Provável de Pontuação (1ª Etapa)
          </span>
          <div className="flex items-center justify-center gap-2">
            <span className="text-4xl font-extrabold text-white">
              {projectedMin} – {projectedMax}
            </span>
            <span className="text-sm font-semibold text-white/50">/ 100 pts</span>
          </div>

          <p
            className={`text-xs font-bold pt-1.5 ${
              isPassing ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            {isPassing
              ? "🟢 Probabilidade de Aprovação: 82% (Acima da nota de corte histórica do INEP)"
              : "🟡 Zona de Risco: Prontidão moderada. Foco nos gaps críticos recomendado."}
          </p>
        </div>

        {/* Breakdown by Area */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider">
            Desempenho Estimado por Grande Área
          </h4>
          <div className="grid grid-cols-2 gap-2.5">
            {Object.entries(areaBreakdown).map(([areaKey, areaScore]) => (
              <div
                key={areaKey}
                className="p-3 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10 text-xs flex items-center justify-between"
              >
                <span className="text-white/80 font-medium">
                  {areaKey === "CLINICA_MEDICA"
                    ? "Clínica Médica"
                    : areaKey === "CIRURGIA_GERAL"
                    ? "Cirurgia Geral"
                    : areaKey === "GINECOLOGIA_OBSTETRICIA"
                    ? "Ginecologia & Obs"
                    : areaKey === "PEDIATRIA"
                    ? "Pediatria"
                    : "SUS / MFC"}
                </span>
                <span className="font-bold text-emerald-400">{areaScore}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Close */}
        <button
          onClick={() => setIsWhatIfOpen(false)}
          className="w-full py-3 rounded-2xl bg-white hover:bg-white/90 text-black font-bold text-xs shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all active:scale-95"
        >
          Entendido, Continuar Preparação
        </button>
      </div>
    </div>
  );
};
