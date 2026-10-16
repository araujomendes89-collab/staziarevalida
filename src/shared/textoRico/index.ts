// "Texto com marcas": o formato guardado pelo editor estilo Word (aulas, unidades). É o MESMO texto que já existia, com um conjunto
// pequeno e fechado de marcas no estilo Markdown. Texto simples continua sendo texto simples (sem nenhuma marca, nada muda).
//
//   Marcas dentro da linha (valem em todo campo):  **negrito**   *itálico*   <u>sublinhado</u>   [texto](https://endereço)
//   Marcas de bloco (só no modo "documento", ex.: resumo de aula feita à mão):
//     "## " título · "### " subtítulo · "- " lista · "1. " lista numerada · "> " citação · tabela com "| a | b |" e "| --- | --- |"
//   Linha em branco separa parágrafos; uma quebra de linha simples dentro do parágrafo é quebra de linha (como no texto antigo).
//   Contrabarra escapa: \* \\ \[ \] \( \<  (e, no começo da linha, \# \- \> \| \1 para o texto não virar marca).
//
// Modos: "documento" (blocos), "linha" (um parágrafo só, uma ou mais linhas), "pontos" (uma linha por ponto-chave).
// Este arquivo não usa DOM nem React: serve ao editor, às telas (aluno e equipe) e ao servidor (PDF). Nunca gera HTML cru de entrada.

export type Modo = "documento" | "linha" | "pontos";
export type Marca = { type: "bold" | "italic" | "underline" } | { type: "link"; attrs: { href: string } };
export type NoTexto = { type: "text"; text: string; marks?: Marca[] };
export type NoQuebra = { type: "hardBreak" };
export type NoInline = NoTexto | NoQuebra;
export type NoParagrafo = { type: "paragraph"; content?: NoInline[] };
export type NoTitulo = { type: "heading"; attrs: { level: 2 | 3 }; content?: NoInline[] };
export type NoItem = { type: "listItem"; content: NoParagrafo[] };
export type NoLista = { type: "bulletList" | "orderedList"; attrs?: { start?: number }; content: NoItem[] };
export type NoCitacao = { type: "blockquote"; content: NoParagrafo[] };
export type NoCelula = { type: "tableCell" | "tableHeader"; content: NoParagrafo[] };
export type NoLinha = { type: "tableRow"; content: NoCelula[] };
export type NoTabela = { type: "table"; content: NoLinha[] };
export type NoBloco = NoParagrafo | NoTitulo | NoLista | NoCitacao | NoTabela;
export type Doc = { type: "doc"; content: NoBloco[] };

