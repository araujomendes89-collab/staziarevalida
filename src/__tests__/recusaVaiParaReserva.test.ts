// @vitest-environment node
/**
 * Polimento da Central de IAs, ponto 1: a recusa do Claude (stop_reason "refusal") e da OpenAI (message.refusal ou
 * finish_reason "content_filter") virava erro comum. No registro (ai_calls) a linha ficava com custo 0, mesmo com os tokens
 * cobrados, e o maestro tentava de novo na mesma IA, que recusava igual (pagando de novo). Agora vale o que já valia para o
 * Gemini bloqueado: grava o custo real (os tokens que vieram) e vai direto para a reserva.
 * Quem tenta de novo ao receber resposta fora do formato (Tutor, Aulas, Podcasts) continua sem repetir uma recusa.
 * Sem rede: biblioteca do Claude simulada, fetch falso da OpenAI, Gemini falso, banco falso.
 */
import { describe, expect, it, vi } from "vitest";

/** Como o Claude simulado responde: recusa (com os tokens que a API devolve) ou certo. */
let claudeMode: "recusa" | "ok" = "recusa";
let claudeCalls = 0;
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (body: any) => {
        claudeCalls++;
        if (claudeMode === "recusa") {
          return { model: body.model, stop_reason: "refusal", stop_details: { category: "cyber" }, content: [], usage: { input_tokens: 1200, output_tokens: 40 } };
        }
        return { model: body.model, stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }], usage: { input_tokens: 1200, output_tokens: 10 } };
      },
    };
  },
}));

import { AiInvalidOutput, resolveProviderKind, type StructuredRequest } from "../../server/contentHub/ai/provider";
import { OpenAIProvider } from "../../server/contentHub/ai/openai";
import { FallbackProvider } from "../../server/contentHub/ai/fallback";
import { runFunction, shouldRetrySame } from "../../server/ai/maestro";

type R = { provider: any; model: string };
const OPUS: R = { provider: "anthropic", model: "claude-opus-5" };
const SOL: R = { provider: "openai", model: "gpt-6.1-sol" };
const G35: R = { provider: "gemini", model: "gemini-3.5-flash" };
const PRICES = [
  { ...OPUS, input_per_mtok: 5, output_per_mtok: 25 },
  { ...SOL, input_per_mtok: 2, output_per_mtok: 10 },
  { ...G35, input_per_mtok: 1.5, output_per_mtok: 9 },
].map((p) => ({ ...p, source_url: "https://exemplo.com", checked_on: "2026-10-10" }));
const SCHEMA = { type: "object" as const, required: ["ok"], properties: { ok: { type: "boolean" as const } } };
const REQ: StructuredRequest = { promptId: "t", promptVersion: "1", system: "s", input: "i", schema: SCHEMA, schemaName: "t", maxOutputTokens: 1000 };

function realClaude() {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "k".repeat(40);
  try {
    return resolveProviderKind("anthropic", undefined, OPUS.model, { allowExternal: true }).provider!;
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  }
}

