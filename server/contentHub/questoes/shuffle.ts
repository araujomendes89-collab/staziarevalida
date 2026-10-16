/**
 * Embaralhamento determinístico do gabarito: a alternativa correta vai para a letra-alvo e as outras três mantêm a ordem
 * relativa nas letras que sobram; a explicação de cada alternativa anda com ela. Acontece ANTES das conferências (muda o
 * texto e o hash); por isso a explicação não pode citar letra (regra `explanation_cites_letter`).
 */
import { LETTERS, type GeneratedQuestion, type Letter } from "./types";

export function shuffleToTarget(q: GeneratedQuestion, target: Letter): { question: GeneratedQuestion; from: Letter; to: Letter } {
  const from = q.correct_answer;
  const others = LETTERS.filter((l) => l !== from);
  const slots = LETTERS.filter((l) => l !== target);
  const alternatives = {} as Record<Letter, string>;
  const alternative_explanations = {} as Record<Letter, string>;
  alternatives[target] = q.alternatives[from];
  alternative_explanations[target] = q.alternative_explanations[from];
  others.forEach((old, i) => {
    alternatives[slots[i]] = q.alternatives[old];
    alternative_explanations[slots[i]] = q.alternative_explanations[old];
  });
  return { question: { ...q, alternatives, alternative_explanations, correct_answer: target }, from, to: target };
}
