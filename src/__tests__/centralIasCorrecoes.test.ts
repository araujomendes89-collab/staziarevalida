// @vitest-environment node
/**
 * Correções da Central de IAs escolhidas pelo dono na página "Correções da Administração" (2026-10-10), na ordem da fila:
 * IA04 aviso fixo nos modos Linha e Comitê; IA05 Gemini pelo Vertex só com os modelos que a chave (modo expresso) aceita e
 * com teste real ao atualizar; IA06 erro de crédito, chave ou modelo vai direto para a reserva; IA10 prazo do pedido no site
 * e registro de cada chamada na hora; IA11 esforço do Claude só nos modelos que aceitam e preço do Haiku 5.5; IA07 Cuidado
 * também no Gemini e na OpenAI. Sem rede: provedores e bibliotecas simulados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const counted: { model: string }[] = [];
let countBehavior: () => Promise<unknown> = async () => ({ totalTokens: 1 });
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      countTokens: async ({ model }: { model: string }) => {
        counted.push({ model });
        return countBehavior();
      },
    };
  },
}));

import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "central-ias-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
let dev: DevDatabase;
let db: ContentDb;

type R = { provider: string; model: string };
const A: R = { provider: "anthropic", model: "claude-sonnet-5-5" };
const O: R = { provider: "openai", model: "gpt-6.1-sol" };
const G: R = { provider: "gemini", model: "gemini-2.5-pro" };
const key = (r: R) => `${r.provider}:${r.model}`;
const origin = { source: "central" as const, itemId: "item-1", actorId: null };
const REQ = { promptId: "t", promptVersion: "1", system: "sistema", input: "x".repeat(400), schema: { type: "object" as const }, schemaName: "teste", maxOutputTokens: 1000 };
const VERTEX = "AQ.Ab8RN6" + "v".repeat(44);

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev')`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

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
const on = async (...ids: string[]) => {
  for (const id of ids) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
};
const saveFn = async (k: string, mode: string, primary: R, reviewers: R[] = [], fallback: R | null = null, care = "caprichado") => {
  await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: k, p_config: { mode, primary_ref: primary, fallback_ref: fallback, reviewers, care } });
};
const refresh = async () => (await import("../../server/ai/config")).invalidateAiConfig(db);

type Handler = (req: any, n: number) => unknown | Promise<unknown>;
/** Provedores falsos: cada chamada passa pelo handler (n = número da chamada); sem rede. */
function fakes(handlers: Record<string, Handler>) {
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
        return { output, provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
      },
    } as any;
  };
  return { makeProviderFor, calls };
}
const deps = (f: ReturnType<typeof fakes>, extra: any = {}) => ({ db, env: {} as any, makeProviderFor: f.makeProviderFor, log: () => {}, ...extra });
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

describe("IA04: modos Linha de produção e Comitê avisam que os conferentes ainda não rodam", () => {
  const cfg = (enabled: string[]) =>
    ({
      providers: Object.fromEntries(["anthropic", "openai", "gemini", "ollama"].map((id) => [id, { enabled: enabled.includes(id), models: [], status: null }])),
      functions: {},
      settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false },
      prices: [],
    }) as any;
  const fc = (k: string, mode: string, reviewers: R[]) => ({ key: k, mode, primary: A, fallback: null, reviewers, care: "caprichado" }) as any;

  it("Linha de produção e Comitê, em qualquer função: aviso fixo; Sozinha: sem aviso", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const c = cfg(["anthropic", "openai", "gemini"]);
    expect(validateFunctionConfig(fc("criacao", "linha", [O]), c).warnings).toContain(
      "Nesta etapa a função usa só a IA principal e a reserva: os conferentes da Linha de produção ainda não rodam."
    );
    expect(validateFunctionConfig(fc("assistente_conferir", "comite", [O, G]), c).warnings).toContain(
      "Nesta etapa a função usa só a IA principal e a reserva: os membros do Comitê ainda não rodam."
    );
    expect(validateFunctionConfig(fc("criacao", "sozinha", []), c).warnings.join(" ")).not.toMatch(/ainda não rodam/);
  });

  it("Verificação em Linha de produção: diz onde os conferentes rodam de verdade", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    expect(validateFunctionConfig(fc("verificacao", "linha", [O, G]), cfg(["anthropic", "openai", "gemini"])).warnings).toContain(
      "No processamento a Verificação usa só a IA principal e a reserva (sempre de outra empresa); os conferentes da Linha de produção só rodam na conferência de rascunhos feita por comando."
    );
  });
});

