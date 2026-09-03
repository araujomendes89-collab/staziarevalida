import React, { useState } from "react";
import {
  Zap,
  Clock,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  X,
  Target,
} from "lucide-react";
import { useApp } from "../../context/AppContext";

export const StudyForMeModal: React.FC = () => {
  const {
    isStudyForMeOpen,
    setIsStudyForMeOpen,
    generateCustomStudySession,
    todayMission,
    setActiveTab,
    setQuestionFilterArea,
  } = useApp();

  const [selectedDuration, setSelectedDuration] = useState<15 | 30 | 60 | 120>(30);

  if (!isStudyForMeOpen) return null;

  const handleSelectDuration = (minutes: 15 | 30 | 60 | 120) => {
    setSelectedDuration(minutes);
    generateCustomStudySession(minutes);
  };

  const handleStartMission = () => {
    setQuestionFilterArea(todayMission.targetArea);
    setIsStudyForMeOpen(false);
    setActiveTab("questions");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="backdrop-blur-2xl bg-white/[0.04] border border-white/15 rounded-[32px] max-w-xl w-full p-6 sm:p-7 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shadow-inner">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Modo: "Estude Para Mim"
              </h3>
              <p className="text-xs text-white/60 font-sans">
                Quanto tempo você tem livre neste momento?
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsStudyForMeOpen(false)}
            className="p-2 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 text-white/50 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Duration Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { mins: 15, label: "15 min", desc: "Sprint Focado" },
            { mins: 30, label: "30 min", desc: "Alta Eficiência" },
            { mins: 60, label: "1 hora", desc: "Ciclo Completo" },
            { mins: 120, label: "2 horas", desc: "Imersão Prova" },
          ].map((item) => (
            <button
              key={item.mins}
              onClick={() => handleSelectDuration(item.mins as any)}
              className={`p-3.5 rounded-2xl border text-center transition-all ${
                selectedDuration === item.mins
                  ? "bg-white text-black font-bold shadow-[0_0_20px_rgba(255,255,255,0.2)] border-white"
                  : "backdrop-blur-md bg-white/[0.03] border-white/10 text-white/80 hover:bg-white/[0.06] hover:border-white/20"
              }`}
            >
              <p className="font-bold text-sm">{item.label}</p>
              <p className={`text-[10px] mt-0.5 ${selectedDuration === item.mins ? "text-black/70" : "text-white/40"}`}>{item.desc}</p>
            </button>
          ))}
        </div>

        {/* Generated Session Preview */}
        <div className="p-5 rounded-[24px] backdrop-blur-md bg-white/[0.02] border border-white/10 space-y-3 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest backdrop-blur-md bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              Plano Gerado pelo Algoritmo
            </span>
            <span className="text-xs font-bold text-white/80">
              {todayMission.estimatedMinutes} minutos
            </span>
          </div>

          <h4 className="text-sm font-bold text-white">{todayMission.title}</h4>
          <p className="text-xs text-white/60 leading-relaxed font-sans">
            {todayMission.rationale}
          </p>

          <div className="space-y-2 pt-2">
            {todayMission.tasks.map((task, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl backdrop-blur-md bg-white/[0.02] border border-white/10 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-indigo-300 border border-white/10">
                    {idx + 1}
                  </span>
                  <span className="text-white/90 font-medium">{task.description}</span>
                </div>
                <span className="text-white/40 text-[11px] font-mono">{task.minutes} min</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-end gap-2.5 pt-1">
          <button
            onClick={() => setIsStudyForMeOpen(false)}
            className="px-5 py-2.5 rounded-2xl text-xs font-semibold text-white/60 hover:text-white backdrop-blur-md bg-white/5 border border-white/10 transition-all"
          >
            Cancelar
          </button>

          <button
            onClick={handleStartMission}
            className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-white hover:bg-white/90 text-black font-bold text-xs transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            <span>INICIAR SESSÃO AGORA</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
