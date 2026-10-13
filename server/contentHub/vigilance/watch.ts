/**
 * Vigilância científica no processamento (tarefa do Cloud Run, a cada minuto): uma conferência de link do vigia e a consulta de
 * retratação no Crossref. SEM IA. O que vem da internet é dado: vira impressão digital, fatos e versões candidatas, nunca ordem.
 *
 *   PDF: SHA-256 dos bytes + SHA-256 do texto (bytes diferentes com o mesmo texto = só metadados, não é mudança).
 *   HTML: SHA-256 do texto do conteúdo principal SEM a data da própria página; fatos (links de documento, atos, datas, avisos).
 *   Pedido condicional (If-None-Match / If-Modified-Since): 304 = não mudou, sem baixar o arquivo de novo.
 *   Só sites da lista oficial ATIVA, conferida também em cada redirecionamento.
 */
import { fetchBytes, extractPdf, type Resolver } from "../../podcasts/extract";
import { linkProblem, matchDomain, OFFICIAL_FETCH, type OfficialDomain } from "../sources/officialDomains";
import { snapshotPassages, type Passage } from "../sourceDiff";
import { comparablePageText, comparablePdfText, indexItems, mainHtml, pageFacts, pdfFacts, sha256, stripPageDates, versionCandidates, type IndexItem, type PageFacts } from "./pageFacts";
import { crossrefUrl, CROSSREF_UA, parseCrossref, type CrossrefReport } from "./crossref";

export interface WatchDue {
  source_id: string;
  url: string;
  last_hash: string | null;
  hash_method?: string | null;
  text_hash?: string | null;
  etag?: string | null;
  last_modified?: string | null;
  facts?: PageFacts | null;
  domain?: string;
}

export interface WatchReading {
  report: Record<string, unknown>;
  /** Parágrafos da página (HTML) para a comparação de conteúdo que já existia (compareSnapshots). */
  snapshot: Passage[] | null;
}

export interface NetOptions {
  fetchImpl: typeof fetch;
  resolver?: Resolver;
  checkHost?: (host: string) => Promise<void>;
}

/** Limites do vigia: os das Fontes oficiais (50 MB), 30 s para tudo. */
const WATCH_FETCH = { ...OFFICIAL_FETCH, timeoutMs: 30_000, userAgent: "StaziaMed-Vigilancia/1.0 (+mailto:suporte@staziamed.com.br)" } as const;
/** Texto de PDF só até este tamanho (acima, fica só a impressão dos bytes). */
const PDF_TEXT_MAX = 30 * 1024 * 1024;

