import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock,
  Flag,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  HelpCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Grid,
  X,
  Shield,
  FileCheck,
  Send,
  Eye,
} from "lucide-react";
import {
  Question,
  ConfidenceLevel,
  ErrorTaxonomy,
  ActiveTrainingSession,
  SessionAnswerState,
} from "../../types";
import { LayeredCorrectionFeedback } from "./LayeredCorrectionFeedback";

interface ActiveSessionResolutionViewProps {
  session: ActiveTrainingSession;
  allQuestions: Question[];
  onUpdateSession: (updatedSession: ActiveTrainingSession) => void;
  onFinishSession: (session: ActiveTrainingSession) => void;
  onExitSession: () => void;
  onStartSisterTraining?: (sisterQuestionIds: string[]) => void;
}

export const ActiveSessionResolutionView: React.FC<ActiveSessionResolutionViewProps> = ({
  session,
  allQuestions,
  onUpdateSession,
  onFinishSession,
  onExitSession,
  onStartSisterTraining,
}) => {
  const questionIds = Array.isArray(session?.questionIds) ? session.questionIds : [];
  const currentIndex = typeof session?.currentIndex === "number" ? session.currentIndex : 0;
  const currentQuestionId = questionIds[currentIndex] || questionIds[0] || "";
  const currentQuestion: Question | undefined = allQuestions.find((q) => q.id === currentQuestionId);

  // Local state for active question
  const currentAnswerState = session?.answers?.[currentQuestionId];
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | "C" | "D" | null>(
    currentAnswerState ? currentAnswerState.selectedOption : null
  );
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(!!currentAnswerState);
  const [selectedConfidence, setSelectedConfidence] = useState<ConfidenceLevel>(
    currentAnswerState ? currentAnswerState.confidence : "MEDIUM"
  );
  const [isFlagged, setIsFlagged] = useState<boolean>(
    Array.isArray(session?.flaggedQuestionIds) ? session.flaggedQuestionIds.includes(currentQuestionId) : false
  );

  // Timer per question and overall session
  const [questionTimerSeconds, setQuestionTimerSeconds] = useState<number>(
    currentAnswerState ? currentAnswerState.timeSpentSeconds : 0
  );
  const [isPaused, setIsPaused] = useState<boolean>(Boolean(session?.paused));
  const [isGridOpen, setIsGridOpen] = useState<boolean>(false);
  const [isWhyQuestionOpen, setIsWhyQuestionOpen] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [autosaveIndicator, setAutosaveIndicator] = useState<boolean>(false);

  // Sync state when currentIndex changes
  useEffect(() => {
    const ans = session?.answers ? session.answers[currentQuestionId] : undefined;
    if (ans) {
      setSelectedOption(ans.selectedOption);
      setIsAnswerSubmitted(true);
      setSelectedConfidence(ans.confidence);
      setQuestionTimerSeconds(ans.timeSpentSeconds);
    } else {
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
      setSelectedConfidence("MEDIUM");
      setQuestionTimerSeconds(0);
    }
    setIsFlagged(session.flaggedQuestionIds.includes(currentQuestionId));
  }, [session.currentIndex, currentQuestionId]);

  // Tick timers
  useEffect(() => {
    if (isPaused || isAnswerSubmitted) return;
    const interval = setInterval(() => {
      setQuestionTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, isAnswerSubmitted]);

  // Keyboard navigation & shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture shortcuts if typing in input/textarea or paused
      if (
        isPaused ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (!isAnswerSubmitted) {
        if (e.key === "a" || e.key === "A" || e.key === "1") setSelectedOption("A");
        if (e.key === "b" || e.key === "B" || e.key === "2") setSelectedOption("B");
        if (e.key === "c" || e.key === "C" || e.key === "3") setSelectedOption("C");
        if (e.key === "d" || e.key === "D" || e.key === "4") setSelectedOption("D");
      }

      if (e.key === "r" || e.key === "R") {
        toggleFlag();
      }

      if (e.key === "ArrowRight" && session.currentIndex < session.questionIds.length - 1) {
        handleNavigateTo(session.currentIndex + 1);
      }
      if (e.key === "ArrowLeft" && session.currentIndex > 0) {
        handleNavigateTo(session.currentIndex - 1);
      }
    },
    [isPaused, isAnswerSubmitted, session.currentIndex, session.questionIds.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const toggleFlag = () => {
    const newFlagged = isFlagged
      ? session.flaggedQuestionIds.filter((id) => id !== currentQuestionId)
      : [...session.flaggedQuestionIds, currentQuestionId];

    setIsFlagged(!isFlagged);
    const updated: ActiveTrainingSession = {
      ...session,
      flaggedQuestionIds: newFlagged,
      lastUpdated: new Date().toISOString(),
    };
    onUpdateSession(updated);
    triggerAutosave();
  };

  const triggerAutosave = () => {
    setAutosaveIndicator(true);
    setTimeout(() => setAutosaveIndicator(false), 1500);
  };

  const handleSelectOption = (optionId: "A" | "B" | "C" | "D") => {
    if (isAnswerSubmitted) return;
    setSelectedOption(optionId);
  };

  const handleConfirmAnswer = () => {
    if (!selectedOption || !currentQuestion) return;

    const isCorrect = currentQuestion.options.find((o) => o.id === selectedOption)?.isCorrect ?? false;

    const newAnswer: SessionAnswerState = {
      questionId: currentQuestionId,
      selectedOption,
      isCorrect,
      timeSpentSeconds: questionTimerSeconds,
      confidence: selectedConfidence,
      timestamp: new Date().toISOString(),
      isFlagged,
    };

    const newAnswers = {
      ...session.answers,
      [currentQuestionId]: newAnswer,
    };

    const updatedSession: ActiveTrainingSession = {
      ...session,
      answers: newAnswers,
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: session.totalDurationSeconds + questionTimerSeconds,
    };

    setIsAnswerSubmitted(true);
    onUpdateSession(updatedSession);
    triggerAutosave();

    // If feedback mode is END_OF_SESSION (e.g. simulated exam), auto advance to next
    if (session.config.feedbackMode === "END_OF_SESSION") {
      if (session.currentIndex < session.questionIds.length - 1) {
        handleNavigateTo(session.currentIndex + 1);
      }
    }
  };

  const handleSaveErrorReason = (errorReason: ErrorTaxonomy, userReflection?: string) => {
    if (!currentAnswerState) return;
    const updatedAnswer: SessionAnswerState = {
      ...currentAnswerState,
      errorReason,
      userReflection,
    };
    const updatedSession: ActiveTrainingSession = {
      ...session,
      answers: {
        ...session.answers,
        [currentQuestionId]: updatedAnswer,
      },
      lastUpdated: new Date().toISOString(),
    };
    onUpdateSession(updatedSession);
    triggerAutosave();
  };

  const handleNavigateTo = (index: number) => {
    if (index < 0 || index >= session.questionIds.length) return;
    const updatedSession: ActiveTrainingSession = {
      ...session,
      currentIndex: index,
      lastUpdated: new Date().toISOString(),
    };
    onUpdateSession(updatedSession);
    setIsGridOpen(false);
  };

  const handleNext = () => {
    if (session.currentIndex < session.questionIds.length - 1) {
      handleNavigateTo(session.currentIndex + 1);
    } else {
      onFinishSession(session);
    }
  };

  const handlePrevious = () => {
    if (session.currentIndex > 0) {
      handleNavigateTo(session.currentIndex - 1);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const totalAnsweredCount = Object.keys(session?.answers || {}).length;
  const totalQuestionsInSession = session?.questionIds?.length || 1;
  const progressPercent = Math.round((totalAnsweredCount / totalQuestionsInSession) * 100);

  if (!currentQuestion) {
    return (
      <div className="p-12 text-center text-white/50 space-y-4">
        <p>Não foi possível carregar a questão da sessão.</p>
        <button
          onClick={onExitSession}
          className="px-4 py-2 bg-white text-black font-bold text-xs rounded-xl"
        >
          Voltar para o Banco
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24 relative">
      {/* 1. TOP BAR (Fixed / Sticky Header: Questão X de Y · Modo · Tempo · Salvo) */}
      <div className="p-3.5 rounded-xl bg-[#111420] border border-white/[0.08] flex items-center justify-between gap-3 sticky top-[65px] z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Sair do treino (seu progresso fica salvo)"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <span>
              Questão {session.currentIndex + 1} de {session.questionIds.length}
            </span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400">
              {session.config.feedbackMode === "IMMEDIATE" ? "Modo Estudo" : "Modo Prova"}
            </span>
            <span className="text-zinc-500">·</span>
            <span className="font-mono text-zinc-300">
              {formatTimer(questionTimerSeconds)}
            </span>
            {autosaveIndicator && (
              <>
                <span className="text-zinc-500">·</span>
                <span className="text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Salvo
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Pause Button */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isPaused
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-white"
            }`}
            title={isPaused ? "Retomar treino" : "Pausar cronômetro"}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Flag for Review */}
          <button
            onClick={toggleFlag}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isFlagged
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-white"
            }`}
            title="Marcar para revisar (Atalho: R)"
          >
            <Flag className="w-4 h-4" />
          </button>

          {/* Grid Navigator */}
          <button
            onClick={() => setIsGridOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors"
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Grade ({totalAnsweredCount}/{session.questionIds.length})</span>
          </button>
        </div>
      </div>

      {/* PAUSE OVERLAY */}
      {isPaused && (
        <div className="p-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
            <Pause className="w-4 h-4 text-amber-400" />
            Treino Pausado
          </h3>
          <p className="text-xs text-zinc-300 max-w-md mx-auto">
            O cronômetro foi pausado e a questão está oculta. Clique abaixo para continuar.
          </p>
          <button
            onClick={() => setIsPaused(false)}
            className="px-5 py-2 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors"
          >
            Continuar Treino
          </button>
        </div>
      )}

      {/* 2. QUESTION CONTENT (Max-width 780px for optimal reading) */}
      {!isPaused && (
        <div className="max-w-[780px] mx-auto space-y-5">
          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="font-mono text-zinc-300 font-semibold">{currentQuestion.code}</span>
              <span>·</span>
              <span>{currentQuestion.origin === "INEP_OFICIAL" ? "Oficial INEP" : "Inédita"}</span>
              <span>·</span>
              <span>{currentQuestion.area}</span>
            </div>

            <button
              onClick={() => setIsWhyQuestionOpen(!isWhyQuestionOpen)}
              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Por que esta questão?</span>
            </button>
          </div>

          {isWhyQuestionOpen && (
            <div className="p-3 rounded-lg bg-[#111420] border border-white/[0.08] text-xs text-zinc-300 space-y-1">
              <p className="font-semibold text-white">Seleção adaptativa:</p>
              <p className="text-[11px] text-zinc-400">
                Questão selecionada para calibrar o tema <strong>{currentQuestion.topic}</strong> ({currentQuestion.area}), com alta recorrência no Revalida INEP.
              </p>
            </div>
          )}

          {/* Clinical Stem Card */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#111420] border border-white/[0.08] space-y-5">
            {/* Clinical Stem */}
            <div className="text-sm sm:text-[15px] text-zinc-100 leading-relaxed font-sans whitespace-pre-line select-text">
              {currentQuestion.clinicalCase.split(/(\[IMAGEM:.*?\])/g).map((part, i) => {
                if (part.startsWith('[IMAGEM:') && part.endsWith(']')) {
                  const imgPath = part.replace('[IMAGEM:', '').replace(']', '').trim();
                  // Check if there is a matching image object in currentQuestion.images
                  const matchedImg = currentQuestion.images?.find(
                    img => img.relativePath === imgPath || img.url === imgPath || (img.filename && imgPath.includes(img.filename))
                  );
                  return (
                    <div key={i} className="my-4 rounded-xl overflow-hidden border border-white/10 bg-black/40 p-2 inline-block w-full">
                      <img
                        src={matchedImg?.url || `/${imgPath}`}
                        alt={matchedImg?.caption || "Imagem clínica"}
                        className="max-h-80 mx-auto object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                      {matchedImg?.caption && (
                        <p className="text-[11px] text-zinc-400 text-center mt-1.5">{matchedImg.caption}</p>
                      )}
                    </div>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </div>

            {/* Any remaining images that were NOT inlined via tags */}
            {currentQuestion.images && currentQuestion.images.filter(img => !currentQuestion.clinicalCase.includes(img.relativePath || '') && !currentQuestion.clinicalCase.includes(img.filename || '')).length > 0 && (
              <div className="space-y-2 pt-2">
                {currentQuestion.images.filter(img => !currentQuestion.clinicalCase.includes(img.relativePath || '') && !currentQuestion.clinicalCase.includes(img.filename || '')).map((img, idx) => (
                  <div key={idx} className="rounded-xl overflow-hidden border border-white/10 bg-black/40 p-2">
                    <img
                      src={img.url || `/${img.relativePath}` || "/placeholder-clinical.png"}
                      alt={img.caption || "Imagem clínica da questão"}
                      className="max-h-80 mx-auto object-contain rounded-lg"
                      referrerPolicy="no-referrer"
                    />
                    {img.caption && (
                      <p className="text-[11px] text-zinc-400 text-center mt-1.5">{img.caption}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Confidence Selector (Before answering) */}
            {!isAnswerSubmitted && session.config.feedbackMode !== "END_OF_SESSION" && (
              <div className="pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">
                  Segurança no diagnóstico:
                </span>
                <div className="flex items-center gap-1.5">
                  {(["LOW", "MEDIUM", "HIGH"] as ConfidenceLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setSelectedConfidence(level)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        selectedConfidence === level
                          ? "bg-white/15 text-white font-semibold"
                          : "bg-white/[0.02] text-zinc-400 hover:text-white"
                      }`}
                    >
                      {level === "LOW" ? "Baixa" : level === "MEDIUM" ? "Média" : "Alta"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Alternatives List */}
            <div className="space-y-2.5 pt-2">
              {currentQuestion.options.map((opt) => {
                const isSelected = selectedOption === opt.id;
                let optionStyles =
                  "bg-white/[0.02] border-white/[0.08] text-zinc-300 hover:bg-white/[0.05] hover:text-white";

                if (isAnswerSubmitted && session.config.feedbackMode === "IMMEDIATE") {
                  if (opt.isCorrect) {
                    optionStyles =
                      "bg-emerald-500/15 border-emerald-500/50 text-emerald-200 font-semibold";
                  } else if (isSelected && !opt.isCorrect) {
                    optionStyles =
                      "bg-red-500/15 border-red-500/50 text-red-200";
                  } else {
                    optionStyles = "bg-white/[0.01] border-white/[0.04] text-zinc-500";
                  }
                } else if (isSelected) {
                  optionStyles =
                    "bg-white/10 border-white/30 text-white font-medium";
                }

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectOption(opt.id)}
                    disabled={isAnswerSubmitted && session.config.feedbackMode === "IMMEDIATE"}
                    aria-label={`Alternativa ${opt.id}: ${opt.text}`}
                    className={`w-full p-4 rounded-xl border text-left text-xs sm:text-[14px] leading-relaxed transition-colors flex items-start gap-3 cursor-pointer ${optionStyles}`}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg font-bold flex items-center justify-center shrink-0 text-xs border ${
                        isSelected
                          ? "bg-white text-black border-white"
                          : "bg-white/[0.05] text-zinc-400 border-white/10"
                      }`}
                    >
                      {opt.id}
                    </span>
                    <span className="flex-1 pt-0.5">{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {/* Confirm Answer Button */}
            {!isAnswerSubmitted && (
              <div className="pt-3 flex items-center justify-between border-t border-white/[0.06]">
                <span className="text-[11px] text-zinc-500 hidden sm:inline">
                  Atalhos: Teclas A, B, C, D
                </span>

                <button
                  onClick={handleConfirmAnswer}
                  disabled={!selectedOption}
                  id="session-confirm-answer-btn"
                  className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                    selectedOption
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer"
                      : "bg-white/[0.05] text-zinc-500 cursor-not-allowed border border-white/[0.05]"
                  }`}
                >
                  Confirmar resposta
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. LAYERED CORRECTION FEEDBACK (If submitted and IMMEDIATE mode) */}
      {!isPaused && isAnswerSubmitted && selectedOption && session.config.feedbackMode === "IMMEDIATE" && (
        <LayeredCorrectionFeedback
          question={currentQuestion}
          selectedOption={selectedOption}
          confidence={selectedConfidence}
          allQuestions={allQuestions}
          onNextQuestion={handleNext}
          isLastQuestion={session.currentIndex === session.questionIds.length - 1}
          onSaveErrorReflection={handleSaveErrorReason}
          onStartSisterTraining={onStartSisterTraining}
        />
      )}

      {/* 5. NAVIGATION FOOTER BAR */}
      {!isPaused && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handlePrevious}
            disabled={session.currentIndex === 0}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              session.currentIndex > 0
                ? "bg-white/[0.04] hover:bg-white/10 text-white border-white/10 shadow-sm cursor-pointer"
                : "bg-white/[0.02] text-white/20 border-white/5 cursor-not-allowed"
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>

          {/* If Simulado Mode, show direct finish or next */}
          {session.config.feedbackMode === "END_OF_SESSION" ? (
            <div className="flex items-center gap-2">
              {session.currentIndex === session.questionIds.length - 1 ? (
                <button
                  onClick={() => onFinishSession(session)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg transition-transform hover:scale-105 cursor-pointer"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Finalizar e Ver Gabarito</span>
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs transition-all shadow-sm cursor-pointer hover:scale-[1.02]"
                >
                  <span>Próxima</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white border border-white/10 text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <span>{session.currentIndex === session.questionIds.length - 1 ? "Finalizar Treino" : "Próxima"}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* 6. GRID NAVIGATOR DRAWER / MODAL */}
      {isGridOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-[#0b0b12] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white">Navegador da Sessão</h3>
                <p className="text-xs text-white/50">
                  {totalAnsweredCount} de {session.questionIds.length} respondidas
                </p>
              </div>
              <button
                onClick={() => setIsGridOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Question Squares Grid */}
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-72 overflow-y-auto p-1 scrollbar-none">
              {(session?.questionIds || []).map((qId, idx) => {
                const ans = session?.answers ? session.answers[qId] : undefined;
                const isCurrent = idx === (session?.currentIndex ?? 0);
                const isFlag = Array.isArray(session?.flaggedQuestionIds) ? session.flaggedQuestionIds.includes(qId) : false;

                let squareStyle = "bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/10";
                if (isCurrent) {
                  squareStyle = "ring-2 ring-indigo-400 bg-indigo-600/30 text-white font-bold";
                } else if (ans) {
                  if (session.config.feedbackMode === "IMMEDIATE") {
                    squareStyle = ans.isCorrect
                      ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold"
                      : "bg-red-500/20 border-red-500/50 text-red-300 font-bold";
                  } else {
                    squareStyle = "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 font-bold";
                  }
                }

                return (
                  <button
                    key={qId}
                    onClick={() => handleNavigateTo(idx)}
                    className={`h-11 rounded-xl border flex flex-col items-center justify-center text-xs transition-all relative ${squareStyle}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlag && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                    {ans && (
                      <span className="text-[9px] opacity-70 font-mono">{ans.selectedOption}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px] text-white/50">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Respondida
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Marcada (Flag)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-white/20" /> Pendente
                </span>
              </div>

              <button
                onClick={() => onFinishSession(session)}
                className="px-4 py-2 rounded-xl bg-white text-black font-bold text-xs hover:scale-105 transition-transform"
              >
                Concluir Sessão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. EXIT CONFIRMATION MODAL */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#0b0b12] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <h3 className="font-bold text-base text-white">Salvar e Sair do Treino?</h3>
            <p className="text-xs text-white/70 leading-relaxed">
              Seu progresso ({totalAnsweredCount}/{session.questionIds.length} questões respondidas) será salvo automaticamente. Você poderá continuar exatamente de onde parou na tela inicial do Banco de Questões.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
              >
                Continuar Treinando
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  onExitSession();
                }}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors shadow-lg"
              >
                Salvar e Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
