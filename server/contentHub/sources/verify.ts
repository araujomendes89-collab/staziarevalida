/**
 * FONTES OFICIAIS: conferência de cada achado da IA, feita pelo SERVIDOR. A IA diz "achei este documento neste link, com este
 * trecho"; aqui nada disso é aceito de palavra. O servidor confere o formato, se o site é da lista de oficiais, se o link já é
 * conhecido, BAIXA o arquivo (com os limites e a lista conferida em cada redirecionamento), calcula o SHA-256, lê o texto e
 * procura o trecho citado. Só o que passa em tudo vira candidato "aguardando" a conferência do dono. Nada aqui vira fonte.
 *
 * Texto baixado da internet é dado não confiável: nunca vai para IA nesta etapa (só é lido e comparado).
 */
import crypto from "crypto";
import { extractPdf, htmlToText, type ExtractedPage } from "../../podcasts/extract";
import { validate, type Schema } from "../ai/schema";
import type { ContentDb, Storage } from "../infra";
import { downloadOfficial, linkProblem, matchDomain, normalizeLink, type DomainKind, type OfficialDomain } from "./officialDomains";

export type SourceKind = "final" | "preliminary" | "public_consultation" | "society_guideline" | "rectification";

const SOURCE_KINDS: SourceKind[] = ["final", "preliminary", "public_consultation", "society_guideline", "rectification"];

/** Um achado da IA (um item da lista que ela devolve). Os limites são os da tabela de candidatos. */
export const FINDING_SCHEMA: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "instituicao", "link", "data_publicacao", "natureza", "tipo", "nivel_sugerido", "motivo", "trecho"],
  properties: {
    titulo: { type: "string", minLength: 3, maxLength: 300, description: "Título do documento, como aparece nele." },
    instituicao: { type: "string", minLength: 2, maxLength: 200, description: "Instituição que publicou o documento." },
    link: { type: "string", minLength: 10, maxLength: 2000, description: "Endereço https do arquivo (PDF) ou da página, num dos sites oficiais permitidos." },
    data_publicacao: { type: "string", maxLength: 40, nullable: true, description: "Data de publicação (AAAA-MM-DD ou só AAAA); nula se o documento não diz." },
    natureza: { type: "string", maxLength: 80, description: "Natureza do documento (por exemplo: PCDT, diretriz, manual, consenso, portaria)." },
    tipo: { type: "string", enum: SOURCE_KINDS, description: "final, preliminary, public_consultation, society_guideline ou rectification." },
    nivel_sugerido: { type: "string", enum: ["A", "B", "C", "D"], description: "Nível de evidência sugerido (A a D)." },
    motivo: { type: "string", maxLength: 300, description: "Por que este documento serve como fonte." },
    trecho: { type: "string", minLength: 20, maxLength: 400, description: "Trecho copiado literalmente do documento, para o servidor achar no arquivo." },
  },
};

export interface Finding {
  titulo: string;
  instituicao: string;
  link: string;
  data_publicacao: string | null;
  natureza: string;
  tipo: SourceKind;
  nivel_sugerido: "A" | "B" | "C" | "D";
  motivo: string;
  trecho: string;
}

/** Nível sugerido pelo tipo de site (a IA só dá uma opinião; o dono decide). */
export const LEVEL_BY_KIND: Record<DomainKind, "A" | "B" | "C"> = { governo: "A", sociedade: "B", internacional: "C" };

export interface FileText {
  pages: ExtractedPage[];
  title: string | null;
  date: string | null;
}

/** Trecho depois de dobrado com menos que isto é curto demais para provar alguma coisa (Ruling F9). */
const MIN_FOLDED_QUOTE = 40;
const MIN_TEXT_CHARS = 100;

/** Data válida: `AAAA` ou `AAAA-MM-DD` (de 1900 a 2100); qualquer outra coisa é nula. */
function validDate(year: number, month?: number, day?: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month === undefined) return true;
  const d = new Date(Date.UTC(year, month - 1, day ?? 1));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === (day ?? 1);
}

/** Data do arquivo ou da IA: aceita `AAAA`, `AAAA-MM-DD`, `AAAA-MM-DDThh…`, `AAAA/MM/DD` e `AAAAMMDD…` (PDF); senão nulo. */
function normalizeDate(raw: unknown, strict = false): string | null {
  if (typeof raw !== "string") return null;
  const v = strict ? raw.trim() : raw.trim().replace(/^D:/, "");
  const year = /^(\d{4})$/.exec(v);
  if (year) return validDate(+year[1]) ? year[1] : null;
  const full = strict ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s].*)?$/.exec(v) ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
  if (!full) return null;
  return validDate(+full[1], +full[2], +full[3]) ? `${full[1]}-${full[2]}-${full[3]}` : null;
}

function firstLine(text: string, max: number): string | null {
  const line = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean);
  return line ? line.slice(0, max) : null;
}

