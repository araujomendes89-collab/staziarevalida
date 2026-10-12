/**
 * FONTE COMPLEMENTAR (apostilas "Sangue nos Olhos" e material do mesmo tipo): vale como fonte para a IA e para a equipe,
 * mas NADA que a identifique chega ao aluno. Esta peça confere os TEXTOS voltados ao aluno que a IA escreve (roteiro de podcast,
 * resumo de aula, análise e explicações da questão, resposta do Tutor): eles podem ter sido escritos com base na apostila, mas
 * não podem citá-la. A lista de termos vem do banco (ch_worker_complementar_terms: título completo, órgão/editora distintivo,
 * siglas cadastradas, nome do arquivo e site do link de cada fonte complementar CADASTRADA na biblioteca).
 *
 * REGRA DO DONO (2026-10-11): a expressão "Sangue nos Olhos" e a palavra "apostila" SOLTAS, num texto médico legítimo (por exemplo
 * a queixa "sangue nos olhos", ou "a apostila do curso"), NÃO são barradas nem escondidas. Só vale o que está cadastrado:
 * o título completo e exato da fonte complementar, órgão/editora distintivo, siglas em ch_sources.aliases, link, arquivo e SHA-256.
 * Os prompts continuam PROIBINDO a IA de citar apostila: isso é instrução à IA, não filtro de texto médico.
 */
import type { ContentDb } from "./infra";

/**
 * Termos que valem sempre, com ou sem a biblioteca. VAZIO desde 2026-10-11: "Sangue nos Olhos" e "apostila" soltos não bloqueiam
 * texto médico; só os termos cadastrados na biblioteca (título completo, órgão, siglas) bloqueiam.
 */
export const ALWAYS_TERMS: readonly string[] = [];

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

/**
 * Termos de fontes complementares CADASTRADAS que o texto cita (a palavra "apostila" solta não conta). Vazio = limpo.
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
  return [...ALWAYS_TERMS, ...terms].some((term) => {
    const k = fold(term);
    if (k.length < 3) return false;
    return ` ${t} `.includes(` ${k} `) || t === k || (noSpace(k).length >= 12 && noSpace(t).includes(noSpace(k)));
  });
}

/** Pedido sem a lista de termos: quem chama NÃO pode seguir como se a biblioteca estivesse vazia. */
export const TERMS_UNAVAILABLE_MESSAGE = "Não foi possível conferir agora a lista de fontes que o aluno não pode ver. Tente de novo em instantes.";
export class ComplementarTermsUnavailable extends Error {
  readonly status = 503;
  constructor(readonly cause?: unknown) {
    super(TERMS_UNAVAILABLE_MESSAGE);
    this.name = "ComplementarTermsUnavailable";
  }
}

const FRESH_MS = 60_000;
/** Espera curta entre a primeira tentativa e a nova tentativa (a falha costuma ser passageira). */
const RETRY_MS = 150;
let cache: { at: number; terms: string[] } | null = null;
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 160);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Termos da biblioteca (título, órgão, siglas das fontes complementares). Guarda por 60 s, SÓ resposta boa: falha do banco ou resposta
 * que não é uma lista nunca vai para o cache. Passados os 60 s, a consulta é refeita; se falhar, tenta de novo UMA vez (150 ms depois);
 * se continuar falhando LANÇA ComplementarTermsUnavailable (503): a lista vencida NUNCA é usada para liberar texto (a equipe pode ter cadastrado
 * uma fonte nesse tempo, e uma lista vazia em cache também não vale). Quem chama age do lado seguro (não publica, não grava) e manda tentar de novo.
 * Sem banco (db nulo, só em testes e desenvolvimento sem biblioteca) não há biblioteca: devolve ALWAYS_TERMS.
 */
export async function loadComplementarTerms(db: Pick<ContentDb, "service"> | null | undefined, now = Date.now(), log?: (m: string) => void): Promise<string[]> {
  if (!db) return [...ALWAYS_TERMS];
  if (cache && now - cache.at < FRESH_MS) return cache.terms;
  const warn = log ?? ((m: string) => console.warn(m));
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const rows = await db.service<unknown>("ch_worker_complementar_terms", {});
      if (!Array.isArray(rows)) throw new Error("a resposta do banco não é uma lista");
      const terms = [...new Set([...ALWAYS_TERMS, ...rows.map(String)])];
      cache = { at: now, terms };
      return terms;
    } catch (error) {
      last = error;
      if (attempt === 1) await sleep(RETRY_MS);
    }
  }
  warn(`[fontes complementares] lista de termos indisponível depois de 2 tentativas (${reason(last)}): a conferência foi suspensa por segurança, a lista vencida não é usada e o pedido foi recusado.`);
  throw new ComplementarTermsUnavailable(last);
}
export function resetComplementarTermsCache() {
  cache = null;
}
