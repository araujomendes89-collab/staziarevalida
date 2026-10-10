// @vitest-environment node
/**
 * Revisão rodada 3, ponto 4: a Central de IAs avisa ANTES quando o teto por execução salvo é menor que a estimativa de uma
 * chamada típica da função (já com a folga do raciocínio do Gemini), para o dono não descobrir só quando o Podcast para.
 * A estimativa é a mesma que o maestro usa para barrar a chamada (pior caso: entrada em caracteres ÷ 4 e a saída máxima
 * mandada). Chamadas típicas, pelo código de cada uso: etapas da Central de Conteúdo (8.192 de saída), Aulas (6.000; até
 * 80 mil caracteres de material), Podcasts (16.000; até 120 mil caracteres), Questões (12.000) e assistentes (6.000; até
 * 60 mil caracteres de material). Sem rede e sem banco.
 */
import { describe, expect, it } from "vitest";
import { functionChecks, TYPICAL_CALLS, typicalCallEstimate, validateFunctionConfig, type AiConfig, type FunctionConfig } from "../../server/ai/config";

type R = { provider: any; model: string };
const G31: R = { provider: "gemini", model: "gemini-3.1-pro-preview" };
const G35: R = { provider: "gemini", model: "gemini-3.5-flash" };
const G25: R = { provider: "gemini", model: "gemini-2.5-pro" };
const OPUS: R = { provider: "anthropic", model: "claude-opus-5" };
const PRICES = [
  { ...G31, input_per_mtok: 2, output_per_mtok: 12 },
  { ...G35, input_per_mtok: 1.5, output_per_mtok: 9 },
  { ...G25, input_per_mtok: 1.25, output_per_mtok: 10 },
  { ...OPUS, input_per_mtok: 5, output_per_mtok: 25 },
].map((p) => ({ ...p, source_url: "https://exemplo.com", checked_on: "2026-10-10" }));

const cfg = (settings: Partial<AiConfig["settings"]>, functions: AiConfig["functions"] = {}): AiConfig =>
  ({
    providers: Object.fromEntries(["anthropic", "openai", "gemini", "ollama"].map((id) => [id, { enabled: id !== "ollama", models: [], status: null }])),
    functions,
    settings: { monthly_cap_usd: 100, per_run_cap_usd: null, caps_enabled: true, tab_override_enabled: false, ...settings },
    prices: PRICES,
  }) as any;
const fn = (key: string, primary: R, fallback: R | null = null, care: "rapido" | "caprichado" = "caprichado", mode = "sozinha", reviewers: R[] = []): FunctionConfig =>
  ({ key, mode, primary, fallback, reviewers, care }) as any;
const capWarnings = (w: string[]) => w.filter((m) => m.startsWith("Teto por execução"));

describe("chamadas típicas", () => {
  it("cada função tem os usos de verdade, com a saída pedida no código", () => {
    const uses = (k: string) => TYPICAL_CALLS[k as keyof typeof TYPICAL_CALLS].map((u) => `${u.use}:${u.maxOut}`);
    expect(uses("criacao")).toEqual(["etapas da Central de Conteúdo:8192", "Aulas:6000", "Podcasts:16000"]);
    expect(uses("verificacao")).toEqual(["etapas da Central de Conteúdo:8192"]);
    expect(uses("engenharia_reversa")).toEqual(["Questões:12000"]);
    for (const k of ["assistente_preencher", "assistente_conferir", "assistente_revisar"]) expect(uses(k)).toEqual(["assistentes:6000"]);
  });

  it("estimativa = a do maestro: Podcasts no gemini-3.1-pro-preview com a folga de 16.384", () => {
    // entrada 125.000 caracteres = 31.250 tokens × 2 + (16.000 + 16.384) × 12, por milhão
    const podcasts = TYPICAL_CALLS.criacao.find((u) => u.use === "Podcasts")!;
    expect(typicalCallEstimate(G31 as any, PRICES[0] as any, podcasts, "caprichado")).toBeCloseTo((31_250 * 2 + 32_384 * 12) / 1e6, 6);
  });
});

