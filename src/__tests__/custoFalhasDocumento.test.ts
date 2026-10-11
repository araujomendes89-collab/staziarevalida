// @vitest-environment node
/**
 * Polimento da Central de IAs, ponto 2: o custo das tentativas que falharam não chegava ao custo do documento da Central de
 * Conteúdo. O maestro grava cada tentativa em ai_calls, mas a etapa só registrava em ch_ai_runs (e somava nas métricas do
 * trabalho, que a tela do documento mostra) a resposta que deu certo. Uma principal cortada pelo limite de saída (cobrada) antes
 * da reserva sumia do custo do documento; quando todas falhavam, a linha da falha ia sem tokens e sem custo.
 * Agora cada tentativa que falhou vira uma linha em ch_ai_runs, com a IA que falhou, os tokens e o custo, e entra nas métricas.
 * Sem rede e sem banco de verdade: provedores falsos e banco falso em memória.
 */
import { describe, expect, it } from "vitest";
import { AiInvalidOutput } from "../../server/contentHub/ai/provider";
import { runJob, type Job } from "../../server/contentHub/pipeline";

type R = { provider: any; model: string };
const G35: R = { provider: "gemini", model: "gemini-3.5-flash" };
const OPUS: R = { provider: "anthropic", model: "claude-opus-5" };
const PRICES = [
  { ...G35, input_per_mtok: 1.5, output_per_mtok: 9 },
  { ...OPUS, input_per_mtok: 5, output_per_mtok: 25 },
].map((p) => ({ ...p, source_url: "https://exemplo.com", checked_on: "2026-10-10" }));

const BLOCKS = [
  { id: "b1", page_no: 1, idx: 0, type: "heading", status: "extracted", text: "Bronquiolite viral aguda" },
  { id: "b2", page_no: 1, idx: 1, type: "paragraph", status: "extracted", text: "Na bronquiolite, a oxigenoterapia começa com saturação abaixo de 92%." },
];
const CLASSIFIED = { area_codes: [], node_ids: [], suggestions: [], population: "", care_setting: "" };

/** Banco falso: a configuração da Central de IAs e o que a etapa de classificação lê e grava. */
function fakeDb() {
  const runs: any[] = [];
  const finished: any[] = [];
  const calls: any[] = [];
  const db = {
    mode: "dev",
    async service(name: string, args: any) {
      switch (name) {
        case "ch_worker_ai_config":
          return {
            providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
            functions: [{ key: "criacao", mode: "sozinha", primary_ref: G35, fallback_ref: OPUS, reviewers: [], care: "caprichado" }],
            settings: { caps_enabled: false, monthly_cap_usd: null, per_run_cap_usd: null, tab_override_enabled: false },
            prices: PRICES,
          };
        case "ch_worker_ai_log_calls":
          calls.push(...args.p_calls);
          return null;
        case "ch_worker_flag":
          return true;
        case "ch_worker_register_prompt":
          return false;
        case "ch_worker_cached_run":
          return null;
        case "ch_worker_log_ai_run":
          runs.push(args.p_run);
          return "id";
        case "ch_worker_catalog":
          return { version: 1, nodes: [] };
        case "ch_worker_blocks":
          return BLOCKS;
        case "ch_worker_finish":
          finished.push(args);
          return args.p_ok ? "succeeded" : "queued";
        case "ch_worker_document_meta":
        case "ch_worker_checkpoint":
        case "ch_worker_classify_blocks":
        case "ch_worker_next":
          return 0;
        default:
          throw new Error(`função inesperada: ${name}`);
      }
    },
    async asUser() {
      throw new Error("inesperado");
    },
    async authenticate() {
      return null;
    },
  } as any;
  return { db, runs, finished, calls };
}

const job = (): Job => ({ id: "job-1", document_id: "doc-1", step: "classify", scope_key: "document", versions: {}, attempts: 0, max_attempts: 3, checkpoint: {} });

