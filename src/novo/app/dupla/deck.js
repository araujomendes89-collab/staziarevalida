// Treino em Dupla · baralho do Praticar. O servidor devolve a fila inteira a cada consulta (`app_dupla_deck`); esta função junta o
// que a tela já mostra com o que chegou, sem mexer no cartão que a pessoa está lendo ou arrastando (Review Focus 2 do plano).

/** Primeiro nome para "Próximo: …" e para "Você e … querem treinar". */
export function firstName(name) {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Junta o baralho da tela (`current`) com o que o servidor acabou de mandar (`incoming`):
 * - quem continua mantém a posição e ganha os dados novos (compatibilidade, razões, online);
 * - o cartão de cima fica até ser escolhido, mesmo que o servidor já não o traga (ficou offline, entrou em outra sala);
 * - quem saiu da fila some; os novos entram no fim, na ordem do servidor.
 * @param {Array<{ user_id: string }>} current
 * @param {Array<{ user_id: string }>} incoming
 * @returns {Array<{ user_id: string }>}
 */
export function mergeDeck(current, incoming) {
  const shown = Array.isArray(current) ? current : [];
  const arrived = new Map();
  for (const card of Array.isArray(incoming) ? incoming : []) {
    if (card && !arrived.has(card.user_id)) arrived.set(card.user_id, card);
  }
  const merged = [];
  const placed = new Set();
  shown.forEach((card, index) => {
    const fresh = arrived.get(card.user_id);
    if (fresh) merged.push(fresh);
    else if (index === 0) merged.push(card);
    else return;
    placed.add(card.user_id);
  });
  for (const [id, card] of arrived) if (!placed.has(id)) merged.push(card);
  return merged;
}