const ESC = new Set(["\\", "*", "[", "]", "(", "<"]);
const RE_BLOCO = /^(?:#{2,3} \S|- |\d{1,3}[.)] |>(?: |$)|\|)/;
const RE_TITULO = /^(#{2,3}) (\S.*)$/;
const RE_MARCADOR = /^- (.*)$/;
const RE_NUMERADO = /^(\d{1,3})[.)] (.*)$/;
const RE_CITACAO = /^>(?: (.*)|$)/;
const RE_DELIM = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const RE_HREF = /^https:\/\/[^\s()<>"\\]+$/i;

/** Só endereços https sem caracteres perigosos. Usado ao ler, ao escrever e ao desenhar. */
export const hrefValido = (href: unknown): href is string => typeof href === "string" && href.length <= 2000 && RE_HREF.test(href);

// ------------------------------------------------------------------------------------------------ leitura (texto → documento)

type Tok =
  | { k: "txt"; s: string }
  | { k: "nl" }
  | { k: "br" }
  | { k: "uo" }
  | { k: "uc" }
  | { k: "b" | "i"; o: boolean; c: boolean }
  | { k: "lk"; inner: string; href: string };
type OpcInline = { cell?: boolean; semLink?: boolean };

const naoBranco = (c: string | undefined) => c !== undefined && !/\s/.test(c);

function tentarLink(src: string, p: number): { inner: string; href: string; fim: number } | null {
  let q = p + 1;
  while (q < src.length) {
    const ch = src[q];
    if (ch === "\\") q += 2;
    else if (ch === "[") return null;
    else if (ch === "]") break;
    else q++;
  }
  if (q >= src.length || src[q + 1] !== "(") return null;
  const r = src.indexOf(")", q + 2);
  if (r < 0) return null;
  const href = src.slice(q + 2, r);
  const inner = src.slice(p + 1, q);
  if (!hrefValido(href) || !inner.trim()) return null;
  return { inner, href, fim: r + 1 };
}

function tokenizar(src: string, o: OpcInline): Tok[] {
  const out: Tok[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ k: "txt", s: buf });
    buf = "";
  };
  let p = 0;
  while (p < src.length) {
    const c = src[p];
    if (c === "\\") {
      const n = src[p + 1];
      if (n !== undefined && (ESC.has(n) || (o.cell && n === "|"))) {
        buf += n;
        p += 2;
      } else {
        buf += "\\";
        p++;
      }
    } else if (c === "\n") {
      flush();
      out.push({ k: "nl" });
      p++;
    } else if (c === "<" && src.startsWith("<u>", p)) {
      flush();
      out.push({ k: "uo" });
      p += 3;
    } else if (c === "<" && src.startsWith("</u>", p)) {
      flush();
      out.push({ k: "uc" });
      p += 4;
    } else if (c === "<" && o.cell && src.startsWith("<br>", p)) {
      flush();
      out.push({ k: "br" });
      p += 4;
    } else if (c === "[" && !o.semLink) {
      const l = tentarLink(src, p);
      if (l) {
        flush();
        out.push({ k: "lk", inner: l.inner, href: l.href });
        p = l.fim;
      } else {
        buf += c;
        p++;
      }
    } else if (c === "*") {
      let q = p;
      while (src[q] === "*") q++;
      const n = q - p;
      flush();
      const bs = Math.floor(n / 2);
      const total = bs + (n % 2);
      for (let j = 0; j < total; j++) {
        const k = j < bs ? "b" : "i";
        out.push({ k, o: j < total - 1 ? true : naoBranco(src[q]), c: j > 0 ? true : naoBranco(src[p - 1]) });
      }
      p = q;
    } else {
      buf += c;
      p++;
    }
  }
  flush();
  return out;
}

const ordemMarca: Record<string, number> = { link: 0, bold: 1, italic: 2, underline: 3 };
const mesmasMarcas = (a: Marca[] = [], b: Marca[] = []) => JSON.stringify(a) === JSON.stringify(b);

function juntar(nos: NoInline[]): NoInline[] {
  const out: NoInline[] = [];
  for (const n of nos) {
    const ult = out[out.length - 1];
    if (n.type === "text" && !n.text) continue;
    if (n.type === "text" && ult?.type === "text" && mesmasMarcas(ult.marks, n.marks)) ult.text += n.text;
    else out.push(n.type === "text" ? { ...n } : n);
  }
  return out;
}

