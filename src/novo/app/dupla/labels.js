// Rótulos do Treinamento em Dupla, com os textos do protótipo. As áreas (códigos, nomes e cores) vêm de ds/areas.js.
export * from "../../ds/areas.js";

/** Papel que a pessoa quer fazer (perfil de estudo): rótulo completo, como no seletor e no cartão. */
export const ROLE_PREF_LABEL = { med: "Médico(a)", ator: "Ator / avaliador", any: "Qualquer papel" };

/** O mesmo papel dito em uma frase curta, para as razões da compatibilidade. */
export const ROLE_PREF_SHORT = { med: "quer ser médico(a)", ator: "quer ser ator/avaliador", any: "topa qualquer papel" };

/** Papel na sala, na rodada. */
export const ROOM_ROLE_LABEL = { candidate: "Candidato", evaluator: "Ator/Avaliador" };

/** Ritmo de estudo. */
export const PACE_LABEL = { livre: "Treino livre", cronometrado: "Cronometrado", simulacao: "Simulação de prova" };

/** Dias da semana (segunda a domingo) e turnos, nesta ordem: é a ordem em que são gravados. */
export const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const SHIFTS = ["Manhã", "Tarde", "Noite"];

/**
 * De onde vem a estação: "Revalida 2020 · INEP"; reaplicação: "Revalida 2022/1 (reaplicação) · INEP".
 * Sem instituição (estação autoral) ou sem estação não há origem: null. Instituição sem edição conhecida: só a instituição.
 * @param {{ edition?: string | null, reapplication?: boolean, institution?: string | null } | null} [station]
 * @returns {string | null}
 */
export function sourceLabel(station) {
  const { edition, reapplication, institution } = station ?? {};
  const from = typeof institution === "string" ? institution.trim() : "";
  if (!from) return null;
  const year = edition == null ? "" : String(edition).trim();
  if (!year) return from;
  return `Revalida ${year}${reapplication ? " (reaplicação)" : ""} · ${from}`;
}

/**
 * Origem no cartão e na linha do Banco de estações (pedido do dono de 17/10): a edição do Revalida
 * ("Revalida 2020 · INEP", "Revalida 2022/1 (reaplicação) · INEP") ou, sem instituição, "Estação inédita".
 * @param {{ edition?: string | null, reapplication?: boolean, institution?: string | null } | null} [station]
 * @returns {string}
 */
export function originLabel(station) {
  return sourceLabel(station) ?? "Estação inédita";
}
