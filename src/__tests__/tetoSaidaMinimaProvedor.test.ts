// @vitest-environment node
/**
 * Revisão rodada 5, ponto 1: a estimativa dos tetos (e o valor que a tela sugere para a reserva socorrer) usava a saída pedida,
 * mas o provedor do Claude manda max_tokens de no mínimo 8.192 (e o da OpenAI, max_completion_tokens de no mínimo 4.096).
 * Nas Aulas e nos assistentes (6.000 pedidos), um corte do Claude custa 8.192 tokens de saída. Cenário da revisão: assistente
 * Conferir com o claude-opus-5 de principal e o gemini-3.5-flash de reserva, 70 mil caracteres. A tela dizia "pelo menos US$
 * 0,47"; com esse teto, o Claude cortado custava US$ 0,2923 (17.500 × 5 + 8.192 × 25) e a reserva era barrada.
 * Agora o limite de saída da estimativa é o que cada provedor de fato manda (effectiveMaxOut), e o teste confere isso contra o
 * pedido que sai de cada provedor. Sem rede: bibliotecas do Google e do Claude simuladas, fetch falso, banco falso.
 */
import { describe, expect, it, vi } from "vitest";

const geminiSent: any[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (args: any) => {
        geminiSent.push(args);
        return { text: '{"ok":true}', candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
      },
    };
  },
}));

/** Como o Claude simulado responde: certo, cortado no max_tokens mandado ou fora do formato (gastando o max_tokens inteiro). */
let claudeMode: "ok" | "cortada" | "formato" = "ok";
const claudeSent: any[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (body: any) => {
        claudeSent.push(body);
        const usage = { input_tokens: 17_500, output_tokens: claudeMode === "ok" ? 10 : body.max_tokens };
        if (claudeMode === "cortada") return { model: body.model, stop_reason: "max_tokens", content: [], usage };
        const text = claudeMode === "formato" ? '{"outro":1}' : '{"ok":true}';
        return { model: body.model, stop_reason: "end_turn", content: [{ type: "text", text }], usage };
      },
    };
  },
}));

import { callEstimateUsd, effectiveMaxOut, TYPICAL_CALLS, typicalCallEstimate, validateFunctionConfig, type AiConfig, type FunctionConfig } from "../../server/ai/config";
import { resolveProviderKind } from "../../server/contentHub/ai/provider";
import { OpenAIProvider } from "../../server/contentHub/ai/openai";
import { OllamaProvider } from "../../server/contentHub/ai/ollama";

type R = { provider: any; model: string };
const OPUS: R = { provider: "anthropic", model: "claude-opus-5" };
const G35: R = { provider: "gemini", model: "gemini-3.5-flash" };
const SOL: R = { provider: "openai", model: "gpt-6.1-sol" };
const QWEN: R = { provider: "ollama", model: "qwen3" };
const PRICES = [
  { ...OPUS, input_per_mtok: 5, output_per_mtok: 25 },
  { ...G35, input_per_mtok: 1.5, output_per_mtok: 9 },
  { ...SOL, input_per_mtok: 2, output_per_mtok: 10 },
].map((p) => ({ ...p, source_url: "https://exemplo.com", checked_on: "2026-10-10" }));
const SCHEMA = { type: "object" as const, required: ["ok"], properties: { ok: { type: "boolean" as const } } };
const REQ = { promptId: "t", promptVersion: "1", system: "s", input: "i", schema: SCHEMA, schemaName: "t" };

function withEnv<T>(vars: Record<string, string>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}
const realClaude = (model = OPUS.model) => withEnv({ ANTHROPIC_API_KEY: "k".repeat(40) }, () => resolveProviderKind("anthropic", undefined, model, { allowExternal: true }).provider!);
const realGemini = (model: string) => withEnv({ VERTEX_API_KEY: "AQ.Ab8RN6" + "v".repeat(44) }, () => resolveProviderKind("gemini", undefined, model, { allowExternal: true }).provider!);

