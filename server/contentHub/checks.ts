/**
 * Verificações por regra de software (não dependem de IA) aplicadas às saídas dos modelos:
 * trecho literal, números e unidades, negações, cópia de texto e flashcard de uma ideia.
 * A conferência numérica usa a mesma expressão de public.ch_numbers no banco.
 */

export const normalize = (text: string) => String(text ?? "").replace(/\s+/g, " ").trim();
const fold = (text: string) => normalize(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O trecho aparece literalmente (salvo espaços) no texto de origem? */
export function isVerbatim(quote: string, source: string): boolean {
  const q = normalize(quote);
  return q.length > 0 && normalize(source).includes(q);
}

const NUMBER_UNIT =
  /((?:[<>≤≥]=?\s*)?\d+(?:[.,]\d+)?\s*(?:mg\/kg\/dia|mg\/kg\/dose|mg\/kg\/h|mcg\/kg\/min|µg\/kg\/min|mg\/kg|mcg\/kg|µg\/kg|ui\/kg|mg\/dl|mg\/ml|mg\/h|g\/h|ml\/h|ui\/h|gotas\/min|g\/dl|mg|mcg|µg|g|ml\/kg|ml|ui|%|mmhg|bpm|kg|cm|mm|dias?|horas?|h|semanas?|meses|mês|anos?|min|vezes)(?![a-zà-ú]))/gi;

/** Números com unidade, normalizados como no banco (vírgula → ponto, sem espaços, minúsculas). */
export function numbers(text: string): string[] {
  const found = new Set<string>();
  for (const m of String(text ?? "").matchAll(NUMBER_UNIT)) found.add(m[1].replace(",", ".").replace(/\s+/g, "").toLowerCase());
  return [...found].sort();
}

const NEGATION = /(?<![a-zà-ú])(não|nunca|exceto|contraindicad[oa]s?|proibid[oa]s?|evitar|somente|apenas|sem)(?![a-zà-ú])/gi;
export function negations(text: string): string[] {
  return [...new Set([...String(text ?? "").matchAll(NEGATION)].map((m) => m[1].toLowerCase()))].sort();
}

/** Números e unidades do texto que não aparecem em nenhuma das bases permitidas. */
export function numbersOutside(text: string, allowed: string[]): string[] {
  const ok = new Set(allowed.flatMap(numbers));
  return numbers(text).filter((n) => !ok.has(n));
}

/** Negações das bases que sumiram do texto derivado (perda de condição/exceção). */
export function negationsLost(text: string, bases: string[]): string[] {
  const have = new Set(negations(text));
  return [...new Set(bases.flatMap(negations))].filter((n) => !have.has(n));
}

/** Proporção de sequências de 6 palavras do texto que aparecem na origem (detecção de cópia). */
export function copyRatio(text: string, source: string, n = 6): number {
  const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
  const grams = (w: string[]) => new Set(w.slice(0, Math.max(w.length - n + 1, 0)).map((_, i) => w.slice(i, i + n).join(" ")));
  const a = grams(words(text));
  if (a.size === 0) return 0;
  const b = grams(words(source));
  let hit = 0;
  for (const g of a) if (b.has(g)) hit++;
  return hit / a.size;
}

/** Um flashcard deve ter uma só ideia: pergunta curta e resposta curta, sem lista longa. */
export function flashcardProblems(card: { front: string; back: string }): string[] {
  const p: string[] = [];
  if (normalize(card.front).length > 220) p.push("pergunta longa demais");
  if (normalize(card.back).length > 320) p.push("resposta longa demais (mais de uma ideia?)");
  if ((card.back.match(/;/g) ?? []).length >= 3) p.push("resposta em lista (dividir em mais cartões)");
  return p;
}
