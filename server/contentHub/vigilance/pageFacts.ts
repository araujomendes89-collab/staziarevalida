/**
 * Vigilância científica (sem IA): o que o vigia lê de uma publicação oficial.
 *
 *   - texto COMPARÁVEL de uma página: só o conteúdo principal (<main>, senão <article>, senão <body>), sem menus, cabeçalho,
 *     rodapé e sem a data da PRÓPRIA página ("Publicado em 26/03/2025 16h00 Atualizado em 20/07/2026 12h34" do gov.br): a página
 *     não "muda" só porque alguém salvou de novo. Datas do conteúdo ("anexo alterado em 05/05/2026") continuam valendo.
 *   - FATOS da página ou do PDF: links de documentos, atos normativos (portarias, resoluções...), datas e avisos ("anexo
 *     alterado", "retificação", "republicação", "revoga"). Entre duas leituras, o que é novo vira VERSÃO CANDIDATA.
 *
 * Tudo o que vem da internet é DADO: nada aqui interpreta o texto como ordem, nada é seguido nem baixado de novo; cada campo é
 * cortado e limpo (sem caracteres de controle nem marcas invisíveis de direção do texto).
 */
import crypto from "crypto";

export interface PageLink {
  url: string;
  text: string;
}
export interface PageFacts {
  links: PageLink[];
  acts: string[];
  dates: string[];
  flags: string[];
}
export interface VersionCandidate {
  url: string | null;
  titulo: string | null;
  data: string | null;
  ato: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", ordm: "º", ordf: "ª", deg: "°" };
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g;

export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Texto curto e limpo para guardar (sem controle nem marcas invisíveis, espaços normais, cortado). */
export function cleanField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return v || null;
}

/** O pedaço principal da página (o conteúdo do órgão, sem a moldura do portal). */
export function mainHtml(html: string): string {
  const pick = (tag: string) => {
    const open = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(html);
    if (!open) return null;
    const close = html.toLowerCase().lastIndexOf(`</${tag}>`);
    return close > open.index ? html.slice(open.index + open[0].length, close) : null;
  };
  return pick("main") ?? pick("article") ?? pick("body") ?? html;
}

const MONTHS: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};
const DATE_NUM = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const DATE_EXT = /\b(\d{1,2})(?:º|°)?\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\b/gi;

function iso(d: string, m: string, y: string): string | null {
  const dd = Number(d), mm = Number(m), yy = Number(y);
  if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy >= 1950 && yy <= 2100)) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Datas do texto em AAAA-MM-DD (dd/mm/aaaa e "7 de outubro de 2025"), na ordem em que aparecem, sem repetir. */
export function datesOf(text: string): string[] {
  const out: { at: number; v: string }[] = [];
  for (const m of text.matchAll(DATE_NUM)) {
    const v = iso(m[1], m[2], m[3]);
    if (v) out.push({ at: m.index ?? 0, v });
  }
  for (const m of text.matchAll(DATE_EXT)) {
    const v = iso(m[1], MONTHS[m[2].toLowerCase()] ?? "0", m[3]);
    if (v) out.push({ at: m.index ?? 0, v });
  }
  return [...new Set(out.sort((a, b) => a.at - b.at).map((x) => x.v))];
}

// "Portaria Conjunta SAES/SECTICS nº 10, de 13/09/2024", "Portaria SECTICS/MS nº 83, de 7 de outubro de 2025", "PORTARIA CONJUNTA SAES/SECTICS Nº 13 , DE 29 DE JULHO DE 2025"
const ACT = new RegExp(
  "\\b(Portaria(?:\\s+Conjunta)?|Resolu[cç][aã]o(?:\\s+da\\s+Diretoria\\s+Colegiada)?|RDC|Instru[cç][aã]o\\s+Normativa|Nota\\s+T[eé]cnica(?:\\s+Conjunta)?|Lei|Decreto|Medida\\s+Provis[oó]ria)" +
    "(?:\\s+(?:[A-Z]{2,}(?:\\s*/\\s*[A-Z]{2,})*))?\\s+n(?:[º°o.]|\\.?º)?\\s*([\\d.]+(?:/\\d{2,4})?)(?:\\s*[-/]?\\s*[A-Z]{2,}(?:/[A-Z]{2,})*)?" +
    "(?:\\s*,\\s*de\\s+(\\d{1,2}(?:º|°)?\\s+de\\s+[a-zç]+\\s+de\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{4}))?",
  "gi"
);

/** Atos normativos do texto, com número e (se houver) data, escritos de um jeito só para comparar. */
export function actsOf(text: string): { act: string; at: number; date: string | null }[] {
  const out: { act: string; at: number; date: string | null }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(ACT)) {
    const raw = m[0].replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ act: raw.slice(0, 200), at: m.index ?? 0, date: m[3] ? (datesOf(m[3])[0] ?? null) : null });
  }
  return out;
}

