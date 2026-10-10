// @vitest-environment node
/**
 * Busca por significado e o modo expresso do Vertex AI (falha vista em produção, 2026-10-09): dezenas de "Busca por significado: o
 * Google recusou (404)". A VERTEX_API_KEY é do modo expresso do Vertex AI, que só aceita 8 modelos de texto e imagem e nenhum de
 * busca por significado; o pedido ia para o endereço do modo expresso, sem projeto, e o Google respondia 404. Além disso, no
 * Vertex a biblioteca do Google aceita só 1 texto por pedido de vetor, e o lote de 50 trechos falhava antes de sair do servidor.
 * Agora a busca por significado escolhe o próprio caminho: Vertex AI completo pela conta de serviço (projeto e local) ou a chave do
 * AI Studio; só com a chave do modo expresso fica parada, com o motivo. Sem rede: fetch e autenticação simulados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { googleAiAccess, googleEmbeddingsAccess } from "../../server/ai/googleKey";
import {
  createEmbedder,
  EMBEDDING_DIMS,
  embeddingsClientOptions,
  embeddingsConfig,
  EmbeddingsError,
  queryEmbedding,
  type EmbedClient,
} from "../../server/contentHub/embeddings";

vi.setConfig({ testTimeout: 60_000 });

const VERTEX = "AQ.Ab8RN6" + "v".repeat(44); // chave do modo expresso (formato novo, com ponto)
const STUDIO = "AIza" + "s".repeat(35);
const ALLOW = { CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1" };
const env = (e: Record<string, string>) => ({ ...ALLOW, ...e }) as NodeJS.ProcessEnv;
const vec = (seed = 1) => Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i === 0 ? seed : 0.5));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("qual caminho do Google a busca por significado usa", () => {
  it("só com a chave do modo expresso (VERTEX_API_KEY): parada, com o motivo em português simples", () => {
    expect(googleEmbeddingsAccess({ VERTEX_API_KEY: VERTEX } as NodeJS.ProcessEnv)).toBeNull();
    const cfg = embeddingsConfig(env({ VERTEX_API_KEY: VERTEX }));
    expect(cfg.ready).toBe(false);
    expect(cfg.pending).toMatch(/modo expresso/);
    expect(cfg.pending).toMatch(/usa palavras/);
    expect(cfg.pending).not.toContain(VERTEX);
    expect(createEmbedder(cfg)).toBeNull();
  });

  it("VERTEX_API_KEY junto com a chave do AI Studio: a busca vai pelo AI Studio; a Central de IAs continua no Vertex", () => {
    const e = env({ VERTEX_API_KEY: VERTEX, GEMINI_API_KEY: STUDIO });
    expect(googleEmbeddingsAccess(e)).toEqual({ mode: "studio", key: STUDIO });
    expect(embeddingsConfig(e)).toMatchObject({ ready: true, mode: "studio", key: STUDIO, model: "gemini-embedding-2" });
    expect(googleAiAccess(e)).toEqual({ mode: "vertex", key: VERTEX });
  });

  it("com o projeto do Vertex AI completo: conta de serviço, sem chave, no local global (ou o escolhido)", () => {
    const e = env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "staziamed-revalida-prod", VERTEX_API_KEY: VERTEX, GEMINI_API_KEY: STUDIO });
    expect(googleEmbeddingsAccess(e)).toEqual({ mode: "vertex_project", project: "staziamed-revalida-prod", location: "global" });
    const cfg = embeddingsConfig(e);
    expect(cfg).toMatchObject({ ready: true, mode: "vertex_project", key: null, pending: null });
    expect(embeddingsClientOptions(cfg)).toEqual({ vertexai: true, project: "staziamed-revalida-prod", location: "global" });
    const us = embeddingsConfig(env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "p", CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION: "us" }));
    expect(embeddingsClientOptions(us)).toEqual({ vertexai: true, project: "p", location: "us" });
    // local fora da lista: volta para global
    expect(googleEmbeddingsAccess({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "p", CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION: "marte" } as NodeJS.ProcessEnv)).toMatchObject({ location: "global" });
  });

  it("AI Studio: o cliente nasce só com a chave", () => {
    expect(embeddingsClientOptions(embeddingsConfig(env({ GEMINI_API_KEY: STUDIO })))).toEqual({ apiKey: STUDIO });
  });

  it("sem acesso nenhum: a pendência diz as duas saídas", () => {
    const p = embeddingsConfig(env({})).pending!;
    expect(p).toMatch(/CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT/);
    expect(p).toMatch(/GEMINI_API_KEY/);
  });
});

describe("endereço que a biblioteca do Google monta (fetch simulado, sem rede)", () => {
  const seen: { url: string; body: any }[] = [];
  beforeEach(() => {
    seen.length = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      seen.push({ url: String(url), body });
      const payload = String(url).includes(":batchEmbedContents")
        ? { embeddings: (body?.requests ?? []).map(() => ({ values: vec() })) }
        : { embedding: { values: vec() } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    });
  });

  it("AI Studio: um pedido em lote (batchEmbedContents) no endereço do AI Studio", async () => {
    const cfg = embeddingsConfig(env({ GEMINI_API_KEY: STUDIO }));
    const client = new GoogleGenAI(embeddingsClientOptions(cfg) as any) as unknown as EmbedClient;
    const r = await createEmbedder(cfg, client)!.embedDocuments([{ text: "a" }, { text: "b" }, { text: "c" }]);
    expect(r.vectors).toHaveLength(3);
    expect(seen.map((s) => s.url)).toEqual(["https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents"]);
  });

  it("Vertex AI completo: um texto por pedido, sempre com projeto e local no endereço", async () => {
    const cfg = embeddingsConfig(env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "P" }));
    const authClient = { getRequestHeaders: async () => new Headers({ Authorization: "Bearer falso" }) };
    const client = new GoogleGenAI({ ...(embeddingsClientOptions(cfg) as any), googleAuthOptions: { authClient } }) as unknown as EmbedClient;
    const e = createEmbedder(cfg, client)!;
    const r = await e.embedDocuments([{ text: "a" }, { text: "b" }, { text: "c" }]);
    expect(r.vectors).toHaveLength(3);
    expect(seen).toHaveLength(3);
    for (const s of seen) {
      expect(s.url).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1beta1\/projects\/P\/locations\/global\/publishers\/google\/models\/gemini-embedding-2:embedContent/);
    }
    expect(await e.embedQuery("dor torácica")).toHaveLength(EMBEDDING_DIMS);
    expect(seen.every((s) => s.url.includes("/projects/"))).toBe(true);
  });
});

describe("vetores no Vertex AI: um texto por pedido, poucos ao mesmo tempo", () => {
  it("3 textos viram 3 pedidos de 1 texto, na ordem, normalizados, com no máximo 4 ao mesmo tempo", async () => {
    let live = 0;
    let peak = 0;
    const sizes: number[] = [];
    const client: EmbedClient = {
      models: {
        embedContent: async (p: any) => {
          sizes.push(p.contents.length);
          live++;
          peak = Math.max(peak, live);
          await new Promise((r) => setTimeout(r, 5));
          live--;
          const n = Number(/Trecho (\d+)/.exec(p.contents[0].parts[0].text)?.[1] ?? 0);
          return { embeddings: [{ values: vec(n + 1) }] };
        },
      },
    };
    const cfg = embeddingsConfig(env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "P" }));
    const items = Array.from({ length: 10 }, (_, i) => ({ text: `Trecho ${i}` }));
    const r = await createEmbedder(cfg, client)!.embedDocuments(items);
    expect(sizes).toEqual(new Array(10).fill(1));
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(r.vectors).toHaveLength(10);
    // na ordem: o primeiro componente cresce com o número do trecho
    const firsts = r.vectors.map((v) => v[0]);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    for (const v of r.vectors) expect(Math.hypot(...v)).toBeCloseTo(1, 6);
  });
});

describe("erro de configuração (400, 402, 403, 404): sem nova tentativa e a busca para na rodada", () => {
  it("404: uma chamada só, as seguintes nem saem, o motivo fica guardado e a mensagem não leva a chave", async () => {
    let n = 0;
    const client: EmbedClient = {
      models: {
        embedContent: async () => {
          n++;
          throw Object.assign(new Error(`Not Found ${STUDIO}`), { status: 404 });
        },
      },
    };
    const cfg = embeddingsConfig(env({ GEMINI_API_KEY: STUDIO }));
    const e = createEmbedder(cfg, client)!;
    const err = await e.embedQuery("x").catch((x) => x);
    expect(err).toBeInstanceOf(EmbeddingsError);
    expect(err.status).toBe(404);
    expect(err.message).not.toContain(STUDIO);
    expect(n).toBe(1);
    await expect(e.embedDocuments([{ text: "a" }])).rejects.toBeInstanceOf(EmbeddingsError);
    expect(n).toBe(1);
    expect(e.problem).toMatch(/404/);
    expect(e.problem).not.toContain(STUDIO);
    // a busca segue por palavras e o aviso no log sai uma vez só
    const logs: string[] = [];
    expect(await queryEmbedding(e, "y", (m) => logs.push(m))).toBeNull();
    expect(await queryEmbedding(e, "z", (m) => logs.push(m))).toBeNull();
    expect(logs).toHaveLength(0);
  });

  it("402 (sem crédito) também para; 429 e 5xx continuam tentando de novo", async () => {
    let n = 0;
    const noCredit: EmbedClient = { models: { embedContent: async () => { n++; throw Object.assign(new Error("Payment Required"), { status: 402 }); } } };
    const cfg = embeddingsConfig(env({ GEMINI_API_KEY: STUDIO }));
    const e = createEmbedder(cfg, noCredit)!;
    await expect(e.embedQuery("x")).rejects.toBeInstanceOf(EmbeddingsError);
    await expect(e.embedQuery("x")).rejects.toBeInstanceOf(EmbeddingsError);
    expect(n).toBe(1);
    let m = 0;
    const flaky: EmbedClient = {
      models: {
        embedContent: async (p: any) => {
          if (m++ === 0) throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
          return { embeddings: p.contents.map(() => ({ values: vec() })) };
        },
      },
    };
    const f = createEmbedder(cfg, flaky)!;
    expect(await f.embedQuery("x")).toHaveLength(EMBEDDING_DIMS);
    expect(m).toBe(2);
    expect(f.problem).toBeNull();
  });

  it("o relato do processamento mostra a busca parada com o motivo", async () => {
    const { probeProcessing } = await import("../../server/contentHub/capabilities");
    const client: EmbedClient = { models: { embedContent: async () => { throw Object.assign(new Error("Not Found"), { status: 404 }); } } };
    const e = createEmbedder(embeddingsConfig(env({ GEMINI_API_KEY: STUDIO })), client)!;
    await e.embedQuery("x").catch(() => undefined);
    const mock = { provider: { name: "mock", model: "mock-dev", isMock: true }, status: { ready: true, provider: "mock", model: "mock-dev", isMock: true, pending: null } };
    const report = await probeProcessing({ db: null, ai: mock, embedder: e, renderer: null } as any);
    expect(report.embeddings.ready).toBe(false);
    expect(report.embeddings.pending).toMatch(/404/);
    expect(report.pending.some((p) => p.startsWith("Busca por significado no processamento:") && /404/.test(p))).toBe(true);
  });
});
