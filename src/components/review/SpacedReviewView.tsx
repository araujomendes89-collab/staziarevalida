import React, { useState } from "react";
import {
  Layers,
  RotateCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Brain,
  Zap,
  HelpCircle,
  ArrowRight,
  Flame,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Flashcard } from "../../types";

export const SpacedReviewView: React.FC = () => {
  const { flashcards, updateFlashcardScore } = useApp();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const activeCard: Flashcard | undefined = flashcards[currentIndex];

  const handleRating = (rating: "AGAIN" | "HARD" | "MEDIUM" | "EASY") => {
    if (!activeCard) return;
    updateFlashcardScore(activeCard.id, rating);
    setIsFlipped(false);

    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#111420] border border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Repetição Espaçada Ativa
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Fixação de Microcompetências
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Flashcards gerados a partir dos seus próprios erros com repetição espaçada adaptativa.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="text-xs font-semibold text-zinc-300 bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.08]">
            Card {flashcards.length > 0 ? currentIndex + 1 : 0} de {flashcards.length}
          </span>
        </div>
      </div>

      {/* Interactive Flip Card */}
      {activeCard ? (
        <div className="space-y-4">
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="min-h-[280px] p-6 rounded-2xl bg-[#111420] border border-white/[0.08] hover:border-white/20 transition-colors cursor-pointer flex flex-col justify-between select-none"
          >
            {/* Top Card Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/10 text-zinc-300">
                  {activeCard.area.replace("_", " ")}
                </span>
                <span className="text-xs text-zinc-400 font-medium">
                  {activeCard.topic}
                </span>
              </div>
              <span className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Toque para virar ↺
              </span>
            </div>

            {/* Front or Back Content */}
            <div className="my-6 text-center">
              {!isFlipped ? (
                <div className="space-y-3">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">
                    Gatilho Clínico / Pergunta
                  </span>
                  <p className="text-lg font-semibold text-white leading-relaxed max-w-xl mx-auto">
                    {activeCard.front}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold block">
                    Conduta Ouro / Resposta
                  </span>
                  <p className="text-sm text-zinc-200 leading-relaxed max-w-xl mx-auto whitespace-pre-line text-left font-normal font-sans">
                    {activeCard.back}
                  </p>
                  {activeCard.keyMnemonic && (
                    <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 text-left font-sans">
                      💡 <strong>Mnemônico / Regra SUS:</strong> {activeCard.keyMnemonic}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Card Progress */}
            <div className="flex items-center justify-between text-xs text-zinc-500 pt-3 border-t border-white/[0.06]">
              <span>Domínio: <strong className="text-zinc-300">{activeCard.masteryLevel}%</strong></span>
              <span>Repetição nº {activeCard.repetitionCount}</span>
            </div>
          </div>

          {/* Rating Buttons (Visible when flipped) */}
          {isFlipped ? (
            <div className="p-4 rounded-2xl bg-[#111420] border border-white/[0.08] space-y-3">
              <p className="text-xs text-zinc-400 text-center font-medium">
                Como foi a facilidade de recuperação da memória?
              </p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => handleRating("AGAIN")}
                  className="py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 font-semibold text-xs border border-red-500/20 transition-colors flex flex-col items-center cursor-pointer"
                >
                  <span>Errei</span>
                  <span className="text-[10px] text-red-400/60 font-normal">Rever hoje</span>
                </button>

                <button
                  onClick={() => handleRating("HARD")}
                  className="py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs border border-amber-500/20 transition-colors flex flex-col items-center cursor-pointer"
                >
                  <span>Difícil</span>
                  <span className="text-[10px] text-amber-400/60 font-normal">2 dias</span>
                </button>

                <button
                  onClick={() => handleRating("MEDIUM")}
                  className="py-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-semibold text-xs border border-blue-500/20 transition-colors flex flex-col items-center cursor-pointer"
                >
                  <span>Bom</span>
                  <span className="text-[10px] text-blue-400/60 font-normal">4 dias</span>
                </button>

                <button
                  onClick={() => handleRating("EASY")}
                  className="py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs border border-emerald-500/20 transition-colors flex flex-col items-center cursor-pointer"
                >
                  <span>Fácil</span>
                  <span className="text-[10px] text-emerald-400/60 font-normal">7 dias</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <button
                onClick={() => setIsFlipped(true)}
                className="px-6 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors cursor-pointer"
              >
                Mostrar Resposta
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-10 text-center rounded-2xl bg-[#111420] border border-white/[0.08] space-y-3">
          <Brain className="w-10 h-10 text-emerald-400/60 mx-auto" />
          <h3 className="text-base font-bold text-white">Nenhum flashcard pendente</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Seus flashcards personalizados de repetição espaçada ativa aparecerão aqui conforme você resolve questões e registra autópsias no Caderno de Erros.
          </p>
        </div>
      )}
    </div>
  );
};
