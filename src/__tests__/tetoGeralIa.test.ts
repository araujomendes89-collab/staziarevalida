// @vitest-environment node
/**
 * IA02 (Fase 1 objetiva, 2026-10-12): TETO GERAL do mês para todo o gasto de IA, só a estrutura (migração …9892_teto_geral_ia_mes.sql).
 * Nasce DESLIGADO e SEM VALOR; o banco não deixa ligar sem valor; por ora só avisa (nada para por causa dele).
 * Banco de teste local (PGlite) com todas as migrações; rota com banco simulado; sem rede.
 */
import express from "express";
import fs from "fs";
import type http from "http";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { overallCapState } from "../novo/app/admin/ai/overallCap.js";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tetogeral-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
let dev: DevDatabase;
let db: ContentDb;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev')`, [ADMIN, EDITOR]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const salvar = (p: Record<string, unknown>, actor = ADMIN) => db.service<any>("ch_worker_ai_save_settings", { p_actor: actor, p_settings: p });
const linha = async () => (await dev.db.query<any>(`select * from public.ai_settings`)).rows[0];

describe("IA02 — banco: o teto geral nasce desligado e sem valor", () => {
  it("padrão: sem valor e desligado, e a configuração lida pelo servidor traz os dois campos", async () => {
    const l = await linha();
    expect([l.overall_monthly_cap_usd, l.overall_cap_enabled]).toEqual([null, false]);
    const cfg = await db.service<any>("ch_worker_ai_config");
    expect(cfg.settings).toMatchObject({ overall_monthly_cap_usd: null, overall_cap_enabled: false });
  });

  it("não deixa ligar sem valor; com valor liga; desligar é sempre possível", async () => {
    await expect(salvar({ overall_cap_enabled: true })).rejects.toThrow(/preencha o valor dele/);
    expect((await linha()).overall_cap_enabled).toBe(false);
    const ligado = await salvar({ overall_monthly_cap_usd: 80, overall_cap_enabled: true });
    expect(Number(ligado.overall_monthly_cap_usd)).toBe(80);
    expect(ligado.overall_cap_enabled).toBe(true);
    // esvaziar o valor com o teto ligado também é recusado
    await expect(salvar({ overall_monthly_cap_usd: null })).rejects.toThrow(/preencha o valor dele/);
    expect(Number((await linha()).overall_monthly_cap_usd)).toBe(80);
    const desligado = await salvar({ overall_cap_enabled: false, overall_monthly_cap_usd: null });
    expect([desligado.overall_monthly_cap_usd, desligado.overall_cap_enabled]).toEqual([null, false]);
  });

  it("valor negativo é recusado e os outros tetos não são mexidos por quem só grava o teto geral", async () => {
    await expect(salvar({ overall_monthly_cap_usd: -1 })).rejects.toThrow();
    await salvar({ monthly_cap_usd: 50, per_run_cap_usd: 2, caps_enabled: true });
    await salvar({ overall_monthly_cap_usd: 90 });
    const l = await linha();
    expect([Number(l.monthly_cap_usd), Number(l.per_run_cap_usd), l.caps_enabled, Number(l.overall_monthly_cap_usd), l.overall_cap_enabled]).toEqual([50, 2, true, 90, false]);
    // e quem só mexe nos tetos de sempre não mexe no geral
    await salvar({ caps_enabled: false });
    expect(Number((await linha()).overall_monthly_cap_usd)).toBe(90);
    await salvar({ monthly_cap_usd: null, per_run_cap_usd: null, overall_monthly_cap_usd: null });
  });

  it("só administrador grava; fica no Registro", async () => {
    await expect(salvar({ overall_monthly_cap_usd: 10 }, EDITOR)).rejects.toThrow("Acesso restrito a administradores.");
    await salvar({ overall_monthly_cap_usd: 12, overall_cap_enabled: false });
    const r = await dev.db.query<any>(`select details from public.admin_audit_log where action = 'ai.settings' order by id desc limit 1`);
    expect(r.rows[0].details).toMatchObject({ overall_monthly_cap_usd: 12 });
    await salvar({ overall_monthly_cap_usd: null });
  });
});

