// @vitest-environment node
/**
 * IA01 (Administração › Central de IAs): os tetos de gasto nascem desligados e, desligados, nenhuma IA da Central tem limite em
 * dólares. A correção NÃO liga teto com valor inventado e NÃO mexe na configuração gravada (um teto errado pararia as IAs do site).
 * O servidor entrega à tela o que ajuda a escolher: o valor mínimo do teto por chamada para nenhuma função parar com as IAs de hoje,
 * calculado pelos preços cadastrados e pelas chamadas típicas (capGuidance), e a rota /overview o traz junto do painel.
 * Sem rede e sem banco de verdade: configuração em memória e banco falso.
 */
import express from "express";
import type http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { capGuidance, invalidateAiConfig, typicalCallEstimate, TYPICAL_CALLS, type AiConfig } from "../../server/ai/config";
import { createAiRouter } from "../../server/ai/router";

type R = { provider: any; model: string };
const G35: R = { provider: "gemini", model: "gemini-3.5-flash" };
const OPUS: R = { provider: "anthropic", model: "claude-opus-5" };
const QWEN: R = { provider: "ollama", model: "qwen3" };
const PRICES = [
  { ...G35, input_per_mtok: 1.5, output_per_mtok: 9 },
  { ...OPUS, input_per_mtok: 5, output_per_mtok: 25 },
].map((p) => ({ ...p, source_url: "https://exemplo.com", checked_on: "2026-10-11" }));

const fn = (key: string, primary: R | null, fallback: R | null = null) => ({ key, mode: "sozinha", primary, fallback, reviewers: [], care: "caprichado" }) as any;
const cfg = (functions: any[], prices: any[] = PRICES, settings: Partial<AiConfig["settings"]> = {}): AiConfig =>
  ({
    providers: Object.fromEntries(["anthropic", "openai", "gemini", "ollama"].map((id) => [id, { enabled: true, models: [], status: null }])),
    functions: Object.fromEntries(functions.map((f) => [f.key, f])),
    settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false, ...settings },
    prices,
  }) as any;

/** Duas tentativas da principal mais a reserva, na pior chamada típica da função (a conta do aviso da tela). */
const need = (key: any, p: R, r: R | null) => {
  const price = (x: R) => PRICES.find((q) => q.provider === x.provider && q.model === x.model) ?? null;
  return Math.max(...TYPICAL_CALLS[key as keyof typeof TYPICAL_CALLS].map((c) => 2 * typicalCallEstimate(p, price(p), c, "caprichado") + (r ? typicalCallEstimate(r, price(r), c, "caprichado") : 0)));
};
const up = (n: number) => Math.ceil(Number((n * 100).toFixed(6))) / 100;

