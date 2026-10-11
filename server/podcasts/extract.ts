/**
 * FONTES DO PODCAST: tira o texto de PDF (por página), DOCX, texto colado ou link e divide em TRECHOS com a origem (documento e
 * página). Os trechos são o que a IA pode usar no roteiro, e cada fala aponta para os trechos dela: a equipe confere na revisão.
 *
 * Roda no próprio servidor (também na Vercel): PDF com unpdf (pdf.js sem dependências nativas), DOCX com mammoth. Não faz OCR:
 * PDF escaneado (só imagem) volta sem texto e a tela avisa — para esses, a Central de Conteúdo (PyMuPDF + Tesseract) é o caminho.
 * Links: só https, sem endereço interno (bloqueio de rede privada), até 8 MB, no máximo 3 redirecionamentos.
 */
import dns from "dns/promises";
import https from "https";
import net from "net";
import { Readable } from "stream";

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

export class TooBigError extends Error {
  constructor(readonly bytes: number) {
    super("Arquivo grande demais.");
  }
}

/**
 * Lê um arquivo do depósito SEM passar de `max` bytes, sem confiar no tamanho informado por quem enviou. Com endereço assinado
 * (Supabase), baixa em pedaços e para ao passar do limite (ou pelo Content-Length); sem ele (desenvolvimento), lê o arquivo e confere.
 * Passou do limite: TooBigError (com o tamanho conhecido até ali).
 */
export async function readLimited(storage: { get(key: string): Promise<Buffer>; signedUrl?(key: string, seconds: number): Promise<string> }, key: string, max: number, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  if (!storage.signedUrl) {
    const buf = await storage.get(key);
    if (buf.length > max) throw new TooBigError(buf.length);
    return buf;
  }
  const res = await fetchImpl(await storage.signedUrl(key, 120));
  if (!res.ok) throw new Error(`Arquivo não encontrado (${res.status}).`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => {});
    throw new TooBigError(declared);
  }
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) throw new TooBigError(buf.length);
    return buf;
  }
  const reader = res.body.getReader();
  const parts: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new TooBigError(total);
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

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

/** IPv4 interno, reservado, de teste ou de multicast (nada da infraestrutura nem da rede local). */
function privateV4(a: number, b: number, c: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** IPv6 (qualquer grafia: comprimida, com IPv4 no fim, com zona) → 16 bytes, ou nulo se não for um IPv6 válido. */
function ipv6Bytes(ip: string): number[] | null {
  let v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = v.indexOf("%");
  if (zone >= 0) v = v.slice(0, zone);
  if (!net.isIPv6(v)) return null;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (dotted) {
    const q = dotted[1].split(".").map(Number);
    v = v.slice(0, v.length - dotted[1].length) + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16);
  }
  const [head, tail] = v.split("::");
  const left = head ? head.split(":") : [];
  const right = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8) return null;
  return groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [(n >> 8) & 255, n & 255];
  });
}

/**
 * Endereço da rede interna (bloqueado para links: ninguém faz o servidor buscar coisas de dentro da infraestrutura). IPv6 que
 * carrega um IPv4 (mapeado ::ffff:a.b.c.d ou ::ffff:a9fe:a9fe, compatível ::a.b.c.d, NAT64 64:ff9b::/96, 6to4 2002::/16) vale
 * pela mesma regra do IPv4 embutido; ::1, ::, fc00::/7, fe80::/10, fec0::/10 e multicast ff00::/8 são sempre internos.
 */
