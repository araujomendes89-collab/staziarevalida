import React, { useState, useEffect } from "react";
import {
  CalendarCheck,
  Tv,
  Target,
  FolderOpen,
  Sparkles,
  BookOpen,
  ChevronRight,
  Flame,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { VideoLessonsCatalogView } from "../lessons/VideoLessonsCatalogView";
import { GrandesTemasView } from "../grandesTemas/GrandesTemasView";
import { OfficialMedicalSearchView } from "../search/OfficialMedicalSearchView";
import { DashboardView } from "../dashboard/DashboardView";

export type EstudarSubTab = "PLANO_HOJE" | "AULAS" | "GRANDES_TEMAS" | "MATERIAIS";

interface EstudarViewProps {
  initialSubTab?: EstudarSubTab;
}

export const EstudarView: React.FC<EstudarViewProps> = ({ initialSubTab = "PLANO_HOJE" }) => {
  const { todayMission, setActiveTab, activeTab } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<EstudarSubTab>(initialSubTab);

  // Sync with activeTab if changed externally
  useEffect(() => {
    if (activeTab === "estudar-aulas") setCurrentSubTab("AULAS");
    else if (activeTab === "estudar-grandes-temas" || activeTab === "grandes-temas") setCurrentSubTab("GRANDES_TEMAS");
    else if (activeTab === "estudar-materiais" || activeTab === "official-search") setCurrentSubTab("MATERIAIS");
    else if (activeTab === "estudar-plano-hoje") setCurrentSubTab("PLANO_HOJE");
  }, [activeTab]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Section Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-xs shadow-teal-400/50" />
            <span>Estudar</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Trilhas teóricas estruturadas, videoaulas especializadas, 75 grandes temas e materiais oficiais do SUS.
          </p>
        </div>

        {/* 4 Area Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 p-1 rounded-2xl overflow-x-auto">
          {[
            { id: "PLANO_HOJE" as EstudarSubTab, label: "Plano de Hoje", icon: CalendarCheck, navTab: "estudar-plano-hoje" as const },
            { id: "AULAS" as EstudarSubTab, label: "Aulas", icon: Tv, navTab: "estudar-aulas" as const },
            { id: "GRANDES_TEMAS" as EstudarSubTab, label: "Grandes Temas", icon: Target, navTab: "estudar-grandes-temas" as const },
            { id: "MATERIAIS" as EstudarSubTab, label: "Materiais Oficiais", icon: FolderOpen, navTab: "estudar-materiais" as const },
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
                    ? "bg-teal-600 text-white shadow-xs font-bold"
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

      {/* SUBVIEW CONTENT */}
      {/* 1. PLANO DE HOJE */}
      {currentSubTab === "PLANO_HOJE" && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0a1626] via-[#0d1d33] to-[#0a1524] border border-teal-500/20 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/20">
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Meta de Estudo de Hoje</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {todayMission?.title || "Missão Diária de Rastreamento & Urgências"}
                </h2>
                <p className="text-xs text-zinc-300 max-w-2xl leading-relaxed">
                  {todayMission?.rationale || "Bloco personalizado baseado nos seus pontos de maior retenção e incidência estimada do Revalida INEP."}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrentSubTab("AULAS")}
                  className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Tv className="w-4 h-4" />
                  <span>Assistir Aulas do Bloco</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("praticar-questoes")}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Treinar Questões
                </button>
              </div>
            </div>
          </div>

          {/* Quick Shortcuts to other study modalities */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => setCurrentSubTab("AULAS")}
              className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-teal-500/40 transition-all cursor-pointer group shadow-md space-y-2"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Tv className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors">
                Catálogo de Videoaulas
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Aulas de alta densidade com foco no SUS e especialistas por grande área.
              </p>
            </div>

            <div
              onClick={() => setCurrentSubTab("GRANDES_TEMAS")}
              className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-teal-500/40 transition-all cursor-pointer group shadow-md space-y-2"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
                75 Grandes Temas
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Matriz de incidência histórica, dominância pessoal e condutas padrão INEP.
              </p>
            </div>

            <div
              onClick={() => setCurrentSubTab("MATERIAIS")}
              className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-teal-500/40 transition-all cursor-pointer group shadow-md space-y-2"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <FolderOpen className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                Materiais Oficiais
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                PCDTs atualizados, manuais do Ministério da Saúde e busca com citações.
              </p>
            </div>
          </div>

          {/* Core Daily Mission Modules */}
          <DashboardView />
        </div>
      )}

      {/* 2. CATÁLOGO DE AULAS */}
      {currentSubTab === "AULAS" && <VideoLessonsCatalogView />}

      {/* 3. GRANDES TEMAS */}
      {currentSubTab === "GRANDES_TEMAS" && <GrandesTemasView />}

      {/* 4. MATERIAIS OFICIAIS */}
      {currentSubTab === "MATERIAIS" && <OfficialMedicalSearchView />}
    </div>
  );
};
