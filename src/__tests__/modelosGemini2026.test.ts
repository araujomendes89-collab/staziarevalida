// @vitest-environment node
/**
 * Troca dos modelos Gemini 2.5 (saem do ar em 20/10/2026, página "Model versions" do Vertex AI): padrão novo, lista do modo
 * expresso, catálogo de preços, erro em português quando o Google não acha o modelo e a migração 013580. Sem rede nem IA paga:
 * a biblioteca do Google é simulada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";

let generateContent: (args: any) => Promise<any> = async () => ({});
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: (args: any) => generateContent(args), countTokens: async () => ({ totalTokens: 1 }) };
  },
}));

import { DEFAULT_MODELS, envFallbackRef } from "../../server/ai/config";
import { VERTEX_EXPRESS_MODELS, listModels } from "../../server/ai/models";
import { PRICE_SEED } from "../../server/ai/prices";
import { GeminiProvider, geminiModelGoneError, resolveProviderKind } from "../../server/contentHub/ai/provider";
import { shouldRetrySame } from "../../server/ai/maestro";
import { CANDIDATE_MODELS } from "../../server/ai/geminiClient";
import { calculateAiCostUsd } from "../../server/ai/costCalculator";

const VERTEX = "AQ.Ab8RN6" + "v".repeat(44);
const SCHEMA = { type: "object" as const, required: ["ok"], properties: { ok: { type: "boolean" as const } } };
const REQ = { promptId: "t", promptVersion: "1", system: "s", input: "i", schema: SCHEMA, schemaName: "t" };
const RETIRED = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const ACCESS = { mode: "vertex" as const, key: VERTEX };

describe("modelos Gemini depois de 20/10/2026", () => {
  beforeEach(() => {
    delete process.env.CONTENT_HUB_GEMINI_MODEL;
  });

  it("o padrão do Gemini é o 3.8 Flash (o que o Google recomenda no lugar do 2.5 Pro), sem variável de ambiente", () => {
    expect(DEFAULT_MODELS.gemini).toBe("gemini-3.8-flash");
    expect(envFallbackRef("criacao", {} as any, "gemini")).toEqual({ provider: "gemini", model: "gemini-3.8-flash" });
    process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL = "1";
    process.env.VERTEX_API_KEY = VERTEX;
    const { status } = resolveProviderKind("gemini", undefined, undefined, { allowExternal: true });
    expect(status).toMatchObject({ ready: true, provider: "gemini", model: "gemini-3.8-flash" });
  });

  it("a variável CONTENT_HUB_GEMINI_MODEL continua mandando sobre o padrão", () => {
    expect(envFallbackRef("criacao", { CONTENT_HUB_GEMINI_MODEL: "gemini-3.5-flash" } as any, "gemini")?.model).toBe("gemini-3.5-flash");
  });

  it("a família 2.5 não é mais oferecida: nem na lista do modo expresso, nem no catálogo de preços, nem nas tentativas do caminho antigo", async () => {
    for (const m of RETIRED) {
      expect(VERTEX_EXPRESS_MODELS, m).not.toContain(m);
      expect(PRICE_SEED.find((p) => p.model === m), m).toBeUndefined();
      expect(CANDIDATE_MODELS, m).not.toContain(m);
    }
    const list = await listModels("gemini", { VERTEX_API_KEY: VERTEX } as any, vi.fn() as any);
    expect(list.models.map((m) => m.id)).toEqual(["gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]);
    expect(CANDIDATE_MODELS[0]).toBe("gemini-3.8-flash");
  });

  it("todo modelo Gemini oferecido tem preço no catálogo, com busca a US$ 0,014 por consulta", () => {
    for (const id of ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"]) {
      const p = PRICE_SEED.find((x) => x.provider === "gemini" && x.model === id);
      expect(p, id).toBeTruthy();
      expect(p!.per_search_usd, id).toBe(0.014);
    }
    // preços da página oficial do Vertex AI (global), conferidos em 17/10/2026
    const by = (m: string) => PRICE_SEED.find((x) => x.model === m)!;
    expect([by("gemini-3.8-flash").input_per_mtok, by("gemini-3.8-flash").output_per_mtok]).toEqual([0.75, 3.75]);
    expect([by("gemini-3.5-flash").input_per_mtok, by("gemini-3.5-flash").output_per_mtok]).toEqual([1.5, 9]);
    expect([by("gemini-3.1-pro-preview").input_per_mtok, by("gemini-3.1-pro-preview").output_per_mtok]).toEqual([2, 12]);
  });

  it("o cálculo do caminho antigo usa o preço certo dos modelos novos (antes caía num preço 5 vezes menor)", () => {
    expect(calculateAiCostUsd("gemini-3.8-flash", 1_000_000, 1_000_000)).toBe(4.5);
    expect(calculateAiCostUsd("gemini-3.5-flash", 1_000_000, 1_000_000)).toBe(10.5);
  });
});

describe("modelo que saiu do ar: erro em português, sem repetir e sem quebrar", () => {
  const notFound = Object.assign(new Error('{"error":{"code":404,"message":"Publisher Model `publishers/google/models/gemini-2.5-pro` was not found","status":"NOT_FOUND"}}'), { status: 404 });

  it("o Google responde 404: a mensagem diz o modelo e o que fazer, e o maestro não repete a mesma IA (vai para a reserva)", async () => {
    generateContent = async () => {
      throw notFound;
    };
    const err: any = await new GeminiProvider(ACCESS, "gemini-2.5-pro").generate(REQ).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/O Google não encontrou o modelo gemini-2\.5-pro/);
    expect(err.message).toMatch(/Central de IAs/);
    expect(err.message).not.toMatch(/NOT_FOUND|Publisher Model/);
    expect(err.status).toBe(404);
    expect(shouldRetrySame(err)).toBe(false);
  });

  it("também na chamada com busca na internet", async () => {
    generateContent = async () => {
      throw notFound;
    };
    const err: any = await new GeminiProvider(ACCESS, "gemini-2.5-flash").generate({ ...REQ, webSearch: { maxSearches: 2, allowedDomains: [] } as any }).catch((e) => e);
    expect(err.message).toMatch(/não encontrou o modelo gemini-2\.5-flash/);
  });

  it("outros erros passam como estão (limite, chave, cancelamento)", () => {
    const limite = Object.assign(new Error("RESOURCE_EXHAUSTED quota exceeded"), { status: 429 });
    expect(geminiModelGoneError(limite, "gemini-3.8-flash")).toBe(limite);
    const chave = Object.assign(new Error("API key not valid"), { status: 400 });
    expect(geminiModelGoneError(chave, "gemini-3.8-flash")).toBe(chave);
    expect(geminiModelGoneError("texto", "x")).toBe("texto");
    expect(geminiModelGoneError(null, "x")).toBeNull();
  });

  it("o modelo novo funciona no provedor: pede ao Google o nome certo e devolve a resposta", async () => {
    const seen: any[] = [];
    generateContent = async (args) => {
      seen.push(args);
      return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, candidates: [{ finishReason: "STOP" }] };
    };
    const r = await new GeminiProvider(ACCESS, "gemini-3.8-flash").generate<{ ok: boolean }>(REQ);
    expect(r.output).toEqual({ ok: true });
    expect(r.model).toBe("gemini-3.8-flash");
    expect(seen[0].model).toBe("gemini-3.8-flash");
    // Gemini 3: raciocínio por nível (nunca orçamento), que o 3.x recusa
    expect(JSON.stringify(seen[0].config.thinkingConfig ?? {})).not.toMatch(/thinkingBudget/);
  });
});

describe("migração 013580 (troca só o nome do modelo)", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003013580_modelos_gemini_25_saem.sql"), "utf8");
  it("troca os três modelos 2.5, atualiza a lista do Gemini (só se já existir) e não mexe em preços", () => {
    expect(sql).toMatch(/'gemini-2\.5-pro' then 'gemini-3\.8-flash'/);
    expect(sql).toMatch(/'gemini-2\.5-flash' then 'gemini-3\.8-flash'/);
    expect(sql).toMatch(/'gemini-2\.5-flash-lite' then 'gemini-3\.1-flash-lite'/);
    expect(sql).toMatch(/jsonb_array_length\(models\) > 0/);
    expect(sql).not.toMatch(/ai_model_prices\s*(\(|set)/i);
    expect(sql).not.toMatch(/insert into/i);
    expect(sql).not.toMatch(/delete /i);
  });
  it("a lista nova do Gemini é igual à que o código monta ao atualizar", async () => {
    const list = await listModels("gemini", { VERTEX_API_KEY: VERTEX } as any, vi.fn() as any);
    const fromSql = [...sql.matchAll(/\{"id": "(gemini-[^"]+)"/g)].map((m) => m[1]);
    expect(fromSql).toEqual(list.models.map((m) => m.id));
  });
});
