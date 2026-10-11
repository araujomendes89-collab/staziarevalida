// @vitest-environment node
/**
 * Fontes oficiais com IA — rotas do servidor (/api/content-hub/source-*): status da busca, aprovar (põe a leitura na fila),
 * ler de novo sem duplicar, rejeitar (apaga o arquivo) e abrir o arquivo guardado; e a leitura de uma página web aprovada
 * (trechos sem página). Só administrador. Nenhum teste chama IA real nem a internet.
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
import { createContentHubWorker } from "../../server/contentHub/worker";
import { invalidateAiConfig } from "../../server/ai/config";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-rotas-"));
let t: FontesDb;
const servers: Server[] = [];
let admin = "";
let editor = "";
let storage: Storage;
/** Depósito com endereço assinado (como o Supabase): guarda os segundos pedidos. */
const signedSeconds: number[] = [];
let signedStorage: Storage;
let direct = "";
let signed = "";

const noAi = { provider: null, status: { ready: true, provider: "anthropic", model: "modelo-de-teste" } };
const depsOf = (s: Storage) => ({ db: t.db, storage: s, ai: noAi, renderer: null }) as any;
const listen = (s: Storage) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api/content-hub", createContentHubRouter(depsOf(s)));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub`));
    servers.push(srv);
  });
