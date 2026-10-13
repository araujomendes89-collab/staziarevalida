// @vitest-environment node
/**
 * Central de IAs (supabase/migrations/…5200_central_de_ias.sql): as 4 IAs começam desligadas, só o administrador grava
 * (e tudo vai para o registro de ações), funções e preços são validados no banco, o gasto do mês é contado no fuso de
 * Brasília e o painel (administrador) e o resumo (equipe) respeitam o papel de quem chama.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import express from "express";
import type http from "http";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { listModels } from "../../server/ai/models";
import { OllamaProvider } from "../../server/contentHub/ai/ollama";
import { AiInvalidOutput } from "../../server/contentHub/ai/provider";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aicentral-"));
const ROOT = path.resolve(__dirname, "../..");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const adminUser = { id: ADMIN, email: "ad@t.dev" };
const editorUser = { id: EDITOR, email: "ed@t.dev" };
const studentUser = { id: STUDENT, email: "al@t.dev" };
let dev: DevDatabase;
let db: ContentDb;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Limpa o estado de IA do banco de teste: nenhuma chamada, função ou preço; IAs desligadas; tetos e seletor desligados. */
async function resetAiState() {
  const { invalidateAiConfig } = await import("../../server/ai/config");
  for (const sql of [
    "delete from public.ai_calls",
    "delete from public.ai_functions",
    "delete from public.ai_model_prices",
    "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null",
    "update public.ai_settings set caps_enabled = false, monthly_cap_usd = null, per_run_cap_usd = null, tab_override_enabled = false",
  ]) {
    await dev.db.query(sql);
  }
  invalidateAiConfig(db);
}

