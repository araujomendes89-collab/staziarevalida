// @vitest-environment node
/**
 * IA09 (Administração › Central de IAs): modelo pago sem preço cadastrado aparecia com gasto US$ 0. Com os tetos ligados ele já era
 * bloqueado; com os tetos desligados era usado e o custo ficava zero. Agora o preço é exigido com ou sem teto, no momento de
 * salvar a função (ligar o modelo para uso). O que já está salvo e rodando NÃO para (um modelo sem preço continua sendo chamado
 * com os tetos desligados): a função mostra o aviso, e a próxima vez que for salva exige o preço. Ollama custa zero e não precisa.
 * Sem rede e sem banco de verdade: configuração em memória, banco falso e IA falsa.
 */
import express from "express";
import type http from "http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { functionChecks, invalidateAiConfig, validateFunctionConfig, type AiConfig, type FunctionConfig } from "../../server/ai/config";
import { runFunction } from "../../server/ai/maestro";
import { createAiRouter } from "../../server/ai/router";

type R = { provider: any; model: string };
const CLAUDE: R = { provider: "anthropic", model: "claude-opus-5" };
const GEM: R = { provider: "gemini", model: "gemini-3.5-flash" };
const GPT: R = { provider: "openai", model: "gpt-6.1-sol" };
const QWEN: R = { provider: "ollama", model: "qwen3" };
const price = (r: R, i = 5, o = 25) => ({ ...r, input_per_mtok: i, output_per_mtok: o, source_url: "https://exemplo.com", checked_on: "2026-10-11" });

const cfg = (prices: any[], settings: Partial<AiConfig["settings"]> = {}): AiConfig =>
  ({
    providers: Object.fromEntries(["anthropic", "openai", "gemini", "ollama"].map((id) => [id, { enabled: true, models: [], status: null }])),
    functions: {},
    settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false, ...settings },
    prices,
  }) as any;
const fn = (primary: R | null, fallback: R | null = null, reviewers: R[] = [], mode = "sozinha"): FunctionConfig =>
  ({ key: "criacao", mode, primary, fallback, reviewers, care: "caprichado" }) as any;

const NOTICE = (name: string) => `${name}: sem preço cadastrado. O gasto dele aparece como US$ 0 até o preço ser cadastrado (tabela "Preços por milhão de tokens" ou "Atualizar lista" da IA).`;
const PROBLEM = (name: string) => `${name}: sem preço cadastrado. Cadastre o preço antes de usar este modelo (tabela "Preços por milhão de tokens" ou "Atualizar lista" da IA); sem ele o gasto aparece como US$ 0.`;

describe("regra de preço de modelo pago (validateFunctionConfig)", () => {
  it("tetos desligados: modelo pago sem preço é aviso, não problema (o que já roda não para)", () => {
    const r = validateFunctionConfig(fn(CLAUDE, GEM), cfg([]));
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual(expect.arrayContaining([NOTICE("Claude claude-opus-5"), NOTICE("Gemini gemini-3.5-flash")]));
  });

  it("ao salvar (requirePrice), com ou sem tetos, é problema, e não repete como aviso", () => {
    const off = validateFunctionConfig(fn(CLAUDE, GEM), cfg([price(GEM)]), { requirePrice: true });
    expect(off.problems).toEqual([PROBLEM("Claude claude-opus-5")]);
    expect(off.warnings.filter((w) => /sem preço/.test(w))).toEqual([]);
    // com os tetos ligados vale a regra de sempre (mesmo texto de antes)
    const on = validateFunctionConfig(fn(CLAUDE), cfg([], { caps_enabled: true, monthly_cap_usd: 10, per_run_cap_usd: 1 }), { requirePrice: true });
    expect(on.problems).toEqual(["Claude claude-opus-5: sem preço cadastrado, e os tetos estão ligados."]);
  });

  it("com preço cadastrado não há aviso nem problema; Ollama (custo zero) não precisa de preço", () => {
    expect(validateFunctionConfig(fn(CLAUDE, GEM), cfg([price(CLAUDE), price(GEM)]), { requirePrice: true })).toEqual({ problems: [], warnings: [] });
    expect(validateFunctionConfig(fn(QWEN, QWEN), cfg([]), { requirePrice: true })).toEqual({ problems: [], warnings: [] });
  });

  it("vale também para os conferentes e membros, uma vez por modelo", () => {
    const r = validateFunctionConfig(fn(CLAUDE, null, [GPT, GPT], "linha"), cfg([price(CLAUDE)]), { requirePrice: true });
    expect(r.problems).toEqual([PROBLEM("OpenAI gpt-6.1-sol")]);
  });
});

describe("situação das funções (functionChecks)", () => {
  it("função salva com modelo pago sem preço continua pronta, com o aviso", () => {
    const c = cfg([price(GEM)]);
    c.functions = { criacao: fn(CLAUDE, GEM) } as any;
    const check = functionChecks(c, { ANTHROPIC_API_KEY: "k".repeat(40), GEMINI_API_KEY: "k".repeat(40) } as any).criacao;
    expect(check).toMatchObject({ source: "banco", ready: true, problems: [] });
    expect(check.warnings).toContain(NOTICE("Claude claude-opus-5"));
    expect(check.warnings.join(" ")).not.toContain(NOTICE("Gemini gemini-3.5-flash"));
  });

  it("função sem configuração salva (variáveis do servidor) também mostra o aviso da IA e da reserva", () => {
    const env = { CONTENT_HUB_AI_PROVIDER: "anthropic", CONTENT_HUB_ANTHROPIC_MODEL: "claude-opus-5", CONTENT_HUB_AI_FALLBACK_PROVIDER: "gemini", CONTENT_HUB_GEMINI_MODEL: "gemini-3.5-flash", ANTHROPIC_API_KEY: "k".repeat(40), GEMINI_API_KEY: "k".repeat(40) } as any;
    const check = functionChecks(cfg([]), env).criacao;
    expect(check).toMatchObject({ source: "variaveis", ready: true, problems: [] });
    expect(check.warnings).toEqual(expect.arrayContaining([NOTICE("Claude claude-opus-5"), NOTICE("Gemini gemini-3.5-flash")]));
  });
});

