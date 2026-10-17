// Tarefas do treino sozinho: separa o texto das tarefas como a sala em dupla (`splitTasks`) e monta as respostas por tarefa.
// Só formata o que veio do servidor; não escreve nem completa nada.
import { isTaskNote, splitTasks } from "../../dupla/content.js";
import { relatoNaFolha, tarefasAjustadas } from "../../../../shared/dupla/tarefasRelato";

/** O servidor aceita até 30 tarefas, 4.000 caracteres cada e 20.000 no total. */
export const MAX_TASKS = 30;
export const MAX_TASK_CHARS = 4000;
export const MAX_TOTAL_CHARS = 20000;

/**
 * Modelo das caixas de texto. Tarefas numeradas ("1. …") viram uma caixa cada; "Observação: …" não é tarefa (fica como nota);
 * sem nenhuma tarefa reconhecida (ou mais de 30), uma caixa só com o texto inteiro das tarefas à vista.
 * Com o relato do caso aberto desde o início, as tarefas citam o relato e não "impresso 1" (mesma regra da folha da sala).
 * @param {string | null | undefined} tasksText `tasks` do servidor
 * @param {Array<{ name?: string, initial?: boolean }>} pressings
 * @returns {{ tasks: string[], notes: string[], single: boolean, raw: string, count: number }}
 */
export function buildTaskModel(tasksText, pressings) {
  const raw = tarefasAjustadas(
    typeof tasksText === "string" ? tasksText : "",
    relatoNaFolha((pressings || []).map((p) => ({ name: p?.name, initially_visible: p?.initial === true })))
  );
  const numbered = /^\s*\d+\s*[.)]\s*\S/m.test(raw);
  const lines = splitTasks(raw);
  const tasks = numbered ? lines.filter((line) => !isTaskNote(line)) : [];
  const notes = numbered ? lines.filter((line) => isTaskNote(line)) : [];
  const single = !numbered || tasks.length === 0 || tasks.length > MAX_TASKS;
  return { tasks: single ? [] : tasks, notes: single ? [] : notes, single, raw, count: single ? 1 : tasks.length };
}

/** Textos por caixa (índice 0 = tarefa 1) a partir de `answers` do servidor. */
export function textsFromAnswers(answers, count) {
  const texts = Array.from({ length: count }, () => "");
  for (const answer of Array.isArray(answers) ? answers : []) {
    const index = Number(answer?.task) - 1;
    if (Number.isInteger(index) && index >= 0 && index < count && typeof answer.text === "string") texts[index] = answer.text;
  }
  return texts;
}

/** Respostas no formato do servidor: [{ task: 1.., text }]. */
export function answersFromTexts(texts) {
  return texts.map((text, index) => ({ task: index + 1, text }));
}

/** Quantos caracteres ainda cabem na caixa `index`, respeitando o limite da caixa e o do total. */
export function charLimit(texts, index) {
  const others = texts.reduce((sum, text, i) => (i === index ? sum : sum + text.length), 0);
  return Math.max(0, Math.min(MAX_TASK_CHARS, MAX_TOTAL_CHARS - others));
}