describe("IA02 — rota PUT /settings", () => {
  let server: http.Server;
  let base: string;
  let answer: (p: any) => any = (p) => p;
  const sent: any[] = [];
  let cfgSettings: any = {};
  const fake = {
    mode: "dev",
    async authenticate() {
      return { id: ADMIN, email: "ad@t.dev" };
    },
    async asUser(_u: unknown, name: string) {
      if (name === "app_ch_whoami") return { admin: true, staff: true };
      throw new Error(`função inesperada: ${name}`);
    },
    async service(name: string, args: any) {
      if (name === "ch_worker_ai_config") return { providers: [], functions: [], settings: cfgSettings, prices: [] };
      if (name === "ch_worker_ai_save_settings") return (sent.push(args.p_settings), answer(args.p_settings));
      throw new Error(`função inesperada: ${name}`);
    },
  } as any;
  beforeAll(async () => {
    const { createAiRouter } = await import("../../server/ai/router");
    await new Promise<void>((resolve) => {
      const app = express();
      app.use("/api/ai-central", createAiRouter({ db: fake }, { env: {} as any }));
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${(server.address() as any).port}/api/ai-central`;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });
  const put = async (body: unknown) => {
    const r = await fetch(base + "/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json() };
  };

  it("grava o teto geral e a chave; ligar sem valor é recusado antes de ir ao banco", async () => {
    sent.length = 0;
    cfgSettings = {};
    answer = (p) => ({ overall_monthly_cap_usd: p.overall_monthly_cap_usd ?? null, overall_cap_enabled: p.overall_cap_enabled ?? false });
    expect(await put({ overall_monthly_cap_usd: 80, overall_cap_enabled: true })).toEqual({ status: 200, json: { overall_monthly_cap_usd: 80, overall_cap_enabled: true } });
    expect(sent).toEqual([{ overall_monthly_cap_usd: 80, overall_cap_enabled: true }]);
    sent.length = 0;
    expect(await put({ overall_cap_enabled: true })).toEqual({ status: 400, json: { error: "Para ligar o teto geral do mês, preencha o valor dele." } });
    expect(sent).toEqual([]);
    // com o valor já gravado, só ligar basta
    cfgSettings = { overall_monthly_cap_usd: 80 };
    expect((await put({ overall_cap_enabled: true })).status).toBe(200);
  });

  it("valores que não são número ou ligado/desligado são recusados", async () => {
    expect((await put({ overall_monthly_cap_usd: "muito" })).status).toBe(400);
    expect((await put({ overall_monthly_cap_usd: -2 })).status).toBe(400);
    expect((await put({ overall_cap_enabled: "sim" })).status).toBe(400);
  });

  it("banco sem a migração (a função antiga ignora as chaves novas): não finge que gravou", async () => {
    answer = () => ({ monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false });
    const r = await put({ overall_monthly_cap_usd: 80, overall_cap_enabled: false });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/falta colar a atualização do banco/);
    // os tetos de sempre seguem funcionando no banco antigo
    expect((await put({ caps_enabled: false })).status).toBe(200);
  });
});

describe("IA02 — overallCapState (a conta da tela)", () => {
  const base = (settings: any, spend = 0, groups: any[] = [], available = true) => ({ settings, month_spend: spend, all_spend: { available, groups } });
  const G = (c: number) => [{ key: "tutor_conversa", cost_usd: c }, { key: "podcasts_audio", cost_usd: 1 }];
  it("desligado ou sem valor: nenhum nível; sem a migração: não suportado", () => {
    expect(overallCapState(base({ overall_monthly_cap_usd: null, overall_cap_enabled: false }, 10))).toMatchObject({ supported: true, level: null, cap: null, enabled: false });
    expect(overallCapState(base({ overall_monthly_cap_usd: 100, overall_cap_enabled: false }, 90, G(5)))).toMatchObject({ level: null, spend: 96 });
    expect(overallCapState(base({ monthly_cap_usd: null }, 10))).toMatchObject({ supported: false, level: null });
  });
  it("soma a Central e os outros lugares; avisa a partir de 80% e ao passar", () => {
    const on = (cap: number) => ({ overall_monthly_cap_usd: cap, overall_cap_enabled: true });
    expect(overallCapState(base(on(100), 10, G(4)))).toMatchObject({ spend: 15, level: "ok", percent: 15 });
    expect(overallCapState(base(on(100), 70, G(9)))).toMatchObject({ spend: 80, level: "perto", percent: 80 });
    expect(overallCapState(base(on(100), 70, G(29)))).toMatchObject({ spend: 100, level: "passou" });
    expect(overallCapState(base(on(0), 0))).toMatchObject({ level: "passou" });
  });
  it("sem a atualização do gasto dos outros lugares, soma só a Central e avisa que é parcial", () => {
    expect(overallCapState(base({ overall_monthly_cap_usd: 10, overall_cap_enabled: true }, 9, [], false))).toMatchObject({ spend: 9, partial: true, level: "perto" });
  });
});
