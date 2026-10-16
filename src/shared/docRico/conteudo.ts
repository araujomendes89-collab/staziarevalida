// "Só formatação ou conteúdo?" — espelho em TypeScript da regra do banco (migração 013080, public.ch_conteudo_hash).
// Quem decide de verdade é o banco; aqui serve só para a tela avisar ANTES de salvar (ex.: versão publicada só aceita formatação).
// As listas abaixo têm de ser IGUAIS às do SQL (o teste editorPro.conteudo.test.ts confere). Atributo ou marca novo de módulo que
// seja só aparência entra nas DUAS listas, pelo líder da frente; o que não estiver aqui conta como conteúdo (na dúvida, é conteúdo).

export const FORMATO_MARCAS = ["bold", "italic", "underline", "textStyle", "highlight"];
export const FORMATO_ATRIBUTOS = [
  "ref", "textAlign", "lineHeight", "indent", "firstLineIndent", "spacingBefore", "spacingAfter", "marginTop", "marginBottom",
  "color", "backgroundColor", "fontFamily", "fontSize", "colwidth", "cellBackground", "borderColor", "borderStyle",
  "largura", "alinhamento", "disposicao", "borda", "cantos", "sombra", "listStyle",
];
export const NOS_DO_TEXTO = ["doc", "paragraph", "text", "hardBreak", "heading", "bulletList", "orderedList", "listItem", "blockquote", "table", "tableRow", "tableCell", "tableHeader"];

const ehObj = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x);
const semChaves = (o: Record<string, any>, chaves: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !chaves.includes(k)));

function itens(no: any, dentro = false, prof = 0): any[] {
  if (prof > 60 || !ehObj(no)) return [{ bruto: no ?? null }];
  const tipo = no.type;
  const nucleo = NOS_DO_TEXTO.includes(tipo);
  const attrs = ehObj(no.attrs) ? semChaves(no.attrs, FORMATO_ATRIBUTOS) : "attrs" in no && no.attrs !== null ? { bruto: no.attrs } : {};
  const out: any[] = [];
  if (!nucleo || Object.keys(attrs).length) out.push({ t: tipo ?? null, a: attrs });
  if (tipo === "text" && dentro) out.push({ x: no.text ?? null });
  for (const m of Array.isArray(no.marks) ? no.marks : []) {
    if (ehObj(m) && (m.type === "link" || FORMATO_MARCAS.includes(m.type))) continue;
    out.push({ m: ehObj(m) ? m.type ?? null : null, a: ehObj(m?.attrs) ? semChaves(m.attrs, FORMATO_ATRIBUTOS) : (m?.attrs ?? m) });
  }
  for (const f of Array.isArray(no.content) ? no.content : []) out.push(...itens(f, dentro || !nucleo, prof + 1));
  return out;
}

const RE_LINK = /\]\((https:\/\/[^\s()<>"\\]+)\)/g;
const ordenados = (xs: string[]) => [...new Set(xs)].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0));

export function linksDoTexto(texto: unknown): string[] {
  return ordenados([...String(texto ?? "").matchAll(RE_LINK)].map((m) => m[1]));
}

function hrefs(no: any, out: unknown[] = []): unknown[] {
  if (Array.isArray(no)) no.forEach((x) => hrefs(x, out));
  else if (ehObj(no)) {
    if (Array.isArray(no.marks)) for (const m of no.marks) if (ehObj(m) && m.type === "link" && ehObj(m.attrs) && "href" in m.attrs) out.push(m.attrs.href);
    for (const v of Object.values(no)) if (typeof v === "object") hrefs(v, out);
  }
  return out;
}

export function conteudoDoRico(rico: unknown): unknown {
  if (ehObj(rico) && rico.f === "sdoc" && rico.v === 1 && ehObj(rico.doc) && Object.keys(rico).every((k) => k === "f" || k === "v" || k === "doc")) {
    return { itens: itens(rico.doc), links: ordenados(hrefs(rico.doc) as string[]) };
  }
  return { bruto: rico ?? null };
}

export const conteudoDoTexto = (texto: unknown) => ({ itens: [], links: linksDoTexto(texto) });

function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
  if (ehObj(a) && ehObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && igual(a[k], b[k]));
  }
  return false;
}

function paragrafo(p: unknown): unknown {
  if (!ehObj(p) || !("rico" in p)) return p;
  const resto = semChaves(p, ["rico"]);
  const c = conteudoDoRico(p.rico);
  return igual(c, conteudoDoTexto(p.text)) ? resto : { ...resto, rico_conteudo: c };
}

/** O que entra no hash de conteúdo da versão (o mesmo que o banco usa), sem a formatação. */
export function conteudoDaVersao(content: unknown): unknown {
  if (!ehObj(content)) return content;
  const base = semChaves(content, ["doc_config"]);
  if (!Array.isArray(content.sections)) return base;
  return {
    ...base,
    sections: content.sections.map((s: any) => (ehObj(s) && Array.isArray(s.paragraphs) ? { ...s, paragraphs: s.paragraphs.map(paragrafo) } : s)),
  };
}

/** true quando, de antes para depois, só mudou formatação (as aprovações continuam valendo). */
export const soFormatacao = (antes: unknown, depois: unknown) => igual(conteudoDaVersao(antes), conteudoDaVersao(depois));
