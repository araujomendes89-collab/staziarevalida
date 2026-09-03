import React from "react";
import {
  Radar,
  BellRing,
  AlertCircle,
  FileCheck,
  ExternalLink,
  Calendar,
  Sparkles,
  TrendingUp,
  Scale,
} from "lucide-react";
import { useApp } from "../../context/AppContext";

export const RevalidaRadarView: React.FC = () => {
  const { radarUpdates, setActiveTab, setQuestionFilterArea } = useApp();

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Radar className="w-5 h-5 text-indigo-400" />
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest backdrop-blur-md bg-indigo-500/15 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              Revalida Radar & Central de Inteligência
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Monitoramento de Editais & Atualizações Clínicas
          </h2>
          <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-xl">
            Acompanhamento contínuo de retificações do INEP, novos PCDTs do Ministério da Saúde, notas técnicas e impacto direto no banco de questões.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 backdrop-blur-md bg-emerald-500/15 px-3.5 py-2 rounded-2xl border border-emerald-500/30 shrink-0">
          <BellRing className="w-4 h-4 text-emerald-400" />
          <span>Monitoramento Ativo 24/7</span>
        </div>
      </div>

      {/* Radar Updates Feed */}
      <div className="space-y-4">
        {radarUpdates.map((update) => {
          const isCritical = update.urgency === "CRITICAL";

          return (
            <div
              key={update.id}
              className={`p-6 rounded-[28px] backdrop-blur-2xl border transition-all shadow-2xl ${
                isCritical
                  ? "bg-red-500/10 border-red-500/30 hover:border-red-500/50"
                  : "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-md ${
                      update.category === "EDITAL_ALERT"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : update.category === "PCDT_UPDATE"
                        ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                    }`}
                  >
                    {update.category === "EDITAL_ALERT"
                      ? "ALERTA DE EDITAL INEP"
                      : update.category === "PCDT_UPDATE"
                      ? "NOVA DIRETRIZ CLÍNICA MS"
                      : "JURISPRUDÊNCIA / GABARITO"}
                  </span>
                  <span className="text-xs text-white/50 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {update.date}
                  </span>
                </div>

                {update.affectedArea && (
                  <span className="text-[11px] font-bold text-white/60">
                    Área: {update.affectedArea.replace("_", " ")}
                  </span>
                )}
              </div>

              <h3 className="text-base sm:text-lg font-bold text-white">{update.title}</h3>
              <p className="text-xs sm:text-sm text-white/70 mt-2 leading-relaxed font-sans">
                {update.summary}
              </p>

              {/* Impact on Exam Box */}
              <div className="mt-3.5 p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10 text-xs">
                <p className="text-emerald-400 font-bold mb-1">
                  🎯 Como isso afeta sua prova:
                </p>
                <p className="text-white/80 leading-relaxed font-sans">
                  {update.impactOnExam}
                </p>
              </div>

              {/* Action */}
              <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] text-white/40">
                  Fonte: {update.sourceUrl}
                </span>

                <button
                  onClick={() => {
                    if (update.affectedArea) {
                      setQuestionFilterArea(update.affectedArea as any);
                      setActiveTab("questions");
                    } else {
                      setActiveTab("questions");
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl backdrop-blur-md bg-white/10 hover:bg-white text-white hover:text-black text-xs font-bold transition-all active:scale-95 border border-white/15"
                >
                  <span>Praticar Questões do Tema</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