describe("IA05: Gemini pelo Vertex (modo expresso)", () => {
  beforeEach(() => {
    counted.length = 0;
    countBehavior = async () => ({ totalTokens: 1 });
  });

  it("lista só os modelos que a chave aceita e faz um teste real (contar tokens, sem custo) ao atualizar", async () => {
    const { listModels, VERTEX_EXPRESS_MODELS } = await import("../../server/ai/models");
    const fetchImpl = vi.fn();
    const list = await listModels("gemini", { VERTEX_API_KEY: VERTEX } as any, fetchImpl as any);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(counted).toEqual([{ model: "gemini-2.5-flash" }]);
    expect(list.status).toBe("pronta");
    expect(list.detail).toMatch(/modo expresso/);
    expect(list.models.map((m) => m.id)).toEqual(["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3.1-pro-preview"]);
    expect(list.models.every((m) => VERTEX_EXPRESS_MODELS.includes(m.id))).toBe(true);
  });

  it("chave recusada no teste: nenhum modelo e o motivo", async () => {
    const { listModels } = await import("../../server/ai/models");
    countBehavior = async () => {
      throw httpError(403, "Permission denied");
    };
    const list = await listModels("gemini", { VERTEX_API_KEY: VERTEX } as any, vi.fn() as any);
    expect(list).toMatchObject({ status: "chave_recusada", models: [] });
    countBehavior = async () => {
      throw new Error("fetch failed");
    };
    expect(await listModels("gemini", { VERTEX_API_KEY: VERTEX } as any, vi.fn() as any)).toMatchObject({ status: "erro", models: [] });
  });
});

describe("IA06 e IA10: quando repetir a mesma IA, prazo do pedido e registro na hora", () => {
  beforeEach(resetAiState);
  const provider = async (d: any) => (await (await import("../../server/ai/maestro")).maestroProvider(d, "criacao", origin)).provider!;

  it("sem crédito, chave recusada ou modelo inexistente: não repete a mesma IA, vai direto para a reserva", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    for (const err of [
      httpError(400, '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'),
      httpError(401, "401 invalid x-api-key"),
      httpError(404, "404 model not found"),
      new Error('OpenAI respondeu 402: {"error":"insufficient_quota"}'),
      httpError(429, '429 {"error":{"code":429,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}'),
      new Error("Tempo esgotado (180 s)."),
    ]) {
      const f = fakes({ [key(A)]: () => { throw err; }, [key(O)]: () => ({ ok: "O" }) });
      const out = await (await provider(deps(f))).generate<any>(REQ);
      expect(out.output, err.message).toEqual({ ok: "O" });
      expect(f.calls[key(A)], err.message).toHaveLength(1);
    }
  });

  it("falha passageira (limite por minuto, sobrecarga, servidor fora, rede): tenta a mesma IA mais uma vez", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    for (const err of [httpError(429, "429 rate_limit_error: Number of requests has exceeded your rate limit"), httpError(529, "529 overloaded_error"), httpError(503, "503 Service Unavailable"), new Error("fetch failed"), new Error("OpenAI respondeu 500: erro interno")]) {
      const f = fakes({ [key(A)]: (_r, n) => { if (n === 1) throw err; return { ok: "A" }; }, [key(O)]: () => ({ ok: "O" }) });
      const out = await (await provider(deps(f))).generate<any>(REQ);
      expect(out.output, err.message).toEqual({ ok: "A" });
      expect(f.calls[key(A)], err.message).toHaveLength(2);
      expect(f.calls[key(O)], err.message).toBeUndefined();
    }
  });

  it("prazo do pedido: sem tempo para a próxima chamada, ela nem acontece, e o motivo fica registrado", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    // principal demora mais que o tempo que sobra: é cortada; a reserva já não cabe no prazo e não é chamada
    const f = fakes({ [key(A)]: () => new Promise((r) => setTimeout(() => r({ ok: "A" }), 4000)), [key(O)]: () => ({ ok: "O" }) });
    const err = await (await provider(deps(f, { deadlineAt: Date.now() + 15_000 + 1_500 }))).generate(REQ).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(f.calls[key(A)]).toHaveLength(1);
    expect(f.calls[key(O)]).toBeUndefined();
    const rows = (await dev.db.query<any>(`select provider, outcome, error from public.ai_calls order by id`)).rows;
    expect(rows.map((r) => `${r.provider}:${r.outcome}`)).toEqual(["anthropic:falha", "openai:bloqueada"]);
    expect(rows[0].error).toMatch(/Tempo esgotado/);
    expect(rows[1].error).toBe("Sem tempo para chamar esta IA dentro do limite do pedido.");
  });

  it("prazo padrão só no site (Vercel): 270 s; no processamento do Google não há prazo", async () => {
    const { requestDeadline } = await import("../../server/ai/maestro");
    expect(requestDeadline({ VERCEL: "1" } as any, 1_000)).toBe(271_000);
    expect(requestDeadline({ MAESTRO_DEADLINE_MS: "60000" } as any, 1_000)).toBe(61_000);
    expect(requestDeadline({} as any, 1_000)).toBeNull();
  });

  it("cada chamada vai para o registro na hora: a falha da principal já está gravada quando a reserva é chamada", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    let seen = -1;
    const f = fakes({
      [key(A)]: () => { throw httpError(400, "400 credit balance is too low"); },
      [key(O)]: async () => {
        seen = Number((await dev.db.query<any>(`select count(*)::int as n from public.ai_calls`)).rows[0].n);
        return { ok: "O" };
      },
    });
    await (await provider(deps(f))).generate(REQ);
    expect(seen).toBe(1);
    const rows = (await dev.db.query<any>(`select provider, outcome from public.ai_calls order by id`)).rows;
    expect(rows.map((r) => `${r.provider}:${r.outcome}`)).toEqual(["anthropic:falha", "openai:ok"]);
  });
});

