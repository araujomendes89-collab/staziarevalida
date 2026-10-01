import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { FullExamSelectorView } from "./FullExamSelectorView";
import { InepPrintableExam } from "./InepPrintableExam";
import { ActiveSessionResolutionView } from "./ActiveSessionResolutionView";
import { SessionResultsView } from "./SessionResultsView";
import { REVALIDA_EDITIONS_INVENTORY } from "../../data/revalidaInventoryData";
import { InventoryValidatorService } from "../../services/inventoryValidatorService";
import { ActiveTrainingSession, SessionAnswerState } from "../../types";

export const ProvasCompletasView: React.FC = () => {
  const { user, firebaseUser, questions, attempts, recordQuestionAttempt, saveSessionToFirestore } = useApp();
  const [currentView, setCurrentView] = useState<"SELECTOR" | "PRINT_EXAM" | "ACTIVE_SESSION" | "RESULTS">("SELECTOR");
  const [activeSession, setActiveSession] = useState<ActiveTrainingSession | null>(null);
  
  const [printableQuestions, setPrintableQuestions] = useState<any[]>([]);
  const [printableExamTitle, setPrintableExamTitle] = useState("");
  const [printableExamEdition, setPrintableExamEdition] = useState("");

  const handleStartExam = (editionLabel: string, year: number, editionId?: string) => {
    let targetQuestions = questions;
    const matchedEd = REVALIDA_EDITIONS_INVENTORY.find(e => e.id === editionId || e.editionLabel === editionLabel || e.year === year);
    if (matchedEd) {
      targetQuestions = questions.filter(q => InventoryValidatorService.matchesEdition(q, matchedEd));
    } else if (year) {
      targetQuestions = questions.filter(q => q.examYear === year || (q.examEdition && q.examEdition.includes(year.toString())));
    }
    
    if (targetQuestions.length === 0) return;
    const sorted = [...targetQuestions].sort((a, b) => (a.originalNumber || 1) - (b.originalNumber || 1));
    
    const newSession: ActiveTrainingSession = {
      id: crypto.randomUUID(),
      title: editionLabel || `Prova Oficial ${year}`,
      subtitle: `${sorted.length} questões • 1ª Etapa Teórica Objetiva`,
      mode: "SIMULADO",
      config: {
        mode: "SIMULADO",
        title: `Prova Oficial: ${editionLabel || year}`,
        objective: "FULL_EXAM",
        topics: [],
        competencies: [],
        areas: ["ALL"],
        years: [year ? year.toString() : "ALL"],
        difficulty: "ALL",
        inepRelevance: "ALL",
        quantity: sorted.length,
        feedbackMode: "END_OF_SESSION",
        timerMode: "EXAM_STRICT",
        showComments: false,
        ordering: "ORIGINAL_ORDER",
      },
      questionIds: sorted.map(q => q.id),
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
    setCurrentView("ACTIVE_SESSION");
  };

  const handlePrintExam = (editionLabel?: string, year?: number, editionId?: string) => {
    let targetQuestions = questions;
    if (editionId || editionLabel || year) {
      const matchedEd = REVALIDA_EDITIONS_INVENTORY.find(e => e.id === editionId || e.editionLabel === editionLabel || e.year === year);
      if (matchedEd) {
        targetQuestions = questions.filter(q => InventoryValidatorService.matchesEdition(q, matchedEd));
      } else if (year) {
        targetQuestions = questions.filter(q => q.examYear === year || (q.examEdition && q.examEdition.includes(year.toString())));
      }
    }
    if (targetQuestions.length === 0) {
      targetQuestions = questions.slice(0, 50);
    }
    const sorted = [...targetQuestions].sort((a, b) => (a.originalNumber || 1) - (b.originalNumber || 1));
    setPrintableQuestions(sorted);
    setPrintableExamTitle(editionLabel ? `PROVA OBJETIVA OFICIAL - ${editionLabel}` : "CADERNO DE QUESTÕES OBJETIVAS - REVALIDA INEP");
    setPrintableExamEdition(editionLabel || "Revalida INEP 2026/2 - 1ª Etapa Teórica");
    setCurrentView("PRINT_EXAM");
  };

  const handleFinishSession = (session: ActiveTrainingSession) => {
    const finished: ActiveTrainingSession = {
      ...session,
      isCompleted: true,
      completedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    setActiveSession(finished);

    // If authenticated, sync session to Firestore using authoritative Auth UID
    if (firebaseUser?.uid) {
      const firestoreSession = {
        id: finished.id,
        userId: firebaseUser.uid,
        title: finished.config.title || "Prova Oficial",
        mode: "SIMULADO" as const,
        config: finished.config,
        questionIds: finished.questionIds,
        currentIndex: finished.currentIndex || 0,
        answers: finished.answers || {},
        flaggedQuestionIds: finished.flaggedQuestionIds || [],
        startTime: finished.startTime || new Date().toISOString(),
        lastUpdated: finished.lastUpdated || new Date().toISOString(),
        totalDurationSeconds: finished.totalDurationSeconds || 0,
        isCompleted: true,
        completedAt: finished.completedAt || new Date().toISOString(),
        paused: false,
      };
      saveSessionToFirestore(firestoreSession);
    }

    Object.values(finished.answers).forEach(ans => {
      recordQuestionAttempt({
        id: crypto.randomUUID(),
        userId: firebaseUser?.uid || user?.id || "local-user",
        questionId: ans.questionId,
        timestamp: ans.timestamp,
        isCorrect: ans.isCorrect,
        timeSpentSeconds: ans.timeSpentSeconds || 0,
        activeDurationMs: ans.activeDurationMs,
        timingVersion: ans.timingVersion,
        selectedOption: ans.selectedOption,
        confidence: ans.confidence,
        sessionContext: "SIMULADO_OFICIAL",
      });
    });
    setCurrentView("RESULTS");
  };

  return (
    <div className="w-full">
      {currentView === "SELECTOR" && (
        <FullExamSelectorView
          editionsInventory={REVALIDA_EDITIONS_INVENTORY}
          allQuestions={questions}
          attempts={attempts}
          onStartExam={handleStartExam}
          onPrintExam={handlePrintExam}
        />
      )}
      
      {currentView === "PRINT_EXAM" && (
        <InepPrintableExam
          questions={printableQuestions}
          examTitle={printableExamTitle}
          examEdition={printableExamEdition}
          durationHours={5}
          onClose={() => setCurrentView("SELECTOR")}
        />
      )}
      
      {currentView === "ACTIVE_SESSION" && activeSession && (
        <ActiveSessionResolutionView
          session={activeSession}
          allQuestions={questions}
          onUpdateSession={setActiveSession}
          onFinishSession={handleFinishSession}
          onExitSession={() => setCurrentView("SELECTOR")}
        />
      )}
      
      {currentView === "RESULTS" && activeSession && (
        <SessionResultsView
          session={activeSession}
          allQuestions={questions}
          onClose={() => setCurrentView("SELECTOR")}
        />
      )}
    </div>
  );
};
