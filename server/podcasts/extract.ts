/**
 * FONTES DO PODCAST: tira o texto de PDF (por página), DOCX, texto colado ou link e divide em TRECHOS com a origem (documento e
 * página). Os trechos são o que a IA pode usar no roteiro, e cada fala aponta para os trechos dela: a equipe confere na revisão.
 *
 * Roda no próprio servidor (também na Vercel): PDF com unpdf (pdf.js sem dependências nativas), DOCX com mammoth. Não faz OCR:
 * PDF escaneado (só imagem) volta sem texto e a tela avisa — para esses, a Central de Conteúdo (PyMuPDF + Tesseract) é o caminho.
 * Links: só https, sem endereço interno (bloqueio de rede privada), até 8 MB, no máximo 3 redirecionamentos.
 */
import dns from "dns/promises";
import net from "net";

export interface ExtractedPage {
  /** Página de origem (PDF); nula quando o formato não tem página (DOCX, texto, página web). */
  page: number | null;
  text: string;
}

export interface Chunk {
  page: number | null;
  text: string;
}

export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_LINK_BYTES = 8 * 1024 * 1024;
export const MAX_CHUNKS_PER_SOURCE = 600;

const clean = (t: string) =>
  t
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
export const isZip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b; // DOCX é um zip

/** PDF → texto por página (sem OCR). */
export async function extractPdf(buf: Buffer): Promise<ExtractedPage[]> {
  if (!isPdf(buf)) throw new Error("O arquivo não é um PDF.");
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  return pages.map((t, i) => ({ page: i + 1, text: clean(String(t ?? "")) }));
}

/** DOCX → texto (sem páginas). */
export async function extractDocx(buf: Buffer): Promise<ExtractedPage[]> {
  if (!isZip(buf)) throw new Error("O arquivo não é um DOCX.");
  const mammoth = (await import("mammoth")) as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }>; default?: { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> } };
  const fn = mammoth.extractRawText ?? mammoth.default?.extractRawText;
  const { value } = await fn!({ buffer: buf });
  return [{ page: null, text: clean(value ?? "") }];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", ordm: "º", ordf: "ª", deg: "°" };

/** HTML → texto legível (sem scripts, estilos, menus e rodapés). */
export function htmlToText(html: string): { title: string | null; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() || null;
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|title|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br|table|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  return { title: title ? htmlToText(title).text || title : null, text: clean(body) };
}

/** Endereço da rede interna (bloqueado para links: ninguém faz o servidor buscar coisas de dentro da infraestrutura). */
export function privateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

async function assertPublicHost(host: string) {
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("Endereço interno não é aceito.");
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((x) => x.address);
  if (!ips.length || ips.some(privateAddress)) throw new Error("Endereço interno não é aceito.");
}

export interface FetchedLink {
  title: string | null;
  pages: ExtractedPage[];
  kind: "pdf" | "html";
}

/** Busca um link (https), seguindo no máximo 3 redirecionamentos e conferindo cada destino. PDF ou página web. */
export async function fetchLink(url: string, fetchImpl: typeof fetch = fetch, checkHost: (h: string) => Promise<void> = assertPublicHost): Promise<FetchedLink> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:") throw new Error("Só links https são aceitos.");
    await checkHost(u.hostname);
    const res = await fetchImpl(current, { redirect: "manual", headers: { "User-Agent": "StaziaMed-Podcast/1.0 (+https://staziamed-revalida.vercel.app)", Accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(20_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("O link redireciona para lugar nenhum.");
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`O link respondeu ${res.status}.`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_LINK_BYTES) throw new Error("O conteúdo do link passa de 8 MB.");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_LINK_BYTES) throw new Error("O conteúdo do link passa de 8 MB.");
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type.includes("pdf") || isPdf(buf)) return { title: decodeURIComponent(u.pathname.split("/").pop() || u.hostname), pages: await extractPdf(buf), kind: "pdf" };
    if (!type.includes("html") && !type.includes("text")) throw new Error("O link não é uma página nem um PDF.");
    const { title, text } = htmlToText(buf.toString("utf8"));
    return { title: title ?? u.hostname, pages: [{ page: null, text }], kind: "html" };
  }
  throw new Error("O link redireciona demais.");
}

/**
 * Páginas → trechos de até `max` caracteres, cortando em parágrafo e, se preciso, em fim de frase. Cada trecho guarda a página.
 * Trechos muito curtos (cabeçalho, número de página) saem.
 */
export function chunkPages(pages: ExtractedPage[], max = 1200, min = 40): Chunk[] {
  const out: Chunk[] = [];
  for (const p of pages) {
    const paras = p.text.split(/\n{2,}|\n(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9•\-–])/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    let buf = "";
    const flush = () => {
      const t = buf.trim();
      if (t.length >= min) out.push({ page: p.page, text: t });
      buf = "";
    };
    for (const para of paras) {
      if (para.length > max) {
        flush();
        let rest = para;
        while (rest.length > max) {
          const slice = rest.slice(0, max);
          const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
          const at = cut > max * 0.5 ? cut + 1 : max;
          out.push({ page: p.page, text: rest.slice(0, at).trim() });
          rest = rest.slice(at).trim();
        }
        buf = rest;
        continue;
      }
      if ((buf + " " + para).trim().length > max) flush();
      buf = `${buf} ${para}`.trim();
    }
    flush();
  }
  return out.slice(0, MAX_CHUNKS_PER_SOURCE);
}
