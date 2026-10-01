import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { SEED_OSCE_STATIONS } from "../../data/osceStationsData";
import { OSCEStation } from "../../types";
import { OsceStationListView } from "./OsceStationListView";
import { OsceBriefingView } from "./OsceBriefingView";
import { OsceVirtualRoom } from "./OsceVirtualRoom";
import { OsceDuoRoomView } from "./OsceDuoRoomView";
import { ChecklistBankHubView } from "./ChecklistBankHubView";
import { Users, Stethoscope } from "lucide-react";

export const UnifiedOsceView: React.FC = () => {
  const { selectedOSCEId, setSelectedOSCEId, user } = useApp();
  const [subTab, setSubTab] = useState<"HUB" | "STATIONS">("HUB");
  const [activeDuoSessionId, setActiveDuoSessionId] = useState<string | null>(null);
  const [briefingStation, setBriefingStation] = useState<OSCEStation | null>(null);
  const [activeStation, setActiveStation] = useState<OSCEStation | null>(() => {
    if (selectedOSCEId) {
      return SEED_OSCE_STATIONS.find((s) => s.id === selectedOSCEId) || null;
    }
    return null;
  });

  const handleSelectStationFromList = (station: OSCEStation) => {
    setBriefingStation(station);
  };

  const handleStartFromBriefing = () => {
    if (briefingStation) {
      setActiveStation(briefingStation);
      setSelectedOSCEId(briefingStation.id);
      setBriefingStation(null);
    }
  };

  const handleExitSimulation = () => {
    setActiveStation(null);
    setSelectedOSCEId(null);
    setBriefingStation(null);
    setActiveDuoSessionId(null);
  };

  const handleStartAiStudy = () => {
    const defaultAiStation = SEED_OSCE_STATIONS[0] || null;
    if (defaultAiStation) {
      setBriefingStation(defaultAiStation);
    }
  };

  if (activeDuoSessionId) {
    return (
      <OsceDuoRoomView
        sessionId={activeDuoSessionId}
        currentUserId={user?.id || "usr-me"}
        onExit={handleExitSimulation}
      />
    );
  }

  if (activeStation) {
    return (
      <OsceVirtualRoom
        station={activeStation}
        onExit={handleExitSimulation}
      />
    );
  }


  if (briefingStation) {
    return (
      <OsceBriefingView
        station={briefingStation}
        onStartStation={handleStartFromBriefing}
        onCancel={() => setBriefingStation(null)}
      />
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#070B14] text-slate-100 rounded-3xl p-4 sm:p-8 space-y-6 shadow-2xl border border-slate-800/80">
      {/* Top Module Sub-Navigation */}
      <div className="max-w-6xl mx-auto flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("HUB")}
            id="tab-banco-checklists"
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              subTab === "HUB"
                ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                : "text-slate-400 hover:text-white hover:bg-slate-800/40"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Banco de Checklist</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button
            type="button"
            onClick={() => setSubTab("STATIONS")}
            id="tab-estacoes-clinicas"
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              subTab === "STATIONS"
                ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                : "text-slate-400 hover:text-white hover:bg-slate-800/40"
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Estações Clínicas ({SEED_OSCE_STATIONS.length})</span>
          </button>
        </div>
      </div>

      {subTab === "HUB" ? (
        <ChecklistBankHubView
          onStartManualStudy={() => setSubTab("STATIONS")}
          onStartAiStudy={handleStartAiStudy}
          onSelectStation={handleSelectStationFromList}
          onEnterDuoSession={(sessionId) => setActiveDuoSessionId(sessionId)}
        />
      ) : (
        <OsceStationListView onSelectStation={handleSelectStationFromList} />
      )}

    </div>
  );
};
