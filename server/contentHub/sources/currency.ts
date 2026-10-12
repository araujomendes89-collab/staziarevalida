/**
 * FONTES OFICIAIS, ATUALIDADE: "sempre buscar as fontes mais atuais". Aqui o servidor decide, para cada candidato que a busca
 * achou, se ele é MAIS NOVO, IGUAL ou MAIS ANTIGO que a fonte vigente da biblioteca (ou que outro achado do mesmo documento).
 *
 * Regra de ouro: nunca marcar "mais atual" sem prova no documento ou na página, e nunca inventar data. Uma data só conta como
 * COMPROVADA quando:
 *   - a data que a IA disse aparece no texto do documento (dia/mês/ano por extenso ou numérico; só o ano: nas 3 primeiras
 *     páginas), ou
 *   - a PÁGINA WEB declara a data (meta published_time, dc.date...).
 * A data interna de um PDF (metadados CreationDate) NÃO prova a publicação (muitos sites geram o PDF de novo): fica guardada como
 * aviso, mas o candidato fica "data não comprovada".
 *
 * Funções puras (sem banco): parseDate, compareDates, dateInText, proveDates e classifyCurrency. reconcileCurrency é a única
 * que fala com o banco (funções ch_worker_source_currency_*) e roda no fim de cada busca; pode rodar de novo sem efeito colateral.
 */
import type { ExtractedPage } from "../../podcasts/extract";
import type { ContentDb } from "../infra";

export type CurrencyState = "versao_mais_nova" | "mesma_versao" | "versao_mais_antiga" | "outra_mais_nova" | "data_nao_comprovada" | "sem_comparacao";

export const CURRENCY_STATES: CurrencyState[] = ["versao_mais_nova", "mesma_versao", "versao_mais_antiga", "outra_mais_nova", "data_nao_comprovada", "sem_comparacao"];

/** Data com a precisão que ela tem: o dia inteiro ou só o ano. */
export interface ParsedDate {
  year: number;
  month?: number;
  day?: number;
  /** AAAA-MM-DD ou AAAA */
  iso: string;
}

export function parseDate(raw: unknown): ParsedDate | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  const y = /^(\d{4})$/.exec(v);
  if (y) {
    const year = +y[1];
    return year >= 1900 && year <= 2100 ? { year, iso: y[1] } : null;
  }
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!f) return null;
  const year = +f[1];
  const month = +f[2];
  const day = +f[3];
  if (year < 1900 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day, iso: v };
}

/** "10/05/2024" ou "ano de 2024" (nunca inventa o dia). */
export function showDate(d: ParsedDate | string | null | undefined): string {
  const p = typeof d === "string" ? parseDate(d) : d;
  if (!p) return "sem data";
  return p.day ? `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}` : `ano de ${p.year}`;
}

export type Comparison = "newer" | "same" | "older" | "unknown";

/** a em relação a b. Dia contra dia; ano contra ano; dia contra ano só quando os anos diferem (no mesmo ano não dá para dizer). */
export function compareDates(a: ParsedDate, b: ParsedDate): Comparison {
  if (a.year !== b.year) return a.year > b.year ? "newer" : "older";
  if (!a.day || !b.day) return a.day || b.day ? "unknown" : "same";
  if (a.iso === b.iso) return "same";
  return a.iso > b.iso ? "newer" : "older";
}

// ---------------------------------------------------------------- a data aparece no documento?
const MONTHS: [string, string[]][] = [
  ["01", ["janeiro", "jan", "january"]],
  ["02", ["fevereiro", "fev", "february", "feb"]],
  ["03", ["marco", "mar", "march"]],
  ["04", ["abril", "abr", "april", "apr"]],
  ["05", ["maio", "mai", "may"]],
  ["06", ["junho", "jun", "june"]],
  ["07", ["julho", "jul", "july"]],
  ["08", ["agosto", "ago", "august", "aug"]],
  ["09", ["setembro", "set", "september", "sep", "sept"]],
  ["10", ["outubro", "out", "october", "oct"]],
  ["11", ["novembro", "nov", "november"]],
  ["12", ["dezembro", "dez", "december", "dec"]],
];