const clip = (s: string | null, max: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

/** Valor de `content` do primeiro <meta> cujo name/property/itemprop é um dos nomes (na ordem dos nomes). */
function metaContent(html: string, names: string[]): string | null {
  const found = new Map<string, string>();
  for (const tag of html.slice(0, 400_000).match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (key && attrs.content && !found.has(key)) found.set(key, attrs.content);
  }
  for (const n of names) if (found.has(n)) return found.get(n)!;
  return null;
}

/** Página web em bytes → texto. Lê o `charset` declarado quando não é UTF-8 (páginas antigas do governo vêm em Latin-1). */
function decodeHtml(body: Buffer): string {
  const head = body.subarray(0, 4096).toString("latin1");
  const label = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1];
  if (label && !/^utf-?8$/i.test(label)) {
    try {
      return new TextDecoder(label).decode(body);
    } catch {
      /* rótulo desconhecido: cai para UTF-8 */
    }
  }
  return body.toString("utf8");
}

/** Lê o arquivo baixado: texto por página (PDF) ou da página (HTML), mais título e data que o próprio arquivo diz. */
export async function readFileText(kind: "pdf" | "html", body: Buffer): Promise<FileText> {
  if (kind === "pdf") {
    const pages = await extractPdf(body);
    let title: string | null = null;
    let date: string | null = null;
    try {
      const { getMeta } = await import("unpdf");
      const { info } = await getMeta(new Uint8Array(body));
      title = clip(typeof info?.Title === "string" ? info.Title.replace(/\u0000/g, "") : null, 300);
      date = normalizeDate(typeof info?.CreationDate === "string" ? info.CreationDate : null);
    } catch {
      /* sem metadados: o título vem da primeira linha */
    }
    return { pages, title: title ?? (pages[0] ? firstLine(pages[0].text, 200) : null), date };
  }
  const html = decodeHtml(body);
  const { title, text } = htmlToText(html);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return {
    pages: [{ page: null, text }],
    title: clip(title, 300) ?? clip(h1 ? htmlToText(h1).text : null, 300),
    date: normalizeDate(metaContent(html, ["article:published_time", "citation_publication_date", "dc.date", "date"])),
  };
}

/**
 * Texto dobrado para comparar trecho com arquivo: ignora caixa, acentos, ligaduras (ﬁ), aspas curvas, espaços (inclusive o não
 * separável), todos os traços e o hífen de quebra de linha. Compara só o que uma pessoa leria como "o mesmo texto".
 */
export function foldForQuote(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[-\u2010\u2011]\s*\n\s*/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2212]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** O trecho está no texto (de qualquer página)? Devolve a página onde ele começa (nula em página web). */
export function findQuote(quote: string, pages: ExtractedPage[]): { found: boolean; page: number | null } {
  const needle = foldForQuote(quote);
  if (!needle) return { found: false, page: null };
  let haystack = "";
  const starts: { at: number; page: number | null }[] = [];
  for (const p of pages) {
    const folded = foldForQuote(p.text);
    if (!folded) continue;
    haystack += haystack ? " " : "";
    starts.push({ at: haystack.length, page: p.page });
    haystack += folded;
  }
  const index = haystack.indexOf(needle);
  if (index < 0) return { found: false, page: null };
  let page: number | null = null;
  for (const s of starts) if (s.at <= index) page = s.page;
  return { found: true, page };
}

/** Início do texto para a tela mostrar (3 primeiras páginas, até 6.000 caracteres). */
export function previewText(pages: ExtractedPage[]): string {
  return pages
    .slice(0, 3)
    .map((p) => p.text)
    .join("\n\n")
    .slice(0, 6000);
}

/** Natureza dita pela IA (texto livre) → um dos tipos permitidos de fonte; na dúvida, DOCUMENT. */
export function natureToSourceType(natureza: string): string {
  const n = foldForQuote(natureza);
  if (/\bpcdt\b|protocolo clinico/.test(n)) return "PCDT";
  if (/guideline|diretriz|diretrizes/.test(n)) return "GUIDELINE";
  if (/\bmanual\b/.test(n)) return "MANUAL";
  if (/consenso/.test(n)) return "CONSENSUS";
  if (/\b(lei|leis|portaria|decreto|resolucao|norma|legislacao)\b/.test(n)) return "LAW";
  return "DOCUMENT";
}

/** Onde o arquivo do candidato fica no depósito privado (o nome é o SHA-256: o mesmo arquivo cai no mesmo lugar). */
export function candidateKey(sha256: string, kind: "pdf" | "html"): string {
  return `source-candidates/${sha256}.${kind}`;
}

export interface VerifyContext {
  db: ContentDb;
  storage: Storage;
  searchId: string;
  domains: OfficialDomain[];
  /** Links que apareceram nos resultados da busca da IA (só um sinal; quem prova é o trecho no arquivo). */
  seenUrls: string[];
  fetchImpl: typeof fetch;
  checkHost?: (host: string) => Promise<void>;
}

