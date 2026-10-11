// @vitest-environment node
/**
 * Revisão rodada 3, ponto 1: folga de saída e Cuidado "Rápido" para TODOS os Gemini que pensam, por regra de prefixo.
 * Antes, só "gemini-2.5-pro" e "gemini-2.5-flash" (nome exato) e "gemini-3..." ganhavam a folga; o 2.5 Flash-Lite e os nomes com
 * versão (gemini-2.5-flash-preview-09-2025) ou apelido (gemini-flash-latest) ficavam sem folga e continuavam sendo cortados.
 * Página oficial "Thinking" do Vertex AI (conferida em 10/10/2026): 2.5 Pro, 2.5 Flash e 2.5 Flash-Lite pensam por padrão
 * ("Auto, up to 8,192 tokens") e aceitam só thinking_budget (Flash-Lite: 512 a 24.576); Gemini 3 e seguintes aceitam só
 * thinking_level (todos os de texto aceitam LOW); os de imagem têm níveis próprios. Página "Thinking" do AI Studio: os apelidos
 * "-latest" trocam de modelo a cada lançamento, e thinking_level vale para o 2.5 e para o 3.
 * Revisão rodada 5, ponto 3: o Rápido nunca aumenta o raciocínio. Os Gemini 3 Flash-Lite têm padrão MINIMAL (menor que o LOW do
 * Rápido) e ficam no padrão; o 2.5 Flash-Lite, que pelo AI Studio não pensa por padrão, recebe orçamento 0 (desligado).
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
  const FAMILY_25 = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-preview-09-2025", "gemini-2.5-pro-preview-06-05"];

  it.each(FAMILY_25)("%s: folga de 8.192 no Caprichado e 1.024 no Rápido, com o orçamento de 1.024", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(8192);
    expect(geminiThinkingReserve(model, undefined)).toBe(8192);
    expect(geminiThinkingReserve(model, "rapido")).toBe(1024);
    expect(geminiThinking(model, "rapido")).toEqual({ thinkingBudget: 1024 });
    expect(geminiThinking(model, "caprichado")).toBeNull();
    expect(geminiOutputLimit(model, "caprichado", 6000)).toBe(14192);
  });

  // revisão rodada 5, ponto 3: pelo AI Studio o 2.5 Flash-Lite não pensa por padrão, e o orçamento de 1.024 do Rápido ligava o
  // raciocínio. No Vertex AI ele pensa sozinho ("Auto, até 8.192"). Orçamento 0 desliga o raciocínio nos dois (página "Thinking"
  // do Vertex AI: "0 turns off thinking" no 2.5 Flash e no Flash-Lite; biblioteca do Google: "0 is DISABLED"): o Rápido nunca
  // pensa mais que o padrão
  const FLASH_LITE_25 = ["gemini-2.5-flash-lite", "gemini-2.5-flash-lite-preview-09-2025", "models/gemini-2.5-flash-lite", " Gemini-2.5-Flash-Lite "];

  it.each(FLASH_LITE_25)("%s: folga de 8.192 no Caprichado; no Rápido, raciocínio desligado (orçamento 0) e sem folga", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(8192);
    expect(geminiThinkingReserve(model, undefined)).toBe(8192);
    expect(geminiThinkingReserve(model, "rapido")).toBe(0);
    expect(geminiThinking(model, "rapido")).toEqual({ thinkingBudget: 0 });
    expect(geminiThinking(model, "caprichado")).toBeNull();
    expect(geminiOutputLimit(model, "caprichado", 6000)).toBe(14192);
    expect(geminiOutputLimit(model, "rapido", 6000)).toBe(6000);
  });

  it("o provedor manda a folga ao 2.5 Flash-Lite no Caprichado e desliga o raciocínio dele no Rápido", async () => {
    await gemini("gemini-2.5-flash-lite").generate({ ...REQ, care: "rapido" });
    expect(generated[0].config.maxOutputTokens).toBe(6000);
    expect(generated[0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    await gemini("gemini-2.5-flash-lite").generate({ ...REQ, care: "caprichado" });
    expect(generated[1].config.maxOutputTokens).toBe(14192);
    expect(generated[1].config).not.toHaveProperty("thinkingConfig");
    await gemini("gemini-2.5-flash-preview-09-2025").generate(REQ);
    expect(generated[2].config.maxOutputTokens).toBe(14192);
  });
});

describe("família 3 (nível de raciocínio), menos os de imagem", () => {
  const FAMILY_3 = ["gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.8-flash"];

  it.each(FAMILY_3)("%s: folga de 16.384 nos dois Cuidados; Rápido com nível baixo", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(16_384);
    expect(geminiThinkingReserve(model, "rapido")).toBe(16_384);
    expect(geminiThinking(model, "rapido")).toEqual({ thinkingLevel: "LOW" });
    expect(geminiThinking(model, "caprichado")).toBeNull();
  });

  // revisão rodada 5, ponto 3: página "Thinking" do Vertex AI, tabela "Supported thinking levels by model" (conferida em
  // 10/10/2026): o Gemini 3.5 Flash-Lite e o 3.1 Flash-Lite têm padrão MINIMAL, o menor nível. O nível LOW do Rápido aumentava o
  // raciocínio deles. Agora o Rápido não manda nível a eles (fica o padrão MINIMAL, igual ao Caprichado)
  it.each(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite-preview", "models/gemini-3.5-flash-lite"])(
    "%s: padrão MINIMAL; o Rápido não manda nível (não aumenta o raciocínio); folga de 16.384",
    (model) => {
      expect(geminiThinkingReserve(model, "caprichado")).toBe(16_384);
      expect(geminiThinkingReserve(model, "rapido")).toBe(16_384);
      expect(geminiThinking(model, "rapido")).toBeNull();
      expect(geminiThinking(model, "caprichado")).toBeNull();
    },
  );

  it("o provedor não manda nível ao gemini-3.5-flash-lite no Rápido; o gemini-3.5-flash continua com LOW", async () => {
    await gemini("gemini-3.5-flash-lite").generate({ ...REQ, care: "rapido" });
    expect(generated[0].config.maxOutputTokens).toBe(6000 + 16_384);
    expect(generated[0].config).not.toHaveProperty("thinkingConfig");
    await gemini("gemini-3.5-flash").generate({ ...REQ, care: "rapido" });
    expect(generated[1].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });
});

describe("apelidos -latest (o modelo por trás muda a cada lançamento)", () => {
  it.each(["gemini-flash-latest", "gemini-pro-latest"])("%s: a maior folga (16.384) e o nível baixo no Rápido", (model) => {
    expect(geminiThinkingReserve(model, "caprichado")).toBe(16_384);
    expect(geminiThinkingReserve(model, "rapido")).toBe(16_384);
    expect(geminiThinking(model, "rapido")).toEqual({ thinkingLevel: "LOW" });
    expect(geminiThinking(model, "caprichado")).toBeNull();
  });

  it("gemini-flash-lite-latest: a maior folga, mas o Rápido não manda nível (o Flash-Lite já pensa o mínimo ou nada por padrão)", () => {
    expect(geminiThinkingReserve("gemini-flash-lite-latest", "rapido")).toBe(16_384);
    expect(geminiThinking("gemini-flash-lite-latest", "rapido")).toBeNull();
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

describe("texto do Cuidado no editor da função (rodada 5)", () => {
  it("não promete menos raciocínio ao Flash-Lite que já pensa o mínimo por padrão", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.join(__dirname, "../novo/app/admin/ai/FunctionEditor.jsx"), "utf8").replace(/\s+/g, " ");
    expect(src).not.toContain("inclusive o Flash-Lite");
    expect(src).toContain("o Gemini 2.5 Flash-Lite deixa de pensar");
    expect(src).toContain("Os Gemini 3 Flash-Lite já pensam o mínimo por padrão e não mudam");
  });
});
