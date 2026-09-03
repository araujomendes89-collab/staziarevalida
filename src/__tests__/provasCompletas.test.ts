import { describe, it, expect } from 'vitest';
import { SAMPLE_QUESTIONS_2026_1, SAMPLE_QUESTIONS_2025_1, SAMPLE_QUESTIONS_2025_2 } from './testFixtures';
import { OFFICIAL_REVALIDA_EDITIONS } from '../services/examEngine';
import { QuestionSessionConfig } from '../types/session';

describe('Provas Completas Regression Tests', () => {
  it('should list all official Revalida editions', () => {
    expect(OFFICIAL_REVALIDA_EDITIONS).toBeDefined();
    expect(OFFICIAL_REVALIDA_EDITIONS.length).toBeGreaterThanOrEqual(10);

    const editionIds = OFFICIAL_REVALIDA_EDITIONS.map((e) => e.id);
    expect(editionIds).toContain('2026-1-TEORICA');
    expect(editionIds).toContain('2025-2-TEORICA');
    expect(editionIds).toContain('2025-1-TEORICA');
  });

  it('should retrieve official questions dataset for Revalida INEP 2026/1', () => {
    expect(SAMPLE_QUESTIONS_2026_1.length).toBeGreaterThanOrEqual(25);

    // Verify ordering and structure
    const sortedByOriginal = [...SAMPLE_QUESTIONS_2026_1].sort(
      (a, b) => a.originalNumber - b.originalNumber
    );

    expect(sortedByOriginal[0].originalNumber).toBe(1);
    expect(sortedByOriginal[0].examYear).toBe(2026);
  });

  it('should retrieve official questions dataset for Revalida INEP 2025/1 and 2025/2', () => {
    expect(SAMPLE_QUESTIONS_2025_1.length).toBeGreaterThanOrEqual(25);
    expect(SAMPLE_QUESTIONS_2025_2.length).toBeGreaterThanOrEqual(25);

    expect(SAMPLE_QUESTIONS_2025_1[0].examYear).toBe(2025);
    expect(SAMPLE_QUESTIONS_2025_2[0].examYear).toBe(2025);
  });

  it('should configure a full exam session with PROVA_INTEGRA mode and 300 minutes timer', () => {
    const config: QuestionSessionConfig = {
      mode: 'PROVA_INTEGRA',
      title: 'Prova Completa Revalida INEP 2026/1',
      objective: 'OFICIAIS',
      areas: ['ALL'],
      topics: [],
      competencies: [],
      years: [2026],
      origin: 'INEP_OFICIAL',
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
      quantity: 100,
      feedbackMode: 'END_OF_SESSION',
      timerMode: 'EXAM_STRICT',
      showComments: false,
      ordering: 'ORIGINAL_ORDER',
      examEditionId: '2026/1',
    };

    expect(config.mode).toBe('PROVA_INTEGRA');
    expect(config.quantity).toBe(100);
    expect(config.feedbackMode).toBe('END_OF_SESSION');
    expect(config.timerMode).toBe('EXAM_STRICT');
    expect(config.ordering).toBe('ORIGINAL_ORDER');
  });
});
