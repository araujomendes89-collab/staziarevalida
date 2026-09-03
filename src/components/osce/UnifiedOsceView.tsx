import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { SEED_OSCE_STATIONS } from "../../data/osceStationsData";
import { OSCEStation } from "../../types";
import { OsceStationListView } from "./OsceStationListView";
import { OsceBriefingView } from "./OsceBriefingView";
import { OsceVirtualRoom } from "./OsceVirtualRoom";

export const UnifiedOsceView: React.FC = () => {
  const { selectedOSCEId, setSelectedOSCEId } = useApp();
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
  };

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
    <OsceStationListView
      onSelectStation={handleSelectStationFromList}
    />
  );
};
