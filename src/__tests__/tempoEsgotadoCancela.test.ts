// @vitest-environment node
/**
 * Revisão rodada 3, ponto 3: tempo esgotado. Antes, o maestro só parava de esperar (Promise.race): o pedido continuava aberto,
 * gerando e sendo cobrado, e a linha "falha" ficava com 0 tokens e custo 0, invisível para os tetos. Agora:
 *   1. o tempo esgotado cancela o pedido (AbortSignal até a biblioteca de cada IA: abortSignal no Gemini, signal no Claude,
 *      na OpenAI e no Ollama);
 *   2. a linha do tempo esgotado grava um custo ESTIMADO (pior caso da chamada), dito no texto do erro, e esse custo entra no
 *      teto por chamada (a reserva passa pela conferência com ele);
 *   3. o tempo-limite do Gemini cresce com a saída máxima mandada (pedido + folga do raciocínio), sem passar do prazo do pedido.
 * Sem rede: bibliotecas simuladas, provedores falsos, relógio falso e um banco falso que só guarda o registro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generated: any[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (args: any) => {
        generated.push(args);
        return { text: '{"ok":true}', candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
      },
    };
  },
}));
const anthropicCalls: { body: any; opts: any }[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (body: any, opts: any) => {
        anthropicCalls.push({ body, opts });
        return { model: body.model, stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    };
  },
}));

import { resolveProviderKind } from "../../server/contentHub/ai/provider";
import { OpenAIProvider } from "../../server/contentHub/ai/openai";
import { OllamaProvider } from "../../server/contentHub/ai/ollama";

type R = { provider: string; model: string };
const G: R = { provider: "gemini", model: "gemini-3.5-flash" };
const A: R = { provider: "anthropic", model: "claude-opus-5" };
const key = (r: R) => `${r.provider}:${r.model}`;
const PRICES: Record<string, [number, number]> = { [key(G)]: [1.5, 9], [key(A)]: [5, 25] };
const origin = { source: "central" as const, itemId: "item-1", actorId: null };
const SCHEMA = { type: "object" as const, required: ["ok"], properties: { ok: { type: "boolean" as const } } };
// 407 caracteres = 102 tokens; estimativa do gemini-3.5-flash: 102 × 1,5 + (8.192 + 16.384) × 9 = US$ 0,221337
const REQ = { promptId: "t", promptVersion: "1", system: "sistema", input: "x".repeat(400), schema: SCHEMA, schemaName: "teste", maxOutputTokens: 8192 };

function fakeDb(fn: { primary_ref: R; fallback_ref?: R | null }, settings: Record<string, unknown> = {}) {
  const logged: any[] = [];
  const db = {
    mode: "dev",
    async service(name: string, args: any) {
      if (name === "ch_worker_ai_config") {
        return {
          providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
          functions: [{ key: "criacao", mode: "sozinha", reviewers: [], care: "caprichado", fallback_ref: null, ...fn }],
          settings: { caps_enabled: false, monthly_cap_usd: null, per_run_cap_usd: null, tab_override_enabled: false, ...settings },
          prices: Object.entries(PRICES).map(([k, [i, o]]) => ({ provider: k.split(":")[0], model: k.split(":")[1], input_per_mtok: i, output_per_mtok: o, source_url: "https://exemplo.com", checked_on: "2026-10-10" })),
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

/** Provedor falso que nunca responde: só termina quando o pedido é cancelado (como a biblioteca de verdade). */
function hanging(ref: R, seen: AbortSignal[]) {
  return {
    name: ref.provider,
    model: ref.model,
    isMock: false,
    generate(req: any) {
      seen.push(req.signal);
      return new Promise((_, reject) => {
        req.signal?.addEventListener("abort", () => reject(new Error("This operation was aborted")));
      });
    },
  } as any;
}
const answering = (ref: R, calls: string[]) =>
  ({
    name: ref.provider,
    model: ref.model,
    isMock: false,
    async generate() {
      calls.push(key(ref));
      return { output: { ok: true }, provider: ref.provider, model: ref.model, inputTokens: 100, outputTokens: 100, latencyMs: 1, costUsd: null };
    },
  }) as any;

