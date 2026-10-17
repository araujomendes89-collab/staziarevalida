// @vitest-environment node
/**
 * Central de IAs · função "Avaliação do treino sozinho" (treino_avaliacao, grupo dupla-sozinho-ia, 2026-10-17).
 * Parte 1 (sem banco): nasce desligada e sem IA definida; só modo comitê com empresas diferentes; a estimativa típica entra nos tetos.
 * Parte 2 (banco de teste + rotas /api/ai-central): salvar, recusas em português e quem pode abrir a Central.
 * A tela da Central está em duplaCentralFuncaoTela.test.tsx. IA SIMULADA: nenhuma chamada de rede, nenhuma chave real.
 */
import fs from "fs";
import express from "express";
import type http from "http";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import {
  capGuidance,
  companyOf,
  envFallbackRef,
  FUNCTION_KEYS,
  functionChecks,
  invalidateAiConfig,
  isTreinoFunction,
  requiresSavedConfig,
  SEARCH_OFF,
  TREINO_EXIGE_OUTRA_EMPRESA,
  TYPICAL_CALLS,
  typicalCallsOf,
  validateFunctionConfig,
  type FunctionConfig,
  type ModelRef,
} from "../../server/ai/config";

vi.setConfig({ testTimeout: 120_000 });

const A: ModelRef = { provider: "anthropic", model: "claude-sonnet-5-5" };
const A2: ModelRef = { provider: "anthropic", model: "claude-haiku-5" };
const O: ModelRef = { provider: "openai", model: "gpt-5.4" };
const G: ModelRef = { provider: "gemini", model: "gemini-3.8-flash" };
const MSG_AVISO_MODO = "A avaliação do treino sozinho usa o modo comitê, com IAs de empresas diferentes.";
const MSG_AVISO_EMPRESAS = "O comitê da avaliação do treino sozinho precisa de membros de pelo menos duas empresas diferentes.";

const fc = (over: Partial<FunctionConfig> = {}): FunctionConfig => ({ key: "treino_avaliacao", mode: "comite", care: "caprichado", primary: A, fallback: null, reviewers: [O], max_searches: null, ...over });
/** Configuração no feitio do que a tela lê, sem banco: as 4 IAs ligadas e preço para as IAs do teste. */
function mkCfg(over: { functions?: Partial<Record<string, FunctionConfig>>; caps?: boolean; perRun?: number | null; priced?: ModelRef[] } = {}): any {
  const providers: any = {};
  for (const id of ["anthropic", "openai", "gemini", "ollama"]) providers[id] = { enabled: true, models: [], status: null };
  return {
    providers,
    functions: over.functions ?? {},
    settings: { monthly_cap_usd: over.caps ? 100 : null, per_run_cap_usd: over.perRun ?? null, caps_enabled: over.caps ?? false, tab_override_enabled: false },
    prices: (over.priced ?? [A, A2, O, G]).map((r) => ({ provider: r.provider, model: r.model, input_per_mtok: 2, output_per_mtok: 10 })),
  };
}
const ENV = { ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "x", GEMINI_API_KEY: "x" } as NodeJS.ProcessEnv;

