// @vitest-environment node
/**
 * Rodada final, ponto 1: no site (Vercel), o pedido tem 270 s (requestDeadline). O tempo-limite do Gemini 3 cresce com a saída
 * pedida (275,8 s na Criação) e, sem cuidado, a principal ficava com todo o prazo útil (255 s): quando ela esgotava, não sobrava
 * tempo para a reserva, que era recusada ("Sem tempo para chamar esta IA dentro do limite do pedido"). Antes deste ramo, os 180 s
 * fixos deixavam ~75 s para ela. Agora, com reserva pronta e prazo do pedido, a principal deixa o tempo mínimo da reserva
 * (MIN_CALL_MS, 30 s) mais a gravação da linha da principal (até 10 s): 255 − 40 = 215 s. Sem reserva, a principal usa o prazo todo.
 * Sem rede: provedores falsos, relógio falso (setTimeout e Date) e um banco falso que só guarda o registro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_BUDGET_MS, withRequestDeadline } from "../../server/ai/requestDeadline";

type R = { provider: string; model: string };
const G: R = { provider: "gemini", model: "gemini-3.5-flash" };
const A: R = { provider: "anthropic", model: "claude-opus-5" };
const OLLAMA: R = { provider: "ollama", model: "qwen3" };
const key = (r: R) => `${r.provider}:${r.model}`;
const PRICES: Record<string, [number, number]> = { [key(G)]: [1.5, 9], [key(A)]: [5, 25] };
const origin = { source: "central" as const, itemId: "item-1", actorId: null };
const SCHEMA = { type: "object" as const, required: ["ok"], properties: { ok: { type: "boolean" as const } } };
// Criação no gemini-3.5-flash: 8.192 + 16.384 de folga do raciocínio = tempo-limite de 275,76 s (mais que os 255 s úteis do site)
const REQ = { promptId: "t", promptVersion: "1", system: "sistema", input: "x".repeat(400), schema: SCHEMA, schemaName: "teste", maxOutputTokens: 8192 };
/** Folga antes da hora-limite do pedido (DEADLINE_SAFETY_MS do maestro). */
const SAFETY = 15_000;