/** Roda até terminar, avançando o relógio falso de 10 em 10 s (no máximo 15 min). */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.finally(() => {
    done = true;
  }).catch(() => {});
  for (let i = 0; i < 90 && !done; i++) {
    await new Promise((res) => setImmediate(res));
    await vi.advanceTimersByTimeAsync(10_000);
  }
  return p;
}

describe("maestro: tempo esgotado cancela o pedido e grava o custo estimado", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("o pedido do Gemini é cancelado; a linha tem o custo estimado (dito no erro) e a reserva responde", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ primary_ref: G, fallback_ref: A });
    const signals: AbortSignal[] = [];
    const calls: string[] = [];
    const makeProviderFor = (ref: R) => (ref.provider === "gemini" ? hanging(ref, signals) : answering(ref, calls));
    const r = await settle(runFunction<any>({ db, env: {} as any, makeProviderFor: makeProviderFor as any, log: () => {} }, "criacao", REQ, origin));
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0].aborted).toBe(true);
    expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha", "reserva:anthropic:ok"]);
    expect(logged[0].cost_usd).toBeCloseTo(0.221337, 6);
    expect(logged[0].error).toMatch(/^Tempo esgotado \(276 s\)/);
    expect(logged[0].error).toMatch(/custo estimado/i);
    expect(logged[0].error).toMatch(/US\$ 0,2213/);
    expect(r.status).toBe("ok");
    expect(calls).toEqual([key(A)]);
  });

  it("o custo estimado do tempo esgotado conta no teto por chamada: a reserva que não cabe não sai", async () => {
    // 0,2213 (estimado, tempo esgotado) + 0,2053 (reserva) = 0,4266 > 0,40
    const { runFunction } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ primary_ref: G, fallback_ref: A }, { caps_enabled: true, monthly_cap_usd: 100, per_run_cap_usd: 0.4 });
    const signals: AbortSignal[] = [];
    const calls: string[] = [];
    const makeProviderFor = (ref: R) => (ref.provider === "gemini" ? hanging(ref, signals) : answering(ref, calls));
    const r = await settle(runFunction<any>({ db, env: {} as any, makeProviderFor: makeProviderFor as any, log: () => {} }, "criacao", REQ, origin));
    expect(calls).toEqual([]);
    expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha", "reserva:anthropic:teto"]);
    expect(logged[1].error).toBe("Gasto desta chamada de US$ 0,2213 mais estimativa de US$ 0,2053 passa do teto por chamada de US$ 0,4.");
    expect(r.status).toBe("falhou");
  });

  it("o tempo-limite do Gemini cresce com a saída máxima: não corta aos 180 s um pedido de 24.576 tokens", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const { db } = fakeDb({ primary_ref: G });
    const signals: AbortSignal[] = [];
    const p = runFunction<any>({ db, env: {} as any, makeProviderFor: ((ref: R) => hanging(ref, signals)) as any, log: () => {} }, "criacao", REQ, origin);
    for (let i = 0; i < 20 && !signals.length; i++) await new Promise((res) => setImmediate(res));
    expect(signals).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(80_000);
    expect(signals[0].aborted).toBe(true);
    const r = await p;
    expect(r.message).toMatch(/^Tempo esgotado \(276 s\)/);
  });

  it("Claude continua com 180 s; o prazo do pedido (site) continua mandando no Gemini", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const claude = fakeDb({ primary_ref: A });
    const seenA: AbortSignal[] = [];
    const ra = await settle(runFunction<any>({ db: claude.db, env: {} as any, makeProviderFor: ((ref: R) => hanging(ref, seenA)) as any, log: () => {} }, "criacao", REQ, origin));
    expect(ra.message).toMatch(/^Tempo esgotado \(180 s\)/);
    expect(seenA[0].aborted).toBe(true);
    // a Claude com o pedido de 8.192: 102 × 5 + 8.192 × 25 = US$ 0,20531 estimado
    expect(claude.logged[0].cost_usd).toBeCloseTo(0.20531, 6);

    // prazo do pedido em 200 s: sobram 185 s (15 s de folga para gravar e responder), menos que os 276 s do Gemini
    const site = fakeDb({ primary_ref: G });
    const seenG: AbortSignal[] = [];
    const rg = await settle(runFunction<any>({ db: site.db, env: {} as any, deadlineAt: Date.now() + 200_000, makeProviderFor: ((ref: R) => hanging(ref, seenG)) as any, log: () => {} }, "criacao", REQ, origin));
    expect(rg.message).toMatch(/^Tempo esgotado \(185 s\)/);
    expect(seenG[0].aborted).toBe(true);
  });

  it("callTimeoutMs: 30 s + 10 ms por token de saída no Gemini, entre 180 s e 290 s (o fetch do Node corta aos 300 s); as outras IAs ficam com 180 s", async () => {
    const { callTimeoutMs } = await import("../../server/ai/maestro");
    expect(callTimeoutMs(G as any, 8192, "caprichado")).toBe(275_760);
    expect(callTimeoutMs(G as any, 16_000, "caprichado")).toBe(290_000); // Podcasts (32.384 tokens dariam 353,8 s)
    expect(callTimeoutMs({ provider: "gemini", model: "gemini-2.5-pro" } as any, 6000, "rapido")).toBe(180_000);
    expect(callTimeoutMs(G as any, 60_000, "caprichado")).toBe(290_000);
    expect(callTimeoutMs(A as any, 16_000, "caprichado")).toBe(180_000);
    expect(callTimeoutMs({ provider: "openai", model: "gpt-6.1-sol" } as any, 16_000, "caprichado")).toBe(180_000);
  });
});