describe("função treino_avaliacao (sem banco)", () => {
  it("é a décima função, só roda com a configuração salva e as variáveis de ambiente nunca a definem", () => {
    expect(FUNCTION_KEYS).toHaveLength(10);
    expect(FUNCTION_KEYS[FUNCTION_KEYS.length - 1]).toBe("treino_avaliacao");
    expect(requiresSavedConfig("treino_avaliacao")).toBe(true);
    expect(isTreinoFunction("treino_avaliacao")).toBe(true);
    expect(isTreinoFunction("criacao")).toBe(false);
    const env = { CONTENT_HUB_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "x", CONTENT_HUB_MODEL_CREATE: "claude-sonnet-5-5" } as NodeJS.ProcessEnv;
    expect(envFallbackRef("treino_avaliacao", env)).toBeNull();
    for (const ui of ["anthropic", "openai", "gemini", "ollama"] as const) expect(envFallbackRef("treino_avaliacao", env, ui)).toBeNull();
    expect(TREINO_EXIGE_OUTRA_EMPRESA).toBe(true);
  });

  it("nasce desligada e sem IA definida: sem configuração salva não está pronta", () => {
    const check = functionChecks(mkCfg(), ENV).treino_avaliacao;
    expect(check).toMatchObject({ source: "variaveis", ready: false, ref: null, problems: [SEARCH_OFF] });
  });

  it("a empresa vem da IA cadastrada (Gemini é do Google)", () => {
    expect(companyOf(A)).toBe("anthropic");
    expect(companyOf(O)).toBe("openai");
    expect(companyOf(G)).toBe("google");
    expect(companyOf(A)).toBe(companyOf(A2));
  });

  it("comitê com duas IAs da MESMA empresa fica 'não pronta' com a mensagem", () => {
    const cfg = mkCfg({ functions: { treino_avaliacao: fc({ reviewers: [A2] }) } });
    const check = functionChecks(cfg, ENV).treino_avaliacao;
    expect(check.source).toBe("banco");
    expect(check.ready).toBe(false);
    expect(check.problems).toContain(MSG_AVISO_EMPRESAS);
    // e a validação de gravação diz o mesmo
    expect(validateFunctionConfig(fc({ reviewers: [A2] }), cfg, { requirePrice: true }).problems).toContain(MSG_AVISO_EMPRESAS);
  });

  it("duas empresas diferentes com preço cadastrado ficam prontas (Claude com OpenAI, e Claude com Gemini)", () => {
    for (const reviewer of [O, G]) {
      const cfg = mkCfg({ functions: { treino_avaliacao: fc({ reviewers: [reviewer] }) } });
      const check = functionChecks(cfg, ENV).treino_avaliacao;
      expect(check.problems).toEqual([]);
      expect(check.ready).toBe(true);
      expect(check.ref).toEqual(A);
    }
    // três membros, só uma empresa repetida: pronta
    const tres = mkCfg({ functions: { treino_avaliacao: fc({ reviewers: [A2, G] }) } });
    expect(functionChecks(tres, ENV).treino_avaliacao.ready).toBe(true);
  });

  it("o modo sozinha e a linha de produção são recusados, só o comitê vale", () => {
    const cfg = mkCfg();
    for (const mode of ["sozinha", "linha"] as const) {
      const { problems } = validateFunctionConfig(fc({ mode, reviewers: mode === "linha" ? [O] : [] }), cfg, { requirePrice: true });
      expect(problems, mode).toContain(MSG_AVISO_MODO);
    }
    expect(validateFunctionConfig(fc(), cfg, { requirePrice: true }).problems).toEqual([]);
  });

  it("outras funções não ganharam a regra das empresas diferentes", () => {
    const cfg = mkCfg();
    const mesma = validateFunctionConfig({ ...fc({ reviewers: [A2] }), key: "criacao" }, cfg, { requirePrice: true });
    expect(mesma.problems.join(" ")).not.toContain("duas empresas diferentes");
    expect(validateFunctionConfig({ ...fc({ mode: "sozinha", reviewers: [] }), key: "criacao" }, cfg, { requirePrice: true }).problems).toEqual([]);
  });

  it("a estimativa típica entra nos tetos (desligados) sem erro, e ligados vira aviso, nunca erro", () => {
    expect(TYPICAL_CALLS.treino_avaliacao).toEqual([{ use: "avaliação do treino sozinho", inputChars: 24_000, maxOut: 3000 }]);
    expect(typicalCallsOf("treino_avaliacao")).toEqual(TYPICAL_CALLS.treino_avaliacao);
    // tetos desligados: nenhum aviso de teto, nenhum problema
    const off = mkCfg({ functions: { treino_avaliacao: fc() } });
    const semTeto = validateFunctionConfig(fc(), off, { requirePrice: true });
    expect(semTeto.problems).toEqual([]);
    expect(semTeto.warnings.filter((w) => w.startsWith("Teto por chamada"))).toEqual([]);
    // a orientação de teto mínimo conta a função (modelos pagos com preço)
    const guia = capGuidance(off, ENV);
    const mine = guia.by_function.find((x) => x.key === "treino_avaliacao");
    expect(mine).toBeTruthy();
    expect(mine!.min_usd).toBeGreaterThan(0);
    // tetos ligados e baixos: a estimativa de CADA membro do comitê aparece como aviso e a função segue pronta
    const apertado = mkCfg({ functions: { treino_avaliacao: fc() }, caps: true, perRun: 0.001 });
    const ligado = validateFunctionConfig(fc(), apertado, { requirePrice: true });
    expect(ligado.problems).toEqual([]);
    expect(ligado.warnings.some((w) => /avaliação do treino sozinho/.test(w) && /do membro/.test(w))).toBe(true);
    expect(ligado.warnings.some((w) => /da principal/.test(w))).toBe(true);
    expect(functionChecks(apertado, ENV).treino_avaliacao.ready).toBe(true);
    // e com teto folgado não há aviso de teto
    const folgado = mkCfg({ functions: { treino_avaliacao: fc() }, caps: true, perRun: 5 });
    expect(validateFunctionConfig(fc(), folgado, { requirePrice: true }).warnings.filter((w) => w.startsWith("Teto por chamada"))).toEqual([]);
  });

  it("o aviso fixo de 'membros ainda não são chamados' não vale para esta função (os membros avaliam de verdade)", () => {
    const { warnings } = validateFunctionConfig(fc(), mkCfg(), { requirePrice: true });
    expect(warnings.join(" ")).not.toMatch(/ainda não rodam/);
    const outra = validateFunctionConfig({ ...fc(), key: "criacao" }, mkCfg(), { requirePrice: true });
    expect(outra.warnings.join(" ")).toMatch(/ainda não rodam/);
  });
});