describe("capGuidance: o valor mínimo do teto por chamada, calculado e não inventado", () => {
  it("Criação com Gemini e reserva Claude: duas tentativas da principal mais a reserva no pior uso (Podcasts), arredondado para cima no centavo", () => {
    const g = capGuidance(cfg([fn("criacao", G35, OPUS)]), {} as any);
    const exact = need("criacao", G35, OPUS);
    expect(exact).toBeCloseTo(1.2329, 3);
    expect(g.by_function).toEqual([{ key: "criacao", min_usd: up(exact) }]);
    expect(g.by_function[0].min_usd).toBe(1.24);
    expect(g.per_call_min_usd).toBe(1.24);
  });

  it("sem reserva é o dobro da principal; o maior entre as funções vale para o painel", () => {
    const g = capGuidance(cfg([fn("criacao", G35, OPUS), fn("engenharia_reversa", OPUS), fn("assistente_conferir", G35)]), {} as any);
    expect(g.by_function.map((x) => x.key)).toEqual(["criacao", "engenharia_reversa", "assistente_conferir"]);
    expect(g.by_function[1].min_usd).toBe(up(need("engenharia_reversa", OPUS, null)));
    expect(g.by_function[2].min_usd).toBe(up(need("assistente_conferir", G35, null)));
    expect(g.per_call_min_usd).toBe(Math.max(...g.by_function.map((x) => x.min_usd)));
  });

  it("função sem preço, só Ollama ou sem IA principal não entra (custo desconhecido ou zero: nada a sugerir)", () => {
    const g = capGuidance(cfg([fn("criacao", QWEN), fn("verificacao", OPUS, QWEN), fn("engenharia_reversa", null)], PRICES.slice(1)), {} as any);
    expect(g.by_function.map((x) => x.key)).toEqual(["verificacao"]);
    // Ollama de reserva custa zero: só as duas tentativas da principal
    expect(g.by_function[0].min_usd).toBe(up(need("verificacao", OPUS, null)));
    const none = capGuidance(cfg([fn("criacao", QWEN)]), {} as any);
    expect(none).toEqual({ per_call_min_usd: null, by_function: [] });
    // modelo sem preço: ignora
    expect(capGuidance(cfg([fn("criacao", G35, OPUS)], []), {} as any)).toEqual({ per_call_min_usd: null, by_function: [] });
  });

  it("função sem configuração salva usa as variáveis do servidor (IA e reserva)", () => {
    const env = { CONTENT_HUB_AI_PROVIDER: "gemini", CONTENT_HUB_GEMINI_MODEL: "gemini-3.5-flash", CONTENT_HUB_AI_FALLBACK_PROVIDER: "anthropic", CONTENT_HUB_ANTHROPIC_MODEL: "claude-opus-5" } as any;
    const g = capGuidance(cfg([]), env);
    const criacao = g.by_function.find((x) => x.key === "criacao")!;
    // sem o Cuidado da função, as variáveis valem como no aviso da tela
    expect(criacao.min_usd).toBeGreaterThan(0);
    expect(g.per_call_min_usd).toBeGreaterThanOrEqual(criacao.min_usd);
  });
});

describe("a rota /overview traz o guia de valores, e nada é ligado nem gravado", () => {
  let server: http.Server;
  let base = "";
  const writes: string[] = [];
  const db = {
    mode: "dev",
    async authenticate() {
      return { id: "00000000-0000-4000-8000-0000000000ad", email: "ad@t.dev" };
    },
    async asUser(_user: unknown, name: string) {
      if (name === "app_ch_whoami") return { admin: true, staff: true };
      if (name === "app_admin_ai_overview") return { providers: [], functions: [], settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false }, prices: [], month_spend: 0 };
      throw new Error(`função inesperada: ${name}`);
    },
    async service(name: string) {
      if (name === "ch_worker_ai_config") {
        return {
          providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: true, models: [], last_status: null })),
          functions: [{ key: "criacao", mode: "sozinha", primary_ref: G35, fallback_ref: OPUS, reviewers: [], care: "caprichado" }],
          settings: { caps_enabled: false, monthly_cap_usd: null, per_run_cap_usd: null, tab_override_enabled: false },
          prices: PRICES,
        };
      }
      writes.push(name);
      throw new Error(`gravação inesperada: ${name}`);
    },
  } as any;

  beforeAll(async () => {
    invalidateAiConfig(db);
    await new Promise<void>((resolve) => {
      const app = express();
      app.use("/api/ai-central", createAiRouter({ db }, { env: {} as any }));
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${(server.address() as any).port}/api/ai-central`;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("cap_guidance vem no painel e a configuração gravada continua como estava (tetos desligados, sem valores)", async () => {
    const j = await (await fetch(base + "/overview")).json();
    expect(j.cap_guidance).toEqual({ per_call_min_usd: 1.24, by_function: [{ key: "criacao", min_usd: 1.24 }] });
    expect(j.settings).toMatchObject({ caps_enabled: false, monthly_cap_usd: null, per_run_cap_usd: null });
    expect(writes).toEqual([]);
  });
});
