// @vitest-environment node
/**
 * Polimento da Central de IAs, ponto 5: avisos da Verificação na Central de IAs.
 *  - Conferentes (Linha) e membros (Comitê) da Verificação não rodam no processamento (Cloud Run) nem no site: só na conferência
 *    de rascunhos, feita por comando. Os avisos "não pode rodar aqui" (Ollama no site publicado) e "sem chave neste servidor
 *    (site)" sobre eles falavam de um servidor em que eles nunca rodam. A principal e a reserva continuam com os avisos.
 *  - A principal e a reserva da Verificação também respondem na conferência de rascunhos (a principal nos papéis sem conferente;
 *    a reserva em todos), com a saída de lá: 4.096 tokens e SEM o Cuidado da função (maestroRoleProvider não passa a configuração
 *    da função). O aviso do teto por execução só conferia o perfil das etapas, com o Cuidado. Um Gemini 2.5 no Rápido tem folga
 *    de 1.024 nas etapas, mas de 8.192 na conferência de rascunhos: a chamada de lá parava no teto sem aviso.
 * Sem rede e sem banco.
 */
import { describe, expect, it } from "vitest";
import { functionChecks, validateFunctionConfig, type AiConfig, type FunctionConfig } from "../../server/ai/config";

type R = { provider: any; model: string };
const G25: R = { provider: "gemini", model: "gemini-2.5-pro" };
const OPUS: R = { provider: "anthropic", model: "claude-opus-5" };
const ASTRA: R = { provider: "openai", model: "gpt-6-astra" };
const SOL: R = { provider: "openai", model: "gpt-6.1-sol" };
const QWEN: R = { provider: "ollama", model: "qwen3" };
const PRICES = [
  { ...G25, input_per_mtok: 1.25, output_per_mtok: 10 },
  { ...OPUS, input_per_mtok: 5, output_per_mtok: 25 },
  { ...ASTRA, input_per_mtok: 10, output_per_mtok: 50 },
  { ...SOL, input_per_mtok: 2, output_per_mtok: 10 },
].map((p) => ({ ...p, source_url: "https://exemplo.com", checked_on: "2026-10-10" }));

const cfg = (settings: Partial<AiConfig["settings"]> = {}, functions: AiConfig["functions"] = {}): AiConfig =>
  ({
    providers: Object.fromEntries(["anthropic", "openai", "gemini", "ollama"].map((id) => [id, { enabled: true, models: [], status: null }])),
    functions,
    settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false, ...settings },
    prices: PRICES,
  }) as any;
const fn = (key: string, mode: string, primary: R, fallback: R | null, reviewers: R[], care: "rapido" | "caprichado" = "caprichado"): FunctionConfig =>
  ({ key, mode, primary, fallback, reviewers, care }) as any;
/** O site publicado: só a chave do Claude. */
const SITE = { NODE_ENV: "production", ANTHROPIC_API_KEY: "k".repeat(40) } as any;
const capWarnings = (w: string[]) => w.filter((m) => m.startsWith("Teto por execução") && m.includes("abaixo da estimativa de uma chamada"));