export function privateAddress(ip: string): boolean {
  const raw = ip.replace(/^\[|\]$/g, "");
  if (net.isIPv4(raw)) {
    const [a, b, c] = raw.split(".").map(Number);
    return privateV4(a, b, c);
  }
  const x = ipv6Bytes(raw);
  if (!x) return true; // não é um endereço que dê para conferir: não passa
  const first96Zero = x.slice(0, 12).every((n) => n === 0);
  const embedded = (at: number) => privateV4(x[at], x[at + 1], x[at + 2]);
  if (first96Zero) return embedded(12); // ::, ::1 (0.0.0.x) e IPv4-compatível
  if (x.slice(0, 10).every((n) => n === 0) && x[10] === 255 && x[11] === 255) return embedded(12); // ::ffff:0:0/96 (mapeado)
  if (x.slice(0, 8).every((n) => n === 0) && x[8] === 255 && x[9] === 255 && x[10] === 0 && x[11] === 0) return embedded(12); // ::ffff:0:0:0/96 (SIIT)
  if (x[0] === 0 && x[1] === 0x64 && x[2] === 0xff && x[3] === 0x9b) {
    if (x.slice(4, 12).every((n) => n === 0)) return embedded(12); // 64:ff9b::/96 (NAT64)
    return x[4] === 0 && x[5] === 1; // 64:ff9b:1::/48 (uso local)
  }
  if (x[0] === 0x20 && x[1] === 0x02) return embedded(2); // 2002::/16 (6to4): o IPv4 vem nos bytes 2 a 5
  if (x[0] === 0x20 && x[1] === 0x01 && x[2] === 0 && x[3] === 0) return true; // 2001::/32 (Teredo)
  if (x[0] === 0x01 && x.slice(1, 8).every((n) => n === 0)) return true; // 100::/64 (descarte)
  if ((x[0] & 0xfe) === 0xfc) return true; // fc00::/7
  if (x[0] === 0xfe && (x[1] & 0xc0) === 0x80) return true; // fe80::/10
  if (x[0] === 0xfe && (x[1] & 0xc0) === 0xc0) return true; // fec0::/10
  if (x[0] === 0xff) return true; // ff00::/8 multicast
  return false;
}

export type Resolver = (host: string) => Promise<string[]>;
const systemResolver: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((x) => x.address);
const hostOf = (host: string) => host.replace(/^\[|\]$/g, "");

/** Resolve o nome UMA vez e confere todos os endereços; devolve só os públicos já validados (para a conexão usar exatamente eles). */
export async function resolvePublicHost(host: string, resolver: Resolver = systemResolver): Promise<string[]> {
  const name = hostOf(host);
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(name)) throw new Error("Endereço interno não é aceito.");
  const ips = net.isIP(name) ? [name] : await resolver(name);
  if (!ips.length || ips.some(privateAddress)) throw new Error("Endereço interno não é aceito.");
  return ips;
}

/** `lookup` do Node que devolve só os endereços já validados (a conexão não consulta o DNS de novo) e recusa os internos. */
export function pinnedLookup(ips: string[]) {
  return (_host: string, options: any, cb: (...a: any[]) => void) => {
    if (!ips.length || ips.some(privateAddress)) return cb(new Error("Endereço interno não é aceito."));
    const list = ips.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }));
    if (options && options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  };
}

/**
 * `fetch` que conecta AO IP já validado (o nome fica no Host e no SNI): fecha o "DNS rebinding", em que o nome responde um
 * endereço público na conferência e um interno na conexão. Não segue redirecionamento (quem chama confere cada destino).
 */
export function pinnedFetch(url: string, init: RequestInit, ips: string[]): Promise<Response> {
  const u = new URL(url);
  return new Promise<Response>((resolve, reject) => {
    if (!ips.length || ips.some(privateAddress)) return reject(new Error("Endereço interno não é aceito."));
    const headers: Record<string, string> = {};
    new Headers(init.headers as HeadersInit | undefined).forEach((v, k) => (headers[k] = v));
    const req = https.request(
      { protocol: "https:", hostname: hostOf(u.hostname), port: u.port || 443, path: u.pathname + u.search, method: init.method ?? "GET", headers, servername: net.isIP(hostOf(u.hostname)) ? undefined : hostOf(u.hostname), lookup: pinnedLookup(ips) as any },
      (res) => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) h.append(k, item);
        const status = res.statusCode ?? 502;
        const empty = status === 204 || status === 205 || status === 304 || (status >= 100 && status < 200);
        if (empty) res.resume();
        resolve(new Response(empty ? null : (Readable.toWeb(res) as unknown as ReadableStream), { status, headers: h }));
      },
    );
    req.on("error", reject);
    init.signal?.addEventListener("abort", () => req.destroy(new Error("Tempo esgotado.")), { once: true });
    req.end();
  });
}