describe("o limite de saída da estimativa é o que cada provedor manda", () => {
  it("Claude: no mínimo 8.192; OpenAI: no mínimo 4.096; Gemini com a folga; Ollama o pedido", () => {
    expect(effectiveMaxOut(OPUS, 6000)).toBe(8192);
    expect(effectiveMaxOut(OPUS, 4096)).toBe(8192);
    expect(effectiveMaxOut(OPUS, 16_000)).toBe(16_000);
    expect(effectiveMaxOut(SOL, 2048)).toBe(4096);
    expect(effectiveMaxOut(SOL, 6000)).toBe(6000);
    expect(effectiveMaxOut(G35, 6000, "caprichado")).toBe(6000 + 16_384);
    expect(effectiveMaxOut(QWEN, 2048)).toBe(2048);
  });

  it.each([1000, 2048, 4096, 6000, 8192, 12_000, 16_000])("pedido de %i tokens: a estimativa usa exatamente o que sai de cada provedor", async (n) => {
    claudeMode = "ok";
    claudeSent.length = 0;
    await realClaude().generate({ ...REQ, maxOutputTokens: n });
    expect(claudeSent[0].max_tokens).toBe(effectiveMaxOut(OPUS, n));

    geminiSent.length = 0;
    await realGemini(G35.model).generate({ ...REQ, maxOutputTokens: n, care: "caprichado" });
    expect(geminiSent[0].config.maxOutputTokens).toBe(effectiveMaxOut(G35, n, "caprichado"));

    const bodies: any[] = [];
    const fetchOpenAi = (async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    }) as any;
    await new OpenAIProvider("k".repeat(40), SOL.model, fetchOpenAi).generate({ ...REQ, maxOutputTokens: n });
    expect(bodies[0].max_completion_tokens).toBe(effectiveMaxOut(SOL, n));

    const fetchOllama = (async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ message: { content: '{"ok":true}' } }), { status: 200 });
    }) as any;
    await new OllamaProvider("http://localhost:11434", QWEN.model, fetchOllama).generate({ ...REQ, maxOutputTokens: n });
    expect(bodies[1].options.num_predict).toBe(effectiveMaxOut(QWEN, n));
  });

  it("Aulas e assistentes com o claude-opus-5: a estimativa conta 8.192 de saída, não os 6.000 pedidos", () => {
    const price = PRICES[0] as any;
    const aulas = TYPICAL_CALLS.criacao.find((u) => u.use === "Aulas")!;
    // 85.000 caracteres = 21.250 tokens × 5 + 8.192 × 25, por milhão (antes 0,256, com 6.000 × 25)
    expect(typicalCallEstimate(OPUS, price, aulas, "caprichado")).toBeCloseTo(0.31105, 6);
    // o custo estimado do tempo esgotado do Claude (maestro) usa a mesma conta: 17.500 × 5 + 8.192 × 25
    expect(callEstimateUsd(OPUS, price, 70_000, 6000, "caprichado")).toBeCloseTo(0.2923, 6);
  });
});

// ------------------------------------------------------------------ o valor do aviso com o Claude de principal (maestro)

const cfg = (cap: number): AiConfig =>
  ({
    providers: Object.fromEntries(["anthropic", "openai", "gemini", "ollama"].map((id) => [id, { enabled: id !== "ollama", models: [], status: null }])),
    functions: {},
    settings: { monthly_cap_usd: 100, per_run_cap_usd: cap, caps_enabled: true, tab_override_enabled: false },
    prices: PRICES,
  }) as any;
const fn = (primary: R, fallback: R): FunctionConfig => ({ key: "assistente_conferir", mode: "sozinha", primary, fallback, reviewers: [], care: "caprichado" }) as any;
const chain = (w: string[]) => w.filter((m) => m.startsWith("Teto por execução") && !m.includes("abaixo da estimativa de uma chamada"));
const suggested = (w: string) => [...w.matchAll(/pelo menos US\$ (\d+,\d+)/g)].map((m) => Number(m[1].replace(",", ".")));