const FLAG = /\b(anexo\s+(?:alterado|atualizado|retificado)|retifica[cç][aã]o|republica[cç][aã]o|republicad[oa]|revoga(?:da|do)?|consulta\s+p[uú]blica)\b[^.\n]{0,80}/gi;
/** Avisos de alteração, com a data que vier logo depois ("anexo alterado em 11/11/2024"). */
export function flagsOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(FLAG)) out.add(m[0].replace(/\s+/g, " ").trim().slice(0, 120).toLowerCase());
  return [...out];
}

/** A data da PRÓPRIA página ("Publicado em ... Atualizado em ...", "Última atualização: ..."): sai antes de comparar. */
export function stripPageDates(text: string): string {
  return text.replace(
    /\b(Publicad[oa] em|Atualizad[oa] em|[UÚ]ltima atualiza[cç][aã]o(?: em)?|[UÚ]ltima modifica[cç][aã]o(?: em)?|Data da [uú]ltima atualiza[cç][aã]o|Modificado em)\s*:?\s*\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*(?:às|as|,)?\s*\d{1,2}(?:h|:)\d{2}(?:min)?)?/gi,
    " "
  );
}

/** Texto visível de um pedaço de HTML, com quebras nos blocos. */
export function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|template|button)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|table|ul|ol|dd|dt)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(INVISIBLE, " ")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Texto que o vigia compara numa página: conteúdo principal, sem a data da página, espaços normalizados, NFC. */
export function comparablePageText(html: string): string {
  return stripPageDates(htmlText(mainHtml(html))).normalize("NFC").replace(/\s+/g, " ").trim();
}

export const sha256 = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");

/** Texto de PDF normalizado (para "bytes diferentes, mesmo texto" não virar mudança). */
export function comparablePdfText(pages: string[]): string {
  return pages.join("\n").normalize("NFC").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
}

const DOC_LINK = /\.pdf(?:$|[?#/])|\/@@download\/|\/@@display-file\/|\.docx?(?:$|[?#])|\/arquivos?\//i;

/** Links de documento da página (absolutos, só https), com o texto do link e o título que vem antes quando o texto é curto. */
export function documentLinks(html: string, baseUrl: string): PageLink[] {
  const main = mainHtml(html);
  const out: PageLink[] = [];
  const seen = new Set<string>();
  let heading = "";
  const re = /<(h[1-6]|strong|b)\b[^>]*>([\s\S]*?)<\/\1>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of main.matchAll(re)) {
    if (m[1]) {
      const h = cleanField(htmlText(m[2]), 150);
      if (h) heading = h;
      continue;
    }
    const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3] ?? "");
    const raw = decodeEntities(href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
    if (!raw || /^(javascript|mailto|tel|data):/i.test(raw)) continue;
    let url: string;
    try {
      url = new URL(raw, baseUrl).href.split("#")[0];
    } catch {
      continue;
    }
    if (!url.startsWith("https://") || !DOC_LINK.test(url) || seen.has(url)) continue;
    seen.add(url);
    const text = cleanField(htmlText(m[4] ?? ""), 200) ?? "";
    out.push({ url: url.slice(0, 2000), text: text.length < 25 && heading ? `${heading} — ${text}`.slice(0, 250) : text });
    if (out.length >= 300) break;
  }
  return out;
}

/** Fatos de uma página HTML. */
export function pageFacts(html: string, baseUrl: string): PageFacts {
  const text = stripPageDates(htmlText(mainHtml(html)));
  return {
    links: documentLinks(html, baseUrl),
    acts: actsOf(text).map((a) => a.act).slice(0, 100),
    dates: datesOf(text).slice(0, 100),
    flags: flagsOf(text).slice(0, 50),
  };
}

/** Fatos das primeiras páginas de um PDF (capa, portaria). */
export function pdfFacts(pages: string[]): PageFacts {
  const text = stripPageDates(pages.slice(0, 3).join("\n"));
  return { links: [], acts: actsOf(text).map((a) => a.act).slice(0, 100), dates: datesOf(text).slice(0, 100), flags: flagsOf(text).slice(0, 50) };
}

/** Ato normativo e data que aparecem num texto curto (o texto do link). */
function actAndDate(text: string): { ato: string | null; data: string | null } {
  const a = actsOf(text)[0];
  return { ato: a?.act ?? null, data: a?.date ?? datesOf(text)[0] ?? null };
}

/**
 * Versões candidatas: o que existe na leitura nova e não existia na anterior. Sem leitura anterior (primeira vez), nada.
 * Links de documento novos primeiro, depois atos novos (sem link) e avisos novos ("anexo alterado em ..."). No máximo 20.
 */
