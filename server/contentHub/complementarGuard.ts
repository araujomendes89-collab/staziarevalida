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

const fold = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const APOSTILA = /(?<![a-z])apostilas?(?![a-z])/;

/**
 * Termos de fontes complementares (e a palavra "apostila") que o texto cita. Vazio = limpo.
 * Compara sem acento, sem pontuação e sem diferença de maiúsculas.
 */
export function mentionsSupportMaterial(text: string, terms: readonly string[] = []): string[] {
  const t = ` ${fold(text)} `;
  if (t.trim() === "") return [];
  const found = new Set<string>();
  for (const term of [...ALWAYS_TERMS, ...terms]) {
    const k = fold(term);
    if (k.length >= 5 && t.includes(` ${k} `)) found.add(String(term).trim());
  }
  if (APOSTILA.test(t)) found.add("apostila");
  return [...found];
}

/** O rótulo/título de uma fonte identifica fonte complementar? (para o que sobe ao aluno como referência) */
export function labelIsSupportMaterial(label: string, terms: readonly string[] = []): boolean {
  const t = fold(label);
  if (!t) return false;
  return [...ALWAYS_TERMS, ...terms].some((term) => {
    const k = fold(term);
    return k.length >= 5 && (t.includes(k) || (t.length >= 8 && k.includes(t)));
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
