// @vitest-environment node
/**
 * Gemini pelo Vertex AI (decisão do dono, 2026-10-09): a chave do AI Studio é pré-paga e acabou; o Vertex cobra na conta do
 * projeto do Google Cloud. Com VERTEX_API_KEY, a Central de IAs e a busca por significado usam o Vertex com essa chave (no site
 * e no processamento); sem ela, seguem com GEMINI_API_KEY (AI Studio). Sem rede: a biblioteca do Google é simulada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const made: Record<string, unknown>[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async () => ({ text: JSON.stringify({ ok: true }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } }),
      embedContent: async ({ contents }: { contents: unknown[] }) => ({ embeddings: contents.map(() => ({ values: Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)) })) }),
    };
    constructor(opts: Record<string, unknown>) {
      made.push(opts);
    }
  },
}));

import { googleAiAccess, googleGenAiOptions, GOOGLE_KEY_MISSING } from "../../server/ai/googleKey";
import { resolveProviderKind } from "../../server/contentHub/ai/provider";
import { createEmbedder, embeddingsConfig } from "../../server/contentHub/embeddings";
import { keyPending } from "../../server/ai/config";
import { listModels } from "../../server/ai/models";
import { PRICE_SEED } from "../../server/ai/prices";

const VERTEX = "AQ.Ab8RN6" + "v".repeat(44); // formato novo de chave do Google (com ponto), 53 caracteres
const STUDIO = "AIza" + "s".repeat(35);
const saved = { ...process.env };
beforeEach(() => {
  made.length = 0;
  for (const k of ["VERTEX_API_KEY", "GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY", "CONTENT_HUB_AI_ALLOW_EXTERNAL", "CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL", "CONTENT_HUB_EMBEDDINGS_MODEL", "CONTENT_LAB_ENABLED"]) delete process.env[k];
});
afterEach(() => {
  process.env = { ...saved };
});

describe("qual chave do Google vale", () => {
  it("VERTEX_API_KEY manda: modo Vertex, mesmo com GEMINI_API_KEY presente", () => {
    expect(googleAiAccess({ VERTEX_API_KEY: VERTEX, GEMINI_API_KEY: STUDIO })).toEqual({ mode: "vertex", key: VERTEX });
    expect(googleGenAiOptions({ mode: "vertex", key: VERTEX })).toEqual({ vertexai: true, apiKey: VERTEX });
  });
  it("sem a do Vertex, a do AI Studio (GEMINI_API_KEY ou GOOGLE_GEMINI_API_KEY)", () => {
    expect(googleAiAccess({ GEMINI_API_KEY: STUDIO })).toEqual({ mode: "studio", key: STUDIO });
    expect(googleAiAccess({ GOOGLE_GEMINI_API_KEY: STUDIO })).toEqual({ mode: "studio", key: STUDIO });
    expect(googleGenAiOptions({ mode: "studio", key: STUDIO })).toEqual({ apiKey: STUDIO });
  });
  it("texto de exemplo, curto ou vazio não vale (cai na seguinte ou em nenhuma)", () => {
    expect(googleAiAccess({ VERTEX_API_KEY: "your_vertex_key_here_000000000000000", GEMINI_API_KEY: STUDIO })).toEqual({ mode: "studio", key: STUDIO });
    expect(googleAiAccess({ VERTEX_API_KEY: "curta", GEMINI_API_KEY: "MY_GEMINI_KEY" })).toBeNull();
    expect(googleAiAccess({})).toBeNull();
  });
});

describe("Central de IAs: provedor Gemini", () => {
  it("com VERTEX_API_KEY cria o Gemini no modo Vertex", async () => {
    process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL = "1";
    process.env.VERTEX_API_KEY = VERTEX;
    process.env.GEMINI_API_KEY = STUDIO;
    const { provider, status } = resolveProviderKind("gemini", undefined, "gemini-2.5-flash", { allowExternal: true });
    expect(status).toMatchObject({ ready: true, provider: "gemini", model: "gemini-2.5-flash" });
    expect(made.at(-1)).toEqual({ vertexai: true, apiKey: VERTEX });
    const out = await provider!.generate({ promptId: "t", promptVersion: "1", system: "s", input: "i", schema: { type: "object", properties: { ok: { type: "boolean" } } }, schemaName: "t" });
    expect(out.output).toEqual({ ok: true });
  });
  it("só com GEMINI_API_KEY segue no AI Studio, como antes", () => {
    process.env.GEMINI_API_KEY = STUDIO;
    resolveProviderKind("gemini", undefined, "gemini-2.5-pro", { allowExternal: true });
    expect(made.at(-1)).toEqual({ apiKey: STUDIO });
  });
  it("sem chave nenhuma: pendência que fala das duas variáveis", () => {
    expect(resolveProviderKind("gemini", undefined, "gemini-2.5-pro", { allowExternal: true }).status.pending).toBe(GOOGLE_KEY_MISSING);
    expect(GOOGLE_KEY_MISSING).toMatch(/VERTEX_API_KEY/);
    expect(GOOGLE_KEY_MISSING).toMatch(/GEMINI_API_KEY/);
    expect(keyPending("gemini", {})).toBe(GOOGLE_KEY_MISSING);
    expect(keyPending("gemini", { VERTEX_API_KEY: VERTEX })).toBeNull();
  });
});

describe("busca por significado", () => {
  it("com VERTEX_API_KEY a busca fica pronta e o cliente nasce no modo Vertex", async () => {
    const env = { CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", VERTEX_API_KEY: VERTEX } as NodeJS.ProcessEnv;
    const cfg = embeddingsConfig(env);
    expect(cfg).toMatchObject({ ready: true, model: "gemini-embedding-2", key: VERTEX, mode: "vertex", pending: null });
    const embedder = createEmbedder(cfg)!;
    expect((await embedder.embedQuery("dor torácica")).length).toBe(768);
    expect(made.at(-1)).toEqual({ vertexai: true, apiKey: VERTEX });
  });
  it("sem chave nenhuma: a pendência fala da VERTEX_API_KEY", () => {
    expect(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1" } as NodeJS.ProcessEnv).pending).toMatch(/VERTEX_API_KEY/);
  });
});

describe("lista de modelos do Gemini no modo Vertex", () => {
  it("devolve os modelos Gemini com preço cadastrado, sem chamar a internet", async () => {
    const fetchImpl = vi.fn();
    const list = await listModels("gemini", { VERTEX_API_KEY: VERTEX } as NodeJS.ProcessEnv, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(list.status).toBe("pronta");
    expect(list.detail).toMatch(/Vertex/);
    expect(list.models.map((m) => m.id).sort()).toEqual(PRICE_SEED.filter((p) => p.provider === "gemini").map((p) => p.model).sort());
  });
});
