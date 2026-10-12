// @vitest-environment node
/**
 * Fontes complementares, rodada de correções (servidor).
 *  (B) se o SHA-256 do arquivo enviado não puder ser gravado, o arquivo fica ESCONDIDO do aluno (fecha por segurança) e a equipe
 *      é avisada em português; uma falha passageira é refeita uma vez.
 *  (C) lista de termos indisponível: nunca guardada no cache; os chamadores agem do lado seguro.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb } from "../../server/contentHub/infra";
import { createLessonsRouter } from "../../server/lessons/router";
import { createPodcastsRouter } from "../../server/podcasts/router";

vi.setConfig({ testTimeout: 60_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rodada2-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const AVISO = /impressão digital do arquivo/i;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");

/** PDF mínimo com texto (Helvetica), uma página por item. */
function makePdf(pages: string[]): Buffer {
  const objs: string[] = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`];
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${text.split("\n").map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

let dev: DevDatabase;
let db: ContentDb;
const servers: Server[] = [];
const logs: string[] = [];
/** Banco que falha de propósito: quantas vezes seguidas cada função worker lança erro. */
const falhas: Record<string, number> = {};
const chamadas: Record<string, number> = {};
const dbFalho = (): ContentDb => ({
  ...db,
  async service<T>(fn: string, args: Record<string, unknown> = {}) {
    chamadas[fn] = (chamadas[fn] ?? 0) + 1;
    if ((falhas[fn] ?? 0) > 0) {
      falhas[fn]--;
      throw new Error("banco indisponível (teste)");
    }
    return db.service<T>(fn, args);
  },
});
const sqlAs = (uid: string, q: string, p: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(q, p)).rows;
  });
const listen = (mount: string, router: express.Router) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use(mount, router);
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}${mount}`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const postRaw = (url: string, token: string, type: string, body: Buffer, name: string) => call(url, token, { method: "POST", headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(name) }, body });

let lessons: string;
let podcasts: string;
let editor: string;
let aulaId: string;
let podcastId: string;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed@t.dev'), ($2, 'al@t.dev'), ($3, 'ad@t.dev')`, [EDITOR, STUDENT, ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  aulaId = (await sqlAs(EDITOR, `select public.app_admin_save_lesson($1::jsonb) r`, [JSON.stringify({ area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite viral aguda", published: true, review_note: "Conferido no material da aula pela equipe." })]))[0].r.id;
  const faltando = dbFalho();
  lessons = await listen("/api/lessons", createLessonsRouter({ db: faltando, storage: localStorageDir(path.join(tmp, "lessons")), log: (m) => logs.push(m) }));
  podcasts = await listen("/api/podcasts", createPodcastsRouter({ db: faltando, storage: localStorageDir(path.join(tmp, "podcasts")), log: (m) => logs.push(m) }));
  editor = await dev.createSession(EDITOR);
  podcastId = (await sqlAs(EDITOR, `select public.app_admin_save_podcast($1::jsonb) r`, [JSON.stringify({ title: "Episódio de teste", topic: "Bronquiolite", area: "PEDIATRIA", target_minutes: 5 })]))[0].r.id;
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const alunoAbreMaterial = async (id: string) => (await sqlAs(STUDENT, `select public.app_lesson_material($1) r`, [id]))[0].r !== null;
const retencoes = async () => (await dev.db.query<any>(`select count(*)::int n from public.ch_file_holds`)).rows[0].n as number;
const limpar = () => {
  logs.length = 0;
  for (const k of Object.keys(falhas)) delete falhas[k];
  for (const k of Object.keys(chamadas)) delete chamadas[k];
};

describe("(B) aulas: SHA-256 do arquivo não gravado", () => {
  const enviar = (nome: string, pdf = Buffer.concat([PDF, Buffer.from(nome)])) => postRaw(`${lessons}/${aulaId}/materials?kind=other&title=${encodeURIComponent(nome)}`, editor, "application/pdf", pdf, `${nome}.pdf`);

  it("funcionando: o SHA-256 é gravado e o aluno recebe o arquivo", async () => {
    limpar();
    const r = await enviar("normal");
    expect(r.status).toBe(201);
    expect(r.body.aviso).toBeUndefined();
    const m = r.body.materials.find((x: any) => x.file_title === "normal");
    expect(m.sha_pendente).toBe(false);
    expect(await alunoAbreMaterial(m.id)).toBe(true);
  });

  it("falha passageira: uma nova tentativa grava o SHA-256, sem aviso, e o aluno recebe o arquivo", async () => {
    limpar();
    falhas.ch_worker_file_sha = 1;
    const r = await enviar("passageira");
    expect(r.status).toBe(201);
    expect(r.body.aviso).toBeUndefined();
    expect(chamadas.ch_worker_file_sha).toBe(2);
    const m = r.body.materials.find((x: any) => x.file_title === "passageira");
    expect(await alunoAbreMaterial(m.id)).toBe(true);
  });

  it("falha nas duas tentativas: o material é registrado ESCONDIDO do aluno, com aviso em português à equipe e registro no log", async () => {
    limpar();
    falhas.ch_worker_file_sha = 5;
    const r = await enviar("sem-sha");
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(AVISO);
    expect(r.body.aviso).toMatch(/confira antes de liberar/i);
    expect(chamadas.ch_worker_file_sha).toBe(2);
    const m = r.body.materials.find((x: any) => x.file_title === "sem-sha");
    expect(m.sha_pendente).toBe(true);
    expect(await alunoAbreMaterial(m.id)).toBe(false);
    const linha = (await dev.db.query<any>(`select hidden_from_student h, sha256 from public.lesson_materials where id = $1`, [m.id])).rows[0];
    expect(linha).toMatchObject({ h: true, sha256: null });
    // o aluno também não o vê na lista da aula
    const doAluno = (await sqlAs(STUDENT, `select public.app_lesson($1) r`, [aulaId]))[0].r.materials;
    expect(doAluno.some((x: any) => x.id === m.id)).toBe(false);
    expect(logs.join("\n")).toMatch(/SHA-256 do arquivo não gravado/);
  });

  it("a retenção não pode ser pedida: o envio é recusado em português e NADA é registrado", async () => {
    limpar();
    const antes = (await dev.db.query<any>(`select count(*)::int n from public.lesson_materials`)).rows[0].n;
    falhas.ch_worker_file_hold = 1;
    const r = await enviar("sem-retencao");
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/não foi possível/i);
    expect((await dev.db.query<any>(`select count(*)::int n from public.lesson_materials`)).rows[0].n).toBe(antes);
  });
});

