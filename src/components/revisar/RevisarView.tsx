import React, { useState, useEffect } from "react";
import {
  Layers,
  BookMarked,
  ShieldAlert,
  Flame,
  Volume2,
  Sparkles,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { SpacedRepetitionService } from "../../services/spacedRepetitionService";
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
  const { activeTab, setActiveTab, flashcards } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<RevisarSubTab>(initialSubTab);

  const dueFlashcardsCount = SpacedRepetitionService.getDueFlashcards(flashcards || []).length;

  useEffect(() => {
    if (activeTab === "revisar-erros" || activeTab === "errors") {
      setCurrentSubTab("ERRORS");
    } else if (activeTab === "revisar-atualizacoes") {
      setCurrentSubTab("ATUALIZACOES");
    } else if (activeTab === "revisar-radar" || activeTab === "guidelines" || activeTab === "radar") {
      setCurrentSubTab("RADAR");
    } else if (activeTab === "revisar-audio") {
      setCurrentSubTab("AUDIO");
    } else if (activeTab === "revisar-flashcards" || activeTab === "review") {
      setCurrentSubTab("FLASHCARDS");
    }
  }, [activeTab]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Section Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-xs shadow-purple-400/50" />
            <span>Revisar</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Flashcards com repetição espaçada, caderno de erros com autópsia cognitiva, atualizações 2025/2026, radar de diretrizes e áudios.
          </p>
        </div>

        {/* 5 Area Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 p-1 rounded-2xl overflow-x-auto">
          {[
            { id: "FLASHCARDS" as RevisarSubTab, label: "Flashcards", icon: Layers, count: dueFlashcardsCount, navTab: "revisar-flashcards" as const },
            { id: "ERRORS" as RevisarSubTab, label: "Caderno de Erros", icon: BookMarked, navTab: "revisar-erros" as const },
            { id: "ATUALIZACOES" as RevisarSubTab, label: "Atualizações", icon: Flame, navTab: "revisar-atualizacoes" as const },
            { id: "RADAR" as RevisarSubTab, label: "Radar de Diretrizes", icon: ShieldAlert, navTab: "revisar-radar" as const },
            { id: "AUDIO" as RevisarSubTab, label: "Flash-Audio", icon: Volume2, navTab: "revisar-audio" as const },
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
                    ? "bg-purple-600 text-white shadow-xs font-bold"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-zinc-400"}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-500/30 text-purple-200">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUBVIEWS */}
      {currentSubTab === "FLASHCARDS" && <SpacedReviewView />}
      {currentSubTab === "ERRORS" && <ErrorNotebookView />}
      {currentSubTab === "ATUALIZACOES" && <ProtocolUpdatesHubView />}
      {currentSubTab === "RADAR" && <GuidelineWatchView />}
      {currentSubTab === "AUDIO" && <FlashAudioPlayerView />}
    </div>
  );
};
