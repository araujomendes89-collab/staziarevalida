// @vitest-environment node
/**
 * Central de IAs (supabase/migrations/…5200_central_de_ias.sql): as 4 IAs começam desligadas, só o administrador grava
 * (e tudo vai para o registro de ações), funções e preços são validados no banco, o gasto do mês é contado no fuso de
 * Brasília e o painel (administrador) e o resumo (equipe) respeitam o papel de quem chama.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
