// Textos do plano do dia, montados a partir do que o banco devolve (app_today / app_home).
import { areaLabel } from "../practice/format.js";

export const KIND_LABEL = { estudar: "Estudar", praticar: "Praticar", revisar: "Revisar" };

/** Por que esta tarefa está no plano, em uma frase. */
export function reasonText(task) {
  const { reason, attempts = 0, accuracy } = task.ref ?? {};
  if (reason === "diagnostic") return "10 questões oficiais para calcular sua acurácia nas 5 grandes áreas e montar o plano dos próximos dias.";
  if (reason === "untrained") {
    if (attempts === 0) return "Você ainda não respondeu questões desta área.";
    return `Você respondeu ${attempts === 1 ? "só 1 questão" : `só ${attempts} questões`} desta área até agora.`;
  }
  if (reason === "lowest_accuracy") return `É a sua menor acurácia entre as grandes áreas: ${Math.round(accuracy)}% em ${attempts} respostas.`;
  if (reason === "errors") return "Questões cuja última resposta foi errada. Acertando, elas saem da lista.";
  return "";
}

/** Título do dia para a tela Plano de hoje. */
export function planHeadline(plan) {
  const task = plan.tasks.find((t) => !t.done);
  if (!task) return plan.total ? "Plano de hoje concluído" : "Nada pendente por hoje";
  if (task.ref?.reason === "diagnostic") return "Diagnóstico inicial nas 5 grandes áreas";
  if (task.kind === "revisar") return "Revisão das questões erradas";
  return `Foco de hoje: ${areaLabel(task.ref?.area)}`;
}

export function progressText(task) {
  const unit = task.kind === "revisar" ? (task.target === 1 ? "revista" : "revistas") : task.target === 1 ? "respondida" : "respondidas";
  return `${task.progress} de ${task.target} ${unit} hoje`;
}

/** Data do calendário de Brasília (AAAA-MM-DD) de um instante. */
const dayBR = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/**
 * Dias que faltam para o teste acabar, contados pelo calendário de Brasília (0 = acaba hoje), ou null se já acabou.
 * Com a data de fim (`ends_at` do app_home), a conta é pela data; sem ela, vale o `days_left` do banco (0 = já acabou).
 */
export function trialDaysLeft(trial, now = new Date()) {
  const ends = trial?.ends_at ? new Date(trial.ends_at) : null;
  if (ends && !Number.isNaN(ends.getTime())) {
    if (ends <= now) return null;
    return Math.round((Date.parse(dayBR(ends)) - Date.parse(dayBR(now))) / 86_400_000);
  }
  const left = Number(trial?.days_left);
  return Number.isFinite(left) && left > 0 ? left : null;
}

/** Título do aviso do teste grátis no Início. Depois do fim, diz que terminou (e não "termina hoje" para sempre). */
export function trialTitle(trial, now = new Date()) {
  const left = trialDaysLeft(trial, now);
  if (left === null) return "Seu teste grátis terminou";
  if (left <= 0) return "Seu teste gratuito termina hoje";
  if (left === 1) return "Seu teste gratuito termina amanhã";
  return `Seu teste gratuito termina em ${left} dias`;
}
