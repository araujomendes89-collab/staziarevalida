import React, { useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, FileCheck, Bookmark } from "lucide-react";

interface SimulationQuestionDockProps {
  questionIds: string[];
  currentIndex: number;
  answers: Record<string, any>;
  flaggedQuestionIds: string[];
  onSelectIndex: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  isLastQuestion: boolean;
}

export const SimulationQuestionDock: React.FC<SimulationQuestionDockProps> = ({
  questionIds,
  currentIndex,
  answers,
  flaggedQuestionIds,
  onSelectIndex,
  onPrevious,
  onNext,
  onFinish,
  isLastQuestion,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active question item into view
  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeElement = scrollContainerRef.current.children[currentIndex] as HTMLElement;
      if (activeElement && typeof activeElement.scrollIntoView === "function") {
        activeElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [currentIndex]);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#1E242B] border-t border-slate-700/80 text-white shadow-2xl py-2.5 px-3 sm:px-6 select-none">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Button: Voltar */}
        <button
          type="button"
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            currentIndex > 0
              ? "bg-[#0A1017] hover:bg-black text-slate-200 border border-slate-700 cursor-pointer active:scale-95"
              : "bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed opacity-50"
          }`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Voltar</span>
        </button>

        {/* Scrollable Questions Track */}
        <div
          ref={scrollContainerRef}
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1 px-1 scrollbar-none no-scrollbar flex-1 justify-start sm:justify-center"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {questionIds.map((qId, idx) => {
            const isCurrent = idx === currentIndex;
            const isAnswered = !!answers[qId];
            const isFlagged = flaggedQuestionIds.includes(qId);

            // Styling logic matching the reference
            let itemStyle = "bg-[#2A3441] text-slate-300 hover:bg-[#344152] border border-slate-700/60";
            if (isCurrent) {
              itemStyle = "bg-white text-slate-900 font-black ring-2 ring-teal-400 shadow-md scale-105";
            } else if (isAnswered) {
              itemStyle = "bg-slate-700/90 text-white border border-teal-500/40";
            }

            return (
              <button
                key={qId}
                type="button"
                onClick={() => onSelectIndex(idx)}
                className={`relative min-w-[34px] sm:min-w-[40px] h-8 sm:h-9 px-1.5 rounded-lg text-xs font-bold font-mono flex items-center justify-center transition-all cursor-pointer ${itemStyle}`}
                title={`Questão ${idx + 1}${isAnswered ? " (Respondida)" : ""}${isFlagged ? " [Revisar]" : ""}`}
              >
                <span>{pad(idx + 1)}</span>
                {isFlagged && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-slate-900" />
                )}
              </button>
            );
          })}
        </div>

        {/* Button: Avançar ou Finalizar */}
        {isLastQuestion ? (
          <button
            type="button"
            onClick={onFinish}
            className="flex items-center gap-1.5 px-3 sm:px-5 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md transition-all shrink-0 cursor-pointer active:scale-95"
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Finalizar</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold bg-[#0A1017] hover:bg-black text-slate-200 border border-slate-700 transition-all shrink-0 cursor-pointer active:scale-95"
          >
            <span>Avançar</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
