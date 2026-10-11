// @vitest-environment node
/**
 * Revisão rodada 3, ponto 4: a Central de IAs avisa ANTES quando o teto por chamada salvo é menor que a estimativa de uma
 * chamada típica da função (já com a folga do raciocínio do Gemini), para o dono não descobrir só quando o Podcast para.
 * A estimativa é a mesma que o maestro usa para barrar a chamada (pior caso: entrada em caracteres ÷ 4 e a saída máxima
 * mandada). Chamadas típicas, pelo código de cada uso: etapas da Central de Conteúdo (8.192 de saída), Aulas (6.000; até
 * 80 mil caracteres de material), Podcasts (16.000; até 120 mil caracteres), Questões (12.000) e assistentes (6.000; até
 * 60 mil caracteres de material). Sem rede e sem banco.
 */
import { describe, expect, it } from "vitest";
import { functionChecks, TYPICAL_CALLS, typicalCallEstimate, validateFunctionConfig, type AiConfig, type FunctionConfig } from "../../server/ai/config";
import { AiInvalidOutput } from "../../server/contentHub/ai/provider";

type R = { provider: any; model: string };
const G31: R = { provider: "gemini", model: "gemini-3.1-pro-preview" };
const G35: R = { provider: "gemini", model: "gemini-3.5-flash" };
const G25: R = { provider: "gemini", model: "gemini-2.5-pro" };
const OPUS: R = { provider: "anthropic", model: "claude-opus-5" };
const ASTRA: R = { provider: "openai", model: "gpt-6-astra" };
const PRICES = [
  { ...G31, input_per_mtok: 2, output_per_mtok: 12 },
  { ...G35, input_per_mtok: 1.5, output_per_mtok: 9 },
  { ...G25, input_per_mtok: 1.25, output_per_mtok: 10 },
  { ...OPUS, input_per_mtok: 5, output_per_mtok: 25 },
  { ...ASTRA, input_per_mtok: 10, output_per_mtok: 50 },
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
const capWarnings = (w: string[]) => w.filter((m) => m.startsWith("Teto por chamada"));
/** Avisos de uma chamada sozinha (cada IA). */
const single = (w: string[]) => capWarnings(w).filter((m) => m.includes("abaixo da estimativa de uma tentativa"));
/** Avisos da soma: a reserva ou a nova tentativa depois de uma falha cobrada da principal (revisão rodada 4). */
const chain = (w: string[]) => capWarnings(w).filter((m) => !m.includes("abaixo da estimativa de uma tentativa"));

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

describe("aviso do teto por chamada", () => {
  it("Podcasts acima do teto: aviso da principal e da reserva, com a estimativa e o valor para essa chamada rodar", () => {
    const c = cfg({ per_run_cap_usd: 0.4 });
    const w = single(validateFunctionConfig(fn("criacao", G31, OPUS), c).warnings);
    // rodada 4: o valor de uma chamada sozinha não promete mais "para não parar" (a soma vem no aviso da reserva)
    expect(w).toEqual([
      "Teto por chamada de US$ 0,4 abaixo da estimativa de uma tentativa da principal Gemini gemini-3.1-pro-preview em Podcasts (US$ 0,4511), já com a folga do raciocínio do Gemini: essa tentativa para no teto sem chamar a IA. Para essa tentativa rodar, o teto por chamada precisa ser de pelo menos US$ 0,46.",
      "Teto por chamada de US$ 0,4 abaixo da estimativa de uma tentativa da reserva Claude claude-opus-5 em Podcasts (US$ 0,5563): essa tentativa para no teto sem chamar a IA. Para essa tentativa rodar, o teto por chamada precisa ser de pelo menos US$ 0,56.",
    ]);
  });

  it("vários usos acima do teto: um aviso por IA, com cada uso e o maior valor", () => {
    const c = cfg({ per_run_cap_usd: 0.2 });
    const [w] = single(validateFunctionConfig(fn("criacao", OPUS), c).warnings);
    expect(w).toMatch(/^Teto por chamada de US\$ 0,2 abaixo da estimativa de uma tentativa da principal Claude claude-opus-5 em /);
    expect(w).toContain("etapas da Central de Conteúdo (US$ 0,2423)");
    // rodada 5: o Claude manda no mínimo 8.192 de saída; Aulas (6.000 pedidos) = 21.250 × 5 + 8.192 × 25 = 0,31105
    expect(w).toContain("Aulas (US$ 0,311)");
    expect(w).toContain("Podcasts (US$ 0,5563)");
    expect(w).toMatch(/pelo menos US\$ 0,56\.$/);
  });

  it("assistente com o gemini-2.5-pro: o teto de US$ 0,10 não cabe a chamada com a folga de 8.192", () => {
    const c = cfg({ per_run_cap_usd: 0.1 });
    const w = single(validateFunctionConfig(fn("assistente_conferir", G25), c).warnings);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("principal Gemini gemini-2.5-pro em assistentes (US$ 0,1638), já com a folga do raciocínio do Gemini");
    // no Rápido a folga cai para 1.024 e a chamada cabe
    expect(single(validateFunctionConfig(fn("assistente_conferir", G25, null, "rapido"), c).warnings)).toEqual([]);
  });

  // revisão rodada 5, ponto 2: conferentes e membros só rodam na conferência de rascunhos da Verificação (maestroRoleProvider);
  // fora dela o uso real chama só a principal e a reserva, e o aviso mandava subir o teto por uma chamada que não existe
  it("fora da Verificação, conferentes da Linha e membros do Comitê não entram no aviso (não são chamados)", () => {
    // cenário da revisão: Criação em Linha, principal gemini-3.5-flash, conferente gpt-6-astra, teto de US$ 0,45
    const w = validateFunctionConfig(fn("criacao", G35, null, "caprichado", "linha", [ASTRA]), cfg({ per_run_cap_usd: 0.45 })).warnings;
    expect(w).toContain("Nesta etapa a função usa só a IA principal e a reserva: os conferentes da Linha de produção ainda não rodam.");
    expect(capWarnings(w).filter((m) => m.includes("conferente"))).toEqual([]);
    expect(capWarnings(w).some((m) => m.includes("1,12"))).toBe(false);
    const m = validateFunctionConfig(fn("criacao", G35, null, "caprichado", "comite", [OPUS]), cfg({ per_run_cap_usd: 0.4 })).warnings;
    expect(capWarnings(m).filter((x) => x.includes("membro"))).toEqual([]);
    // a principal continua conferida, e cabe: gemini-3.5-flash nos Podcasts = 31.250 × 1,5 + 32.384 × 9 = 0,3383, abaixo de 0,40
    expect(single(m)).toEqual([]);
  });

  it("na Verificação, conferentes da Linha usam o perfil da conferência de rascunhos: 4.096 de saída, sem o Cuidado da função", () => {
    const at = (cap: number, reviewer: R, care: "rapido" | "caprichado" = "caprichado") =>
      single(validateFunctionConfig(fn("verificacao", OPUS, null, care, "linha", [reviewer]), cfg({ per_run_cap_usd: cap })).warnings).filter((m) => m.includes("conferente"));
    // gpt-6-astra: 20.000 caracteres = 5.000 tokens × 10 + 4.096 × 50 = 0,2548 (o perfil das etapas pedia 0,4846, quase o dobro)
    expect(at(0.2, ASTRA)).toEqual([
      "Teto por chamada de US$ 0,2 abaixo da estimativa de uma tentativa do conferente OpenAI gpt-6-astra em conferência de rascunhos (US$ 0,2548): essa tentativa para no teto sem chamar a IA. Para essa tentativa rodar, o teto por chamada precisa ser de pelo menos US$ 0,26.",
    ]);
    expect(at(0.26, ASTRA)).toEqual([]);
    // a conferência de rascunhos não leva o Cuidado: no Rápido, o gemini-2.5-pro conferente ainda tem a folga de 8.192
    // (5.000 × 1,25 + 12.288 × 10 = 0,1291), não a de 1.024 do Rápido (que daria 0,1015 nas etapas)
    expect(at(0.11, G25, "rapido")).toEqual([expect.stringContaining("do conferente Gemini gemini-2.5-pro em conferência de rascunhos (US$ 0,1291), já com a folga do raciocínio do Gemini")]);
  });

  it("na Verificação em Comitê, os membros também usam o perfil da conferência de rascunhos", () => {
    const w = single(validateFunctionConfig(fn("verificacao", OPUS, null, "caprichado", "comite", [ASTRA]), cfg({ per_run_cap_usd: 0.2 })).warnings);
    expect(w.filter((m) => m.includes("membro"))).toEqual([expect.stringContaining("do membro OpenAI gpt-6-astra em conferência de rascunhos (US$ 0,2548)")]);
  });

  it("teto que cabe, tetos desligados ou sem teto por chamada: nenhum aviso", () => {
    // 1,46 cabe também a nova tentativa e a reserva nos Podcasts: 2 × 0,4511 + 0,5563 = 1,4585
    for (const settings of [{ per_run_cap_usd: 1.46 }, { per_run_cap_usd: 0.1, caps_enabled: false }, { per_run_cap_usd: null }]) {
      expect(capWarnings(validateFunctionConfig(fn("criacao", G31, OPUS), cfg(settings)).warnings)).toEqual([]);
    }
  });

  it("o aviso aparece na situação da função (functionChecks), que o editor da função mostra", () => {
    const c = cfg({ per_run_cap_usd: 0.4 }, { criacao: fn("criacao", G31, OPUS) });
    const checks = functionChecks(c, { VERTEX_API_KEY: "AQ." + "x".repeat(50), ANTHROPIC_API_KEY: "k".repeat(40) } as any);
    expect(checks.criacao.ready).toBe(true);
    expect(single(checks.criacao.warnings)).toHaveLength(2);
    expect(chain(checks.criacao.warnings)).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ revisão rodada 4: a soma da principal com a reserva

/**
 * Revisão rodada 4, pontos 2 e 4: desde a rodada 3 a nova tentativa e a reserva passam pelo teto por chamada com o gasto real
 * da falha. Uma resposta cortada custa quase a estimativa inteira, e um tempo esgotado grava a estimativa inteira. O aviso
 * conferia cada IA sozinha: com cada chamada cabendo, a reserva era barrada sem aviso; e o "pelo menos" da reserva (a chamada
 * sozinha) não deixava a reserva socorrer. Agora o aviso soma a principal e a reserva (e a nova tentativa).
 */
describe("aviso do teto por chamada: a soma da principal com a reserva (rodada 4)", () => {
  it("cenário da revisão: Conferir com gemini-3.5-flash e reserva claude-opus-5, teto de US$ 0,30: cada uma cabe sozinha, mas a reserva não socorre", () => {
    // gemini-3.5-flash: 17.500 × 1,5 + (6.000 + 16.384) × 9 = 0,227706; claude-opus-5: 17.500 × 5 + 8.192 × 25 = 0,2923 (rodada 5:
    // o provedor do Claude manda no mínimo 8.192 de saída, não os 6.000 pedidos)
    const w = validateFunctionConfig(fn("assistente_conferir", G35, OPUS), cfg({ per_run_cap_usd: 0.3 })).warnings;
    expect(single(w)).toEqual([]);
    expect(chain(w)).toEqual([
      "Teto por chamada de US$ 0,3 abaixo da principal Gemini gemini-3.5-flash mais a reserva Claude claude-opus-5 em assistentes (US$ 0,52), já com a folga do raciocínio do Gemini: depois de uma falha cobrada da principal (resposta cortada ou tempo esgotado), a reserva não socorre e o trabalho falha. Para a reserva socorrer, o teto por chamada precisa ser de pelo menos US$ 0,53; para socorrer também depois da nova tentativa (resposta fora do formato), pelo menos US$ 0,75.",
    ]);
  });

  it("cenário da revisão: Criação com gemini-3.5-flash e reserva claude-opus-5; os US$ 0,56 da chamada sozinha não bastam", () => {
    const at = (cap: number) => validateFunctionConfig(fn("criacao", G35, OPUS), cfg({ per_run_cap_usd: cap })).warnings;
    // 0,40: a reserva sozinha não cabe nos Podcasts, e depois de uma falha a reserva não socorre em nenhum uso
    expect(single(at(0.4))).toEqual([expect.stringContaining("da reserva Claude claude-opus-5 em Podcasts (US$ 0,5563)")]);
    expect(chain(at(0.4))).toEqual([
      "Teto por chamada de US$ 0,4 abaixo da principal Gemini gemini-3.5-flash mais a reserva Claude claude-opus-5 em etapas da Central de Conteúdo (US$ 0,4747), Aulas (US$ 0,5444) e Podcasts (US$ 0,8946), já com a folga do raciocínio do Gemini: depois de uma falha cobrada da principal (resposta cortada ou tempo esgotado), a reserva não socorre e o trabalho falha. Para a reserva socorrer, o teto por chamada precisa ser de pelo menos US$ 0,90; para socorrer também depois da nova tentativa (resposta fora do formato), pelo menos US$ 1,24.",
    ]);
    // 0,56 (o valor que a tela sugeria): o aviso da chamada sozinha some, o da soma continua
    expect(single(at(0.56))).toEqual([]);
    expect(chain(at(0.56))).toEqual([expect.stringMatching(/^Teto por chamada de US\$ 0,56 abaixo da principal .* em Podcasts \(US\$ 0,8946\).*pelo menos US\$ 0,90;.*pelo menos US\$ 1,24\.$/)]);
    // 0,90: a reserva socorre um corte; a nova tentativa antes dela ainda não cabe nos Podcasts
    expect(chain(at(0.9))).toEqual([
      "Teto por chamada de US$ 0,9 abaixo de duas tentativas da principal Gemini gemini-3.5-flash mais a reserva Claude claude-opus-5 em Podcasts (US$ 1,2329), já com a folga do raciocínio do Gemini: depois de uma resposta fora do formato e da nova tentativa, a reserva não socorre e o trabalho falha. Para não parar no teto por chamada, o teto precisa ser de pelo menos US$ 1,24.",
    ]);
    expect(capWarnings(at(1.24))).toEqual([]);
  });

  it("sem reserva: a nova tentativa depois de uma falha cobrada também passa pelo teto", () => {
    // Questões com o claude-opus-5: 2.000 × 5 + 12.000 × 25 = 0,31 por chamada
    const at = (cap: number) => validateFunctionConfig(fn("engenharia_reversa", OPUS), cfg({ per_run_cap_usd: cap })).warnings;
    expect(chain(at(0.4))).toEqual([
      "Teto por chamada de US$ 0,4 abaixo de duas tentativas da principal Claude claude-opus-5 em Questões (US$ 0,62): depois de uma falha cobrada da principal (resposta fora do formato), a nova tentativa não roda e o trabalho falha. Para não parar no teto por chamada, o teto precisa ser de pelo menos US$ 0,62.",
    ]);
    expect(capWarnings(at(0.62))).toEqual([]);
  });

  it("função sem configuração salva: a reserva das variáveis (CONTENT_HUB_AI_FALLBACK_PROVIDER) entra na soma", () => {
    const env = {
      CONTENT_HUB_AI_PROVIDER_CREATE: "gemini",
      CONTENT_HUB_MODEL_CREATE: "gemini-3.5-flash",
      CONTENT_HUB_AI_FALLBACK_PROVIDER: "anthropic",
      CONTENT_HUB_ANTHROPIC_MODEL: "claude-opus-5",
      VERTEX_API_KEY: "AQ." + "x".repeat(50),
      ANTHROPIC_API_KEY: "k".repeat(40),
    } as any;
    const checks = functionChecks(cfg({ per_run_cap_usd: 0.3 }), env);
    expect(chain(checks.assistente_conferir.warnings)).toEqual([expect.stringContaining("abaixo da principal Gemini gemini-3.5-flash mais a reserva Claude claude-opus-5 em assistentes (US$ 0,52)")]);
  });
});

// ------------------------------------------------------------------ o valor do aviso confere com o maestro

type Settings = Record<string, unknown>;
/** Banco falso: a configuração da Central e o registro (ai_calls) em memória. */
function fakeDb(f: { key: string; primary_ref: R; fallback_ref: R | null }, settings: Settings) {
  const logged: any[] = [];
  const db = {
    mode: "dev",
    async service(name: string, args: any) {
      if (name === "ch_worker_ai_config") {
        return {
          providers: ["anthropic", "openai", "gemini", "ollama"].map((id) => ({ id, enabled: id !== "ollama", models: [], last_status: null })),
          functions: [{ mode: "sozinha", reviewers: [], care: "caprichado", ...f }],
          settings: { caps_enabled: true, monthly_cap_usd: 100, tab_override_enabled: false, ...settings },
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

/** O "pelo menos" do aviso: [para a reserva socorrer, para socorrer também depois da nova tentativa]. */
function suggested(w: string): number[] {
  return [...w.matchAll(/pelo menos US\$ (\d+,\d+)/g)].map((m) => Number(m[1].replace(",", ".")));
}

/**
 * Conferir com o gemini-3.5-flash e reserva claude-opus-5, chamada típica (70 mil caracteres, 6.000 de saída). A principal falha
 * com a saída inteira (corte ou fora do formato, custo real igual à estimativa); a reserva responde.
 */
async function conferir(cap: number, failure: "cortada" | "formato") {
  const { runFunction } = await import("../../server/ai/maestro");
  const { db, logged } = fakeDb({ key: "assistente_conferir", primary_ref: G35, fallback_ref: OPUS }, { per_run_cap_usd: cap });
  const usage = { inputTokens: 17_500, outputTokens: 6000 + 16_384 };
  const makeProviderFor = (ref: R) =>
    ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate() {
        if (ref.provider === "gemini") {
          throw failure === "cortada"
            ? new AiInvalidOutput("Resposta cortada pelo limite de saída.", null, { usage, reason: "cortada" })
            : new AiInvalidOutput("Resposta fora do formato: ok ausente", "{}", { usage, reason: "formato" });
        }
        return { output: { ok: true }, provider: ref.provider, model: ref.model, inputTokens: 17_500, outputTokens: 6000, latencyMs: 1, costUsd: null };
      },
    }) as any;
  const req = { promptId: "t", promptVersion: "1", system: "s", input: "x".repeat(69_999), schema: { type: "object" as const }, schemaName: "teste", maxOutputTokens: 6000 };
  const r = await runFunction<any>({ db, env: {} as any, makeProviderFor: makeProviderFor as any, log: () => {} }, "assistente_conferir", req, { source: "assistente", itemId: null, actorId: null });
  return { status: r.status, rows: logged.map((l) => `${l.role}:${l.provider}:${l.outcome}`) };
}

describe("o valor do aviso deixa a reserva socorrer de verdade (maestro)", () => {
  it("com o valor sugerido a reserva socorre o corte e a nova tentativa; um centavo abaixo, não", async () => {
    const [w] = chain(validateFunctionConfig(fn("assistente_conferir", G35, OPUS), cfg({ per_run_cap_usd: 0.3 })).warnings);
    const [rescue, full] = suggested(w);
    expect([rescue, full]).toEqual([0.53, 0.75]);

    expect(await conferir(rescue, "cortada")).toEqual({ status: "ok", rows: ["principal:gemini:falha", "reserva:anthropic:ok"] });
    expect(await conferir(rescue - 0.01, "cortada")).toEqual({ status: "falhou", rows: ["principal:gemini:falha", "reserva:anthropic:teto"] });

    expect(await conferir(full, "formato")).toEqual({ status: "ok", rows: ["principal:gemini:falha", "principal:gemini:falha", "reserva:anthropic:ok"] });
    expect(await conferir(full - 0.01, "formato")).toEqual({ status: "falhou", rows: ["principal:gemini:falha", "principal:gemini:falha", "reserva:anthropic:teto"] });
  });
});
