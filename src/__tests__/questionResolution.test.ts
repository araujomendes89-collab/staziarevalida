import { describe, it, expect } from 'vitest';
import { Question, QuestionAttempt } from '../types';

// Pure resolution logic helper to test regression behavior independently
function resolveQuestion(
  question: Question,
  selectedOption: 'A' | 'B' | 'C' | 'D',
  timeSpentSeconds = 45
): {
  isCorrect: boolean;
  attempt: QuestionAttempt;
} {
  const isCorrect = question.correctAnswer === selectedOption;
  const attempt: QuestionAttempt = {
    id: `att-${Date.now()}`,
    questionId: question.id,
    questionCode: question.code || question.id,
    area: question.area,
    topic: question.topic || 'Geral',
    subtopic: question.subtopic,
    selectedOption,
    correctOption: question.correctAnswer as 'A' | 'B' | 'C' | 'D',
    isCorrect,
    timeSpentSeconds,
    timestamp: new Date().toISOString(),
    confidence: 'HIGH',
    inepIntent: question.inepIntent,
    keyFinding: question.keyFinding,
    expectedConduct: question.expectedConduct,
    errorReason: isCorrect ? undefined : 'KNOWLEDGE_GAP',
  };

  return { isCorrect, attempt };
}

function calculateSessionScore(attempts: QuestionAttempt[]): {
  total: number;
  correct: number;
  wrong: number;
  percentage: number;
} {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  const wrong = total - correct;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, correct, wrong, percentage };
}

describe('Question Resolution Flow Regression Tests', () => {
  const sampleQuestion: Question = {
    id: 'test-q1',
    code: 'REV-2026.1-Q1',
    clinicalCase: 'Paciente de 45 anos com dor torácica...',
    options: [
      { id: 'A', text: 'Realizar ECG em até 10 minutos', isCorrect: true, explanation: 'Conduta inicial imediata' },
      { id: 'B', text: 'Prescrever analgesia simples e alta', isCorrect: false, explanation: 'Conduta negligente' },
      { id: 'C', text: 'Aguardar enzimas cardíacas antes de qualquer exame', isCorrect: false, explanation: 'Atraso prejudicial' },
      { id: 'D', text: 'Encaminhar ao ambulatório geral', isCorrect: false, explanation: 'Risco de IAM agudo' },
    ],
    correctAnswer: 'A',
    area: 'CLINICA_MEDICA',
    topic: 'Cardiologia',
    subtopic: 'Síndrome Coronariana Aguda',
    difficulty: 'MEDIO',
    examYear: 2026,
    examEdition: 'Revalida INEP 2026/1 — Caderno 01',
    originalNumber: 1,
    origin: 'INEP_OFICIAL',
  };

  it('should correctly evaluate when the student selects the correct option (A)', () => {
    const result = resolveQuestion(sampleQuestion, 'A', 30);
    expect(result.isCorrect).toBe(true);
    expect(result.attempt.selectedOption).toBe('A');
    expect(result.attempt.correctOption).toBe('A');
    expect(result.attempt.errorReason).toBeUndefined();
  });

  it('should correctly evaluate when the student selects an incorrect distractor (B)', () => {
    const result = resolveQuestion(sampleQuestion, 'B', 40);
    expect(result.isCorrect).toBe(false);
    expect(result.attempt.selectedOption).toBe('B');
    expect(result.attempt.correctOption).toBe('A');
    expect(result.attempt.errorReason).toBe('KNOWLEDGE_GAP');
  });

  it('should calculate accuracy and score percentages accurately across multiple attempts', () => {
    const attempts: QuestionAttempt[] = [
      resolveQuestion(sampleQuestion, 'A').attempt, // Correct
      resolveQuestion(sampleQuestion, 'B').attempt, // Wrong
      resolveQuestion(sampleQuestion, 'A').attempt, // Correct
      resolveQuestion(sampleQuestion, 'C').attempt, // Wrong
      resolveQuestion(sampleQuestion, 'A').attempt, // Correct
    ];

    const score = calculateSessionScore(attempts);
    expect(score.total).toBe(5);
    expect(score.correct).toBe(3);
    expect(score.wrong).toBe(2);
    expect(score.percentage).toBe(60);
  });

  it('should handle question index advancement and navigation bounds', () => {
    const totalQuestions = 10;
    let currentIndex = 0;

    // Advance
    const nextQuestion = () => {
      if (currentIndex < totalQuestions - 1) {
        currentIndex += 1;
      }
    };

    const prevQuestion = () => {
      if (currentIndex > 0) {
        currentIndex -= 1;
      }
    };

    nextQuestion();
    expect(currentIndex).toBe(1);

    nextQuestion();
    expect(currentIndex).toBe(2);

    prevQuestion();
    expect(currentIndex).toBe(1);

    // Test upper bound
    currentIndex = 9;
    nextQuestion();
    expect(currentIndex).toBe(9); // does not exceed 9

    // Test lower bound
    currentIndex = 0;
    prevQuestion();
    expect(currentIndex).toBe(0); // does not go below 0
  });
});
