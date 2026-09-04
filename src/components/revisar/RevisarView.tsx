import React, { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { SpacedReviewView } from "../review/SpacedReviewView";
import { ErrorNotebookView } from "../errors/ErrorNotebookView";
import { ProtocolUpdatesHubView } from "../protocols/ProtocolUpdatesHubView";
import { GuidelineWatchView } from "../guidelines/GuidelineWatchView";
import { FlashAudioPlayerView } from "../review/FlashAudioPlayerView";

export type RevisarSubTab =
  | "FLASHCARDS"
  | "ERRORS"
  | "ATUALIZACOES"
  | "RADAR"
  | "AUDIO";

interface RevisarViewProps {
  initialSubTab?: RevisarSubTab;
}

export const RevisarView: React.FC<RevisarViewProps> = ({ initialSubTab = "FLASHCARDS" }) => {
  const { activeTab } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<RevisarSubTab>(initialSubTab);

  useEffect(() => {
    if (activeTab === "revisar-erros" || activeTab === "errors") {
      setCurrentSubTab("ERRORS");
    } else if (activeTab === "revisar-atualizacoes") {
      setCurrentSubTab("ATUALIZACOES");
    } else if (activeTab === "revisar-radar" || activeTab === "guidelines" || activeTab === "radar") {
      setCurrentSubTab("RADAR");
    } else if (activeTab === "revisar-audio" || activeTab === "flash-audio") {
      setCurrentSubTab("AUDIO");
    } else if (activeTab === "revisar-flashcards" || activeTab === "review" || activeTab === "revisar") {
      setCurrentSubTab("FLASHCARDS");
    }
  }, [activeTab]);

  return (
    <div className="pb-20 max-w-7xl mx-auto">
      {/* SUBVIEWS */}
      {currentSubTab === "FLASHCARDS" && <SpacedReviewView />}
      {currentSubTab === "ERRORS" && <ErrorNotebookView />}
      {currentSubTab === "ATUALIZACOES" && <ProtocolUpdatesHubView />}
      {currentSubTab === "RADAR" && <GuidelineWatchView />}
      {currentSubTab === "AUDIO" && <FlashAudioPlayerView />}
    </div>
  );
};

