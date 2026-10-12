/**
 * Erros que mudam o destino de um trabalho da fila (ch_jobs). Ficam num módulo próprio para a etapa de Questões StaziaMed
 * (server/contentHub/questoes/*) poder lançá-los sem importar o pipeline (que importa as etapas: seria um ciclo).
 */

/** Falta configuração: o trabalho fica pendente, sem gastar tentativa. */
export class Blocked extends Error {}
/** Falha que nova tentativa não resolve (arquivo protegido, corrompido, hash diferente). */
export class Fatal extends Error {}
