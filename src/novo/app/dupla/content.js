// Conteúdo da estação para a sala do Treinamento em Dupla: separa o texto como a Montagem o grava.
// Só formata o que veio do banco; não escreve, não corrige e não completa nada.

/** Rótulos do roteiro do ator, como a Montagem os grava ("Rótulo: valor" no começo da linha). */
export const ACTOR_LABELS = [
  "Dados pessoais",
  "Motivo da consulta",
  "História atual",
  "Antecedentes",
  "Hábitos",
  "Respostas condicionais",
  "Dúvidas do paciente",
  "Só se perguntado",
  "Orientação",
  "Impressos a liberar",
];

const text = (value) => (typeof value === "string" ? value : "");

/**
 * Roteiro do ator em pares [rótulo, valor]. O valor é o resto da linha do rótulo mais as linhas seguintes, até o próximo
 * rótulo. Texto antes do primeiro rótulo fica com o rótulo "". Sem nenhum rótulo: [["", texto]]. Vazio: [].
 * @param {string} value
 * @returns {Array<[string, string]>}
 */
export function splitActorScript(value) {
  const source = text(value).replace(/\r\n?/g, "\n");
  if (!source.trim()) return [];
  const labelAtStart = (line) => {
    for (const label of ACTOR_LABELS) {
      if (line.startsWith(label + ":")) return label;
    }
    return null;
  };
  const pairs = [];
  let current = { label: "", lines: [] };
  const flush = () => {
    const joined = current.lines.join("\n").trim();
    if (joined || current.label) pairs.push([current.label, joined]);
  };
  for (const line of source.split("\n")) {
    const label = labelAtStart(line.trimStart());
    if (label) {
      flush();
      current = { label, lines: [line.trimStart().slice(label.length + 1)] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return pairs;
}

/**
 * Parágrafos separados por linha em branco.
 * @param {string} value
 * @returns {string[]}
 */
export function splitBlocks(value) {
  return text(value)
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Tarefas do candidato: "1. …\n2. …" sem a numeração. Uma linha sem número (por exemplo, "Observação: …") fica como item próprio.
 * @param {string} value
 * @returns {string[]}
 */
export function splitTasks(value) {
  return text(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/^\d+\s*[.)]\s*/, ""))
    .filter(Boolean);
}

/** A linha "Observação: …" das tarefas não é uma tarefa numerada. */
export function isTaskNote(task) {
  return /^Observaç(?:ão|ões):/i.test(text(task));
}

const CRITERIA = [
  ["incorrect", "Inadequado"],
  ["partial", "Parcialmente adequado"],
  ["correct", "Adequado"],
];

/**
 * Itens do PEP no formato da folha (PepTable). `number` = ordem; critérios só com texto, na ordem Inadequado,
 * Parcialmente adequado, Adequado; `levels` com os pontos de cada nível (`partial: null` = o item não tem parcial).
 * @param {Array<object> | null | undefined} items `checklist_items` do RoomContent
 * @returns {Array<object>}
 */
export function toPepItems(items) {
  if (!Array.isArray(items)) return [];
  return [...items]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => {
      const grades = item.grades || {};
      const criteria = CRITERIA.map(([grade, label]) => ({ label, text: text(item.criteria?.[grade]).trim() })).filter((c) => c.text);
      const pep = {
        id: item.id,
        number: String(item.order),
        text: item.content,
        levels: {
          incorrect: typeof grades.incorrect === "number" ? grades.incorrect : 0,
          partial: typeof grades.partial === "number" ? grades.partial : null,
          correct: typeof grades.correct === "number" ? grades.correct : 0,
        },
      };
      if (text(item.tip).trim()) pep.tip = item.tip;
      if (criteria.length) pep.criteria = criteria;
      if (Array.isArray(item.subitems) && item.subitems.length) pep.subitems = item.subitems.map((s) => ({ id: s.id, text: s.text }));
      return pep;
    });
}

/**
 * Pontos máximos da estação: a soma do nível "Adequado" de cada item (10,00 nas estações publicadas).
 * @param {Array<object> | null | undefined} items `checklist_items` do RoomContent
 * @returns {number}
 */
export function maxScoreOf(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + (typeof item.grades?.correct === "number" ? item.grades.correct : 0), 0);
}