/** OpenAI com fetch falso: recusa (message.refusal), filtro de conteúdo (content_filter) ou certo. */
function openAi(mode: "recusa" | "filtro" | "ok") {
  const calls = { n: 0 };
  const fetchImpl = (async () => {
    calls.n++;
    const choice =
      mode === "recusa"
        ? { index: 0, message: { role: "assistant", content: null, refusal: "Desculpe, não posso ajudar com isso." }, finish_reason: "stop" }
        : mode === "filtro"
          ? { index: 0, message: { role: "assistant", content: null }, finish_reason: "content_filter" }
          : { index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" };
    const usage = { prompt_tokens: 900, completion_tokens: mode === "filtro" ? 30 : 12 };
    return new Response(JSON.stringify({ model: SOL.model, choices: [choice], usage }), { status: 200 });
  }) as any;
  return { provider: new OpenAIProvider("k".repeat(40), SOL.model, fetchImpl), calls };
}

const okGemini = () => {
  const calls = { n: 0 };
  const provider = {
    name: "gemini",
    model: G35.model,
    isMock: false,
    async generate() {
      calls.n++;
      return { output: { ok: true }, provider: "gemini", model: G35.model, inputTokens: 900, outputTokens: 10, latencyMs: 1, costUsd: null };
    },
  } as any;
  return { provider, calls };
};

describe("o provedor devolve a recusa com os tokens que vieram, e ela não se repete na mesma IA", () => {
  it("Claude: stop_reason refusal", async () => {
    claudeMode = "recusa";
    const e: any = await realClaude().generate(REQ).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toMatch(/recusou a solicitação \(cyber\)/);
    expect(e.usage).toEqual({ inputTokens: 1200, outputTokens: 40 });
    expect(shouldRetrySame(e)).toBe(false);
  });

  it("OpenAI: message.refusal", async () => {
    const e: any = await openAi("recusa").provider.generate(REQ).catch((x) => x);
    expect(e.message).toMatch(/recusou a solicitação/);
    expect(e.usage).toEqual({ inputTokens: 900, outputTokens: 12 });
    expect(shouldRetrySame(e)).toBe(false);
  });

  it("OpenAI: finish_reason content_filter (antes virava \"Resposta não é JSON.\" e se repetia)", async () => {
    const e: any = await openAi("filtro").provider.generate(REQ).catch((x) => x);
    expect(e.message).toMatch(/filtro de conteúdo \(content_filter\)/);
    expect(e.usage).toEqual({ inputTokens: 900, outputTokens: 30 });
    expect(shouldRetrySame(e)).toBe(false);
  });
});

// ------------------------------------------------------------------ o maestro: custo real e direto para a reserva

function fakeDb(primary: R, fallback: R) {
  const logged: any[] = [];
  const db = {
    mode: "dev",
    async service(name: string, args: any) {
      if (name === "ch_worker_ai_config") {
        return {
          providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
          functions: [{ key: "criacao", mode: "sozinha", primary_ref: primary, fallback_ref: fallback, reviewers: [], care: "caprichado" }],
          settings: { caps_enabled: false, monthly_cap_usd: null, per_run_cap_usd: null, tab_override_enabled: false },
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

async function run(primary: R, makePrimary: () => any) {
  const { db, logged } = fakeDb(primary, G35);
  const reserve = okGemini();
  const p = makePrimary();
  const makeProviderFor = (ref: R) => (ref.provider === "gemini" ? reserve.provider : p);
  const r = await runFunction<any>({ db, env: {} as any, makeProviderFor: makeProviderFor as any, log: () => {} }, "criacao", REQ, { source: "aula", itemId: null, actorId: null });
  return { r, logged, rows: logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`), reserveCalls: reserve.calls.n };
}

describe("maestro: a recusa grava o custo real e vai direto para a reserva", () => {
  it("Claude recusa: uma chamada só ao Claude, com os tokens e o custo dela; a reserva responde", async () => {
    claudeMode = "recusa";
    claudeCalls = 0;
    const { r, logged, rows, reserveCalls } = await run(OPUS, realClaude);
    expect(r.status).toBe("ok");
    expect(rows).toEqual(["principal:anthropic:falha", "reserva:gemini:ok"]);
    expect(claudeCalls).toBe(1);
    expect(reserveCalls).toBe(1);
    // 1.200 × 5 + 40 × 25, por milhão
    expect(logged[0]).toMatchObject({ input_tokens: 1200, output_tokens: 40 });
    expect(Number(logged[0].cost_usd)).toBeCloseTo(0.007, 9);
    expect(logged[0].error).toMatch(/recusou a solicitação/);
    // o custo da recusa entra no custo da execução
    expect(r.costUsd).toBeCloseTo(0.007 + (900 * 1.5 + 10 * 9) / 1e6, 9);
  });

  it("OpenAI recusa (message.refusal): uma chamada só, com o custo; a reserva responde", async () => {
    let calls = { n: 0 };
    const { r, logged, rows } = await run(SOL, () => {
      const o = openAi("recusa");
      calls = o.calls;
      return o.provider;
    });
    expect(r.status).toBe("ok");
    expect(rows).toEqual(["principal:openai:falha", "reserva:gemini:ok"]);
    expect(calls.n).toBe(1);
    // 900 × 2 + 12 × 10, por milhão
    expect(Number(logged[0].cost_usd)).toBeCloseTo(0.00192, 9);
  });

  it("OpenAI barrada pelo filtro de conteúdo: uma chamada só, com o custo; a reserva responde", async () => {
    let calls = { n: 0 };
    const { r, logged, rows } = await run(SOL, () => {
      const o = openAi("filtro");
      calls = o.calls;
      return o.provider;
    });
    expect(r.status).toBe("ok");
    expect(rows).toEqual(["principal:openai:falha", "reserva:gemini:ok"]);
    expect(calls.n).toBe(1);
    // 900 × 2 + 30 × 10, por milhão
    expect(Number(logged[0].cost_usd)).toBeCloseTo(0.0021, 9);
  });
});

// ------------------------------------------------------------------ quem usa o provedor fora do maestro não muda

describe("fora do maestro, a recusa continua como antes", () => {
  it("não é \"resposta fora do formato\": Tutor, Aulas e Podcasts não repetem uma recusa como se fosse formato", async () => {
    claudeMode = "recusa";
    const claude = await realClaude().generate(REQ).catch((x) => x);
    const openai = await openAi("recusa").provider.generate(REQ).catch((x) => x);
    expect(claude).not.toBeInstanceOf(AiInvalidOutput);
    expect(openai).not.toBeInstanceOf(AiInvalidOutput);
  });

  it("reserva das variáveis (FallbackProvider, usado pelo Tutor): a recusa vai para o secundário sem repetir a principal", async () => {
    claudeMode = "recusa";
    claudeCalls = 0;
    const reserve = okGemini();
    const r = await new FallbackProvider(realClaude(), reserve.provider, { sleep: async () => {} }).generate<any>(REQ);
    expect(r.provider).toBe("gemini");
    expect(claudeCalls).toBe(1);
    expect(reserve.calls.n).toBe(1);
  });
});
