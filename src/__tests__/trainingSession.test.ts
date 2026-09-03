import { describe, it, expect, beforeEach } from 'vitest';
import { ActiveTrainingSession, QuestionSessionConfig, SessionAnswerState } from '../types/session';
import { SessionBuilderService } from '../services/sessionBuilderService';
import { TEST_QUESTIONS_COLLECTION } from './testFixtures';

describe('TrainingSession Lifecycle Regression Tests', () => {
  const baseConfig: QuestionSessionConfig = {
    mode: 'SIMULADO',
    title: 'Simulado de Treino',
    objective: 'OFICIAIS',
    areas: ['ALL'],
    topics: [],
    competencies: [],
    years: ['ALL'],
    origin: 'ALL',
    difficulty: 'ALL',
    inepRelevance: 'ALL',
    smartFilters: {
      onlyUnanswered: false,
      onlyWrong: false,
      onlyCorrect: false,
      onlyFlagged: false,
      onlyReincidentErrors: false,
      onlyWithUpdatedGuideline: false,
      onlyHighInepPattern: false,
      excludeMastered: false,
    },
    quantity: 10,
    feedbackMode: 'END_OF_SESSION',
    timerMode: 'EXAM_STRICT',
    showComments: false,
    ordering: 'RANDOM',
  };

  const q1 = TEST_QUESTIONS_COLLECTION[0];
  const q2 = TEST_QUESTIONS_COLLECTION[1];
  const q3 = TEST_QUESTIONS_COLLECTION[2];

  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize a new ActiveTrainingSession with correct default state', () => {
    const questionIds = [q1.id, q2.id, q3.id];
    const session: ActiveTrainingSession = {
      id: 'sess-test-01',
      title: 'Simulado 3 Questões',
      mode: 'SIMULADO',
      config: baseConfig,
      questionIds,
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    expect(session.id).toBe('sess-test-01');
    expect(session.questionIds.length).toBe(3);
    expect(session.currentIndex).toBe(0);
    expect(session.isCompleted).toBe(false);
    expect(Object.keys(session.answers).length).toBe(0);
  });

  it('should record user responses in session.answers and update progress', () => {
    const session: ActiveTrainingSession = {
      id: 'sess-test-02',
      title: 'Simulado em Andamento',
      mode: 'SIMULADO',
      config: baseConfig,
      questionIds: [q1.id, q2.id, q3.id],
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    // Answer Q1
    const ans1: SessionAnswerState = {
      questionId: q1.id,
      selectedOption: q1.correctAnswer as 'A' | 'B' | 'C' | 'D',
      isCorrect: true,
      timeSpentSeconds: 45,
      confidence: 'HIGH',
      timestamp: new Date().toISOString(),
    };
    session.answers[q1.id] = ans1;
    session.currentIndex = 1;
    session.lastUpdated = new Date().toISOString();

    expect(Object.keys(session.answers).length).toBe(1);
    expect(session.answers[q1.id].isCorrect).toBe(true);
    expect(session.currentIndex).toBe(1);

    // Answer Q2
    const wrongOption = (['A', 'B', 'C', 'D'].find((o) => o !== q2.correctAnswer) || 'D') as 'A' | 'B' | 'C' | 'D';
    const ans2: SessionAnswerState = {
      questionId: q2.id,
      selectedOption: wrongOption,
      isCorrect: false,
      timeSpentSeconds: 60,
      confidence: 'MEDIUM',
      timestamp: new Date().toISOString(),
      errorReason: 'DISTRACTOR_TRAP',
    };
    session.answers[q2.id] = ans2;
    session.currentIndex = 2;

    expect(Object.keys(session.answers).length).toBe(2);
    expect(session.answers[q2.id].isCorrect).toBe(false);
    expect(session.answers[q2.id].errorReason).toBe('DISTRACTOR_TRAP');
  });

  it('should save and resume an active session from local storage via SessionBuilderService', () => {
    const session: ActiveTrainingSession = {
      id: 'sess-resume-01',
      title: 'Sessão para Retomada',
      mode: 'SIMULADO',
      config: baseConfig,
      questionIds: [q1.id, q2.id],
      currentIndex: 1,
      answers: {
        [q1.id]: {
          questionId: q1.id,
          selectedOption: q1.correctAnswer as 'A' | 'B' | 'C' | 'D',
          isCorrect: true,
          timeSpentSeconds: 30,
          confidence: 'HIGH',
          timestamp: new Date().toISOString(),
        },
      },
      flaggedQuestionIds: [q2.id],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 30,
      isCompleted: false,
      paused: false,
    };

    SessionBuilderService.saveActiveSession(session);

    const retrieved = SessionBuilderService.getActiveSession();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('sess-resume-01');
    expect(retrieved?.currentIndex).toBe(1);
    expect(retrieved?.flaggedQuestionIds).toContain(q2.id);
    expect(retrieved?.answers[q1.id].isCorrect).toBe(true);
  });

  it('should generate a comprehensive summary report when session is completed', () => {
    const wrongOption = (['A', 'B', 'C', 'D'].find((o) => o !== q2.correctAnswer) || 'D') as 'A' | 'B' | 'C' | 'D';
    const session: ActiveTrainingSession = {
      id: 'sess-complete-01',
      title: 'Sessão Finalizada',
      mode: 'SIMULADO',
      config: baseConfig,
      questionIds: [q1.id, q2.id],
      currentIndex: 1,
      answers: {
        [q1.id]: {
          questionId: q1.id,
          selectedOption: q1.correctAnswer as 'A' | 'B' | 'C' | 'D',
          isCorrect: true,
          timeSpentSeconds: 30,
          confidence: 'HIGH',
          timestamp: new Date().toISOString(),
        },
        [q2.id]: {
          questionId: q2.id,
          selectedOption: wrongOption,
          isCorrect: false,
          timeSpentSeconds: 50,
          confidence: 'MEDIUM',
          timestamp: new Date().toISOString(),
          errorReason: 'DISTRACTOR_TRAP',
        },
      },
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 80,
      isCompleted: true,
      paused: false,
    };

    const report = SessionBuilderService.generateSummaryReport(session, TEST_QUESTIONS_COLLECTION);
    expect(report.sessionId).toBe('sess-complete-01');
    expect(report.totalQuestions).toBe(2);
    expect(report.answeredCount).toBe(2);
    expect(report.correctCount).toBe(1);
    expect(report.wrongCount).toBe(1);
    expect(report.scorePercentage).toBe(50);
    expect(report.errorTaxonomyBreakdown.DISTRACTOR_TRAP).toBe(1);
  });
});
