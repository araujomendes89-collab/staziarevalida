/**
 * FONTE COMPLEMENTAR (apostilas "Sangue nos Olhos" e material do mesmo tipo): vale como fonte para a IA e para a equipe,
 * mas NADA que a identifique chega ao aluno. Esta peça confere os TEXTOS voltados ao aluno que a IA escreve (roteiro de podcast,
 * resumo de aula, análise e explicações da questão, resposta do Tutor): eles podem ter sido escritos com base na apostila, mas
 * não podem citá-la. A lista de termos vem do banco (ch_worker_complementar_terms: título e órgão de cada fonte complementar da
 * biblioteca); "Sangue nos Olhos" e a palavra "apostila" valem mesmo sem consulta ao banco.
 */
import type { ContentDb } from "./infra";

/** Vale sempre, com ou sem a biblioteca (regra do dono). */
export const ALWAYS_TERMS = ["Sangue nos Olhos"] as const;

/** Frase para os prompts de geração de texto voltado ao aluno. */
export const NEVER_CITE_SUPPORT_MATERIAL =
  'MATERIAL COMPLEMENTAR NUNCA É CITADO: o texto que o aluno lê ou ouve não pode citar o nome, o título, o autor, o órgão, o link, o arquivo nem a página de nenhuma apostila ou material complementar (nem "Sangue nos Olhos"). Não escreva a palavra "apostila" nem "segundo o material" como referência. Escreva o conteúdo com as suas palavras, sem apontar de onde veio.';

const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ԛ": "q", "ԝ": "w", "к": "k", "м": "m", "н": "h", "т": "t",
  "α": "a", "ε": "e", "ο": "o", "ι": "i", "υ": "u", "κ": "k", "ρ": "p", "τ": "t", "ν": "v",
};
const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", shy: "", apos: "'" };

/**
 * Texto normalizado para comparar (MESMA regra de public.ch_text_key no banco): sem etiquetas HTML, sem entidades nem %xx,
 * NFKC, sem marcas combinantes e sem caracteres de largura zero, letras parecidas do cirílico e do grego trocadas pelas latinas,
 * sem pontuação, sem caixa, com espaço simples.
 */
export function normalizeKey(input: unknown): string {
  let t = String(input ?? "").replace(/<[^>]*>/g, "");
  t = t.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (_m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return " "; }
    }
    return ENTITIES[e.toLowerCase()] ?? " ";
  });
  t = t.replace(/%[0-9a-f]{2}/gi, " ");
  t = t.normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff\u00ad]/g, "").toLowerCase();
  t = [...t].map((c) => HOMOGLYPHS[c] ?? c).join("");
  return t.replace(/[^a-z0-9]+/g, " ").trim();
}
const fold = normalizeKey;
const noSpace = (t: string) => t.replace(/ /g, "");

const APOSTILA = /(?<![a-z])apostilas?(?![a-z])/;

/**
 * Termos de fontes complementares (e a palavra "apostila") que o texto cita. Vazio = limpo.
 * Compara com a normalização acima, por palavra inteira e, para termos longos, também sem espaços ("SangueNosOlhos").
 */
export function mentionsSupportMaterial(text: string, terms: readonly string[] = []): string[] {
  const t = ` ${fold(text)} `;
  if (t.trim() === "") return [];
  const ns = noSpace(t);
  const found = new Set<string>();
  for (const term of [...ALWAYS_TERMS, ...terms]) {
    const k = fold(term);
    if (k.length < 3) continue;
    if (t.includes(` ${k} `) || (noSpace(k).length >= 12 && ns.includes(noSpace(k)))) found.add(String(term).trim());
  }
  if (APOSTILA.test(t)) found.add("apostila");
  return [...found];
}

/** Expressões de referência a "o material" ("segundo o manual", "página 12 do resumo"): só para saída de IA quando o pedido incluiu fonte complementar. */
const REFERENCE_PHRASES =
  /(?<![a-z])(segundo|conforme|de acordo com|como (?:diz|traz|mostra) (?:a|o))\s+(?:o|a|os|as)?\s*(livro|manual|resumo|material|caderno|cursinho|capitulo|capitulos)(?![a-z])|(?<![a-z])pagina\s+\d+\s+d[oa]\s+(?:material|livro|manual|resumo|caderno)(?![a-z])/;
export function referencesSupportMaterial(text: string): string[] {
  const m = ` ${fold(text)} `.match(REFERENCE_PHRASES);
  return m ? [m[0].trim()] : [];
}

/** Tira de um texto livre as frases que citam o material complementar (ou o texto todo, se não sobrar nada). Nada é inventado: só se retira. */
export function redactSupportMaterial(text: string, terms: readonly string[] = []): string {
  const parts = String(text ?? "").split(/(?<=[.!?…])\s+/);
  const kept = parts.filter((p) => mentionsSupportMaterial(p, terms).length === 0);
  return kept.join(" ").trim();
}

/** O rótulo/título de uma fonte identifica fonte complementar? (para o que sobe ao aluno como referência) */
export function labelIsSupportMaterial(label: string, terms: readonly string[] = []): boolean {
  const t = fold(label);
  if (!t) return false;
  if (APOSTILA.test(` ${t} `)) return true;
  return [...ALWAYS_TERMS, ...terms].some((term) => {
    const k = fold(term);
    if (k.length < 3) return false;
    return ` ${t} `.includes(` ${k} `) || t === k || (noSpace(k).length >= 12 && noSpace(t).includes(noSpace(k)));
  });
}

let cache: { at: number; terms: string[] } | null = null;
/** Termos da biblioteca (título e órgão das fontes complementares). Guarda por 60 s; se o banco falhar, usa só os termos fixos. */
export async function loadComplementarTerms(db: Pick<ContentDb, "service"> | null | undefined, now = Date.now()): Promise<string[]> {
  if (!db) return [...ALWAYS_TERMS];
  if (cache && now - cache.at < 60_000) return cache.terms;
  try {
    const rows = await db.service<string[] | null>("ch_worker_complementar_terms", {});
    const terms = [...new Set([...ALWAYS_TERMS, ...(Array.isArray(rows) ? rows.map(String) : [])])];
    cache = { at: now, terms };
    return terms;
  } catch {
    return cache?.terms ?? [...ALWAYS_TERMS];
  }
}
export function resetComplementarTermsCache() {
  cache = null;
}