export function versionCandidates(prev: PageFacts | null | undefined, next: PageFacts): VersionCandidate[] {
  if (!prev) return [];
  const out: VersionCandidate[] = [];
  const oldLinks = new Set((prev.links ?? []).map((l) => l.url));
  const used = new Set<string>();
  for (const l of next.links) {
    if (oldLinks.has(l.url)) continue;
    const { ato, data } = actAndDate(l.text);
    if (ato) used.add(ato.toLowerCase());
    out.push({ url: l.url, titulo: cleanField(l.text, 300), data, ato });
  }
  const oldActs = new Set((prev.acts ?? []).map((a) => a.toLowerCase()));
  for (const a of next.acts) {
    if (oldActs.has(a.toLowerCase()) || used.has(a.toLowerCase())) continue;
    out.push({ url: null, titulo: null, data: actsOf(a)[0]?.date ?? null, ato: a });
  }
  const oldFlags = new Set(prev.flags ?? []);
  for (const f of next.flags) {
    if (oldFlags.has(f)) continue;
    out.push({ url: null, titulo: cleanField(f.charAt(0).toUpperCase() + f.slice(1), 300), data: datesOf(f)[0] ?? null, ato: null });
  }
  return out.slice(0, 20);
}

/** Um item de página-índice oficial (lista de notas, PCDT, publicações): link, título, descrição e data, quando houver. */
export interface IndexItem {
  url: string;
  titulo: string;
  descricao: string | null;
  data: string | null;
}

const unescapeJson = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\"/g, '"').replace(/\\\\/g, "\\");

/**
 * Itens de uma página-índice oficial, entre execuções do vigia. Lê os dois jeitos do gov.br: links no HTML (Plone clássico) e a
 * lista que o portal novo (Volto) traz embutida em JSON ("@id", "title", "description", "effective"), que o navegador desenha
 * depois. Só itens dentro do caminho da própria página ou documentos (PDF etc.). No máximo 500. Tudo é dado.
 */
export function indexItems(html: string, pageUrl: string): IndexItem[] {
  const out = new Map<string, IndexItem>();
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const prefix = base.origin + base.pathname.replace(/\/+$/, "") + "/";
  const keep = (url: string) => url.startsWith("https://") && (url.startsWith(prefix) || DOC_LINK.test(url));
  // 1. JSON embutido do portal (cada objeto com "@id" e "title")
  const decoded = html.includes("\\u002F") ? unescapeJson(html) : html;
  const re = /\{"@id":"(https:\/\/[^"]+)","@type":"([A-Za-z ]+)"([\s\S]*?)(?=\{"@id":|\]\s*,\s*"items_total"|$)/g;
  for (const m of decoded.matchAll(re)) {
    const body = m[3].slice(0, 4000);
    const url = m[1].split("#")[0];
    const title = /"title":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1];
    if (!title || !keep(url) || /^(Folder|Image)$/.test(m[2]) && !url.startsWith(prefix)) continue;
    const desc = /"description":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1] ?? null;
    const eff = /"effective":"(\d{4}-\d{2}-\d{2})/.exec(body)?.[1] ?? null;
    const t = cleanField(title, 300);
    if (!t) continue;
    out.set(url, { url: url.slice(0, 2000), titulo: t, descricao: cleanField(desc, 500), data: eff && eff > "1971" ? eff : (datesOf(`${t} ${desc ?? ""}`)[0] ?? null) });
    if (out.size >= 500) break;
  }
  // 2. links do HTML (conteúdo principal)
  for (const l of documentLinks(html, pageUrl)) {
    if (out.has(l.url) || !keep(l.url) || !l.text) continue;
    out.set(l.url, { url: l.url, titulo: l.text, descricao: null, data: datesOf(l.text)[0] ?? null });
  }
  const main = mainHtml(html);
  for (const m of main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (out.size >= 500) break;
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(m[1])?.[1];
    if (!href) continue;
    let url: string;
    try {
      url = new URL(decodeEntities(href), pageUrl).href.split("#")[0];
    } catch {
      continue;
    }
    const text = cleanField(htmlText(m[2]), 300);
    if (!text || text.length < 8 || out.has(url) || !url.startsWith(prefix)) continue;
    out.set(url, { url, titulo: text, descricao: null, data: datesOf(text)[0] ?? null });
  }
  return [...out.values()];
}

/** Texto sem acento e em minúsculas (para casar palavra-chave do tema). */
export const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palavras-chave do tema que aparecem no item (título + descrição). Palavra curta (até 4 letras) só casa inteira. */
export function matchKeywords(item: Pick<IndexItem, "titulo" | "descricao">, keywords: string[]): string[] {
  const text = ` ${fold(`${item.titulo} ${item.descricao ?? ""}`).replace(/[^a-z0-9]+/g, " ")} `;
  return keywords.filter((k) => {
    const kk = fold(k).replace(/[^a-z0-9]+/g, " ").trim();
    if (!kk) return false;
    return kk.length <= 4 ? text.includes(` ${kk} `) : text.includes(kk);
  });
}
