// @vitest-environment node
/**
 * Revisão rodada 3, ponto 2: o teto por execução enxerga o gasto real desta execução. Antes, o teto por execução só conferia a
 * estimativa da primeira chamada (plan()); a nova tentativa e a reserva saíam sem conferência, mesmo depois de uma falha cobrada
 * (resposta cortada do Gemini, com o raciocínio pago). Agora, antes de cada nova chamada, vale: gasto real já feito nesta
 * execução (com o custo das falhas) + estimativa das chamadas em andamento + estimativa da próxima. Passou do teto: a chamada
 * não sai e a linha fica com resultado "teto". O caminho é o mesmo para Sozinha, Linha de produção, Comitê e o adaptador.
 * Sem rede e sem banco de verdade: provedores falsos e um banco falso que só guarda as linhas do registro.
 */
import { describe, expect, it } from "vitest";
import { AiInvalidOutput } from "../../server/contentHub/ai/provider";

type R = { provider: string; model: string };
const G: R = { provider: "gemini", model: "gemini-3.5-flash" };
const A: R = { provider: "anthropic", model: "claude-opus-5" };
const O: R = { provider: "openai", model: "gpt-6.1-sol" };
const key = (r: R) => `${r.provider}:${r.model}`;
const PRICES: Record<string, [number, number]> = { [key(G)]: [1.5, 9], [key(A)]: [5, 25], [key(O)]: [2, 10] };
const origin = { source: "central" as const, itemId: "item-1", actorId: null };
// 407 caracteres = 102 tokens de entrada na estimativa
const REQ = { promptId: "t", promptVersion: "1", system: "sistema", input: "x".repeat(400), schema: { type: "object" as const }, schemaName: "teste", maxOutputTokens: 8192 };
// estimativas (pior caso) com o pedido acima, no Caprichado:
//   gemini-3.5-flash: 102 × 1,5 + (8.192 + 16.384) × 9 = US$ 0,221337
//   claude-opus-5:    102 × 5   + 8.192 × 25            = US$ 0,20531
//   gpt-6.1-sol:      102 × 2   + 8.192 × 10            = US$ 0,082124
const CUT = () => new AiInvalidOutput("Resposta cortada pelo limite de saída (raciocínio usou 24000 de 24576 tokens).", null, { usage: { inputTokens: 1000, outputTokens: 24_576 }, reason: "cortada" });
// custo real da resposta cortada: 1.000 × 1,5 + 24.576 × 9 = US$ 0,222684

interface Fn {
  key: string;
  mode: string;
  primary_ref: R;
  fallback_ref?: R | null;
  reviewers?: R[];
  care?: string;
}

