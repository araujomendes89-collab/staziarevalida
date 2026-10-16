/**
 * Semelhança entre textos (originalidade da Questão StaziaMed). Mesma ideia do `maximum_similarity` do gerador antigo:
 * a maior nota entre a razão de caracteres e a razão de conjuntos de palavras (regra do rapidfuzz), de 0 a 100.
 * 70 ou mais recusa (crítico), 50 ou mais alerta (importante): quem decide é o `validate.ts`.
 */
import type { CorpusItem, SimilarityHit } from "./types";

/** Minúsculas, sem acento, pontuação vira espaço, espaços colapsados. */
export function normalizeForSimilarity(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tamanho da maior subsequência comum, com duas linhas de memória. */
function lcs(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = ca === b.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 100 · 2·LCS / (|a| + |b|) sobre caracteres; texto vazio com qualquer outro = 0. */
export function charRatio(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  return (100 * 2 * lcs(a, b)) / (a.length + b.length);
}

/** Regra do rapidfuzz (token_set_ratio) sobre o texto já normalizado. */
export function tokenSetRatio(a: string, b: string): number {
  const A = new Set(normalizeForSimilarity(a).split(" ").filter(Boolean));
  const B = new Set(normalizeForSimilarity(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  const sorted = (s: Iterable<string>) => [...s].sort().join(" ");
  const inter = sorted([...A].filter((w) => B.has(w)));
  const da = sorted([...A].filter((w) => !B.has(w)));
  const db = sorted([...B].filter((w) => !A.has(w)));
  if (inter && (!da || !db)) return 100;
  const sa = [inter, da].filter(Boolean).join(" ");
  const sb = [inter, db].filter(Boolean).join(" ");
  return Math.max(charRatio(inter, sa), charRatio(inter, sb), charRatio(sa, sb));
}

/**
 * A maior semelhança do texto com o corpus. Pré-filtro: só as `prefilter` (30) com mais palavras em comum (empate: ordem do
 * corpus) entram na conta cara. Nota com 1 casa decimal; corpus vazio = nota 0 sem id.
 */
export function maxSimilarity(text: string, corpus: CorpusItem[], opts: { excludeId?: string; prefilter?: number } = {}): SimilarityHit {
  const norm = normalizeForSimilarity(text);
  const words = new Set(norm.split(" ").filter(Boolean));
  const candidates = corpus
    .filter((c) => c.id !== opts.excludeId)
    .map((c, order) => {
      const n = normalizeForSimilarity(c.text);
      let common = 0;
      for (const w of new Set(n.split(" "))) if (w && words.has(w)) common++;
      return { id: c.id, n, common, order };
    })
    .sort((x, y) => y.common - x.common || x.order - y.order)
    .slice(0, opts.prefilter ?? 30);
  let best: SimilarityHit = { score: 0, id: null };
  for (const c of candidates) {
    const score = Math.max(charRatio(norm, c.n), tokenSetRatio(norm, c.n));
    if (score > best.score) best = { score, id: c.id };
  }
  return { score: Math.round(best.score * 10) / 10, id: best.id };
}