const call = async (base: string, token: string, p: string, init: RequestInit = {}) => {
  const r = await fetch(base + p, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, type, cache: r.headers.get("cache-control"), body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const post = (base: string, token: string, p: string, body?: unknown) =>
  call(base, token, p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;

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
      signedSeconds.push(s);
      return `https://deposito.test/${k}?expira=${s}`;
    },
  };
  direct = await listen(storage);
  signed = await listen(signedStorage);
  admin = await t.dev.createSession(t.ADMIN);
  editor = await t.dev.createSession(t.EDITOR);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

let seq = 0;
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
/** Candidato como o processamento cria (arquivo guardado + linha), no site gov.br/saude. */
async function candidate(s: Storage, kind: "pdf" | "html" = "pdf") {
  const n = ++seq;
  const text = `Protocolo sintetico numero ${n}. A gestante com pre-eclampsia grave deve ser encaminhada ao centro de referencia ${n}. Segundo paragrafo longo o bastante para virar um trecho de leitura da pagina ${n}.`;
  const bytes = kind === "pdf" ? makePdf([text]) : Buffer.from(`<html><head><title>Pagina ${n}</title></head><body><p>${text}</p><p>Outro paragrafo da pagina ${n} com texto suficiente para virar trecho da fonte oficial guardada.</p></body></html>`);
  const hash = sha(bytes);
  const key = `source-candidates/${hash}.${kind}`;
  await s.put(key, bytes, kind === "pdf" ? "application/pdf" : "text/html");
  const site = (await sql(`select id from public.ch_official_domains where address = 'www.gov.br/saude'`))[0];
  const link = `https://www.gov.br/saude/doc-${n}.${kind === "pdf" ? "pdf" : "html"}`;
  const r = await t.db.service<{ id: string }>("ch_worker_source_candidate_create", {
    p_candidate: {
      domain_id: site.id, requested_url: link, final_url: link, ai_title: `Protocolo ${n}`, ai_institution: "Ministério da Saúde", ai_published: "2025-03-14",
      ai_nature: "PCDT", ai_kind: "final", ai_level: "A", quote: text.slice(0, 80), quote_page: kind === "pdf" ? 1 : null, seen_in_search: true,
      file_kind: kind, sha256: hash, size_bytes: bytes.length, page_count: kind === "pdf" ? 1 : null, storage_path: key, preview: text,
      suggested_level: "A", suggested_kind: "final", suggested_nature: "PCDT",
    },
  });
  return { id: r.id, key, bytes, hash };
}
const FIELDS = (n = "") => ({ level: "B", title: `Protocolo aprovado ${n}`, institution: "Ministério da Saúde", checked: true });

describe("Rotas das fontes oficiais", () => {
  it("status da busca: desligada sem configuração, pronta com ela; editor recebe 403", async () => {
    const off = await call(direct, admin, "/source-search/status");
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ ready: false, max_searches: 5 });
    expect(off.body.problems.join(" ")).toMatch(/Desligada/);
    expect(Array.isArray(off.body.warnings)).toBe(true);

    await t.db.service("ch_worker_ai_set_provider", { p_actor: t.ADMIN, p_provider: "anthropic", p_enabled: true });
    await t.db.service("ch_worker_ai_save_function", {
      p_actor: t.ADMIN, p_key: "busca_fontes",
      p_config: { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-sonnet-5-5" }, fallback_ref: null, reviewers: [], care: "caprichado", max_searches: 7 },
    });
    invalidateAiConfig(t.db);
    const on = await call(direct, admin, "/source-search/status");
    expect(on.body).toMatchObject({ ready: true, problems: [], max_searches: 7 });
    expect(JSON.stringify(on.body)).not.toMatch(/sk-|ANTHROPIC_API_KEY/);

    expect((await call(direct, editor, "/source-search/status")).status).toBe(403);
    expect((await call(direct, editor, "/source-search/status")).body.error).toBe("Somente administradores.");
  });

  it("aprovar põe a leitura na fila e destrava; editor recebe 403", async () => {
    const c = await candidate(storage);
    expect((await post(direct, editor, `/source-candidates/${c.id}/approve`, { fields: FIELDS() })).status).toBe(403);
    const r = await post(direct, admin, `/source-candidates/${c.id}/approve`, { fields: FIELDS("a") });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ source_id: expect.any(String), document_id: expect.any(String), job: { duplicate: false } });
    expect(r.body.read_error).toBeUndefined();
    const jobs = await sql(`select step, status from public.ch_jobs where document_id = $1`, [r.body.document_id]);
    expect(jobs).toEqual([{ step: "extract", status: "queued" }]);
    expect((await sql(`select status from public.ch_source_candidates where id = $1`, [c.id]))[0].status).toBe("aprovado");
    // segunda aprovação: recusada pelo banco
    expect((await post(direct, admin, `/source-candidates/${c.id}/approve`, { fields: FIELDS("a") })).status).toBe(400);
    // id inválido
    expect((await post(direct, admin, `/source-candidates/nao-e-id/approve`, { fields: FIELDS() })).status).toBe(400);
  });

  it("Ler de novo não duplica o trabalho", async () => {
    const c = await candidate(storage);
    const a = await post(direct, admin, `/source-candidates/${c.id}/approve`, { fields: FIELDS("b") });
    const one = await post(direct, admin, `/source-candidates/${c.id}/read`);
    const two = await post(direct, admin, `/source-candidates/${c.id}/read`);
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect((await sql(`select count(*)::int as n from public.ch_jobs where document_id = $1 and step = 'extract'`, [a.body.document_id]))[0].n).toBe(1);
    // candidato que não foi aprovado não tem leitura
    const pending = await candidate(storage);
    expect((await post(direct, admin, `/source-candidates/${pending.id}/read`)).status).toBe(409);
    expect((await post(direct, editor, `/source-candidates/${c.id}/read`)).status).toBe(403);
  });

  it("rejeitar apaga o arquivo guardado, exige motivo e só administrador", async () => {
    const c = await candidate(storage);
    expect(await storage.exists(c.key)).toBe(true);
    expect((await post(direct, editor, `/source-candidates/${c.id}/reject`, { reason: "Não é o documento certo." })).status).toBe(403);
    const short = await post(direct, admin, `/source-candidates/${c.id}/reject`, { reason: "não" });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/pelo menos 10 caracteres/);
    expect(await storage.exists(c.key)).toBe(true);
    const ok = await post(direct, admin, `/source-candidates/${c.id}/reject`, { reason: "Não é o documento certo." });
    expect(ok.status).toBe(200);
    expect(await storage.exists(c.key)).toBe(false);
    expect((await sql(`select status, storage_path from public.ch_source_candidates where id = $1`, [c.id]))[0]).toEqual({ status: "rejeitado", storage_path: null });
    // o arquivo apagado não abre mais
    expect((await call(direct, admin, `/source-candidates/${c.id}/file`)).status).toBe(404);
  });

  it("rejeitar: falha ao apagar o arquivo não desfaz a rejeição", async () => {
    const c = await candidate(storage);
    const broken: Storage = { ...storage, remove: async () => { throw new Error("depósito fora do ar"); } };
    const url = await listen(broken);
    const ok = await post(url, admin, `/source-candidates/${c.id}/reject`, { reason: "Documento antigo demais." });
    expect(ok.status).toBe(200);
    expect((await sql(`select status from public.ch_source_candidates where id = $1`, [c.id]))[0].status).toBe("rejeitado");
  });

  it("abrir arquivo: link temporário de 60 s quando o armazenamento tem, bytes no desenvolvimento, página web 409", async () => {
    const c = await candidate(signedStorage);
    const link = await call(signed, admin, `/source-candidates/${c.id}/file`);
    expect(link.status).toBe(200);
    expect(link.body.url).toContain(c.key);
    expect(signedSeconds).toEqual([60]);

    const d = await candidate(storage);
    const raw = await call(direct, admin, `/source-candidates/${d.id}/file`);
    expect(raw.status).toBe(200);
    expect(raw.type).toContain("application/pdf");
    expect(raw.cache).toBe("private, no-store");
    expect(Buffer.compare(raw.body as Buffer, d.bytes)).toBe(0);

    const page = await candidate(storage, "html");
    const html = await call(direct, admin, `/source-candidates/${page.id}/file`);
    expect(html.status).toBe(409);
    expect(html.body.error).toBe("Página web: o arquivo não abre aqui. Veja o texto e abra no site oficial.");
    expect((await call(direct, editor, `/source-candidates/${d.id}/file`)).status).toBe(403);
  });

  it("página web aprovada vira trechos sem página; o PDF segue pelo caminho de sempre", async () => {
    const page = await candidate(storage, "html");
    const r = await post(direct, admin, `/source-candidates/${page.id}/approve`, { fields: FIELDS("web") });
    expect(r.status).toBe(201);
    const worker = createContentHubWorker(depsOf(storage));
    await worker.drain();
    const passages = await sql(`select page, section, text from public.ch_source_passages where source_id = $1`, [r.body.source_id]);
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.every((p) => p.page === null && p.section === null)).toBe(true);
    expect(passages.map((p) => p.text).join(" ")).toContain("pre-eclampsia grave");
    expect((await sql(`select status, text_kind from public.ch_documents where id = $1`, [r.body.document_id]))[0]).toEqual({ status: "awaiting_review", text_kind: "text" });
    expect((await sql(`select status from public.ch_jobs where document_id = $1 and step = 'extract'`, [r.body.document_id]))[0].status).toBe("succeeded");
  });
});
