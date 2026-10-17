// Campos com formatação fora das aulas (Questões, Atualizações, Estações, Central...): mesmo padrão "text + rico validado".
// O texto oficial continua no campo de sempre (é o que buscas, travas automáticas, conferências e o aluno antigo leem). A formatação
// fica numa coluna/chave "formatacao" (objeto: nome do campo → envelope sdoc), que só vale quando a projeção bate com o texto.
// No banco: public.ch_campos_conteudo(textos, formatacao) (migração 013110) diz o que, da formatação, é CONTEÚDO (imagem, link...).
import { blocoDeTexto, envelope, precisaRico, ricoValido, sanear, textoDoDoc, type DocRico, type Envelope } from "./index";
import { conteudoDoRico, conteudoDoTexto } from "./conteudo";

export type Formatacao = Record<string, Envelope>;

/** Documento para o editor a partir do texto do campo e do rico guardado (rico velho/estranho é ignorado). */
export function docDoCampo(texto: string | null | undefined, rico: unknown): DocRico {
  const r = ricoValido(String(texto ?? ""), rico);
  if (r) return r.doc;
  return { type: "doc", content: [blocoDeTexto(String(texto ?? ""))] };
}

/** Do editor para o campo: texto oficial (projeção: texto + links) e o rico SÓ quando há formatação que o texto não guarda. */
export function campoDoDoc(doc: unknown): { texto: string; rico: Envelope | null } {
  const d = sanear(doc, { semRef: true });
  const texto = textoDoDoc(d);
  const precisa = d.content.length > 1 || d.content.some((b) => precisaRico(b));
  return { texto, rico: precisa ? envelope(d) : null };
}

/** Só as entradas válidas (rico cuja projeção bate com o texto do campo). Use antes de mandar ao aluno ou ao PDF. */
export function formatacaoValida(textos: Record<string, unknown>, formatacao: unknown): Formatacao {
  const out: Formatacao = {};
  if (!formatacao || typeof formatacao !== "object" || Array.isArray(formatacao)) return out;
  for (const [campo, rico] of Object.entries(formatacao as Record<string, unknown>)) {
    const r = ricoValido(String(textos[campo] ?? ""), rico);
    if (r) out[campo] = r;
  }
  return out;
}

/** Junta/remove a formatação de um campo num objeto formatacao (sem rico = remove a chave). */
export function comFormatacao(formatacao: unknown, campo: string, rico: Envelope | null): Formatacao {
  const base: Formatacao = formatacao && typeof formatacao === "object" && !Array.isArray(formatacao) ? { ...(formatacao as Formatacao) } : {};
  if (rico) base[campo] = rico;
  else delete base[campo];
  return base;
}

/** Espelho de public.ch_campos_conteudo: só o que, na formatação, é conteúdo (vazio = só formatação). */
export function camposConteudo(textos: Record<string, unknown>, formatacao: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!formatacao || typeof formatacao !== "object" || Array.isArray(formatacao)) return formatacao == null ? out : { bruto: formatacao };
  for (const [campo, rico] of Object.entries(formatacao as Record<string, unknown>)) {
    const c = conteudoDoRico(rico);
    if (JSON.stringify(ordenar(c)) !== JSON.stringify(ordenar(conteudoDoTexto(textos[campo])))) out[campo] = c;
  }
  return out;
}

const ordenar = (x: any): any =>
  Array.isArray(x) ? x.map(ordenar) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenar(x[k])])) : x;

/**
 * true quando, de antes para depois, só mudou formatação nos campos: os textos são idênticos e o que a formatação traz de conteúdo
 * também. Mesma resposta do banco (teste lado a lado em editorPro.campos.test.ts).
 */
export function camposSoFormatacao(antes: { textos: Record<string, unknown>; formatacao: unknown }, depois: { textos: Record<string, unknown>; formatacao: unknown }): boolean {
  const chaves = new Set([...Object.keys(antes.textos), ...Object.keys(depois.textos)]);
  for (const k of chaves) if ((antes.textos[k] ?? null) !== (depois.textos[k] ?? null)) return false;
  return JSON.stringify(ordenar(camposConteudo(antes.textos, antes.formatacao))) === JSON.stringify(ordenar(camposConteudo(depois.textos, depois.formatacao)));
}
