/**
 * Treino em Dupla: texto das TAREFAS quando o relato do caso vai para a folha do candidato (decisão do dono de 17/10, opção 2).
 *
 * Nas estações em que o impresso 1 é o relato do caso, o relato sai da lista de impressos e fica na folha do candidato
 * (regra da migração 013390); os demais impressos continuam 1, 2, 3. As tarefas oficiais, porém, ainda dizem "ler o impresso 1
 * (relato do caso…)" e "conforme orientação do impresso 1", que na tela apontariam para o primeiro exame. Então, SÓ na hora de
 * mostrar (folha em imagem, folha em texto e painel do avaliador):
 *   "ler o impresso 1 (relato do caso …)"      → "ler o relato do caso clínico (na sua folha, acima)"
 *   "conforme orientação do impresso 1"        → "conforme orientação do relato do caso"
 * O texto oficial guardado na estação NÃO muda. Estação sem o relato na folha: as tarefas saem exatamente como estão.
 */

/** Mesmo critério de nome da 013390 (dupla_eh_relato, parte do relato): "Relato do/de/da caso …". */
export const NOME_RELATO = /relato\s+d[oea]\s+caso/i;

/** "impresso 1", "impresso nº 1", "impresso n. 01" (nunca "impresso 10" ou "impresso 12"). */
const IMPRESSO_1 = String.raw`impresso\s+(?:n\s*[º°o.]?\s*)?0?1(?!\d)`;
const LER_RELATO = new RegExp(String.raw`\b(ler|leia)\s+o\s+${IMPRESSO_1}\s*\(\s*relato[^)]*\)`, "gi");
const ORIENTACAO = new RegExp(String.raw`(orienta[çc][ãa]o\s+(?:do|contida\s+no)\s+)${IMPRESSO_1}`, "gi");

export interface ImpressoComNome {
  name?: unknown;
  nome?: unknown;
  initially_visible?: unknown;
}

/**
 * O relato do caso saiu da lista de impressos e está na folha?
 * - Sala (app_dupla_room_content): algum impresso inicial (initially_visible) com nome de relato.
 * - Gerador (dupla_folha_fonte): algum dos impressos que vão para a folha com nome de relato (passe `todosNaFolha`).
 */
export function relatoNaFolha(impressos: unknown, todosNaFolha = false): boolean {
  if (!Array.isArray(impressos)) return false;
  return impressos.some((p: ImpressoComNome) => {
    if (!p || typeof p !== "object") return false;
    if (!todosNaFolha && p.initially_visible !== true) return false;
    const nome = typeof p.name === "string" ? p.name : typeof p.nome === "string" ? p.nome : "";
    return NOME_RELATO.test(nome);
  });
}

/** As tarefas como o candidato deve lê-las. Sem o relato na folha, devolve o texto igual. */
export function tarefasAjustadas(tarefas: unknown, comRelatoNaFolha: boolean): string {
  const t = typeof tarefas === "string" ? tarefas : "";
  if (!comRelatoNaFolha) return t;
  return t
    .replace(LER_RELATO, (_m, verbo: string) => `${verbo} o relato do caso clínico (na sua folha, acima)`)
    .replace(ORIENTACAO, (_m, antes: string) => `${antes}relato do caso`);
}
