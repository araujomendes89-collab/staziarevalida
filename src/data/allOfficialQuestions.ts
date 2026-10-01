import { Question } from "../types";
import { normalizeQuestionList } from "../utils/questionNormalizer";
import { SEED_QUESTIONS } from "./questionsData";
import { SEED_INEDITAS_QUESTIONS } from "./ineditasData";

import { REVALIDA_2020_CANONICAL_COMPILED } from "./revalida2020CompiledQuestions";
import { REVALIDA_2021_CANONICAL_COMPILED } from "./revalida2021CompiledQuestions";
import { REVALIDA_2022_1_CANONICAL_COMPILED } from "./revalida2022_1CompiledQuestions";
import { REVALIDA_2022_2_CANONICAL_COMPILED } from "./revalida2022_2CompiledQuestions";
import { REVALIDA_2023_1_CANONICAL_COMPILED } from "./revalida2023_1CompiledQuestions";
import { REVALIDA_2023_2_CANONICAL_COMPILED } from "./revalida2023_2CompiledQuestions";
import { REVALIDA_2024_1_CANONICAL_COMPILED } from "./revalida2024_1CompiledQuestions";
import { REVALIDA_2024_2_CANONICAL_COMPILED } from "./revalida2024_2CompiledQuestions";
import { REVALIDA_2025_1_CANONICAL_COMPILED } from "./revalida2025_1CompiledQuestions";
import { REVALIDA_2025_2_CANONICAL_COMPILED } from "./revalida2025_2CompiledQuestions";
import { REVALIDA_2026_1_CANONICAL_COMPILED } from "./revalida2026_1CompiledQuestions";
import { ENAMED_2025_CANONICAL_COMPILED } from "./enamed2025CompiledQuestions";

// Raw compilation of all sources
const RAW_ALL_ITEMS = [
  ...SEED_QUESTIONS,
  ...SEED_INEDITAS_QUESTIONS,
  ...REVALIDA_2020_CANONICAL_COMPILED,
  ...REVALIDA_2021_CANONICAL_COMPILED,
  ...REVALIDA_2022_1_CANONICAL_COMPILED,
  ...REVALIDA_2022_2_CANONICAL_COMPILED,
  ...REVALIDA_2023_1_CANONICAL_COMPILED,
  ...REVALIDA_2023_2_CANONICAL_COMPILED,
  ...REVALIDA_2024_1_CANONICAL_COMPILED,
  ...REVALIDA_2024_2_CANONICAL_COMPILED,
  ...REVALIDA_2025_1_CANONICAL_COMPILED,
  ...REVALIDA_2025_2_CANONICAL_COMPILED,
  ...REVALIDA_2026_1_CANONICAL_COMPILED,
  ...ENAMED_2025_CANONICAL_COMPILED,
];

/**
 * Standardized, deduplicated and fully conforming Question objects
 */
export const ALL_CANONICAL_QUESTIONS: Question[] = normalizeQuestionList(RAW_ALL_ITEMS);
