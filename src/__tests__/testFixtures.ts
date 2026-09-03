import { Question } from '../types';
import { normalizeQuestionList } from '../utils/questionNormalizer';
import { REVALIDA_2026_1_QUESTIONS } from '../data/revalida2026_1Part1';
import { revalida2025_1Part1 } from '../data/revalida2025_1Part1';
import { revalida2025_2Part1 } from '../data/revalida2025_2Part1';

export const SAMPLE_QUESTIONS_2026_1: Question[] = normalizeQuestionList(REVALIDA_2026_1_QUESTIONS);
export const SAMPLE_QUESTIONS_2025_1: Question[] = normalizeQuestionList(revalida2025_1Part1);
export const SAMPLE_QUESTIONS_2025_2: Question[] = normalizeQuestionList(revalida2025_2Part1);

export const TEST_QUESTIONS_COLLECTION: Question[] = [
  ...SAMPLE_QUESTIONS_2026_1,
  ...SAMPLE_QUESTIONS_2025_1,
  ...SAMPLE_QUESTIONS_2025_2,
];