/** A principal (Gemini) é cortada pelo limite de saída, com os tokens cobrados; a reserva (Claude) responde ou fica fora do formato. */
function providers(reserve: "ok" | "formato") {
  return (ref: R) =>
    ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate() {
        if (ref.provider === "gemini") {
          throw new AiInvalidOutput("Resposta cortada pelo limite de saída (raciocínio usou 16384 de 24576 tokens).", null, { usage: { inputTokens: 7000, outputTokens: 24_576 }, reason: "cortada" });
        }
        if (reserve === "formato") throw new AiInvalidOutput("Resposta fora do formato: area_codes ausente", { outro: 1 }, { usage: { inputTokens: 7000, outputTokens: 8192 }, reason: "formato" });
        return { output: CLASSIFIED, provider: ref.provider, model: ref.model, inputTokens: 7000, outputTokens: 300, latencyMs: 1, costUsd: null };
      },
    }) as any;
}

const deps = (db: any, reserve: "ok" | "formato") =>
  ({ db, storage: {} as any, ai: { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "sem IA" } }, aiMaker: providers(reserve), log: () => {} }) as any;

// gemini-3.5-flash cortado: 7.000 × 1,5 + 24.576 × 9, por milhão; claude-opus-5: 7.000 × 5 + 300 × 25 (ou 8.192 × 25 fora do formato)
const GEMINI_CUT = (7000 * 1.5 + 24_576 * 9) / 1e6;
const CLAUDE_OK = (7000 * 5 + 300 * 25) / 1e6;
const CLAUDE_BAD = (7000 * 5 + 8192 * 25) / 1e6;

describe("custo das tentativas que falharam no documento da Central de Conteúdo", () => {
  it("principal cortada e reserva que responde: as duas em ch_ai_runs e no custo do trabalho", async () => {
    const { db, runs, finished, calls } = fakeDb();
    const r = await runJob(deps(db, "ok"), job());
    expect(r.status).toBe("succeeded");
    // o maestro já registrava as duas em ai_calls
    expect(calls.map((c) => `${c.role}:${c.provider}:${c.outcome}`)).toEqual(["principal:gemini:falha", "reserva:anthropic:ok"]);

    expect(runs.map((x) => `${x.status}:${x.provider}:${x.model}`)).toEqual(["invalid_output:gemini:gemini-3.5-flash", "ok:anthropic:claude-opus-5"]);
    expect(runs[0]).toMatchObject({ step: "classify", prompt_id: "classify", input_tokens: 7000, output_tokens: 24_576 });
    expect(runs[0].cost_usd).toBeCloseTo(GEMINI_CUT, 9);
    expect(runs[0].error).toMatch(/^Resposta cortada pelo limite de saída/);
    expect(runs[0].input_hash).toBe(runs[1].input_hash);
    expect(runs[1].cost_usd).toBeCloseTo(CLAUDE_OK, 9);

    const m = finished[0].p_metrics;
    expect(finished[0].p_ok).toBe(true);
    expect(m.cost_usd).toBeCloseTo(GEMINI_CUT + CLAUDE_OK, 9);
    expect(m.input_tokens).toBe(14_000);
    expect(m.output_tokens).toBe(24_576 + 300);
    expect(m.ai_calls).toBe(2);
  });

  it("todas falham: uma linha por tentativa, com a IA, os tokens, o custo e o que veio; o custo fica no trabalho que falhou", async () => {
    const { db, runs, finished } = fakeDb();
    const r = await runJob(deps(db, "formato"), job());
    expect(r.status).toBe("queued");

    expect(runs.map((x) => `${x.status}:${x.provider}:${x.model}`)).toEqual(["invalid_output:gemini:gemini-3.5-flash", "invalid_output:anthropic:claude-opus-5"]);
    expect(runs[0].cost_usd).toBeCloseTo(GEMINI_CUT, 9);
    expect(runs[1]).toMatchObject({ input_tokens: 7000, output_tokens: 8192, output: { raw: JSON.stringify({ outro: 1 }) } });
    expect(runs[1].cost_usd).toBeCloseTo(CLAUDE_BAD, 9);
    expect(runs[1].error).toMatch(/^Resposta fora do formato/);

    const m = finished[0].p_metrics;
    expect(finished[0].p_ok).toBe(false);
    expect(m.cost_usd).toBeCloseTo(GEMINI_CUT + CLAUDE_BAD, 9);
    expect(m.input_tokens).toBe(14_000);
    expect(m.output_tokens).toBe(24_576 + 8192);
    expect(m.ai_calls).toBe(2);
  });
});
