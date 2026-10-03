// Agendamento dos flashcards (FSRS), com a mesma configuração do app (src/config/spacedRepetition.ts):
// retenção alvo de 90% e agendamento por dia.
import { createEmptyCard } from "ts-fsrs";
import { createFSRSInstance } from "../../../config/spacedRepetition";

const scheduler = createFSRSInstance();

/** Estado gravado no banco (ou nulo, cartão novo) → cartão do ts-fsrs. */
function toCard(schedule, now) {
  if (!schedule) return createEmptyCard(now);
  return {
    due: new Date(schedule.due),
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: schedule.elapsed_days,
    scheduled_days: schedule.scheduled_days,
    learning_steps: schedule.learning_steps ?? 0,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: schedule.state,
    last_review: schedule.last_review ? new Date(schedule.last_review) : undefined,
  };
}

function toSchedule(card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
}

/** Próximo estado do cartão para uma avaliação (1 errei · 2 difícil · 3 bom · 4 fácil). */
export function nextSchedule(schedule, rating, now = new Date()) {
  return toSchedule(scheduler.next(toCard(schedule, now), now, rating).card);
}

/** Quando o cartão volta em cada avaliação, em dias a partir de agora. */
export function previewDays(schedule, now = new Date()) {
  const preview = scheduler.repeat(toCard(schedule, now), now);
  return [1, 2, 3, 4].map((rating) => Math.max(0, Math.round((preview[rating].card.due.getTime() - now.getTime()) / 86_400_000)));
}

/** 0 → "hoje" · 1 → "1 dia" · 45 → "2 meses" · 400 → "1 ano" */
export function intervalLabel(days) {
  if (days <= 0) return "hoje";
  if (days === 1) return "1 dia";
  if (days < 30) return `${days} dias`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 mês" : `${months} meses`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? "1 ano" : `${years} anos`;
}
