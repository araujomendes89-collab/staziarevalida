/**
 * Trechos de fontes OFICIAIS para as Questões StaziaMed: a busca (palavras e, se ligada, significado) e a leitura por id.
 * Fonte oficial = nível A a D, versão final, em vigor e sem validade vencida (a regra de ch_worker_search_official_passages
 * mais o corte da validade). Nível E (livro, apostila, curso) e trecho vencido nunca saem daqui.
 */
import type { ContentDb } from "../infra";
import { embedderAllowed, queryEmbedding, type Embedder } from "../embeddings";
import { normalize } from "../checks";
import type { OfficialPassage } from "./types";

const today = () => new Date().toISOString().slice(0, 10);
const isCurrent = (validUntil: unknown) => !validUntil || String(validUntil).slice(0, 10) >= today();

/** Busca os trechos oficiais vigentes que tratam do texto (tema, subárea, competência, afirmação). Sem trecho: lista vazia. */
export async function searchOfficialPassages(
  deps: { db: ContentDb; embedder?: Embedder | null; log?: (m: string) => void },
  text: string,
  limit: number
): Promise<OfficialPassage[]> {
  const query = normalize(text).toLowerCase().split(/[^a-zà-ú0-9]+/i).filter((w) => w.length >= 4).slice(0, 12).join(" or ");
  if (!query) return [];
  const meaning = await queryEmbedding(await embedderAllowed(deps.db, deps.embedder), text, deps.log);
  // pede a mais: os vencidos são cortados aqui
  const rows = await deps.db.service<OfficialPassage[]>("ch_worker_search_official_passages", { p_query: query, p_limit: Math.min(limit * 2 + 2, 20), p_embedding: meaning });
  return rows.filter((p) => ["A", "B", "C", "D"].includes(p.authority_level) && isCurrent(p.valid_until)).slice(0, limit);
}

/** Trechos pelos ids (conferir citações já gravadas). `official` diz se ainda vale como fonte oficial vigente. */
export async function passagesByIds(db: ContentDb, ids: string[]): Promise<Map<string, OfficialPassage & { official: boolean }>> {
  const map = new Map<string, OfficialPassage & { official: boolean }>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const rows = await db.service<(OfficialPassage & { official: boolean })[]>("ch_worker_passages_by_ids", { p_ids: unique });
  for (const p of rows) map.set(p.passage_id, { ...p, official: p.official === true && isCurrent(p.valid_until) });
  return map;
}
