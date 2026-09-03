import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock,
  Flag,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  CheckCircle2,
  AlertTriangle,
  Grid,
  X,
  FileCheck,
  Sparkles,
  ArrowRight,
  RotateCcw,
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

export const ActiveSessionResolutionView: React.FC<
  ActiveSessionResolutionViewProps
> = ({
  session,
  allQuestions,
  onUpdateSession,
  onFinishSession,
  onExitSession,
  onStartSisterTraining,
}) => {
  const questionIds = Array.isArray(session?.questionIds)
    ? session.questionIds
    : [];
  const currentIndex =
    typeof session?.currentIndex === "number" ? session.currentIndex : 0;
  const currentQuestionId =
    questionIds[currentIndex] || questionIds[0] || "";
  const currentQuestion: Question | undefined = allQuestions.find(
    (q) => q.id === currentQuestionId
  );

  // Local state for active question
  const currentAnswerState = session?.answers?.[currentQuestionId];
  const [selectedOption, setSelectedOption] = useState<
    "A" | "B" | "C" | "D" | null
  >(currentAnswerState ? currentAnswerState.selectedOption : null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(
    !!currentAnswerState
  );
  const [selectedConfidence, setSelectedConfidence] =
    useState<ConfidenceLevel>(
      currentAnswerState ? currentAnswerState.confidence : "MEDIUM"
    );
  const [isFlagged, setIsFlagged] = useState<boolean>(
    Array.isArray(session?.flaggedQuestionIds)
      ? session.flaggedQuestionIds.includes(currentQuestionId)
      : false
  );

  // Timer per question and overall session
  const [questionTimerSeconds, setQuestionTimerSeconds] = useState<number>(
    currentAnswerState ? currentAnswerState.timeSpentSeconds : 0
  );
  const [isPaused, setIsPaused] = useState<boolean>(Boolean(session?.paused));
  const [isGridOpen, setIsGridOpen] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [autosaveIndicator, setAutosaveIndicator] = useState<boolean>(false);

  // Sync state when currentIndex changes
  useEffect(() => {
    const ans = session?.answers
      ? session.answers[currentQuestionId]
      : undefined;
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
    setIsFlagged(
      Array.isArray(session?.flaggedQuestionIds)
        ? session.flaggedQuestionIds.includes(currentQuestionId)
        : false
    );
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
      if (
        isPaused ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (!isAnswerSubmitted) {
        if (e.key === "a" || e.key === "A" || e.key === "1")
          setSelectedOption("A");
        if (e.key === "b" || e.key === "B" || e.key === "2")
          setSelectedOption("B");
        if (e.key === "c" || e.key === "C" || e.key === "3")
          setSelectedOption("C");
        if (e.key === "d" || e.key === "D" || e.key === "4")
          setSelectedOption("D");
        if (e.key === "Enter" && selectedOption) {
          handleConfirmAnswer();
        }
      }

      if (e.key === "r" || e.key === "R") {
        toggleFlag();
      }

      if (
        e.key === "ArrowRight" &&
        session.currentIndex < session.questionIds.length - 1
      ) {
        handleNavigateTo(session.currentIndex + 1);
      }
      if (e.key === "ArrowLeft" && session.currentIndex > 0) {
        handleNavigateTo(session.currentIndex - 1);
      }
    },
    [
      isPaused,
      isAnswerSubmitted,
      selectedOption,
      session.currentIndex,
      session.questionIds.length,
    ]
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

    const isCorrect =
      currentQuestion.options.find((o) => o.id === selectedOption)?.isCorrect ??
      false;

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
      totalDurationSeconds:
        session.totalDurationSeconds + questionTimerSeconds,
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

  const handleSaveErrorReason = (
    errorReason: ErrorTaxonomy,
    userReflection?: string
  ) => {
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
    return `${mins.toString().padStart(2, "0")}:${remainingSecs
      .toString()
      .padStart(2, "0")}`;
  };

  const totalAnsweredCount = Object.keys(session?.answers || {}).length;
  const totalQuestionsInSession = session?.questionIds?.length || 1;
  const progressPercent = Math.round(
    ((currentIndex + 1) / totalQuestionsInSession) * 100
  );

  const isAnnulled = Boolean(
    currentQuestion?.correctAnswer === "ANNULLED" ||
      (currentQuestion as any)?.answerFinal === "ANNULLED" ||
      (currentQuestion as any)?.officialStatus === "annulled"
  );

  const formattedArea = currentQuestion?.area
    ? currentQuestion.area.replace(/_/g, " ")
    : "Área Médica";

  if (!currentQuestion) {
    return (
      <div className="p-12 text-center text-slate-500 space-y-4 max-w-xl mx-auto">
        <p className="text-sm font-medium">
          Não foi possível carregar a questão da sessão.
        </p>
        <button
          type="button"
          onClick={onExitSession}
          className="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Voltar para o Banco
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24 relative">
      {/* 1. TOP BAR — Compacta, Clara e Focada */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-xs sticky top-[65px] z-20 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Sair do Treino */}
            <button
              type="button"
              onClick={() => setShowExitConfirm(true)}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
              title="Sair do treino (seu progresso fica salvo)"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Número da Questão e Metadados Essenciais */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 truncate">
                <span>
                  Questão {session.currentIndex + 1} de {session.questionIds.length}
                </span>
                <span className="text-slate-300 font-normal">|</span>
                <span className="text-slate-500 font-medium text-[11px] capitalize truncate">
                  {formattedArea}
                </span>
                {currentQuestion.examYear && (
                  <>
                    <span className="text-slate-300 font-normal">|</span>
                    <span className="text-slate-500 font-medium text-[11px]">
                      {currentQuestion.examYear}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Cronômetro e Controles Rápidos */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Cronômetro */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatTimer(questionTimerSeconds)}</span>
            </div>

            {/* Pausar */}
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              className={`p-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                isPaused
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900"
              }`}
              title={isPaused ? "Retomar treino" : "Pausar cronômetro"}
            >
              {isPaused ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>

            {/* Flag / Marcar para Revisar */}
            <button
              type="button"
              onClick={toggleFlag}
              className={`p-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                isFlagged
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900"
              }`}
              title="Marcar para revisar depois (Atalho: R)"
            >
              <Flag className="w-4 h-4" />
            </button>

            {/* Grade de Navegação */}
            <button
              type="button"
              onClick={() => setIsGridOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              title="Ver grade de todas as questões da sessão"
            >
              <Grid className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">
                Grade ({totalAnsweredCount}/{session.questionIds.length})
              </span>
            </button>
          </div>
        </div>

        {/* Barra Fina de Progresso */}
        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-600 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 2. PAUSE OVERLAY */}
      {isPaused && (
        <div className="p-8 rounded-3xl bg-amber-50 border border-amber-200 text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Pause className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-amber-950">Treino Pausado</h3>
          <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
            O cronômetro foi pausado e a questão está oculta. Clique no botão abaixo para retomar quando estiver pronto.
          </p>
          <button
            type="button"
            onClick={() => setIsPaused(false)}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Continuar Treino
          </button>
        </div>
      )}

      {/* 3. CONTEÚDO PRINCIPAL DA QUESTÃO */}
      {!isPaused && (
        <div className="space-y-5">
          {/* Card do Caso Clínico e Alternativas */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-6">
            {/* Metadados e Badge de Anulação */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                {currentQuestion.code && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-[11px] font-bold border border-slate-200/80">
                    {currentQuestion.code}
                  </span>
                )}
                <span className="text-xs text-slate-500 font-medium">
                  {currentQuestion.topic || "Tema Clínico"}
                </span>
                {currentQuestion.examEdition && (
                  <>
                    <span className="text-slate-300 font-normal">•</span>
                    <span className="text-xs text-slate-400">
                      {currentQuestion.examEdition}
                    </span>
                  </>
                )}
              </div>

              {isAnnulled && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Questão Anulada pela Banca</span>
                </span>
              )}
            </div>

            {/* Enunciado / Caso Clínico Integral */}
            <div className="text-sm sm:text-base text-slate-800 leading-relaxed font-sans whitespace-pre-line select-text space-y-4">
              {currentQuestion.clinicalCase
                .split(/(\[IMAGEM:.*?\])/g)
                .map((part, i) => {
                  if (part.startsWith("[IMAGEM:") && part.endsWith("]")) {
                    const imgPath = part
                      .replace("[IMAGEM:", "")
                      .replace("]", "")
                      .trim();
                    const matchedImg = currentQuestion.images?.find(
                      (img) =>
                        img.relativePath === imgPath ||
                        img.url === imgPath ||
                        (img.filename && imgPath.includes(img.filename))
                    );
                    return (
                      <div
                        key={i}
                        className="my-4 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 block w-full max-w-lg mx-auto shadow-2xs"
                      >
                        <img
                          src={matchedImg?.url || `/${imgPath}`}
                          alt={matchedImg?.caption || "Imagem clínica"}
                          className="max-h-80 mx-auto object-contain rounded-xl"
                          referrerPolicy="no-referrer"
                        />
                        {matchedImg?.caption && (
                          <p className="text-[11px] text-slate-500 text-center mt-2 font-medium">
                            {matchedImg.caption}
                          </p>
                        )}
                      </div>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
            </div>

            {/* Imagens anexas adicionais (se houver) */}
            {currentQuestion.images &&
              currentQuestion.images.filter(
                (img) =>
                  !currentQuestion.clinicalCase.includes(img.relativePath || "") &&
                  !currentQuestion.clinicalCase.includes(img.filename || "")
              ).length > 0 && (
                <div className="space-y-3 pt-2">
                  {currentQuestion.images
                    .filter(
                      (img) =>
                        !currentQuestion.clinicalCase.includes(
                          img.relativePath || ""
                        ) &&
                        !currentQuestion.clinicalCase.includes(
                          img.filename || ""
                        )
                    )
                    .map((img, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 max-w-lg mx-auto shadow-2xs"
                      >
                        <img
                          src={
                            img.url ||
                            `/${img.relativePath}` ||
                            "/placeholder-clinical.png"
                          }
                          alt={img.caption || "Imagem clínica da questão"}
                          className="max-h-80 mx-auto object-contain rounded-xl"
                          referrerPolicy="no-referrer"
                        />
                        {img.caption && (
                          <p className="text-[11px] text-slate-500 text-center mt-2 font-medium">
                            {img.caption}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}

            {/* Nível de Confiança / Segurança (Apenas no Modo Estudo antes de responder) */}
            {!isAnswerSubmitted &&
              session.config.feedbackMode !== "END_OF_SESSION" && (
                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 font-medium">
                    Grau de segurança na resposta:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(["LOW", "MEDIUM", "HIGH"] as ConfidenceLevel[]).map(
                      (level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setSelectedConfidence(level)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            selectedConfidence === level
                              ? "bg-slate-900 text-white shadow-2xs"
                              : "bg-slate-100 text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {level === "LOW"
                            ? "Baixa"
                            : level === "MEDIUM"
                            ? "Média"
                            : "Alta"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

            {/* Lista de Alternativas A, B, C, D */}
            <div className="space-y-3 pt-2">
              {currentQuestion.options.map((opt) => {
                const isSelected = selectedOption === opt.id;
                let optionStyles =
                  "bg-slate-50/60 border-slate-200/90 text-slate-800 hover:bg-slate-100 hover:border-slate-300";
                let badgeStyles =
                  "bg-white border-slate-200 text-slate-700";

                if (
                  isAnswerSubmitted &&
                  session.config.feedbackMode === "IMMEDIATE"
                ) {
                  if (opt.isCorrect) {
                    optionStyles =
                      "bg-emerald-50 border-emerald-500 text-emerald-950 font-medium ring-1 ring-emerald-500/30";
                    badgeStyles = "bg-emerald-600 border-emerald-600 text-white font-bold";
                  } else if (isSelected && !opt.isCorrect) {
                    optionStyles =
                      "bg-rose-50 border-rose-500 text-rose-950 font-medium ring-1 ring-rose-500/30";
                    badgeStyles = "bg-rose-600 border-rose-600 text-white font-bold";
                  } else {
                    optionStyles = "bg-slate-50/40 border-slate-200/60 text-slate-400 opacity-60";
                    badgeStyles = "bg-slate-100 border-slate-200 text-slate-400";
                  }
                } else if (isSelected) {
                  optionStyles =
                    "bg-teal-50/80 border-teal-600 text-teal-950 font-semibold ring-1 ring-teal-600/30 shadow-2xs";
                  badgeStyles = "bg-teal-600 border-teal-600 text-white font-bold";
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectOption(opt.id)}
                    disabled={
                      isAnswerSubmitted &&
                      session.config.feedbackMode === "IMMEDIATE"
                    }
                    aria-label={`Alternativa ${opt.id}: ${opt.text}`}
                    className={`w-full p-4 rounded-2xl border text-left text-xs sm:text-sm leading-relaxed transition-all flex items-start gap-3.5 cursor-pointer ${optionStyles}`}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg font-bold flex items-center justify-center shrink-0 text-xs border ${badgeStyles}`}
                    >
                      {opt.id}
                    </span>
                    <span className="flex-1 pt-0.5">{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {/* Botão de Confirmação (Antes de responder) */}
            {!isAnswerSubmitted && (
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Atalhos: Teclas A, B, C, D • Enter para confirmar
                </span>

                <button
                  type="button"
                  onClick={handleConfirmAnswer}
                  disabled={!selectedOption}
                  id="session-confirm-answer-btn"
                  className={`w-full sm:w-auto px-7 py-3 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                    selectedOption
                      ? "bg-teal-600 hover:bg-teal-500 text-white shadow-xs cursor-pointer hover:scale-[1.02]"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/80"
                  }`}
                >
                  <span>CONFIRMAR RESPOSTA</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 4. FEEDBACK IMEDIATO (Se respondido e em Modo Estudo) */}
          {isAnswerSubmitted &&
            selectedOption &&
            session.config.feedbackMode === "IMMEDIATE" && (
              <LayeredCorrectionFeedback
                question={currentQuestion}
                selectedOption={selectedOption}
                confidence={selectedConfidence}
                allQuestions={allQuestions}
                onNextQuestion={handleNext}
                isLastQuestion={
                  session.currentIndex === session.questionIds.length - 1
                }
                onSaveErrorReflection={handleSaveErrorReason}
                onStartSisterTraining={onStartSisterTraining}
              />
            )}

          {/* 5. NAVEGAÇÃO FOOTER (Anterior / Próxima) */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={session.currentIndex === 0}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                session.currentIndex > 0
                  ? "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-2xs cursor-pointer"
                  : "bg-slate-50 text-slate-300 border-slate-200/60 cursor-not-allowed"
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            {/* Modo Simulado (Feedback no final): Botão de avançar ou finalizar */}
            {session.config.feedbackMode === "END_OF_SESSION" ? (
              <div className="flex items-center gap-2">
                {session.currentIndex === session.questionIds.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => onFinishSession(session)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-xs transition-transform hover:scale-[1.02] cursor-pointer"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Finalizar e Ver Gabarito</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xs cursor-pointer hover:scale-[1.02]"
                  >
                    <span>Próxima</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer hover:scale-[1.02]"
              >
                <span>
                  {session.currentIndex === session.questionIds.length - 1
                    ? "Finalizar Treino"
                    : "Próxima Questão"}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 6. MODAL DA GRADE DE TODAS AS QUESTÕES DA SESSÃO */}
      {isGridOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Navegador da Sessão
                </h3>
                <p className="text-xs text-slate-500">
                  {totalAnsweredCount} de {session.questionIds.length} respondidas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGridOpen(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Grade de Questões */}
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-72 overflow-y-auto p-1">
              {(session?.questionIds || []).map((qId, idx) => {
                const ans = session?.answers ? session.answers[qId] : undefined;
                const isCurrent = idx === (session?.currentIndex ?? 0);
                const isFlag = Array.isArray(session?.flaggedQuestionIds)
                  ? session.flaggedQuestionIds.includes(qId)
                  : false;

                let squareStyle =
                  "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100";
                if (isCurrent) {
                  squareStyle =
                    "ring-2 ring-teal-500 bg-teal-50 text-teal-900 font-bold border-teal-500";
                } else if (ans) {
                  if (session.config.feedbackMode === "IMMEDIATE") {
                    squareStyle = ans.isCorrect
                      ? "bg-emerald-50 border-emerald-500 text-emerald-800 font-bold"
                      : "bg-rose-50 border-rose-500 text-rose-800 font-bold";
                  } else {
                    squareStyle =
                      "bg-teal-50 border-teal-400 text-teal-800 font-bold";
                  }
                }

                return (
                  <button
                    key={qId}
                    type="button"
                    onClick={() => handleNavigateTo(idx)}
                    className={`h-11 rounded-xl border flex flex-col items-center justify-center text-xs transition-all relative cursor-pointer ${squareStyle}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlag && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
                    )}
                    {ans && (
                      <span className="text-[9px] opacity-70 font-mono">
                        {ans.selectedOption}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-teal-600" /> Respondida
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Marcada
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-300" /> Pendente
                </span>
              </div>

              <button
                type="button"
                onClick={() => onFinishSession(session)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-2xs"
              >
                Concluir Sessão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL DE CONFIRMAÇÃO DE SAÍDA */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-xl space-y-4 text-center">
            <h3 className="font-bold text-base text-slate-900">
              Salvar e Sair do Treino?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Seu progresso ({totalAnsweredCount}/{session.questionIds.length}{" "}
              questões respondidas) será salvo automaticamente. Você poderá continuar exatamente de onde parou no Banco de Questões.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Continuar Treinando
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  onExitSession();
                }}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer"
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
