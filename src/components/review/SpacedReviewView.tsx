import React, { useState, useMemo, useEffect, useCallback } from "react";
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
  Clock,
  RotateCcw,
  Volume2,
  Headphones,
  Check,
  Award,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Flashcard, MedicalArea } from "../../types";
import { formatMedicalArea } from "../../utils/formatters";

export const SpacedReviewView: React.FC = () => {
  const { flashcards, updateFlashcardScore, setActiveTab } = useApp();

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<MedicalArea | "ALL">("ALL");

  // Filter due flashcards (due today or earlier, or not yet reviewed)
  const now = new Date().toISOString();
  const dueCards = useMemo(() => {
    return flashcards.filter((card) => {
      if (selectedAreaFilter !== "ALL" && card.area !== selectedAreaFilter) {
        return false;
      }
      return !card.dueDate || card.dueDate <= now;
    });
  }, [flashcards, selectedAreaFilter, now]);

  // Breakdown counts
  const totalCardsCount = flashcards.length;
  const newCardsCount = flashcards.filter((c) => c.repetitionCount === 0).length;
  const learningCardsCount = flashcards.filter((c) => c.repetitionCount > 0 && c.masteryLevel < 70).length;
  const masteredCardsCount = flashcards.filter((c) => c.masteryLevel >= 70).length;

  const currentCard: Flashcard | undefined = sessionCards[currentIndex];

  // Start review session
  const handleStartSession = (cardsToReview = dueCards) => {
    const list = cardsToReview.length > 0 ? cardsToReview : flashcards;
    if (list.length === 0) return;
    setSessionCards(list);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsSessionFinished(false);
    setIsSessionActive(true);
  };

  // Compute next intervals based on current card
  const getProjectedInterval = (card: Flashcard, rating: "AGAIN" | "HARD" | "MEDIUM" | "EASY") => {
    if (rating === "AGAIN") return "1 dia";
    if (rating === "HARD") {
      const days = Math.max(1, Math.round(card.intervalDays * 1.2));
      return `${days} ${days === 1 ? "dia" : "dias"}`;
    }
    if (rating === "MEDIUM") {
      const days = Math.max(2, Math.round(card.intervalDays * 2.0));
      return `${days} dias`;
    }
    if (rating === "EASY") {
      const days = Math.max(4, Math.round(card.intervalDays * 2.8));
      return `${days} dias`;
    }
    return "";
  };

  // Handle rating rating: AGAIN | HARD | MEDIUM | EASY
  const handleRating = useCallback(
    (rating: "AGAIN" | "HARD" | "MEDIUM" | "EASY") => {
      if (!currentCard) return;
      updateFlashcardScore(currentCard.id, rating);
      setIsFlipped(false);

      if (currentIndex < sessionCards.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsSessionFinished(true);
      }
    },
    [currentCard, currentIndex, sessionCards.length, updateFlashcardScore]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isSessionActive || isSessionFinished || !currentCard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped) {
        if (e.key === "1") handleRating("AGAIN");
        if (e.key === "2") handleRating("HARD");
        if (e.key === "3") handleRating("MEDIUM");
        if (e.key === "4") handleRating("EASY");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSessionActive, isSessionFinished, currentCard, isFlipped, handleRating]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* 1. CABEÇALHO COMPACTO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
              Repetição Espaçada
            </span>
            <span className="text-xs text-slate-400">
              {totalCardsCount} {totalCardsCount === 1 ? "cartão cadastrado" : "cartões cadastrados"}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Flashcards
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Revisão espaçada dos conteúdos clínicos que você precisa manter ativos na memória.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab("flash-audio")}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 transition-colors shrink-0 cursor-pointer"
        >
          <Headphones className="w-3.5 h-3.5 text-teal-600" />
          <span>Modo Áudio</span>
        </button>
      </div>

      {/* 2. SESSÃO ATIVA DE REVISÃO */}
      {isSessionActive && !isSessionFinished && currentCard && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Top Bar of Session */}
          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 font-mono">
                Cartão {currentIndex + 1} de {sessionCards.length}
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                {formatMedicalArea(currentCard.area)}
              </span>
              {currentCard.topic && (
                <span className="text-slate-500 font-medium truncate max-w-[180px]">
                  {currentCard.topic}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsSessionActive(false)}
              className="text-xs text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
            >
              Pausar Sessão
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-teal-600 h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round(((currentIndex + 1) / sessionCards.length) * 100)}%`,
              }}
            />
          </div>

          {/* Flip Card */}
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="min-h-[260px] sm:min-h-[300px] p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/90 hover:border-teal-400 transition-all cursor-pointer flex flex-col justify-between shadow-xs select-none relative"
          >
            {/* Top Indicator */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-bold uppercase tracking-wider text-slate-500">
                {!isFlipped ? "Gatilho Clínico / Pergunta" : "Conduta Ouro / Resposta"}
              </span>
              <span className="text-teal-700 font-semibold flex items-center gap-1">
                <RotateCw className="w-3 h-3" />
                <span>Toque para virar (Espaço)</span>
              </span>
            </div>

            {/* Front or Back Content */}
            <div className="my-6">
              {!isFlipped ? (
                <div className="space-y-3 text-center">
                  <p className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed max-w-xl mx-auto">
                    {currentCard.front}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm sm:text-base text-slate-800 leading-relaxed font-medium whitespace-pre-line">
                    {currentCard.back}
                  </p>

                  {currentCard.keyMnemonic && (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      💡 <strong>Mnemônico / Regra de Ouro:</strong> {currentCard.keyMnemonic}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Card Meta */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-100">
              <span>
                Domínio: <strong className="text-slate-700">{currentCard.masteryLevel}%</strong>
              </span>
              <span>Repetição nº {currentCard.repetitionCount + 1}</span>
            </div>
          </div>

          {/* Rating Buttons (When Flipped) or Show Answer CTA (When Not Flipped) */}
          {isFlipped ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2.5">
              <p className="text-xs font-bold text-slate-700 text-center uppercase tracking-wider">
                Como foi a recuperação da memória?
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleRating("AGAIN")}
                  className="p-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-colors flex flex-col items-center justify-center cursor-pointer"
                >
                  <span className="text-xs font-bold">1. Errei</span>
                  <span className="text-[10px] text-rose-600 font-medium">
                    {getProjectedInterval(currentCard, "AGAIN")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRating("HARD")}
                  className="p-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors flex flex-col items-center justify-center cursor-pointer"
                >
                  <span className="text-xs font-bold">2. Difícil</span>
                  <span className="text-[10px] text-amber-600 font-medium">
                    {getProjectedInterval(currentCard, "HARD")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRating("MEDIUM")}
                  className="p-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-colors flex flex-col items-center justify-center cursor-pointer"
                >
                  <span className="text-xs font-bold">3. Bom</span>
                  <span className="text-[10px] text-blue-600 font-medium">
                    {getProjectedInterval(currentCard, "MEDIUM")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRating("EASY")}
                  className="p-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors flex flex-col items-center justify-center cursor-pointer"
                >
                  <span className="text-xs font-bold">4. Fácil</span>
                  <span className="text-[10px] text-teal-600 font-medium">
                    {getProjectedInterval(currentCard, "EASY")}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsFlipped(true)}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              >
                MOSTRAR RESPOSTA (Espaço)
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. SESSÃO CONCLUÍDA */}
      {isSessionActive && isSessionFinished && (
        <div className="p-8 sm:p-10 rounded-3xl bg-white border border-slate-200/80 shadow-xs text-center space-y-4 animate-in fade-in">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Revisão Concluída!
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Você revisou {sessionCards.length} {sessionCards.length === 1 ? "cartão" : "cartões"} hoje. Os intervalos de repetição foram atualizados com sucesso.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsSessionActive(false)}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              Voltar aos Flashcards
            </button>
            <button
              type="button"
              onClick={() => handleStartSession(flashcards)}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
            >
              Revisar Mais Cartões
            </button>
          </div>
        </div>
      )}

      {/* 4. ESTADO INICIAL (Dashboard compacto antes da sessão) */}
      {!isSessionActive && (
        <div className="space-y-6">
          {/* Card Principal de Revisão de Hoje */}
          <div className="p-6 sm:p-7 rounded-3xl bg-teal-50/70 border border-teal-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                Revisão de Hoje
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {dueCards.length > 0
                  ? `${dueCards.length} ${dueCards.length === 1 ? "cartão pendente" : "cartões pendentes"}`
                  : "Nenhum cartão pendente hoje"}
              </h3>
              <p className="text-xs text-slate-600">
                {dueCards.length > 0
                  ? `Tempo estimado: ~${Math.ceil(dueCards.length * 0.7)} min • Algoritmo de Repetição Espaçada Ativo`
                  : "Todos os seus flashcards programados estão em dia! Você pode antecipar revisões ou resolver novas questões."}
              </p>
            </div>

            <div className="shrink-0">
              {dueCards.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handleStartSession(dueCards)}
                  className="px-7 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs sm:text-sm shadow-xs transition-all hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>COMEÇAR REVISÃO</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStartSession(flashcards)}
                  className="px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 font-bold text-xs hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <RotateCcw className="w-4 h-4 text-teal-600" />
                  <span>Revisar Todos ({totalCardsCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Resumo do Baralho (3 Indicadores Limpos) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Novos
              </span>
              <span className="text-2xl font-black text-slate-900 font-mono block">
                {newCardsCount}
              </span>
              <p className="text-[11px] text-slate-400">Aguardando 1ª repetição</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Em Aprendizado
              </span>
              <span className="text-2xl font-black text-slate-900 font-mono block">
                {learningCardsCount}
              </span>
              <p className="text-[11px] text-slate-400">Em fase de fixação ativa</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Consolidados
              </span>
              <span className="text-2xl font-black text-slate-900 font-mono block">
                {masteredCardsCount}
              </span>
              <p className="text-[11px] text-slate-400">Domínio ≥ 70%</p>
            </div>
          </div>

          {/* Filtro por Grande Área */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Filtrar por Grande Área Médica
            </span>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: "ALL" as const, label: "Todas as Áreas" },
                { id: "CLINICA_MEDICA" as const, label: "Clínica Médica" },
                { id: "CIRURGIA_GERAL" as const, label: "Cirurgia Geral" },
                { id: "PEDIATRIA" as const, label: "Pediatria" },
                { id: "GINECOLOGIA_OBSTETRICIA" as const, label: "Ginecologia & Obstetrícia" },
                { id: "MEDICINA_FAMILIA_COMUNIDADE" as const, label: "Preventiva / SUS" },
              ].map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedAreaFilter(area.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedAreaFilter === area.id
                      ? "bg-slate-900 text-white font-bold shadow-2xs"
                      : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {area.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