describe("Banco", () => {
  const RESTRITO = /Acesso restrito a administradores/;

  it("as 4 IAs começam desligadas e os tetos e o seletor nas abas também", async () => {
    const cfg = await db.service<any>("ch_worker_ai_config");
    expect(cfg.providers.map((p: any) => p.id).sort()).toEqual(["anthropic", "gemini", "ollama", "openai"]);
    expect(cfg.providers.every((p: any) => p.enabled === false)).toBe(true);
    expect(cfg.settings.caps_enabled).toBe(false);
    expect(cfg.settings.tab_override_enabled).toBe(false);
    expect(cfg.functions).toEqual([]);
    expect(cfg.prices).toEqual([]);
  });

  it("só administrador grava; editor e aluno recebem 'Acesso restrito a administradores'", async () => {
    await expect(db.service("ch_worker_ai_set_provider", { p_actor: EDITOR, p_provider: "anthropic", p_enabled: true })).rejects.toThrow(RESTRITO);
    await expect(db.service("ch_worker_ai_set_provider", { p_actor: STUDENT, p_provider: "anthropic", p_enabled: true })).rejects.toThrow(RESTRITO);
    await expect(db.service("ch_worker_ai_save_settings", { p_actor: EDITOR, p_settings: { caps_enabled: true } })).rejects.toThrow(RESTRITO);
    await expect(db.service("ch_worker_ai_save_function", { p_actor: EDITOR, p_key: "criacao", p_config: null })).rejects.toThrow(RESTRITO);
    await expect(db.service("ch_worker_ai_save_price", { p_actor: EDITOR, p_provider: "openai", p_model: "m", p_price: { input_per_mtok: 1, output_per_mtok: 2 } })).rejects.toThrow(RESTRITO);
  });

  it("ligar registra quem e quando e vai para o registro de ações", async () => {
    const r = await db.service<any>("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    expect(r.enabled).toBe(true);
    const cfg = await db.service<any>("ch_worker_ai_config");
    const a = cfg.providers.find((p: any) => p.id === "anthropic");
    expect(a.enabled).toBe(true);
    expect(a.enabled_by).toBe(ADMIN);
    expect(a.enabled_at).toBeTruthy();
    const ov = await db.asUser<any>(adminUser, "app_admin_ai_overview");
    expect(ov.providers.find((p: any) => p.id === "anthropic").enabled_by_email).toBe("ad@t.dev");
    expect(ov.providers.find((p: any) => p.id === "openai").enabled_by_email).toBeNull();
    expect(ov.history.find((h: any) => h.action === "ai.provider").actor_email).toBe("ad@t.dev");
    const log = await dev.db.query<any>(`select actor_id, target from public.admin_audit_log where action = 'ai.provider'`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({ actor_id: ADMIN, target: "anthropic" });
    await expect(db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "inexistente", p_enabled: true })).rejects.toThrow();
  });

  it("função salva e apagada (null volta às variáveis)", async () => {
    const config = {
      mode: "linha",
      primary_ref: { provider: "anthropic", model: "claude-x" },
      fallback_ref: { provider: "openai", model: "gpt-x" },
      reviewers: [{ provider: "gemini", model: "gem-x" }],
      care: "caprichado",
    };
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "criacao", p_config: config });
    let cfg = await db.service<any>("ch_worker_ai_config");
    expect(cfg.functions).toHaveLength(1);
    expect(cfg.functions[0]).toMatchObject({ key: "criacao", mode: "linha", care: "caprichado", primary_ref: config.primary_ref, reviewers: config.reviewers, updated_by: ADMIN });
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "criacao", p_config: null });
    cfg = await db.service<any>("ch_worker_ai_config");
    expect(cfg.functions).toEqual([]);
    const log = await dev.db.query<any>(`select target from public.admin_audit_log where action = 'ai.function' order by id`);
    expect(log.rows.map((x) => x.target)).toEqual(["criacao", "criacao"]);
  });

  it("modo e cuidado fora da lista são recusados", async () => {
    const ok = { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-x" }, care: "rapido" };
    const save = (key: string, config: unknown) => db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: key, p_config: config });
    await expect(save("criacao", { ...ok, mode: "todos" })).rejects.toThrow();
    await expect(save("criacao", { ...ok, mode: "linha_producao" })).rejects.toThrow();
    // cuidado omitido grava 'caprichado' e o modo 'linha' é aceito
    await save("criacao", { mode: "linha", primary_ref: ok.primary_ref });
    const saved = await db.service<any>("ch_worker_ai_config");
    expect(saved.functions[0]).toMatchObject({ key: "criacao", mode: "linha", care: "caprichado" });
    await save("criacao", null);
    await expect(save("criacao", { ...ok, care: "nenhum" })).rejects.toThrow();
    await expect(save("outra_funcao", ok)).rejects.toThrow();
    await expect(save("criacao", { ...ok, primary_ref: { provider: "xai", model: "m" } })).rejects.toThrow();
    await expect(save("criacao", { ...ok, primary_ref: { provider: "openai", model: "" } })).rejects.toThrow();
    await expect(save("criacao", { ...ok, reviewers: Array.from({ length: 5 }, () => ({ provider: "gemini", model: "m" })) })).rejects.toThrow();
    const cfg = await db.service<any>("ch_worker_ai_config");
    expect(cfg.functions).toEqual([]);
  });

  it("IA sem modelo, ou com modelo que não é texto, é recusada no banco (a conferência dava nulo)", async () => {
    const ok = { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-x" } };
    const save = (config: unknown) => db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "criacao", p_config: config });
    try {
      await expect(save({ ...ok, primary_ref: { provider: "anthropic" } })).rejects.toThrow(/principal inválido/);
      await expect(save({ ...ok, primary_ref: { model: "claude-x" } })).rejects.toThrow(/principal inválido/);
      await expect(save({ ...ok, primary_ref: { provider: "anthropic", model: 5 } })).rejects.toThrow(/principal inválido/);
      await expect(save({ ...ok, fallback_ref: { provider: "openai" } })).rejects.toThrow(/reserva inválido/);
      await expect(save({ ...ok, reviewers: [{ provider: "gemini" }] })).rejects.toThrow(/conferente inválido/);
      expect((await db.service<any>("ch_worker_ai_config")).functions).toEqual([]);
    } finally {
      await save(null);
    }
  });

  it("preços e tetos são validados e gravados", async () => {
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "openai", p_model: "gpt-x", p_price: { input_per_mtok: 1.5, output_per_mtok: 6, source_url: "https://exemplo.dev/precos", checked_on: "2026-10-07" } });
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "openai", p_model: "gpt-x", p_price: { input_per_mtok: 2, output_per_mtok: 8 } });
    await expect(db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "openai", p_model: "gpt-x", p_price: { input_per_mtok: -1, output_per_mtok: 8 } })).rejects.toThrow();
    const s = await db.service<any>("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { monthly_cap_usd: 50, per_run_cap_usd: 2, caps_enabled: true } });
    expect(Number(s.monthly_cap_usd)).toBe(50);
    expect(s.caps_enabled).toBe(true);
    expect(s.tab_override_enabled).toBe(false);
    await expect(db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { monthly_cap_usd: -5 } })).rejects.toThrow();
    const cfg = await db.service<any>("ch_worker_ai_config");
    expect(cfg.prices).toHaveLength(1);
    expect(Number(cfg.prices[0].input_per_mtok)).toBe(2);
    const actions = await dev.db.query<any>(`select distinct action from public.admin_audit_log where action in ('ai.price', 'ai.settings')`);
    expect(actions.rows.map((x) => x.action).sort()).toEqual(["ai.price", "ai.settings"]);
  });

  it("modelos e situação da IA são guardados", async () => {
    await db.service("ch_worker_ai_store_models", { p_provider: "gemini", p_models: [{ id: "gem-x", label: "Gem X" }], p_status: "pronta", p_detail: null });
    const cfg = await db.service<any>("ch_worker_ai_config");
    const g = cfg.providers.find((p: any) => p.id === "gemini");
    expect(g.models).toEqual([{ id: "gem-x", label: "Gem X" }]);
    expect(g.last_status).toBe("pronta");
    expect(g.models_refreshed_at).toBeTruthy();
  });

  it("gasto do mês no fuso de Brasília", async () => {
    const call = (created_at: string, cost_usd: number) => ({ created_at, function_key: "criacao", mode: "sozinha", role: "principal", provider: "anthropic", model: "claude-x", input_tokens: 10, output_tokens: 5, cost_usd, duration_ms: 100, outcome: "ok", source: "teste" });
    const n = await db.service<number>("ch_worker_ai_log_calls", { p_calls: [call("2026-11-01T02:59:00Z", 7), call("2026-11-01T03:01:00Z", 3)] });
    expect(n).toBe(2);
    const spend = await db.service<number | string>("ch_worker_ai_month_spend", { p_now: "2026-11-01T12:00:00Z" });
    expect(Number(spend)).toBe(3);
    const oct = await db.service<number | string>("ch_worker_ai_month_spend", { p_now: "2026-10-31T12:00:00Z" });
    expect(Number(oct)).toBe(7);
    await expect(db.service("ch_worker_ai_log_calls", { p_calls: [{ ...call("2026-11-02T00:00:00Z", 1), outcome: "talvez" }] })).rejects.toThrow();
  });

  it("app_admin_ai_overview só para admin; app_ai_summary para a equipe", async () => {
    await dev.db.query(`insert into public.ai_usage_ledger (user_id, feature, provider, model, estimated_cost_usd) values ($1, 'tutor_text', 'gemini', 'gem-x', 1.25)`, [ADMIN]);
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "verificacao", p_config: { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-x" }, care: "rapido" } });
    await db.service("ch_worker_ai_log_calls", { p_calls: [{ function_key: "criacao", mode: "sozinha", role: "principal", provider: "anthropic", model: "claude-x", cost_usd: 0.5, outcome: "ok", source: "teste" }] });

    const o = await db.asUser<any>(adminUser, "app_admin_ai_overview");
    expect(Object.keys(o).sort()).toEqual(["functions", "history", "month_spend", "prices", "providers", "recent_calls", "settings", "spend_by_function", "spend_by_provider", "tutor_month_spend"]);
    expect(Number(o.tutor_month_spend)).toBeCloseTo(1.25);
    expect(Number(o.month_spend)).toBeGreaterThanOrEqual(0.5);
    expect(o.recent_calls.length).toBeGreaterThan(0);
    expect(o.history.length).toBeGreaterThan(0);
    expect(o.history.every((h: any) => String(h.action).startsWith("ai."))).toBe(true);
    expect(o.spend_by_provider.find((x: any) => x.provider === "anthropic")).toBeTruthy();

    await expect(db.asUser(editorUser, "app_admin_ai_overview")).rejects.toThrow(RESTRITO);
    await expect(db.asUser(studentUser, "app_admin_ai_overview")).rejects.toThrow(RESTRITO);

    const s = await db.asUser<any>(editorUser, "app_ai_summary");
    expect(s.functions).toHaveLength(8);
    expect(s.functions.find((f: any) => f.key === "verificacao")).toMatchObject({ configured: true, mode: "sozinha" });
    expect(s.functions.find((f: any) => f.key === "criacao")).toMatchObject({ configured: false });
    expect(s.providers_enabled).toEqual(["anthropic"]);
    expect(Number(s.month_spend)).toBeGreaterThanOrEqual(0.5);
    await expect(db.asUser(studentUser, "app_ai_summary")).rejects.toThrow(/restrito/);
  });

  it("o gasto do Tutor soma só as linhas tutor_ (Aulas e Podcasts ficam de fora dessa linha)", async () => {
    const tutor = async () => Number((await db.asUser<any>(adminUser, "app_admin_ai_overview")).tutor_month_spend);
    const add = (feature: string, cost: number) =>
      dev.db.query(`insert into public.ai_usage_ledger (user_id, feature, estimated_cost_usd, meta) values ($1, $2, $3, '{"teste":"gasto-tutor"}'::jsonb)`, [ADMIN, feature, cost]);
    const before = await tutor();
    try {
      await add("tutor_text", 0.4);
      await add("tutor_voice_backend", 0.1);
      await add("lesson_assist", 2);
      await add("podcast_script", 3);
      await add("podcast_tts", 4);
      expect((await tutor()) - before).toBeCloseTo(0.5, 6);
    } finally {
      await dev.db.query(`delete from public.ai_usage_ledger where meta ->> 'teste' = 'gasto-tutor'`);
    }
  });

  it("as tabelas novas têm RLS e nenhuma função de serviço fica aberta", async () => {
    const t = await dev.db.query<any>(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relname like 'ai\\_%' and relkind = 'r' and not relrowsecurity`);
    expect(t.rows).toEqual([]);
    const f = await dev.db.query<any>(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'ch\\_worker\\_ai\\_%' or p.proname = 'ai_assert_admin_actor') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
    expect(f.rows).toEqual([]);
  });
});

describe("Modelos", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fake = (body: unknown, status = 200) => {
    const calls: { url: string; init: any }[] = [];
    const f = (async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return json(body, status);
    }) as unknown as typeof fetch;
    return { f, calls };
  };

  it("OpenAI: só modelos de texto", async () => {
    const { f, calls } = fake({ data: [{ id: "gpt-x" }, { id: "text-embedding-3" }, { id: "tts-1" }, { id: "o9" }] });
    const r = await listModels("openai", { OPENAI_API_KEY: " sk-secret " }, f);
    expect(r.status).toBe("pronta");
    expect(r.models.map((m) => m.id)).toEqual(["gpt-x", "o9"]);
    expect(calls[0].url).toBe("https://api.openai.com/v1/models");
  });

  it("Gemini: só generateContent e sem o prefixo models/", async () => {
    const { f } = fake({
      models: [
        { name: "models/gemini-a", displayName: "Gemini A", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] },
        { name: "models/imagen-3", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-b", supportedGenerationMethods: ["generateContent", "countTokens"] },
      ],
    });
    const r = await listModels("gemini", { GEMINI_API_KEY: "g-secret" }, f);
    expect(r.models).toEqual([
      { id: "gemini-a", label: "Gemini A" },
      { id: "gemini-b", label: "gemini-b" },
    ]);
  });

  it("Claude: id e nome de exibição", async () => {
    const { f, calls } = fake({ data: [{ id: "claude-z", display_name: "Claude Z" }] });
    const r = await listModels("anthropic", { ANTHROPIC_API_KEY: "a-secret" }, f);
    expect(r.models).toEqual([{ id: "claude-z", label: "Claude Z" }]);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/models");
    expect(calls[0].init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0].init.headers["x-api-key"]).toBe("a-secret");
  });

  it("sem chave vira sem_chave e não chama a rede", async () => {
    const { f, calls } = fake({});
    const r = await listModels("openai", {}, f);
    expect(r.status).toBe("sem_chave");
    expect(calls).toHaveLength(0);
  });

  it("401 vira chave_recusada sem vazar a chave", async () => {
    const { f } = fake({ error: "bad key g-secret-123" }, 401);
    for (const id of ["anthropic", "openai", "gemini"] as const) {
      const r = await listModels(id, { ANTHROPIC_API_KEY: "g-secret-123", OPENAI_API_KEY: "g-secret-123", GEMINI_API_KEY: "g-secret-123" }, f);
      expect(r.status).toBe("chave_recusada");
      expect(r.models).toEqual([]);
      expect(JSON.stringify(r)).not.toContain("g-secret-123");
    }
  });

  it("outro erro HTTP vira erro, sem vazar a chave", async () => {
    const { f } = fake({}, 500);
    const r = await listModels("gemini", { GOOGLE_GEMINI_API_KEY: "k-secret" }, f);
    expect(r.status).toBe("erro");
    expect(r.detail).toContain("500");
    expect(JSON.stringify(r)).not.toContain("k-secret");
  });

  it("Ollama lista modelos e usa OLLAMA_BASE_URL", async () => {
    const { f, calls } = fake({ models: [{ name: "qwen:7b" }, { name: "llama3" }] });
    const r = await listModels("ollama", { OLLAMA_BASE_URL: "http://mac:1234" }, f);
    expect(r.status).toBe("pronta");
    expect(r.models.map((m) => m.id)).toEqual(["llama3", "qwen:7b"]);
    expect(calls[0].url).toBe("http://mac:1234/api/tags");
  });

  it("Ollama: modelos de busca (embed) ficam de fora da lista de texto", async () => {
    const { f } = fake({ models: [{ name: "nomic-embed-text:latest" }, { name: "qwen3:8b" }, { name: "mxbai-embed-large" }, { name: "llama3" }] });
    const r = await listModels("ollama", {}, f);
    expect(r.status).toBe("pronta");
    expect(r.models.map((m) => m.id)).toEqual(["llama3", "qwen3:8b"]);
  });

  it("Ollama sem resposta vira so_no_mac", async () => {
    const f = (async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { code: "ECONNREFUSED" });
    }) as unknown as typeof fetch;
    const r = await listModels("ollama", {}, f);
    expect(r.status).toBe("so_no_mac");
    expect(r.models).toEqual([]);
  });

  it("Ollama responde JSON no formato pedido e custa zero", async () => {
    const schema: any = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
    const req: any = { promptId: "p", promptVersion: "1", system: "s", input: "i", schema, schemaName: "t", maxOutputTokens: 500 };
    const good = fake({ message: { content: JSON.stringify({ ok: true }) }, prompt_eval_count: 10, eval_count: 5 });
    const r = await new OllamaProvider("http://localhost:11434", "llama3", good.f).generate<{ ok: boolean }>(req);
    expect(r.output).toEqual({ ok: true });
    expect(r).toMatchObject({ costUsd: 0, inputTokens: 10, outputTokens: 5, provider: "ollama", model: "llama3" });
    expect(good.calls[0].url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(good.calls[0].init.body);
    expect(body).toMatchObject({ model: "llama3", stream: false, options: { num_predict: 500 } });
    expect(body.format).toBeTruthy();
    expect(body.messages.map((m: any) => m.role)).toEqual(["system", "user"]);
    const bad = fake({ message: { content: JSON.stringify({ ok: "sim" }) } });
    await expect(new OllamaProvider("http://localhost:11434", "llama3", bad.f).generate(req)).rejects.toBeInstanceOf(AiInvalidOutput);
    const notJson = fake({ message: { content: "oi" } });
    await expect(new OllamaProvider("http://localhost:11434", "llama3", notJson.f).generate(req)).rejects.toBeInstanceOf(AiInvalidOutput);
  });

  it("Gemini: o raciocínio (thoughtsTokenCount) conta como saída; sem nenhum dos dois o total é nulo", async () => {
    const { resolveProviderKind } = await import("../../server/contentHub/ai/provider");
    const schema: any = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
    const req: any = { promptId: "p", promptVersion: "1", system: "s", input: "i", schema, schemaName: "t", maxOutputTokens: 500 };
    vi.stubEnv("GEMINI_API_KEY", "g".repeat(40));
    vi.stubEnv("CONTENT_HUB_PRICE_INPUT_PER_MTOK", "1");
    vi.stubEnv("CONTENT_HUB_PRICE_OUTPUT_PER_MTOK", "10");
    // a biblioteca do Gemini chama o fetch global: a resposta é simulada, sem rede
    const run = async (usageMetadata: unknown) => {
      const body = { candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }], role: "model" }, finishReason: "STOP", index: 0 }], usageMetadata };
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
      const { provider } = resolveProviderKind("gemini", undefined, "gemini-x", { allowExternal: true });
      return provider!.generate<{ ok: boolean }>(req);
    };
    try {
      const ambos = await run({ promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 60, totalTokenCount: 200 });
      expect(ambos).toMatchObject({ output: { ok: true }, provider: "gemini", model: "gemini-x", inputTokens: 100, outputTokens: 100 });
      expect(ambos.costUsd).toBeCloseTo((100 * 1 + 100 * 10) / 1_000_000, 8); // o raciocínio é cobrado como saída
      expect((await run({ promptTokenCount: 100, thoughtsTokenCount: 25 })).outputTokens).toBe(25);
      expect((await run({ promptTokenCount: 100, candidatesTokenCount: 30 })).outputTokens).toBe(30);
      const nenhum = await run({ promptTokenCount: 100 });
      expect(nenhum.outputTokens).toBeNull();
      expect(nenhum.costUsd).toBeNull();
      expect((await run(undefined)).outputTokens).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("Gemini: chave inválida (400 API_KEY_INVALID) vira chave_recusada sem vazar a chave", async () => {
    const { f } = fake({ error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }], message: "key=k-secret-9" } }, 400);
    const r = await listModels("gemini", { GEMINI_API_KEY: "k-secret-9" }, f);
    expect(r.status).toBe("chave_recusada");
    expect(JSON.stringify(r)).not.toContain("k-secret-9");
    const outro = fake({ error: { message: "bad request" } }, 400);
    expect((await listModels("gemini", { GEMINI_API_KEY: "k" }, outro.f)).status).toBe("erro");
  });

  it("Claude: segue has_more com after_id e avisa lista incompleta se a página seguinte falhar", async () => {
    const mk = (second: () => Response) => {
      const urls: string[] = [];
      const f = (async (url: any) => {
        urls.push(String(url));
        return urls.length === 1 ? json({ data: [{ id: "c-a", display_name: "A" }], has_more: true, last_id: "c-a" }) : second();
      }) as unknown as typeof fetch;
      return { f, urls };
    };
    const ok = mk(() => json({ data: [{ id: "c-b", display_name: "B" }], has_more: false, last_id: "c-b" }));
    const r = await listModels("anthropic", { ANTHROPIC_API_KEY: "a" }, ok.f);
    expect(ok.urls[1]).toContain("after_id=c-a");
    expect(r.models.map((m) => m.id)).toEqual(["c-a", "c-b"]);
    expect(r.detail).toBeNull();
    const bad = mk(() => json({}, 500));
    const r2 = await listModels("anthropic", { ANTHROPIC_API_KEY: "a" }, bad.f);
    expect(r2).toMatchObject({ status: "pronta", detail: "Lista possivelmente incompleta." });
    expect(r2.models.map((m) => m.id)).toEqual(["c-a"]);
  });
});

describe("Preços", () => {
  it("estimativa no pior caso", async () => {
    const { estimateCostUsd } = await import("../../server/ai/prices");
    const price = { input_per_mtok: 3, output_per_mtok: 15 };
    const cost = estimateCostUsd(price, 4000, 1000);
    expect(cost).toBeCloseTo(0.018, 6);
  });

  it("sem preço devolve null", async () => {
    const { estimateCostUsd } = await import("../../server/ai/prices");
    expect(estimateCostUsd(null, 4000, 1000)).toBeNull();
  });

  it("costUsd com preço devolve o custo exato", async () => {
    const { costUsd } = await import("../../server/ai/prices");
    const price = { input_per_mtok: 3, output_per_mtok: 15 };
    const cost = costUsd(price, 1000, 1000);
    expect(cost).toBeCloseTo(0.018, 6);
  });

  it("costUsd com token nulo devolve null", async () => {
    const { costUsd } = await import("../../server/ai/prices");
    const price = { input_per_mtok: 3, output_per_mtok: 15 };
    expect(costUsd(price, null, 1000)).toBeNull();
    expect(costUsd(price, 1000, null)).toBeNull();
    expect(costUsd(price, null, null)).toBeNull();
  });

  it("cada preço inicial tem fonte e data", async () => {
    const { PRICE_SEED } = await import("../../server/ai/prices");
    expect(PRICE_SEED.length).toBeGreaterThan(0);
    const sourceUrl = /^https:\/\//;
    const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
    for (const price of PRICE_SEED) {
      expect(price.source_url).toMatch(sourceUrl);
      expect(price.checked_on).toMatch(dateFormat);
      expect(typeof price.input_per_mtok).toBe("number");
      expect(typeof price.output_per_mtok).toBe("number");
      expect(price.input_per_mtok).toBeGreaterThanOrEqual(0);
      expect(price.output_per_mtok).toBeGreaterThanOrEqual(0);
    }
  });

  it("sem preço duplicado no PRICE_SEED e todos os preços são números >= 0", async () => {
    const { PRICE_SEED } = await import("../../server/ai/prices");
    const seen = new Set<string>();
    for (const price of PRICE_SEED) {
      const key = `${price.provider}:${price.model}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(typeof price.input_per_mtok).toBe("number");
      expect(typeof price.output_per_mtok).toBe("number");
      expect(price.input_per_mtok).toBeGreaterThanOrEqual(0);
      expect(price.output_per_mtok).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Configuração", () => {
  const ids = ["anthropic", "openai", "gemini", "ollama"] as const;
  const mkCfg = (over: { enabled?: string[]; models?: Record<string, string[]>; caps?: boolean; prices?: any[]; status?: Record<string, string> } = {}): any => {
    const enabled = over.enabled ?? ["anthropic", "openai", "gemini", "ollama"];
    const providers: any = {};
    for (const id of ids) {
      providers[id] = { enabled: enabled.includes(id), models: (over.models?.[id] ?? []).map((m) => ({ id: m, label: m })), status: over.status?.[id] ?? null };
    }
    return { providers, functions: {}, settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: over.caps ?? false, tab_override_enabled: false }, prices: over.prices ?? [] };
  };
  const ref = (provider: string, model: string) => ({ provider, model }) as any;
  const fc = (mode: string, primary: any, reviewers: any[] = [], fallback: any = null): any => ({ key: "criacao", mode, primary, fallback, reviewers, care: "caprichado" });

  it("funções do prompt", async () => {
    const { functionForPrompt } = await import("../../server/ai/config");
    expect(functionForPrompt("evidence")).toBe("verificacao");
    expect(functionForPrompt("qanalysis")).toBe("engenharia_reversa");
    expect(functionForPrompt("classify")).toBe("criacao");
  });

  it("linha com Sonnet criando e Opus conferindo é recusada (mesma família)", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const r = validateFunctionConfig(fc("linha", ref("anthropic", "claude-sonnet-5-5"), [ref("anthropic", "claude-opus-5-5")]), mkCfg());
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.problems.join(" ")).toContain("claude-opus-5-5");
  });

  it("comitê Claude+Claude passa com aviso de não independente", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const r = validateFunctionConfig(fc("comite", ref("anthropic", "claude-sonnet-5-5"), [ref("anthropic", "claude-opus-5-5")]), mkCfg());
    expect(r.problems).toEqual([]);
    expect(r.warnings.join(" ")).toContain("não é independente");
  });

  it("modelo retirado da lista aparece como problema", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const cfg = mkCfg({ models: { anthropic: ["claude-opus-5-5"], gemini: [] } });
    const r = validateFunctionConfig(fc("sozinha", ref("anthropic", "claude-velho")), cfg);
    expect(r.problems.join(" ")).toContain("modelo não está mais na lista");
    // lista vazia (nunca atualizada) não acusa
    expect(validateFunctionConfig(fc("sozinha", ref("gemini", "gemini-x")), cfg).problems).toEqual([]);
  });

  it("teto ligado e modelo pago sem preço é recusado; Ollama sem preço passa", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const cfg = mkCfg({ caps: true });
    expect(validateFunctionConfig(fc("sozinha", ref("openai", "gpt-x")), cfg).problems.join(" ")).toContain("sem preço");
    expect(validateFunctionConfig(fc("sozinha", ref("ollama", "qwen3")), cfg).problems).toEqual([]);
    const comPreco = mkCfg({ caps: true, prices: [{ provider: "openai", model: "gpt-x", input_per_mtok: 1, output_per_mtok: 2 }] });
    expect(validateFunctionConfig(fc("sozinha", ref("openai", "gpt-x")), comPreco).problems).toEqual([]);
  });

  it("IA desligada não cria provedor", async () => {
    const { makeProvider } = await import("../../server/ai/config");
    const r = makeProvider(ref("anthropic", "claude-sonnet-5-5"), mkCfg({ enabled: [] }), {});
    expect(r.provider).toBeNull();
    expect(r.pending).toContain("está desligada na Central de IAs");
    expect(r.pending).toBe("Claude está desligada na Central de IAs.");
  });

  it("Ollama em produção não cria provedor", async () => {
    const { makeProvider } = await import("../../server/ai/config");
    const r = makeProvider(ref("ollama", "qwen3"), mkCfg(), { NODE_ENV: "production" } as any);
    expect(r.provider).toBeNull();
    expect(r.pending).toBe("Ollama roda só no Mac.");
    const r2 = makeProvider(ref("ollama", "qwen3"), mkCfg({ status: { ollama: "so_no_mac" } }), {} as any);
    expect(r2.pending).toBe("Ollama roda só no Mac.");
  });

  it("sem função salva, usa o provedor das variáveis", async () => {
    const { envFallbackRef } = await import("../../server/ai/config");
    const env = { CONTENT_HUB_AI_PROVIDER_CREATE: "anthropic", CONTENT_HUB_MODEL_CREATE: "claude-x" } as any;
    expect(envFallbackRef("criacao", env)).toEqual({ provider: "anthropic", model: "claude-x" });
  });

  it("comitê com 1 membro ou 5 membros é recusado", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const a = ref("anthropic", "claude-sonnet-5-5");
    expect(validateFunctionConfig(fc("comite", a, []), mkCfg()).problems).toContain("O comitê precisa de pelo menos 2 membros.");
    const quatro = [ref("openai", "gpt-a"), ref("gemini", "gemini-a"), ref("ollama", "qwen3"), ref("openai", "gpt-b")];
    expect(validateFunctionConfig(fc("comite", a, quatro), mkCfg()).problems).toContain("O comitê aceita no máximo 4 membros.");
  });

  it("linha com conferente da mesma família da reserva é recusada", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const r = validateFunctionConfig(fc("linha", ref("anthropic", "claude-sonnet-5-5"), [ref("openai", "gpt-a")], ref("openai", "gpt-b")), mkCfg());
    expect(r.problems.join(" ")).toContain("gpt-b");
  });

  it("sozinha sem principal é recusada", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    expect(validateFunctionConfig(fc("sozinha", null), mkCfg()).problems).toContain("Escolha a IA principal.");
  });

  it("loadAiConfig lê o banco, converte números e guarda por 10 s; invalidateAiConfig limpa", async () => {
    const { loadAiConfig, invalidateAiConfig } = await import("../../server/ai/config");
    invalidateAiConfig(db);
    const p1 = loadAiConfig(db);
    const p2 = loadAiConfig(db);
    expect(p2).toBe(p1);
    const c1 = await p1;
    expect(typeof c1.providers.anthropic.enabled).toBe("boolean");
    expect(Array.isArray(c1.providers.anthropic.models)).toBe(true);
    const orig = c1.settings;
    try {
      await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { caps_enabled: !orig.caps_enabled } });
      expect((await loadAiConfig(db)).settings.caps_enabled).toBe(orig.caps_enabled); // ainda no cache
      invalidateAiConfig(db);
      expect((await loadAiConfig(db)).settings.caps_enabled).toBe(!orig.caps_enabled);

      await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { monthly_cap_usd: 0.5, per_run_cap_usd: null } });
      await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "anthropic", p_model: "claude-cfg-teste", p_price: { input_per_mtok: 3, output_per_mtok: 15, source_url: "https://exemplo.com", checked_on: "2026-10-07" } });
      invalidateAiConfig(db);
      const c2 = await loadAiConfig(db);
      expect(c2.settings.monthly_cap_usd).toBe(0.5);
      expect(c2.settings.per_run_cap_usd).toBeNull();
      const price = c2.prices.find((x) => x.provider === "anthropic" && x.model === "claude-cfg-teste")!;
      expect(price.input_per_mtok).toBe(3);
      expect(price.output_per_mtok).toBe(15);
    } finally {
      await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { caps_enabled: orig.caps_enabled, monthly_cap_usd: orig.monthly_cap_usd, per_run_cap_usd: orig.per_run_cap_usd } });
      invalidateAiConfig(db);
    }
  });

  it("sem função salva e sem uiKind, vale CONTENT_HUB_AI_PROVIDER antes do padrão; as específicas ganham dela", async () => {
    const { envFallbackRef } = await import("../../server/ai/config");
    const gemini = { provider: "gemini", model: "gemini-2.5-pro" };
    const env = { CONTENT_HUB_AI_PROVIDER: "gemini" } as any;
    for (const fn of ["criacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "verificacao"] as const) expect(envFallbackRef(fn, env), fn).toEqual(gemini);
    const mix = { CONTENT_HUB_AI_PROVIDER: "gemini", CONTENT_HUB_AI_PROVIDER_CREATE: "anthropic", CONTENT_HUB_VERIFIER_PROVIDER: "openai", CONTENT_HUB_OPENAI_MODEL: "gpt-x" } as any;
    expect(envFallbackRef("criacao", mix)).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(envFallbackRef("engenharia_reversa", mix)).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(envFallbackRef("verificacao", mix)).toEqual({ provider: "openai", model: "gpt-x" });
    // o modelo vem da variável da IA escolhida
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER: "gemini", CONTENT_HUB_GEMINI_MODEL: "g-env" } as any)?.model).toBe("g-env");
    // com a escolha da tela (uiKind) vale a tela
    expect(envFallbackRef("criacao", env, "anthropic")).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    // nada definido: o padrão de sempre
    expect(envFallbackRef("criacao", {} as any)).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
  });

  it("envFallbackRef: CONTENT_HUB_MODEL_CREATE só vale com a IA de _CREATE (ou o padrão sem variável de IA); o que não é IA é pulado", async () => {
    const { envFallbackRef } = await import("../../server/ai/config");
    const claude = { provider: "anthropic", model: "claude-sonnet-5-5" };
    const gemini = { provider: "gemini", model: "gemini-2.5-pro" };
    // IA vinda de CONTENT_HUB_AI_PROVIDER: o modelo é o da própria IA, não o CONTENT_HUB_MODEL_CREATE (que era de outra IA)
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER: "gemini", CONTENT_HUB_MODEL_CREATE: "claude-x" } as any)).toEqual(gemini);
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER: "gemini", CONTENT_HUB_MODEL_CREATE: "claude-x", CONTENT_HUB_GEMINI_MODEL: "g-env" } as any)).toEqual({ provider: "gemini", model: "g-env" });
    // IA vinda de CONTENT_HUB_AI_PROVIDER_CREATE: o CONTENT_HUB_MODEL_CREATE vale; e _CREATE ganha da geral
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER_CREATE: "anthropic", CONTENT_HUB_MODEL_CREATE: "claude-x" } as any)).toEqual({ provider: "anthropic", model: "claude-x" });
    expect(envFallbackRef("engenharia_reversa", { CONTENT_HUB_AI_PROVIDER_CREATE: "anthropic", CONTENT_HUB_AI_PROVIDER: "gemini", CONTENT_HUB_MODEL_CREATE: "claude-x" } as any)).toEqual({ provider: "anthropic", model: "claude-x" });
    // nenhuma variável de IA: o padrão Claude, com o CONTENT_HUB_MODEL_CREATE (como o resolveCreatorProvider fazia)
    expect(envFallbackRef("criacao", { CONTENT_HUB_MODEL_CREATE: "claude-x" } as any)).toEqual({ provider: "anthropic", model: "claude-x" });
    // IA sem modelo padrão: só com a variável do modelo
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER: "openai" } as any)).toBeNull();
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER: "openai", CONTENT_HUB_OPENAI_MODEL: "gpt-x" } as any)).toEqual({ provider: "openai", model: "gpt-x" });
    // valores que não são uma das 4 IAs (ex.: mock) são pulados na cadeia, em vez de devolver nada
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER: "mock" } as any)).toEqual(claude);
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER_CREATE: "mock", CONTENT_HUB_AI_PROVIDER: "gemini" } as any)).toEqual(gemini);
    expect(envFallbackRef("verificacao", { CONTENT_HUB_VERIFIER_PROVIDER: "mock", CONTENT_HUB_AI_PROVIDER: "gemini" } as any)).toEqual(gemini);
    expect(envFallbackRef("verificacao", { CONTENT_HUB_VERIFIER_PROVIDER: "mock" } as any)).toEqual(claude);
    // IA definida só com valor que não serve: cai no padrão, sem aproveitar o modelo da criação
    expect(envFallbackRef("criacao", { CONTENT_HUB_AI_PROVIDER: "mock", CONTENT_HUB_MODEL_CREATE: "mock-x" } as any)).toEqual(claude);
  });

  it("envFallbackRef com uiKind usa LESSON_ASSIST_/PODCAST_ e os padrões", async () => {
    const { envFallbackRef } = await import("../../server/ai/config");
    expect(envFallbackRef("criacao", {} as any, "gemini")).toEqual({ provider: "gemini", model: "gemini-2.5-pro" });
    expect(envFallbackRef("criacao", {} as any, "openai")).toBeNull();
    const env = { LESSON_ASSIST_GEMINI_MODEL: "g-lesson", PODCAST_GEMINI_MODEL: "g-pod", CONTENT_HUB_GEMINI_MODEL: "g-hub" } as any;
    expect(envFallbackRef("assistente_preencher", env, "gemini")?.model).toBe("g-lesson");
    expect(envFallbackRef("criacao", env, "gemini")?.model).toBe("g-pod");
    expect(envFallbackRef("criacao", { CONTENT_HUB_GEMINI_MODEL: "g-hub" } as any, "gemini")?.model).toBe("g-hub");
    expect(envFallbackRef("verificacao", {} as any)).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
  });

  describe("situação das funções salvas neste servidor", () => {
    afterEach(() => vi.unstubAllEnvs());
    const MAC = "Ollama roda só no Mac.";
    // chave do Google ausente: desde 2026-10-09 a mensagem fala da VERTEX_API_KEY (Vertex AI) e da GEMINI_API_KEY (AI Studio)
    const GEM = "Chave do Google ausente no servidor: defina VERTEX_API_KEY (Vertex AI) ou GEMINI_API_KEY (AI Studio).";
    const O = ref("ollama", "qwen3");
    const C = ref("anthropic", "claude-sonnet-5-5");
    const G = ref("gemini", "gemini-2.5-pro");
    /** O servidor com as três chaves; PROD é o site publicado e LOCAL o Mac. As chaves são conferidas pelo env recebido. */
    const KEYS = { ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k", GEMINI_API_KEY: "g".repeat(40) };
    const PROD = { ...KEYS, NODE_ENV: "production" } as any;
    const LOCAL = { ...KEYS } as any;
    const SEM_CHAVE = (nome: string) => `${nome}: sem chave neste servidor (site). O processamento da Central (Cloud Run) usa as chaves de lá; Aulas e Podcasts rodam no site e precisam da chave aqui.`;
    // IA09: modelo pago sem preço ganha um aviso próprio (precoObrigatorioModeloPago.test.ts); aqui os modelos têm preço, para estes
    // testes (de outra regra) continuarem comparando a lista exata de avisos
    const PRICED = [["anthropic", "claude-sonnet-5-5"], ["gemini", "gemini-2.5-pro"], ["openai", "gpt-x"], ["gemini", "gemini-flash"]].map(([provider, model]) => ({ provider, model, input_per_mtok: 1, output_per_mtok: 2, source_url: "https://exemplo.com", checked_on: "2026-10-11" }));
    const check = async (fn: any, env: any = PROD, over: Parameters<typeof mkCfg>[0] = {}) => {
      const { functionChecks } = await import("../../server/ai/config");
      const cfg = mkCfg({ prices: PRICED, ...over });
      cfg.functions.criacao = fn;
      return functionChecks(cfg, env).criacao;
    };

    it("só Ollama no site publicado: não está pronta, com o motivo; no Mac continua pronta", async () => {
      const r = await check(fc("sozinha", O));
      expect(r).toMatchObject({ source: "banco", ready: false, ref: O });
      expect(r.problems).toEqual([MAC]);
      // Ollama sem resposta (situação so_no_mac) vale o mesmo
      expect((await check(fc("sozinha", O), LOCAL, { status: { ollama: "so_no_mac" } })).problems).toEqual([MAC]);
      expect(await check(fc("sozinha", O), LOCAL)).toMatchObject({ ready: true, problems: [], warnings: [] });
    });

    it("principal que não roda e reserva que roda: pronta, com o aviso de que a reserva vai responder", async () => {
      const r = await check(fc("sozinha", O, [], C));
      expect(r).toMatchObject({ ready: true, problems: [] });
      expect(r.warnings).toEqual([`A principal não pode rodar aqui (${MAC}); a reserva vai responder.`]);
    });

    it("principal e reserva que não rodam: não está pronta, com o motivo (uma vez só)", async () => {
      const r = await check(fc("sozinha", O, [], ref("ollama", "llama3")));
      expect(r.ready).toBe(false);
      expect(r.problems).toEqual([MAC]);
    });

    it("IA desligada continua sendo problema, sem repetir o motivo", async () => {
      const r = await check(fc("sozinha", O, [], C), PROD, { enabled: ["anthropic"] });
      expect(r.ready).toBe(false);
      expect(r.problems).toEqual(["Ollama está desligada na Central de IAs."]);
      expect(r.warnings).toEqual([]);
    });

    it("conferente que não roda vira aviso e não tira a função de pronta", async () => {
      const r = await check(fc("linha", C, [O]));
      expect(r).toMatchObject({ ready: true, problems: [] });
      // aviso fixo da Linha de produção (correção IA04, 2026-10-10) e o conferente que não roda
      expect(r.warnings).toEqual(["Nesta etapa a função usa só a IA principal e a reserva: os conferentes da Linha de produção ainda não rodam.", `Ollama qwen3 não pode rodar aqui (${MAC})`]);
      // reserva que não roda, com a principal rodando, também só avisa
      const reserva = await check(fc("sozinha", C, [], O));
      expect(reserva).toMatchObject({ ready: true, problems: [] });
      expect(reserva.warnings).toEqual([`A reserva Ollama qwen3 não pode rodar aqui (${MAC})`]);
    });

    it("comitê: vale a regra de principal e reserva (o uso real só chama as duas); membro que não roda avisa", async () => {
      // aviso fixo do Comitê (correção IA04, 2026-10-10): sempre, não só com menos de 2 membros rodando
      const NOTA = "Nesta etapa a função usa só a IA principal e a reserva: os membros do Comitê ainda não rodam.";
      // principal Ollama fora do Mac e 2 membros que rodam, sem reserva: nada responderia → não está pronta
      const sem = await check(fc("comite", O, [C, G]));
      expect(sem).toMatchObject({ ready: false, problems: [MAC] });
      // com reserva que roda, vale: a reserva responde
      const com = await check(fc("comite", O, [ref("openai", "gpt-x"), G], C));
      expect(com).toMatchObject({ ready: true, problems: [] });
      expect(com.warnings).toEqual([NOTA, `A principal não pode rodar aqui (${MAC}); a reserva vai responder.`]);
      // membro que não roda: aviso por membro, com o motivo
      const membro = await check(fc("comite", C, [O, G]));
      expect(membro).toMatchObject({ ready: true, problems: [] });
      expect(membro.warnings).toEqual([NOTA, `Ollama qwen3 não pode rodar aqui (${MAC})`]);
      // menos de 2 membros rodam: o mesmo aviso fixo
      const poucos = await check(fc("comite", C, [O]));
      expect(poucos).toMatchObject({ ready: true, problems: [] });
      expect(poucos.warnings).toEqual([NOTA, `Ollama qwen3 não pode rodar aqui (${MAC})`]);
      // membro com a IA desligada também diz o motivo (a função segue com o problema da IA desligada)
      const off = await check(fc("comite", C, [G, O]), PROD, { enabled: ["anthropic", "gemini"] });
      expect(off.ready).toBe(false);
      expect(off.problems).toEqual(["Ollama está desligada na Central de IAs."]);
      expect(off.warnings).toEqual([NOTA, "Ollama qwen3 não pode rodar aqui (Ollama está desligada na Central de IAs.)"]);
    });

    it("chave ausente neste servidor (site) é só aviso: a função continua pronta", async () => {
      const semChaves = { NODE_ENV: "production" } as any;
      const g = await check(fc("sozinha", G), semChaves);
      expect(g).toMatchObject({ ready: true, problems: [] });
      expect(g.warnings).toEqual([SEM_CHAVE("Gemini")]);
      // um aviso por IA (principal e reserva da mesma IA não repetem); IA com a chave não avisa
      expect((await check(fc("sozinha", C, [], G), { NODE_ENV: "production", ANTHROPIC_API_KEY: "k" } as any)).warnings).toEqual([SEM_CHAVE("Gemini")]);
      expect((await check(fc("sozinha", G, [], ref("gemini", "gemini-flash")), semChaves)).warnings).toEqual([SEM_CHAVE("Gemini")]);
      // chave do Gemini com menos de 30 caracteres conta como sem chave; com 30 não avisa
      expect((await check(fc("sozinha", G), { GEMINI_API_KEY: "g".repeat(30) } as any)).warnings).toEqual([]);
      expect((await check(fc("sozinha", G), { GEMINI_API_KEY: "curta" } as any)).warnings).toEqual([SEM_CHAVE("Gemini")]);
      // Ollama em produção continua não pronta; IA desligada continua problema e não ganha aviso de chave
      expect(await check(fc("sozinha", O), semChaves)).toMatchObject({ ready: false, problems: [MAC] });
      expect(await check(fc("sozinha", G), semChaves, { enabled: ["anthropic"] })).toMatchObject({ ready: false, problems: ["Gemini está desligada na Central de IAs."], warnings: [] });
    });

    it("função sem configuração salva: chave ausente também é só aviso", async () => {
      const { functionChecks } = await import("../../server/ai/config");
      const r = functionChecks(mkCfg({ prices: PRICED }), { CONTENT_HUB_AI_PROVIDER: "gemini" } as any).criacao;
      expect(r).toMatchObject({ source: "variaveis", ready: true, problems: [] });
      expect(r.warnings).toEqual([SEM_CHAVE("Gemini")]);
      expect(functionChecks(mkCfg({ prices: PRICED }), { CONTENT_HUB_AI_PROVIDER: "gemini", GEMINI_API_KEY: "g".repeat(40) } as any).criacao.warnings).toEqual([]);
    });

    it("keyPending: confere as chaves pelo env recebido, com as regras e as mensagens do resolveProviderKind", async () => {
      const { keyPending } = await import("../../server/ai/config");
      const { resolveProviderKind } = await import("../../server/contentHub/ai/provider");
      expect(keyPending("anthropic", {} as any)).toBe("ANTHROPIC_API_KEY vazia no servidor.");
      expect(keyPending("anthropic", { ANTHROPIC_API_KEY: "   " } as any)).toBe("ANTHROPIC_API_KEY vazia no servidor.");
      expect(keyPending("anthropic", { ANTHROPIC_API_KEY: "k" } as any)).toBeNull();
      expect(keyPending("openai", {} as any)).toBe("OPENAI_API_KEY vazia no servidor.");
      expect(keyPending("openai", { OPENAI_API_KEY: "k" } as any)).toBeNull();
      expect(keyPending("gemini", {} as any)).toBe(GEM);
      expect(keyPending("gemini", { GEMINI_API_KEY: "g".repeat(29) } as any)).toBe(GEM);
      expect(keyPending("gemini", { GEMINI_API_KEY: "g".repeat(30) } as any)).toBeNull();
      expect(keyPending("gemini", { GOOGLE_GEMINI_API_KEY: "g".repeat(40) } as any)).toBeNull();
      expect(keyPending("ollama", {} as any)).toBeNull();
      // as mesmas respostas do resolveProviderKind, que lê o process.env (conferência contra desvio das regras)
      const estados: Record<string, string>[] = [
        {},
        { ANTHROPIC_API_KEY: "k" },
        { ANTHROPIC_API_KEY: "  " },
        { OPENAI_API_KEY: "k" },
        { GEMINI_API_KEY: "curta" },
        { GEMINI_API_KEY: "g".repeat(30) },
        { GOOGLE_GEMINI_API_KEY: "g".repeat(40) },
        { GEMINI_API_KEY: "  ", GOOGLE_GEMINI_API_KEY: "g".repeat(40) },
        { VERTEX_API_KEY: "v".repeat(53) },
        { VERTEX_API_KEY: "curta", GEMINI_API_KEY: "g".repeat(30) },
      ];
      for (const estado of estados) {
        for (const nome of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY", "VERTEX_API_KEY"]) vi.stubEnv(nome, estado[nome] ?? "");
        for (const id of ["anthropic", "openai", "gemini"] as const) {
          expect(keyPending(id, process.env), `${id} ${JSON.stringify(estado)}`).toBe(resolveProviderKind(id, undefined, "modelo-x", { allowExternal: true }).status.pending);
        }
      }
    });

    it("provider_checks: o que bloqueia (Ollama fora do Mac) e a chave ausente neste servidor, sem olhar o interruptor", async () => {
      const { providerChecks } = await import("../../server/ai/config");
      const soClaude = { ANTHROPIC_API_KEY: "k" } as any;
      expect(providerChecks(mkCfg({ enabled: [] }), soClaude)).toEqual({
        anthropic: { pending: null, blocks: false },
        openai: { pending: "OPENAI_API_KEY vazia no servidor.", blocks: false },
        gemini: { pending: GEM, blocks: false },
        ollama: { pending: null, blocks: false },
      });
      // no site publicado o Ollama bloqueia; a chave ausente não bloqueia
      const prod = providerChecks(mkCfg(), { ...soClaude, NODE_ENV: "production" });
      expect(prod.ollama).toEqual({ pending: MAC, blocks: true });
      expect(prod.gemini).toEqual({ pending: GEM, blocks: false });
      expect(providerChecks(mkCfg({ status: { ollama: "so_no_mac" } }), {} as any).ollama).toEqual({ pending: MAC, blocks: true });
    });
  });
});

