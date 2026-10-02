import type { ChecklistAnswer, ChecklistGrade, ChecklistItem, Station } from "./types";

/** Abaixo deste % de acerto a estação conta como "reprovada" nos filtros. */
export const DEFAULT_FAIL_THRESHOLD = 60;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Valor do nível escolhido; "Partial" num item de 2 níveis vale como "Incorrect". */
export function gradeValue(item: ChecklistItem, grade: ChecklistGrade | null | undefined): number {
  if (grade === "Correct") return item.grades.correct;
  if (grade === "Partial" && item.grades.partial !== null) return item.grades.partial;
  return item.grades.incorrect;
}

export interface PhaseScore {
  phase: string;
  score: number;
  max_score: number;
}

export interface StationScore {
  score: number;
  max_score: number;
  /** % de 0 a 100, uma casa decimal */
  correctness: number;
  by_phase: PhaseScore[];
}

/**
 * Nota = soma do valor do nível escolhido em cada item; itens sem resposta valem
 * o nível "incorreto". Respostas para itens desconhecidos são ignoradas.
 */
export function computeScore(station: Station, answers: ChecklistAnswer[]): StationScore {
  const gradeByItem = new Map<string, ChecklistGrade>();
  for (const answer of answers) gradeByItem.set(answer.id, answer.grade);

  const phases = new Map<string, PhaseScore>();
  let score = 0;
  let maxScore = 0;

  for (const item of station.checklist_items) {
    const value = gradeValue(item, gradeByItem.get(item.id));
    score += value;
    maxScore += item.grades.correct;

    const phase = phases.get(item.phase) ?? { phase: item.phase, score: 0, max_score: 0 };
    phase.score += value;
    phase.max_score += item.grades.correct;
    phases.set(item.phase, phase);
  }

  return {
    score: round(score, 3),
    max_score: round(maxScore, 3),
    correctness: maxScore > 0 ? round((score / maxScore) * 100, 1) : 0,
    by_phase: [...phases.values()].map((p) => ({
      phase: p.phase,
      score: round(p.score, 3),
      max_score: round(p.max_score, 3),
    })),
  };
}

export function isFailed(correctness: number, threshold = DEFAULT_FAIL_THRESHOLD): boolean {
  return correctness < threshold;
}