export function lerInline(src: string, o: OpcInline = {}): NoInline[] {
  const toks = tokenizar(src, o);
  const real = new Set<number>();
  const aberto: Record<string, number | undefined> = {};
  const temConteudo = (a: number, b: number) => toks.slice(a + 1, b).some((t) => t.k === "txt" || t.k === "lk" || t.k === "nl" || t.k === "br");
  toks.forEach((t, idx) => {
    if (t.k === "b" || t.k === "i") {
      const a = aberto[t.k];
      if (a === undefined) {
        if (t.o) aberto[t.k] = idx;
      } else if (t.c && temConteudo(a, idx)) {
        real.add(a).add(idx);
        aberto[t.k] = undefined;
      }
    } else if (t.k === "uo") {
      if (aberto.u === undefined) aberto.u = idx;
    } else if (t.k === "uc" && aberto.u !== undefined && temConteudo(aberto.u, idx)) {
      real.add(aberto.u).add(idx);
      aberto.u = undefined;
    }
  });
  const f = { bold: false, italic: false, underline: false };
  const nos: NoInline[] = [];
  const marcas = (href?: string): Marca[] => {
    const m: Marca[] = [];
    if (href) m.push({ type: "link", attrs: { href } });
    if (f.bold) m.push({ type: "bold" });
    if (f.italic) m.push({ type: "italic" });
    if (f.underline) m.push({ type: "underline" });
    return m;
  };
  const texto = (s: string, href?: string) => {
    const m = marcas(href);
    nos.push(m.length ? { type: "text", text: s, marks: m } : { type: "text", text: s });
  };
  toks.forEach((t, idx) => {
    if (t.k === "txt") texto(t.s);
    else if (t.k === "nl" || t.k === "br") nos.push({ type: "hardBreak" });
    else if (t.k === "lk") {
      for (const n of lerInline(t.inner, { ...o, semLink: true })) {
        if (n.type !== "text") nos.push(n);
        else {
          const m = marcas(t.href);
          const proprias = (n.marks ?? []).filter((x) => !m.some((y) => y.type === x.type));
          nos.push({ type: "text", text: n.text, marks: [...m, ...proprias].sort((a, b) => ordemMarca[a.type] - ordemMarca[b.type]) });
        }
      }
    } else if (!real.has(idx)) texto(t.k === "b" ? "**" : t.k === "i" ? "*" : t.k === "uo" ? "<u>" : "</u>");
    else if (t.k === "b") f.bold = !f.bold;
    else if (t.k === "i") f.italic = !f.italic;
    else if (t.k === "uo") f.underline = true;
    else if (t.k === "uc") f.underline = false;
  });
  return juntar(nos);
}

const para = (s: string, o: OpcInline = {}): NoParagrafo => {
  const content = lerInline(s, o);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

function celulas(linha: string): string[] {
  let s = linha.trim();
  if (s.startsWith("|")) s = s.slice(1);
  const out: string[] = [];
  let atual = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      atual += s[i] + s[i + 1];
      i++;
    } else if (s[i] === "|") {
      out.push(atual);
      atual = "";
    } else atual += s[i];
  }
  if (atual.trim() !== "") out.push(atual);
  return out.map((c) => c.trim());
}

function lerBlocos(texto: string): NoBloco[] {
  const L = texto.replace(/\r\n?/g, "\n").split("\n");
  const blocos: NoBloco[] = [];
  let corrente: string[] = [];
  const fecha = () => {
    if (corrente.length) blocos.push(para(corrente.join("\n")));
    corrente = [];
  };
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    let m: RegExpExecArray | null;
    if (!l.trim()) {
      fecha();
      i++;
    } else if ((m = RE_TITULO.exec(l))) {
      fecha();
      const content = lerInline(m[2]);
      blocos.push({ type: "heading", attrs: { level: m[1].length as 2 | 3 }, content });
      i++;
    } else if (RE_MARCADOR.test(l) || RE_NUMERADO.test(l)) {
      fecha();
      const ordenada = !RE_MARCADOR.test(l);
      const re = ordenada ? RE_NUMERADO : RE_MARCADOR;
      const inicio = ordenada ? Number(RE_NUMERADO.exec(l)![1]) : 1;
      const itens: NoItem[] = [];
      while (i < L.length && (m = re.exec(L[i]))) {
        const partes = [ordenada ? m[2] : m[1]];
        i++;
        while (i < L.length && /^ {2,}\S/.test(L[i])) partes.push(L[i++].trim());
        const p = para(partes.join("\n"));
        if (p.content) itens.push({ type: "listItem", content: [p] });
      }
      if (itens.length) blocos.push(ordenada ? { type: "orderedList", attrs: { start: inicio }, content: itens } : { type: "bulletList", content: itens });
    } else if (RE_CITACAO.test(l)) {
      fecha();
      const paragrafos: NoParagrafo[] = [];
      let linhas: string[] = [];
      const fechaP = () => {
        if (linhas.length) paragrafos.push(para(linhas.join("\n")));
        linhas = [];
      };
      while (i < L.length && (m = RE_CITACAO.exec(L[i]))) {
        if (m[1] === undefined || !m[1].trim()) fechaP();
        else linhas.push(m[1]);
        i++;
      }
      fechaP();
      if (paragrafos.length) blocos.push({ type: "blockquote", content: paragrafos });
    } else if (l.startsWith("|") && i + 1 < L.length && RE_DELIM.test(L[i + 1]) && L[i + 1].includes("-")) {
      fecha();
      const linhas = [celulas(l)];
      i += 2;
      while (i < L.length && L[i].startsWith("|")) linhas.push(celulas(L[i++]));
      const cols = Math.max(...linhas.map((r) => r.length), 1);
      blocos.push({
        type: "table",
        content: linhas.map((r, ri) => ({
          type: "tableRow" as const,
          content: Array.from({ length: cols }, (_, ci) => ({ type: ri === 0 ? ("tableHeader" as const) : ("tableCell" as const), content: [para(r[ci] ?? "", { cell: true })] })),
        })),
      });
    } else {
      corrente.push(l.startsWith("\\") && RE_BLOCO.test(l.slice(1)) ? l.slice(1) : l);
      i++;
    }
  }
  fecha();
  return blocos;
}