describe("Central de IAs: rotas e quem abre (banco de teste)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "treinocentral-"));
  const ADMIN = "00000000-0000-4000-8000-0000000000ad";
  const EDITOR = "00000000-0000-4000-8000-0000000000e1";
  const STUDENT = "00000000-0000-4000-8000-0000000000b1";
  let dev: DevDatabase;
  let db: ContentDb;
  let base: string;
  let server: http.Server;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
    tokens.admin = await dev.createSession(ADMIN);
    tokens.editor = await dev.createSession(EDITOR);
    tokens.student = await dev.createSession(STUDENT);
    const { createAiRouter } = await import("../../server/ai/router");
    const app = express();
    app.use("/api/ai-central", createAiRouter({ db }, { fetchImpl: (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch, env: { ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k", GEMINI_API_KEY: "k" } as any }));
    base = await new Promise<string>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as any).port}/api/ai-central`));
    });
  }, 300_000);
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  beforeEach(async () => {
    for (const sql of [
      "delete from public.ai_calls",
      "delete from public.ai_functions",
      "delete from public.ai_model_prices",
      "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null",
      "update public.ai_settings set caps_enabled = false, monthly_cap_usd = null, per_run_cap_usd = null, tab_override_enabled = false",
    ]) await dev.db.query(sql);
    invalidateAiConfig(db);
  });

  const call = (who: string | null, method: string, p: string, body?: unknown) =>
    fetch(base + p, { method, headers: { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const prepare = async () => {
    for (const id of ["anthropic", "openai", "gemini"]) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
    for (const r of [A, A2, O, G]) await dev.db.query("insert into public.ai_model_prices (provider, model, input_per_mtok, output_per_mtok) values ($1, $2, 2, 10) on conflict do nothing", [r.provider, r.model]);
    invalidateAiConfig(db);
  };
  const put = (config: unknown) => call("admin", "PUT", "/functions/treino_avaliacao", { config });

  it("nasce desligada: o painel e o resumo trazem a função, sem configuração salva e não pronta", async () => {
    const overview = await (await call("admin", "GET", "/overview")).json();
    expect(Object.keys(overview.checks)).toContain("treino_avaliacao");
    expect(overview.checks.treino_avaliacao).toMatchObject({ source: "variaveis", ready: false, ref: null });
    expect(overview.functions.find((f: any) => f.key === "treino_avaliacao")).toBeUndefined();
    const summary = await (await call("editor", "GET", "/summary")).json();
    expect(summary.functions).toHaveLength(10);
    expect(summary.functions.find((f: any) => f.key === "treino_avaliacao")).toMatchObject({ configured: false });
  });

  it("modo sozinha é recusado (400) e nada é gravado", async () => {
    await prepare();
    const r = await put({ mode: "sozinha", primary: A, fallback: null, reviewers: [], care: "caprichado" });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.problems).toContain(MSG_AVISO_MODO);
    expect((await dev.db.query("select 1 from public.ai_functions where key = 'treino_avaliacao'")).rows).toHaveLength(0);
  });

  it("comitê com duas IAs da mesma empresa é recusado com a mensagem em português", async () => {
    await prepare();
    const r = await put({ mode: "comite", primary: A, fallback: null, reviewers: [A2], care: "caprichado" });
    expect(r.status).toBe(400);
    expect((await r.json()).problems).toContain(MSG_AVISO_EMPRESAS);
    expect((await dev.db.query("select 1 from public.ai_functions where key = 'treino_avaliacao'")).rows).toHaveLength(0);
  });

  it("comitê de empresas diferentes com preço salva, fica pronto no painel e no banco, e desligar apaga a configuração", async () => {
    await prepare();
    const r = await put({ mode: "comite", primary: A, fallback: null, reviewers: [O], care: "rapido" });
    expect(r.status).toBe(200);
    const overview = await (await call("admin", "GET", "/overview")).json();
    expect(overview.checks.treino_avaliacao).toMatchObject({ source: "banco", ready: true, problems: [] });
    expect(overview.functions.find((f: any) => f.key === "treino_avaliacao")).toMatchObject({ mode: "comite", care: "rapido", primary_ref: A, reviewers: [O] });
    // o banco concorda: a função de serviço do treino a considera pronta
    expect((await dev.db.query<any>("select public.solo_ia_function_ready() as r")).rows[0].r).toMatchObject({ ready: true });
    // o registro de ações guarda a mudança
    expect((await dev.db.query<any>("select count(*)::int n from public.admin_audit_log where action = 'ai.function' and target = 'treino_avaliacao'")).rows[0].n).toBeGreaterThanOrEqual(1);

    const off = await put(null);
    expect(off.status).toBe(200);
    const depois = await (await call("admin", "GET", "/overview")).json();
    expect(depois.checks.treino_avaliacao).toMatchObject({ source: "variaveis", ready: false });
    expect((await dev.db.query<any>("select public.solo_ia_function_ready() as r")).rows[0].r.ready).toBe(false);
  });

  it("modelo pago sem preço não salva (a função não nasce com gasto invisível)", async () => {
    for (const id of ["anthropic", "openai"]) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
    invalidateAiConfig(db);
    const r = await put({ mode: "comite", primary: A, fallback: null, reviewers: [O], care: "caprichado" });
    expect(r.status).toBe(400);
    expect((await r.json()).problems.join(" ")).toMatch(/sem preço cadastrado/);
  });

  it("só administrador abre e grava a Central; editor só lê o resumo; aluno e visitante são barrados", async () => {
    await prepare();
    expect((await call(null, "GET", "/overview")).status).toBe(401);
    expect((await call("student", "GET", "/summary")).status).toBe(403);
    expect((await call("student", "GET", "/overview")).status).toBe(403);
    expect((await call("student", "PUT", "/functions/treino_avaliacao", { config: null })).status).toBe(403);
    expect((await call("editor", "GET", "/overview")).status).toBe(403);
    expect((await call("editor", "GET", "/summary")).status).toBe(200);
    const edit = await call("editor", "PUT", "/functions/treino_avaliacao", { config: { mode: "comite", primary: A, fallback: null, reviewers: [O], care: "caprichado" } });
    expect(edit.status).toBe(403);
    expect((await dev.db.query("select 1 from public.ai_functions where key = 'treino_avaliacao'")).rows).toHaveLength(0);
    expect((await call("admin", "GET", "/overview")).status).toBe(200);
  });
});
