import React, { useState } from "react";
import {
  Layers,
  AlertOctagon,
  ShieldAlert,
  Sparkles,
  BookOpen,
  Headphones,
  Flame,
} from "lucide-react";
import { SpacedReviewView } from "./SpacedReviewView";
import { ErrorNotebookView } from "./ErrorNotebookView";
import { GuidelineWatchView } from "../materiais/GuidelineWatchView";
import { FlashAudioPlayerView } from "./FlashAudioPlayerView";
import { ProtocolUpdatesHubView } from "../materiais/ProtocolUpdatesHubView";

export type ReviewTabType =
  | "PROTOCOLS_2025_2026"
  | "FLASHCARDS"
  | "ERRORS"
  | "GUIDELINES"
  | "AUDIO";

interface UnifiedReviewViewProps {
  defaultTab?: ReviewTabType;
}

export const UnifiedReviewView: React.FC<UnifiedReviewViewProps> = ({
  defaultTab = "PROTOCOLS_2025_2026",
}) => {
  const [activeTab, setActiveTab] = useState<ReviewTabType>(defaultTab);

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      {/* Navigation Sub-Tabs Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#111420] border border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-4 h-4 text-rose-400" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Revisão de Alto Rendimento & Protocolos
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Revisar: Atualizações 2025–2026, Flashcards, Erros e Áudios
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Base oficial viva de protocolos do SUS, consolidação espaçada, análise de erros e resumos em áudio.
          </p>
        </div>

        {/* 5 Sub-tabs with 44px min touch height */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] self-start sm:self-center">
          <button
            onClick={() => setActiveTab("PROTOCOLS_2025_2026")}
            id="review-subtab-protocols"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "PROTOCOLS_2025_2026"
                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                : "text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>🔥 Atualizações 2025–2026</span>
          </button>

          <button
            onClick={() => setActiveTab("FLASHCARDS")}
            id="review-subtab-flashcards"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "FLASHCARDS"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Flashcards</span>
          </button>

          <button
            onClick={() => setActiveTab("ERRORS")}
            id="review-subtab-errors"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "ERRORS"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Erros</span>
          </button>

          <button
            onClick={() => setActiveTab("GUIDELINES")}
            id="review-subtab-guidelines"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "GUIDELINES"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Radar Diretrizes</span>
          </button>

          <button
            onClick={() => setActiveTab("AUDIO")}
            id="review-subtab-audio"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
              activeTab === "AUDIO"
                ? "bg-emerald-500 text-black font-bold"
                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Flash-Audio</span>
          </button>
        </div>
      </div>

      {/* Sub-view Content */}
      <div className="pt-2">
        {activeTab === "PROTOCOLS_2025_2026" && <ProtocolUpdatesHubView />}
        {activeTab === "FLASHCARDS" && <SpacedReviewView />}
        {activeTab === "ERRORS" && <ErrorNotebookView />}
        {activeTab === "GUIDELINES" && <GuidelineWatchView />}
        {activeTab === "AUDIO" && <FlashAudioPlayerView />}
      </div>
    </div>
  );
};