describe("o que já roda não para: o maestro continua chamando o modelo sem preço com os tetos desligados", () => {
  it("chama a IA, grava a chamada com custo 0 e os tokens", async () => {
    const logged: any[] = [];
    const db = {
      mode: "dev",
      async service(name: string, args: any) {
        if (name === "ch_worker_ai_config") {
          return {
            providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
            functions: [{ key: "criacao", mode: "sozinha", primary_ref: CLAUDE, fallback_ref: null, reviewers: [], care: "caprichado" }],
            settings: { caps_enabled: false, monthly_cap_usd: null, per_run_cap_usd: null, tab_override_enabled: false },
            prices: [],
          };
        }
        if (name === "ch_worker_ai_log_calls") {
          logged.push(...args.p_calls);
          return null;
        }
        throw new Error(`função inesperada: ${name}`);
      },
      async asUser() {
        throw new Error("inesperado");
      },
      async authenticate() {
        return null;
      },
    } as any;
    invalidateAiConfig(db);
    const provider = {
      name: "anthropic",
      model: CLAUDE.model,
      isMock: false,
      async generate() {
        return { output: { ok: true }, provider: "anthropic", model: CLAUDE.model, inputTokens: 1000, outputTokens: 50, latencyMs: 1, costUsd: null };
      },
    } as any;
    const req = { promptId: "t", promptVersion: "1", system: "s", input: "i", schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }, schemaName: "t", maxOutputTokens: 100 } as any;
    const r = await runFunction<any>({ db, env: {} as any, makeProviderFor: () => provider, log: () => {} }, "criacao", req, { source: "aula", itemId: null, actorId: null });
    expect(r.status).toBe("ok");
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ outcome: "ok", input_tokens: 1000, output_tokens: 50, cost_usd: 0 });
  });
});

describe("rota PUT /functions/:key exige o preço, com ou sem tetos", () => {
  let server: http.Server;
  let base = "";
  const saved: any[] = [];
  const priced: any[] = [];
  const state = { prices: [] as any[], caps: false };
  const db = {
    mode: "dev",
    async authenticate() {
      return { id: "00000000-0000-4000-8000-0000000000ad", email: "ad@t.dev" };
    },
    async asUser(_user: unknown, name: string) {
      if (name === "app_ch_whoami") return { admin: true, staff: true };
      throw new Error(`função inesperada: ${name}`);
    },
    async service(name: string, args: any) {
      switch (name) {
        case "ch_worker_ai_config":
          return {
            providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: true, models: [], last_status: null })),
            functions: [],
            settings: { caps_enabled: state.caps, monthly_cap_usd: state.caps ? 10 : null, per_run_cap_usd: state.caps ? 1 : null, tab_override_enabled: false },
            prices: state.prices,
          };
        case "ch_worker_ai_save_function":
          saved.push(args);
          return {};
        case "ch_worker_ai_save_price":
          priced.push(args);
          state.prices.push(price({ provider: args.p_provider, model: args.p_model }, args.p_price.input_per_mtok, args.p_price.output_per_mtok));
          return {};
        default:
          throw new Error(`função inesperada: ${name}`);
      }
    },
  } as any;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      const app = express();
      app.use("/api/ai-central", createAiRouter({ db }, { env: { ANTHROPIC_API_KEY: "k".repeat(40) } as any }));
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${(server.address() as any).port}/api/ai-central`;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });
  afterEach(() => {
    saved.length = 0;
    priced.length = 0;
    state.prices = [];
    state.caps = false;
    invalidateAiConfig(db);
  });

  const put = (path: string, body: unknown) => fetch(base + path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("sem preço: 400 com o motivo e nada é gravado; com o preço cadastrado, grava", async () => {
    const config = { mode: "sozinha", care: "caprichado", primary: CLAUDE };
    const r = await put("/functions/criacao", { config });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.problems).toEqual([PROBLEM("Claude claude-opus-5")]);
    expect(j.error).toBe(`A função tem problemas: ${PROBLEM("Claude claude-opus-5")}`);
    expect(saved).toHaveLength(0);

    const p = await put(`/prices/anthropic/${encodeURIComponent("claude-opus-5")}`, { input_per_mtok: 5, output_per_mtok: 25 });
    expect(p.status).toBe(200);
    const ok = await put("/functions/criacao", { config });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, warnings: [] });
    expect(saved).toHaveLength(1);
  });

  it("com os tetos ligados continua o mesmo texto de antes", async () => {
    state.caps = true;
    const r = await put("/functions/criacao", { config: { mode: "sozinha", primary: CLAUDE } });
    expect(r.status).toBe(400);
    expect((await r.json()).problems).toEqual(["Claude claude-opus-5: sem preço cadastrado, e os tetos estão ligados."]);
    expect(saved).toHaveLength(0);
  });

  it("Ollama (custo zero) salva sem preço; salvar a função com a configuração apagada (variáveis do servidor) não pede preço", async () => {
    expect((await put("/functions/criacao", { config: { mode: "sozinha", primary: QWEN } })).status).toBe(200);
    expect((await put("/functions/criacao", { config: null })).status).toBe(200);
    expect(saved).toHaveLength(2);
  });
});
