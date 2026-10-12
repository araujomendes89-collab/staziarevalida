// @vitest-environment node
/**
 * Motivo de parada do Gemini (falha vista em produção, 2026-10-09): 82 chamadas da Criação com gemini-3.5-flash e 2 do assistente
 * Conferir com gemini-2.5-pro falharam com "Resposta não é JSON.", com custo 0 no registro. O Gemini devolvia a resposta vazia ou
 * cortada (o raciocínio conta dentro do limite de saída) e o provedor não dizia por quê. Agora:
 *   - o provedor lê o motivo de parada (finishReason) e o bloqueio do pedido, e diz o motivo real;
 *   - o limite de saída mandado ao Gemini ganha folga para o raciocínio;
 *   - resposta cortada ou bloqueada não repete na mesma IA (vai para a reserva);
 *   - a falha registra os tokens e o custo (o Google cobra), e o gasto do mês os enxerga.
 * Sem rede: a biblioteca do Google é simulada e os provedores do maestro são falsos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const generated: any[] = [];
let reply: (args: any) => any = () => ({});
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (args: any) => {
        generated.push(args);
        return reply(args);
      },
    };
  },
}));

import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { AiInvalidOutput, geminiOutputLimit, resolveProviderKind } from "../../server/contentHub/ai/provider";
import { shouldRetrySame } from "../../server/ai/maestro";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const VERTEX = "AQ.Ab8RN6" + "v".repeat(44);
const SCHEMA = { type: "object" as const, required: ["ok"], properties: { ok: { type: "boolean" as const } } };
const REQ = { promptId: "t", promptVersion: "1", system: "s", input: "i", schema: SCHEMA, schemaName: "t" };
const usage = { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 7800 };

function gemini(model: string) {
  const saved = process.env.VERTEX_API_KEY;
  process.env.VERTEX_API_KEY = VERTEX;
  try {
    return resolveProviderKind("gemini", undefined, model, { allowExternal: true }).provider!;
  } finally {
    if (saved === undefined) delete process.env.VERTEX_API_KEY;
    else process.env.VERTEX_API_KEY = saved;
  }
}
const fail = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x) => x
  );
  expect(e).not.toBeNull();
  return e as AiInvalidOutput & { reason?: string; usage?: { inputTokens: number | null; outputTokens: number | null } };
};

beforeEach(() => {
  generated.length = 0;
});

describe("Gemini: motivo real quando a resposta não chega inteira", () => {
  it("MAX_TOKENS com JSON pela metade: cortada pelo limite, com o raciocínio e os tokens", async () => {
    reply = () => ({ text: '{"ok": tr', candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"ok": tr' }] } }], usageMetadata: usage });
    const e = await fail(gemini("gemini-3.5-flash").generate({ ...REQ, maxOutputTokens: 8192 }));
    expect(e).toBeInstanceOf(AiInvalidOutput);
    expect(e.message).toMatch(/^Resposta cortada pelo limite de saída/);
    expect(e.message).toMatch(/raciocínio usou 7800/);
    expect(e.reason).toBe("cortada");
    expect(e.usage).toEqual({ inputTokens: 1000, outputTokens: 8000 });
    expect(shouldRetrySame(e)).toBe(false);
  });

  it("MAX_TOKENS só com raciocínio (sem texto): mesma mensagem", async () => {
    reply = () => ({ text: undefined, candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "pensando", thought: true }] } }], usageMetadata: { promptTokenCount: 1000, thoughtsTokenCount: 14192 } });
    const e = await fail(gemini("gemini-2.5-pro").generate({ ...REQ, maxOutputTokens: 6000 }));
    expect(e.message).toMatch(/^Resposta cortada pelo limite de saída/);
    expect(e.reason).toBe("cortada");
    expect(e.usage).toEqual({ inputTokens: 1000, outputTokens: 14192 });
  });

  it("RECITATION e SAFETY sem conteúdo: o motivo aparece e não repete na mesma IA", async () => {
    reply = () => ({ text: undefined, candidates: [{ finishReason: "RECITATION" }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 50 } });
    const r = await fail(gemini("gemini-3.5-flash").generate(REQ));
    expect(r).toBeInstanceOf(AiInvalidOutput);
    expect(r.message).toMatch(/RECITATION/);
    expect(r.message).toMatch(/texto já publicado/);
    expect(r.reason).toBe("bloqueada");
    expect(r.usage).toEqual({ inputTokens: 900, outputTokens: 50 });
    expect(shouldRetrySame(r)).toBe(false);

    reply = () => ({ text: undefined, candidates: [{ finishReason: "SAFETY" }], usageMetadata: { promptTokenCount: 900 } });
    const s = await fail(gemini("gemini-3.5-flash").generate(REQ));
    expect(s.message).toMatch(/SAFETY/);
    expect(s.reason).toBe("bloqueada");
    expect(shouldRetrySame(s)).toBe(false);
  });

  it("pedido bloqueado (promptFeedback.blockReason): erro de bloqueio, sem nova tentativa", async () => {
    reply = () => ({ text: undefined, promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, usageMetadata: { promptTokenCount: 300 } });
    const e = await fail(gemini("gemini-3.5-flash").generate(REQ));
    expect(e.message).toMatch(/bloqueou o pedido/);
    expect(e.message).toMatch(/PROHIBITED_CONTENT/);
    expect(shouldRetrySame(e)).toBe(false);
  });

  it("STOP sem texto e com raciocínio: resposta só com o raciocínio, vale tentar de novo", async () => {
    reply = () => ({ text: undefined, candidates: [{ finishReason: "STOP", content: { parts: [{ text: "x", thought: true }] } }], usageMetadata: { promptTokenCount: 10, thoughtsTokenCount: 40 } });
    const e = await fail(gemini("gemini-3.5-flash").generate(REQ));
    expect(e.message).toMatch(/só com o raciocínio/);
    expect(e.reason).toBe("vazia");
    expect(e.usage).toEqual({ inputTokens: 10, outputTokens: 40 });
    expect(shouldRetrySame(e)).toBe(true);
  });

  it("texto que não é JSON, sem motivo de parada: como antes, e vale tentar de novo (agora com os tokens)", async () => {
    reply = () => ({ text: "não é json", candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
    const e = await fail(gemini("gemini-3.5-flash").generate(REQ));
    expect(e.message).toBe("Resposta não é JSON.");
    expect(e.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(shouldRetrySame(e)).toBe(true);
    // fora do esquema também leva os tokens
    reply = () => ({ text: '{"ok":"sim"}', candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
    const f = await fail(gemini("gemini-3.5-flash").generate(REQ));
    expect(f.message).toMatch(/^Resposta fora do formato/);
    expect(f.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(shouldRetrySame(f)).toBe(true);
  });

  it("STOP com JSON válido: ok como antes; a saída conta o raciocínio", async () => {
    reply = () => ({ text: '{"ok":true}', modelVersion: "gemini-3.6-flash", candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: usage });
    const r = await gemini("gemini-3.5-flash").generate(REQ);
    expect(r.output).toEqual({ ok: true });
    expect(r.inputTokens).toBe(1000);
    expect(r.outputTokens).toBe(8000);
    // o modelo registrado continua o pedido: a reutilização de respostas guardadas (ch_worker_cached_run) procura por ele
    expect(r.model).toBe("gemini-3.5-flash");
  });
});

describe("Gemini: folga de saída para o raciocínio", () => {
  const ok = () => ({ text: '{"ok":true}', candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
  beforeEach(() => {
    reply = ok;
  });

  it("2.5 Pro Caprichado: soma o teto do raciocínio padrão (8.192) ao pedido, sem mudar o raciocínio", async () => {
    await gemini("gemini-2.5-pro").generate({ ...REQ, maxOutputTokens: 6000, care: "caprichado" });
    expect(generated[0].config.maxOutputTokens).toBe(14192);
    expect(generated[0].config).not.toHaveProperty("thinkingConfig");
    expect(geminiOutputLimit("gemini-2.5-pro", "caprichado", 6000)).toBe(14192);
    expect(geminiOutputLimit("gemini-2.5-pro", undefined, 6000)).toBe(14192);
  });

  it("2.5 Pro Rápido: soma o orçamento mandado (1.024)", async () => {
    await gemini("gemini-2.5-pro").generate({ ...REQ, maxOutputTokens: 6000, care: "rapido" });
    expect(generated[0].config.maxOutputTokens).toBe(7024);
    expect(generated[0].config.thinkingConfig).toEqual({ thinkingBudget: 1024 });
  });

  it("Gemini 3 (raciocínio por nível): soma 16.384", async () => {
    await gemini("gemini-3.5-flash").generate({ ...REQ, maxOutputTokens: 8192, care: "caprichado" });
    expect(generated[0].config.maxOutputTokens).toBe(24576);
    expect(generated[0].config).not.toHaveProperty("thinkingConfig");
    expect(geminiOutputLimit("gemini-3.1-pro-preview", "rapido", 8192)).toBe(24576);
  });

  it("2.5 Flash-Lite (pensa até 8.192 no Vertex AI) ganha a folga; modelos de imagem não; nunca passa de 65.536", async () => {
    await gemini("gemini-2.5-flash-lite").generate({ ...REQ, maxOutputTokens: 6000 });
    expect(generated[0].config.maxOutputTokens).toBe(6000 + 8192);
    expect(geminiOutputLimit("gemini-2.5-flash-image", "caprichado", 4000)).toBe(4000);
    expect(geminiOutputLimit("gemini-3.5-flash", "caprichado", 60000)).toBe(65536);
    // sem pedido: o padrão do provedor (4.096) mais a folga
    await gemini("gemini-2.5-flash").generate(REQ);
    expect(generated[1].config.maxOutputTokens).toBe(4096 + 8192);
  });
});

// ------------------------------------------------------------------ maestro (banco de teste)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-motivo-"));
const ADMIN = "00000000-0000-4000-8000-0000000000a9";
let dev: DevDatabase;
let db: ContentDb;

describe("maestro: resposta cortada vai para a reserva e a falha conta no gasto", () => {
  type R = { provider: string; model: string };
  const G = { provider: "gemini", model: "gemini-3.5-flash" };
  const A = { provider: "anthropic", model: "claude-opus-5" };
  const key = (r: R) => `${r.provider}:${r.model}`;
  const origin = { source: "central" as const, itemId: "item-1", actorId: null };
  const MREQ = { promptId: "t", promptVersion: "1", system: "sistema", input: "x".repeat(400), schema: { type: "object" as const }, schemaName: "teste", maxOutputTokens: 8192 };

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'gm@t.dev')`, [ADMIN]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  }, 300_000);
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
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
    for (const id of ["gemini", "anthropic"]) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "criacao", p_config: { mode: "sozinha", primary_ref: G, fallback_ref: A, reviewers: [], care: "caprichado" } });
    for (const [r, i, o] of [[G, 1.5, 9], [A, 5, 25]] as const) {
      await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: r.provider, p_model: r.model, p_price: { input_per_mtok: i, output_per_mtok: o, source_url: "https://exemplo.com", checked_on: "2026-10-10" } });
    }
    invalidateAiConfig(db);
  });

  function fakes(primaryError: () => Error) {
    const calls: Record<string, number> = {};
    const makeProviderFor = (ref: R) => ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate() {
        calls[key(ref)] = (calls[key(ref)] ?? 0) + 1;
        if (ref.provider === "gemini") throw primaryError();
        return { output: { ok: true }, provider: ref.provider, model: ref.model, inputTokens: 100, outputTokens: 100, latencyMs: 1, costUsd: null };
      },
    }) as any;
    return { makeProviderFor, calls };
  }
  const run = async (f: ReturnType<typeof fakes>) => {
    const { runFunction } = await import("../../server/ai/maestro");
    return runFunction<any>({ db, env: {} as any, makeProviderFor: f.makeProviderFor, log: () => {} }, "criacao", MREQ, origin);
  };
  const rows = async (runId: string) =>
    (await dev.db.query<any>(`select role, provider, outcome, input_tokens, output_tokens, cost_usd::float8 as cost, error from public.ai_calls where run_id = $1 order by id`, [runId])).rows;

  it("cortada: uma só chamada à principal, depois a reserva; a falha grava tokens e custo, e o gasto do mês inclui", async () => {
    const f = fakes(() => new AiInvalidOutput("Resposta cortada pelo limite de saída (raciocínio usou 8000 de 8192 tokens).", null, { usage: { inputTokens: 1000, outputTokens: 8192 }, reason: "cortada" }));
    const r = await run(f);
    expect(r.status).toBe("ok");
    expect(f.calls).toEqual({ [key(G)]: 1, [key(A)]: 1 });
    const logged = await rows(r.runId);
    expect(logged.map((l) => `${l.role}:${l.outcome}`)).toEqual(["principal:falha", "reserva:ok"]);
    const expected = (1000 * 1.5 + 8192 * 9) / 1e6;
    expect(logged[0]).toMatchObject({ input_tokens: 1000, output_tokens: 8192 });
    expect(logged[0].cost).toBeCloseTo(expected, 6);
    expect(logged[0].error).toMatch(/cortada pelo limite/);
    const month = Number(await db.service<any>("ch_worker_ai_month_spend", { p_now: new Date().toISOString() }));
    expect(month).toBeCloseTo(expected + (100 * 5 + 100 * 25) / 1e6, 6);
  });

  it("\"não é JSON\" sem motivo: continua com duas tentativas na principal antes da reserva", async () => {
    const f = fakes(() => new AiInvalidOutput("Resposta não é JSON.", "xx"));
    const r = await run(f);
    expect(f.calls).toEqual({ [key(G)]: 2, [key(A)]: 1 });
    expect((await rows(r.runId)).map((l) => `${l.role}:${l.outcome}:${l.cost}`)).toEqual(["principal:falha:0", "principal:falha:0", "reserva:ok:0.003"]);
  });

  it("o teto por chamada enxerga o limite real mandado ao Gemini (pedido + folga do raciocínio)", async () => {
    // estimativa com 8.192: ~US$ 0,074; com a folga (24.576): ~US$ 0,221. Teto de US$ 0,10 só para com a folga na conta
    await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { caps_enabled: true, per_run_cap_usd: 0.1, monthly_cap_usd: 100 } });
    (await import("../../server/ai/config")).invalidateAiConfig(db);
    const f = fakes(() => new Error("não deveria chamar"));
    const r = await run(f);
    expect(r.status).toBe("parou_no_teto");
    expect(r.message).toMatch(/teto por chamada/);
    expect(f.calls).toEqual({});
  });
});