describe("IA11: esforço do Claude só nos modelos que aceitam; preço do Haiku 5.5", () => {
  it("modelos da página oficial recebem o esforço; o Haiku 4.5 e modelos desconhecidos não", async () => {
    const { anthropicOutputConfig } = await import("../../server/contentHub/ai/provider");
    const schema = { type: "object" } as any;
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-opus-4-5-20251101", "claude-sonnet-4-6"]) {
      expect(anthropicOutputConfig(m, "low", schema), m).toMatchObject({ effort: "low" });
    }
    for (const m of ["claude-haiku-4-5-20251001", "claude-3-7-sonnet-latest"]) {
      const out = anthropicOutputConfig(m, "high", schema);
      expect(out, m).not.toHaveProperty("effort");
      expect(out.format.type).toBe("json_schema");
    }
  });

  it("tabela de preços traz o Claude Haiku 5.5 (US$ 0,10 entrada e US$ 0,50 saída por milhão, página oficial)", async () => {
    const { PRICE_SEED } = await import("../../server/ai/prices");
    expect(PRICE_SEED.find((p) => p.provider === "anthropic" && p.model === "claude-haiku-5-5")).toMatchObject({ input_per_mtok: 0.1, output_per_mtok: 0.5, checked_on: "2026-10-10" });
  });
});

describe("IA07: Cuidado no Gemini e na OpenAI", () => {
  it("Gemini: Rápido reduz o raciocínio onde o modelo aceita; Caprichado usa o padrão do modelo", async () => {
    const { geminiThinking } = await import("../../server/contentHub/ai/provider");
    expect(geminiThinking("gemini-2.5-pro", "low")).toEqual({ thinkingBudget: 1024 });
    expect(geminiThinking("gemini-2.5-flash", "low")).toEqual({ thinkingBudget: 1024 });
    expect(geminiThinking("gemini-3.1-pro-preview", "low")).toEqual({ thinkingLevel: "LOW" });
    // Flash-Lite já vem sem raciocínio: mandar orçamento ligaria e gastaria mais
    expect(geminiThinking("gemini-2.5-flash-lite", "low")).toBeNull();
    expect(geminiThinking("gemini-2.5-pro", "high")).toBeNull();
    expect(geminiThinking("gemini-2.5-pro", undefined)).toBeNull();
  });

  it("OpenAI: Rápido manda reasoning_effort low nos modelos de raciocínio; Caprichado e outros modelos não mandam nada", async () => {
    const { OpenAIProvider } = await import("../../server/contentHub/ai/openai");
    const bodies: any[] = [];
    const fetchImpl = async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    };
    const req = { ...REQ, schema: { type: "object", properties: { ok: { type: "boolean" } } } as any };
    await new OpenAIProvider("k".repeat(40), "gpt-6.1-sol", fetchImpl as any).generate({ ...req, effort: "low" });
    await new OpenAIProvider("k".repeat(40), "gpt-6.1-sol", fetchImpl as any).generate({ ...req, effort: "high" });
    await new OpenAIProvider("k".repeat(40), "gpt-4o", fetchImpl as any).generate({ ...req, effort: "low" });
    expect(bodies[0].reasoning_effort).toBe("low");
    expect(bodies[1]).not.toHaveProperty("reasoning_effort");
    expect(bodies[2]).not.toHaveProperty("reasoning_effort");
  });
});