/** Sem acentos, minúsculas, espaços juntos (inclusive o não separável). */
function plain(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ");
}

const YEAR_PAGES = 3;

/**
 * A data aparece no texto? Dia inteiro: ISO, dd/mm/aaaa (também com ponto ou hífen) ou "10 de maio de 2024"/"May 10, 2024", no
 * documento todo. Só o ano: o número do ano numa das 3 primeiras páginas (capa e expediente), como número isolado.
 */
export function dateInText(date: ParsedDate, pages: ExtractedPage[]): boolean {
  if (!date.day) {
    const head = plain(pages.slice(0, YEAR_PAGES).map((p) => p.text).join("\n"));
    return new RegExp(`(?<![\\d])${date.year}(?![\\d])`).test(head);
  }
  const hay = plain(pages.map((p) => p.text).join("\n"));
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  const d = `0?${date.day}`;
  const m = `0?${date.month}`;
  const names = (MONTHS.find(([n]) => n === mm)?.[1] ?? []).join("|");
  const patterns = [
    `(?<![\\d])${date.year}[-/.]${mm}[-/.]${dd}(?![\\d])`,
    `(?<![\\d])${d}\\s*[/.\\-]\\s*${m}\\s*[/.\\-]\\s*${date.year}(?![\\d])`,
    `(?<![\\d])${d}\\s*[ºo°]?\\s*(?:de\\s+)?(?:${names})\\.?\\s*(?:de\\s+|,\\s*)?${date.year}(?![\\d])`,
    `(?<![a-z])(?:${names})\\.?\\s+${d}(?:st|nd|rd|th)?,?\\s+${date.year}(?![\\d])`,
  ];
  return patterns.some((p) => new RegExp(p).test(hay));
}

export interface DateProof {
  /** Data comprovada (AAAA-MM-DD ou AAAA), ou nula. */
  date: string | null;
  basis: "texto" | "pagina" | null;
  /** Vigência dita pela IA, só se for uma data válida. */
  validUntil: string | null;
  validUntilProven: boolean;
  /** Avisos em português, para a tela. */
  notes: string[];
}

export interface ProofInput {
  /** Data de publicação que a IA disse (já validada, ou nula). */
  aiPublished: string | null;
  /** Vigência que a IA disse (texto livre; só vale se for uma data válida). */
  aiValidUntil: string | null;
  /** Data que o próprio arquivo diz: meta da página (html) ou metadados internos (pdf). */
  fileDate: string | null;
  fileKind: "pdf" | "html";
  pages: ExtractedPage[];
}

export function proveDates(input: ProofInput): DateProof {
  const notes: string[] = [];
  const ai = parseDate(input.aiPublished);
  const file = parseDate(input.fileDate);
  let date: string | null = null;
  let basis: DateProof["basis"] = null;
  if (ai && dateInText(ai, input.pages)) {
    date = ai.iso;
    basis = "texto";
  } else {
    if (ai) notes.push(`A data dita pela IA (${showDate(ai)}) não aparece no documento.`);
    if (file && input.fileKind === "html") {
      date = file.iso;
      basis = "pagina";
    } else if (file) {
      notes.push(`O arquivo traz só a data interna (${showDate(file)}), que não prova quando o documento foi publicado.`);
    } else if (!ai) {
      notes.push("Nem a IA nem o documento trazem a data de publicação.");
    }
  }
  const until = parseDate(input.aiValidUntil);
  const validUntilProven = Boolean(until && dateInText(until, input.pages));
  if (until && !validUntilProven) notes.push(`A vigência dita pela IA (${showDate(until)}) não aparece no documento.`);
  return { date, basis, validUntil: until?.iso ?? null, validUntilProven, notes };
}

// ---------------------------------------------------------------- estado de atualidade
export interface LibraryRef {
  id: string;
  title: string;
  version: string | null;
  published_on: string | null;
  valid_until?: string | null;
}

