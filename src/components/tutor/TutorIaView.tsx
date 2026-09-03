import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Car,
  History,
  MessageSquare,
  Mic,
  Volume2,
  Brain,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { VoiceTutorView } from "../voice/VoiceTutorView";

export type TutorIaSubTab = "CONVERSAR" | "TRANSITO" | "HISTORICO";

interface TutorIaViewProps {
  initialSubTab?: TutorIaSubTab;
}

export const TutorIaView: React.FC<TutorIaViewProps> = ({ initialSubTab = "CONVERSAR" }) => {
  const { activeTab, setActiveTab } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<TutorIaSubTab>(initialSubTab);

  useEffect(() => {
    if (activeTab === "tutor-transito") setCurrentSubTab("TRANSITO");
    else if (activeTab === "tutor-historico") setCurrentSubTab("HISTORICO");
    else if (activeTab === "tutor-conversar" || activeTab === "voice-tutor" || activeTab === "tutor-ia") {
      setCurrentSubTab("CONVERSAR");
    }
  }, [activeTab]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Section Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-xs shadow-indigo-400/50" />
            <span>Tutor IA</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Discussão clínica socrática, modo trânsito em áudio contínuo e histórico de dúvidas com citações do SUS.
          </p>
        </div>

        {/* 3 Area Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 p-1 rounded-2xl overflow-x-auto">
          {[
            { id: "CONVERSAR" as TutorIaSubTab, label: "Conversar com Tutor", icon: MessageSquare, navTab: "tutor-conversar" as const },
            { id: "TRANSITO" as TutorIaSubTab, label: "Modo Trânsito", icon: Car, navTab: "tutor-transito" as const },
            { id: "HISTORICO" as TutorIaSubTab, label: "Histórico", icon: History, navTab: "tutor-historico" as const },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = currentSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setCurrentSubTab(tab.id);
                  setActiveTab(tab.navTab);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs font-bold"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-zinc-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SUBVIEWS */}
      {/* 1. CONVERSAR COM TUTOR */}
      {currentSubTab === "CONVERSAR" && <VoiceTutorView />}

      {/* 2. MODO TRÂNSITO */}
      {currentSubTab === "TRANSITO" && (
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#0c1020] via-[#101730] to-[#0c1224] border border-indigo-500/20 text-center space-y-6 max-w-2xl mx-auto shadow-2xl">
          <div className="w-20 h-20 rounded-3xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/30 shadow-xl">
            <Car className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-white">Modo Trânsito Hands-Free</h2>
            <p className="text-xs text-zinc-300 max-w-md mx-auto leading-relaxed">
              Interface simplificada em tela cheia com ativação por voz contínua para estudar condutas clínicas e doses enquanto dirige ou se desloca.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setCurrentSubTab("CONVERSAR")}
              className="px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-xl shadow-indigo-600/30 transition-all flex items-center gap-3 mx-auto cursor-pointer hover:scale-105"
            >
              <Mic className="w-5 h-5 animate-pulse" />
              <span>Iniciar Sessão por Voz</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. HISTÓRICO */}
      {currentSubTab === "HISTORICO" && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-4 max-w-3xl">
          <h3 className="text-base font-bold text-white">Dúvidas Clínicas Recentes</h3>
          <div className="space-y-3">
            {[
              { query: "Critérios de gravidade da Pré-Eclâmpsia e esquema de Zuspan", date: "Hoje às 11:20", area: "GINECOLOGIA_OBSTETRICIA" },
              { query: "Dose de Sulfato de Magnésio no ataque e manutenção", date: "Ontem às 22:45", area: "GINECOLOGIA_OBSTETRICIA" },
              { query: "Conduta na Síndrome Coronariana Aguda sem Supra de ST com escore GRACE alto", date: "Há 2 dias", area: "CLINICA_MEDICA" },
            ].map((item, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-white">{item.query}</h4>
                  <span className="text-[10px] text-zinc-500">{item.date}</span>
                </div>
                <button
                  onClick={() => setCurrentSubTab("CONVERSAR")}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 text-xs font-semibold border border-zinc-800 shrink-0 cursor-pointer"
                >
                  Continuar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
