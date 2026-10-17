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
const generated: any[] = [];
let countBehavior: () => Promise<unknown> = async () => ({ totalTokens: 1 });
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      countTokens: async ({ model }: { model: string }) => {
        counted.push({ model });
        return countBehavior();
      },
      generateContent: async (args: any) => {
        generated.push(args);
        return { text: JSON.stringify({ ok: true }), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
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

  it("Verificação (Linha ou Comitê): diz onde os conferentes rodam de verdade", async () => {
    const { validateFunctionConfig } = await import("../../server/ai/config");
    const c = cfg(["anthropic", "openai", "gemini"]);
    expect(validateFunctionConfig(fc("verificacao", "linha", [O, G]), c).warnings).toContain(
      "No processamento a Verificação usa só a IA principal e a reserva (sempre de outra empresa); os conferentes da Linha de produção só rodam na conferência de rascunhos feita por comando."
    );
    expect(validateFunctionConfig(fc("verificacao", "comite", [O, G]), c).warnings).toContain(
      "No processamento a Verificação usa só a IA principal e a reserva (sempre de outra empresa); os membros do Comitê só rodam na conferência de rascunhos feita por comando."
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
    expect(counted).toEqual([{ model: "gemini-3.8-flash" }]);
    expect(list.status).toBe("pronta");
    expect(list.detail).toMatch(/modo expresso/);
    expect(list.models.map((m) => m.id)).toEqual(["gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]);
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
      throw httpError(400, '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}');
    };
    expect(await listModels("gemini", { VERTEX_API_KEY: VERTEX } as any, vi.fn() as any)).toMatchObject({ status: "chave_recusada", models: [] });
  });

  it("teste que não pôde rodar por outro motivo: a lista filtrada vale do mesmo jeito, com o aviso", async () => {
    const { listModels } = await import("../../server/ai/models");
    countBehavior = async () => {
      throw httpError(429, "Resource has been exhausted");
    };
    const list = await listModels("gemini", { VERTEX_API_KEY: VERTEX } as any, vi.fn() as any);
    expect(list.status).toBe("pronta");
    expect(list.detail).toMatch(/não foi possível testar a chave agora \(o Google respondeu 429\)/);
    expect(list.models.map((m) => m.id)).toEqual(["gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]);
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
    for (const err of [httpError(429, "429 rate_limit_error: Number of requests has exceeded your rate limit"), httpError(429, "Quota exceeded for quota metric 'Generate Content API requests per minute' and limit 'GenerateContent request limit per minute' (per_minute)"), httpError(529, "529 overloaded_error"), httpError(503, "503 Service Unavailable"), new Error("fetch failed"), new Error("OpenAI respondeu 500: erro interno")]) {
      const f = fakes({ [key(A)]: (_r, n) => { if (n === 1) throw err; return { ok: "A" }; }, [key(O)]: () => ({ ok: "O" }) });
      const out = await (await provider(deps(f))).generate<any>(REQ);
      expect(out.output, err.message).toEqual({ ok: "A" });
      expect(f.calls[key(A)], err.message).toHaveLength(2);
      expect(f.calls[key(O)], err.message).toBeUndefined();
    }
  });

  it("prazo do pedido: nenhuma IA é chamada com menos de 30 s de folga, e o motivo fica registrado", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    // a principal cabe (30,5 s de folga), demora 1 s e cai com erro passageiro; a nova tentativa e a reserva já não cabem
    const f = fakes({ [key(A)]: () => new Promise((_, rej) => setTimeout(() => rej(httpError(503, "503 Service Unavailable")), 1000)), [key(O)]: () => ({ ok: "O" }) });
    const err = await (await provider(deps(f, { deadlineAt: Date.now() + 15_000 + 30_500 }))).generate(REQ).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(f.calls[key(A)]).toHaveLength(1);
    expect(f.calls[key(O)]).toBeUndefined();
    const rows = (await dev.db.query<any>(`select provider, outcome, error from public.ai_calls order by id`)).rows;
    expect(rows.map((r) => `${r.provider}:${r.outcome}`)).toEqual(["anthropic:falha", "anthropic:bloqueada", "openai:bloqueada"]);
    expect(rows[2].error).toBe("Sem tempo para chamar esta IA dentro do limite do pedido.");
  });

  it("o prazo vale para o pedido inteiro: a segunda chamada de IA do mesmo pedido usa o que sobrou", async () => {
    const { withRequestDeadline } = await import("../../server/ai/requestDeadline");
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    const f = fakes({ [key(A)]: () => new Promise((r) => setTimeout(() => r({ ok: "A" }), 1000)), [key(O)]: () => ({ ok: "O" }) });
    const outcome = await withRequestDeadline(Date.now() + 15_000 + 30_500, async () => {
      const first = await (await provider(deps(f))).generate<any>(REQ);
      const second = await (await provider(deps(f))).generate(REQ).catch((e: unknown) => e as Error);
      return { first: first.output, second };
    });
    expect(outcome.first).toEqual({ ok: "A" });
    expect(outcome.second).toBeInstanceOf(Error);
    expect(f.calls[key(A)]).toHaveLength(1);
  });

  it("gravação do registro que falha só avisa: a linha fica pendente e vai na gravação seguinte, sem repetir nenhuma", async () => {
    const { maestroProvider } = await import("../../server/ai/maestro");
    await on("anthropic", "openai");
    await saveFn("criacao", "sozinha", A, [], O);
    await refresh();
    let failNext = true;
    const flaky = {
      ...db,
      service: async (fn: string, args: any) => {
        if (fn === "ch_worker_ai_log_calls" && failNext) {
          failNext = false;
          throw new Error("banco fora");
        }
        return db.service(fn, args);
      },
    } as any;
    const f = fakes({ [key(A)]: () => { throw httpError(400, "400 credit balance is too low"); }, [key(O)]: () => ({ ok: "O" }) });
    await (await maestroProvider({ ...deps(f), db: flaky }, "criacao", origin)).provider!.generate(REQ);
    const rows = (await dev.db.query<any>(`select provider, outcome from public.ai_calls order by id`)).rows;
    // a falha da principal não pode sumir de ai_calls (nem dos tetos) só porque a primeira gravação falhou
    expect(rows.map((r) => `${r.provider}:${r.outcome}`)).toEqual(["anthropic:falha", "openai:ok"]);
  });

  it("no servidor, o prazo marcado na chegada chega até a rota, mesmo depois de ler o corpo e de esperar", async () => {
    const express = (await import("express")).default;
    const { requestDeadlineMiddleware, currentRequestDeadline } = await import("../../server/ai/requestDeadline");
    const app = express();
    app.use(express.json());
    app.use(requestDeadlineMiddleware(5_000));
    app.post("/t", async (_req, res) => {
      await new Promise((r) => setTimeout(r, 20));
      res.json({ deadline: currentRequestDeadline() });
    });
    const server = app.listen(0);
    try {
      const port = (server.address() as any).port;
      const t0 = Date.now();
      const out = await (await fetch(`http://127.0.0.1:${port}/t`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: "x".repeat(50_000) }) })).json();
      expect(out.deadline).toBeGreaterThanOrEqual(t0 + 5_000);
      expect(out.deadline).toBeLessThan(Date.now() + 5_000 + 100);
    } finally {
      server.close();
    }
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

  it("tabela de preços traz o Claude Opus 5 (US$ 5 entrada e US$ 25 saída por milhão): em produção ele é reserva e ficava sem preço", async () => {
    const { PRICE_SEED } = await import("../../server/ai/prices");
    expect(PRICE_SEED.find((p) => p.provider === "anthropic" && p.model === "claude-opus-5")).toMatchObject({ input_per_mtok: 5, output_per_mtok: 25, checked_on: "2026-10-10" });
  });
});

describe("IA07: Cuidado no Gemini e na OpenAI", () => {
  it("Gemini: Rápido reduz o raciocínio onde o modelo aceita; Caprichado usa o padrão do modelo", async () => {
    const { geminiThinking } = await import("../../server/contentHub/ai/provider");
    expect(geminiThinking("gemini-2.5-pro", "rapido")).toEqual({ thinkingBudget: 1024 });
    expect(geminiThinking("gemini-2.5-flash", "rapido")).toEqual({ thinkingBudget: 1024 });
    expect(geminiThinking("gemini-3.1-pro-preview", "rapido")).toEqual({ thinkingLevel: "LOW" });
    // Flash-Lite também pensa no Vertex AI ("Auto, até 8.192", revisão rodada 3); pelo AI Studio não pensa por padrão. O Rápido
    // desliga o raciocínio dele (orçamento 0) para nunca pensar mais que o padrão (revisão rodada 5)
    expect(geminiThinking("gemini-2.5-flash-lite", "rapido")).toEqual({ thinkingBudget: 0 });
    // Gemini 3 Flash-Lite: padrão MINIMAL, menor que o LOW do Rápido; fica no padrão (revisão rodada 5)
    expect(geminiThinking("gemini-3.5-flash-lite", "rapido")).toBeNull();
    expect(geminiThinking("gemini-2.5-pro", "caprichado")).toBeNull();
    expect(geminiThinking("gemini-2.5-pro", undefined)).toBeNull();
  });

  it("o provedor do Gemini manda a redução só com o Cuidado Rápido da Central, não com o esforço baixo do Tutor", async () => {
    const { resolveProviderKind } = await import("../../server/contentHub/ai/provider");
    const saved = process.env.VERTEX_API_KEY;
    process.env.VERTEX_API_KEY = VERTEX;
    try {
      const { provider } = resolveProviderKind("gemini", undefined, "gemini-2.5-flash", { allowExternal: true });
      const req = { ...REQ, schema: { type: "object", properties: { ok: { type: "boolean" } } } as any };
      generated.length = 0;
      await provider!.generate({ ...req, care: "rapido" } as any);
      await provider!.generate({ ...req, effort: "low" } as any);
      expect(generated[0].config.thinkingConfig).toEqual({ thinkingBudget: 1024 });
      expect(generated[1].config).not.toHaveProperty("thinkingConfig");
    } finally {
      if (saved === undefined) delete process.env.VERTEX_API_KEY;
      else process.env.VERTEX_API_KEY = saved;
    }
  });

  it("a Central manda o Cuidado da função em campo próprio, sem trocar o esforço que quem chamou pediu", async () => {
    const { maestroProvider } = await import("../../server/ai/maestro");
    await resetAiState();
    await on("anthropic");
    await saveFn("criacao", "sozinha", A, [], null, "rapido");
    await refresh();
    const f = fakes({ [key(A)]: () => ({ ok: "A" }) });
    const p = (await maestroProvider(deps(f), "criacao", origin)).provider!;
    await p.generate(REQ);
    await p.generate({ ...REQ, effort: "medium" });
    expect(f.calls[key(A)][0]).toMatchObject({ care: "rapido", effort: "low" });
    expect(f.calls[key(A)][1]).toMatchObject({ care: "rapido", effort: "medium" });
  });

  it("OpenAI: Rápido manda reasoning_effort low nos modelos de raciocínio; Caprichado e outros modelos não mandam nada", async () => {
    const { OpenAIProvider } = await import("../../server/contentHub/ai/openai");
    const bodies: any[] = [];
    const fetchImpl = async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    };
    const req = { ...REQ, schema: { type: "object", properties: { ok: { type: "boolean" } } } as any };
    await new OpenAIProvider("k".repeat(40), "gpt-6.1-sol", fetchImpl as any).generate({ ...req, care: "rapido" } as any);
    await new OpenAIProvider("k".repeat(40), "gpt-6.1-sol", fetchImpl as any).generate({ ...req, care: "caprichado" } as any);
    await new OpenAIProvider("k".repeat(40), "gpt-4o", fetchImpl as any).generate({ ...req, care: "rapido" } as any);
    await new OpenAIProvider("k".repeat(40), "gpt-5-chat-latest", fetchImpl as any).generate({ ...req, care: "rapido" } as any);
    await new OpenAIProvider("k".repeat(40), "gpt-6.1-sol", fetchImpl as any).generate({ ...req, effort: "low" });
    expect(bodies[0].reasoning_effort).toBe("low");
    expect(bodies[1]).not.toHaveProperty("reasoning_effort");
    expect(bodies[2]).not.toHaveProperty("reasoning_effort");
    // modelo de conversa sem raciocínio e o esforço baixo do Tutor (sem Cuidado) não recebem nada
    expect(bodies[3]).not.toHaveProperty("reasoning_effort");
    expect(bodies[4]).not.toHaveProperty("reasoning_effort");
  });
});