export interface FetchedLink {
  title: string | null;
  pages: ExtractedPage[];
  kind: "pdf" | "html";
}

export interface FetchBytesOptions {
  maxBytes: number;
  timeoutMs: number;
  userAgent: string;
  /** Problema do endereço (texto) ou nulo se está certo; roda em CADA destino, inclusive nos redirecionamentos. */
  checkUrl?: (u: URL) => string | null;
  /**
   * Confere o servidor de cada destino. Sem isto (o caso real), o nome é resolvido UMA vez por destino, os endereços são
   * conferidos (nada da rede interna) e a conexão vai a esse mesmo endereço (`connect`), sem consultar o DNS de novo.
   */
  checkHost?: (host: string) => Promise<void>;
  /** Resolve o nome (padrão: DNS do sistema); existe para os testes simularem um DNS que muda de resposta. */
  resolver?: Resolver;
  /** Faz a conexão ao endereço já conferido (padrão: `pinnedFetch` quando `fetchImpl` é o `fetch` do Node; senão, o próprio `fetchImpl`). */
  connect?: (url: string, init: RequestInit, ips: string[]) => Promise<Response>;
  /** Todo status de erro vira "O link respondeu N." (sem as mensagens próprias do 403 e do 429). */
  plainStatus?: boolean;
  /** Texto próprio do erro para qualquer status de erro (ex.: o monitor de fontes escreve "HTTP 404"); tem prioridade sobre `plainStatus`. */
  statusMessage?: (status: number) => string;
  /**
   * Aceita qualquer tipo de conteúdo (o monitor de fontes só compara impressões digitais): nada de recusar tipo desconhecido nem
   * PDF sem assinatura; o tipo volta como "pdf" (assinatura), "html" ou "text" (todo o resto).
   */
  acceptAnyType?: boolean;
}

export interface FetchedBytes {
  finalUrl: string;
  body: Buffer;
  contentType: string;
  kind: "pdf" | "html" | "text";
}

const MAX_REDIRECTS = 3;

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return String(mb >= 1 ? Math.round(mb) : Number(mb.toPrecision(2)));
}

/**
 * Baixa um endereço https: até 3 redirecionamentos (cada destino conferido de novo), um só limite de tempo para tudo (saltos e
 * corpo), corpo lido em pedaços e cortado ao passar de `maxBytes` (mesmo sem tamanho declarado). Devolve os bytes e o tipo
 * (`pdf` pela assinatura `%PDF-`, `html`, ou `text`); outros tipos são recusados.
 */
