import React, { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { VideoLessonsCatalogView } from "./VideoLessonsCatalogView";
import { GrandesTemasView } from "./GrandesTemasView";
import { OfficialMedicalSearchView } from "../materiais/OfficialMedicalSearchView";
import { PlanoDeHojeView } from "./PlanoDeHojeView";
import { EstudarHubView } from "./EstudarHubView";

export type EstudarSubTab = "HUB" | "PLANO_HOJE" | "AULAS" | "GRANDES_TEMAS" | "MATERIAIS";

interface EstudarViewProps {
  initialSubTab?: EstudarSubTab;
}

export const EstudarView: React.FC<EstudarViewProps> = ({ initialSubTab = "PLANO_HOJE" }) => {
  const { activeTab } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<EstudarSubTab>(initialSubTab);

  // Sync with activeTab if changed externally
  useEffect(() => {
    if (activeTab === "estudar-aulas") {
      setCurrentSubTab("AULAS");
    } else if (activeTab === "estudar-grandes-temas" || activeTab === "grandes-temas") {
      setCurrentSubTab("GRANDES_TEMAS");
    } else if (activeTab === "estudar-materiais" || activeTab === "official-search") {
      setCurrentSubTab("MATERIAIS");
    } else if (activeTab === "estudar-plano-hoje" || activeTab === "estudar") {
      setCurrentSubTab("PLANO_HOJE");
    }
  }, [activeTab]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* SUBVIEW CONTENT (Clean Container without redundant sub-tab bar) */}
      {/* 0. HUB DE ENTRADA (Preservado para compatibilidade retroativa) */}
      {currentSubTab === "HUB" && <EstudarHubView />}

      {/* 1. PLANO DE HOJE (/estudar/plano-de-hoje & /estudar default) */}
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
