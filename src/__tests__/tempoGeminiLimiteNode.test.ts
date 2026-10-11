// @vitest-environment node
/**
 * Revisão rodada 4, pontos 1 e 3: o fetch do Node (undici) fecha a conexão quando o cabeçalho da resposta não chega em 300 s
 * (headersTimeout) ou quando o corpo para por 300 s (bodyTimeout). O Gemini sem streaming só manda o cabeçalho quando termina.
 * Antes, o tempo-limite do maestro para o Gemini ia até 600 s: uma resposta acima de 300 s nunca virava "tempo esgotado"; virava
 * TypeError "fetch failed", com custo 0, erro em inglês e nova tentativa no mesmo Gemini (o Google cobra cada tentativa). Agora:
 *   1. o tempo-limite do Gemini fica em no máximo 290 s, antes do corte do Node;
 *   2. o corte do Node (UND_ERR_HEADERS_TIMEOUT, UND_ERR_BODY_TIMEOUT) conta como tempo esgotado: custo estimado no registro,
 *      sem nova tentativa, mensagem em português.
 * Sem rede externa: um servidor local que não responde produz o erro de verdade do fetch do Node (com limite curto).
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

/** Gemini falso que falha com o erro dado; Claude falso que responde. */
function providers(error: unknown, calls: string[]) {
  return (ref: R) =>
    ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate() {
        calls.push(key(ref));
        if (ref.provider === "gemini") throw error;
        return { output: { ok: true }, provider: ref.provider, model: ref.model, inputTokens: 100, outputTokens: 100, latencyMs: 1, costUsd: null };
      },
    }) as any;
}

// ------------------------------------------------------------------ o fetch do Node de verdade, num servidor local

let server: http.Server;
let base = "";
/** Erros de verdade do fetch do Node: cabeçalho que não chega e corpo que para no meio. */
const real: { headers?: any; body?: any; nodeLimits?: { headers: number; body: number } } = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/ok") return void res.end("ok");
    if (req.url === "/corpo") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
    }
    // "/lento": não responde (como o Gemini que ainda está gerando)
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  // um pedido que responde carrega o undici do Node e cria a conexão com os limites padrão
  await (await fetch(`${base}/ok`)).text();
  const agent = (globalThis as any)[Symbol.for("undici.globalDispatcher.1")];
  const clientsOf = (d: any) => d[Object.getOwnPropertySymbols(d).find((s) => s.description === "clients")!];
  for (const [, v] of clientsOf(agent)) {
    const pool = v.dispatcher ?? v;
    const inner = clientsOf(pool) ?? [pool];
    for (const c of inner) {
      const sym = (name: string) => Object.getOwnPropertySymbols(c).find((s) => s.description === name)!;
      real.nodeLimits = { headers: c[sym("headers timeout")], body: c[sym("body timeout")] };
    }
  }
  // mesmo undici do Node, com limites curtos, para o teste não esperar 300 s
  const Agent = agent.constructor;
  const short = new Agent({ headersTimeout: 200, bodyTimeout: 200 });
  try {
    await fetch(`${base}/lento`, { dispatcher: short } as any);
  } catch (e) {
    real.headers = e;
  }
  try {
    await (await fetch(`${base}/corpo`, { dispatcher: short } as any)).text();
  } catch (e) {
    real.body = e;
  }
  await short.destroy();
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

