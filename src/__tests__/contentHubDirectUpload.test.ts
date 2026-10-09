/**
 * Central de Conteúdo: o PDF vai direto do navegador ao depósito (Supabase), sem passar pelo limite de 4,5 MB do corpo
 * das funções da Vercel (erro 413 em "Importar PDF" com arquivo grande). O servidor prepara o envio assinado, confere o
 * arquivo que chegou (assinatura %PDF-, hash), guarda no lugar definitivo e registra. Abrir o original também não passa
 * pela Vercel: o servidor devolve um endereço assinado. No banco local (sem envio assinado), tudo segue pelo servidor.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hub-upload-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e2";
const STUDENT = "00000000-0000-4000-8000-0000000000b2";
const ADMIN = "00000000-0000-4000-8000-0000000000a2";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");
const PDF2 = Buffer.from("%PDF-1.7\n% fonte oficial\n%%EOF\n");
const SHA = crypto.createHash("sha256").update(PDF).digest("hex");
let dev: DevDatabase;
let db: ContentDb;
const servers: Server[] = [];
let direct: string;
let signed: string;
let editor: string;
let student: string;
let admin: string;

// depósito simulado que, como o Supabase, oferece envio e leitura assinados e apaga arquivos
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
    return { path: k, token: `token-${k.length}` };
  },
  async remove(keys) {
    for (const k of keys) store.delete(k);
  },
};

const deps = (storage: Storage) => ({ db, storage, ai: { provider: null, status: { ready: true, provider: "anthropic", model: "modelo-de-teste" } }, renderer: null }) as any;
const listen = (storage: Storage) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api/content-hub", createContentHubRouter(deps(storage)));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const postJson = (url: string, token: string, body: unknown) => call(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const postRaw = (url: string, token: string, body: Buffer) => call(url, token, { method: "POST", headers: { "Content-Type": "application/pdf", "X-File-Name": "diretriz.pdf" }, body });

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed2@t.dev'), ($2, 'al2@t.dev'), ($3, 'ad2@t.dev')`, [EDITOR, STUDENT, ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  direct = await listen(localStorageDir(path.join(tmp, "files")));
  signed = await listen(signedStorage);
  editor = await dev.createSession(EDITOR);
  student = await dev.createSession(STUDENT);
  admin = await dev.createSession(ADMIN);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Envio direto ao depósito (Supabase)", () => {
  it("prepara o envio só para a equipe, dentro do tamanho máximo, num caminho temporário", async () => {
    expect((await postJson(`${signed}/documents/upload`, student, { size_bytes: 1000 })).status).toBe(403);
    expect((await postJson(`${signed}/documents/upload`, editor, { size_bytes: 0 })).status).toBe(400);
    expect((await postJson(`${signed}/documents/upload`, editor, { size_bytes: 301 * 1024 * 1024 })).status).toBe(413);
    const prep = await postJson(`${signed}/documents/upload`, editor, { size_bytes: 25 * 1024 * 1024 });
    expect(prep.status).toBe(200);
    expect(prep.body).toMatchObject({ mode: "signed", bucket: "content-hub", token: expect.stringMatching(/^token-/) });
    expect(prep.body.key).toMatch(/^uploads\/[0-9a-f]{32}\.pdf$/);
    expect(prep.body.path).toBe(prep.body.key);
  });

  it("confere o arquivo que chegou: caminho, presença e assinatura de PDF (o que não é PDF é apagado)", async () => {
    const prep = (await postJson(`${signed}/documents/upload`, editor, { size_bytes: PDF.length })).body;
    const confirm = { key: prep.key, name: "diretriz.pdf" };
    expect((await postJson(`${signed}/documents/confirm`, student, confirm)).status).toBe(403);
    const missing = await postJson(`${signed}/documents/confirm`, editor, confirm);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/não chegou/);
    for (const key of ["documents/x.pdf", "uploads/../documents/x.pdf", "uploads/abc.pdf", 42]) {
      const bad = await postJson(`${signed}/documents/confirm`, editor, { ...confirm, key });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toMatch(/Caminho/);
    }
    store.set(prep.key, Buffer.from("não é pdf"));
    expect((await postJson(`${signed}/documents/confirm`, editor, confirm)).status).toBe(415);
    expect(store.has(prep.key)).toBe(false);
  });

  it("registra o documento com o hash, guarda o original no lugar definitivo, apaga o temporário e põe na fila", async () => {
    const prep = (await postJson(`${signed}/documents/upload`, editor, { size_bytes: PDF.length })).body;
    store.set(prep.key, PDF); // o navegador enviou direto ao depósito
    const meta = { key: prep.key, name: "Diretriz grande.pdf", author: "Autor de teste", language: "pt-BR", rights_status: "unknown", source_note: "site oficial" };
    const done = await postJson(`${signed}/documents/confirm`, editor, meta);
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ id: expect.any(String), duplicate: false, sha256: SHA, job: expect.objectContaining({ id: expect.any(String) }) });
    expect(Buffer.compare(store.get(`documents/${SHA}.pdf`)!, PDF)).toBe(0);
    expect(store.has(prep.key)).toBe(false);
    const row = (await dev.db.query<any>(`select name, author, storage_path, provenance from public.ch_documents where id = $1`, [done.body.id])).rows[0];
    expect(row).toMatchObject({ name: "Diretriz grande.pdf", author: "Autor de teste", storage_path: `documents/${SHA}.pdf` });
    expect(row.provenance).toMatchObject({ original_file_name: "Diretriz grande.pdf", size_bytes: PDF.length, source: "site oficial" });

    // o mesmo arquivo de novo: abre o que já existe, sem duplicar
    const again = (await postJson(`${signed}/documents/upload`, editor, { size_bytes: PDF.length })).body;
    store.set(again.key, PDF);
    const dup = await postJson(`${signed}/documents/confirm`, editor, { key: again.key, name: "outra cópia.pdf" });
    expect(dup.status).toBe(200);
    expect(dup.body).toMatchObject({ id: done.body.id, duplicate: true });
    expect(store.has(again.key)).toBe(false);
  });

  it("PDF completo de uma fonte oficial também vai direto ao depósito (anexar à fonte segue só para administrador)", async () => {
    const src = (await dev.db.query<any>(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('PCDT SINTÉTICO envio', 'Ministério de teste', 'final', '1', 'A') returning id`)).rows[0].id;
    expect((await postJson(`${signed}/sources/${src}/document/upload`, student, { size_bytes: PDF2.length })).status).toBe(403);
    const tried = (await postJson(`${signed}/sources/${src}/document/upload`, editor, { size_bytes: PDF2.length })).body;
    store.set(tried.key, PDF2);
    expect((await postJson(`${signed}/sources/${src}/document/confirm`, editor, { key: tried.key, name: "pcdt.pdf" })).status).toBe(403);
    expect(store.has(tried.key)).toBe(false);
    const prep = (await postJson(`${signed}/sources/${src}/document/upload`, admin, { size_bytes: PDF2.length })).body;
    expect(prep).toMatchObject({ mode: "signed", bucket: "content-hub" });
    store.set(prep.key, PDF2);
    const done = await postJson(`${signed}/sources/${src}/document/confirm`, admin, { key: prep.key, name: "pcdt.pdf" });
    expect(done.status).toBe(201);
    const sha2 = crypto.createHash("sha256").update(PDF2).digest("hex");
    const row = (await dev.db.query<any>(`select s.sha256, d.purpose from public.ch_sources s join public.ch_documents d on d.id = s.document_id where s.id = $1`, [src])).rows[0];
    expect(row).toMatchObject({ sha256: sha2, purpose: "reference_source" });
    expect(store.has(prep.key)).toBe(false);
  });

  it("abrir o original devolve um endereço assinado (o arquivo não passa pela Vercel); aluno não abre", async () => {
    const id = (await dev.db.query<any>(`select id from public.ch_documents where sha256 = $1`, [SHA])).rows[0].id;
    const link = await call(`${signed}/documents/${id}/link`, editor);
    expect(link.status).toBe(200);
    expect(link.body).toEqual({ url: `https://deposito.test/documents/${SHA}.pdf?expira=3600` });
    expect([403, 404]).toContain((await call(`${signed}/documents/${id}/link`, student)).status);
  });
});

describe("Envio pelo servidor (banco local, sem envio assinado)", () => {
  it("o preparo responde 'direct', o envio bruto continua valendo e o original sai pelo servidor", async () => {
    expect((await postJson(`${direct}/documents/upload`, editor, { size_bytes: PDF2.length })).body).toEqual({ mode: "direct" });
    const sent = await postRaw(`${direct}/documents`, editor, Buffer.from("%PDF-1.5\n% local\n%%EOF\n"));
    expect(sent.status).toBe(201);
    expect((await call(`${direct}/documents/${sent.body.id}/link`, editor)).body).toEqual({ url: null });
    const file = await call(`${direct}/documents/${sent.body.id}/file`, editor);
    expect(file.status).toBe(200);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