describe("Verificação: conferentes e membros não rodam no processamento nem no site", () => {
  it("Linha de produção: nada de \"não pode rodar aqui\" nem \"sem chave neste servidor\" sobre os conferentes", () => {
    const c = cfg({}, { verificacao: fn("verificacao", "linha", OPUS, null, [QWEN, G25]) });
    const check = functionChecks(c, SITE).verificacao;
    expect(check).toMatchObject({ source: "banco", ready: true, problems: [] });
    expect(check.warnings).toContain(
      "No processamento a Verificação usa só a IA principal e a reserva (sempre de outra empresa); os conferentes da Linha de produção só rodam na conferência de rascunhos feita por comando."
    );
    expect(check.warnings.join(" ")).not.toMatch(/qwen3|não pode rodar aqui|Gemini: sem chave/);
  });

  it("Comitê: o mesmo para os membros", () => {
    const c = cfg({}, { verificacao: fn("verificacao", "comite", OPUS, null, [QWEN, G25]) });
    const check = functionChecks(c, SITE).verificacao;
    expect(check.ready).toBe(true);
    expect(check.warnings.join(" ")).not.toMatch(/qwen3|não pode rodar aqui|Gemini: sem chave/);
  });

  it("a principal e a reserva continuam avisando (elas rodam no processamento)", () => {
    const c = cfg({}, { verificacao: fn("verificacao", "linha", OPUS, G25, [ASTRA]) });
    const check = functionChecks(c, SITE).verificacao;
    expect(check.warnings.filter((w) => w.startsWith("Gemini: sem chave neste servidor (site)"))).toHaveLength(1);
    expect(check.warnings.join(" ")).not.toMatch(/OpenAI: sem chave/);
  });

  it("fora da Verificação nada muda: o conferente que não roda continua com o aviso", () => {
    const c = cfg({}, { criacao: fn("criacao", "linha", OPUS, null, [QWEN]) });
    expect(functionChecks(c, SITE).criacao.warnings).toContain("Ollama qwen3 não pode rodar aqui (Ollama roda só no Mac.)");
  });
});

describe("Verificação: a principal e a reserva também são conferidas com a saída da conferência de rascunhos", () => {
  const at = (cap: number, f: FunctionConfig) => capWarnings(validateFunctionConfig(f, cfg({ caps_enabled: true, per_run_cap_usd: cap })).warnings);

  it("Gemini 2.5 Pro principal no Rápido: cabe nas etapas (folga de 1.024), não cabe na conferência de rascunhos (folga de 8.192)", () => {
    // etapas no Rápido: 7.500 × 1,25 + (8.192 + 1.024) × 10 = 0,101535; conferência de rascunhos, sem o Cuidado:
    // 5.000 × 1,25 + (4.096 + 8.192) × 10 = 0,12913
    expect(at(0.11, fn("verificacao", "sozinha", G25, null, [], "rapido"))).toEqual([
      "Teto por execução de US$ 0,11 abaixo da estimativa de uma chamada da principal Gemini gemini-2.5-pro em conferência de rascunhos (US$ 0,1291), já com a folga do raciocínio do Gemini: essa chamada para no teto sem chamar a IA. Para essa chamada rodar, o teto por execução precisa ser de pelo menos US$ 0,13.",
    ]);
    expect(at(0.13, fn("verificacao", "sozinha", G25, null, [], "rapido"))).toEqual([]);
  });

  it("a reserva também (ela socorre todos os papéis da conferência de rascunhos)", () => {
    const w = at(0.11, fn("verificacao", "sozinha", OPUS, G25, [], "rapido"));
    expect(w.filter((m) => m.includes("da reserva"))).toEqual([expect.stringContaining("da reserva Gemini gemini-2.5-pro em conferência de rascunhos (US$ 0,1291)")]);
  });

  it("no Caprichado, os dois usos que passam do teto aparecem no mesmo aviso, com o maior valor", () => {
    // etapas no Caprichado: 7.500 × 1,25 + (8.192 + 8.192) × 10 = 0,173215
    expect(at(0.12, fn("verificacao", "sozinha", G25, null, []))).toEqual([
      "Teto por execução de US$ 0,12 abaixo da estimativa de uma chamada da principal Gemini gemini-2.5-pro em etapas da Central de Conteúdo (US$ 0,1732) e conferência de rascunhos (US$ 0,1291), já com a folga do raciocínio do Gemini: essas chamadas param no teto sem chamar a IA. Para essa chamada rodar, o teto por execução precisa ser de pelo menos US$ 0,18.",
    ]);
  });

  it("com um conferente em cada um dos 3 papéis, a principal não responde na conferência de rascunhos", () => {
    const w = at(0.11, fn("verificacao", "linha", G25, null, [OPUS, ASTRA, SOL], "rapido"));
    expect(w.filter((m) => m.includes("da principal"))).toEqual([]);
  });

  it("fora da Verificação, só o perfil da função (com o Cuidado)", () => {
    expect(at(0.11, fn("assistente_conferir", "sozinha", G25, null, [], "rapido")).join(" ")).not.toMatch(/conferência de rascunhos/);
  });
});
