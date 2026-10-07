// @vitest-environment node
/**
 * Central de IAs (supabase/migrations/…5200_central_de_ias.sql): as 4 IAs começam desligadas, só o administrador grava
 * (e tudo vai para o registro de ações), funções e preços são validados no banco, o gasto do mês é contado no fuso de
 * Brasília e o painel (administrador) e o resumo (equipe) respeitam o papel de quem chama.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { listModels } from "../../server/ai/models";
import { OllamaProvider } from "../../server/contentHub/ai/ollama";
import { AiInvalidOutput } from "../../server/contentHub/ai/provider";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aicentral-"));
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
    expect(s.functions).toHaveLength(6);
    expect(s.functions.find((f: any) => f.key === "verificacao")).toMatchObject({ configured: true, mode: "sozinha" });
    expect(s.functions.find((f: any) => f.key === "criacao")).toMatchObject({ configured: false });
    expect(s.providers_enabled).toEqual(["anthropic"]);
    expect(Number(s.month_spend)).toBeGreaterThanOrEqual(0.5);
    await expect(db.asUser(studentUser, "app_ai_summary")).rejects.toThrow(/restrito/);
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

  it("envFallbackRef com uiKind usa LESSON_ASSIST_/PODCAST_ e os padrões", async () => {
    const { envFallbackRef } = await import("../../server/ai/config");
    expect(envFallbackRef("criacao", {} as any, "gemini")).toEqual({ provider: "gemini", model: "gemini-2.5-pro" });
    expect(envFallbackRef("criacao", {} as any, "openai")).toBeNull();
    const env = { LESSON_ASSIST_GEMINI_MODEL: "g-lesson", PODCAST_GEMINI_MODEL: "g-pod", CONTENT_HUB_GEMINI_MODEL: "g-hub" } as any;
    expect(envFallbackRef("assistente_preencher", env, "gemini")?.model).toBe("g-lesson");
    expect(envFallbackRef("criacao", env, "gemini")?.model).toBe("g-pod");
    expect(envFallbackRef("criacao", { CONTENT_HUB_GEMINI_MODEL: "g-hub" } as any, "gemini")?.model).toBe("g-hub");
    expect(envFallbackRef("verificacao", {} as any)).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(envFallbackRef("verificacao", { CONTENT_HUB_VERIFIER_PROVIDER: "mock" } as any)).toBeNull();
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

  beforeEach(async () => {
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
  });
  const refresh = async () => (await import("../../server/ai/config")).invalidateAiConfig(db);

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

  it("teto por execução: comitê de 3 estimado acima do teto não chama ninguém", async () => {
    await on("anthropic", "openai", "gemini");
    await saveFn("criacao", "comite", A, [O, G]);
    for (const r of [A, O, G]) await price(r, 10, 20); // cada membro ≈ 0,021; os três ≈ 0,063 contra o teto de 0,05
    await settings({ caps_enabled: true, per_run_cap_usd: 0.05 });
    await refresh();
    const f = fakes({ [key(A)]: () => ({}), [key(O)]: () => ({}), [key(G)]: () => ({}) });
    const r = await run(deps(f), "criacao");
    expect(r.status).toBe("parou_no_teto");
    expect(r.message).toMatch(/teto por execução de US\$ 0,05/);
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
    await settings({ caps_enabled: true, monthly_cap_usd: 0.05 });
    await refresh();
    const f = fakes({ [key(A)]: () => new Promise((res) => setTimeout(() => res({ ok: 1 }), 40)) }, { inTok: 100, outTok: 3000 });
    const d = deps(f);
    const req = { ...REQ, maxOutputTokens: 3000 };
    const [r1, r2] = await Promise.all([run(d, "criacao", req), run(d, "criacao", req)]);
    expect(r1.status).toBe("ok");
    expect(r2.status).toBe("ok");
    const estimate = (Math.ceil((REQ.system.length + REQ.input.length) / 4) * 10 + 3000 * 10) / 1_000_000;
    const spent = await monthSpend();
    expect(spent).toBeGreaterThan(0.05);
    expect(spent).toBeLessThanOrEqual(0.05 + estimate);
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

  it("maestroProvider: generate lança erro quando ninguém responde e quando passa do teto por execução", async () => {
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
    await expect(p2.generate(REQ)).rejects.toThrow(/teto por execução/);
    expect(good.calls[key(A)]).toBeUndefined();
    expect((await dev.db.query<any>(`select count(*)::int as n from public.ai_calls where outcome = 'teto'`)).rows[0].n).toBe(1);
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

  it("reserva planejada no lugar da principal bloqueada respeita o teto por execução", async () => {
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