const docVazio = (): Doc => ({ type: "doc", content: [{ type: "paragraph" }] });

/** Texto → documento (mesma forma do ProseMirror/TipTap). Nunca falha: o que não é marca vira texto. */
export function ler(texto: string | null | undefined, modo: Modo = "documento"): Doc {
  const s = String(texto ?? "").replace(/\r\n?/g, "\n");
  if (modo === "linha") return { type: "doc", content: [para(s)] };
  if (modo === "pontos") {
    const itens = s.split("\n").filter((x) => x.trim()).map((x): NoItem => ({ type: "listItem", content: [para(x)] }));
    return { type: "doc", content: [{ type: "bulletList", content: itens.length ? itens : [{ type: "listItem", content: [{ type: "paragraph" }] }] }] };
  }
  const blocos = lerBlocos(s);
  return blocos.length ? { type: "doc", content: blocos } : docVazio();
}

// ------------------------------------------------------------------------------------------------ escrita (documento → texto)

function esc(s: string, cell: boolean, link: boolean): string {
  let r = s.replace(/\\/g, "\\\\").replace(/\*/g, "\\*");
  if (link) r = r.replace(/[[\]]/g, "\\$&");
  else r = r.replace(/\]\(/g, "]\\(");
  r = r.replace(/<(?=\/?u>)/g, "\\<");
  if (cell) r = r.replace(/<(?=br>)/g, "\\<").replace(/\|/g, "\\|");
  return r;
}

type Flags = { b: boolean; i: boolean; u: boolean };
const flagsDe = (n: NoTexto): Flags => ({ b: !!n.marks?.some((m) => m.type === "bold"), i: !!n.marks?.some((m) => m.type === "italic"), u: !!n.marks?.some((m) => m.type === "underline") });
const abre = (f: Flags) => (f.b ? "**" : "") + (f.i ? "*" : "") + (f.u ? "<u>" : "");
const fecha = (f: Flags) => (f.u ? "</u>" : "") + (f.i ? "*" : "") + (f.b ? "**" : "");

function emitir(nos: NoTexto[], cell: boolean, link: boolean): string {
  let out = "";
  let ws = "";
  let cur: Flags = { b: false, i: false, u: false };
  for (const n of nos) {
    const F = flagsDe(n);
    for (const peca of n.text.replace(/\n/g, " ").split(/(\s+)/)) {
      if (!peca) continue;
      if (/^\s+$/.test(peca)) {
        ws += peca;
        continue;
      }
      out += fecha({ b: cur.b && !F.b, i: cur.i && !F.i, u: cur.u && !F.u }) + ws + abre({ b: F.b && !cur.b, i: F.i && !cur.i, u: F.u && !cur.u }) + esc(peca, cell, link);
      ws = "";
      cur = F;
    }
  }
  return out + fecha(cur) + ws;
}