/** Lê um link vigiado e monta o relato para ch_worker_watch_report. Nunca lança: erro vira "unreachable" com o motivo. */
export async function readPublication(w: WatchDue, domains: OfficialDomain[], net: NetOptions): Promise<WatchReading> {
  try {
    const conditional: Record<string, string> = {};
    if (w.last_hash && w.hash_method) {
      if (w.etag) conditional["If-None-Match"] = w.etag;
      if (w.last_modified) conditional["If-Modified-Since"] = w.last_modified;
    }
    const got = await fetchBytes(w.url, net.fetchImpl, {
      ...WATCH_FETCH,
      checkUrl: (u) => linkProblem(u.href) ?? (matchDomain(u, domains) ? null : "Endereço fora da lista de sites oficiais."),
      checkHost: net.checkHost,
      resolver: net.resolver,
      acceptAnyType: true,
      headers: conditional,
      allowNotModified: Object.keys(conditional).length > 0,
      statusMessage: (status) => `HTTP ${status}`,
    });
    if (got.notModified) return { report: { status: "not_modified" }, snapshot: null };
    const base = { size: got.body.length, content_type: got.contentType.slice(0, 200), etag: got.etag ?? null, last_modified: got.lastModified ?? null, final_url: got.finalUrl };
    if (got.kind === "pdf") {
      let textHash: string | null = null;
      let facts: PageFacts | null = null;
      if (got.body.length <= PDF_TEXT_MAX) {
        try {
          const pages = (await extractPdf(got.body)).map((p) => p.text);
          const text = comparablePdfText(pages);
          if (text.length >= 50) {
            textHash = sha256(text);
            facts = pdfFacts(pages);
          }
        } catch {
          // PDF sem texto legível: fica só a impressão dos bytes
        }
      }
      const candidates = facts && w.facts ? versionCandidates(w.facts, facts).map((c) => ({ ...c, url: c.url ?? null })) : [];
      // PDF que mudou: o próprio arquivo novo é a candidata (com o ato e a data que aparecerem na capa)
      if (facts && w.last_hash && sha256(got.body) !== w.last_hash) {
        candidates.unshift({ url: got.finalUrl, titulo: "Arquivo novo no mesmo endereço", data: facts.dates[0] ?? null, ato: facts.acts[0] ?? null });
      }
      return { report: { status: "ok", method: "pdf-sha256", hash: sha256(got.body), text_hash: textHash, facts, candidates: candidates.slice(0, 20), ...base }, snapshot: null };
    }
    const raw = got.body.toString("utf8");
    if (got.kind === "html") {
      const facts = pageFacts(raw, got.finalUrl);
      return {
        report: { status: "ok", method: "html-texto-v2", hash: sha256(comparablePageText(raw)), facts, candidates: versionCandidates(w.facts ?? null, facts), ...base },
        snapshot: snapshotPassages(`<div>${stripPageDates(mainHtml(raw))}</div>`, "text/html"),
      };
    }
    const text = raw.normalize("NFC").replace(/\s+/g, " ").trim();
    return { report: { status: "ok", method: "texto-v2", hash: sha256(text), ...base }, snapshot: snapshotPassages(raw, got.contentType) };
  } catch (error) {
    return { report: { status: "unreachable", error: String((error as Error)?.message ?? error).slice(0, 300) }, snapshot: null };
  }
}

/** Uma consulta ao Crossref (só api.crossref.org, sem chave; 20 s; até 1 MB). Nunca lança: erro vira status "erro". */
export async function checkDoi(doi: string, net: NetOptions): Promise<CrossrefReport> {
  try {
    const got = await fetchBytes(crossrefUrl(doi), net.fetchImpl, {
      maxBytes: 1024 * 1024,
      timeoutMs: 20_000,
      userAgent: CROSSREF_UA,
      checkUrl: (u) => (u.hostname === "api.crossref.org" ? linkProblem(u.href) : "Resposta fora do Crossref."),
      checkHost: net.checkHost,
      resolver: net.resolver,
      acceptAnyType: true,
      statusMessage: (status) => `Crossref respondeu HTTP ${status}`,
    });
    return parseCrossref(JSON.parse(got.body.toString("utf8")), doi);
  } catch (error) {
    return { status: "erro", erro: String((error as Error)?.message ?? error).slice(0, 300) };
  }
}

/** Lê uma página-índice oficial (lista de notas, PCDT, publicações) e devolve os itens para ch_worker_index_page_report. Nunca lança. */
export async function readIndexPage(url: string, domains: OfficialDomain[], net: NetOptions): Promise<{ status: "ok"; items: IndexItem[] } | { status: "unreachable"; error: string }> {
  try {
    const got = await fetchBytes(url, net.fetchImpl, {
      ...WATCH_FETCH,
      maxBytes: 10 * 1024 * 1024,
      checkUrl: (u) => linkProblem(u.href) ?? (matchDomain(u, domains) ? null : "Endereço fora da lista de sites oficiais."),
      checkHost: net.checkHost,
      resolver: net.resolver,
      acceptAnyType: true,
      statusMessage: (status) => `HTTP ${status}`,
    });
    if (got.kind === "pdf") return { status: "unreachable", error: "A página-índice virou um PDF." };
    return { status: "ok", items: indexItems(got.body.toString("utf8"), got.finalUrl) };
  } catch (error) {
    return { status: "unreachable", error: String((error as Error)?.message ?? error).slice(0, 300) };
  }
}
