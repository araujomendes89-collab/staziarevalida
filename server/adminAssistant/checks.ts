/**
 * Assistente de IA nas abas da Administração: conferências da resposta da IA sem confiar nela (§6.5 da especificação).
 * Marcas citadas que existem, tamanho e formato de cada campo, números e anos fora dos trechos citados e recursos novos.
 * Funções puras: o motor (engine.ts) decide o que fazer com cada aviso.
 */
import { ungroundedNumbers } from "../podcasts/script";
import { sameValue, type AdapterField, type FieldValue, type Flashcard, type SourceRef, type TimelineEntry } from "../../src/shared/adminAssistant/types";

/** Uma marca do pedido: `[I…]` campo do item, `[T…]` trecho do material, `[F…]` trecho oficial. */
export interface MarkRef {
  mark: string;
  kind: "item" | "material" | "oficial";
  label: string;
  text: string;
}

/** "[T1]", " t1 " e "T1" são a mesma marca. */
const normalizeMark = (s: string) => s.trim().replace(/^\[\s*/, "").replace(/\s*\]$/, "").toUpperCase();

/** Marcas citadas pela IA: as que existem (na ordem citada) e as inexistentes, sem repetição. */
export function resolveMarks(raw: unknown, table: Map<string, MarkRef>): { refs: MarkRef[]; unknown: string[] } {
  const refs: MarkRef[] = [];
  const unknown: string[] = [];
  if (!Array.isArray(raw)) return { refs, unknown };
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const mark = normalizeMark(entry);
    if (!mark || seen.has(mark)) continue;
    seen.add(mark);
    const ref = table.get(mark);
    if (ref) refs.push(ref);
    else unknown.push(mark);
  }
  return { refs, unknown };
}

/** Fontes para a tela, sem rótulo repetido (dois trechos da mesma página aparecem uma vez). */
export function toSourceRefs(refs: MarkRef[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const r of refs) {
    if (seen.has(r.label)) continue;
    seen.add(r.label);
    out.push({ label: r.label, kind: r.kind });
  }
  return out;
}

export const numberWarning = (label: string, n: string) => `${label}: "${n}" não está nas fontes citadas.`;
export const yearWarning = (label: string, y: number) => `${label}: o ano ${y} não está no trecho citado.`;
export const unknownSourceWarning = (label: string, marks: string[]) => `${label}: fonte inexistente descartada (${marks.join(", ")}).`;

export const formatWarning = (label: string) => `${label}: fora do formato; sugestão descartada.`;
const tooLongWarning = (label: string, max: number) => `${label}: passa de ${max} caracteres; sugestão descartada.`;
const itemTooLongWarning = (label: string, itemMax: number) => `${label}: item com mais de ${itemMax} caracteres descartado.`;
const tooManyWarning = (label: string, max: number, left: number) => `${label}: no máximo ${max} itens; ${left} ficaram de fora.`;
const badYearWarning = (label: string, year: unknown) => `${label}: ano ${year} fora de 2000–2100; item descartado.`;
const badCardWarning = (label: string) =>
  `${label}: flashcard fora do formato (frente de 3 a 2.000 e verso de 1 a 2.000 caracteres); descartado.`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Entrada com a forma do tipo do campo (o conteúdo é conferido depois, entrada a entrada). */
function hasShape(field: AdapterField, entry: unknown): boolean {
  switch (field.kind) {
    case "lines":
      return typeof entry === "string";
    case "timeline":
      return isObject(entry) && typeof entry.year === "number" && typeof entry.text === "string";
    case "flashcards":
      return isObject(entry) && typeof entry.front === "string" && typeof entry.back === "string";
    default:
      return false;
  }
}

/** Por que a entrada sai: texto do aviso, "" para sair calada (vazia) ou null quando fica. */
function entryProblem(field: AdapterField, entry: unknown): string | null {
  const longer = (text: string) => field.itemMax !== undefined && text.length > field.itemMax;
  switch (field.kind) {
    case "lines": {
      const line = entry as string;
      if (!line.trim()) return "";
      return longer(line) ? itemTooLongWarning(field.label, field.itemMax!) : null;
    }
    case "timeline": {
      const { year, text } = entry as TimelineEntry;
      if (!text.trim()) return "";
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return badYearWarning(field.label, year);
      return longer(text) ? itemTooLongWarning(field.label, field.itemMax!) : null;
    }
    case "flashcards": {
      // regra do banco (app_admin_save_guideline_update): frente de 3 a 2.000 e verso de 1 a 2.000, sem os espaços das pontas
      const front = (entry as Flashcard).front.trim().length;
      const back = (entry as Flashcard).back.trim().length;
      return front < 3 || front > 2000 || back < 1 || back > 2000 ? badCardWarning(field.label) : null;
    }
    default:
      return null;
  }
}

