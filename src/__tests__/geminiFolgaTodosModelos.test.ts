// @vitest-environment node
/**
 * Revisão rodada 3, ponto 1: folga de saída e Cuidado "Rápido" para TODOS os Gemini que pensam, por regra de prefixo.
 * Antes, só "gemini-2.5-pro" e "gemini-2.5-flash" (nome exato) e "gemini-3..." ganhavam a folga; o 2.5 Flash-Lite e os nomes com
 * versão (gemini-2.5-flash-preview-09-2025) ou apelido (gemini-flash-latest) ficavam sem folga e continuavam sendo cortados.
 * Página oficial "Thinking" do Vertex AI (conferida em 10/10/2026): 2.5 Pro, 2.5 Flash e 2.5 Flash-Lite pensam por padrão
 * ("Auto, up to 8,192 tokens") e aceitam só thinking_budget (Flash-Lite: 512 a 24.576); Gemini 3 e seguintes aceitam só
 * thinking_level (todos os de texto aceitam LOW); os de imagem têm níveis próprios. Página "Thinking" do AI Studio: os apelidos
 * "-latest" trocam de modelo a cada lançamento, e thinking_level vale para o 2.5 e para o 3.
 * Sem rede: a biblioteca do Google é simulada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const generated: any[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (args: any) => {
        generated.push(args);
        return { text: '{"ok":true}', candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
      },
    };
  },
}));

import { geminiOutputLimit, geminiThinking, geminiThinkingReserve, resolveProviderKind } from "../../server/contentHub/ai/provider";

const VERTEX = "AQ.Ab8RN6" + "v".repeat(44);
const SCHEMA = { type: "object" as const, required: ["ok"], properties: { ok: { type: "boolean" as const } } };
const REQ = { promptId: "t", promptVersion: "1", system: "s", input: "i", schema: SCHEMA, schemaName: "t", maxOutputTokens: 6000 };

function gemini(model: string) {
  const saved = process.env.VERTEX_API_KEY;
  process.env.VERTEX_API_KEY = VERTEX;
  try {
    return resolveProviderKind("gemini", undefined, model, { allowExternal: true }).provider!;
  } finally {
    if (saved === undefined) delete process.env.VERTEX_API_KEY;
    else process.env.VERTEX_API_KEY = saved;
  }
}

beforeEach(() => {
  generated.length = 0;
});

describe("família 2.5 inteira (orçamento de raciocínio)", () => {
  const FAMILY_25 = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-preview-09-2025",
    "gemini-2.5-flash-lite-preview-09-2025",
    "gemini-2.5-pro-preview-06-05",
    "models/gemini-2.5-flash-lite",
    " Gemini-2.5-Flash-Lite ",
  ];

  it.each(FAMILY_25)("%s: folga de 8.192 no Caprichado e 1.024 no Rápido, com o orçamento de 1.024", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(8192);
    expect(geminiThinkingReserve(model, undefined)).toBe(8192);
    expect(geminiThinkingReserve(model, "rapido")).toBe(1024);
    expect(geminiThinking(model, "rapido")).toEqual({ thinkingBudget: 1024 });
    expect(geminiThinking(model, "caprichado")).toBeNull();
    expect(geminiOutputLimit(model, "caprichado", 6000)).toBe(14192);
  });

  it("o provedor manda a folga e o orçamento ao 2.5 Flash-Lite (antes ia só o pedido, e ele pensa até 8.192 no Vertex)", async () => {
    await gemini("gemini-2.5-flash-lite").generate({ ...REQ, care: "rapido" });
    expect(generated[0].config.maxOutputTokens).toBe(7024);
    expect(generated[0].config.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    await gemini("gemini-2.5-flash-lite").generate({ ...REQ, care: "caprichado" });
    expect(generated[1].config.maxOutputTokens).toBe(14192);
    expect(generated[1].config).not.toHaveProperty("thinkingConfig");
    await gemini("gemini-2.5-flash-preview-09-2025").generate(REQ);
    expect(generated[2].config.maxOutputTokens).toBe(14192);
  });
});

describe("família 3 (nível de raciocínio), menos os de imagem", () => {
  const FAMILY_3 = ["gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"];

  it.each(FAMILY_3)("%s: folga de 16.384 nos dois Cuidados; Rápido com nível baixo", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(16_384);
    expect(geminiThinkingReserve(model, "rapido")).toBe(16_384);
    expect(geminiThinking(model, "rapido")).toEqual({ thinkingLevel: "LOW" });
    expect(geminiThinking(model, "caprichado")).toBeNull();
  });
});

describe("apelidos -latest (o modelo por trás muda a cada lançamento)", () => {
  it.each(["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"])("%s: a maior folga (16.384) e o nível baixo no Rápido", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(16_384);
    expect(geminiThinkingReserve(model, "rapido")).toBe(16_384);
    expect(geminiThinking(model, "rapido")).toEqual({ thinkingLevel: "LOW" });
    expect(geminiThinking(model, "caprichado")).toBeNull();
  });

  it("o provedor manda a folga ao gemini-flash-latest", async () => {
    await gemini("gemini-flash-latest").generate({ ...REQ, care: "rapido" });
    expect(generated[0].config.maxOutputTokens).toBe(6000 + 16_384);
    expect(generated[0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });
});

describe("modelos que não pensam ou não são de texto: nada muda", () => {
  it.each([
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-2.5-flash-preview-tts",
    "gemini-3.8-flash-tts",
    "gemini-embedding-2",
    "gemini-2.0-flash",
    "gemma-3-27b-it",
  ])("%s: sem folga e sem ajuste de raciocínio", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(0);
    expect(geminiThinkingReserve(model, "rapido")).toBe(0);
    expect(geminiThinking(model, "rapido")).toBeNull();
    expect(geminiOutputLimit(model, "caprichado", 4000)).toBe(4000);
  });
});