describe("(B) retenção órfã: registro recusado não deixa retenção", () => {
  it("aula: registro recusado (título vazio) solta a retenção; registrado com SHA falho continua retido", async () => {
    limpar();
    const antes = await retencoes();
    const recusado = await postRaw(`${lessons}/${aulaId}/materials?kind=other&title=`, editor, "application/pdf", Buffer.concat([PDF, Buffer.from("recusado")]), "recusado.pdf");
    expect(recusado.status).toBe(400);
    expect(await retencoes()).toBe(antes);
    expect(chamadas.ch_worker_file_release).toBe(1);
    // SHA falha nas duas tentativas: o registro existe, a retenção FICA (não é solta pelo tratamento de erro)
    falhas.ch_worker_file_sha = 5;
    const r = await postRaw(`${lessons}/${aulaId}/materials?kind=other&title=Retido`, editor, "application/pdf", Buffer.concat([PDF, Buffer.from("retido")]), "retido.pdf");
    expect(r.status).toBe(201);
    expect(await retencoes()).toBe(antes + 1);
    expect(chamadas.ch_worker_file_release).toBe(1);
  });

  it("podcast: registro recusado (PDF sem texto) solta a retenção", async () => {
    limpar();
    const antes = await retencoes();
    const r = await postRaw(`${podcasts}/${podcastId}/sources/file`, editor, "application/pdf", makePdf([""]), "vazio.pdf");
    expect(r.status).toBe(422);
    expect(await retencoes()).toBe(antes);
    expect(chamadas.ch_worker_file_release).toBe(1);
  });
});

describe("(B) podcasts: SHA-256 da fonte enviada não gravado", () => {
  const TEXTO = "Bronquiolite viral aguda no lactente: suporte clínico, oxigênio se saturação baixa e hidratação adequada, com reavaliação frequente do esforço respiratório.";
  const enviar = (nome: string) => postRaw(`${podcasts}/${podcastId}/sources/file`, editor, "application/pdf", makePdf([`${TEXTO} ${nome}`]), `${nome}.pdf`);
  const fonte = (view: any, titulo: string) => view.sources.find((s: any) => s.title === titulo);
  const alunoVeFontes = async () => {
    await dev.db.query(`update public.podcasts set status = 'published', approved_at = now(), audio_path = 'podcasts/x.mp3', published_at = now() where id = $1`, [podcastId]);
    try {
      return ((await sqlAs(STUDENT, `select public.app_podcast($1) r`, [podcastId]))[0].r?.sources ?? []).length as number;
    } finally {
      await dev.db.query(`update public.podcasts set status = 'draft', published_at = null where id = $1`, [podcastId]);
    }
  };

  it("funcionando: fonte à vista do aluno e sem aviso", async () => {
    limpar();
    const r = await enviar("fonte-normal");
    expect(r.status).toBe(201);
    expect(r.body.note).toBeUndefined();
    expect(fonte(r.body, "fonte-normal.pdf")).toMatchObject({ student_hidden: false, sha_pendente: false });
    expect(await alunoVeFontes()).toBe(1);
  });

  it("falha passageira: nova tentativa grava o SHA-256, sem aviso", async () => {
    limpar();
    falhas.ch_worker_file_sha = 1;
    const r = await enviar("fonte-passageira");
    expect(r.status).toBe(201);
    expect(r.body.note).toBeUndefined();
    expect(chamadas.ch_worker_file_sha).toBe(2);
    expect(fonte(r.body, "fonte-passageira.pdf")).toMatchObject({ student_hidden: false, sha_pendente: false });
  });

  it("falha nas duas tentativas: a fonte fica ESCONDIDA do aluno, com aviso em português e registro no log", async () => {
    limpar();
    falhas.ch_worker_file_sha = 5;
    const r = await enviar("fonte-sem-sha");
    expect(r.status).toBe(201);
    expect(r.body.note).toMatch(AVISO);
    expect(r.body.note).toMatch(/confira antes de liberar/i);
    expect(fonte(r.body, "fonte-sem-sha.pdf")).toMatchObject({ student_hidden: true, sha_pendente: true });
    expect(await alunoVeFontes()).toBe(2); // as duas fontes anteriores; a sem SHA não aparece
    expect(logs.join("\n")).toMatch(/SHA-256 do arquivo não gravado/);
  });

  it("a retenção não pode ser pedida: recusa em português e nenhuma fonte é registrada", async () => {
    limpar();
    const antes = (await dev.db.query<any>(`select count(*)::int n from public.podcast_sources`)).rows[0].n;
    falhas.ch_worker_file_hold = 1;
    const r = await enviar("fonte-sem-retencao");
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/não foi possível/i);
    expect((await dev.db.query<any>(`select count(*)::int n from public.podcast_sources`)).rows[0].n).toBe(antes);
  });
});
