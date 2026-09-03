import { describe, it, expect } from 'vitest';
import { TEST_QUESTIONS_COLLECTION } from './testFixtures';
import { INITIAL_KNOWLEDGE_GRAPH } from '../data/knowledgeGraphData';
import { SessionBuilderService } from '../services/sessionBuilderService';
import { QuestionSessionConfig } from '../types/session';

describe('Simulados Generation Regression Tests', () => {
  it('should generate a custom simulated session with requested quantity without duplicates', () => {
    const config: QuestionSessionConfig = {
      mode: 'SIMULADO',
      title: 'Simulado de 15 Questões',
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
      quantity: 15,
      feedbackMode: 'END_OF_SESSION',
      timerMode: 'EXAM_STRICT',
      showComments: false,
      ordering: 'RANDOM',
    };

    const selectedQuestions = SessionBuilderService.buildQuestionSession(
      config,
      TEST_QUESTIONS_COLLECTION,
      [],
      INITIAL_KNOWLEDGE_GRAPH
    );

    expect(selectedQuestions.length).toBe(15);

    // Verify no duplicates
    const idSet = new Set(selectedQuestions.map((q) => q.id));
    expect(idSet.size).toBe(15);
  });

  it('should correctly filter questions when a specific medical area is selected', () => {
    const config: QuestionSessionConfig = {
      mode: 'RAPIDO',
      title: 'Treino de Clínica Médica',
      objective: 'OFICIAIS',
      areas: ['CLINICA_MEDICA'],
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
      quantity: 5,
      feedbackMode: 'IMMEDIATE',
      timerMode: 'FREE',
      showComments: true,
      ordering: 'ADAPTIVE',
    };

    const selectedQuestions = SessionBuilderService.buildQuestionSession(
      config,
      TEST_QUESTIONS_COLLECTION,
      [],
      INITIAL_KNOWLEDGE_GRAPH
    );

    expect(selectedQuestions.length).toBeGreaterThanOrEqual(1);
    for (const q of selectedQuestions) {
      expect(q.area).toBe('CLINICA_MEDICA');
    }
  });

  it('should find sister questions based on topic and clinical competency', () => {
    const target = TEST_QUESTIONS_COLLECTION[0];
    const sisterMatches = SessionBuilderService.getSisterQuestions(target, TEST_QUESTIONS_COLLECTION);

    expect(Array.isArray(sisterMatches)).toBe(true);
    for (const match of sisterMatches) {
      expect(match.question.id).not.toBe(target.id);
      expect(match.similarityScore).toBeGreaterThanOrEqual(50);
      expect(match.relationshipType).toBeDefined();
    }
  });
});
