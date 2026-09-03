import React, { useState, useEffect } from "react";
import {
  CalendarCheck,
  Tv,
  Target,
  FolderOpen,
  BookOpen,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { VideoLessonsCatalogView } from "../lessons/VideoLessonsCatalogView";
import { GrandesTemasView } from "../grandesTemas/GrandesTemasView";
import { OfficialMedicalSearchView } from "../search/OfficialMedicalSearchView";
import { PlanoDeHojeView } from "./PlanoDeHojeView";
import { EstudarHubView } from "./EstudarHubView";

export type EstudarSubTab = "HUB" | "PLANO_HOJE" | "AULAS" | "GRANDES_TEMAS" | "MATERIAIS";

interface EstudarViewProps {
  initialSubTab?: EstudarSubTab;
}

export const EstudarView: React.FC<EstudarViewProps> = ({ initialSubTab = "PLANO_HOJE" }) => {
  const { setActiveTab, activeTab } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<EstudarSubTab>(initialSubTab);

  // Sync with activeTab if changed externally
  useEffect(() => {
    if (activeTab === "estudar-aulas") setCurrentSubTab("AULAS");
    else if (activeTab === "estudar-grandes-temas" || activeTab === "grandes-temas") setCurrentSubTab("GRANDES_TEMAS");
    else if (activeTab === "estudar-materiais" || activeTab === "official-search") setCurrentSubTab("MATERIAIS");
    else if (activeTab === "estudar-plano-hoje") setCurrentSubTab("PLANO_HOJE");
    else if (activeTab === "estudar") setCurrentSubTab("HUB");
  }, [activeTab]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Section Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-xs shadow-teal-500/50" />
            <span>Estudar</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Trilhas teóricas estruturadas, videoaulas especializadas, 75 grandes temas e materiais oficiais do SUS.
          </p>
        </div>

        {/* 4 Area Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200 p-1 rounded-2xl overflow-x-auto">
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
                    : "text-slate-600 hover:text-slate-900 hover:bg-white"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SUBVIEW CONTENT */}
      {/* 0. HUB DE ENTRADA (/estudar) */}
      {currentSubTab === "HUB" && <EstudarHubView />}

      {/* 1. PLANO DE HOJE (/estudar/plano-de-hoje) */}
      {currentSubTab === "PLANO_HOJE" && <PlanoDeHojeView />}

      {/* 2. CATÁLOGO DE AULAS (/estudar/aulas) */}
      {currentSubTab === "AULAS" && <VideoLessonsCatalogView />}

      {/* 3. GRANDES TEMAS (/estudar/grandes-temas) */}
      {currentSubTab === "GRANDES_TEMAS" && <GrandesTemasView />}

      {/* 4. MATERIAIS OFICIAIS (/estudar/materiais) */}
      {currentSubTab === "MATERIAIS" && <OfficialMedicalSearchView />}
    </div>
  );
};
