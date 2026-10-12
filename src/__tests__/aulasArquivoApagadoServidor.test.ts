// @vitest-environment node
/**
 * A07 no servidor (/api/lessons): remover um material, trocar o arquivo ou apagar a aula também apaga o ARQUIVO do depósito;
 * só apaga o que nenhuma outra linha usa; falha ao apagar não desfaz a remoção; o caminho apagado vai para o Registro.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { createLessonsRouter } from "../../server/lessons/router";
import { sweepLessonFiles } from "../../server/lessons/files";
import { HOLD_ERROR } from "../../server/contentHub/fileSha";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lessons-a07-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const REVISORA = "00000000-0000-4000-8000-0000000000f1";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");
const PDF2 = Buffer.from("%PDF-1.4\n2 0 obj << >> endobj\n%%EOF\n");
let dev: DevDatabase;
let db: ContentDb;
let servers: Server[] = [];
let base: string;
let editor: string, student: string, admin: string, revisora: string;
const logs: string[] = [];
let failRemove = false;

const store = new Map<string, Buffer>();
const storage: Storage = {
  async put(k, d) { store.set(k, d); return k; },
  async get(k) { const d = store.get(k); if (!d) throw new Error("Arquivo não encontrado."); return d; },
  async exists(k) { return store.has(k); },
  async remove(keys) {
    if (failRemove) throw new Error("depósito fora do ar");
    for (const k of keys) store.delete(k);
  },
};
const sqlAs = (uid: string, q: string, p: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(q, p)).rows;
  });
const call = async (url: string, token: string | null, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const del = (p: string, t: string | null) => call(`${base}${p}`, t, { method: "DELETE" });
const upload = (id: string, t: string, buf: Buffer, kind = "slides") => call(`${base}/${id}/materials?kind=${kind}&title=${kind}`, t, { method: "POST", headers: { "Content-Type": "application/pdf", "X-File-Name": "a.pdf" }, body: buf });
let n = 0;
const novaAula = async () => (await sqlAs(ADMIN, `select public.app_admin_save_lesson($1::jsonb) r`, [JSON.stringify({ area: "PEDIATRIA", topic: "Sepse", title: `Aula ${++n}`, published: true, review_note: "Conferido com a diretriz." })]))[0].r.id as string;
const materiais = async (id: string) => (await dev.db.query<any>(`select id, kind, storage_path from public.lesson_materials where lesson_id = $1 order by position, created_at`, [id])).rows;
const registro = async (id: string) => (await dev.db.query<any>(`select actor_id, details from public.admin_audit_log where action = 'lesson.file.delete' and target = $1 order by id`, [id])).rows;
const guardar = async (id: string, kind: string, tag: string, buf = PDF) => {
  const key = `lessons/${id}/${kind}-${tag.padEnd(16, "0")}.pdf`;
  store.set(key, buf);
  await sqlAs(EDITOR, `select public.app_admin_lesson_material($1::uuid, $2::jsonb)`, [id, JSON.stringify({ kind, title: `${kind}-${tag}`, storage_path: key, content_type: "application/pdf", size_bytes: buf.length })]);
  return key;
};

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed@t.dev'), ($2, 'al@t.dev'), ($3, 'ad@t.dev'), ($4, 'rev@t.dev')`, [EDITOR, STUDENT, ADMIN, REVISORA]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await dev.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISORA]);
  await new Promise<void>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api/lessons", createLessonsRouter({ db, storage, log: (m) => logs.push(m) }));
    const srv = app.listen(0, () => { base = `http://127.0.0.1:${(srv.address() as any).port}/api/lessons`; resolve(); });
    servers.push(srv);
  });
  [editor, student, admin, revisora] = await Promise.all([EDITOR, STUDENT, ADMIN, REVISORA].map((u) => dev.createSession(u)));
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("A07: remover material", () => {
  it("a equipe remove: o material e o arquivo saem, e o Registro guarda o caminho apagado e quem apagou", async () => {
    const id = await novaAula();
    const key = await guardar(id, "slides", "aaaa");
    const [m] = await materiais(id);
    const r = await del(`/materials/${m.id}`, editor);
    expect(r.status).toBe(200);
    expect(r.body.materials).toEqual([]);
    expect(store.has(key)).toBe(false);
    expect(await registro(id)).toEqual([{ actor_id: EDITOR, details: { path: key, kind: "slides" } }]);
  });

  it("aluno, revisora que não é da equipe e visitante são barrados e nada some; id inválido e material inexistente", async () => {
    const id = await novaAula();
    const key = await guardar(id, "slides", "bbbb");
    const [m] = await materiais(id);
    expect((await del(`/materials/${m.id}`, student)).status).toBe(403);
    expect((await del(`/materials/${m.id}`, revisora)).status).toBe(403);
    expect((await del(`/materials/${m.id}`, null)).status).toBe(401);
    expect((await del(`/materials/xyz`, editor)).status).toBe(400);
    expect((await del(`/materials/00000000-0000-4000-8000-000000000999`, editor)).status).toBe(404);
    expect(store.has(key)).toBe(true);
    expect((await materiais(id)).length).toBe(1);
  });

  it("falha do depósito NÃO desfaz a remoção do material: o arquivo fica na fila e sai na próxima limpeza", async () => {
    const id = await novaAula();
    const key = await guardar(id, "slides", "cccc");
    const [m] = await materiais(id);
    failRemove = true;
    const r = await del(`/materials/${m.id}`, editor);
    failRemove = false;
    expect(r.status).toBe(200);
    expect(r.body.materials).toEqual([]);
    expect(store.has(key)).toBe(true);
    expect(logs.some((l) => l.includes(key) && /não consegui apagar/.test(l))).toBe(true);
    expect(await registro(id)).toEqual([]); // nada foi apagado: nada registrado
    expect((await call(`${base}/files/sweep`, student, { method: "POST" })).status).toBe(403);
    const sweep = await call(`${base}/files/sweep`, editor, { method: "POST" });
    expect(sweep.body).toEqual({ deleted: 1, failed: 0 });
    expect(store.has(key)).toBe(false);
    expect((await registro(id)).length).toBe(1);
  });

  it("dois materiais com o mesmo arquivo: remover um não apaga o arquivo; remover o outro apaga", async () => {
    const id = await novaAula();
    const key = await guardar(id, "other", "dupl");
    await guardar(id, "other", "dupl");
    const [a, b] = await materiais(id);
    await del(`/materials/${a.id}`, editor);
    expect(store.has(key)).toBe(true);
    await del(`/materials/${b.id}`, editor);
    expect(store.has(key)).toBe(false);
  });

  it("arquivo com retenção (Fonte complementar) não é apagado enquanto a retenção existir", async () => {
    const id = await novaAula();
    const key = await guardar(id, "slides", "hold");
    await dev.db.query(`insert into public.ch_file_holds (storage_path) values ($1)`, [key]);
    const [m] = await materiais(id);
    await del(`/materials/${m.id}`, editor);
    expect(store.has(key)).toBe(true);
    await dev.db.query(`delete from public.ch_file_holds where storage_path = $1`, [key]);
    await call(`${base}/files/sweep`, editor, { method: "POST" });
    expect(store.has(key)).toBe(false);
  });

  it("link externo (sem arquivo) removido: não apaga nada", async () => {
    const id = await novaAula();
    await sqlAs(EDITOR, `select public.app_admin_lesson_material($1::uuid, $2::jsonb)`, [id, JSON.stringify({ kind: "guideline", title: "PCDT", url: "https://www.gov.br/saude/pcdt" })]);
    const [m] = await materiais(id);
    const before = store.size;
    expect((await del(`/materials/${m.id}`, editor)).status).toBe(200);
    expect(store.size).toBe(before);
  });
});

describe("A07: trocar o arquivo e apagar a aula", () => {
  it("enviar outro PDF no lugar do atual apaga o antigo do depósito; reenviar o mesmo PDF não apaga nada", async () => {
    const id = await novaAula();
    const first = await upload(id, editor, PDF);
    expect(first.status).toBe(201);
    const keyA = (await materiais(id))[0].storage_path as string;
    const again = await upload(id, editor, PDF); // o mesmo conteúdo: o mesmo caminho
    expect(again.status).toBe(201);
    expect(store.has(keyA)).toBe(true);
    expect((await materiais(id)).map((x) => x.storage_path)).toEqual([keyA]);
    await upload(id, editor, PDF2);
    const keyB = (await materiais(id))[0].storage_path as string;
    expect(keyB).not.toBe(keyA);
    expect(store.has(keyA)).toBe(false);
    expect(store.has(keyB)).toBe(true);
  });

  it("apagar a aula: só o administrador; os arquivos de todos os materiais saem do depósito", async () => {
    const id = await novaAula();
    const k1 = await guardar(id, "slides", "d001");
    const k2 = await guardar(id, "other", "d002");
    expect((await del(`/${id}`, editor)).status).toBe(403);
    expect((await del(`/${id}`, student)).status).toBe(403);
    expect(store.has(k1) && store.has(k2)).toBe(true);
    expect((await del(`/${id}`, admin)).body).toEqual({ deleted: true });
    expect(store.has(k1) || store.has(k2)).toBe(false);
    expect((await registro(id)).map((x) => x.details.path).sort()).toEqual([k1, k2].sort());
    expect((await del(`/${id}`, admin)).status).toBe(404);
  });
});

describe("A07 (rodada da revisão): corrida, lotes, confirmação e SQL ainda ausente", () => {
  const fila = async () => (await dev.db.query<any>(`select storage_path, state from public.lesson_files_pending_delete order by storage_path`)).rows;
  const limpar = async () => {
    await dev.db.query(`delete from public.lesson_files_pending_delete`);
    await dev.db.query(`delete from public.ch_file_holds`);
  };
  const quem = { id: EDITOR, email: null } as any;

  it("achado 6: duzentas retenções antigas na frente não prendem a limpeza; o servidor percorre a fila em lotes até o fim", async () => {
    await limpar();
    await dev.db.query(`insert into public.lesson_files_pending_delete (storage_path, queued_at) select 'lessons/lote/ret' || lpad(g::text, 4, '0'), now() - interval '2 days' + g * interval '1 second' from generate_series(1, 200) g`);
    await dev.db.query(`insert into public.ch_file_holds (storage_path) select 'lessons/lote/ret' || lpad(g::text, 4, '0') from generate_series(1, 200) g`);
    await dev.db.query(`insert into public.lesson_files_pending_delete (storage_path) select 'lessons/lote/livre' || lpad(g::text, 4, '0') from generate_series(1, 450) g`);
    for (let g = 1; g <= 450; g++) store.set(`lessons/lote/livre${String(g).padStart(4, "0")}`, PDF);
    for (let g = 1; g <= 200; g++) store.set(`lessons/lote/ret${String(g).padStart(4, "0")}`, PDF);
    const r = await sweepLessonFiles(db, quem, storage, (m) => logs.push(m));
    expect(r.deleted.length).toBe(450);
    expect(r.failed).toEqual([]);
    expect([...store.keys()].filter((k) => k.startsWith("lessons/lote/livre")).length).toBe(0);
    expect([...store.keys()].filter((k) => k.startsWith("lessons/lote/ret")).length).toBe(200); // retidos: ficam
    expect((await fila()).length).toBe(200);
    await limpar();
    for (const k of [...store.keys()]) if (k.startsWith("lessons/lote/")) store.delete(k);
  });

  it("achado 5: a confirmação falhou depois de apagar: tenta de novo; se ainda falhar, a reserva vence e a próxima limpeza registra", async () => {
    await limpar();
    const id = await novaAula();
    const key = await guardar(id, "slides", "conf");
    const [m] = await materiais(id);
    await sqlAs(EDITOR, `select public.app_admin_delete_lesson_material($1::uuid)`, [m.id]);
    let falhas = 0;
    const flaky = { ...db, service: async (fn: string, args?: any) => (fn === "ch_worker_lesson_files_done" && falhas-- > 0 ? Promise.reject(new Error("conexão caiu")) : db.service(fn, args)) } as ContentDb;
    falhas = 1; // só a primeira tentativa falha: a segunda confirma
    let r = await sweepLessonFiles(flaky, quem, storage, (m2) => logs.push(m2));
    expect(r.deleted).toEqual([key]);
    expect(store.has(key)).toBe(false);
    expect((await registro(id)).length).toBe(1);
    // as duas tentativas falham: apagou, mas sem Registro por enquanto
    const k2 = await guardar(id, "other", "conf2");
    const m2 = (await materiais(id))[0];
    await sqlAs(EDITOR, `select public.app_admin_delete_lesson_material($1::uuid)`, [m2.id]);
    falhas = 2;
    r = await sweepLessonFiles(flaky, quem, storage, (x) => logs.push(x));
    expect(r.deleted).toEqual([k2]);
    expect(store.has(k2)).toBe(false);
    expect((await registro(id)).length).toBe(1); // sem a anotação ainda
    expect(logs.some((l) => /não consegui confirmar no banco/.test(l))).toBe(true);
    expect((await fila()).map((x) => x.state)).toEqual(["deleting"]);
    r = await sweepLessonFiles(db, quem, storage, (x) => logs.push(x));
    expect(r.deleted).toEqual([]); // reserva recente: ninguém repete ainda
    await dev.db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    r = await sweepLessonFiles(db, quem, storage, (x) => logs.push(x));
    expect(r.deleted).toEqual([k2]); // vencida: refaz (apagar de novo é inofensivo) e agora registra
    expect((await registro(id)).map((x) => x.details.path).sort()).toEqual([key, k2].sort());
    expect(await fila()).toEqual([]);
  });

  it("achado 2: enquanto o arquivo está reservado para apagar, reenviar o MESMO arquivo é recusado (nada fica apontando para um arquivo apagado); depois funciona", async () => {
    await limpar();
    const id = await novaAula();
    expect((await upload(id, editor, PDF)).status).toBe(201);
    const [m] = await materiais(id);
    const key = m.storage_path as string;
    await sqlAs(EDITOR, `select public.app_admin_delete_lesson_material($1::uuid)`, [m.id]); // sai da aula; o arquivo vai para a fila
    const reservado = await db.service<{ paths: string[] }>("ch_worker_lesson_files_reserve", { p_actor: EDITOR }); // a limpeza está no meio
    expect(reservado.paths).toEqual([key]);
    const again = await upload(id, editor, PDF); // outra pessoa envia o mesmo conteúdo agora
    expect(again.status).toBe(500);
    expect(again.body.error ?? again.body.message ?? JSON.stringify(again.body)).toContain(HOLD_ERROR.slice(0, 40));
    expect(await materiais(id)).toEqual([]);
    await storage.remove([key]); // a limpeza termina
    await db.service("ch_worker_lesson_files_done", { p_paths: [key], p_actor: EDITOR });
    expect((await upload(id, editor, PDF)).status).toBe(201); // agora o envio vale e o arquivo existe de novo
    expect(store.has(key)).toBe(true);
    expect((await materiais(id)).map((x) => x.storage_path)).toEqual([key]);
  });

  it("achado 8: site novo + SQL antigo (funções ainda ausentes): a remoção vale, nada é apagado do depósito, o log diz o que falta e o servidor não quebra", async () => {
    await limpar();
    const semSql = { ...db, service: async (fn: string, args?: any) => (/^ch_worker_lesson_files_/.test(fn) ? Promise.reject(new Error("Could not find the function public.ch_worker_lesson_files_reserve(p_actor) in the schema cache")) : db.service(fn, args)) } as ContentDb;
    const msgs: string[] = [];
    const r = await sweepLessonFiles(semSql, quem, storage, (x) => msgs.push(x));
    expect(r).toEqual({ deleted: [], failed: [] });
    expect(msgs.some((x) => /SQL da limpeza de arquivos \(9710\) ainda não foi aplicado.*como antes/.test(x))).toBe(true);
    // pela rota: o material sai e o arquivo fica (igual a hoje)
    const srv = await new Promise<{ url: string; close: () => void }>((resolve) => {
      const app = express();
      app.use(express.json());
      app.use("/api/lessons", createLessonsRouter({ db: semSql, storage, log: () => {} }));
      const s = app.listen(0, () => resolve({ url: `http://127.0.0.1:${(s.address() as any).port}/api/lessons`, close: () => s.close() }));
    });
    try {
      const id = await novaAula();
      const key = await guardar(id, "slides", "semsql");
      const [m] = await materiais(id);
      const res = await call(`${srv.url}/materials/${m.id}`, editor, { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(res.body.materials).toEqual([]);
      expect(store.has(key)).toBe(true);
      expect(await registro(id)).toEqual([]);
    } finally {
      srv.close();
    }
  });
});
