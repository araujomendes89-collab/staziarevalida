import "./modulos";
export * from "./registro";

import {
  Valor,
  NoDoc,
  MarcaDoc,
  CtxHtml,
  Css,
  defNo,
  defMarca,
  atributosDe,
  nomesMarcasRegistradas,
  cssSeguro,
} from "./registro";
import { ler, escrever, hrefValido, Marca, NoInline } from "../textoRico";

export const FORMATO = "sdoc";
export const VERSAO = 1;

export type Bloco = NoDoc;
export type DocRico = { type: "doc"; content: Bloco[] };
export type Envelope = { f: "sdoc"; v: 1; doc: DocRico };

/** Cria o envelope padrão do documento rico. */
export function envelope(doc: DocRico): Envelope {
  return { f: FORMATO, v: VERSAO, doc };
}

/** Verifica a forma estrutural do envelope sdoc v1. */
export function ehEnvelope(x: unknown): x is Envelope {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.f !== "sdoc" || o.v !== 1) return false;
  if (typeof o.doc !== "object" || o.doc === null) return false;
  const d = o.doc as Record<string, unknown>;
  if (d.type !== "doc" || !Array.isArray(d.content)) return false;
  return true;
}

/** Compara recursivamente a igualdade profunda de dois valores. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** Compara se duas listas de marcas são idênticas. */
function mesmasMarcas(a?: MarcaDoc[], b?: MarcaDoc[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return deepEqual(a, b);
}

/** Concatena nós de texto vizinhos com as mesmas marcas e descarta textos vazios. */
function juntarTextos(nos: NoDoc[]): NoDoc[] {
  const out: NoDoc[] = [];
  for (const n of nos) {
    if (n.type === "text" && (!n.text || n.text === "")) continue;
    const ult = out[out.length - 1];
    if (n.type === "text" && ult?.type === "text" && mesmasMarcas(ult.marks, n.marks)) {
      ult.text = (ult.text ?? "") + (n.text ?? "");
    } else {
      out.push(n.type === "text" ? { ...n } : n);
    }
  }
  return out;
}

/** Extrai recursivamente conteúdo inline de nós de bloco. */
function extrairInline(nos: NoDoc[]): NoDoc[] {
  const out: NoDoc[] = [];
  for (const n of nos) {
    const def = defNo(n.type);
    if (!def || def.grupo === "inline") {
      out.push(n);
    } else {
      if (n.content && Array.isArray(n.content)) {
        out.push(...extrairInline(n.content));
      } else if (n.text) {
        out.push({ type: "text", text: n.text });
      }
    }
  }
  return out;
}

/** Embrulha sequências consecutivas de nós inline em parágrafos. */
function embrulharInlinesEmBlocos(nos: NoDoc[]): NoDoc[] {
  const out: NoDoc[] = [];
  let bufferInline: NoDoc[] = [];

  const flush = () => {
    if (bufferInline.length > 0) {
      const inlineJunto = juntarTextos(bufferInline);
      if (inlineJunto.length > 0) {
        out.push({ type: "paragraph", content: inlineJunto });
      }
      bufferInline = [];
    }
  };

  for (const n of nos) {
    const def = defNo(n.type);
    if (def?.grupo === "inline" || (!def && !n.content)) {
      bufferInline.push(n);
    } else {
      flush();
      out.push(n);
    }
  }
  flush();
  return out;
}

/** Saneia um documento não confiável garantindo estrita conformidade com os registros. */
export function sanear(doc: unknown, opcoes?: { semRef?: boolean }): DocRico {
  let contadorNos = 0;
  const MAX_NOS = 50000;
  const MAX_PROFUNDIDADE = 24;

  function sanearNo(
    bruto: unknown,
    profundidade: number,
    ehPrimeiroNivel: boolean
  ): NoDoc | NoDoc[] | null {
    if (contadorNos >= MAX_NOS || profundidade > MAX_PROFUNDIDADE) return null;
    if (typeof bruto !== "object" || bruto === null) return null;

    const raw = bruto as Record<string, unknown>;
    const type = typeof raw.type === "string" ? raw.type : "";
    if (!type) return null;

    // "doc" só existe na raiz: dentro do documento é tratado como desconhecido (sobe os filhos)
    const def = type === "doc" ? undefined : defNo(type);

    // Nó desconhecido: se tem content, sobe os filhos; senão some
    if (!def) {
      if (Array.isArray(raw.content)) {
        const filhos: NoDoc[] = [];
        for (const f of raw.content) {
          const res = sanearNo(f, profundidade, ehPrimeiroNivel);
          if (Array.isArray(res)) filhos.push(...res);
          else if (res) filhos.push(res);
        }
        return filhos;
      }
      return null;
    }

    contadorNos++;

    // Nó de texto puro
    if (type === "text") {
      const texto = typeof raw.text === "string" ? raw.text : "";
      if (!texto) return null;

      let marksSaneadas: MarcaDoc[] | undefined;
      if (Array.isArray(raw.marks)) {
        const marcasList: MarcaDoc[] = [];
        const tiposVistos = new Set<string>();

        for (const m of raw.marks) {
          if (typeof m !== "object" || m === null) continue;
          const mType = (m as any).type;
          if (typeof mType !== "string") continue;
          const defM = defMarca(mType);
          if (!defM) continue; // Marca desconhecida some

          const attrs: Record<string, Valor> = {};
          const rawAttrs = (m as any).attrs;
          if (rawAttrs && typeof rawAttrs === "object") {
            for (const defAt of atributosDe(mType)) {
              if (defAt.nome in rawAttrs) {
                const saneado = defAt.sanear(rawAttrs[defAt.nome]);
                if (saneado !== undefined && saneado !== (defAt.padrao ?? undefined)) {
                  attrs[defAt.nome] = saneado;
                }
              }
            }
          }

          if (mType === "link") {
            if (!attrs.href || !hrefValido(attrs.href)) continue;
          }

          if (!tiposVistos.has(mType)) {
            tiposVistos.add(mType);
            const marcaObj: MarcaDoc = { type: mType };
            if (Object.keys(attrs).length > 0) marcaObj.attrs = attrs;
            marcasList.push(marcaObj);
          }
        }

        if (marcasList.length > 0) {
          const nucleoOrdem: Record<string, number> = { bold: 0, italic: 1, underline: 2, link: 3 };
          const ordemRegistro = nomesMarcasRegistradas();
          marcasList.sort((a, b) => {
            const oa = a.type in nucleoOrdem ? nucleoOrdem[a.type] : 10 + ordemRegistro.indexOf(a.type);
            const ob = b.type in nucleoOrdem ? nucleoOrdem[b.type] : 10 + ordemRegistro.indexOf(b.type);
            return oa - ob;
          });
          marksSaneadas = marcasList;
        }
      }

      const noTexto: NoDoc = { type: "text", text: texto };
      if (marksSaneadas) noTexto.marks = marksSaneadas;
      return noTexto;
    }

    // Atributos do nó
    const attrs: Record<string, Valor> = {};
    const rawAttrs = raw.attrs;
    if (rawAttrs && typeof rawAttrs === "object") {
      if (ehPrimeiroNivel && !opcoes?.semRef) {
        const refVal = (rawAttrs as any).ref;
        if (typeof refVal === "string" && refVal.length <= 40 && /^[0-9:.-]+$/.test(refVal)) {
          attrs.ref = refVal;
        }
      }
      for (const defAt of atributosDe(type)) {
        if (defAt.nome in (rawAttrs as Record<string, unknown>)) {
          const saneado = defAt.sanear((rawAttrs as any)[defAt.nome]);
          if (saneado !== undefined && saneado !== (defAt.padrao ?? undefined)) {
            attrs[defAt.nome] = saneado;
          }
        }
      }
    }

    if (def.conteudo === "nenhum") {
      const res: NoDoc = { type: def.nome };
      if (Object.keys(attrs).length > 0) res.attrs = attrs;
      return res;
    }

    const rawContent = Array.isArray(raw.content) ? raw.content : [];
    const filhosProcessados: NoDoc[] = [];
    for (const f of rawContent) {
      const sub = sanearNo(f, profundidade + 1, false);
      if (Array.isArray(sub)) filhosProcessados.push(...sub);
      else if (sub) filhosProcessados.push(sub);
    }

    let filhosFinais: NoDoc[] = [];

    if (def.conteudo === "inline") {
      const inlines = extrairInline(filhosProcessados);
      filhosFinais = juntarTextos(inlines);
    } else if (def.conteudo === "blocos") {
      const blocosSemListItemSolto: NoDoc[] = [];
      for (const f of filhosProcessados) {
        if (f.type === "listItem") {
          if (f.content && Array.isArray(f.content)) {
            blocosSemListItemSolto.push(...f.content);
          }
        } else {
          blocosSemListItemSolto.push(f);
        }
      }
      filhosFinais = embrulharInlinesEmBlocos(blocosSemListItemSolto);

      if ((def.nome === "tableCell" || def.nome === "tableHeader") && filhosFinais.length === 0) {
        filhosFinais.push({ type: "paragraph" });
      }
    } else if (Array.isArray(def.conteudo)) {
      const permitidos = new Set(def.conteudo);
      for (const f of filhosProcessados) {
        if (permitidos.has(f.type)) {
          filhosFinais.push(f);
        } else if (def.nome === "bulletList" || def.nome === "orderedList") {
          if (f.type === "paragraph") {
            filhosFinais.push({ type: "listItem", content: [f] });
          } else {
            const emb = embrulharInlinesEmBlocos([f]);
            filhosFinais.push({ type: "listItem", content: emb.length ? emb : [{ type: "paragraph" }] });
          }
        }
      }
      if (def.nome === "tableRow" && filhosFinais.length === 0) {
        return null;
      }
    }

    const noFinal: NoDoc = { type: def.nome };
    if (Object.keys(attrs).length > 0) noFinal.attrs = attrs;
    if (filhosFinais.length > 0) noFinal.content = filhosFinais;
    return noFinal;
  }

  let raizContentBruto: unknown[] = [];
  if (typeof doc === "object" && doc !== null) {
    if (Array.isArray((doc as any).content)) {
      raizContentBruto = (doc as any).content;
    }
  }

  const blocosRaiz: NoDoc[] = [];
  for (const b of raizContentBruto) {
    const res = sanearNo(b, 1, true);
    if (Array.isArray(res)) blocosRaiz.push(...res);
    else if (res) blocosRaiz.push(res);
  }

  const blocosDesempacotados: NoDoc[] = [];
  for (const b of blocosRaiz) {
    if (b.type === "listItem") {
      if (b.content && Array.isArray(b.content)) {
        blocosDesempacotados.push(...b.content);
      }
    } else {
      blocosDesempacotados.push(b);
    }
  }

  const blocosValidados = embrulharInlinesEmBlocos(blocosDesempacotados);
  const contentFinal = blocosValidados.length > 0 ? blocosValidados : [{ type: "paragraph" }];
  return { type: "doc", content: contentFinal };
}

/** Saneia um envelope garantindo versão 1 e formato sdoc. */
export function sanearEnvelope(x: unknown): Envelope | null {
  if (!ehEnvelope(x)) return null;
  return { f: FORMATO, v: VERSAO, doc: sanear(x.doc, { semRef: true }) };
}

/** Filtra nós inline para conterem apenas marcas nucleares suportadas pelo textoRico. */
function filtrarMarcasNucleo(nos: NoDoc[]): NoInline[] {
  const nucleoMarcas = new Set(["bold", "italic", "underline", "link"]);
  const out: NoInline[] = [];
  for (const n of nos) {
    if (n.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (n.type === "text") {
      const marks = (n.marks ?? []).filter((m) => nucleoMarcas.has(m.type)) as Marca[];
      out.push(marks.length ? { type: "text", text: n.text ?? "", marks } : { type: "text", text: n.text ?? "" });
    }
  }
  return out;
}

/** Projeta um único bloco para texto com marcas (modo linha). */
export function textoDoBloco(b: Bloco): string {
  if (!b) return "";
  switch (b.type) {
    case "paragraph": {
      const content = filtrarMarcasNucleo(b.content ?? []);
      return escrever({ type: "doc", content: [{ type: "paragraph", content }] }, "linha");
    }
    case "heading": {
      const content = filtrarMarcasNucleo(b.content ?? []);
      return escrever({ type: "doc", content: [{ type: "paragraph", content }] }, "linha");
    }
    case "bulletList": {
      return (b.content ?? [])
        .map((it) => "• " + (it.content ?? []).map((p) => textoDoBloco(p)).join(" "))
        .join("\n");
    }
    case "orderedList": {
      let n = b.attrs?.start && Number(b.attrs.start) > 0 ? Number(b.attrs.start) : 1;
      return (b.content ?? [])
        .map((it) => `${n++}. ` + (it.content ?? []).map((p) => textoDoBloco(p)).join(" "))
        .join("\n");
    }
    case "blockquote": {
      return (b.content ?? []).map((p) => textoDoBloco(p)).join("\n");
    }
    case "table": {
      return (b.content ?? [])
        .map((r) =>
          (r.content ?? [])
            .map((c) => (c.content ?? []).map((p) => textoDoBloco(p)).join(" "))
            .join(" | ")
        )
        .join("\n");
    }
    case "hardBreak":
      return "\n";
    case "text":
      return b.text ?? "";
    default: {
      const def = defNo(b.type);
      const filhos = (b.content ?? []).map((f) => textoDoBloco(f)).join("\n");
      if (def?.texto) {
        return def.texto(b, filhos);
      }
      return filhos;
    }
  }
}

/** Projeta todos os blocos do documento rico unidos por quebra de linha. */
export function textoDoDoc(doc: DocRico): string {
  return (doc.content ?? []).map(textoDoBloco).join("\n");
}

/** Converte texto com marcas (modo linha) em um nó de parágrafo. */
export function blocoDeTexto(texto: string): Bloco {
  const d = ler(texto, "linha");
  return d.content[0] as Bloco;
}

/** Indica se o bloco requer serialização rica ou se é puramente representável em texto com marcas. */
export function precisaRico(b: Bloco): boolean {
  if (b.type !== "paragraph") return true;
  if (b.attrs) {
    for (const [k, v] of Object.entries(b.attrs)) {
      if (k !== "ref" && v !== undefined) return true;
    }
  }
  const bSemRef: Bloco = { ...b };
  if (bSemRef.attrs) {
    const { ref: _ref, ...resto } = bSemRef.attrs;
    if (Object.keys(resto).length > 0) bSemRef.attrs = resto;
    else delete bSemRef.attrs;
  }
  const saneado = sanear({ type: "doc", content: [bSemRef] }, { semRef: true }).content[0];
  const deVolta = blocoDeTexto(textoDoBloco(b));
  return !deepEqual(saneado, deVolta);
}

/** Valida e devolve o envelope saneado somente se o texto projetado coincidir exatamente com o texto informado. */
export function ricoValido(texto: string, rico: unknown): Envelope | null {
  if (!ehEnvelope(rico)) return null;
  const docSaneado = sanear(rico.doc, { semRef: true });
  if (textoDoDoc(docSaneado) === texto) {
    return { f: FORMATO, v: VERSAO, doc: docSaneado };
  }
  return null;
}

// ---------------------------------------------------------------------------- Renderização HTML Segura

const escHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const ctxHtml: CtxHtml = { esc: escHtml };

function renderNoHtml(no: NoDoc): string {
  if (no.type === "text") {
    let s = ctxHtml.esc(no.text ?? "");
    const marks = no.marks ?? [];
    if (marks.length === 0) return s;

    // Marcas de módulo por dentro de italic, na ordem de registro
    const nucleoMarcas = new Set(["italic", "bold", "underline", "link"]);
    const modMarcas = marks.filter((m) => !nucleoMarcas.has(m.type));
    const ordemRegistro = nomesMarcasRegistradas();
    modMarcas.sort((a, b) => ordemRegistro.indexOf(a.type) - ordemRegistro.indexOf(b.type));

    for (const m of modMarcas) {
      const def = defMarca(m.type);
      if (def?.html) {
        s = def.html(s, m);
      } else {
        const tag = def?.tag ?? "span";
        const cssObj: Css = {};
        for (const at of atributosDe(m.type)) {
          if (at.css && m.attrs && at.nome in m.attrs) {
            const val = m.attrs[at.nome];
            if (val !== undefined) Object.assign(cssObj, at.css(val));
          }
        }
        const st = cssSeguro(cssObj);
        const styleAttr = st ? ` style="${st}"` : "";
        const classAttr = def?.classe ? ` class="${def.classe}"` : "";
        s = `<${tag}${classAttr}${styleAttr}>${s}</${tag}>`;
      }
    }

    if (marks.some((m) => m.type === "italic")) {
      s = `<em>${s}</em>`;
    }
    if (marks.some((m) => m.type === "bold")) {
      s = `<strong>${s}</strong>`;
    }
    if (marks.some((m) => m.type === "underline")) {
      s = `<u>${s}</u>`;
    }
    const lk = marks.find((m) => m.type === "link");
    if (lk && hrefValido(lk.attrs?.href)) {
      s = `<a href="${ctxHtml.esc(lk.attrs.href)}" rel="noopener noreferrer nofollow">${s}</a>`;
    }
    return s;
  }

  if (no.type === "hardBreak") {
    return "<br>";
  }

  let filhos = "";
  if (no.content && Array.isArray(no.content)) {
    if (no.type === "paragraph" || no.type === "heading") {
      filhos = juntarTextos(no.content).map(renderNoHtml).join("");
    } else {
      filhos = no.content.map(renderNoHtml).join("");
    }
  }

  const def = defNo(no.type);
  if (def?.html) {
    return def.html(no, filhos, ctxHtml);
  }

  let tag: string;
  if (no.type === "heading") {
    const lvl = no.attrs?.level === 3 || no.attrs?.level === 4 ? no.attrs.level : 2;
    tag = `h${lvl}`;
  } else {
    tag = def?.tag ?? (def?.grupo === "bloco" ? "div" : "span");
  }

  const cssObj: Css = {};
  for (const at of atributosDe(no.type)) {
    if (at.css && no.attrs && at.nome in no.attrs) {
      const val = no.attrs[at.nome];
      if (val !== undefined) Object.assign(cssObj, at.css(val));
    }
  }
  const st = cssSeguro(cssObj);
  const styleAttr = st ? ` style="${st}"` : "";
  const classAttr = def?.classe ? ` class="${def.classe}"` : "";

  let extraAttrs = "";
  if (no.type === "orderedList" && no.attrs?.start && Number(no.attrs.start) > 1) {
    extraAttrs = ` start="${no.attrs.start}"`;
  }

  return `<${tag}${extraAttrs}${classAttr}${styleAttr}>${filhos}</${tag}>`;
}

/** Renderiza o documento rico em HTML seguro para visualização e impressão PDF. */
export function htmlDoDoc(doc: DocRico): string {
  const d = sanear(doc);
  return (d.content ?? []).map(renderNoHtml).join("");
}

// ---------------------------------------------------------------------------- Integração com Aula da Central

/** Converte o conteúdo de uma unidade da Central em documento rico com referências rastreáveis. */
export function unidadeParaDoc(content: unknown): DocRico {
  if (typeof content !== "object" || content === null) {
    return { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] };
  }
  const rawSections = (content as any).sections;
  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] };
  }

  const blocos: Bloco[] = [];

  for (let si = 0; si < rawSections.length; si++) {
    const s = rawSections[si];
    const headingText = typeof s?.heading === "string" ? s.heading : "";

    const headingNo: Bloco = {
      type: "heading",
      attrs: { level: 2, ref: `s${si}` },
    };

    if (headingText) {
      const linhas = headingText.split("\n");
      const inlines: NoDoc[] = [];
      for (let li = 0; li < linhas.length; li++) {
        if (li > 0) inlines.push({ type: "hardBreak" });
        if (linhas[li]) {
          inlines.push({ type: "text", text: linhas[li] });
        }
      }
      if (inlines.length > 0) {
        headingNo.content = inlines;
      }
    }
    blocos.push(headingNo);

    const rawParagraphs = Array.isArray(s?.paragraphs) ? s.paragraphs : [];
    for (let pi = 0; pi < rawParagraphs.length; pi++) {
      const p = rawParagraphs[pi];
      const pText = typeof p?.text === "string" ? p.text : "";
      const envelopeValido = ricoValido(pText, p?.rico);

      if (envelopeValido) {
        const ricosBlocos = envelopeValido.doc.content;
        for (let bi = 0; bi < ricosBlocos.length; bi++) {
          const originalBloco = ricosBlocos[bi];
          const ref = bi === 0 ? `${si}:${pi}` : `${si}:${pi}.${bi}`;
          const bComRef: Bloco = {
            ...originalBloco,
            attrs: { ...originalBloco.attrs, ref },
          };
          blocos.push(bComRef);
        }
      } else {
        const b = blocoDeTexto(pText);
        b.attrs = { ...b.attrs, ref: `${si}:${pi}` };
        blocos.push(b);
      }
    }
  }

  return { type: "doc", content: blocos };
}

