import { describe, it, expect } from 'vitest';
import { TEST_QUESTIONS_COLLECTION } from './testFixtures';
import { Question, MedicalArea } from '../types';

const VALID_AREAS: MedicalArea[] = [
  'CLINICA_MEDICA',
  'CIRURGIA_GERAL',
  'GINECOLOGIA_OBSTETRICIA',
  'PEDIATRIA',
  'MEDICINA_FAMILIA_COMUNIDADE',
];

describe('Question Model Regression Tests', () => {
  it('should have questions dataset populated and normalized', () => {
    expect(TEST_QUESTIONS_COLLECTION).toBeDefined();
    expect(TEST_QUESTIONS_COLLECTION.length).toBeGreaterThanOrEqual(50);
  });

  it('should validate 4 options (A, B, C, D) structure for all multiple choice questions', () => {
    for (const q of TEST_QUESTIONS_COLLECTION) {
      expect(q.id).toBeDefined();
      expect(typeof q.id).toBe('string');
      expect(q.options).toBeDefined();
      expect(Array.isArray(q.options)).toBe(true);

      expect(q.options.length).toBe(4);
      const optionIds = q.options.map((o) => o.id);
      expect(optionIds).toEqual(['A', 'B', 'C', 'D']);

      // Each option must have text
      for (const opt of q.options) {
        expect(opt.text).toBeDefined();
        expect(typeof opt.text).toBe('string');
        expect(opt.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('should validate correctAnswer property and correspondence in options', () => {
    for (const q of TEST_QUESTIONS_COLLECTION) {
      expect(q.correctAnswer).toBeDefined();
      expect(['A', 'B', 'C', 'D', 'ANNULLED']).toContain(q.correctAnswer);

      if (['A', 'B', 'C', 'D'].includes(q.correctAnswer)) {
        const correctOption = q.options.find((o) => o.id === q.correctAnswer);
        expect(correctOption).toBeDefined();
        expect(correctOption?.isCorrect).toBe(true);

        const correctOptionsCount = q.options.filter((o) => o.isCorrect).length;
        expect(correctOptionsCount).toBe(1);
      }
    }
  });

  it('should validate metadata fields: origin, examYear, examEdition, originalNumber', () => {
    for (const q of TEST_QUESTIONS_COLLECTION) {
      expect(q.origin).toBeDefined();
      expect(typeof q.origin).toBe('string');

      expect(q.examYear).toBeDefined();
      expect(typeof q.examYear).toBe('number');
      expect(q.examYear).toBeGreaterThanOrEqual(2020);
      expect(q.examYear).toBeLessThanOrEqual(2030);

      expect(q.originalNumber).toBeDefined();
      expect(typeof q.originalNumber).toBe('number');
      expect(q.originalNumber).toBeGreaterThanOrEqual(1);

      expect(VALID_AREAS).toContain(q.area);
      expect(q.clinicalCase).toBeDefined();
      expect(q.clinicalCase.trim().length).toBeGreaterThan(0);
    }
  });

  it('should validate question images structure when images are present', () => {
    const questionsWithImages = TEST_QUESTIONS_COLLECTION.filter(
      (q) => q.images && q.images.length > 0
    );

    // Some questions in 2026/1 have images (e.g. Q5, Q11, Q27)
    if (questionsWithImages.length > 0) {
      for (const q of questionsWithImages) {
        expect(Array.isArray(q.images)).toBe(true);
        for (const img of q.images!) {
          expect(img.url).toBeDefined();
          expect(typeof img.url).toBe('string');
          expect(img.url.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
