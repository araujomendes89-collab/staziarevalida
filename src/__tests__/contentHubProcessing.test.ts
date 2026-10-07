// @vitest-environment node
/**
 * Situação da Central de Conteúdo: o painel mostra o relato do processamento (tarefa no Google Cloud Run), não testa o
 * servidor do site; a fonte do Design System vai junto com o app; só o servidor grava e lê os relatos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb } from "../../server/contentHub/infra";
import { createContentHubRouter } from "../../server/contentHub/router";
import { loadBrand } from "../../server/contentHub/render";
import { probeProcessing, reportProcessing } from "../../server/contentHub/capabilities";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hub-status-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
let dev: DevDatabase;
let db: ContentDb;
let token: string;
const servers: Server[] = [];
const deps = () => ({ db, storage: localStorageDir(path.join(tmp, "files")), ai: { provider: null, status: { ready: true, provider: "anthropic", model: "modelo-de-teste" } }, renderer: null }) as any;
const listen = (worker: any) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api/content-hub", createContentHubRouter(deps(), { worker }));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub`));
    servers.push(srv);
  });
const status = async (base: string) => (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
// sem a autorização do envio ao Google, a busca por significado fica desligada e aparece como pendência (contentHubSemanticSearch.test.ts)
const EMBEDDINGS = /Busca por significado ainda desligada/;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed@t.dev'), ($2, 'al@t.dev')`, [EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  token = await dev.createSession(EDITOR);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Identidade visual dos PDFs", () => {
  it("a fonte Plus Jakarta Sans vai junto com o app (6 pesos) e o logo está no lugar", () => {
    const saved = process.env.CONTENT_HUB_FONT_DIR;
    delete process.env.CONTENT_HUB_FONT_DIR;
    try {
      const brand = loadBrand();
      expect(brand.pending).toEqual([]);
      expect(brand.version).toBe("brand-1.0+font");
      expect(brand.fontFaces.match(/@font-face/g)?.length).toBe(6);
      for (const w of ["font-weight:400;font-style:normal", "font-weight:400;font-style:italic", "font-weight:500", "font-weight:600", "font-weight:700", "font-weight:800"]) expect(brand.fontFaces).toContain(w);
      expect(fs.readFileSync(path.resolve(__dirname, "../../server/contentHub/fonts/OFL.txt"), "utf8")).toMatch(/SIL Open Font License/);
    } finally {
      if (saved !== undefined) process.env.CONTENT_HUB_FONT_DIR = saved;
    }
  });
});

describe("Situação no painel (site sem processamento próprio)", () => {
  let base: string;
  beforeAll(async () => {
    base = await listen(null);
  });

  it("sem relato: avisa que o processamento no Cloud Run ainda não rodou (e não acusa o servidor do site)", async () => {
    const s = await status(base);
    expect(s.worker).toBe(false);
    expect(s.processing).toEqual({ where: null });
    expect(s.pending.some((p: string) => /ainda não rodou: ele roda como tarefa no Google Cloud Run/.test(p))).toBe(true);
    expect(s.pending.some((p: string) => /Renderizador de PDF|Logo horizontal|Plus Jakarta/.test(p))).toBe(false);
    expect(s.pending.some((p: string) => EMBEDDINGS.test(p))).toBe(true);
  });

  it("com relato recente: mostra o que o processamento tem pronto; relato antigo: avisa que parou", async () => {
    const report = { where: "cloud_run", renderer: true, python: true, ocr_languages: ["eng", "por", "spa"], brand: { version: "brand-1.0+font", pending: [] }, pending: [], jobs: 2 };
    await dev.db.query(`select public.ch_worker_report('cloud_run', $1::jsonb)`, [JSON.stringify(report)]);
    let s = await status(base);
    // sem IA ligada na Central de IAs, a única pendência além dos embeddings é a da própria Central
    expect(s.pending.filter((p: string) => !EMBEDDINGS.test(p) && !/^Nenhuma função da Central de IAs/.test(p))).toEqual([]);
    expect(s).toMatchObject({ renderer: true, brand: { version: "brand-1.0+font", pending: [] }, processing: { where: "cloud_run", stale: false, python: true, ocr_languages: ["eng", "por", "spa"], jobs: 2 } });
    await dev.db.query(`update public.ch_worker_heartbeats set reported_at = now() - interval '2 hours'`);
    s = await status(base);
    expect(s.processing.stale).toBe(true);
    expect(s.pending.some((p: string) => /não roda desde/.test(p))).toBe(true);
    // relato com pendências do próprio processamento
    await dev.db.query(`select public.ch_worker_report('cloud_run', $1::jsonb)`, [JSON.stringify({ ...report, renderer: false, pending: ["Gerador de PDF (Playwright/Chromium) indisponível no processamento."] })]);
    s = await status(base);
    expect(s.renderer).toBe(false);
    expect(s.pending).toContain("Gerador de PDF (Playwright/Chromium) indisponível no processamento.");
  });

  it("só o servidor grava e lê os relatos", async () => {
    const asStudent = (q: string) =>
      dev.db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: STUDENT })]);
        return tx.query<any>(q);
      });
    await expect(asStudent(`select public.ch_worker_report('cloud_run', '{}'::jsonb)`)).rejects.toThrow(/permission denied/);
    await expect(asStudent(`select public.ch_worker_last_report()`)).rejects.toThrow(/permission denied/);
    expect((await asStudent(`select * from public.ch_worker_heartbeats`)).rows).toEqual([]);
  });
});

describe("Processamento neste servidor (desenvolvimento)", () => {
  it("com o processamento ligado aqui, a situação é a deste servidor", async () => {
    const base = await listen({ running: true });
    const s = await status(base);
    expect(s).toMatchObject({ worker: true, processing: { where: "servidor", running: true }, renderer: false });
    expect(s.pending).toContain("Renderizador de PDF (Playwright/Chromium) indisponível no servidor.");
  });

  it("o relato do processamento tem o formato que o painel lê e é gravado pelo servidor", async () => {
    const d = deps();
    const report = await probeProcessing(d);
    expect(report).toMatchObject({ where: "servidor", renderer: false, brand: { pending: [] } });
    expect(typeof report.python).toBe("boolean");
    expect(Array.isArray(report.ocr_languages)).toBe(true);
    expect(report.pending).toContain("Gerador de PDF (Playwright/Chromium) indisponível no processamento.");
    expect(report.embeddings).toMatchObject({ ready: false, model: null });
    expect(report.pending.some((p) => /^Busca por significado no processamento: /.test(p))).toBe(true);
    await reportProcessing(d, report, { jobs: 0 });
    const last = await db.service<any>("ch_worker_last_report");
    expect(last).toMatchObject({ worker: "servidor", report: { jobs: 0, renderer: false } });
  });
});