/**
 * A parte da entrada que o assistente propõe, aparada: a linha; ano e texto; frente e verso. Chave a mais de um item atual
 * (ex.: o `type` do flashcard, decisão A4) não conta na comparação.
 */
function entryKey(field: AdapterField, entry: unknown): unknown {
  const text = (v: unknown) => String(v ?? "").trim();
  const e = isObject(entry) ? entry : {};
  switch (field.kind) {
    case "lines":
      return text(entry);
    case "timeline":
      return { year: Number(e.year), text: text(e.text) };
    case "flashcards":
      return { front: text(e.front), back: text(e.back) };
    default:
      return entry;
  }
}

/**
 * Tamanho e formato de um valor para o campo. Texto acima de `max` é descartado inteiro. Lista: cada entrada fora do
 * formato sai com aviso (vazia sai calada) e o total fica em `max` — com `append`, contando as entradas atuais, porque a
 * lista só ganha itens novos e nada apaga os que existem (decisão A3). Com `append`, a entrada igual a uma atual ou a uma
 * anterior do próprio valor sai calada antes da conta (já está no campo; a IA que repete a lista não tira a vaga dos
 * itens novos). Lista que fica vazia vira null.
 */
export function checkValue(field: AdapterField, value: FieldValue, current: FieldValue | null, append: boolean): { value: FieldValue | null; warnings: string[] } {
  if (field.kind === "text") {
    if (typeof value !== "string") return { value: null, warnings: [formatWarning(field.label)] };
    if (value.length > field.max) return { value: null, warnings: [tooLongWarning(field.label, field.max)] };
    return { value: value.trim() ? value : null, warnings: [] };
  }
  if (!Array.isArray(value) || !(value as unknown[]).every((entry) => hasShape(field, entry))) {
    return { value: null, warnings: [formatWarning(field.label)] };
  }
  const warnings: string[] = [];
  const kept: unknown[] = [];
  const seen = append && Array.isArray(current) ? (current as unknown[]).map((entry) => entryKey(field, entry)) : [];
  for (const entry of value as unknown[]) {
    if (append) {
      const key = entryKey(field, entry);
      if (seen.some((known) => sameValue(known, key))) continue;
      seen.push(key);
    }
    const problem = entryProblem(field, entry);
    if (problem === null) kept.push(entry);
    else if (problem) warnings.push(problem);
  }
  const existing = append && Array.isArray(current) ? current.length : 0;
  const room = Math.max(0, field.max - existing);
  if (kept.length > room) {
    warnings.push(tooManyWarning(field.label, field.max, kept.length - room));
    kept.length = room;
  }
  return { value: kept.length ? (kept as FieldValue) : null, warnings };
}

/** O número tem que aparecer inteiro no texto citado: "2" não vale por estar dentro de "20" ou de "1,25" (como em ungroundedNumbers). */
function wholeNumber(n: string): RegExp {
  return new RegExp(`(?<![\\d.,])${n.replace(/[.,]/g, "[.,]")}(?![\\d]|[.,]\\d)`);
}

/** Qualquer número, com separador de milhar e decimais ("1.299,90" é um número só). */
const ANY_NUMBER = /\d+(?:[.,]\d+)*/g;

/**
 * Números do texto que não aparecem nos textos citados, sem repetição. `unidade` (abas médicas): só número com unidade (dose,
 * corte, prazo), pela regra de `ungroundedNumbers`. `qualquer` (Planos): todo número (preço, minutos, quantidade).
 */
export function unsupportedNumbers(text: string, cited: string[], rule: "unidade" | "qualquer"): string[] {
  const found =
    rule === "unidade"
      ? ungroundedNumbers(text, cited)
      : [...text.matchAll(ANY_NUMBER)].map((m) => m[0]).filter((n) => !cited.some((t) => wholeNumber(n).test(t)));
  return [...new Set(found)];
}

/** Anos da linha do tempo que não aparecem inteiros em nenhum trecho citado, sem repetição. */
export function yearsNotCited(entries: TimelineEntry[], cited: string[]): number[] {
  const years = [...new Set(entries.map((e) => e.year))];
  return years.filter((y) => !cited.some((t) => new RegExp(`(?<!\\d)${y}(?!\\d)`).test(t)));
}

/** Minúsculas, sem acento e com espaços simples. */
const normalizeText = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Linhas que não estão contidas em nenhum texto conhecido (notas e recursos atuais): recurso possivelmente novo. */
export function newLines(lines: string[], known: string[]): string[] {
  const knownTexts = known.map(normalizeText);
  return lines.filter((line) => {
    const wanted = normalizeText(line);
    return !knownTexts.some((k) => k.includes(wanted));
  });
}