export async function fetchBytes(url: string, fetchImpl: typeof fetch, opts: FetchBytesOptions): Promise<FetchedBytes> {
  const connect = opts.connect ?? (fetchImpl === globalThis.fetch ? pinnedFetch : (url: string, init: RequestInit) => fetchImpl(url, init));
  const seconds = Math.max(1, Math.round(opts.timeoutMs / 1000));
  const timeoutError = new Error(`Tempo esgotado ao baixar (${seconds} s).`);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs);
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(timeoutError), { once: true }));
  aborted.catch(() => {});
  const within = <T>(work: Promise<T>): Promise<T> => Promise.race([work, aborted]);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = new URL(current);
      if (u.protocol !== "https:") throw new Error("Só links https são aceitos.");
      const problem = opts.checkUrl?.(u);
      if (problem) throw new Error(problem);
      const init: RequestInit = { redirect: "manual", headers: { "User-Agent": opts.userAgent, Accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" }, signal: controller.signal };
      let res: Response;
      if (opts.checkHost) {
        await within(opts.checkHost(u.hostname));
        res = await within(fetchImpl(current, init));
      } else {
        const ips = await within(resolvePublicHost(u.hostname, opts.resolver));
        res = await within(connect(current, init, ips));
      }
      if (res.status >= 300 && res.status < 400) {
        res.body?.cancel().catch(() => {});
        const next = res.headers.get("location");
        if (!next) throw new Error("O link redireciona para lugar nenhum.");
        current = new URL(next, current).toString();
        continue;
      }
      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        if (opts.statusMessage) throw new Error(opts.statusMessage(res.status));
        if (!opts.plainStatus && res.status === 429) throw new Error("O site pediu para esperar (429).");
        if (!opts.plainStatus && res.status === 403) throw new Error("O site bloqueou o download (403).");
        throw new Error(`O link respondeu ${res.status}.`);
      }
      const tooBig = () => new Error(`O conteúdo do link passa de ${megabytes(opts.maxBytes)} MB.`);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > opts.maxBytes) {
        res.body?.cancel().catch(() => {});
        throw tooBig();
      }
      let body: Buffer;
      const reader = res.body?.getReader?.();
      if (reader) {
        const parts: Buffer[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await within(reader.read());
          if (done) break;
          total += value.byteLength;
          if (total > opts.maxBytes) {
            reader.cancel().catch(() => {});
            throw tooBig();
          }
          parts.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        }
        body = Buffer.concat(parts);
      } else {
        body = Buffer.from(await within(res.arrayBuffer()));
        if (body.length > opts.maxBytes) throw tooBig();
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (isPdf(body)) return { finalUrl: u.toString(), body, contentType, kind: "pdf" };
      if (opts.acceptAnyType) return { finalUrl: u.toString(), body, contentType, kind: contentType.includes("html") ? "html" : "text" };
      if (contentType.includes("pdf")) throw new Error("O arquivo não é um PDF (assinatura %PDF- ausente).");
      if (contentType.includes("html")) return { finalUrl: u.toString(), body, contentType, kind: "html" };
      if (contentType.includes("text")) return { finalUrl: u.toString(), body, contentType, kind: "text" };
      throw new Error("O link não é uma página nem um PDF.");
    }
    throw new Error("O link redireciona demais.");
  } catch (error) {
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Busca um link (https), seguindo no máximo 3 redirecionamentos e conferindo cada destino. PDF ou página web. */
export async function fetchLink(url: string, fetchImpl: typeof fetch = fetch, checkHost?: (h: string) => Promise<void>): Promise<FetchedLink> {
  const got = await fetchBytes(url, fetchImpl, {
    maxBytes: MAX_LINK_BYTES,
    timeoutMs: 20_000,
    userAgent: "StaziaMed-Podcast/1.0 (+https://staziamed-revalida.vercel.app)",
    checkHost,
    plainStatus: true,
  });
  const u = new URL(got.finalUrl);
  if (got.kind === "pdf") return { title: decodeURIComponent(u.pathname.split("/").pop() || u.hostname), pages: await extractPdf(got.body), kind: "pdf" };
  const { title, text } = htmlToText(got.body.toString("utf8"));
  return { title: title ?? u.hostname, pages: [{ page: null, text }], kind: "html" };
}

/**
 * Páginas → trechos de até `max` caracteres, cortando em parágrafo e, se preciso, em fim de frase. Cada trecho guarda a página.
 * Trechos muito curtos (cabeçalho, número de página) saem.
 */
export function chunkPages(pages: ExtractedPage[], max = 1200, min = 40): Chunk[] {
  return chunkPagesInfo(pages, max, min).chunks;
}

export interface ChunkInfo {
  /** Os trechos que entram (no máximo MAX_CHUNKS_PER_SOURCE). */
  chunks: Chunk[];
  /** Quantos trechos o documento inteiro teria. */
  total: number;
  /** Houve corte: o resto do documento não entra. */
  truncated: boolean;
  /** Última página numerada que tem trecho entre os que entraram (null se a fonte não tem páginas). */
  lastPage: number | null;
  /** Quantas páginas numeradas o documento tem. */
  pagesTotal: number;
}

/** Igual a chunkPages, mas diz se o limite de trechos cortou o documento e até que página ele chegou (para avisar a equipe). */
export function chunkPagesInfo(pages: ExtractedPage[], max = 1200, min = 40): ChunkInfo {
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
  const chunks = out.slice(0, MAX_CHUNKS_PER_SOURCE);
  const numbered = chunks.filter((c) => c.page != null).map((c) => c.page as number);
  return {
    chunks,
    total: out.length,
    truncated: out.length > MAX_CHUNKS_PER_SOURCE,
    lastPage: numbered.length ? Math.max(...numbered) : null,
    pagesTotal: pages.filter((p) => p.page != null).length,
  };
}
