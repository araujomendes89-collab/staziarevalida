// @vitest-environment node
/**
 * Central de Conteúdo sem regras de licença (decisão do dono, 2026-10-09): todo PDF de estudo enviado é material próprio,
 * liberado para adaptar e publicar, sem registro de autorização. PDF de fonte oficial segue como "somente referência".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { createContentHubRouter } from "../../server/contentHub/router";
import { MockProvider } from "../../server/contentHub/ai/provider";
import { mockRespond } from "../../server/contentHub/ai/mock";
import { stepVersions, type PipelineDeps } from "../../server/contentHub/pipeline";
import { createContentHubWorker } from "../../server/contentHub/worker";
import type { AuthUser } from "../../src/novo/data/backend";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sem-licenca-"));
const ADMIN = "00000000-0000-4000-8000-0000000000a7";
const EDITOR = "00000000-0000-4000-8000-0000000000e7";
const PDF_A = Buffer.from("%PDF-1.4\n% estudo A sem licenca\n%%EOF\n");
const PDF_B = Buffer.from("%PDF-1.4\n% estudo B sem licenca\n%%EOF\n");
const PDF_SRC = Buffer.from("%PDF-1.7\n% fonte oficial sem licenca\n%%EOF\n");
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
let dev: DevDatabase;
let db: ContentDb;
let storage: Storage;
let admin: string;
let editor: string;
let direct: string;
let signed: string;
const servers: Server[] = [];
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;

const store = new Map<string, Buffer>();
const signedStorage: Storage = {
  async put(k, d) {
    store.set(k, d);
    return k;
  },
  async get(k) {
    const d = store.get(k);
    if (!d) throw new Error("Arquivo não encontrado.");
    return d;
  },
  async exists(k) {
    return store.has(k);
  },
  async signedUrl(k, s) {
    return `https://deposito.test/${k}?expira=${s}`;
  },
  async signedUpload(k) {
    return { path: k, token: "token" };
  },
  async remove(keys) {
    for (const k of keys) store.delete(k);
  },
};
const listen = (st: Storage) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api/content-hub", createContentHubRouter({ db, storage: st, ai: { provider: null, status: { ready: true, provider: "anthropic", model: "modelo-de-teste" } }, renderer: null } as any));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  return { status: r.status, body: (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : null };
};
const postJson = (url: string, token: string, body: unknown) => call(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  storage = localStorageDir(path.join(tmp, "files"));
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad7@t.dev'), ($2, 'ed7@t.dev')`, [ADMIN, EDITOR]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  direct = await listen(localStorageDir(path.join(tmp, "files-direct")));
  signed = await listen(signedStorage);
  admin = await dev.createSession(ADMIN);
  editor = await dev.createSession(EDITOR);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Envio de PDF: sempre material próprio", () => {
  it("envio pelo servidor ignora direitos e observação enviados pelo cliente", async () => {
    const r = await call(`${direct}/documents?rights_status=unauthorized&rights_note=x`, editor, { method: "POST", headers: { "Content-Type": "application/pdf", "X-File-Name": "a.pdf" }, body: PDF_A });
    expect(r.status).toBe(201);
    const row = (await sql(`select rights_status, rights_note from public.ch_documents where id = $1`, [r.body.id]))[0];
    expect(row).toEqual({ rights_status: "own", rights_note: null });
  });

  it("confirmação do envio direto ignora direitos e observação do corpo", async () => {
    const prep = (await postJson(`${signed}/documents/upload`, editor, { size_bytes: PDF_B.length })).body;
    store.set(prep.key, PDF_B);
    const r = await postJson(`${signed}/documents/confirm`, editor, { key: prep.key, name: "b.pdf", rights_status: "unauthorized", rights_note: "x" });
    expect(r.status).toBe(201);
    const row = (await sql(`select rights_status, rights_note from public.ch_documents where id = $1`, [r.body.id]))[0];
    expect(row).toEqual({ rights_status: "own", rights_note: null });
  });

  it("PDF de fonte oficial segue como somente referência", async () => {
    const src = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('PCDT SINTÉTICO sem licença', 'Órgão de teste', 'final', '1', 'A') returning id`))[0].id;
    const prep = (await postJson(`${signed}/sources/${src}/document/upload`, admin, { size_bytes: PDF_SRC.length })).body;
    store.set(prep.key, PDF_SRC);
    const done = await postJson(`${signed}/sources/${src}/document/confirm`, admin, { key: prep.key, name: "pcdt.pdf", rights_status: "own" });
    expect(done.status).toBe(201);
    const row = (await sql(`select rights_status, purpose from public.ch_documents where id = $1`, [done.body.id]))[0];
    expect(row).toEqual({ rights_status: "reference_only", purpose: "reference_source" });
  });
});

describe("Publicação sem trava de licença", () => {
  it("licença vencida do material de origem não bloqueia mais a publicação de adaptação", async () => {
    await dev.db.query(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
    const doc = (await sql(`insert into public.ch_documents (owner_id, name, sha256, storage_path, mime, rights_status) values ($1, 'Apostila vencida', $2, 'documents/v.pdf', 'application/pdf', 'unknown') returning id`, [ADMIN, crypto.randomBytes(32).toString("hex")]))[0].id;
    await db.service("ch_worker_save_extraction", { p_document_id: doc, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text" }], p_blocks: [{ page_no: 1, idx: 0, type: "paragraph", text: "Bronquiolite: suporte clínico." }] });
    const block = (await sql(`select id from public.ch_blocks where document_id = $1`, [doc]))[0].id;
    await rpc(ADMIN, "app_ch_register_license", doc, {
      licensor: "Curso Modelo Ltda.", work_title: "Apostila Modelo", granted_on: "2026-09-01", expires_on: "2028-09-01", allows_adaptation: true,
      allows_visual_redesign: true, allows_attribution_removal: false, allows_commercial_use: true,
      authorization_reference: "Contrato sintético 2026/09 (arquivado)", terms_text: "TEXTO SINTÉTICO DE TESTE: o licenciante autoriza a adaptação do material para uso comercial.", reference_terms: ["Curso Modelo"],
    });
    await sql(`update public.ch_licenses set expires_on = current_date - 1, granted_on = current_date - 30 where document_id = $1`, [doc]);
    const claim = await rpc(ADMIN, "app_ch_add_claim", { statement: "Bronquiolite: suporte clínico.", document_id: doc, block_id: block });
    const theme = (await sql(`select id from public.ch_taxonomy_nodes where level = 'theme' limit 1`))[0].id;
    const unit = await rpc(ADMIN, "app_ch_create_unit", theme, "Bronquiolite");
    const version = (await sql(`select id from public.ch_unit_versions where unit_id = $1`, [unit]))[0].id;
    await rpc(ADMIN, "app_ch_save_unit_version", version, { sections: [{ paragraphs: [{ text: "Suporte.", clinical: true, claim_ids: [claim] }] }] }, "adaptation");
    await sql(`update public.ch_unit_versions set status = 'approved' where id = $1`, [version]);
    let msg = "";
    try {
      await rpc(ADMIN, "app_ch_publish", version);
    } catch (e: any) {
      msg = String(e.message);
    }
    expect(msg).not.toMatch(/licença.*vencida/);
  });
});

describe("Rascunho do processamento", () => {
  it("todo rascunho nasce como adaptação, qualquer que seja o direito do documento e sem licença", async () => {
    const account: AuthUser = await dev.core.createAccount("Admin Pipeline", "admin-pipe@teste.local", "senha-forte-123", true);
    const provider = new MockProvider((req) => mockRespond(req));
    const deps = (): PipelineDeps => ({ db, storage, ai: { provider, status: { ready: true, provider: "mock", model: provider.model, isMock: true, pending: null } }, renderer: null });
    const src = await db.asUser<{ id: string }>(account, "app_ch_register_source", { p_source: { title: "Fonte sintética", organ: "Órgão de teste", version: "1", published_on: "2026-01-01", url: "https://exemplo.invalid/f.pdf" } });
    const T = "Texto sintético de teste.";
    const passage = `${T} Na bronquiolite viral aguda, a oxigenoterapia deve ser iniciada quando a saturação estiver abaixo de 92%.`;
    await db.asUser(account, "app_ch_add_passage", { p_source_id: src.id, p_passage: { section: "Tratamento", page: 12, text: passage } });
    const bytes = Buffer.from("%PDF-1.7 apostila sem direitos");
    const key = `documents/${sha(bytes)}.pdf`;
    await storage.put(key, bytes, "application/pdf");
    const doc = (await db.asUser<{ id: string }>(account, "app_ch_register_document", { p_doc: { name: "Apostila sintética", sha256: sha(bytes), storage_path: key, rights_status: "unauthorized" } })).id;
    await db.service("ch_worker_save_extraction", {
      p_document_id: doc, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }],
      p_blocks: [{ page_no: 1, idx: 0, type: "heading", text: "Bronquiolite viral aguda" }, { page_no: 1, idx: 1, type: "paragraph", text: passage }].map((b) => ({ ...b, bbox: [0, 0, 1, 1] })),
    });
    await db.service("ch_worker_next", { p_document_id: doc, p_step: "classify", p_versions: stepVersions("classify", deps()) });
    await createContentHubWorker(deps()).drain();
    const versions = await sql(`select v.origin from public.ch_unit_versions v join public.ch_unit_claims uc on uc.unit_version_id = v.id join public.ch_claims c on c.id = uc.claim_id where c.document_id = $1`, [doc]);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.every((v) => v.origin === "adaptation")).toBe(true);
    expect((await sql(`select count(*)::int n from public.ch_licenses where document_id = $1`, [doc]))[0].n).toBe(0);
  });
});