/** Converte o documento rico de volta para a estrutura da unidade da Central, preservando imutabilidade de partes inalteradas. */
export function docParaUnidade(
  doc: unknown,
  original: unknown
): { sections: any[]; [k: string]: unknown } {
  const d = sanear(doc);
  const origObj = typeof original === "object" && original !== null ? (original as Record<string, unknown>) : null;
  const origSections: any[] = origObj && Array.isArray(origObj.sections) ? origObj.sections : [];

  // Caso especial: content original sem seções e doc com heading vazio placeholder
  if (
    origSections.length === 0 &&
    d.content.length === 1 &&
    d.content[0].type === "heading" &&
    !d.content[0].attrs?.ref &&
    (!d.content[0].content || d.content[0].content.length === 0)
  ) {
    if (origObj) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(origObj)) {
        if (k === "sections") out.sections = origSections;
        else out[k] = origObj[k];
      }
      if (!("sections" in out)) out.sections = origSections;
      return out as any;
    }
    return { sections: [] };
  }

  type SecaoColetada = {
    heading: string;
    origIdx?: number;
    blocks: Bloco[];
  };

  const secoesColetadas: SecaoColetada[] = [];
  let secaoAtual: SecaoColetada | null = null;

  for (const b of d.content) {
    const ehHeading2 = b.type === "heading" && (b.attrs?.level === 2 || b.attrs?.level === undefined);

    if (ehHeading2) {
      const textoPuroHeading = (b.content ?? [])
        .map((n) => (n.type === "text" ? n.text ?? "" : n.type === "hardBreak" ? "\n" : ""))
        .join("");

      let origIdx: number | undefined;
      const refStr = typeof b.attrs?.ref === "string" ? b.attrs.ref : "";
      const match = /^s(\d+)$/.exec(refStr);
      if (match) {
        const idx = Number(match[1]);
        if (origSections[idx]) {
          origIdx = idx;
        }
      }

      secaoAtual = {
        heading: textoPuroHeading,
        origIdx,
        blocks: [],
      };
      secoesColetadas.push(secaoAtual);
    } else {
      if (!secaoAtual) {
        secaoAtual = {
          heading: "",
          blocks: [],
        };
        secoesColetadas.push(secaoAtual);
      }
      secaoAtual.blocks.push(b);
    }
  }

  const usedRefs = new Set<string>();
  const finalSections: any[] = [];

  for (const sc of secoesColetadas) {
    type GrupoBlocos = {
      baseRef?: string;
      blocks: Bloco[];
    };
    const grupos: GrupoBlocos[] = [];
    let grupoAtual: GrupoBlocos | null = null;

    for (const b of sc.blocks) {
      const refStr = typeof b.attrs?.ref === "string" ? b.attrs.ref : "";
      const baseMatch = /^(\d+:\d+)(?:\.(.+))?$/.exec(refStr);

      if (baseMatch) {
        const base = baseMatch[1];
        const sub = baseMatch[2];

        if (sub !== undefined && grupoAtual && grupoAtual.baseRef === base) {
          grupoAtual.blocks.push(b);
        } else {
          grupoAtual = { baseRef: base, blocks: [b] };
          grupos.push(grupoAtual);
        }
      } else {
        grupoAtual = { baseRef: undefined, blocks: [b] };
        grupos.push(grupoAtual);
      }
    }

    const paragraphs: any[] = [];

    for (const grp of grupos) {
      const blocos = grp.blocks;
      const novoTexto = blocos.map(textoDoBloco).join("\n");
      const precisa = blocos.length > 1 || blocos.some(precisaRico);
      const blocosSemRef = sanear({ type: "doc", content: blocos }, { semRef: true }).content;

      let pOrig: any = undefined;
      const baseRef = grp.baseRef;

      if (baseRef) {
        const [siStr, piStr] = baseRef.split(":");
        const si = Number(siStr);
        const pi = Number(piStr);
        pOrig = origSections[si]?.paragraphs?.[pi];
      }

      if (pOrig && baseRef) {
        const jaUsado = usedRefs.has(baseRef);

        if (!jaUsado) {
          usedRefs.add(baseRef);

          const ricoOriginalValido = pOrig.rico ? ricoValido(pOrig.text, pOrig.rico) : null;
          let origBlocosSemRef: Bloco[];
          if (ricoOriginalValido) {
            origBlocosSemRef = sanear(ricoOriginalValido.doc, { semRef: true }).content;
          } else {
            origBlocosSemRef = [sanear({ type: "doc", content: [blocoDeTexto(pOrig.text)] }, { semRef: true }).content[0]];
          }

          // Se o original tinha rico mas era inválido (desatualizado), não está inalterado (rico deve ser removido)
          const ricoInvalidoNoOriginal = pOrig.rico && !ricoOriginalValido;
          const inalterado =
            !ricoInvalidoNoOriginal &&
            deepEqual(blocosSemRef, origBlocosSemRef) &&
            novoTexto === pOrig.text;

          if (inalterado) {
            paragraphs.push(pOrig);
          } else {
            const novoP: Record<string, unknown> = {};
            for (const k of Object.keys(pOrig)) {
              if (k === "text") {
                novoP.text = novoTexto;
              } else if (k === "rico") {
                if (precisa) {
                  novoP.rico = envelope({ type: "doc", content: blocosSemRef });
                }
              } else {
                novoP[k] = pOrig[k];
              }
            }
            if (!("text" in novoP)) {
              novoP.text = novoTexto;
            }
            if (precisa && !("rico" in novoP)) {
              novoP.rico = envelope({ type: "doc", content: blocosSemRef });
            }
            paragraphs.push(novoP);
          }
        } else {
          // Ref repetido (parágrafo dividido): copia os outros campos do original
          const novoP: Record<string, unknown> = {};
          for (const k of Object.keys(pOrig)) {
            if (k === "text") {
              novoP.text = novoTexto;
            } else if (k === "rico") {
              if (precisa) {
                novoP.rico = envelope({ type: "doc", content: blocosSemRef });
              }
            } else {
              novoP[k] = pOrig[k];
            }
          }
          if (!("text" in novoP)) {
            novoP.text = novoTexto;
          }
          if (precisa && !("rico" in novoP)) {
            novoP.rico = envelope({ type: "doc", content: blocosSemRef });
          }
          paragraphs.push(novoP);
        }
      } else {
        // Sem ref (novo)
        if (novoTexto === "" && !precisa) {
          continue;
        }
        const novoP: Record<string, unknown> = {
          text: novoTexto,
          clinical: false,
          claim_ids: [],
        };
        if (precisa) {
          novoP.rico = envelope({ type: "doc", content: blocosSemRef });
        }
        paragraphs.push(novoP);
      }
    }

    let secaoFinal: any;
    if (sc.origIdx !== undefined && origSections[sc.origIdx]) {
      const secaoOrig = origSections[sc.origIdx];
      const paragrafosOrig = secaoOrig.paragraphs ?? [];
      const paragrafosIguais =
        paragrafosOrig.length === paragraphs.length &&
        paragraphs.every((p, i) => p === paragrafosOrig[i]);

      if (sc.heading === secaoOrig.heading && paragrafosIguais) {
        secaoFinal = secaoOrig;
      } else {
        const outSecao: Record<string, unknown> = {};
        for (const k of Object.keys(secaoOrig)) {
          if (k === "heading") {
            outSecao.heading = sc.heading;
          } else if (k === "paragraphs") {
            outSecao.paragraphs = paragraphs;
          } else {
            outSecao[k] = secaoOrig[k];
          }
        }
        if (!("heading" in outSecao)) outSecao.heading = sc.heading;
        if (!("paragraphs" in outSecao)) outSecao.paragraphs = paragraphs;
        secaoFinal = outSecao;
      }
    } else {
      secaoFinal = {
        heading: sc.heading,
        paragraphs,
      };
    }

    finalSections.push(secaoFinal);
  }

  const secoesInalteradas =
    origSections.length === finalSections.length &&
    finalSections.every((s, i) => s === origSections[i]);

  const secoesParaRetorno = secoesInalteradas ? origSections : finalSections;

  if (origObj) {
    const outDoc: Record<string, unknown> = {};
    for (const k of Object.keys(origObj)) {
      if (k === "sections") {
        outDoc.sections = secoesParaRetorno;
      } else {
        outDoc[k] = origObj[k];
      }
    }
    if (!("sections" in outDoc)) {
      outDoc.sections = secoesParaRetorno;
    }
    return outDoc as any;
  }

  return { sections: secoesParaRetorno };
}
