// Textos do plano do dia, montados a partir do que o banco devolve (app_today / app_home).
import { areaLabel } from "../practice/format.js";

export const KIND_LABEL = { estudar: "Estudar", praticar: "Praticar", revisar: "Revisar" };

/** Por que esta tarefa está no plano, em uma frase. */
export function reasonText(task) {
  const { reason, attempts = 0, accuracy } = task.ref ?? {};
  if (reason === "diagnostic") return "10 questões oficiais para calcular sua acurácia nas 5 grandes áreas e montar o plano dos próximos dias.";
  if (reason === "untrained") {
    const done = attempts === 0 ? "nenhuma questão" : attempts === 1 ? "só 1 questão" : `só ${attempts} questões`;
    return `Você respondeu ${done} desta área até agora.`;
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

export function trialTitle(daysLeft) {
  if (daysLeft <= 0) return "Seu teste gratuito termina hoje";
  if (daysLeft === 1) return "Seu teste gratuito termina amanhã";
  return `Seu teste gratuito termina em ${daysLeft} dias`;
}