const codificar = (href: string) => href.replace(/[\s()<>"\\]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));

function linhaParaTexto(nos: NoTexto[], cell: boolean): string {
  let out = "";
  let i = 0;
  while (i < nos.length) {
    const href = nos[i].marks?.find((m) => m.type === "link")?.attrs.href;
    let j = i;
    while (j < nos.length && nos[j].marks?.find((m) => m.type === "link")?.attrs.href === href) j++;
    const grupo = nos.slice(i, j);
    if (href && hrefValido(href)) {
      const inner = emitir(grupo, cell, true);
      const lead = /^\s*/.exec(inner)![0];
      const trail = /\s*$/.exec(inner)![0];
      const core = inner.slice(lead.length, inner.length - trail.length);
      out += core ? `${lead}[${core}](${codificar(href)})${trail}` : inner;
    } else out += emitir(grupo, cell, false);
    i = j;
  }
  return out;
}

/** Divide o conteúdo da linha nas quebras e devolve cada linha já escrita. */
function linhas(content: NoInline[] | undefined, cell = false): string[] {
  const out: NoTexto[][] = [[]];
  for (const n of juntar(content ?? [])) {
    if (n.type === "hardBreak") out.push([]);
    else out[out.length - 1].push(n);
  }
  return out.map((l) => linhaParaTexto(l, cell));
}

const vazio = (ls: string[]) => !ls.join("").trim();

function blocoParaTexto(b: NoBloco, primeiro = false): string | null {
  switch (b.type) {
    case "paragraph": {
      const ls = linhas(b.content);
      if (primeiro && ls.length) ls[0] = ls[0].trimStart(); // o texto todo é aparado: a marca de bloco é conferida já sem o espaço da frente
      return vazio(ls) ? null : ls.map((l) => (RE_BLOCO.test(l) ? "\\" + l : l)).join("\n");
    }
    case "heading": {
      const t = linhas(b.content).join(" ").trim();
      return t ? `${"#".repeat(b.attrs?.level === 3 ? 3 : 2)} ${t}` : null;
    }
    case "bulletList":
    case "orderedList": {
      const ord = b.type === "orderedList";
      let n = b.attrs?.start && b.attrs.start > 0 ? b.attrs.start : 1;
      const out: string[] = [];
      for (const it of b.content) {
        const ls = it.content.flatMap((p) => linhas(p.content));
        if (vazio(ls)) continue;
        const marca = ord ? `${n++}. ` : "- ";
        out.push(marca + ls[0] + ls.slice(1).map((l) => "\n" + " ".repeat(marca.length) + l).join(""));
      }
      return out.length ? out.join("\n") : null;
    }
    case "blockquote": {
      const ps = b.content.map((p) => linhas(p.content)).filter((ls) => !vazio(ls));
      return ps.length ? ps.map((ls) => ls.map((l) => (l ? "> " + l : ">")).join("\n")).join("\n>\n") : null;
    }
    case "table": {
      const rows = b.content.map((r) => r.content.map((c) => c.content.map((p) => linhas(p.content, true).join("<br>")).filter((x) => x.trim()).join("<br>").trim()));
      const cols = Math.max(...rows.map((r) => r.length), 0);
      if (!cols || !rows.some((r) => r.some(Boolean))) return null;
      const fmt = (r: string[]) => "| " + Array.from({ length: cols }, (_, i) => r[i] ?? "").join(" | ") + " |";
      return [fmt(rows[0]), "| " + Array(cols).fill("---").join(" | ") + " |", ...rows.slice(1).map(fmt)].join("\n");
    }
    default:
      return null;
  }
}

/** Documento → texto com marcas. Parágrafos vazios e bordas em branco não são guardados. */
export function escrever(doc: Doc | null | undefined, modo: Modo = "documento"): string {
  const blocos = (doc?.content ?? []) as NoBloco[];
  if (modo === "linha") {
    const ps = blocos.flatMap((b) => (b.type === "paragraph" ? [b] : []));
    return ps.map((p) => linhas(p.content).join("\n")).filter((x) => x.trim()).join(" ").trim();
  }
  if (modo === "pontos") {
    const itens = blocos.flatMap((b) => (b.type === "bulletList" || b.type === "orderedList" ? b.content.flatMap((it) => it.content) : b.type === "paragraph" ? [b] : []));
    return itens.map((p) => linhas(p.content).join(" ").trim()).filter(Boolean).join("\n");
  }
  return blocos.map((b, i) => blocoParaTexto(b, i === 0)).filter((x): x is string => x !== null).join("\n\n").trim();
}

/** Texto já na forma que o editor grava (lido e escrito de novo). */
export const canonico = (texto: string | null | undefined, modo: Modo = "documento") => escrever(ler(texto, modo), modo);

// ------------------------------------------------------------------------------------------------ editor → forma aceita

const MARCAS_SIMPLES = new Set(["bold", "italic", "underline"]);

function normInline(nos: any): NoInline[] {
  const out: NoInline[] = [];
  for (const n of Array.isArray(nos) ? nos : []) {
    if (n?.type === "hardBreak") out.push({ type: "hardBreak" });
    else if (n?.type === "text" && typeof n.text === "string" && n.text) {
      const marks: Marca[] = [];
      for (const m of Array.isArray(n.marks) ? n.marks : []) {
        if (MARCAS_SIMPLES.has(m?.type)) marks.push({ type: m.type });
        else if (m?.type === "link" && hrefValido(m.attrs?.href)) marks.push({ type: "link", attrs: { href: m.attrs.href } });
      }
      out.push(marks.length ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
    }
  }
  return out;
}

const filhos = (n: any): any[] => (Array.isArray(n?.content) ? n.content : []);
const paraDe = (n: any): NoParagrafo => {
  const c = normInline(n?.content);
  return c.length ? { type: "paragraph", content: c } : { type: "paragraph" };
};

/** Qualquer bloco vira só parágrafos (para dentro de item de lista, citação e célula). */
function paragrafosDe(n: any): NoParagrafo[] {
  if (n?.type === "paragraph" || n?.type === "heading") return [paraDe(n)];
  return filhos(n).flatMap(paragrafosDe);
}

/** Itens de lista; listas dentro de listas sobem para o mesmo nível (o formato guardado não tem lista dentro de lista). */
function itensDe(lista: any): NoItem[] {
  const out: NoItem[] = [];
  for (const it of filhos(lista)) {
    const proprios: NoParagrafo[] = [];
    const dentro: NoItem[] = [];
    for (const c of filhos(it)) {
      if (c?.type === "bulletList" || c?.type === "orderedList") dentro.push(...itensDe(c));
      else proprios.push(...paragrafosDe(c));
    }
    out.push({ type: "listItem", content: proprios.length ? proprios : [{ type: "paragraph" }] }, ...dentro);
  }
  return out;
}

function normBloco(n: any): NoBloco[] {
  switch (n?.type) {
    case "paragraph":
      return [paraDe(n)];
    case "heading": {
      const c = normInline(n.content);
      const level: 2 | 3 = Number(n.attrs?.level) >= 3 ? 3 : 2;
      return [c.length ? { type: "heading", attrs: { level }, content: c } : { type: "heading", attrs: { level } }];
    }
    case "bulletList":
      return [{ type: "bulletList", content: itensDe(n) }];
    case "orderedList": {
      const start = Number(n.attrs?.start);
      return [{ type: "orderedList", ...(start > 1 ? { attrs: { start } } : {}), content: itensDe(n) }];
    }
    case "blockquote":
      return [{ type: "blockquote", content: filhos(n).flatMap(paragrafosDe) }];
    case "table":
      return [
        {
          type: "table",
          content: filhos(n).map((r): NoLinha => ({
            type: "tableRow",
            content: filhos(r).map((c): NoCelula => ({ type: c?.type === "tableHeader" ? "tableHeader" : "tableCell", content: paragrafosDe(c) })),
          })),
        },
      ];
    default:
      return paragrafosDe(n);
  }
}

/** Documento vindo do editor (TipTap) → só os nós e marcas que este formato guarda. Nada de atributo extra, nada de lista aninhada. */
export function normalizar(doc: any): Doc {
  const content = filhos(doc).flatMap(normBloco);
  return content.length ? { type: "doc", content } : docVazio();
}

/** Atalho do editor: documento do TipTap → texto com marcas. */
export const doEditor = (doc: any, modo: Modo = "documento") => escrever(normalizar(doc), modo);

// ------------------------------------------------------------------------------------------------ consultas

const nosInline = (b: NoBloco): NoInline[] => {
  if (b.type === "paragraph" || b.type === "heading") return b.content ?? [];
  return [];
};

/** true quando o texto só tem parágrafos e quebras de linha, sem nenhuma marca (é o texto antigo, sem formatação). */
export function ehSimples(texto: string | null | undefined, modo: Modo = "documento"): boolean {
  const s = String(texto ?? "");
  if (!/[*\\<\[#>|\-\d]/.test(s)) return true; // atalho: sem nenhum caractere que possa ser marca
  const d = ler(s, modo);
  return d.content.every((b) => b.type === "paragraph" && nosInline(b).every((n) => n.type === "hardBreak" || !n.marks?.length)) && !s.includes("\\");
}

/** Texto sem nenhuma marca (para conferir palavras, comparar com o PDF, detectar caixas). */
export function textoPuro(texto: string | null | undefined, modo: Modo = "linha"): string {
  if (!/[*\\<\[#>|\-\d]/.test(String(texto ?? ""))) return String(texto ?? "");
  const inline = (c?: NoInline[]) => (c ?? []).map((n) => (n.type === "text" ? n.text : "\n")).join("");
  return ler(texto, modo)
    .content.map((b) => {
      if (b.type === "paragraph" || b.type === "heading") return inline(b.content);
      if (b.type === "bulletList" || b.type === "orderedList") return b.content.map((it, k) => (modo === "pontos" ? "" : b.type === "bulletList" ? "- " : `${(b.attrs?.start ?? 1) + k}. `) + it.content.map((p) => inline(p.content)).join(" ")).join("\n");
      if (b.type === "blockquote") return b.content.map((p) => inline(p.content)).join("\n");
      return (b as NoTabela).content.map((r) => r.content.map((c) => c.content.map((p) => inline(p.content)).join(" ")).join(" | ")).join("\n");
    })
    .join(modo === "pontos" ? "\n" : "\n\n");
}

// ------------------------------------------------------------------------------------------------ HTML seguro (servidor / PDF)

const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inlineParaHtml(nos: NoInline[]): string {
  return juntar(nos)
    .map((n) => {
      if (n.type === "hardBreak") return "<br>";
      let s = h(n.text);
      const m = n.marks ?? [];
      if (m.some((x) => x.type === "italic")) s = `<em>${s}</em>`;
      if (m.some((x) => x.type === "bold")) s = `<strong>${s}</strong>`;
      if (m.some((x) => x.type === "underline")) s = `<u>${s}</u>`;
      const lk = m.find((x) => x.type === "link");
      if (lk && lk.type === "link" && hrefValido(lk.attrs.href)) s = `<a href="${h(lk.attrs.href)}" rel="noopener noreferrer nofollow">${s}</a>`;
      return s;
    })
    .join("");
}

/** Uma linha (parágrafo da unidade) → HTML escapado, só com <strong>, <em>, <u>, <a> e <br>. Texto simples sai igual ao texto escapado. */
export function htmlInline(texto: string | null | undefined): string {
  const s = String(texto ?? "");
  if (!/[*\\<\[]/.test(s)) return h(s);
  return ler(s, "linha").content.map((b) => inlineParaHtml(nosInline(b))).join("");
}
