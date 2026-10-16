// Formatação das Questões (editor profissional, migração 013120). O texto oficial continua nas colunas de sempre; a formatação fica
// em questions.formatacao / draft_questions.formatacao (chave do campo → envelope sdoc) e só vale quando a projeção bate com o texto.
// Chaves oficiais: statement, opcao.X.texto, opcao.X.explicacao, expected_conduct, inep_intent.
// Chaves das inéditas: stem, alt.X, altexp.X, explanation, clinical_decision, update_application.
import { ricoValido, type Bloco, type DocRico, type Envelope } from "../docRico";
import { campoDoDoc, formatacaoValida, type Formatacao } from "../docRico/campos";

export type Campo = { texto: string; rico: Envelope | null };

const vazio = (b: Bloco) => b.type === "paragraph" && !(b.content ?? []).length;

// apara o começo (lado "ini") ou o fim (lado "fim") do primeiro/último nó de texto do bloco; nó que fica vazio sai
function aparaBloco(b: Bloco, lado: "ini" | "fim"): Bloco {
  const filhos = [...(b.content ?? [])];
  if (!filhos.length) return b;
  const i = lado === "ini" ? 0 : filhos.length - 1;
  const f = filhos[i];
  if (f.type === "text") {
    const t = lado === "ini" ? (f.text ?? "").replace(/^\s+/, "") : (f.text ?? "").replace(/\s+$/, "");
    if (t) filhos[i] = { ...f, text: t };
    else filhos.splice(i, 1);
    const novo = { ...b, content: filhos };
    // o vizinho também pode ser só espaço
    return filhos.length && t === "" ? aparaBloco(novo, lado) : novo;
  }
  if (f.type === "hardBreak") {
    filhos.splice(i, 1);
    return aparaBloco({ ...b, content: filhos }, lado);
  }
  if (f.content) filhos[i] = aparaBloco(f, lado);
  return { ...b, content: filhos };
}

/** O documento sem espaços e parágrafos vazios nas pontas (o banco faz btrim no texto: a projeção precisa continuar batendo). */
export function aparaDoc(doc: DocRico): DocRico {
  let blocos = [...(doc.content ?? [])];
  while (blocos.length && vazio(blocos[0])) blocos.shift();
  while (blocos.length && vazio(blocos[blocos.length - 1])) blocos.pop();
  if (blocos.length) blocos[0] = aparaBloco(blocos[0], "ini");
  if (blocos.length) blocos[blocos.length - 1] = aparaBloco(blocos[blocos.length - 1], "fim");
  blocos = blocos.filter((b, i) => !(vazio(b) && (i === 0 || i === blocos.length - 1)));
  return { type: "doc", content: blocos };
}

/** Texto e formatação aparados juntos. Se não der para manter os dois iguais, fica só o texto (nunca grava rico que não bate). */
export function aparaCampo(texto: string | null | undefined, rico: unknown): Campo {
  const t = String(texto ?? "").trim();
  const r = ricoValido(String(texto ?? ""), rico) ?? ricoValido(t, rico);
  if (!r) return { texto: t, rico: null };
  const c = campoDoDoc(aparaDoc(r.doc));
  return c.texto === t ? c : { texto: t, rico: null };
}

/**
 * O que vai para o banco: cada campo aparado e só as entradas válidas (rico cuja projeção bate com o texto aparado).
 * Devolve os textos aparados e a formatação (null quando não sobra nenhuma).
 */
export function paraSalvar(textos: Record<string, string | null | undefined>, formatacao: unknown): { textos: Record<string, string>; formatacao: Formatacao | null } {
  const f = formatacao && typeof formatacao === "object" && !Array.isArray(formatacao) ? (formatacao as Record<string, unknown>) : {};
  const outT: Record<string, string> = {};
  const outF: Formatacao = {};
  for (const [k, v] of Object.entries(textos)) {
    const c = aparaCampo(v, f[k]);
    outT[k] = c.texto;
    if (c.rico) outF[k] = c.rico;
  }
  const valida = formatacaoValida(outT, outF);
  return { textos: outT, formatacao: Object.keys(valida).length ? valida : null };
}

/** O rico de um campo para mostrar (null = mostre o texto como sempre). */
export function ricoDoCampo(formatacao: unknown, chave: string, texto: string | null | undefined): Envelope | null {
  if (!formatacao || typeof formatacao !== "object" || Array.isArray(formatacao)) return null;
  return ricoValido(String(texto ?? ""), (formatacao as Record<string, unknown>)[chave]);
}

// ---------------------------------------------------------------------------- telas da Administração
export const LETRAS = ["A", "B", "C", "D"] as const;

// chaves em ordem estável (o "há mudança não salva" compara JSON: a mesma formatação tem de dar o mesmo texto)
const ordenar = (x: any): any =>
  Array.isArray(x) ? x.map(ordenar) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenar(x[k])])) : x;

/** Questão oficial: os textos do formulário nas chaves da formatação (statement, opcao.X.texto, opcao.X.explicacao...). */
export function textosOficiais(f: {
  statement?: string | null;
  options?: { id: string; text?: string | null; explanation?: string | null }[];
  expected_conduct?: string | null;
  inep_intent?: string | null;
}): Record<string, string> {
  const out: Record<string, string> = { statement: String(f.statement ?? "") };
  for (const o of f.options ?? []) {
    out[`opcao.${o.id}.texto`] = String(o.text ?? "");
    out[`opcao.${o.id}.explicacao`] = String(o.explanation ?? "");
  }
  out.expected_conduct = String(f.expected_conduct ?? "");
  out.inep_intent = String(f.inep_intent ?? "");
  return out;
}

/** Questão Inédita (rascunho): os textos nas chaves da formatação (stem, alt.X, altexp.X, explanation...). */
export function textosInedita(f: {
  stem?: string | null;
  alternatives?: Record<string, string | null | undefined>;
  alternativeExplanations?: Record<string, string | null | undefined>;
  explanation?: string | null;
  decision?: string | null;
  application?: string | null;
}): Record<string, string> {
  const out: Record<string, string> = { stem: String(f.stem ?? "") };
  for (const l of LETRAS) {
    out[`alt.${l}`] = String(f.alternatives?.[l] ?? "");
    out[`altexp.${l}`] = String(f.alternativeExplanations?.[l] ?? "");
  }
  out.explanation = String(f.explanation ?? "");
  out.clinical_decision = String(f.decision ?? "");
  out.update_application = String(f.application ?? "");
  return out;
}

/** A formatação que vai ao banco (só entradas válidas para o texto aparado), em ordem estável; null quando não há nenhuma. */
export function formatacaoParaSalvar(textos: Record<string, string | null | undefined>, formatacao: unknown): Formatacao | null {
  const f = paraSalvar(textos, formatacao).formatacao;
  return f ? ordenar(f) : null;
}
