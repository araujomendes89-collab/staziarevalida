// @vitest-environment node
/**
 * Rotas /api/question-figures (servidor) com o banco de desenvolvimento: envio da figura da questão (Q07, leva 3), pelo servidor
 * (banco local) e direto ao depósito com token assinado (o caminho do Supabase, aqui com um depósito simulado). Limites de tamanho
 * e tipo, conferência do conteúdo do arquivo, nome neutro, quem pode enviar e quem recebe o endereço da figura.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { createQuestionFiguresRouter } from "../../server/questions/figures";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "figuras-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const REVIEWER = "00000000-0000-4000-8000-0000000000c1";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 2)]);
const ALT = "Eletrocardiograma de 12 derivações com supradesnivelamento de ST";
const QID = "revalida_2024_1_q901";
const QID2 = "revalida_2024_1_q902";
let dev: DevDatabase;
let db: ContentDb;
const servers: Server[] = [];
let direct: string;
let signed: string;
let editor: string;
let student: string;
let reviewer: string;
let admin: string;

const store = new Map<string, Buffer>();
const removed: string[] = [];
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
    for (const k of keys) {
      store.delete(k);
      removed.push(k);
    }
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
    app.use("/api/question-figures", createQuestionFiguresRouter({ db, storage }));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/question-figures`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, headers: r.headers, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const postJson = (url: string, token: string, body: unknown) => call(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const postRaw = (url: string, token: string, type: string, body: Buffer) => call(url, token, { method: "POST", headers: { "Content-Type": type }, body });
const images = async (id: string) => (await dev.db.query<any>(`select images from public.questions where id = $1`, [id])).rows[0].images;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed@t.dev'), ($2, 'al@t.dev'), ($3, 'ad@t.dev'), ($4, 'rv@t.dev')`, [EDITOR, STUDENT, ADMIN, REVIEWER]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await dev.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVIEWER]);
  for (const n of [901, 902]) {
    await sqlAs(EDITOR, `select public.app_admin_save_question($1::jsonb)`, [
      JSON.stringify({ kind: "REVALIDA", year: 2024, semester: 1, number: n, area: "PEDIATRIA", topic: "ECG", statement: `Paciente com dor torácica (questão ${n}), veja o ECG.`, options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alt ${id}`, explanation: "" })), correct_option: "B", status: "valid", needs_image: true }),
    ]);
  }
  direct = await listen(localStorageDir(path.join(tmp, "files")));
  signed = await listen(signedStorage);
  editor = await dev.createSession(EDITOR);
  student = await dev.createSession(STUDENT);
  reviewer = await dev.createSession(REVIEWER);
  admin = await dev.createSession(ADMIN);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Envio pelo servidor (banco local)", () => {
  it("a equipe envia PNG ou JPG com o texto alternativo; o aluno, o revisor médico e quem não entrou não enviam", async () => {
    expect((await postJson(`${direct}/${QID}/upload`, editor, { content_type: "image/png", size_bytes: PNG.length })).body).toEqual({ mode: "direct" });
    const url = `${direct}/${QID}/figure?alt=${encodeURIComponent(ALT)}`;
    expect((await postRaw(url, student, "image/png", PNG)).status).toBe(403);
    expect((await postRaw(url, reviewer, "image/png", PNG)).status).toBe(403);
    expect((await fetch(url, { method: "POST", headers: { "Content-Type": "image/png" }, body: PNG })).status).toBe(401);
    expect(await images(QID)).toEqual([]);
    const done = await postRaw(url, editor, "image/png", PNG);
    expect(done.status).toBe(201);
    const [fig] = done.body.images;
    // nome neutro: sorteado, sem o código da questão nem o nome do arquivo de quem enviou
    expect(fig.path).toMatch(/^questoes\/[0-9a-f]{32}\.png$/);
    expect(fig.alt).toBe(ALT);
    expect(Object.keys(fig).sort()).toEqual(["alt", "path"]);
    expect(await images(QID)).toEqual([fig]);
  });

  it("recusa tipo errado, conteúdo que não bate com o tipo, arquivo vazio, grande demais, questão inexistente e texto alternativo curto", async () => {
    const q = `alt=${encodeURIComponent(ALT)}`;
    expect((await postRaw(`${direct}/${QID2}/figure?${q}`, editor, "image/gif", PNG)).status).toBe(415);
    expect((await postRaw(`${direct}/${QID2}/figure?${q}`, editor, "application/pdf", Buffer.from("%PDF-1.4"))).status).toBe(415);
    expect((await postRaw(`${direct}/${QID2}/figure?${q}`, editor, "image/png", Buffer.from("isto não é uma imagem"))).status).toBe(415);
    expect((await postRaw(`${direct}/${QID2}/figure?${q}`, editor, "image/png", JPG)).status).toBe(415); // JPG dito como PNG
    expect((await postRaw(`${direct}/${QID2}/figure?${q}`, editor, "image/png", Buffer.alloc(0))).status).toBe(400);
    expect((await postRaw(`${direct}/${QID2}/figure?${q}`, editor, "image/png", Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))).status).toBe(413);
    expect((await postRaw(`${direct}/questao_que_nao_existe/figure?${q}`, editor, "image/png", PNG)).status).toBe(404);
    expect((await postRaw(`${direct}/${QID2}/figure?alt=curto`, editor, "image/png", PNG)).body.error).toMatch(/texto alternativo/);
    expect((await postRaw(`${direct}/${QID2}/figure`, editor, "image/png", PNG)).body.error).toMatch(/texto alternativo/);
    expect((await postRaw(`${direct}/..%2F..%2Fx/figure?${q}`, editor, "image/png", PNG)).status).toBe(400);
    expect(await images(QID2)).toEqual([]);
    expect(fs.existsSync(path.join(tmp, "files/questoes")) ? fs.readdirSync(path.join(tmp, "files/questoes")).length : 0).toBe(1); // só a figura da questão 901
  });

  it("trocar a figura apaga a anterior do depósito; tirar apaga e devolve a questão sem figura", async () => {
    const before = (await images(QID))[0].path;
    const url = `${direct}/${QID}/figure?alt=${encodeURIComponent("Radiografia de tórax em PA com derrame pleural à direita")}`;
    const swapped = await postRaw(url, editor, "image/jpeg", JPG);
    expect(swapped.status).toBe(201);
    expect(swapped.body.images[0].path).toMatch(/\.jpg$/);
    expect(swapped.body.images[0].path).not.toBe(before);
    expect(fs.existsSync(path.join(tmp, "files", before))).toBe(false);
    expect(fs.existsSync(path.join(tmp, "files", swapped.body.images[0].path))).toBe(true);
    expect((await call(`${direct}/${QID}/figure`, student, { method: "DELETE" })).status).toBe(403);
    const gone = await call(`${direct}/${QID}/figure`, admin, { method: "DELETE" });
    expect(gone.status).toBe(200);
    expect(gone.body.images).toEqual([]);
    expect(fs.existsSync(path.join(tmp, "files", swapped.body.images[0].path))).toBe(false);
  });

  it("o aluno abre a figura da questão (baixa pelo servidor); índice errado ou questão sem figura dá 404", async () => {
    const sent = await postRaw(`${direct}/${QID}/figure?alt=${encodeURIComponent(ALT)}`, editor, "image/png", PNG);
    expect(sent.status).toBe(201);
    expect((await call(`${direct}/${QID}/0/link`, student)).body).toEqual({ url: null });
    const file = await call(`${direct}/${QID}/0/file`, student);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("cache-control")).toMatch(/private/);
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);
    expect((await call(`${direct}/${QID}/1/file`, student)).status).toBe(404);
    expect((await call(`${direct}/${QID2}/0/file`, student)).status).toBe(404);
    expect((await fetch(`${direct}/${QID}/0/file`)).status).toBe(401);
  });
});

describe("Envio direto ao depósito (Supabase)", () => {
  it("prepara o envio assinado, confere o arquivo que chegou, registra e apaga a figura anterior; o aluno recebe endereço assinado", async () => {
    expect((await postJson(`${signed}/${QID2}/upload`, student, { content_type: "image/png", size_bytes: 1000 })).status).toBe(403);
    expect((await postJson(`${signed}/${QID2}/upload`, editor, { content_type: "image/gif", size_bytes: 1000 })).status).toBe(415);
    expect((await postJson(`${signed}/${QID2}/upload`, editor, { content_type: "image/png", size_bytes: 6 * 1024 * 1024 })).status).toBe(413);
    expect((await postJson(`${signed}/${QID2}/upload`, editor, { content_type: "image/png", size_bytes: 0 })).status).toBe(400);
    const prep = await postJson(`${signed}/${QID2}/upload`, editor, { content_type: "image/png", size_bytes: PNG.length });
    expect(prep.body).toMatchObject({ mode: "signed", bucket: "question-figures", token: expect.stringMatching(/^token-/) });
    expect(prep.body.key).toMatch(/^questoes\/[0-9a-f]{32}\.png$/);
    const confirm = { key: prep.body.key, alt: ALT, content_type: "image/png" };
    expect((await postJson(`${signed}/${QID2}/confirm`, editor, confirm)).body.error).toMatch(/não chegou/);
    store.set(prep.body.key, PNG); // o navegador enviou direto ao depósito
    expect((await postJson(`${signed}/${QID2}/confirm`, student, confirm)).status).toBe(403);
    expect((await postJson(`${signed}/${QID2}/confirm`, editor, { ...confirm, key: "questoes/ECG-do-Joao.png" })).body.error).toMatch(/Caminho/);
    expect((await postJson(`${signed}/${QID2}/confirm`, editor, { ...confirm, key: prep.body.key.replace(/png$/, "jpg") })).status).toBe(400);
    expect((await postJson(`${signed}/${QID2}/confirm`, editor, { ...confirm, alt: "curto" })).body.error).toMatch(/texto alternativo/);
    const done = await postJson(`${signed}/${QID2}/confirm`, editor, confirm);
    expect(done.status).toBe(201);
    expect(done.body.images).toEqual([{ path: prep.body.key, alt: ALT }]);
    const link = await call(`${signed}/${QID2}/0/link`, student);
    expect(link.body.url).toBe(`https://deposito.test/${prep.body.key}?expira=3600`);
    // trocar: o arquivo anterior sai do depósito
    const prep2 = await postJson(`${signed}/${QID2}/upload`, editor, { content_type: "image/jpeg", size_bytes: JPG.length });
    store.set(prep2.body.key, JPG);
    const swapped = await postJson(`${signed}/${QID2}/confirm`, editor, { key: prep2.body.key, alt: ALT, content_type: "image/jpeg" });
    expect(swapped.status).toBe(201);
    expect(removed).toContain(prep.body.key);
    expect(store.has(prep.body.key)).toBe(false);
  });

  it("o arquivo que chegou ao depósito é conferido: conteúdo que não bate com o tipo ou acima de 5 MB é apagado e recusado", async () => {
    const bad = await postJson(`${signed}/${QID}/upload`, editor, { content_type: "image/png", size_bytes: 100 });
    store.set(bad.body.key, Buffer.from("não é imagem nenhuma, só texto"));
    const r = await postJson(`${signed}/${QID}/confirm`, editor, { key: bad.body.key, alt: ALT, content_type: "image/png" });
    expect(r.status).toBe(415);
    expect(store.has(bad.body.key)).toBe(false);
    const big = await postJson(`${signed}/${QID}/upload`, editor, { content_type: "image/png", size_bytes: 100 });
    store.set(big.body.key, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
    expect((await postJson(`${signed}/${QID}/confirm`, editor, { key: big.body.key, alt: ALT, content_type: "image/png" })).status).toBe(413);
    expect(store.has(big.body.key)).toBe(false);
  });

  it("se o banco recusa (arquivo que já é a figura de outra questão), o arquivo da outra questão NÃO é apagado", async () => {
    const [{ path: inUse }] = await images(QID2);
    expect(store.has(inUse)).toBe(true);
    const r = await postJson(`${signed}/${QID}/confirm`, editor, { key: inUse, alt: ALT, content_type: inUse.endsWith(".png") ? "image/png" : "image/jpeg" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/já é a figura de outra questão/);
    expect(store.has(inUse)).toBe(true);
    expect(await images(QID2)).toEqual([{ path: inUse, alt: ALT }]);
  });
});