function fakeDb(fn: { primary_ref: R; fallback_ref?: R | null }) {
  const logged: any[] = [];
  const db = {
    mode: "dev",
    async service(name: string, args: any) {
      if (name === "ch_worker_ai_config") {
        return {
          providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
          functions: [{ key: "criacao", mode: "sozinha", reviewers: [], care: "caprichado", fallback_ref: null, ...fn }],
          settings: { caps_enabled: false, monthly_cap_usd: null, per_run_cap_usd: null, tab_override_enabled: false },
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

/** O Gemini 3 lento: nunca responde, só termina quando o pedido é cancelado (como a biblioteca de verdade). */
type Seen = { signal: AbortSignal; calledAt: number; abortedAt: number | null };
function slowGemini(ref: R, seen: Seen[]) {
  return {
    name: ref.provider,
    model: ref.model,
    isMock: false,
    generate(req: any) {
      const entry: Seen = { signal: req.signal, calledAt: Date.now(), abortedAt: null };
      seen.push(entry);
      return new Promise((_, reject) => {
        req.signal?.addEventListener("abort", () => {
          entry.abortedAt = Date.now();
          reject(new Error("This operation was aborted"));
        });
      });
    },
  } as any;
}

/** A reserva responde depois de `ms` (relógio falso), guardando a hora em que terminou. */
function answeringAfter(ref: R, ms: number, done: number[]) {
  return {
    name: ref.provider,
    model: ref.model,
    isMock: false,
    generate() {
      return new Promise((resolve) =>
        setTimeout(() => {
          done.push(Date.now());
          resolve({ output: { ok: true }, provider: ref.provider, model: ref.model, inputTokens: 100, outputTokens: 100, latencyMs: ms, costUsd: null });
        }, ms),
      );
    },
  } as any;
}

/** Roda até terminar, avançando o relógio falso de 5 em 5 s (no máximo 15 min). */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.finally(() => {
    done = true;
  }).catch(() => {});
  for (let i = 0; i < 180 && !done; i++) {
    await new Promise((res) => setImmediate(res));
    await vi.advanceTimersByTimeAsync(5_000);
  }
  return p;
}

describe("maestro no site: a principal lenta não come o tempo da reserva", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Gemini 3 lento + reserva: a principal é cancelada a tempo (215 s) e a reserva responde dentro do prazo do pedido", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ primary_ref: G, fallback_ref: A });
    const seen: Seen[] = [];
    const done: number[] = [];
    const makeProviderFor = (ref: R) => (ref.provider === "gemini" ? slowGemini(ref, seen) : answeringAfter(ref, 25_000, done));
    const start = Date.now();
    const deadlineAt = start + REQUEST_BUDGET_MS;
    // como no site: a hora-limite marcada na chegada do pedido (requestDeadlineMiddleware), lida pelo maestro
    const r = await settle(withRequestDeadline(deadlineAt, () => runFunction<any>({ db, env: {} as any, makeProviderFor: makeProviderFor as any, log: () => {} }, "criacao", REQ, origin)));

    expect(seen).toHaveLength(1);
    expect(seen[0].signal.aborted).toBe(true);
    // 270 − 15 (folga) − 30 (mínimo da reserva) − 10 (gravação da linha da principal) = 215 s
    expect(seen[0].abortedAt! - seen[0].calledAt).toBe(215_000);
    expect(seen[0].abortedAt).toBe(deadlineAt - 55_000);
    expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha", "reserva:anthropic:ok"]);
    expect(logged[0].error).toMatch(/^Tempo esgotado \(215 s\)/);
    expect(r.status).toBe("ok");
    expect(r.output).toEqual({ ok: true });
    // a reserva terminou antes da hora-limite, com a folga para gravar e responder
    expect(done).toHaveLength(1);
    expect(done[0]).toBeLessThanOrEqual(deadlineAt - SAFETY);
  });

  it("sem reserva, a principal usa o prazo todo do pedido (255 s)", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ primary_ref: G });
    const seen: Seen[] = [];
    const start = Date.now();
    const r = await settle(runFunction<any>({ db, env: {} as any, deadlineAt: start + REQUEST_BUDGET_MS, makeProviderFor: ((ref: R) => slowGemini(ref, seen)) as any, log: () => {} }, "criacao", REQ, origin));
    expect(seen[0].abortedAt! - seen[0].calledAt).toBe(255_000);
    expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha"]);
    expect(r.message).toMatch(/^Tempo esgotado \(255 s\)/);
  });

  it("reserva que não pode rodar (IA desligada) não guarda tempo: a principal usa o prazo todo", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ primary_ref: G, fallback_ref: OLLAMA });
    const seen: Seen[] = [];
    const start = Date.now();
    await settle(runFunction<any>({ db, env: {} as any, deadlineAt: start + REQUEST_BUDGET_MS, makeProviderFor: ((ref: R) => slowGemini(ref, seen)) as any, log: () => {} }, "criacao", REQ, origin));
    expect(seen).toHaveLength(1);
    expect(seen[0].abortedAt! - seen[0].calledAt).toBe(255_000);
    expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha", "reserva:ollama:bloqueada"]);
  });

  it("sem tempo para as duas (55 s úteis), a principal não é recusada nem encurtada abaixo do mínimo: fica com o prazo todo", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const { db, logged } = fakeDb({ primary_ref: G, fallback_ref: A });
    const seen: Seen[] = [];
    const done: number[] = [];
    const makeProviderFor = (ref: R) => (ref.provider === "gemini" ? slowGemini(ref, seen) : answeringAfter(ref, 1_000, done));
    const start = Date.now();
    const r = await settle(runFunction<any>({ db, env: {} as any, deadlineAt: start + 70_000, makeProviderFor: makeProviderFor as any, log: () => {} }, "criacao", REQ, origin));
    expect(seen[0].abortedAt! - seen[0].calledAt).toBe(55_000);
    expect(logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`)).toEqual(["principal:gemini:falha", "reserva:anthropic:bloqueada"]);
    expect(logged[1].error).toBe("Sem tempo para chamar esta IA dentro do limite do pedido.");
    expect(done).toEqual([]);
    expect(r.status).toBe("falhou");
  });

  it("fora do site (sem prazo do pedido) nada muda: a principal fica com o tempo-limite próprio (276 s)", async () => {
    const { runFunction } = await import("../../server/ai/maestro");
    const { db } = fakeDb({ primary_ref: G, fallback_ref: A });
    const seen: Seen[] = [];
    const done: number[] = [];
    const makeProviderFor = (ref: R) => (ref.provider === "gemini" ? slowGemini(ref, seen) : answeringAfter(ref, 1_000, done));
    const start = Date.now();
    const r = await settle(runFunction<any>({ db, env: {} as any, makeProviderFor: makeProviderFor as any, log: () => {} }, "criacao", REQ, origin));
    expect(seen[0].abortedAt! - seen[0].calledAt).toBe(275_760);
    expect(r.status).toBe("ok");
    expect(done).toHaveLength(1);
  });
});