export interface CurrencyInput {
  /** Data comprovada do candidato (a que está guardada como currency_date). */
  date: string | null;
  library: LibraryRef | null;
  /** Outros candidatos aguardando do mesmo documento, com a data comprovada deles. */
  siblings: { id: string; date: string | null }[];
}

export interface CurrencyResult {
  state: CurrencyState;
  note: string;
  library: LibraryRef | null;
  /** O irmão mais novo, quando o estado é "outra_mais_nova". */
  newer: { id: string; date: string } | null;
}

export function classifyCurrency(input: CurrencyInput): CurrencyResult {
  const mine = parseDate(input.date);
  const lib = input.library;
  const out = (state: CurrencyState, note: string, newer: CurrencyResult["newer"] = null): CurrencyResult => ({ state, note, library: lib, newer });
  if (!mine) return out("data_nao_comprovada", "A data de publicação não está comprovada no documento: não dá para dizer se é a versão mais atual.");

  // o irmão comprovadamente mais novo (se houver vários, o mais novo)
  let newer: { id: string; date: string } | null = null;
  for (const s of input.siblings) {
    const d = parseDate(s.date);
    if (!d || compareDates(d, mine) !== "newer") continue;
    const best = newer ? parseDate(newer.date) : null;
    if (!best || compareDates(d, best) === "newer") newer = { id: s.id, date: d.iso };
  }

  if (lib) {
    const libDate = parseDate(lib.published_on);
    const libName = `"${lib.title}"${lib.version ? ` (versão ${lib.version})` : ""}`;
    if (!libDate) return out("data_nao_comprovada", `A fonte vigente ${libName} não tem data cadastrada: não dá para comparar.`);
    const c = compareDates(mine, libDate);
    if (c === "unknown") return out("data_nao_comprovada", `A data só tem o ano (esta: ${showDate(mine)}; biblioteca: ${showDate(libDate)}): não dá para dizer qual é mais nova.`);
    if (c === "same") return out("mesma_versao", `Mesma data da fonte vigente ${libName}: ${showDate(libDate)}.`);
    if (c === "older") return out("versao_mais_antiga", `Mais antiga que a fonte vigente ${libName}: esta é de ${showDate(mine)}; a biblioteca tem ${showDate(libDate)}.`);
    if (newer) return out("outra_mais_nova", `A busca achou outra versão mais nova do mesmo documento (${showDate(newer.date)}).`, newer);
    return out("versao_mais_nova", `Mais nova que a fonte vigente ${libName}: esta é de ${showDate(mine)}; a biblioteca tem ${showDate(libDate)}.`);
  }
  if (newer) return out("outra_mais_nova", `A busca achou outra versão mais nova do mesmo documento (${showDate(newer.date)}).`, newer);
  return out("sem_comparacao", `Documento sem versão anterior na biblioteca; data comprovada: ${showDate(mine)}.`);
}

// ---------------------------------------------------------------- fim da busca: grava o estado de cada candidato
interface ContextItem {
  id: string;
  title: string | null;
  currency: CurrencyState | null;
  date: string | null;
  info: Record<string, unknown> | null;
  library: LibraryRef | null;
  siblings: { id: string; date: string | null }[];
}

/**
 * Classifica os candidatos aguardando desta busca e os outros candidatos aguardando do mesmo documento (um achado mais novo muda
 * o estado do mais antigo que veio de outra busca). Idempotente: o resultado só depende das datas guardadas e da biblioteca.
 */
export async function reconcileCurrency(db: ContentDb, searchId: string): Promise<number> {
  const items = await db.service<ContextItem[]>("ch_worker_source_currency_context", { p_search_id: searchId });
  if (!Array.isArray(items) || items.length === 0) return 0;
  const updates = items.map((item) => {
    const r = classifyCurrency({ date: item.date, library: item.library, siblings: item.siblings ?? [] });
    return {
      id: item.id,
      currency: r.state,
      info: { note: r.note, library: r.library, newer: r.newer },
    };
  });
  return db.service<number>("ch_worker_source_currency_set", { p_updates: updates });
}