describe("cada biblioteca recebe o cancelamento", () => {
  const withEnv = <T>(vars: Record<string, string>, fn: () => T): T => {
    const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    Object.assign(process.env, vars);
    try {
      return fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it("Gemini: abortSignal no config (e nada quando não há cancelamento)", async () => {
    generated.length = 0;
    const p = withEnv({ VERTEX_API_KEY: "AQ.Ab8RN6" + "v".repeat(44) }, () => resolveProviderKind("gemini", undefined, "gemini-3.5-flash", { allowExternal: true }).provider!);
    const ac = new AbortController();
    await p.generate({ ...REQ, signal: ac.signal } as any);
    expect(generated[0].config.abortSignal).toBe(ac.signal);
    await p.generate(REQ);
    expect(generated[1].config).not.toHaveProperty("abortSignal");
  });

  it("Claude: signal nas opções do pedido", async () => {
    anthropicCalls.length = 0;
    const p = withEnv({ ANTHROPIC_API_KEY: "k".repeat(40) }, () => resolveProviderKind("anthropic", undefined, "claude-opus-5", { allowExternal: true }).provider!);
    const ac = new AbortController();
    await p.generate({ ...REQ, signal: ac.signal } as any);
    expect(anthropicCalls[0].opts?.signal).toBe(ac.signal);
  });

  it("OpenAI e Ollama: o cancelamento do maestro chega ao fetch (junto do limite próprio de 180 s)", async () => {
    for (const make of [
      (f: any) => new OpenAIProvider("k".repeat(40), "gpt-6.1-sol", f),
      (f: any) => new OllamaProvider("http://localhost:11434", "qwen3", f),
    ]) {
      let seen: AbortSignal | undefined;
      const fetchImpl = (_url: string, init: any) => {
        seen = init.signal;
        return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("This operation was aborted"))));
      };
      const ac = new AbortController();
      const pending = make(fetchImpl).generate({ ...REQ, signal: ac.signal } as any).catch((e: unknown) => e as Error);
      await new Promise((res) => setImmediate(res));
      expect(seen?.aborted).toBe(false);
      ac.abort();
      expect(seen?.aborted).toBe(true);
      expect(await pending).toBeInstanceOf(Error);
    }
  });
});