/** Banco falso: a configuração da Central e o registro (ai_calls) em memória. */
function fakeDb(fn: Fn, settings: Record<string, unknown>) {
  const logged: any[] = [];
  const db = {
    mode: "dev",
    async service(name: string, args: any) {
      if (name === "ch_worker_ai_config") {
        return {
          providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
          functions: [{ fallback_ref: null, reviewers: [], care: "caprichado", ...fn }],
          settings: { caps_enabled: true, monthly_cap_usd: 100, tab_override_enabled: false, ...settings },
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

type Handler = (req: any, n: number) => unknown;
/** Provedores falsos: o handler devolve a resposta ou lança o erro; os tokens de quem responde vêm de `usage`. */
function fakes(handlers: Record<string, Handler>, usage: Record<string, [number, number]> = {}) {
  const calls: Record<string, number> = {};
  const makeProviderFor = (ref: R) => {
    const h = handlers[key(ref)];
    if (!h) return null;
    return {
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate(req: any) {
        calls[key(ref)] = (calls[key(ref)] ?? 0) + 1;
        const output = await h(req, calls[key(ref)]);
        const [i, o] = usage[key(ref)] ?? [100, 100];
        return { output, provider: ref.provider, model: ref.model, inputTokens: i, outputTokens: o, latencyMs: 1, costUsd: null };
      },
    } as any;
  };
  return { makeProviderFor, calls };
}

const summary = (logged: any[]) => logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`);

async function run(fn: Fn, settings: Record<string, unknown>, f: ReturnType<typeof fakes>, req: any = REQ) {
  const { runFunction } = await import("../../server/ai/maestro");
  const { db, logged } = fakeDb(fn, settings);
  const r = await runFunction<any>({ db, env: {} as any, makeProviderFor: f.makeProviderFor as any, log: () => {} }, "criacao", req, origin);
  return { r, logged };
}

describe("Sozinha: a reserva e a nova tentativa passam pelo teto por execução", () => {
  it("resposta cortada (cobrada) + estimativa da reserva acima do teto: a reserva não sai, linha 'teto' com a mensagem", async () => {
    // a primeira chamada cabe (0,2213 ≤ 0,40); depois do corte, gasto real 0,2227 + reserva 0,2053 = 0,4280 > 0,40
    const f = fakes({ [key(G)]: () => { throw CUT(); }, [key(A)]: () => ({ ok: "A" }) });
    const { r, logged } = await run({ key: "criacao", mode: "sozinha", primary_ref: G, fallback_ref: A }, { per_run_cap_usd: 0.4 }, f);
    expect(f.calls).toEqual({ [key(G)]: 1 });
    expect(summary(logged)).toEqual(["principal:gemini:falha", "reserva:anthropic:teto"]);
    expect(logged[0].cost_usd).toBeCloseTo(0.222684, 6);
    expect(logged[1].cost_usd).toBe(0);
    expect(logged[1].error).toBe("Gasto desta execução de US$ 0,2227 mais estimativa de US$ 0,2053 passa do teto por execução de US$ 0,4.");
    expect(r.status).toBe("falhou");
    expect(r.message).toMatch(/cortada pelo limite de saída/);
    expect(r.message).toMatch(/passa do teto por execução de US\$ 0,4\./);
    expect(r.costUsd).toBeCloseTo(0.222684, 6);
  });

  it("nova tentativa acima do teto não sai; a reserva, que cabe, responde", async () => {
    // falha passageira cobrada: 1.000 × 1,5 + 20.000 × 9 = 0,1815; nova tentativa 0,1815 + 0,2213 = 0,4028 > 0,40;
    // reserva 0,1815 + 0,2053 = 0,3868 ≤ 0,40
    const f = fakes({
      [key(G)]: () => { throw new AiInvalidOutput("Resposta não é JSON.", "xx", { usage: { inputTokens: 1000, outputTokens: 20_000 }, reason: "formato" }); },
      [key(A)]: () => ({ ok: "A" }),
    });
    const { r, logged } = await run({ key: "criacao", mode: "sozinha", primary_ref: G, fallback_ref: A }, { per_run_cap_usd: 0.4 }, f);
    expect(f.calls).toEqual({ [key(G)]: 1, [key(A)]: 1 });
    expect(summary(logged)).toEqual(["principal:gemini:falha", "principal:gemini:teto", "reserva:anthropic:ok"]);
    expect(logged[1].error).toMatch(/^Gasto desta execução de US\$ 0,1815 mais estimativa de US\$ 0,2213 passa do teto por execução de US\$ 0,4\.$/);
    expect(r.status).toBe("ok");
    expect(r.output).toEqual({ ok: "A" });
  });

  it("com folga no teto, tudo segue como antes (principal cortada e reserva respondendo)", async () => {
    const f = fakes({ [key(G)]: () => { throw CUT(); }, [key(A)]: () => ({ ok: "A" }) });
    const { r, logged } = await run({ key: "criacao", mode: "sozinha", primary_ref: G, fallback_ref: A }, { per_run_cap_usd: 1 }, f);
    expect(summary(logged)).toEqual(["principal:gemini:falha", "reserva:anthropic:ok"]);
    expect(r.status).toBe("ok");
  });

  it("tetos desligados: nada é conferido", async () => {
    const f = fakes({ [key(G)]: () => { throw CUT(); }, [key(A)]: () => ({ ok: "A" }) });
    const { r } = await run({ key: "criacao", mode: "sozinha", primary_ref: G, fallback_ref: A }, { caps_enabled: false, per_run_cap_usd: 0.01 }, f);
    expect(r.status).toBe("ok");
    expect(f.calls).toEqual({ [key(G)]: 1, [key(A)]: 1 });
  });
});

describe("adaptador (Central de Conteúdo, Aulas, Podcasts, assistentes)", () => {
  it("reserva barrada pelo teto depois de uma falha cobrada: erro com a mensagem do teto, sem AiCapReached", async () => {
    // AiCapReached deixaria o trabalho da Central parado "sem gastar tentativa": a cada rodada pagaria de novo a principal
    const { maestroProvider, AiCapReached } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ key: "criacao", mode: "sozinha", primary_ref: G, fallback_ref: A }, { per_run_cap_usd: 0.4 });
    const f = fakes({ [key(G)]: () => { throw CUT(); }, [key(A)]: () => ({ ok: "A" }) });
    const p = (await maestroProvider({ db, env: {} as any, makeProviderFor: f.makeProviderFor as any, log: () => {} }, "criacao", origin)).provider!;
    const e = await p.generate(REQ).catch((x: unknown) => x as Error);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(AiCapReached);
    expect((e as Error).message).toMatch(/passa do teto por execução de US\$ 0,4\./);
    expect(f.calls).toEqual({ [key(G)]: 1 });
    expect(summary(logged)).toEqual(["principal:gemini:falha", "reserva:anthropic:teto"]);
  });
});

describe("Linha de produção e Comitê (mesmo caminho de chamada)", () => {
  it("Linha: depois da principal cortada e da reserva, o conferente que não cabe no teto não é chamado", async () => {
    // plano inicial cabe (criadora 0,2213 + conferente ≈ 0,037 ≤ 0,45); depois: 0,2227 (corte) + 0,2005 (reserva) = 0,4232;
    // + conferente ≈ 0,037 > 0,45
    const f = fakes(
      { [key(G)]: () => { throw CUT(); }, [key(A)]: () => ({ gabarito: "A" }), [key(O)]: () => ({ verdict: "de_acordo", problems: [] }) },
      { [key(A)]: [100, 8000] }
    );
    const { r, logged } = await run({ key: "criacao", mode: "linha", primary_ref: G, fallback_ref: A, reviewers: [O] }, { per_run_cap_usd: 0.45 }, f);
    expect(f.calls).toEqual({ [key(G)]: 1, [key(A)]: 1 });
    expect(summary(logged)).toEqual(["criadora:gemini:falha", "reserva:anthropic:ok", "conferente:openai:teto"]);
    expect(logged[2].error).toMatch(/^Gasto desta execução de US\$ 0,4232 mais estimativa de US\$ 0,03\d+ passa do teto por execução de US\$ 0,45\.$/);
    expect(r.status).toBe("precisa_revisao");
    expect(r.output).toEqual({ gabarito: "A" });
    expect(r.message).toMatch(/conferência incompleta/);
    expect(r.message).toMatch(/teto por execução de US\$ 0,45/);
  });

  it("Linha: a reserva da criadora também passa pelo teto", async () => {
    const f = fakes({ [key(G)]: () => { throw CUT(); }, [key(A)]: () => ({ gabarito: "A" }), [key(O)]: () => ({ verdict: "de_acordo", problems: [] }) });
    const { r, logged } = await run({ key: "criacao", mode: "linha", primary_ref: G, fallback_ref: A, reviewers: [O] }, { per_run_cap_usd: 0.4 }, f);
    expect(f.calls).toEqual({ [key(G)]: 1 });
    expect(summary(logged)).toEqual(["criadora:gemini:falha", "reserva:anthropic:teto"]);
    expect(r.status).toBe("falhou");
  });

  it("Comitê: membros chamados juntos não se barram (o plano já conferiu a soma); todos respondem", async () => {
    // soma das estimativas: 0,2213 + 0,2053 + 0,0821 = 0,5088 ≤ 0,51
    const f = fakes({ [key(G)]: () => ({ gabarito: "A" }), [key(A)]: () => ({ gabarito: "A" }), [key(O)]: () => ({ gabarito: "A" }) });
    const { r, logged } = await run({ key: "criacao", mode: "comite", primary_ref: G, reviewers: [A, O] }, { per_run_cap_usd: 0.51 }, f, { ...REQ, compareFields: ["gabarito"] });
    expect(f.calls).toEqual({ [key(G)]: 1, [key(A)]: 1, [key(O)]: 1 });
    expect(summary(logged)).toEqual(["membro:gemini:ok", "membro:anthropic:ok", "membro:openai:ok"]);
    expect(r.status).toBe("ok");
  });

  it("Comitê acima do teto continua parando antes de chamar qualquer IA", async () => {
    const f = fakes({ [key(G)]: () => ({ gabarito: "A" }), [key(A)]: () => ({ gabarito: "A" }), [key(O)]: () => ({ gabarito: "A" }) });
    const { r, logged } = await run({ key: "criacao", mode: "comite", primary_ref: G, reviewers: [A, O] }, { per_run_cap_usd: 0.5 }, f, { ...REQ, compareFields: ["gabarito"] });
    expect(f.calls).toEqual({});
    expect(r.status).toBe("parou_no_teto");
    expect(logged.every((l) => l.outcome === "teto")).toBe(true);
  });
});
