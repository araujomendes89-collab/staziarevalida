import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { FullExamSelectorView } from "../questions/FullExamSelectorView";
import { InepPrintableExam } from "../questions/InepPrintableExam";
import { ActiveSessionResolutionView } from "../questions/ActiveSessionResolutionView";
import { SessionResultsView } from "../questions/SessionResultsView";
import { REVALIDA_EDITIONS_INVENTORY } from "../../data/revalidaInventoryData";
import { InventoryValidatorService } from "../../services/inventoryValidatorService";
import { ActiveTrainingSession, SessionAnswerState } from "../../types";

export const ProvasCompletasView: React.FC = () => {
  const { user, firebaseUser, questions, attempts, recordQuestionAttempt, activeSession, setActiveSession, saveSessionToFirestore } = useApp();
  const [currentView, setCurrentView] = useState<"SELECTOR" | "PRINT_EXAM" | "ACTIVE_SESSION" | "RESULTS">("SELECTOR");
  
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
      userId: firebaseUser?.uid || user?.id || "local-session",
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      config: {
        mode: "SIMULADO",
        title: `Prova Oficial: ${editionLabel || year}`,
        objective: "FULL_EXAM",
        topics: [],
        quantity: sorted.length,
        feedbackMode: "END_OF_SESSION",
        timerMode: "STRICT_EXAM",
        ordering: "OFFICIAL_SEQUENCE",
      },
      questionIds: sorted.map(q => q.id),
      currentIndex: 0,
      answers: {},
      totalDurationSeconds: 0,
      status: "IN_PROGRESS"
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
    const finished: ActiveTrainingSession = { ...session, status: "COMPLETED", lastUpdated: new Date().toISOString() };
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
        flaggedQuestionIds: [],
        startTime: finished.createdAt || new Date().toISOString(),
        lastUpdated: finished.lastUpdated || new Date().toISOString(),
        totalDurationSeconds: finished.totalDurationSeconds || 0,
        isCompleted: true,
        completedAt: new Date().toISOString(),
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
          questions={questions.filter(q => activeSession.questionIds.includes(q.id))}
          onUpdateSession={setActiveSession}
          onFinishSession={handleFinishSession}
          onExit={() => setCurrentView("SELECTOR")}
        />
      )}
      
      {currentView === "RESULTS" && activeSession && (
        <SessionResultsView
          session={activeSession}
          questions={questions.filter(q => activeSession.questionIds.includes(q.id))}
          onClose={() => setCurrentView("SELECTOR")}
        />
      )}
    </div>
  );
};