export type VerifyOutcome = { ok: true; candidateId: string } | { ok: false; motivo: string };

const discard = (motivo: string): VerifyOutcome => ({ ok: false, motivo });

const messageOf = (error: unknown) => {
  const m = error instanceof Error ? error.message : String(error);
  return m === "fetch failed" ? "Não foi possível conectar ao site." : m;
};

/**
 * Confere UM achado, na ordem, parando no primeiro problema. Descarte devolve `{ ok: false, motivo }` (o motivo vai para o
 * registro da busca). Erro de armazenamento ou de banco NÃO vira descarte: sobe para a fila, que tenta de novo.
 */
export async function verifyFinding(item: unknown, ctx: VerifyContext): Promise<VerifyOutcome> {
  // 1. formato, link e site da lista
  const errors = validate(FINDING_SCHEMA, item);
  if (errors.length) return discard(`Fora do formato: ${errors.slice(0, 2).join("; ")}.`);
  const f = item as Finding;
  const link = f.link;
  const problem = linkProblem(link);
  if (problem) return discard(problem);
  if (!matchDomain(link, ctx.domains)) return discard("Site fora da lista de sites oficiais.");
  const quote = f.trecho.trim();
  if (foldForQuote(quote).length < MIN_FOLDED_QUOTE) return discard("Trecho curto demais para conferir.");
  const published = normalizeDate(f.data_publicacao, true);

  // 2. link já conhecido
  const knownByLink = await ctx.db.service<string | null>("ch_worker_source_known", { p_url: link, p_sha256: null });
  if (knownByLink) return discard(knownByLink);

  // 3. download conferido
  let got: Awaited<ReturnType<typeof downloadOfficial>>;
  try {
    got = await downloadOfficial(link, ctx.domains, ctx.fetchImpl, ctx.checkHost);
  } catch (error) {
    return discard(`Download: ${messageOf(error)}`);
  }
  if (got.body.length < 1) return discard("Download: arquivo vazio.");
  if (got.finalUrl.length > 2000) return discard("Download: o endereço final passa de 2000 caracteres.");

  // 4. o mesmo arquivo já é conhecido?
  const sha256 = crypto.createHash("sha256").update(got.body).digest("hex");
  const knownByFile = await ctx.db.service<string | null>("ch_worker_source_known", { p_url: got.finalUrl, p_sha256: sha256 });
  if (knownByFile) return discard(knownByFile);

  // 5. texto do arquivo
  let file: FileText;
  try {
    file = await readFileText(got.kind, got.body);
  } catch {
    return discard(got.kind === "pdf" ? "Arquivo PDF ilegível." : "Página web ilegível.");
  }
  const chars = file.pages.reduce((n, p) => n + p.text.replace(/\s+/g, "").length, 0);
  if (chars < MIN_TEXT_CHARS) return discard("Sem texto: o trecho não pôde ser conferido (PDF escaneado?).");

  // 6. o trecho existe no arquivo?
  const hit = findQuote(quote, file.pages);
  if (!hit.found) return discard("O trecho citado pela IA não está no arquivo.");

  // 7. guarda o arquivo e cria o candidato "aguardando"
  const key = candidateKey(sha256, got.kind);
  await ctx.storage.put(key, got.body, got.kind === "pdf" ? "application/pdf" : "text/html");
  const wanted = normalizeLink(link);
  const finalLink = normalizeLink(got.finalUrl);
  const created = await ctx.db.service<{ id: string; duplicate: boolean }>("ch_worker_source_candidate_create", {
    p_candidate: {
      search_id: ctx.searchId,
      domain_id: got.domain.id,
      requested_url: link,
      final_url: got.finalUrl,
      ai_title: f.titulo,
      ai_institution: f.instituicao,
      ai_published: published,
      ai_nature: f.natureza,
      ai_kind: f.tipo,
      ai_level: f.nivel_sugerido,
      ai_reason: f.motivo,
      file_title: file.title,
      file_date: file.date,
      quote,
      quote_page: hit.page,
      seen_in_search: ctx.seenUrls.some((u) => {
        const n = normalizeLink(u);
        return n === wanted || n === finalLink;
      }),
      file_kind: got.kind,
      sha256,
      size_bytes: got.body.length,
      page_count: got.kind === "pdf" ? file.pages.length : null,
      storage_path: key,
      preview: previewText(file.pages),
      suggested_level: LEVEL_BY_KIND[got.domain.kind],
      suggested_kind: f.tipo,
      suggested_nature: natureToSourceType(f.natureza),
    },
  });
  if (created.duplicate) return discard("Repetido: já existe candidato com este link ou arquivo.");
  return { ok: true, candidateId: created.id };
}
