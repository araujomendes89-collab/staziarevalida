// @vitest-environment node
/**
 * Fontes oficiais com IA — CONTRATO entre as telas e o servidor/banco (FT-JUNCAO). As telas foram escritas contra
 * suposições (testes com banco simulado); aqui o banco de desenvolvimento e as rotas são os verdadeiros e cada chamada
 * leva EXATAMENTE o que a tela manda (copiado de SourceSearch.jsx, OfficialDomains.jsx, SourceCandidates.jsx,
 * FunctionEditor.jsx e AdminAI.jsx) e confere as chaves que a tela lê da resposta. Nenhuma IA nem internet reais.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";
import { makePdf } from "./helpers/fontesFixtures";
import { localStorageDir, type Storage } from "../../server/contentHub/infra";
import { createContentHubRouter } from "../../server/contentHub/router";
import { createAiRouter } from "../../server/ai/router";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-contrato-"));
let t: FontesDb;
const servers: Server[] = [];
let hub = "";
let hubSigned = "";
let ai = "";
let admin = "";
let signedStorage: Storage;
let storage: Storage;

const listen = (mount: (app: express.Express) => void) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    mount(app);
    const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
    servers.push(srv);
  });
const depsOf = (s: Storage) => ({ db: t.db, storage: s, ai: { provider: null, status: { ready: true, provider: "anthropic", model: "modelo-de-teste" } }, renderer: null }) as any;

/** Como as telas chamam o servidor: Authorization + JSON; erro devolve { error }. */
async function http(base: string, method: string, p: string, body?: unknown) {
  const r = await fetch(base + p, {
    method,
    headers: { Authorization: `Bearer ${admin}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, type, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
const asAdmin = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.adminUser, fn, args);
const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
const has = (obj: any, keys: string[]) => keys.filter((k) => !(k in obj));

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
  storage = localStorageDir(path.join(tmp, "files"));
  const mem = new Map<string, Buffer>();
  signedStorage = {
    async put(k, d) {
      mem.set(k, d);
      return k;
    },
    async get(k) {
      return mem.get(k) ?? Buffer.alloc(0);
    },
    async exists(k) {
      return mem.has(k);
    },
    async remove(keys) {
      for (const k of keys) mem.delete(k);
    },
    async signedUrl(k, s) {
      return `https://deposito.test/${k}?expira=${s}`;
    },
  };
  hub = `${await listen((app) => app.use("/api/content-hub", createContentHubRouter(depsOf(storage))))}/api/content-hub`;
  hubSigned = `${await listen((app) => app.use("/api/content-hub", createContentHubRouter(depsOf(signedStorage))))}/api/content-hub`;
  ai = `${await listen((app) => app.use("/api/ai-central", createAiRouter({ db: t.db }, { env: {} as any })))}/api/ai-central`;
  admin = await t.dev.createSession(t.ADMIN);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

/** As 10 chaves de edição que a tela manda sempre (vazias vão como null). */
const TEN = ["institution", "title", "version", "published_on", "kind", "nature", "level", "area", "theme", "valid_until"];
const screenFields = (over: Record<string, unknown> = {}) => ({
  institution: "Ministério da Saúde", title: null, version: null, published_on: null, kind: "final", nature: "PCDT", level: "B", area: "PEDIATRIA", theme: "Bronquiolite", valid_until: null, ...over,
});

let seq = 0;
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
/** Candidato como o processamento cria (arquivo guardado + linha), no site gov.br/saude, ligado a uma busca de verdade. */
async function candidate(s: Storage, over: Record<string, unknown> = {}, kind: "pdf" | "html" = "pdf") {
  const n = ++seq;
  const text = `Protocolo sintetico numero ${n}. A gestante com pre-eclampsia grave deve ser encaminhada ao centro de referencia ${n}. Segundo paragrafo longo o bastante para virar um trecho de leitura ${n}.`;
  const bytes = kind === "pdf" ? makePdf([text]) : Buffer.from(`<html><head><title>Pagina ${n}</title></head><body><p>${text}</p></body></html>`);
  const hash = sha(bytes);
  const key = `source-candidates/${hash}.${kind}`;
  await s.put(key, bytes, kind === "pdf" ? "application/pdf" : "text/html");
  const site = (await sql(`select id from public.ch_official_domains where address = 'www.gov.br/saude'`))[0];
  const started = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", theme: `Tema do contrato ${n}`, top_themes: null, free_text: null } });
  const link = `https://www.gov.br/saude/contrato-${n}.${kind}`;
  const r = await t.db.service<{ id: string }>("ch_worker_source_candidate_create", {
    p_candidate: {
      search_id: started.searches[0].id, domain_id: site.id, requested_url: link, final_url: link, ai_title: `Protocolo do contrato ${n}`, ai_institution: "Ministério da Saúde",
      ai_published: "2025-03-14", ai_nature: "PCDT", ai_kind: "final", ai_level: "A", ai_reason: "Documento oficial do tema pedido.", file_title: `Protocolo ${n}`, file_date: "2025-03-14",
      quote: text.slice(0, 80), quote_page: kind === "pdf" ? 1 : null, seen_in_search: true, file_kind: kind, sha256: hash, size_bytes: bytes.length, page_count: kind === "pdf" ? 1 : null,
      storage_path: key, preview: text, suggested_level: "A", suggested_kind: "final", suggested_nature: "PCDT", ...over,
    },
  });
  return { id: r.id, key, hash };
}

describe("Contrato: Central de IAs (FunctionEditor e AdminAI)", () => {
  it("preço por busca e Busca de fontes oficiais: o que a tela manda é aceito e volta como a tela lê", async () => {
    // AdminAI.jsx PriceRow: sempre manda per_search_usd (número ou null)
    expect((await http(ai, "POST", "/providers/anthropic/enabled", { enabled: true })).status).toBe(200);
    const price = await http(ai, "PUT", "/prices/anthropic/claude-contrato", { input_per_mtok: 3, output_per_mtok: 15, per_search_usd: 0.01, source_url: null });
    expect(price.status).toBe(200);
    expect(price.body.per_search_usd).toBe(0.01);
    // FunctionEditor.jsx: config da busca_fontes (máximo vazio vira 5 na tela; reviewers [] e fallback null)
    const body = { config: { mode: "sozinha", care: "caprichado", primary: { provider: "anthropic", model: "claude-contrato" }, fallback: null, reviewers: [], max_searches: 5 } };
    const saved = await http(ai, "PUT", "/functions/busca_fontes", body);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.ok).toBe(true);

    // a tela lê: functions[].{key, mode, primary_ref, fallback_ref, reviewers, care, max_searches}, prices[].per_search_usd, checks.busca_fontes
    const overview = (await http(ai, "GET", "/overview")).body;
    const fn = overview.functions.find((f: any) => f.key === "busca_fontes");
    expect(fn).toMatchObject({ mode: "sozinha", care: "caprichado", primary_ref: { provider: "anthropic", model: "claude-contrato" }, fallback_ref: null, reviewers: [], max_searches: 5 });
    expect(overview.prices.find((p: any) => p.model === "claude-contrato").per_search_usd).toBe(0.01);
    expect(overview.checks.busca_fontes).toMatchObject({ ready: true });
    expect(Array.isArray(overview.checks.busca_fontes.problems)).toBe(true);

    // linha de preço sem valor na tela manda per_search_usd: null e limpa
    const cleared = await http(ai, "PUT", "/prices/anthropic/claude-contrato", { input_per_mtok: 3, output_per_mtok: 15, per_search_usd: null, source_url: null });
    expect(cleared.body.per_search_usd).toBeNull();
    // máximo fora de 1 a 10: o servidor recusa com o mesmo texto que a tela usa
    const bad = await http(ai, "PUT", "/functions/busca_fontes", { config: { ...body.config, max_searches: 11 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Máximo de buscas por pedido: de 1 a 10\./);
    // modo diferente de sozinha e Ollama: recusados (a tela nem oferece)
    expect((await http(ai, "PUT", "/functions/busca_fontes", { config: { ...body.config, mode: "linha" } })).status).toBe(400);
    expect((await http(ai, "PUT", "/functions/busca_fontes", { config: { ...body.config, primary: { provider: "ollama", model: "llama-x" } } })).status).toBe(400);
  });

  it("o resumo da equipe traz as 7 funções (o texto 'de N' da Central de Conteúdo usa essa lista)", async () => {
    const summary = (await http(ai, "GET", "/summary")).body;
    expect(summary.functions).toHaveLength(7);
    expect(summary.functions.find((f: any) => f.key === "busca_fontes")).toMatchObject({ configured: true });
  });

  it("'Desligar a função' manda config null e a função volta a desligada", async () => {
    expect((await http(ai, "PUT", "/functions/busca_fontes", { config: null })).status).toBe(200);
    const status = (await http(hub, "GET", "/source-search/status")).body;
    expect(Object.keys(status).sort()).toEqual(["max_searches", "problems", "ready", "warnings"]);
    expect(status).toMatchObject({ ready: false, max_searches: 5 });
    // ligada de novo com máximo 4: o status devolve o 4
    await http(ai, "PUT", "/functions/busca_fontes", { config: { mode: "sozinha", care: "caprichado", primary: { provider: "anthropic", model: "claude-contrato" }, fallback: null, reviewers: [], max_searches: 4 } });
    expect((await http(hub, "GET", "/source-search/status")).body).toMatchObject({ ready: true, problems: [], max_searches: 4 });
  });
});

describe("Contrato: pedir busca, buscas recentes e sites oficiais", () => {
  it("app_ch_source_search_start devolve {searches:[{id, theme, duplicate}]} para tema e para temas mais cobrados", async () => {
    // SourceSearch.jsx: p_request com as quatro chaves, as vazias como null
    const one = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", theme: "Bronquiolite", top_themes: null, free_text: "PCDT mais recente" } });
    expect(one.searches).toHaveLength(1);
    expect(Object.keys(one.searches[0]).sort()).toEqual(["duplicate", "id", "theme"]);
    expect(one.searches[0]).toMatchObject({ theme: "Bronquiolite", duplicate: false });
    const again = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", theme: "Bronquiolite", top_themes: null, free_text: "PCDT mais recente" } });
    expect(again.searches[0]).toMatchObject({ id: one.searches[0].id, duplicate: true });
    const top = await asAdmin("app_ch_source_search_start", { p_request: { area: null, theme: null, top_themes: 3, free_text: null } });
    expect(top.searches.length).toBeGreaterThan(0);
    expect(top.searches.length).toBeLessThanOrEqual(3);
    // a lista de sugestões da tela lê app_incidence(...).rows[].key
    const inc = await asAdmin("app_incidence", { p_dimension: "topic", p_area: null });
    expect(Array.isArray(inc.rows)).toBe(true);
    expect(inc.rows[0]).toHaveProperty("key");
  });

  it("app_ch_source_searches é uma lista com as chaves que a linha da busca lê", async () => {
    const list = await asAdmin<any[]>("app_ch_source_searches", { p_limit: 20 });
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    const wanted = ["id", "theme", "area", "free_text", "origin", "status", "message", "provider", "model", "web_searches", "cost_usd", "verified_count", "discarded_count", "discarded", "created_at", "job_status", "job_error"];
    expect(has(list[0], wanted)).toEqual([]);
    expect(Array.isArray(list[0].discarded)).toBe(true);
    // a tela só pinta estas situações
    const known = ["na_fila", "buscando", "conferindo", "concluida", "nada_encontrado", "pendente", "falhou"];
    expect(list.every((s) => known.includes(s.status))).toBe(true);
  });

  it("descartados saem como [{link, titulo, motivo}] e o custo e as buscas voltam números", async () => {
    const start = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", theme: "Tema descartes do contrato", top_themes: null, free_text: null } });
    await t.db.service("ch_worker_source_search_update", {
      p_search_id: start.searches[0].id,
      p_patch: { status: "concluida", provider: "anthropic", model: "claude-contrato", web_searches: 4, cost_usd: 0.047, verified_count: 2, discarded: [{ link: "https://x.gov.br/a.pdf", titulo: "Repetido", motivo: "Repetido: fonte já cadastrada." }], message: "2 para conferir, 1 descartado." },
    });
    const row = (await asAdmin<any[]>("app_ch_source_searches", { p_limit: 20 })).find((s) => s.id === start.searches[0].id);
    expect(row).toMatchObject({ status: "concluida", web_searches: 4, verified_count: 2, discarded_count: 1, provider: "anthropic" });
    expect(Number(row.cost_usd)).toBeCloseTo(0.047, 6);
    expect(row.discarded[0]).toEqual({ link: "https://x.gov.br/a.pdf", titulo: "Repetido", motivo: "Repetido: fonte já cadastrada." });
  });

  it("sites oficiais: lista com id/address/institution/kind/active; acrescentar sem id; editar e desativar com id", async () => {
    const list = await asAdmin<any[]>("app_ch_official_domains");
    expect(list).toHaveLength(11);
    expect(has(list[0], ["id", "address", "institution", "kind", "active"])).toEqual([]);
    // OfficialDomains.jsx add(): sem id, active true
    const added = await asAdmin("app_ch_save_official_domain", { p_domain: { address: "gov.br/contrato", institution: "Site do contrato", kind: "governo", active: true } });
    expect(added).toMatchObject({ address: "gov.br/contrato", institution: "Site do contrato", kind: "governo", active: true });
    expect(added.id).toBeTruthy();
    // DomainRow.save(): sempre manda id + os quatro campos; desativar muda só active
    const off = await asAdmin("app_ch_save_official_domain", { p_domain: { id: added.id, address: "gov.br/contrato", institution: "Site do contrato", kind: "governo", active: false } });
    expect(off).toMatchObject({ id: added.id, active: false, address: "gov.br/contrato" });
    const edited = await asAdmin("app_ch_save_official_domain", { p_domain: { id: added.id, address: "gov.br/contrato2", institution: "Outro nome", kind: "sociedade", active: false } });
    expect(edited).toMatchObject({ id: added.id, address: "gov.br/contrato2", institution: "Outro nome", kind: "sociedade", active: false });
    expect((await asAdmin<any[]>("app_ch_official_domains")).filter((d) => d.address.startsWith("gov.br/contrato"))).toHaveLength(1);
    // os tipos que a tela oferece são os que o banco aceita
    await expect(asAdmin("app_ch_save_official_domain", { p_domain: { address: "gov.br/outro", institution: "Outro", kind: "empresa", active: true } })).rejects.toThrow(/governo, internacional ou sociedade/);
  });
});

describe("Contrato: fontes encontradas (cartão, salvar, aprovar, rejeitar)", () => {
  const CARD = [
    "id", "status", "ai_title", "ai_kind", "ai_level", "ai_institution", "ai_reason", "ai_published", "site_institution", "site_address", "site_kind", "final_url", "search", "replaces",
    "quote", "quote_page", "seen_in_search", "file_title", "file_date", "file_kind", "page_count", "size_bytes", "sha256", "preview", "edited", "suggested_level", "suggested_kind",
    "suggested_nature", "decided_at", "decision_reason",
  ];

  it("app_ch_source_candidates devolve {items, counts} e o cartão traz tudo o que a tela lê", async () => {
    await candidate(storage);
    const r = await asAdmin("app_ch_source_candidates", { p_status: "aguardando" });
    expect(Object.keys(r).sort()).toEqual(["counts", "items"]);
    expect(Object.keys(r.counts).sort()).toEqual(["aguardando", "aprovado", "rejeitado"]);
    expect(r.counts.aguardando).toBeGreaterThan(0);
    const c = r.items[0];
    expect(has(c, CARD)).toEqual([]);
    expect(has(c.search, ["theme", "area", "created_at", "provider", "model"])).toEqual([]);
    expect(typeof c.edited).toBe("object");
    for (const status of ["aprovado", "rejeitado"]) expect(Array.isArray((await asAdmin("app_ch_source_candidates", { p_status: status })).items)).toBe(true);
  });

  it("salvar dados: as 10 chaves da tela (vazias como null) passam e voltam em edited; o resto fica de fora", async () => {
    const c = await candidate(storage);
    const out = await asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: screenFields({ title: "Título ajustado", version: "2025", published_on: "2025-03-14", valid_until: "2027-03-14" }) });
    expect(out.edited).toMatchObject({ institution: "Ministério da Saúde", title: "Título ajustado", version: "2025", published_on: "2025-03-14", kind: "final", nature: "PCDT", level: "B", area: "PEDIATRIA", theme: "Bronquiolite", valid_until: "2027-03-14" });
    // vazio (null) tira a chave
    const cleaned = await asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: screenFields({ title: null, version: null, published_on: null, valid_until: null }) });
    expect(Object.keys(cleaned.edited).sort()).toEqual(["area", "institution", "kind", "level", "nature", "theme"].sort());
    expect(TEN.every((k) => k in screenFields())).toBe(true);
    // as opções que a tela oferece em Tipo e Natureza são aceitas pelo banco
    for (const kind of ["final", "public_consultation", "preliminary", "rectification", "society_guideline"]) {
      await asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: { kind } });
    }
    for (const nature of ["GUIDELINE", "PCDT", "LAW", "MANUAL", "CONSENSUS", "ARTICLE", "SYSTEMATIC_REVIEW", "BOOK", "OFFICIAL_EXAM", "OFFICIAL_ANSWER_KEY", "VIDEO", "AUDIO", "WEB_PAGE", "SLIDES", "DOCUMENT", "OTHER"]) {
      await asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: { nature } });
    }
    for (const area of ["CLINICA_MEDICA", "CIRURGIA_GERAL", "PEDIATRIA", "GINECOLOGIA_OBSTETRICIA", "MEDICINA_FAMILIA_COMUNIDADE"]) {
      await asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: { area } });
    }
  });

  it("aprovar pela rota com o corpo da tela: cria fonte, documento e fila; a lista de fontes traz found_by_search e document_status", async () => {
    const c = await candidate(storage);
    const r = await http(hub, "POST", `/source-candidates/${c.id}/approve`, { fields: { ...screenFields({ title: "Fonte aprovada pelo contrato" }), checked: true } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(has(r.body, ["source_id", "document_id", "superseded", "job"])).toEqual([]);
    expect(r.body.read_error).toBeUndefined();
    const sources = await asAdmin<any[]>("app_ch_sources");
    const s = sources.find((x) => x.id === r.body.source_id);
    expect(s).toMatchObject({ found_by_search: true, title: "Fonte aprovada pelo contrato", authority_level: "B", source_type: "PCDT", specialty: "PEDIATRIA", theme: "Bronquiolite", status: "current" });
    // a tela pinta document_status com DOC_STATUS (recebido, extraindo, ..., falhou)
    expect(["received", "extracting", "classifying", "verifying_sources", "drafting", "awaiting_review", "failed"]).toContain(s.document_status);
    // fonte cadastrada à mão não leva o selo
    const manual = await asAdmin("app_ch_register_source", { p_source: { title: "Fonte à mão do contrato", organ: "Órgão", sha256: "a".repeat(64) } });
    expect((await asAdmin<any[]>("app_ch_sources")).find((x) => x.id === manual.id)).toMatchObject({ found_by_search: false, document_status: null });
    // "Ler de novo" (DecisionNotice) existe e responde {ok, job}
    const again = await http(hub, "POST", `/source-candidates/${c.id}/read`, {});
    expect(again.status).toBe(200);
    expect(again.body.ok).toBe(true);
    // o cartão aprovado vem pela lista de aprovados com decided_at
    const approved = (await asAdmin("app_ch_source_candidates", { p_status: "aprovado" })).items.find((x: any) => x.id === c.id);
    expect(approved).toMatchObject({ status: "aprovado" });
    expect(approved.decided_at).toBeTruthy();
  });

  it("substituição: a recusa começa com 'Confirme a substituição' (a tela pergunta) e confirm_replace:true conclui", async () => {
    const old = await asAdmin("app_ch_register_source", { p_source: { title: "PCDT do contrato", organ: "Ministério da Saúde", version: "2022", sha256: "b".repeat(64) } });
    const c = await candidate(storage, { ai_title: "pcdt do contrato" });
    const first = await http(hub, "POST", `/source-candidates/${c.id}/approve`, { fields: { ...screenFields(), checked: true } });
    expect(first.status).toBe(400);
    expect(first.body.error).toMatch(/^Confirme a substituição/);
    // o cartão mostrava o aviso "Vai substituir": replaces {title, version}
    const card = (await asAdmin("app_ch_source_candidates", { p_status: "aguardando" })).items.find((x: any) => x.id === c.id);
    expect(card.replaces).toMatchObject({ id: old.id, title: "PCDT do contrato", version: "2022" });
    const second = await http(hub, "POST", `/source-candidates/${c.id}/approve`, { fields: { ...screenFields(), checked: true, confirm_replace: true } });
    expect(second.status).toBe(201);
    expect(second.body.superseded).toBe(old.id);
  });

  it("sem a caixa 'Conferi' e com nível E: o banco recusa mesmo se a tela deixasse passar", async () => {
    const c = await candidate(storage);
    const noBox = await http(hub, "POST", `/source-candidates/${c.id}/approve`, { fields: screenFields() });
    expect(noBox.status).toBe(400);
    const levelE = await http(hub, "POST", `/source-candidates/${c.id}/approve`, { fields: { ...screenFields({ level: "E" }), checked: true } });
    expect(levelE.status).toBe(400);
    expect((await sql(`select status from public.ch_source_candidates where id = $1`, [c.id]))[0].status).toBe("aguardando");
  });

  it("rejeitar com {reason}: apaga o arquivo e o cartão sai de aguardando; motivo curto é recusado", async () => {
    const c = await candidate(signedStorage);
    expect((await http(hubSigned, "POST", `/source-candidates/${c.id}/reject`, { reason: "curto" })).status).toBe(400);
    const r = await http(hubSigned, "POST", `/source-candidates/${c.id}/reject`, { reason: "Documento de outro assunto, não serve." });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(await signedStorage.exists(c.key)).toBe(false);
    const rejected = (await asAdmin("app_ch_source_candidates", { p_status: "rejeitado" })).items.find((x: any) => x.id === c.id);
    expect(rejected).toMatchObject({ status: "rejeitado", decision_reason: "Documento de outro assunto, não serve." });
    // rejeitado: sem arquivo (a tela esconde o botão); a rota responde 404
    expect((await http(hubSigned, "GET", `/source-candidates/${c.id}/file`)).status).toBe(404);
  });

  it("arquivo guardado: {url} no Supabase, bytes de PDF no banco local, página web 409 (o botão some na tela)", async () => {
    const c = await candidate(signedStorage);
    const link = await http(hubSigned, "GET", `/source-candidates/${c.id}/file`);
    expect(link.status).toBe(200);
    expect(link.type).toContain("json");
    expect(link.body.url).toMatch(/^https:\/\/deposito\.test\//);
    const local = await candidate(storage);
    const bytes = await http(hub, "GET", `/source-candidates/${local.id}/file`);
    expect(bytes.status).toBe(200);
    expect(bytes.type).toContain("application/pdf");
    const web = await candidate(storage, {}, "html");
    const page = await http(hub, "GET", `/source-candidates/${web.id}/file`);
    expect(page.status).toBe(409);
    expect(page.body.error).toMatch(/Página web/);
    // o cartão da página web traz file_kind html, que é o que esconde o botão
    expect((await asAdmin("app_ch_source_candidate", { p_candidate_id: web.id })).file_kind).toBe("html");
  });

  it("só administrador: o editor não aprova, não rejeita e não abre arquivo", async () => {
    const c = await candidate(storage);
    const editor = await t.dev.createSession(t.EDITOR);
    const as = (method: string, p: string, body?: unknown) =>
      fetch(hub + p, { method, headers: { Authorization: `Bearer ${editor}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.status);
    expect(await as("POST", `/source-candidates/${c.id}/approve`, { fields: { ...screenFields(), checked: true } })).toBe(403);
    expect(await as("POST", `/source-candidates/${c.id}/reject`, { reason: "Não serve para o estudo." })).toBe(403);
    expect(await as("GET", `/source-candidates/${c.id}/file`)).toBe(403);
    expect(await as("GET", `/source-search/status`)).toBe(403);
  });
});