describe("aviso do teto por execução", () => {
  it("Podcasts acima do teto: aviso da principal e da reserva, com a estimativa e o valor que cabe", () => {
    const c = cfg({ per_run_cap_usd: 0.4 });
    const w = capWarnings(validateFunctionConfig(fn("criacao", G31, OPUS), c).warnings);
    expect(w).toEqual([
      "Teto por execução de US$ 0,4 abaixo da estimativa de uma chamada da principal Gemini gemini-3.1-pro-preview em Podcasts (US$ 0,4511), já com a folga do raciocínio do Gemini: essa chamada para no teto sem chamar a IA. Para não parar, o teto por execução precisa ser de pelo menos US$ 0,46.",
      "Teto por execução de US$ 0,4 abaixo da estimativa de uma chamada da reserva Claude claude-opus-5 em Podcasts (US$ 0,5563): essa chamada para no teto sem chamar a IA. Para não parar, o teto por execução precisa ser de pelo menos US$ 0,56.",
    ]);
  });

  it("vários usos acima do teto: um aviso por IA, com cada uso e o maior valor", () => {
    const c = cfg({ per_run_cap_usd: 0.2 });
    const [w] = capWarnings(validateFunctionConfig(fn("criacao", OPUS), c).warnings);
    expect(w).toMatch(/^Teto por execução de US\$ 0,2 abaixo da estimativa de uma chamada da principal Claude claude-opus-5 em /);
    expect(w).toContain("etapas da Central de Conteúdo (US$ 0,2423)");
    expect(w).toContain("Aulas (US$ 0,2562)");
    expect(w).toContain("Podcasts (US$ 0,5563)");
    expect(w).toMatch(/pelo menos US\$ 0,56\.$/);
  });

  it("assistente com o gemini-2.5-pro: o teto de US$ 0,10 não cabe a chamada com a folga de 8.192", () => {
    const c = cfg({ per_run_cap_usd: 0.1 });
    const w = capWarnings(validateFunctionConfig(fn("assistente_conferir", G25), c).warnings);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("principal Gemini gemini-2.5-pro em assistentes (US$ 0,1638), já com a folga do raciocínio do Gemini");
    // no Rápido a folga cai para 1.024 e a chamada cabe
    expect(capWarnings(validateFunctionConfig(fn("assistente_conferir", G25, null, "rapido"), c).warnings)).toEqual([]);
  });

  it("conferentes da Linha e membros do Comitê também são conferidos, cada um como uma chamada", () => {
    const c = cfg({ per_run_cap_usd: 0.3 });
    const w = capWarnings(validateFunctionConfig(fn("verificacao", OPUS, null, "caprichado", "linha", [G31]), c).warnings);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("do conferente Gemini gemini-3.1-pro-preview em etapas da Central de Conteúdo");
    const m = capWarnings(validateFunctionConfig(fn("criacao", G35, null, "caprichado", "comite", [OPUS]), cfg({ per_run_cap_usd: 0.4 })).warnings);
    expect(m).toEqual([expect.stringContaining("do membro Claude claude-opus-5 em Podcasts (US$ 0,5563)")]);
  });

  it("teto que cabe, tetos desligados ou sem teto por execução: nenhum aviso", () => {
    for (const settings of [{ per_run_cap_usd: 1 }, { per_run_cap_usd: 0.1, caps_enabled: false }, { per_run_cap_usd: null }]) {
      expect(capWarnings(validateFunctionConfig(fn("criacao", G31, OPUS), cfg(settings)).warnings)).toEqual([]);
    }
  });

  it("o aviso aparece na situação da função (functionChecks), que o editor da função mostra", () => {
    const c = cfg({ per_run_cap_usd: 0.4 }, { criacao: fn("criacao", G31, OPUS) });
    const checks = functionChecks(c, { VERTEX_API_KEY: "AQ." + "x".repeat(50), ANTHROPIC_API_KEY: "k".repeat(40) } as any);
    expect(checks.criacao.ready).toBe(true);
    expect(capWarnings(checks.criacao.warnings)).toHaveLength(2);
  });
});
