import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import {
  Question,
  QuestionSessionConfig,
  ActiveTrainingSession,
  TrainingMode,
} from "../../types";
import {
  SessionBuilderService,
  DEFAULT_SESSION_CONFIG,
} from "../../services/sessionBuilderService";
import { InventoryValidatorService } from "../../services/inventoryValidatorService";
import { REVALIDA_EDITIONS_INVENTORY } from "../../data/revalidaInventoryData";
import { StudentQuestionsGeneratorView } from "./StudentQuestionsGeneratorView";
import { SessionBuilderModal } from "./SessionBuilderModal";
import { ActiveSessionResolutionView } from "./ActiveSessionResolutionView";
import { SessionResultsView } from "./SessionResultsView";
import { FullExamSelectorView } from "./FullExamSelectorView";
import { InepPrintableExam } from "./InepPrintableExam";

export const QuestionsView: React.FC = () => {
  const {
    user,
    questions,
    attempts,
    knowledgeGraph,
    editionsInventory,
    recordQuestionAttempt,
    questionMode,
  } = useApp();

  // Subview State: "HOME" | "ACTIVE_SESSION" | "RESULTS" | "EXAM_SELECTOR" | "PRINT_EXAM"
  const [currentView, setCurrentView] = useState<
    "HOME" | "ACTIVE_SESSION" | "RESULTS" | "EXAM_SELECTOR" | "PRINT_EXAM"
  >("HOME");

  // Printable Exam State
  const [printableQuestions, setPrintableQuestions] = useState<Question[]>([]);
  const [printableExamTitle, setPrintableExamTitle] = useState<string>("CADERNO DE QUESTÕES OBJETIVAS - REVALIDA INEP");
  const [printableExamEdition, setPrintableExamEdition] = useState<string>("Revalida INEP 2026/2 - 1ª Etapa Teórica");

  // Active Session State
  const [activeSession, setActiveSession] = useState<ActiveTrainingSession | null>(() => {
    return SessionBuilderService.getActiveSession();
  });

  // Builder Modal State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderInitialConfig, setBuilderInitialConfig] = useState<
    Partial<QuestionSessionConfig> | undefined
  >(undefined);

  // If there's an active session on boot or questionMode triggers EXAM, sync view
  useEffect(() => {
    const saved = SessionBuilderService.getActiveSession();
    if (saved && !saved.isCompleted) {
      setActiveSession(saved);
      if (questionMode === "EXAM") {
        setCurrentView("ACTIVE_SESSION");
      }
    }
  }, [questionMode]);

  // Handler: Start a Direct Session from config
  const handleStartSession = (config: QuestionSessionConfig) => {
    const selectedQuestions = SessionBuilderService.buildQuestionSession(
      config,
      questions,
      attempts,
      knowledgeGraph
    );

    if (selectedQuestions.length === 0) {
      alert("Nenhuma questão encontrada para os filtros selecionados.");
      return;
    }

    const newSession: ActiveTrainingSession = {
      id: `session-${Date.now()}`,
      title: config.title || "Treino de Questões",
      subtitle: `${selectedQuestions.length} questões selecionadas`,
      mode: config.mode,
      config,
      questionIds: selectedQuestions.map((q) => q.id),
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    setActiveSession(newSession);
    SessionBuilderService.saveActiveSession(newSession);
    setCurrentView("ACTIVE_SESSION");
  };

  // Handler: Update session answers while solving
  const handleUpdateSession = (updatedSession: ActiveTrainingSession) => {
    setActiveSession(updatedSession);
    SessionBuilderService.saveActiveSession(updatedSession);

    // Sync last answered question with AppContext history
    const currentQId = updatedSession?.questionIds?.[updatedSession?.currentIndex ?? 0];
    const ans = currentQId && updatedSession?.answers ? updatedSession.answers[currentQId] : undefined;
    if (ans && currentQId) {
      recordQuestionAttempt({
        questionId: currentQId,
        selectedOption: ans.selectedOption,
        isCorrect: ans.isCorrect,
        timeSpentSeconds: ans.timeSpentSeconds,
        activeDurationMs: ans.activeDurationMs,
        timingVersion: ans.timingVersion,
        confidence: ans.confidence,
        errorReason: ans.errorReason,
        userReflection: ans.userReflection,
        mode:
          updatedSession.mode === "SIMULADO"
            ? "EXAM"
            : updatedSession.mode === "RAPIDO"
            ? "PRESSURE"
            : "STUDY",
      });
    }
  };

  // Handler: Finish Session
  const handleFinishSession = (sessionToFinish: ActiveTrainingSession) => {
    const completed: ActiveTrainingSession = {
      ...sessionToFinish,
      isCompleted: true,
      completedAt: new Date().toISOString(),
    };
    setActiveSession(completed);
    SessionBuilderService.saveActiveSession(completed);
    setCurrentView("RESULTS");
  };

  // Handler: Resume existing active session
  const handleResumeSession = () => {
    if (activeSession) {
      setCurrentView("ACTIVE_SESSION");
    }
  };

  // Handler: Discard active session
  const handleDiscardSession = () => {
    SessionBuilderService.clearActiveSession();
    setActiveSession(null);
  };

  // Handler: Start Exam on FullExamSelector
  const handleStartExam = (editionLabel: string, year: number, editionId?: string) => {
    const matchedEd = REVALIDA_EDITIONS_INVENTORY.find(
      (e) => e.id === editionId || e.editionLabel === editionLabel || e.year === year
    );

    let editionQuestions = questions.filter((q) =>
      matchedEd ? InventoryValidatorService.matchesEdition(q, matchedEd) : (q.examYear === year || (q.examEdition && q.examEdition.includes(year.toString())))
    );

    // If 0 questions available for this edition, sorted array remains empty
    const sorted = [...editionQuestions].sort(
      (a, b) => (a.originalNumber || 1) - (b.originalNumber || 1)
    );

    const examConfig: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "SIMULADO",
      title: `Prova Oficial: ${editionLabel}`,
      objective: "OFICIAIS",
      origin: "INEP_OFICIAL",
      years: [year],
      examEditionId: editionId || year.toString(),
      quantity: sorted.length,
      feedbackMode: "END_OF_SESSION",
      timerMode: "EXAM_STRICT",
      ordering: "ORIGINAL_ORDER",
    };

    const newSession: ActiveTrainingSession = {
      id: `session-${Date.now()}`,
      title: examConfig.title || "Prova Oficial",
      subtitle: `${sorted.length} questões oficiais · ${matchedEd?.stage || "1ª Etapa Teórica Objetiva"}`,
      mode: "SIMULADO",
      config: examConfig,
      questionIds: sorted.map((q) => q.id),
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    setActiveSession(newSession);
    SessionBuilderService.saveActiveSession(newSession);
    setCurrentView("ACTIVE_SESSION");
  };

  // Handler: Start Errors Training Session
  const handleStartErrorsTraining = (errorQuestionIds: string[]) => {
    const errorConfig: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "ERROS",
      title: "Consolidação de Erros da Sessão",
      objective: "REVISAO_ERROS",
      quantity: errorQuestionIds.length,
      feedbackMode: "IMMEDIATE",
      timerMode: "FREE",
      ordering: "WEAKEST_FIRST",
      smartFilters: {
        ...DEFAULT_SESSION_CONFIG.smartFilters,
        onlyWrong: true,
      },
    };
    handleStartSession(errorConfig);
  };

  // Handler: Start Sister Questions Training
  const handleStartSisterTraining = (sisterQuestionIds: string[]) => {
    const sisterQuestions = questions.filter((q) => sisterQuestionIds.includes(q.id));
    const targetTopic = sisterQuestions[0]?.topic;

    const sisterConfig: QuestionSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      mode: "ADAPTATIVO",
      title: `Treino de Questões Irmãs: ${targetTopic || "Padrão Clínico"}`,
      objective: "SISTER_QUESTIONS",
      topics: targetTopic ? [targetTopic] : [],
      quantity: Math.max(5, sisterQuestionIds.length),
      feedbackMode: "IMMEDIATE",
      timerMode: "RECOMMENDED",
      ordering: "ADAPTIVE",
    };
    handleStartSession(sisterConfig);
  };

  // Handler: Open Printable Exam
  const handlePrintExam = (editionLabel?: string, year?: number, editionId?: string) => {
    let targetQuestions = questions;
    if (editionId || editionLabel || year) {
      const matchedEd = REVALIDA_EDITIONS_INVENTORY.find(
        (e) => e.id === editionId || e.editionLabel === editionLabel || e.year === year
      );
      if (matchedEd) {
        targetQuestions = questions.filter((q) => InventoryValidatorService.matchesEdition(q, matchedEd));
      } else if (year) {
        targetQuestions = questions.filter(
          (q) => q.examYear === year || (q.examEdition && q.examEdition.includes(year.toString()))
        );
      }
    }
    if (targetQuestions.length === 0) {
      targetQuestions = questions.slice(0, 50);
    }

    // Sort in official sequence
    const sorted = [...targetQuestions].sort((a, b) => (a.originalNumber || 1) - (b.originalNumber || 1));

    setPrintableQuestions(sorted);
    setPrintableExamTitle(editionLabel ? `PROVA OBJETIVA OFICIAL - ${editionLabel}` : "CADERNO DE QUESTÕES OBJETIVAS - REVALIDA INEP");
    setPrintableExamEdition(editionLabel || "Revalida INEP 2026/2 - 1ª Etapa Teórica");
    setCurrentView("PRINT_EXAM");
  };

  // Render Subviews
  return (
    <div className="w-full">
      {/* 1. STUDENT QUESTIONS GENERATOR VIEW */}
      {currentView === "HOME" && (
        <StudentQuestionsGeneratorView
          user={user}
          questions={questions}
          attempts={attempts}
          knowledgeGraph={knowledgeGraph}
          activeSession={activeSession}
          onResumeSession={handleResumeSession}
          onDiscardSession={handleDiscardSession}
          onStartDirectSession={handleStartSession}
          onOpenExamSelector={() => setCurrentView("EXAM_SELECTOR")}
          onOpenPrintSimulado={() => handlePrintExam()}
        />
      )}

      {/* 2. FULL EXAM SELECTOR VIEW */}
      {/* 3. PRINTABLE EXAM (INEP A4 2-COLUMN BOOKLET + ANSWER CARD + QR CODE) */}

      {/* 4. ACTIVE RESOLUTION VIEW */}
      {currentView === "ACTIVE_SESSION" && activeSession && (
        <ActiveSessionResolutionView
          session={activeSession}
          allQuestions={questions}
          onUpdateSession={handleUpdateSession}
          onFinishSession={handleFinishSession}
          onExitSession={() => setCurrentView("HOME")}
          onStartSisterTraining={handleStartSisterTraining}
        />
      )}

      {/* 5. RESULTS VIEW */}
      {currentView === "RESULTS" && activeSession && (
        <SessionResultsView
          session={activeSession}
          allQuestions={questions}
          onRetrySession={() => handleStartSession(activeSession.config)}
          onStartErrorsSession={handleStartErrorsTraining}
          onStartSisterSession={handleStartSisterTraining}
          onBackToHome={() => setCurrentView("HOME")}
          onReviewAnswers={() => setCurrentView("ACTIVE_SESSION")}
        />
      )}

      {/* 6. CUSTOM BUILDER MODAL */}
      <SessionBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onStartSession={handleStartSession}
        allQuestions={questions}
        attempts={attempts}
        knowledgeGraph={knowledgeGraph}
        initialConfig={builderInitialConfig}
      />
    </div>
  );
};