describe("o fetch do Node corta a resposta aos 300 s", () => {
  it("o limite padrão deste Node: 300 s para o cabeçalho e 300 s para o corpo", () => {
    expect(real.nodeLimits).toEqual({ headers: 300_000, body: 300_000 });
  });

  it("o tempo-limite do Gemini nunca passa de 290 s (antes do corte do Node); o resto não muda", async () => {
    const { callTimeoutMs } = await import("../../server/ai/maestro");
    // Questões: 12.000 + 16.384 = 28.384 tokens; antes 313,8 s
    expect(callTimeoutMs(G as any, 12_000, "caprichado")).toBe(290_000);
    // Podcasts fora da Vercel: 32.384 tokens; antes 353,8 s
    expect(callTimeoutMs(G as any, 16_000, "caprichado")).toBe(290_000);
    expect(callTimeoutMs(G as any, 60_000, "caprichado")).toBe(290_000);
    // Criação: 24.576 tokens, continua 275,8 s
    expect(callTimeoutMs(G as any, 8192, "caprichado")).toBe(275_760);
    expect(callTimeoutMs(G as any, 60_000, "caprichado")).toBeLessThan(real.nodeLimits!.headers - 5_000);
  });

  it("o erro de verdade: 'fetch failed' (cabeçalho) e 'terminated' (corpo), com o código do undici na causa", () => {
    expect(real.headers).toBeInstanceOf(TypeError);
    expect(real.headers.message).toBe("fetch failed");
    expect(real.headers.cause?.code).toBe("UND_ERR_HEADERS_TIMEOUT");
    expect(real.body).toBeInstanceOf(TypeError);
    expect(real.body.message).toBe("terminated");
    expect(real.body.cause?.code).toBe("UND_ERR_BODY_TIMEOUT");
  });

  it("o corte do Node não repete a mesma IA; outra falha de rede continua repetindo", async () => {
    const { shouldRetrySame } = await import("../../server/ai/maestro");
    expect(shouldRetrySame(real.headers)).toBe(false);
    expect(shouldRetrySame(real.body)).toBe(false);
    // a biblioteca do Claude embrulha o erro do fetch (APIConnectionError com a causa)
    expect(shouldRetrySame(new Error("Connection error.", { cause: real.headers }))).toBe(false);
    const socket = new TypeError("fetch failed", { cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }) });
    expect(shouldRetrySame(socket)).toBe(true);
  });
});

describe("maestro: o corte do Node conta como tempo esgotado", () => {
  for (const which of ["headers", "body"] as const) {
    it(`${which === "headers" ? "cabeçalho" : "corpo"} fora do limite: custo estimado, sem nova tentativa, mensagem em português, e a reserva responde`, async () => {
      const { runFunction } = await import("../../server/ai/maestro");
      const { db, logged } = fakeDb({ primary_ref: G, fallback_ref: A });
      const calls: string[] = [];
      const r = await runFunction<any>({ db, env: {} as any, makeProviderFor: providers(real[which], calls) as any, log: () => {} }, "criacao", REQ, origin);
      expect(calls).toEqual([key(G), key(A)]);
      expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha", "reserva:anthropic:ok"]);
      expect(logged[0].cost_usd).toBeCloseTo(0.221337, 6);
      expect(logged[0].error).toMatch(/^Tempo esgotado: /);
      expect(logged[0].error).toContain("Custo estimado de US$ 0,2213");
      expect(logged[0].error).not.toMatch(/fetch failed|terminated/);
      expect(r.status).toBe("ok");
      expect(r.costUsd).toBeCloseTo(0.221337 + (100 * 5 + 100 * 25) / 1e6, 6);
    });
  }

  it("o custo estimado do corte conta no teto por chamada: a reserva que não cabe não sai", async () => {
    // 0,2213 (estimado) + 0,2053 (reserva) = 0,4266 > 0,40
    const { runFunction } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ primary_ref: G, fallback_ref: A }, { caps_enabled: true, monthly_cap_usd: 100, per_run_cap_usd: 0.4 });
    const calls: string[] = [];
    const r = await runFunction<any>({ db, env: {} as any, makeProviderFor: providers(real.headers, calls) as any, log: () => {} }, "criacao", REQ, origin);
    expect(calls).toEqual([key(G)]);
    expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha", "reserva:anthropic:teto"]);
    expect(logged[1].error).toBe("Gasto desta chamada de US$ 0,2213 mais estimativa de US$ 0,2053 passa do teto por chamada de US$ 0,4.");
    expect(r.status).toBe("falhou");
  });
});
