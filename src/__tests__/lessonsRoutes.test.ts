// @vitest-environment node
/**
 * Rotas /api/lessons (servidor) com o banco de desenvolvimento: envio pelo servidor (banco local) e envio direto ao
 * depósito com token assinado (o caminho usado com o Supabase, aqui com um depósito simulado). O banco decide quem vê.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { createLessonsRouter } from "../../server/lessons/router";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lessons-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(61)]);
let dev: DevDatabase;
let db: ContentDb;
let servers: Server[] = [];
let direct: string;
let signed: string;
let editor: string;
let student: string;
let lessonId: string;
let draftId: string;

// depósito simulado que, como o Supabase, oferece envio e leitura assinados
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
};

const sqlAs = (uid: string, q: string, p: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(q, p)).rows;
  });
const listen = (storage: Storage) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api/lessons", createLessonsRouter({ db, storage }));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/lessons`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const postJson = (url: string, token: string, body: unknown) => call(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const postRaw = (url: string, token: string, type: string, body: Buffer) => call(url, token, { method: "POST", headers: { "Content-Type": type, "X-File-Name": "aula.pdf" }, body });

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed@t.dev'), ($2, 'al@t.dev'), ($3, 'ad@t.dev')`, [EDITOR, STUDENT, ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  const save = async (lesson: Record<string, unknown>) => (await sqlAs(EDITOR, `select public.app_admin_save_lesson($1::jsonb) r`, [JSON.stringify(lesson)]))[0].r;
  lessonId = (await save({ area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite viral aguda", published: true, review_note: "Conferido no material da aula pela equipe." })).id;
  draftId = (await save({ area: "PEDIATRIA", topic: "Bronquiolite", title: "Rascunho" })).id;
  direct = await listen(localStorageDir(path.join(tmp, "files")));
  signed = await listen(signedStorage);
  editor = await dev.createSession(EDITOR);
  student = await dev.createSession(STUDENT);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Envio pelo servidor (banco local)", () => {
  it("só a equipe envia; o arquivo precisa ser do tipo declarado; o endereço da aula é conferido", async () => {
    expect((await postJson(`${direct}/${lessonId}/upload`, editor, { kind: "slides", content_type: "application/pdf", size_bytes: PDF.length })).body).toEqual({ mode: "direct" });
    expect((await postRaw(`${direct}/${lessonId}/materials?kind=slides`, student, "application/pdf", PDF)).status).toBe(403);
    expect((await postRaw(`${direct}/${lessonId}/materials?kind=slides`, editor, "application/pdf", Buffer.from("não é pdf"))).status).toBe(415);
    expect((await postRaw(`${direct}/..%2F..%2Fx/materials?kind=slides`, editor, "application/pdf", PDF)).status).toBe(400);
    expect((await postRaw(`${direct}/${lessonId}/materials?kind=flashcast`, editor, "application/pdf", PDF)).status).toBe(400);
    const r = await postRaw(`${direct}/${lessonId}/materials?kind=slides&title=Slides`, editor, "application/pdf", PDF);
    expect(r.status).toBe(201);
    expect(r.body.materials).toEqual([expect.objectContaining({ kind: "slides", file_title: "Slides", title: "Material complementar", has_file: true, size_bytes: PDF.length })]);
  });

  it("aluno abre o material de aula publicada (sem endereço assinado, baixa pelo servidor); de rascunho, não", async () => {
    const mat = (await sqlAs(STUDENT, `select public.app_lesson($1) r`, [lessonId]))[0].r.materials[0];
    expect((await call(`${direct}/materials/${mat.id}/link`, student)).body).toEqual({ url: null });
    const file = await call(`${direct}/materials/${mat.id}/file`, student);
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
    const draft = await postRaw(`${direct}/${draftId}/materials?kind=slides&title=Rascunho`, editor, "application/pdf", PDF);
    const draftMat = draft.body.materials[0];
    expect((await call(`${direct}/materials/${draftMat.id}/link`, student)).status).toBe(404);
    expect((await call(`${direct}/materials/${draftMat.id}/file`, student)).status).toBe(404);
    expect((await call(`${direct}/materials/${draftMat.id}/file`, editor)).status).toBe(200);
  });
});

describe("Envio direto ao depósito (Supabase)", () => {
  it("prepara o envio assinado, confere que o arquivo chegou, registra; aluno recebe endereço assinado", async () => {
    expect((await postJson(`${signed}/${lessonId}/upload`, student, { kind: "flashcast", content_type: "audio/mpeg", size_bytes: 1000 })).status).toBe(403);
    expect((await postJson(`${signed}/${lessonId}/upload`, editor, { kind: "slides", content_type: "audio/mpeg", size_bytes: 1000 })).status).toBe(400);
    expect((await postJson(`${signed}/${lessonId}/upload`, editor, { kind: "flashcast", content_type: "audio/mpeg", size_bytes: 500 * 1024 * 1024 })).status).toBe(413);
    const prep = await postJson(`${signed}/${lessonId}/upload`, editor, { kind: "flashcast", content_type: "audio/mpeg", size_bytes: MP3.length });
    expect(prep.body).toMatchObject({ mode: "signed", bucket: "lessons", token: expect.stringMatching(/^token-/) });
    expect(prep.body.key).toMatch(new RegExp(`^lessons/${lessonId}/flashcast-[0-9a-f]{16}\\.mp3$`));
    const confirm = { kind: "flashcast", key: prep.body.key, title: "Flashcast", content_type: "audio/mpeg", size_bytes: MP3.length };
    expect((await postJson(`${signed}/${lessonId}/materials/confirm`, editor, confirm)).body.error).toMatch(/não chegou/);
    store.set(prep.body.key, MP3); // o navegador enviou direto ao depósito
    expect((await postJson(`${signed}/${draftId}/materials/confirm`, editor, confirm)).body.error).toMatch(/Caminho/);
    const done = await postJson(`${signed}/${lessonId}/materials/confirm`, editor, confirm);
    expect(done.status).toBe(201);
    const audio = done.body.materials.find((m: any) => m.kind === "flashcast");
    expect(audio).toMatchObject({ file_title: "Flashcast", title: "Áudio Flashcast", has_file: true });
    // áudio enviado pelo editor aguarda conferência: o aluno não ouve nem recebe o link assinado
    expect(audio).toMatchObject({ review_status: "pending" });
    expect((await call(`${signed}/materials/${audio.id}/link`, student)).status).toBe(404);
    expect((await call(`${signed}/materials/${audio.id}/link`, editor)).status).toBe(200); // a equipe ouve para conferir
    await sqlAs(ADMIN, `select public.app_admin_release_lesson_audio($1::uuid)`, [audio.id]);
    const link = await call(`${signed}/materials/${audio.id}/link`, student);
    expect(link.body.url).toBe(`https://deposito.test/${prep.body.key}?expira=21600`); // A04: o áudio vale 6 horas, para ouvir a aula inteira
    // PDF continua com o endereço curto de 10 minutos
    const pdfKey = `lessons/${lessonId}/slides-0123456789abcdef.pdf`;
    store.set(pdfKey, Buffer.from("%PDF-1.4"));
    const withPdf = await postJson(`${signed}/${lessonId}/materials/confirm`, editor, { kind: "slides", key: pdfKey, title: "x", content_type: "application/pdf", size_bytes: 8 });
    const pdf = withPdf.body.materials.find((m: any) => m.kind === "slides");
    expect((await call(`${signed}/materials/${pdf.id}/link`, student)).body.url).toBe(`https://deposito.test/${pdfKey}?expira=600`);
    expect((await call(`${signed}/materials/abc/link`, student)).status).toBe(400);
  });
});