describe("Maestro", () => {
  type R = { provider: string; model: string };
  const A: R = { provider: "anthropic", model: "claude-sonnet-5-5" };
  const O: R = { provider: "openai", model: "gpt-5.4" };
  const G: R = { provider: "gemini", model: "gemini-2.5-pro" };
  const L: R = { provider: "ollama", model: "qwen3" };
  const origin = { source: "central" as const, itemId: "item-1", actorId: null };
  const REQ = { promptId: "t", promptVersion: "1", system: "sistema", input: "x".repeat(400), schema: { type: "object" as const }, schemaName: "teste", maxOutputTokens: 1000 };
  type Handler = (req: any, n: number) => unknown | Promise<unknown>;
  const key = (r: R) => `${r.provider}:${r.model}`;

  /** Provedores falsos: cada chamada passa por `handler` (n = número da chamada, a partir de 1); sem rede. */
  function fakes(handlers: Record<string, Handler>, usage: { inTok?: number; outTok?: number } = {}) {
    const calls: Record<string, any[]> = {};
    const makeProviderFor = (ref: R) => {
      const h = handlers[key(ref)];
      if (!h) return null;
      return {
        name: ref.provider,
        model: ref.model,
        isMock: false,
        async generate(req: any) {
          (calls[key(ref)] ??= []).push(req);
          const output = await h(req, calls[key(ref)].length);
          return { output, provider: ref.provider, model: ref.model, inputTokens: usage.inTok ?? 10, outputTokens: usage.outTok ?? 20, latencyMs: 1, costUsd: null };
        },
      } as any;
    };
    return { makeProviderFor, calls };
  }

  const rows = async (runId: string) =>
    (await dev.db.query<any>(`select role, provider, model, outcome, mode, source, item_id, error, cost_usd::float8 as cost, function_key from public.ai_calls where run_id = $1 order by id`, [runId])).rows;
  const deps = (f: ReturnType<typeof fakes> | null, extra: any = {}) => ({ db, env: {} as any, makeProviderFor: f?.makeProviderFor, log: () => {}, ...extra });
  const run = async (d: any, fn: any, req: any = REQ, o: any = origin, override?: any) => {
    const { runFunction } = await import("../../server/ai/maestro");
    return runFunction<any>(d, fn, req, o, override);
  };
  const on = async (...ids: string[]) => {
    for (const id of ids) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
  };
  const saveFn = async (k: string, mode: string, primary: R | null, reviewers: R[] = [], fallback: R | null = null, care = "caprichado") => {
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: k, p_config: { mode, primary_ref: primary, fallback_ref: fallback, reviewers, care } });
  };
  const settings = async (s: object) => {
    await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: s });
  };
  const price = async (r: R, i: number, o: number) => {
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: r.provider, p_model: r.model, p_price: { input_per_mtok: i, output_per_mtok: o, source_url: "https://exemplo.com", checked_on: "2026-10-07" } });
  };
  const monthSpend = async () => Number(await db.service<any>("ch_worker_ai_month_spend", { p_now: new Date().toISOString() }));

  beforeEach(resetAiState);
  const refresh = async () => (await import("../../server/ai/config")).invalidateAiConfig(db);

  it("erro da IA com chave no formato novo do Google (com ponto, ex.: Vertex) não vaza no registro nem na mensagem", async () => {
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await refresh();
    const vertexKey = "AQ.Ab8RN6" + "k".repeat(44);
    const f = fakes({ [key(A)]: () => { throw new Error(`recusado para ${vertexKey} no projeto`); } });
    const r = await run(deps(f), "criacao");
    const logged = await rows(r.runId);
    expect(logged.length).toBeGreaterThan(0);
    for (const l of logged) expect(l.error ?? "").not.toContain(vertexKey);
    expect(logged[0].error).toContain("[chave]");
    expect(r.message ?? "").not.toContain(vertexKey);
  });

  it("sozinha: principal falha e a reserva responde; as duas chamadas ficam registradas", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    const f = fakes({ [key(A)]: () => { throw new Error("boom"); }, [key(O)]: () => ({ ok: 1 }) });
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("ok");
    expect(r.output).toEqual({ ok: 1 });
    const rs = await rows(r.runId);
    expect(rs.map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:falha", "principal:falha", "reserva:ok"]);
    expect(rs[0].error).toContain("boom");
    expect(rs[2].provider).toBe("openai");
  });

  it("nova tentativa: principal falha uma vez e responde na segunda (duas linhas principal)", async () => {
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await refresh();
    const f = fakes({ [key(A)]: (_r, n) => { if (n === 1) throw new Error("instável"); return { ok: 2 }; } });
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("ok");
    expect((await rows(r.runId)).map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:falha", "principal:ok"]);
  });

  it("seletor da aba: uiKind ignorado com o interruptor desligado e usado com ele ligado (função salva)", async () => {
    await on("anthropic", "gemini");
    await saveFn("criacao", "sozinha", A);
    await refresh();
    const f = fakes({ [key(A)]: () => ({ ok: "a" }), [key(G)]: () => ({ ok: "g" }) });
    const off = await run(deps(f), "criacao", REQ, origin, { uiKind: "gemini" });
    expect(off.output).toEqual({ ok: "a" });
    expect(f.calls[key(G)]).toBeUndefined();
    await settings({ tab_override_enabled: true });
    await refresh();
    const on2 = await run(deps(f), "criacao", REQ, origin, { uiKind: "gemini" });
    expect(on2.output).toEqual({ ok: "g" });
    expect((await rows(on2.runId))[0].provider).toBe("gemini");
  });

  it("seletor da aba: uiKind de IA sem modelo padrão (openai sem variável) recusa com motivo, sem trocar de modelo", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A);
    await settings({ tab_override_enabled: true });
    await refresh();
    const f = fakes({ [key(A)]: () => ({ ok: "a" }) });
    const r = await run(deps(f), "criacao", REQ, origin, { uiKind: "openai" });
    expect(r.status).toBe("falhou");
    expect(r.message).toContain("Nenhuma IA definida");
    expect(f.calls[key(A)]).toBeUndefined();
  });

  it("seletor da aba: uiKind cujo modelo não está na lista não vazia fica bloqueado", async () => {
    await on("anthropic", "gemini");
    await dev.db.query(`update public.ai_providers set models = '[{"id":"outro-modelo","label":"Outro"}]'::jsonb where id = 'gemini'`);
    await saveFn("criacao", "sozinha", A);
    await settings({ tab_override_enabled: true });
    await refresh();
    const f = fakes({ [key(A)]: () => ({ ok: "a" }), [key(G)]: () => ({ ok: "g" }) });
    const r = await run(deps(f), "criacao", REQ, origin, { uiKind: "gemini" });
    expect(r.status).toBe("falhou");
    expect(f.calls[key(G)]).toBeUndefined();
    expect(f.calls[key(A)]).toBeUndefined();
    expect((await rows(r.runId)).map((x: any) => x.outcome)).toEqual(["bloqueada"]);
  });

  it("linha: problema de gravidade alta vira precisa_revisao", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "linha", A, [O]);
    await refresh();
    const f = fakes({
      [key(A)]: () => ({ gabarito: "A" }),
      [key(O)]: (req) => {
        expect(req.schemaName).toBe("parecer");
        expect(req.input).toContain("RESPOSTA A CONFERIR");
        return { verdict: "problemas", problems: [{ severity: "alta", field: "gabarito", description: "errado" }] };
      },
    });
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("precisa_revisao");
    expect(r.output).toEqual({ gabarito: "A" });
    expect(r.reviews).toHaveLength(1);
    expect((await rows(r.runId)).map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["criadora:ok", "conferente:ok"]);
  });

  it("linha: conferente fora do ar vira precisa_revisao (conferência incompleta)", async () => {
    await on("anthropic");
    await saveFn("criacao", "linha", A, [O]);
    await refresh();
    const f = fakes({ [key(A)]: () => ({ gabarito: "A" }), [key(O)]: () => ({ verdict: "de_acordo", problems: [] }) });
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("precisa_revisao");
    expect(r.message).toContain("conferência incompleta");
    expect(f.calls[key(O)]).toBeUndefined();
    const rs = await rows(r.runId);
    expect(rs.find((x: any) => x.role === "conferente").outcome).toBe("bloqueada");
  });

  it("comitê: concordância no gabarito e divergência na área", async () => {
    await on("anthropic", "openai", "gemini");
    await saveFn("criacao", "comite", A, [O, G]);
    await refresh();
    const f = fakes({ [key(A)]: () => ({ gabarito: "A", area: "x" }), [key(O)]: () => ({ gabarito: "A", area: "y" }), [key(G)]: () => ({ gabarito: "A", area: "x" }) });
    const r = await run(deps(f), "criacao", { ...REQ, compareFields: ["gabarito", "area"] });
    expect(r.agreement[0]).toMatchObject({ field: "gabarito", agree: true });
    expect(r.agreement[1]).toMatchObject({ field: "area", agree: false });
    expect(r.status).toBe("precisa_revisao");
    expect(r.outputs).toHaveLength(3);
    expect(r.output).toEqual({ gabarito: "A", area: "x" });
    expect((await rows(r.runId)).every((x: any) => x.role === "membro" && x.mode === "comite")).toBe(true);
  });

  it("comitê com 1 de 3 respondendo falha", async () => {
    await on("anthropic", "openai", "gemini");
    await saveFn("criacao", "comite", A, [O, G]);
    await refresh();
    const f = fakes({ [key(A)]: () => ({ gabarito: "A" }), [key(O)]: () => { throw new Error("fora"); }, [key(G)]: () => { throw new Error("fora"); } });
    const r = await run(deps(f), "criacao", { ...REQ, compareFields: ["gabarito"] });
    expect(r.status).toBe("falhou");
    expect(r.outputs.filter((o: any) => o.output).length).toBe(1);
  });

  it("teto por chamada: comitê de 3 estimado acima do teto não chama ninguém", async () => {
    await on("anthropic", "openai", "gemini");
    await saveFn("criacao", "comite", A, [O, G]);
    for (const r of [A, O, G]) await price(r, 10, 20); // cada membro ≈ 0,021; os três ≈ 0,063 contra o teto de 0,05
    await settings({ caps_enabled: true, per_run_cap_usd: 0.05 });
    await refresh();
    const f = fakes({ [key(A)]: () => ({}), [key(O)]: () => ({}), [key(G)]: () => ({}) });
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("parou_no_teto");
    expect(r.message).toMatch(/teto por chamada de US\$ 0,05/);
    expect(Object.keys(f.calls)).toEqual([]);
    const rs = await rows(r.runId);
    expect(rs).toHaveLength(3);
    expect(rs.every((x: any) => x.outcome === "teto")).toBe(true);
  });

  it("teto mensal: gasto + estimativa acima do teto para as pagas; Ollama continua", async () => {
    await on("anthropic", "ollama");
    await saveFn("criacao", "linha", L, [A]);
    await price(A, 2, 10);
    await settings({ caps_enabled: true, monthly_cap_usd: 0.92 });
    await dev.db.query(`insert into public.ai_calls (function_key, mode, role, provider, model, cost_usd, outcome) values ('criacao', 'sozinha', 'principal', 'anthropic', 'm', 0.9, 'ok')`);
    await refresh();
    const f = fakes({ [key(L)]: () => ({ gabarito: "A" }), [key(A)]: () => ({ verdict: "de_acordo", problems: [] }) });
    const r = await run(deps(f), "criacao");
    expect(f.calls[key(A)]).toBeUndefined();
    expect(r.output).toEqual({ gabarito: "A" });
    expect(r.status).toBe("precisa_revisao");
    const rs = await rows(r.runId);
    expect(rs.map((x: any) => `${x.provider}:${x.outcome}`)).toEqual(["ollama:ok", "anthropic:teto"]);
    expect(rs[0].cost).toBe(0);
  });

  it("IA desligada depois de configurada: recusa com a mensagem e sem cair nas variáveis", async () => {
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: false });
    await refresh();
    const f = fakes({ [key(A)]: () => ({ ok: 1 }), "anthropic:claude-env": () => ({ ok: 1 }) });
    const env = { CONTENT_HUB_AI_PROVIDER_CREATE: "anthropic", CONTENT_HUB_MODEL_CREATE: "claude-env" } as any;
    const r = await run(deps(f, { env }), "criacao");
    expect(r.status).toBe("falhou");
    expect(r.message).toContain("Claude está desligada na Central de IAs");
    expect(Object.keys(f.calls)).toEqual([]);
    expect((await rows(r.runId))[0].outcome).toBe("bloqueada");
  });

  it("modelo retirado da lista: falha com o motivo, sem usar outro modelo", async () => {
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await db.service("ch_worker_ai_store_models", { p_provider: "anthropic", p_models: [{ id: "claude-outro", label: "Outro" }], p_status: "ok", p_detail: null });
    await refresh();
    const f = fakes({ [key(A)]: () => ({ ok: 1 }), "anthropic:claude-outro": () => ({ ok: 1 }) });
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("falhou");
    expect(r.message).toContain("modelo não está mais na lista");
    expect(Object.keys(f.calls)).toEqual([]);
  });

  it("Ollama em produção usa a reserva", async () => {
    await on("ollama", "anthropic");
    await saveFn("criacao", "sozinha", L, [], A);
    await refresh();
    const f = fakes({ [key(L)]: () => ({ ok: 0 }), [key(A)]: () => ({ ok: 1 }) });
    const r = await run(deps(f, { env: { NODE_ENV: "production" } }), "criacao");
    expect(r.status).toBe("ok");
    expect(r.output).toEqual({ ok: 1 });
    expect(f.calls[key(L)]).toBeUndefined();
    const rs = await rows(r.runId);
    expect(rs.map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:bloqueada", "reserva:ok"]);
    expect(rs[0].error).toBe("Ollama roda só no Mac.");
  });

  it("duas execuções em paralelo perto do teto não passam de teto + 1 estimativa", async () => {
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await price(A, 10, 10);
    // rodada 5: o Claude recebe no mínimo 8.192 de saída, e a estimativa usa isso (≈ US$ 0,083), não os 3.000 pedidos
    await settings({ caps_enabled: true, monthly_cap_usd: 0.1 });
    await refresh();
    const f = fakes({ [key(A)]: () => new Promise((res) => setTimeout(() => res({ ok: 1 }), 40)) }, { inTok: 100, outTok: 8000 });
    const d = deps(f);
    const req = { ...REQ, maxOutputTokens: 3000 };
    const [r1, r2] = await Promise.all([run(d, "criacao", req), run(d, "criacao", req)]);
    expect(r1.status).toBe("ok");
    expect(r2.status).toBe("ok");
    const estimate = (Math.ceil((REQ.system.length + REQ.input.length) / 4) * 10 + 8192 * 10) / 1_000_000;
    const spent = await monthSpend();
    expect(spent).toBeGreaterThan(0.1);
    expect(spent).toBeLessThanOrEqual(0.1 + estimate);
    await refresh();
    const r3 = await run(d, "criacao", req);
    expect(r3.status).toBe("parou_no_teto");
  });

  it("seletor da aba só vale com o interruptor ligado", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A);
    await refresh();
    const f = fakes({ [key(A)]: () => ({ de: "A" }), [key(O)]: () => ({ de: "O" }) });
    const r1 = await run(deps(f), "criacao", REQ, origin, { ref: O });
    expect(r1.output).toEqual({ de: "A" });
    await settings({ tab_override_enabled: true });
    await refresh();
    const r2 = await run(deps(f), "criacao", REQ, origin, { ref: O });
    expect(r2.output).toEqual({ de: "O" });
  });

  it("mock não depende de ligado/desligado e custa zero", async () => {
    const mock = { name: "mock", model: "mock-dev", isMock: true, generate: async () => ({ output: { m: 1 }, provider: "mock", model: "mock-dev", inputTokens: null, outputTokens: null, latencyMs: 0, costUsd: null }) } as any;
    const r = await run(deps(null, { mockProvider: mock }), "criacao");
    expect(r.status).toBe("ok");
    expect(r.output).toEqual({ m: 1 });
    expect(r.costUsd).toBe(0);
    expect(await rows(r.runId)).toEqual([]);
  });

  it("função sem configuração usa a ref das variáveis e grava em ai_calls", async () => {
    await on("anthropic");
    await refresh();
    const f = fakes({ "anthropic:claude-x": () => ({ ok: 1 }) });
    const env = { CONTENT_HUB_AI_PROVIDER_CREATE: "anthropic", CONTENT_HUB_MODEL_CREATE: "claude-x" } as any;
    const r = await run(deps(f, { env }), "criacao");
    expect(r.status).toBe("ok");
    const rs = await rows(r.runId);
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ provider: "anthropic", model: "claude-x", mode: "sozinha", role: "principal", outcome: "ok", source: "central", item_id: "item-1", function_key: "criacao" });
  });

  it("cuidado caprichado vira effort high só em função salva", async () => {
    await on("anthropic");
    await refresh();
    const f1 = fakes({ [key(A)]: () => ({}) });
    await run(deps(f1, { env: { CONTENT_HUB_MODEL_CREATE: A.model } }), "criacao");
    expect(f1.calls[key(A)][0].effort).toBeUndefined();
    await saveFn("criacao", "sozinha", A, [], null, "caprichado");
    await refresh();
    const f2 = fakes({ [key(A)]: () => ({}) });
    await run(deps(f2), "criacao");
    expect(f2.calls[key(A)][0].effort).toBe("high");
    await saveFn("criacao", "sozinha", A, [], null, "rapido");
    await refresh();
    const f3 = fakes({ [key(A)]: () => ({}) });
    await run(deps(f3), "criacao");
    expect(f3.calls[key(A)][0].effort).toBe("low");
    const f4 = fakes({ [key(A)]: () => ({}) });
    await run(deps(f4), "criacao", { ...REQ, effort: "medium" });
    expect(f4.calls[key(A)][0].effort).toBe("medium");
  });

  // ---- adaptadores e reforços da rodada de correção 1
  const adapters = () => import("../../server/ai/maestro");
  const answers = (extra: Record<string, Handler> = {}) => ({ [key(A)]: () => ({ ok: "A" }), [key(O)]: () => ({ ok: "O" }), [key(G)]: () => ({ ok: "G" }), ...extra });

  it("maestroProvider: mock passa direto e status pronto", async () => {
    const { maestroProvider } = await adapters();
    const mock = { name: "mock", model: "mock-dev", isMock: true, generate: async () => ({}) } as any;
    const r = await maestroProvider(deps(null, { mockProvider: mock }), "criacao", origin);
    expect(r.provider).toBe(mock);
    expect(r.status).toMatchObject({ ready: true, isMock: true, pending: null, provider: "mock" });
  });

  it("maestroProvider: principal desligada e sem reserva → provider null e pending com a mensagem", async () => {
    const { maestroProvider } = await adapters();
    await saveFn("criacao", "sozinha", A);
    await refresh();
    const r = await maestroProvider(deps(fakes(answers())), "criacao", origin);
    expect(r.provider).toBeNull();
    expect(r.status.ready).toBe(false);
    expect(r.status.pending).toBe("Claude está desligada na Central de IAs.");
  });

  it("maestroProvider: generate é uma execução sozinha (principal falha → reserva), registra principal/reserva com o modo salvo e devolve provider/model de quem respondeu e o custo", async () => {
    const { maestroProvider } = await adapters();
    await on("anthropic", "openai");
    await saveFn("criacao", "linha", A, [G], O);
    await price(A, 2, 10);
    await price(O, 2, 10);
    await refresh();
    const f = fakes(answers({ [key(A)]: () => { throw new Error("boom"); } }));
    const { provider, status } = await maestroProvider(deps(f), "criacao", origin);
    expect(status).toMatchObject({ ready: true, provider: "anthropic", model: A.model, isMock: false });
    const res = await provider!.generate<any>(REQ);
    expect(res.output).toEqual({ ok: "O" });
    expect(res.provider).toBe("openai");
    expect(res.model).toBe(O.model);
    expect(res.costUsd).toBeCloseTo((10 * 2 + 20 * 10) / 1_000_000, 8);
    const rs = (await dev.db.query<any>(`select role, outcome, mode from public.ai_calls order by id`)).rows;
    expect(rs.map((x: any) => `${x.role}:${x.outcome}:${x.mode}`)).toEqual(["principal:falha:linha", "principal:falha:linha", "reserva:ok:linha"]);
  });

  it("maestroProvider: generate lança erro quando ninguém responde e quando passa do teto por chamada", async () => {
    const { maestroProvider } = await adapters();
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await refresh();
    const bad = fakes({ [key(A)]: () => { throw new Error("boom"); } });
    const p1 = (await maestroProvider(deps(bad), "criacao", origin)).provider!;
    await expect(p1.generate(REQ)).rejects.toThrow(/boom/);
    await price(A, 10, 20);
    await settings({ caps_enabled: true, per_run_cap_usd: 0.001 });
    await refresh();
    const good = fakes(answers());
    const p2 = (await maestroProvider(deps(good), "criacao", origin)).provider!;
    await expect(p2.generate(REQ)).rejects.toThrow(/teto por chamada/);
    expect(good.calls[key(A)]).toBeUndefined();
    expect((await dev.db.query<any>(`select count(*)::int as n from public.ai_calls where outcome = 'teto'`)).rows[0].n).toBe(1);
  });

  it("maestroProvider: parar no teto (por execução ou mensal) lança AiCapReached, sem chamar a IA", async () => {
    const { maestroProvider, AiCapReached } = await adapters();
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await price(A, 10, 20); // a estimativa do pedido de teste é ≈ US$ 0,021
    await settings({ caps_enabled: true, per_run_cap_usd: 0.01, monthly_cap_usd: 100 });
    await refresh();
    const f = fakes(answers());
    const porExecucao = await (await maestroProvider(deps(f), "criacao", origin)).provider!.generate(REQ).catch((e: unknown) => e);
    expect(porExecucao).toBeInstanceOf(AiCapReached);
    expect((porExecucao as Error).message).toMatch(/teto por chamada de US\$ 0,01/);

    await settings({ per_run_cap_usd: 5, monthly_cap_usd: 0.01 });
    await refresh();
    const mensal = await (await maestroProvider(deps(f), "criacao", origin)).provider!.generate(REQ).catch((e: unknown) => e);
    expect(mensal).toBeInstanceOf(AiCapReached);
    expect((mensal as Error).message).toMatch(/teto mensal de US\$ 0,01/);
    expect(f.calls[key(A)]).toBeUndefined();

    // falha comum não vira AiCapReached
    await settings({ caps_enabled: false });
    await refresh();
    const bad = fakes({ [key(A)]: () => { throw new Error("boom"); } });
    const comum = await (await maestroProvider(deps(bad), "criacao", origin)).provider!.generate(REQ).catch((e: unknown) => e);
    expect(comum).not.toBeInstanceOf(AiCapReached);
    expect((comum as Error).message).toMatch(/boom/);
  });

  it("maestroProvider: resposta fora do formato nas tentativas lança AiInvalidOutput com o raw; falha comum depois dela, erro comum", async () => {
    const { maestroProvider } = await adapters();
    await on("anthropic");
    await saveFn("criacao", "sozinha", A);
    await refresh();
    const invalid = fakes({ [key(A)]: () => { throw new AiInvalidOutput("Resposta fora do formato: campo x", { x: 1 }); } });
    const e = await (await maestroProvider(deps(invalid), "criacao", origin)).provider!.generate(REQ).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AiInvalidOutput);
    expect((e as AiInvalidOutput).raw).toEqual({ x: 1 });
    expect((e as Error).message).toContain("Resposta fora do formato");
    expect(invalid.calls[key(A)]).toHaveLength(2); // principal e nova tentativa

    // só a Central de Conteúdo precisa da classe (grava invalid_output em ch_ai_runs). Aulas, Podcasts e as outras origens
    // tentam de novo sozinhas ao receber AiInvalidOutput, e cada tentativa é uma execução inteira do maestro: erro comum
    for (const source of ["aula", "podcast", "assistente", "analise", "conferencia"] as const) {
      const f = fakes({ [key(A)]: () => { throw new AiInvalidOutput("Resposta fora do formato: campo x", { x: 1 }); } });
      const x = await (await maestroProvider(deps(f), "criacao", { ...origin, source })).provider!.generate(REQ).catch((err: unknown) => err);
      expect(x, source).not.toBeInstanceOf(AiInvalidOutput);
      expect((x as Error).message, source).toContain("Resposta fora do formato");
      expect(f.calls[key(A)], source).toHaveLength(2);
    }

    // a última falha foi comum (a rede caiu): erro comum, não AiInvalidOutput
    const mixed = fakes({
      [key(A)]: (_r, n) => {
        if (n === 1) throw new AiInvalidOutput("fora do formato", { x: 1 });
        throw new Error("rede caiu");
      },
    });
    const e2 = await (await maestroProvider(deps(mixed), "criacao", origin)).provider!.generate(REQ).catch((x: unknown) => x);
    expect(e2).not.toBeInstanceOf(AiInvalidOutput);
    expect((e2 as Error).message).toMatch(/rede caiu/);
  });

  it("maestroRoleProvider: usa reviewers[roleIndex], faltando usa a principal; reserva só se for de outra família", async () => {
    const { maestroRoleProvider } = await adapters();
    await on("anthropic", "openai", "gemini");
    await saveFn("verificacao", "linha", A, [O], G);
    await refresh();
    // índice 0 = O (gpt); a reserva G (google) é de outra família que o criador "claude-opus-5-5": vale
    const f1 = fakes(answers({ [key(O)]: () => { throw new Error("fora"); } }));
    const r0 = await maestroRoleProvider(deps(f1), 0, "claude-opus-5-5", origin);
    expect(r0.status).toMatchObject({ ready: true, provider: "openai", model: O.model });
    expect((await r0.provider!.generate<any>(REQ)).output).toEqual({ ok: "G" });
    // índice 1 faltando = principal A (claude); criador gpt: a reserva G também é de outra família
    const r1 = await maestroRoleProvider(deps(fakes(answers())), 1, "gpt-x", origin);
    expect(r1.status).toMatchObject({ ready: true, provider: "anthropic", model: A.model });
    expect((await r1.provider!.generate<any>(REQ)).output).toEqual({ ok: "A" });
    // reserva da mesma família do criador é descartada: criador gemini-x, principal A falha → ninguém responde
    const f3 = fakes(answers({ [key(A)]: () => { throw new Error("fora"); } }));
    const r2 = await maestroRoleProvider(deps(f3), 1, "gemini-x", origin);
    await expect(r2.provider!.generate(REQ)).rejects.toThrow(/fora/);
    expect(f3.calls[key(G)]).toBeUndefined();
    const roles = (await dev.db.query<any>(`select distinct role, function_key from public.ai_calls where role = 'conferente'`)).rows;
    expect(roles).toEqual([{ role: "conferente", function_key: "verificacao" }]);
  });

  it("maestroRoleProvider: mesma família do criador → pending com a mensagem exata de independência", async () => {
    const { maestroRoleProvider } = await adapters();
    await on("anthropic");
    await saveFn("verificacao", "sozinha", A);
    await refresh();
    const r = await maestroRoleProvider(deps(fakes(answers())), 2, "claude-opus-5-5", origin);
    expect(r.provider).toBeNull();
    expect(r.status.ready).toBe(false);
    expect(r.status.pending).toBe(`Sem independência: o conferente (claude-sonnet-5-5) é da mesma família do criador (claude-opus-5-5). Use outro provedor para o papel "redteam".`);
  });

  it("maestroRoleProvider: sem função salva usa CONTENT_HUB_AI_PROVIDER_<PAPEL> e CONTENT_HUB_MODEL_<PAPEL> (openai sem CONTENT_HUB_OPENAI_MODEL)", async () => {
    const { maestroRoleProvider } = await adapters();
    await on("openai", "anthropic");
    await refresh();
    const f = fakes({ "openai:gpt-fonte": () => ({ ok: "fonte" }), "anthropic:claude-sonnet-5-5": () => ({ ok: "padrao" }) });
    const env = { CONTENT_HUB_AI_PROVIDER_SOURCES: "openai", CONTENT_HUB_MODEL_SOURCES: "gpt-fonte" } as any;
    const r = await maestroRoleProvider(deps(f, { env }), 0, "claude-opus-5-5", origin);
    expect(r.status).toMatchObject({ ready: true, provider: "openai", model: "gpt-fonte" });
    expect((await r.provider!.generate<any>(REQ)).output).toEqual({ ok: "fonte" });
    const r2 = await maestroRoleProvider(deps(f), 1, "gpt-x", origin);
    expect(r2.status).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5" });
  });

  it("reserva planejada no lugar da principal bloqueada respeita o teto por chamada", async () => {
    await on("openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await price(O, 10, 50);
    await settings({ caps_enabled: true, per_run_cap_usd: 0.05 });
    await refresh();
    const f = fakes(answers());
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("parou_no_teto");
    expect(Object.keys(f.calls)).toEqual([]);
    expect((await rows(r.runId)).map((x: any) => `${x.role}:${x.provider}:${x.outcome}`)).toEqual(["reserva:openai:teto"]);
  });

  it("linha: conferente que lança erro vira precisa_revisao (conferência incompleta)", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "linha", A, [O]);
    await refresh();
    const f = fakes(answers({ [key(O)]: () => { throw new Error("caiu"); } }));
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("precisa_revisao");
    expect(r.message).toContain("conferência incompleta");
    expect(r.reviews).toEqual([]);
    expect((await rows(r.runId)).map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["criadora:ok", "conferente:falha"]);
  });

  it("comitê: membro que não responde em 180 s conta como falha", async () => {
    await on("anthropic", "openai", "gemini");
    await saveFn("criacao", "comite", A, [O, G]);
    await refresh();
    const f = fakes(answers({ [key(G)]: () => new Promise(() => {}) }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let done = false;
      const p = run(deps(f), "criacao").finally(() => {
        done = true;
      });
      for (let i = 0; i < 60 && !done; i++) {
        await new Promise((res) => setImmediate(res));
        await vi.advanceTimersByTimeAsync(10_000);
      }
      const r = await p;
      expect(r.status).toBe("ok");
      const g = r.outputs.find((o: any) => o.ref.provider === "gemini");
      expect(g.output).toBeNull();
      expect(g.error).toMatch(/Tempo esgotado/);
      expect((await rows(r.runId)).find((x: any) => x.provider === "gemini").outcome).toBe("falha");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Rotas", () => {
  const servers: http.Server[] = [];
  const tokens: Record<string, string> = {};
  let base: string;
  /** A mesma Central com o servidor em produção (como no site publicado e no Cloud Run). */
  let prod: string;
  const KEY = "teste-chave";
  const fetchImpl = (async (url: any) => {
    if (String(url).includes("anthropic")) {
      return new Response(JSON.stringify({ data: [{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5" }, { id: "claude-x", display_name: "X" }] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  /** Sobe um app só em 127.0.0.1: escutando em todos os endereços, a porta pode coincidir com outro programa do Mac. */
  const listen = (mount: (app: express.Express) => void) =>
    new Promise<string>((resolve) => {
      const app = express();
      mount(app);
      const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
      servers.push(srv);
    });

  beforeAll(async () => {
    tokens.admin = await dev.createSession(ADMIN);
    tokens.editor = await dev.createSession(EDITOR);
    tokens.student = await dev.createSession(STUDENT);
    // as chaves vêm do env do roteador: aqui só a do Claude está neste "servidor"
    const { createAiRouter } = await import("../../server/ai/router");
    base = `${await listen((app) => app.use("/api/ai-central", createAiRouter({ db }, { fetchImpl, env: { ANTHROPIC_API_KEY: KEY } as any })))}/api/ai-central`;
    prod = `${await listen((app) => app.use("/api/ai-central", createAiRouter({ db }, { fetchImpl, env: { ANTHROPIC_API_KEY: KEY, NODE_ENV: "production" } as any })))}/api/ai-central`;
  });
  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  });
  beforeEach(resetAiState);

  const callAt = (root: string, who: string | null, method: string, p: string, body?: unknown) =>
    fetch(root + p, { method, headers: { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const call = (who: string | null, method: string, p: string, body?: unknown) => callAt(base, who, method, p, body);
  const A = { provider: "anthropic", model: "claude-sonnet-5-5" };
  /** IA09: salvar uma função com modelo pago exige o preço cadastrado, com ou sem tetos. */
  const priceModels = async (...refs: { provider: string; model: string }[]) => {
    for (const r of refs) await dev.db.query("insert into public.ai_model_prices (provider, model, input_per_mtok, output_per_mtok) values ($1, $2, 2, 10) on conflict do nothing", [r.provider, r.model]);
    const { invalidateAiConfig } = await import("../../server/ai/config");
    invalidateAiConfig(db);
  };

  it("sem login volta 401; aluno recebe 403 até no resumo", async () => {
    expect((await call(null, "GET", "/summary")).status).toBe(401);
    const r = await call("student", "GET", "/summary");
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("Central de IAs: acesso restrito à equipe.");
  });

  it("editor lê o resumo, mas não grava (403)", async () => {
    const s = await call("editor", "GET", "/summary");
    expect(s.status).toBe(200);
    expect((await s.json()).functions).toHaveLength(8);
    for (const [m, p, b] of [["GET", "/overview", undefined], ["POST", "/providers/anthropic/enabled", { enabled: true }], ["POST", "/providers/anthropic/refresh", {}], ["PUT", "/settings", { caps_enabled: false }]] as const) {
      const r = await call("editor", m, p, b);
      expect(r.status, p).toBe(403);
      expect((await r.json()).error).toBe("Central de IAs: acesso restrito a administradores.");
    }
  });

  it("admin liga a IA e o registro mostra quem ligou", async () => {
    expect((await call("admin", "POST", "/providers/foo/enabled", { enabled: true })).status).toBe(400);
    expect((await call("admin", "POST", "/providers/anthropic/enabled", { enabled: "sim" })).status).toBe(400);
    const r = await call("admin", "POST", "/providers/anthropic/enabled", { enabled: true });
    expect(r.status).toBe(200);
    expect((await r.json()).enabled).toBe(true);
    const ov = await (await call("admin", "GET", "/overview")).json();
    expect(ov.providers.find((p: any) => p.id === "anthropic")).toMatchObject({ enabled: true, enabled_by: ADMIN });
    expect(ov.history.some((h: any) => h.action === "ai.provider" && h.actor_id === ADMIN)).toBe(true);
  });

  it("atualizar lista com fetch simulado grava modelos e preços do seed", async () => {
    const r = await call("admin", "POST", "/providers/anthropic/refresh", {});
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain(KEY);
    const j = JSON.parse(text);
    expect(j.status).toBe("pronta");
    expect(j.models.map((m: any) => m.id)).toEqual(["claude-sonnet-5-5", "claude-x"]);
    expect(j.prices_added).toBe(1);
    const ov = await (await call("admin", "GET", "/overview")).json();
    const prices = ov.prices.filter((p: any) => p.provider === "anthropic");
    expect(prices.map((p: any) => p.model)).toEqual(["claude-sonnet-5-5"]);
    expect(Number(prices[0].input_per_mtok)).toBe(2);
    expect(Number(prices[0].output_per_mtok)).toBe(10);
    expect(ov.providers.find((p: any) => p.id === "anthropic").models).toHaveLength(2);
    expect((await (await call("admin", "POST", "/providers/anthropic/refresh", {})).json()).prices_added).toBe(0);
  });

  it("função inválida volta 400 com os problemas (mesma família)", async () => {
    await priceModels(A, { provider: "anthropic", model: "claude-opus-5-5" });
    await call("admin", "POST", "/providers/anthropic/enabled", { enabled: true });
    expect((await call("admin", "PUT", "/functions/nada", { config: null })).status).toBe(404);
    const bad = await call("admin", "PUT", "/functions/criacao", { config: { mode: "linha", care: "caprichado", primary: A, reviewers: [{ provider: "anthropic", model: "claude-opus-5-5" }] } });
    expect(bad.status).toBe(400);
    const j = await bad.json();
    expect(j.problems.join(" ")).toMatch(/mesma família/);
    expect(j.error).toContain("A função tem problemas: ");
    expect((await call("admin", "PUT", "/functions/criacao", { config: { mode: "xis", primary: A } })).status).toBe(400);
    const ok = await call("admin", "PUT", "/functions/criacao", { config: { mode: "sozinha", care: "rapido", primary: A } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, warnings: [] });
    const row = (await dev.db.query<any>("select mode, care, primary_ref, reviewers from public.ai_functions where key = 'criacao'")).rows[0];
    expect(row).toMatchObject({ mode: "sozinha", care: "rapido", primary_ref: A, reviewers: [] });
    expect(await (await call("admin", "PUT", "/functions/criacao", { config: null })).json()).toEqual({ ok: true, warnings: [] });
    expect((await dev.db.query("select 1 from public.ai_functions where key = 'criacao'")).rows).toHaveLength(0);
  });

  it("ligar tetos sem valores volta 400; com valores grava", async () => {
    const r = await call("admin", "PUT", "/settings", { caps_enabled: true });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("Para ligar os tetos, preencha o teto mensal e o teto por chamada.");
    expect((await call("admin", "PUT", "/settings", { monthly_cap_usd: -1 })).status).toBe(400);
    expect((await call("admin", "PUT", "/settings", { monthly_cap_usd: 10, caps_enabled: true })).status).toBe(400);
    const ok = await call("admin", "PUT", "/settings", { monthly_cap_usd: 10, per_run_cap_usd: 1, caps_enabled: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ monthly_cap_usd: 10, per_run_cap_usd: 1, caps_enabled: true });
    expect((await call("admin", "PUT", "/settings", { per_run_cap_usd: null })).status).toBe(400);
  });

  it("overview traz checks das 8 funções e nenhuma chave", async () => {
    const r = await call("admin", "GET", "/overview");
    const text = await r.text();
    expect(text).not.toContain(KEY);
    const j = JSON.parse(text);
    expect(Object.keys(j.checks).sort()).toEqual(["assistente_conferir", "assistente_preencher", "assistente_revisar", "busca_fontes", "criacao", "engenharia_reversa", "similaridade", "verificacao"]);
    expect(j.checks.criacao).toMatchObject({ source: "variaveis", ready: false });
    // a busca de fontes sem configuração fica desligada, nunca pelas variáveis de ambiente
    expect(j.checks.busca_fontes).toMatchObject({ source: "variaveis", ready: false, ref: null, problems: ["Desligada: configure esta função na Central de IAs."] });
    // Questões parecidas (similaridade, 9910): também começa desligada e nunca pelas variáveis de ambiente
    expect(j.checks.similaridade).toMatchObject({ source: "variaveis", ready: false, ref: null, problems: ["Desligada: configure esta função na Central de IAs."] });
    expect(j.checks.criacao.problems.join(" ")).toMatch(/desligada/);
    await priceModels(A);
    await call("admin", "POST", "/providers/anthropic/enabled", { enabled: true });
    await call("admin", "PUT", "/functions/verificacao", { config: { mode: "sozinha", primary: A } });
    const j2 = await (await call("admin", "GET", "/overview")).json();
    expect(j2.checks.verificacao).toMatchObject({ source: "banco", ready: true, problems: [] });
    expect(j2.checks.criacao).toMatchObject({ source: "variaveis", ready: true });
  });

  it("as rotas antigas /api/ai/* continuam respondendo", async () => {
    const { createAiRouter } = await import("../../server/ai/router");
    // a mesma ordem do server.ts: primeiro a Central de IAs, depois as rotas do app antigo
    const novo = await listen((app) => {
      app.use("/api/ai-central", createAiRouter({ db }, { fetchImpl, env: {} as any }));
      app.get("/api/ai/models", (_q, r) => r.json({ ok: true }));
    });
    const r = await fetch(`${novo}/api/ai/models`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    // a Central continua protegida no prefixo novo
    expect((await fetch(`${novo}/api/ai-central/summary`)).status).toBe(401);
    // o erro antigo: montada em /api/ai, a Central respondia 401 no lugar da rota antiga
    const antigo = await listen((app) => {
      app.use("/api/ai", createAiRouter({ db }, { fetchImpl, env: {} as any }));
      app.get("/api/ai/models", (_q, r) => r.json({ ok: true }));
    });
    expect((await fetch(`${antigo}/api/ai/models`)).status).toBe(401);

    // o server.ts monta a Central no prefixo novo e não no antigo
    const text = fs.readFileSync(path.join(ROOT, "server.ts"), "utf8");
    expect(text.includes('app.use("/api/ai-central", createAiRouter('), "server.ts monta a Central em /api/ai-central").toBe(true);
    expect(text.includes('app.use("/api/ai", createAiRouter('), "server.ts não pode montar a Central em /api/ai").toBe(false);
  });

  it("PUT /functions recusa Ollama onde ele não roda (site publicado ou sem resposta) e aceita no Mac", async () => {
    const ollama = { provider: "ollama", model: "qwen3" };
    const MAC = "Ollama roda só no Mac.";
    await priceModels(A);
    for (const id of ["anthropic", "ollama"]) await call("admin", "POST", `/providers/${id}/enabled`, { enabled: true });
    const saved = async () => (await dev.db.query("select 1 from public.ai_functions where key = 'criacao'")).rows.length;
    const put = (root: string, config: unknown) => callAt(root, "admin", "PUT", "/functions/criacao", { config });

    // site publicado: 400 com o motivo, e nada é gravado
    const r = await put(prod, { mode: "sozinha", primary: ollama });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.problems).toEqual([MAC]);
    expect(j.error).toBe(`A função tem problemas: ${MAC}`);
    expect(await saved()).toBe(0);
    // como reserva ou como conferente também; repetido em vários lugares, a mensagem aparece uma vez
    for (const config of [
      { mode: "sozinha", primary: A, fallback: ollama },
      { mode: "linha", primary: A, reviewers: [ollama] },
      { mode: "linha", primary: A, fallback: ollama, reviewers: [{ provider: "ollama", model: "llama3" }] },
    ]) {
      const x = await put(prod, config);
      expect(x.status, JSON.stringify(config)).toBe(400);
      expect((await x.json()).problems).toEqual([MAC]);
    }
    expect(await saved()).toBe(0);

    // no Mac (sem NODE_ENV=production) continua permitido
    expect((await put(base, { mode: "sozinha", primary: ollama })).status).toBe(200);
    expect(await saved()).toBe(1);
    // Ollama que não respondeu na última consulta (so_no_mac) é recusado até fora de produção
    await put(base, null);
    await db.service("ch_worker_ai_store_models", { p_provider: "ollama", p_models: null, p_status: "so_no_mac", p_detail: "sem resposta" });
    const r3 = await put(base, { mode: "sozinha", primary: ollama });
    expect(r3.status).toBe(400);
    expect((await r3.json()).problems).toEqual([MAC]);
    expect(await saved()).toBe(0);
  });

  it("overview traz provider_checks das 4 IAs, sem chaves, e a função salva com Ollama não fica pronta no site publicado", async () => {
    const text = await (await call("admin", "GET", "/overview")).text();
    expect(text).not.toContain(KEY);
    const j = JSON.parse(text);
    expect(Object.keys(j.provider_checks).sort()).toEqual(["anthropic", "gemini", "ollama", "openai"]);
    expect(j.provider_checks.anthropic).toEqual({ pending: null, blocks: false });
    // chave ausente neste servidor: motivo, mas não bloqueia
    expect(j.provider_checks.openai).toEqual({ pending: "OPENAI_API_KEY vazia no servidor.", blocks: false });
    expect(j.provider_checks.gemini).toEqual({ pending: expect.stringMatching(/GEMINI_API_KEY/), blocks: false });
    expect(j.provider_checks.ollama).toEqual({ pending: null, blocks: false });
    // no site publicado o Ollama aparece como "roda só no Mac" e bloqueia
    const site = await (await callAt(prod, "admin", "GET", "/overview")).json();
    expect(site.provider_checks.ollama).toEqual({ pending: "Ollama roda só no Mac.", blocks: true });
    expect(site.provider_checks.anthropic).toEqual({ pending: null, blocks: false });

    // função salva no Mac com Ollama: pronta no Mac, não pronta no site publicado (com o motivo)
    await priceModels({ provider: "gemini", model: "gemini-2.5-pro" });
    await call("admin", "POST", "/providers/ollama/enabled", { enabled: true });
    expect((await call("admin", "PUT", "/functions/criacao", { config: { mode: "sozinha", primary: { provider: "ollama", model: "qwen3" } } })).status).toBe(200);
    const mac = (await (await call("admin", "GET", "/overview")).json()).checks.criacao;
    expect(mac).toMatchObject({ source: "banco", ready: true, problems: [] });
    const publicado = (await (await callAt(prod, "admin", "GET", "/overview")).json()).checks.criacao;
    expect(publicado).toMatchObject({ source: "banco", ready: false, problems: ["Ollama roda só no Mac."] });

    // Gemini sem chave neste servidor (o site): pode ser salvo, e a função fica pronta, só com o aviso
    await call("admin", "POST", "/providers/gemini/enabled", { enabled: true });
    const gem = await call("admin", "PUT", "/functions/verificacao", { config: { mode: "sozinha", primary: { provider: "gemini", model: "gemini-2.5-pro" } } });
    expect(gem.status).toBe(200);
    const ver = (await (await callAt(prod, "admin", "GET", "/overview")).json()).checks.verificacao;
    expect(ver).toMatchObject({ source: "banco", ready: true, problems: [] });
    expect(ver.warnings).toEqual([expect.stringContaining("Gemini: sem chave neste servidor (site).")]);
  });

  it("preço editado grava a data de hoje e recusa número negativo", async () => {
    const path = `/prices/openai/${encodeURIComponent("gpt-9")}`;
    expect((await call("admin", "PUT", path, { input_per_mtok: -1, output_per_mtok: 2 })).status).toBe(400);
    expect((await call("admin", "PUT", "/prices/xx/gpt-9", { input_per_mtok: 1, output_per_mtok: 2 })).status).toBe(400);
    expect((await call("admin", "PUT", path, { input_per_mtok: 1, output_per_mtok: 2, source_url: "http://x" })).status).toBe(400);
    const r = await call("admin", "PUT", path, { input_per_mtok: 1.5, output_per_mtok: 3, source_url: "" });
    expect(r.status).toBe(200);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const row = (await dev.db.query<any>("select input_per_mtok::float8 i, source_url, checked_on::text c from public.ai_model_prices where model = 'gpt-9'")).rows[0];
    expect(row).toEqual({ i: 1.5, source_url: null, c: today });
  });
});

describe("Central", () => {
  const A = { provider: "anthropic", model: "claude-sonnet-5-5" };
  const O = { provider: "openai", model: "gpt-5.4" };
  const T = "Texto sintético de teste.";
  const PASSAGE = `${T} Na bronquiolite viral aguda, a oxigenoterapia deve ser iniciada quando a saturação estiver abaixo de 92%.`;
  const BLOCKS = [
    { page_no: 1, idx: 0, type: "heading", text: "Bronquiolite viral aguda" },
    { page_no: 1, idx: 1, type: "paragraph", text: PASSAGE },
  ];
  let storage: any;
  let docId: string;

  /** Provedores falsos por ref: respondem com a simulação de cada prompt, com o nome e o modelo da ref. */
  const aiMaker = (ref: { provider: string; model: string }) =>
    ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate(req: any) {
        const { mockRespond } = await import("../../server/contentHub/ai/mock");
        return { output: mockRespond(req), provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
      },
    }) as any;
  const noAi = { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "IA não configurada." } };
  const centralDeps = (extra: any = {}) => ({ db, storage, ai: noAi, aiMaker, ...extra }) as any;
  const saveFn = (k: string, primary: object) =>
    db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: k, p_config: { mode: "sozinha", primary_ref: primary, fallback_ref: null, reviewers: [], care: "caprichado" } });
  const refresh = async () => (await import("../../server/ai/config")).invalidateAiConfig(db);

  beforeAll(async () => {
    const { localStorageDir } = await import("../../server/contentHub/infra");
    storage = localStorageDir(path.join(tmp, "files-central"));
    const src = await db.asUser<{ id: string }>(adminUser, "app_ch_register_source", { p_source: { title: "Fonte sintética", organ: "Órgão de teste", version: "1", published_on: "2026-01-01", url: "https://exemplo.invalid/f.pdf" } });
    await db.asUser(adminUser, "app_ch_add_passage", { p_source_id: src.id, p_passage: { section: "Tratamento", page: 12, text: PASSAGE } });
    const bytes = Buffer.from("%PDF-1.7 central sintetica");
    const sha = (await import("crypto")).createHash("sha256").update(bytes).digest("hex");
    await storage.put(`documents/${sha}.pdf`, bytes, "application/pdf");
    const r = await db.asUser<{ id: string }>(adminUser, "app_ch_register_document", { p_doc: { name: "Apostila Central", sha256: sha, storage_path: `documents/${sha}.pdf`, rights_status: "unknown" } });
    docId = r.id;
    await db.service("ch_worker_save_extraction", { p_document_id: docId, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }], p_blocks: BLOCKS.map((b) => ({ ...b, bbox: [0, 0, 1, 1] })) });
  }, 120_000);
  beforeEach(resetAiState);

  it("etapa da Central usa a IA da função: verificação com OpenAI, criação com Claude", async () => {
    for (const id of ["anthropic", "openai"]) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
    await saveFn("criacao", A);
    await saveFn("verificacao", O);
    await refresh();
    const { stepVersions } = await import("../../server/contentHub/pipeline");
    const { createContentHubWorker } = await import("../../server/contentHub/worker");
    const deps = centralDeps();
    await db.service("ch_worker_unblock");
    await db.service("ch_worker_next", { p_document_id: docId, p_step: "classify", p_versions: stepVersions("classify", deps) });
    await createContentHubWorker(deps).drain();

    const calls = (await dev.db.query<any>(`select function_key, provider, model, source, item_id from public.ai_calls where outcome = 'ok' order by id`)).rows;
    const by = (fn: string) => [...new Set(calls.filter((c) => c.function_key === fn).map((c) => `${c.provider}:${c.model}`))];
    expect(by("criacao")).toEqual(["anthropic:claude-sonnet-5-5"]);
    expect(by("verificacao")).toEqual(["openai:gpt-5.4"]);
    expect(calls.every((c) => c.source === "central" && c.item_id === docId)).toBe(true);

    const runs = (await dev.db.query<any>(`select step, provider, model from public.ch_ai_runs where document_id = $1`, [docId])).rows;
    const classify = runs.filter((r) => r.step === "classify");
    expect(classify.length).toBeGreaterThan(0);
    expect(classify.every((r) => r.provider === "anthropic" && r.model === "claude-sonnet-5-5")).toBe(true);
    const evidence = runs.filter((r) => r.step === "evidence");
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.every((r) => r.provider === "openai" && r.model === "gpt-5.4")).toBe(true);
    const claims = (await dev.db.query<any>(`select created_by_model as model from public.ch_claims where document_id = $1`, [docId])).rows;
    for (const c of claims) expect(c.model).toBe("claude-sonnet-5-5");
  });

  describe("teto atingido e resposta fora do formato numa etapa", () => {
    // outro modelo que o do teste anterior: a resposta guardada daquele não vale aqui (a chamada precisa chegar ao maestro)
    const A2 = { provider: "anthropic", model: "claude-opus-5-5" };
    const A3 = { provider: "anthropic", model: "claude-haiku-5-5" };
    const classify = async (deps: any) => {
      const { stepVersions } = await import("../../server/contentHub/pipeline");
      await db.service("ch_worker_unblock");
      await db.service("ch_worker_next", { p_document_id: docId, p_step: "classify", p_versions: stepVersions("classify", deps) });
    };
    const job = async () => (await dev.db.query<any>(`select status, attempts, error from public.ch_jobs where document_id = $1 and step = 'classify'`, [docId])).rows[0];
    /** Roda trabalhos da fila (outros trabalhos do mesmo documento podem estar na frente) até o da classificação chegar ao estado. */
    const until = async (worker: { tick(): Promise<boolean> }, status: string) => {
      for (let i = 0; i < 10 && (await job()).status !== status; i++) if (!(await worker.tick())) break;
      return job();
    };

    it("teto atingido deixa o trabalho parado (blocked), com a mensagem do teto, e ele volta quando o teto permite", async () => {
      const { createContentHubWorker } = await import("../../server/contentHub/worker");
      await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
      await saveFn("criacao", A2);
      await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "anthropic", p_model: A2.model, p_price: { input_per_mtok: 100, output_per_mtok: 200 } });
      await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { caps_enabled: true, monthly_cap_usd: 1000, per_run_cap_usd: 0.01 } });
      await refresh();
      const deps = centralDeps();
      const worker = createContentHubWorker(deps);
      await classify(deps);

      const parado = await until(worker, "blocked");
      expect(parado.status).toBe("blocked"); // não "failed" nem "dead": nada de nova tentativa gasta
      expect(parado.attempts).toBe(0);
      expect(parado.error).toMatch(/teto por chamada de US\$ 0,01/);
      const doc = (await dev.db.query<any>(`select failure from public.ch_documents where id = $1`, [docId])).rows[0];
      expect(doc.failure).toMatch(/^Pendência: .*teto por chamada/);
      const calls = (await dev.db.query<any>(`select outcome from public.ai_calls`)).rows;
      expect(calls.map((c) => c.outcome)).toEqual(["teto"]);

      // teto liberado: o trabalho volta para a fila e roda
      await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { per_run_cap_usd: 1000 } });
      await refresh();
      await db.service("ch_worker_unblock");
      expect((await job()).status).toBe("queued");
      const depois = await until(worker, "succeeded");
      expect(depois, JSON.stringify(depois)).toMatchObject({ status: "succeeded" });
    });

    it("resposta fora do formato continua gravando invalid_output em ch_ai_runs, com o que a IA devolveu", async () => {
      const { createContentHubWorker } = await import("../../server/contentHub/worker");
      const { AiInvalidOutput } = await import("../../server/contentHub/ai/provider");
      await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
      await saveFn("criacao", A3);
      await refresh();
      const bad = (ref: { provider: string; model: string }) =>
        ({
          name: ref.provider,
          model: ref.model,
          isMock: false,
          async generate() {
            throw new AiInvalidOutput("Resposta fora do formato: campo x", { campo: "x" });
          },
        }) as any;
      const deps = centralDeps({ aiMaker: bad });
      await classify(deps);
      const worker = createContentHubWorker(deps);
      for (let i = 0; i < 10 && (await job()).status === "queued"; i++) if (!(await worker.tick())) break;
      const runs = (await dev.db.query<any>(`select status, output, error from public.ch_ai_runs where document_id = $1 and model = $2 and step = 'classify'`, [docId, A3.model])).rows;
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.every((r) => r.status === "invalid_output")).toBe(true);
      expect(runs[0].output).toEqual({ raw: JSON.stringify({ campo: "x" }) });
      expect(runs[0].error).toContain("Resposta fora do formato");
    });
  });

  it("aiAvailable: só mock ou IA ligada destrava a fila", async () => {
    const { aiAvailable } = await import("../../server/contentHub/worker");
    expect(await aiAvailable(centralDeps())).toBe(false);
    // uma IA das variáveis de ambiente (provedor real) não autoriza sozinha
    expect(await aiAvailable(centralDeps({ ai: { provider: aiMaker(A), status: { ...noAi.status, ready: true } } }))).toBe(false);
    expect(await aiAvailable(centralDeps({ ai: { provider: { ...aiMaker(A), isMock: true }, status: noAi.status } }))).toBe(true);
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "gemini", p_enabled: true });
    expect(await aiAvailable(centralDeps())).toBe(true);
    const broken = { ...db, service: async () => { throw new Error("falhou"); } } as any;
    expect(await aiAvailable(centralDeps({ db: broken }))).toBe(false);
  });

  it("aiAvailable: com os tetos ligados e o gasto do mês já no teto mensal, não destrava a fila", async () => {
    const { aiAvailable } = await import("../../server/contentHub/worker");
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    await dev.db.query(`insert into public.ai_calls (function_key, mode, role, provider, model, cost_usd, outcome) values ('criacao', 'sozinha', 'principal', 'anthropic', 'm', 5, 'ok')`);
    const settings = (s: object) => db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: s });
    // tetos desligados: o gasto do mês não importa
    await settings({ caps_enabled: false, monthly_cap_usd: 5, per_run_cap_usd: 1 });
    expect(await aiAvailable(centralDeps())).toBe(true);
    // ligados e o gasto (5) já no teto mensal (5): não destrava (senão cada rodada reenfileira e bloqueia de novo)
    await settings({ caps_enabled: true });
    expect(await aiAvailable(centralDeps())).toBe(false);
    // a simulação não gasta: continua destravando
    expect(await aiAvailable(centralDeps({ ai: { provider: { ...aiMaker(A), isMock: true }, status: noAi.status } }))).toBe(true);
    // teto mensal acima do gasto, ou sem teto mensal preenchido: destrava
    await settings({ monthly_cap_usd: 5.01 });
    expect(await aiAvailable(centralDeps())).toBe(true);
    await settings({ monthly_cap_usd: null });
    expect(await aiAvailable(centralDeps())).toBe(true);
  });

  it("/status mostra ai_central e troca a pendência da IA", async () => {
    const { createContentHubRouter } = await import("../../server/contentHub/router");
    const token = await dev.createSession(ADMIN);
    const status = async (deps: any) => {
      const app = express();
      app.use("/api/content-hub", createContentHubRouter(deps, { worker: null }));
      const srv = await new Promise<http.Server>((r) => {
        const s = app.listen(0, "127.0.0.1", () => r(s));
      });
      try {
        const res = await fetch(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub/status`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(200);
        return await res.json();
      } finally {
        await new Promise((r) => srv.close(r));
      }
    };
    const pend = { provider: null, status: { ...noAi.status, pending: "IA não configurada: defina CONTENT_HUB_AI_PROVIDER." } };
    const none = "Nenhuma função da Central de IAs está pronta: ligue e configure as IAs em Administração › Central de IAs.";
    const before = await status(centralDeps({ ai: pend }));
    expect(before.ai_central.providers_enabled).toEqual([]);
    expect(before.pending.some((p: string) => p.includes("CONTENT_HUB_AI_PROVIDER"))).toBe(false);
    expect(before.pending).toContain(none);
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    await saveFn("criacao", A);
    await refresh();
    const after = await status(centralDeps({ ai: pend }));
    expect(after.ai_central.providers_enabled).toEqual(["anthropic"]);
    expect(after.pending).not.toContain(none);
  });
});

describe("Implantacao", () => {
  it("o roteiro leva as chaves de IA presentes sem imprimir valores", async () => {
    const { execFileSync } = await import("child_process");
    const script = fs.readFileSync("scripts/cloudrun/deploy-pdf-worker.sh", "utf8");

    // confere que os 3 nomes aparecem no laço de segredos opcionais
    expect(script).toContain("ANTHROPIC_API_KEY");
    expect(script).toContain("GEMINI_API_KEY");
    expect(script).toContain("OPENAI_API_KEY");

    // confere que --set-secrets é montado por variável e termina com ${AI_SECRETS}
    expect(script).toMatch(/--set-secrets=.*\$\{AI_SECRETS\}/);

    // confere que nenhuma linha faz echo "$VALUE" (imprime valor da chave)
    const lines = script.split("\n");
    for (const line of lines) {
      // detecta echo ... "$VALUE" ou echo ${VALUE} mas nao echo "Falta $NAME..." etc
      if (/echo\s+.*\$VALUE/i.test(line)) {
        throw new Error(`Found echo with $VALUE: ${line}`);
      }
    }

    // confere que store_secret é definida uma vez
    const storeDefMatches = script.match(/^store_secret\(\)/m) || [];
    expect(storeDefMatches).toHaveLength(1);

    // confere que store_secret é chamada nos dois laços
    const storeCallMatches = script.match(/store_secret /g) || [];
    expect(storeCallMatches.length).toBeGreaterThanOrEqual(2);

    // bash -n passa
    execFileSync("bash", ["-n", "scripts/cloudrun/deploy-pdf-worker.sh"]);
  });
});
