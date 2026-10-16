// Módulo M13 "Editar aula" (tabela lessons): o resumo continua em `summary` (texto com marcas, modo "documento") e a formatação nova
// fica em `summary_rico` (envelope sdoc v1). Negrito/itálico/sublinhado de um resumo editado também ficam só no rico. Mesma regra dos parágrafos da Central: o rico só vale se a PROJEÇÃO dele em texto for
// exatamente igual ao `summary` guardado. Resumo sem nada que o texto não represente não ganha rico (aula antiga continua idêntica).
// Este arquivo não registra nada no formato (não entra em ../modulos.ts): só funções de conversão usadas pelo editor, pelo aluno e testes.
import { sanear, defNo, envelope, ehEnvelope, textoDoBloco, conteudoDoRico, conteudoDoTexto, type Bloco, type DocRico, type Envelope } from "../index";
import { ler, escrever, type Doc, type Marca, type NoBloco, type NoInline, type NoParagrafo } from "../../textoRico";

// Projeção nova da fundação (013080): o texto guarda só texto + links; negrito, itálico e sublinhado ficam no rico (são formatação).
const MARCAS_NUCLEO = new Set(["link"]);

/** Texto (linha) → nós inline, quebrando "\n" em quebra de linha. */
function inlinesDeTexto(t: string): NoInline[] {
  const out: NoInline[] = [];
  String(t ?? "")
    .split("\n")
    .forEach((pedaco, i) => {
      if (i > 0) out.push({ type: "hardBreak" });
      if (pedaco) out.push({ type: "text", text: pedaco });
    });
  return out;
}

/** Conteúdo inline do documento rico → inline do texto com marcas (só o link; o resto é formatação e fica no rico). */
function inlines(nos: Bloco[] | undefined): NoInline[] {
  const out: NoInline[] = [];
  for (const n of nos ?? []) {
    if (n.type === "hardBreak") out.push({ type: "hardBreak" });
    else if (n.type === "text") {
      const marks = (n.marks ?? []).filter((m) => MARCAS_NUCLEO.has(m.type)) as Marca[];
      out.push(marks.length ? { type: "text", text: n.text ?? "", marks } : { type: "text", text: n.text ?? "" });
    } else {
      // nó inline de módulo: entra pela projeção que o próprio módulo declarou (ou o texto dos filhos)
      const def = defNo(n.type);
      const filhos = (n.content ?? []).map((f) => textoDoBloco(f)).join("");
      out.push(...inlinesDeTexto(def?.texto ? def.texto(n, filhos) : filhos));
    }
  }
  return out;
}

const paragrafo = (content: NoInline[]): NoParagrafo => (content.length ? { type: "paragraph", content } : { type: "paragraph" });

/** Bloco que não é do núcleo (ou fora do lugar) → um parágrafo com a projeção em linha (a mesma da fundação). */
function paragrafoDaProjecao(b: Bloco): NoParagrafo[] {
  const t = textoDoBloco(b);
  return t.trim() ? [paragrafo((ler(t, "linha").content[0] as NoParagrafo).content ?? [])] : [];
}

/** Qualquer bloco → parágrafos (para dentro de item de lista, citação e célula de tabela, que no texto só aceitam parágrafos). */
function paragrafosDe(b: Bloco): NoParagrafo[] {
  switch (b.type) {
    case "paragraph":
    case "heading":
      return [paragrafo(inlines(b.content))];
    case "bulletList":
    case "orderedList": {
      let n = b.type === "orderedList" && Number(b.attrs?.start) > 0 ? Number(b.attrs!.start) : 1;
      return (b.content ?? []).flatMap((it) => {
        const ps = (it.content ?? []).flatMap(paragrafosDe);
        const marca = b.type === "orderedList" ? `${n++}. ` : "• ";
        if (!ps.length) return [];
        const [p0, ...resto] = ps;
        return [paragrafo([{ type: "text", text: marca }, ...(p0.content ?? [])]), ...resto];
      });
    }
    case "blockquote":
      return (b.content ?? []).flatMap(paragrafosDe);
    default: {
      const def = defNo(b.type);
      if (!def?.texto && def?.conteudo === "blocos") return (b.content ?? []).flatMap(paragrafosDe);
      return paragrafoDaProjecao(b);
    }
  }
}