function fakeDb(cap: number) {
  const logged: any[] = [];
  const db = {
    mode: "dev",
    async service(name: string, args: any) {
      if (name === "ch_worker_ai_config") {
        return {
          providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
          functions: [{ key: "assistente_conferir", mode: "sozinha", primary_ref: OPUS, fallback_ref: G35, reviewers: [], care: "caprichado" }],
          settings: { caps_enabled: true, monthly_cap_usd: 100, per_run_cap_usd: cap, tab_override_enabled: false },
          prices: PRICES,
        };
      }
      if (name === "ch_worker_ai_month_spend") return 0;
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
  return { db, logged };
}

/** Conferir com o Claude de verdade (biblioteca simulada) de principal e um Gemini falso que responde de reserva. */
async function conferir(cap: number, mode: "cortada" | "formato") {
  const { runFunction } = await import("../../server/ai/maestro");
  const { db, logged } = fakeDb(cap);
  claudeMode = mode;
  const claude = realClaude();
  const makeProviderFor = (ref: R) =>
    ref.provider === "anthropic"
      ? claude
      : ({
          name: ref.provider,
          model: ref.model,
          isMock: false,
          async generate() {
            return { output: { ok: true }, provider: ref.provider, model: ref.model, inputTokens: 17_500, outputTokens: 10, latencyMs: 1, costUsd: null };
          },
        } as any);
  const req = { ...REQ, input: "x".repeat(69_999), maxOutputTokens: 6000 };
  const r = await runFunction<any>({ db, env: {} as any, makeProviderFor: makeProviderFor as any, log: () => {} }, "assistente_conferir", req, { source: "assistente", itemId: null, actorId: null });
  return { status: r.status, rows: logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`), costs: logged.map((l) => Number(l.cost_usd)) };
}

describe("Conferir com o claude-opus-5 de principal e o gemini-3.5-flash de reserva (cenário da revisão)", () => {
  it("o aviso sugere o valor com o corte do Claude em 8.192 tokens", () => {
    const [w] = chain(validateFunctionConfig(fn(OPUS, G35), cfg(0.3)).warnings);
    // claude-opus-5: 0,2923; gemini-3.5-flash: 17.500 × 1,5 + 22.384 × 9 = 0,227706. Soma 0,520006; com a nova tentativa 0,812306
    expect(w).toContain("abaixo da principal Claude claude-opus-5 mais a reserva Gemini gemini-3.5-flash em assistentes (US$ 0,52)");
    expect(suggested(w)).toEqual([0.53, 0.82]);
  });

  it("com o valor sugerido a reserva socorre o corte e a nova tentativa do Claude; um centavo abaixo, não", async () => {
    const [w] = chain(validateFunctionConfig(fn(OPUS, G35), cfg(0.3)).warnings);
    const [rescue, full] = suggested(w);

    const cut = await conferir(rescue, "cortada");
    expect(cut).toMatchObject({ status: "ok", rows: ["principal:anthropic:falha", "reserva:gemini:ok"] });
    expect(cut.costs[0]).toBeCloseTo(0.2923, 6);
    expect(await conferir(rescue - 0.01, "cortada")).toMatchObject({ status: "falhou", rows: ["principal:anthropic:falha", "reserva:gemini:teto"] });

    expect(await conferir(full, "formato")).toMatchObject({ status: "ok", rows: ["principal:anthropic:falha", "principal:anthropic:falha", "reserva:gemini:ok"] });
    expect(await conferir(full - 0.01, "formato")).toMatchObject({ status: "falhou", rows: ["principal:anthropic:falha", "principal:anthropic:falha", "reserva:gemini:teto"] });
  });
});
