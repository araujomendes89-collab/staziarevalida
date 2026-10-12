// @vitest-environment node
/**
 * Fase 1 do gerenciamento, grupo C, parte do servidor da Central: CC23 (Conferir fontes monitoradas no site publicado), CC18
 * (Reanalisar agora) e CC24 (PDF de fonte que já tinha sido enviado em Documentos vira trechos). Banco isolado, arquivos e fontes
 * SINTÉTICOS, IA desligada: nenhuma rede real.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { createContentHubRouter } from "../../server/contentHub/router";
import { createContentHubWorker } from "../../server/contentHub/worker";
import { compareSourceVersions } from "../../server/contentHub/sourceCompare";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "admc-srv-"));
const ADMIN = "00000000-0000-4000-8000-0000000000a3";
const EDITOR = "00000000-0000-4000-8000-0000000000e3";
const STUDENT = "00000000-0000-4000-8000-0000000000b3";
const HAS_PDFPYTHON = spawnSync("pdfpython", ["-c", "import pymupdf"], { encoding: "utf8" }).status === 0;
let dev: DevDatabase;
let db: ContentDb;
let storage: Storage;
const servers: Server[] = [];
let url: string;
let urlWithWorker: string;
let admin: string, editor: string, student: string;

const deps = () => ({ db, storage, ai: { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "IA não configurada." } }, renderer: null }) as any;
const listen = (worker?: any) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api/content-hub", createContentHubRouter(deps(), worker ? { worker } : {}));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub`));
    servers.push(srv);
  });
const call = async (u: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(u, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const post = (u: string, token: string, body: unknown = {}) => call(u, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const postPdf = (u: string, token: string, body: Buffer, name = "arquivo.pdf") => call(u, token, { method: "POST", headers: { "Content-Type": "application/pdf", "X-File-Name": name }, body });
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const jobs = (doc: string) => sql(`select step, status from public.ch_jobs where document_id = $1 order by created_at`, [doc]);
const newSource = async (title: string) => (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ($1, 'Órgão de teste', 'final', '1', 'A') returning id`, [title]))[0].id as string;
const realPdf = (file: string, text: string) => {
  const r = spawnSync("pdfpython", ["-c", `import pymupdf,sys\nd=pymupdf.open()\np=d.new_page()\np.insert_text((72,72),sys.argv[2])\nd.save(sys.argv[1])`, file, text], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return fs.readFileSync(file);
};
const rpcAdmin = async (fn: string, ...args: unknown[]) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows[0].r;
  });
const work = () => createContentHubWorker(deps());

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  storage = localStorageDir(path.join(tmp, "files"));
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed3@t.dev'), ($2, 'al3@t.dev'), ($3, 'ad3@t.dev')`, [EDITOR, STUDENT, ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  url = await listen();
  urlWithWorker = await listen({ running: true, checkSources: async () => ({ checked: 2, changed: 1, unreachable: 0 }) });
  editor = await dev.createSession(EDITOR);
  student = await dev.createSession(STUDENT);
  admin = await dev.createSession(ADMIN);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("CC23: Conferir fontes monitoradas no site publicado (sem processamento junto do servidor)", () => {
  it("o administrador deixa o pedido marcado em vez de receber 'worker desligado'; sem fonte monitorada diz 0", async () => {
    const none = await post(`${url}/sources/check`, admin);
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ requested: 0 });
    const src = await newSource("Fonte monitorada do servidor");
    await sql(`insert into public.ch_source_watch (source_id, url, interval_days) values ($1, 'https://exemplo.invalid/a.pdf', 7)`, [src]);
    const r = await post(`${url}/sources/check`, admin);
    expect(r.status).toBe(200);
    expect(r.body.requested).toBe(1);
    expect(await db.service<number>("ch_worker_watch_requested")).toBe(1);
  });

  it("editor e aluno são recusados", async () => {
    expect((await post(`${url}/sources/check`, editor)).status).toBe(403);
    expect([403, 404]).toContain((await post(`${url}/sources/check`, student)).status);
  });

  it("onde o processamento roda junto do servidor (desenvolvimento), confere na hora como antes", async () => {
    const r = await post(`${urlWithWorker}/sources/check`, admin);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ checked: 2, changed: 1, unreachable: 0 });
  });
});

describe("CC18: Reanalisar agora", () => {
  it("sem questão esperando: 400 em português; editor e aluno recusados", async () => {
    const none = await post(`${url}/questions/reanalysis`, admin);
    expect(none.status).toBe(400);
    expect(none.body.error).toMatch(/Nenhuma questão está esperando reanálise/);
    expect((await post(`${url}/questions/reanalysis`, editor)).status).toBe(403);
    expect([403, 404]).toContain((await post(`${url}/questions/reanalysis`, student)).status);
  });

  it("com questão esperando: o pedido fica marcado para a próxima rodada; pedir de novo não duplica", async () => {
    const q = (await sql(`select question_id from public.question_claims where role = 'solves' order by question_id limit 1`))[0].question_id;
    const claim = (await sql(`select claim_id from public.question_claims where question_id = $1 and role = 'solves'`, [q]))[0].claim_id;
    const st = (await sql(`select statement from public.ch_claims where id = $1`, [claim]))[0].statement as string;
    const v1 = await newSource("Documento SINTÉTICO do servidor");
    const p1 = (await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2) returning id`, [v1, `${st} Dose habitual de 10 mg uma vez ao dia.`]))[0].id;
    await rpcAdmin("app_ch_link_evidence", claim, { source_id: v1, passage_id: p1, quote: st, verdict: "compatible", page: 1 });
    const v2 = (await rpcAdmin("app_ch_register_source", { title: "Documento SINTÉTICO do servidor", organ: "Órgão de teste", kind: "final", version: "2" })).id;
    await rpcAdmin("app_ch_set_source_authority", v2, "A");
    await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2)`, [v2, `${st} Dose habitual de 20 mg uma vez ao dia.`]);
    await compareSourceVersions(db, v1, v2);

    const first = await post(`${url}/questions/reanalysis`, admin);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ waiting: 1, already: false, now: false });
    const again = await post(`${url}/questions/reanalysis`, admin);
    expect(again.body).toMatchObject({ already: true });
    expect((await sql(`select requested_at is not null r from public.ch_reanalysis_control`))[0].r).toBe(true);
  });
});

describe("CC24: PDF de fonte que já tinha sido enviado em Documentos", () => {
  const PDF_A = Buffer.from("%PDF-1.4\n% fonte oficial A\n%%EOF\n");
  const PDF_B = Buffer.from("%PDF-1.4\n% fonte oficial B\n%%EOF\n");

  it("leitura já pronta: a fonte vai direto para os trechos, sem ler o PDF de novo (o trabalho do documento fica)", async () => {
    const study = await postPdf(`${url}/documents`, admin, PDF_A, "enviado antes.pdf");
    expect(study.status).toBe(201);
    const doc = study.body.id as string;
    // a leitura terminou antes: páginas, trechos de texto e o trabalho concluído
    await db.service("ch_worker_save_extraction", { p_document_id: doc, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text", width: 1, height: 1 }],
      p_blocks: [{ page_no: 1, idx: 0, type: "paragraph", text: "A dose usual do medicamento sintético é a indicada na tabela do documento oficial.", bbox: [0, 0, 1, 1] }] });
    await sql(`update public.ch_jobs set status = 'succeeded', finished_at = now() where document_id = $1 and step = 'extract'`, [doc]);
    const blockBefore = (await sql(`select id from public.ch_blocks where document_id = $1`, [doc]))[0].id;

    const src = await newSource("Fonte já enviada em Documentos");
    const sent = await postPdf(`${url}/sources/${src}/document`, admin, PDF_A, "mesma.pdf");
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ id: doc, duplicate: true });
    expect(await jobs(doc)).toEqual([{ step: "extract", status: "succeeded" }, { step: "source_index", status: "queued" }]);
    await work().drain();
    expect(await jobs(doc)).toEqual([{ step: "extract", status: "succeeded" }, { step: "source_index", status: "succeeded" }]);
    expect((await sql(`select count(*)::int n from public.ch_source_passages where source_id = $1`, [src]))[0].n).toBeGreaterThan(0);
    expect((await sql(`select purpose from public.ch_documents where id = $1`, [doc]))[0].purpose).toBe("reference_source");
    // a leitura NÃO foi refeita: o bloco do documento é o mesmo
    expect((await sql(`select id from public.ch_blocks where document_id = $1`, [doc]))[0].id).toBe(blockBefore);
  });

  it("leitura que tinha falhado: refaz a leitura (e a fonte segue até os trechos)", async () => {
    const study = await postPdf(`${url}/documents`, admin, PDF_B, "falhou antes.pdf");
    const doc = study.body.id as string;
    await sql(`update public.ch_jobs set status = 'dead', error = 'falhou antes' where document_id = $1 and step = 'extract'`, [doc]);
    const src = await newSource("Fonte com leitura que falhou");
    const sent = await postPdf(`${url}/sources/${src}/document`, admin, PDF_B, "mesma-b.pdf");
    expect(sent.status).toBe(201);
    expect(await jobs(doc)).toEqual([{ step: "extract", status: "queued" }]);
  });

  it.skipIf(!HAS_PDFPYTHON)("leitura ainda na fila quando o PDF vira fonte: ao terminar, a leitura vê que é fonte e indexa os trechos", async () => {
    const real = realPdf(path.join(tmp, "real.pdf"), "Texto sintetico de uma fonte oficial usada para provar que a leitura indexa os trechos da fonte.");
    const study = await postPdf(`${url}/documents`, admin, real, "ainda na fila.pdf");
    const doc = study.body.id as string;
    expect(await jobs(doc)).toEqual([{ step: "extract", status: "queued" }]);
    const src = await newSource("Fonte enviada com a leitura na fila");
    const sent = await postPdf(`${url}/sources/${src}/document`, admin, real, "mesma-real.pdf");
    expect(sent.status).toBe(201);
    expect(await jobs(doc)).toEqual([{ step: "extract", status: "queued" }]); // nada novo: a leitura da fila atende
    await work().drain();
    const done = await jobs(doc);
    expect(done.map((j) => j.step)).toEqual(["extract", "source_index"]);
    expect(done.every((j) => j.status === "succeeded")).toBe(true);
    expect((await sql(`select count(*)::int n from public.ch_source_passages where source_id = $1`, [src]))[0].n).toBeGreaterThan(0);
  }, 120_000);
});
