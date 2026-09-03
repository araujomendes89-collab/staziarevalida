import React from "react";
import {
  CalendarCheck,
  Tv,
  Target,
  FolderOpen,
  ArrowRight,
  Sparkles,
  BookOpen,
  Clock,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../../context/AppContext";

export const EstudarHubView: React.FC = () => {
  const { todayMission, knowledgeGraph, setActiveTab, setQuestionFilterArea } = useApp();

  const topWeakness =
    Array.isArray(knowledgeGraph) && knowledgeGraph.length > 0
      ? [...knowledgeGraph].sort(
          (a, b) => (b?.expectedPointGain ?? 0) - (a?.expectedPointGain ?? 0)
        )[0]
      : null;

  const focusTopic =
    todayMission?.focusTopic || topWeakness?.name || "Pré-Eclâmpsia e Eclâmpsia";
  const targetArea =
    todayMission?.targetArea || topWeakness?.area || "GINECOLOGIA_OBSTETRICIA";
  const formattedArea = targetArea.replace(/_/g, " ");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 1. CONTINUAR ESTUDO — PLANO DE HOJE */}
      <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-[#0B192C] via-[#10243E] to-[#0A1A2F] text-white border border-[#1B355A] shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <CalendarCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Plano de Hoje</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {focusTopic}
            </h2>
            <p className="text-xs text-slate-300">
              Área: <span className="text-teal-300 capitalize font-medium">{formattedArea}</span> • Ciclo recomendado de ~60 minutos
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("estudar-plano-hoje")}
            className="px-5 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.02] cursor-pointer shrink-0"
          >
            <span>Acessar Plano de Hoje</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. ÁREAS DE ESTUDO (Aulas, Grandes Temas, Materiais Oficiais) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card: Aulas */}
        <div
          onClick={() => setActiveTab("estudar-aulas")}
          className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-400 hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Tv className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                Aulas
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Aulas teórico-práticas focadas nos temas de alta incidência e condutas do SUS.
              </p>
            </div>
          </div>

          <div className="flex items-center text-xs font-semibold text-teal-700 group-hover:translate-x-0.5 transition-transform">
            <span>Explorar catálogo</span>
            <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </div>

        {/* Card: Grandes Temas */}
        <div
          onClick={() => setActiveTab("estudar-grandes-temas")}
          className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Target className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                Grandes Temas
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Os 75 assuntos essenciais divididos pelas 5 grandes áreas médicas do Revalida.
              </p>
            </div>
          </div>

          <div className="flex items-center text-xs font-semibold text-blue-700 group-hover:translate-x-0.5 transition-transform">
            <span>Ver matriz de temas</span>
            <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </div>

        {/* Card: Materiais Oficiais */}
        <div
          onClick={() => setActiveTab("estudar-materiais")}
          className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 hover:border-purple-400 hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FolderOpen className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                Materiais Oficiais
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                PCDTs, diretrizes clínicas do Ministério da Saúde e protocolos de referência.
              </p>
            </div>
          </div>

          <div className="flex items-center text-xs font-semibold text-purple-700 group-hover:translate-x-0.5 transition-transform">
            <span>Consultar documentos</span>
            <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </div>
      </div>
    </div>
  );
};