/** Bloco do documento rico → blocos do texto com marcas (modo documento). */
function blocosDe(b: Bloco): NoBloco[] {
  switch (b.type) {
    case "paragraph":
      return [paragrafo(inlines(b.content))];
    case "heading": {
      const nivel = Number(b.attrs?.level) >= 3 ? 3 : 2; // o texto só tem ## e ###; o nível 4 continua no rico
      const c = inlines(b.content);
      return [c.length ? { type: "heading", attrs: { level: nivel }, content: c } : { type: "heading", attrs: { level: nivel } }];
    }
    case "bulletList":
    case "orderedList": {
      const start = Number(b.attrs?.start);
      const itens = (b.content ?? []).map((it) => ({ type: "listItem" as const, content: (it.content ?? []).flatMap(paragrafosDe) }));
      return [{ type: b.type, ...(b.type === "orderedList" && start > 1 ? { attrs: { start } } : {}), content: itens }];
    }
    case "blockquote":
      return [{ type: "blockquote", content: (b.content ?? []).flatMap(paragrafosDe) }];
    case "table":
      return [
        {
          type: "table",
          content: (b.content ?? []).map((r) => ({
            type: "tableRow" as const,
            content: (r.content ?? []).map((c) => ({
              type: (c.type === "tableHeader" ? "tableHeader" : "tableCell") as "tableHeader" | "tableCell",
              content: (c.content ?? []).flatMap(paragrafosDe),
            })),
          })),
        },
      ];
    default: {
      const def = defNo(b.type);
      // caixa de módulo sem projeção própria: os blocos de dentro entram no texto como blocos (lista continua lista)
      if (!def?.texto && def?.conteudo === "blocos") return (b.content ?? []).flatMap(blocosDe);
      return paragrafoDaProjecao(b);
    }
  }
}

/** Projeção do documento rico do resumo no texto com marcas (modo "documento"), o que vai para `summary`. */
export function textoDoResumo(doc: DocRico): string {
  const d = sanear(doc, { semRef: true });
  const core: Doc = { type: "doc", content: (d.content ?? []).flatMap(blocosDe) };
  return escrever(core, "documento");
}

/** Resumo em texto → documento rico (para abrir no editor quando não há rico válido). */
export function docDoResumo(summary: string | null | undefined): DocRico {
  return sanear(ler(summary ?? "", "documento"), { semRef: true });
}

/** O `summary_rico` só vale se a projeção dele for exatamente o `summary` guardado; senão o aluno e o editor usam o texto. */
export function resumoRicoValido(summary: string | null | undefined, rico: unknown): Envelope | null {
  if (!summary || !ehEnvelope(rico)) return null;
  const d = sanear(rico.doc, { semRef: true });
  return textoDoResumo(d) === summary ? envelope(d) : null;
}

function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as any)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as any)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => igual((a as any)[k], (b as any)[k]));
}

const paragrafoVazio = (b: Bloco) => b.type === "paragraph" && !(b.content ?? []).length;

/**
 * O que gravar a partir do documento do editor: `summary` = projeção; `summary_rico` = envelope SÓ quando o documento tem algo que o
 * texto com marcas não representa (negrito, itálico, sublinhado, cor, fonte, alinhamento, título 4, imagem...). Parágrafos vazios não são guardados.
 */
export function resumoParaGuardar(doc: DocRico): { summary: string; summary_rico: Envelope | null } {
  const s = sanear(doc, { semRef: true });
  const limpo = sanear({ type: "doc", content: (s.content ?? []).filter((b) => !paragrafoVazio(b)) }, { semRef: true });
  const summary = textoDoResumo(limpo);
  if (!summary.trim()) return { summary: "", summary_rico: null };
  return { summary, summary_rico: igual(limpo, docDoResumo(summary)) ? null : envelope(limpo) };
}

type Resumo = { summary?: string | null; summary_rico?: unknown };
const conteudoDoResumo = (r: Resumo) => (r.summary_rico == null ? conteudoDoTexto(r.summary ?? "") : conteudoDoRico(r.summary_rico));

/**
 * Espelho da regra do banco (013040 + 013080): mudou só a formatação do resumo quando o `summary` é idêntico e o conteúdo do rico
 * (ou do texto, quando não há rico) é o mesmo. Quem decide é o banco; aqui serve para a tela avisar.
 */
export function resumoSoFormatacao(antes: Resumo, depois: Resumo): boolean {
  const s = (x?: string | null) => (x ?? "").trim() || null;
  if (s(antes.summary) !== s(depois.summary)) return false;
  return igual(conteudoDoResumo(antes), conteudoDoResumo(depois));
}
