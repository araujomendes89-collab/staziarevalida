// @vitest-environment node
/**
 * Fontes oficiais com IA, parte da IA. "Provedores": a busca na internet em cada provedor (Claude, OpenAI, Gemini; o Ollama
 * recusa), o JSON que a IA deixa no fim do texto e a conversão curta, sem busca, quando esse JSON não serve. "Central": a
 * função "Busca de fontes oficiais" (`busca_fontes`) da Central de IAs: desligada sem configuração, só modo sozinha e sem
 * Ollama, preço por busca nas estimativas, nos tetos e no registro de chamadas. Clientes e `fetch` falsos: nenhum teste
 * chama IA real nem a internet.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "fs";
import type http from "http";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";
import { PRICE_SEED, SEARCH_RESULT_TOKENS, costUsd, estimateCostUsd } from "../../server/ai/prices";
import {
  DEFAULT_MAX_SEARCHES,
  FUNCTION_KEYS,
  envFallbackRef,
  functionChecks,
  invalidateAiConfig,
  isSearchFunction,
  loadAiConfig,
  refProblems,
  SEARCH_NO_GEMINI,
  validateFunctionConfig,
  type ModelRef,
} from "../../server/ai/config";
import { runFunction } from "../../server/ai/maestro";
import { createAiRouter } from "../../server/ai/router";
import { AiInvalidOutput, AnthropicProvider, GeminiProvider, anthropicSearchTool, partialUsageOf, withUsage, type StructuredRequest, type StructuredResult } from "../../server/contentHub/ai/provider";
import { OpenAIProvider } from "../../server/contentHub/ai/openai";
import { OllamaProvider } from "../../server/contentHub/ai/ollama";
import { asDocument } from "../../server/contentHub/ai/prompts";
import { CONVERT_SYSTEM, MAX_CONTINUATIONS, extractTrailingJson, hostsOf, ownError, parseOrConvert } from "../../server/contentHub/ai/webSearch";

vi.setConfig({ testTimeout: 120_000 });

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Esquema pequeno no feitio da resposta da busca: uma lista de documentos e uma observação. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentos"],
  properties: {
    documentos: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["titulo", "link"], properties: { titulo: { type: "string" }, link: { type: "string" } } },
    },
    observacao: { type: "string" },
  },
} as const;
const RESULT = { documentos: [{ titulo: "PCDT Hepatite C", link: "https://www.gov.br/saude/pcdt.pdf" }], observacao: "ok" };
/** Fim de resposta como a IA deve deixar: o JSON dentro de um bloco ```json. */
const FENCED = `Achei o documento.\n\`\`\`json\n${JSON.stringify(RESULT)}\n\`\`\``;
const SEARCH = { allowedDomains: ["gov.br/saude"], maxSearches: 4 };
const req = (over: Partial<StructuredRequest> = {}): StructuredRequest => ({
  promptId: "source_search",
  promptVersion: "1",
  system: "sistema",
  input: "pedido",
  schema: SCHEMA as any,
  schemaName: "source_search",
  maxOutputTokens: 4000,
  effort: "low",
  webSearch: SEARCH,
  ...over,
});

// ---------------------------------------------------------------- clientes falsos

/**
 * Cliente da Anthropic que guarda uma CÓPIA dos parâmetros de cada chamada (e o sinal de cancelamento que veio nas opções) e
 * devolve as respostas na ordem (um Error na lista é a chamada que falha; uma função é uma resposta calculada na hora).
 */
function fakeAnthropic(replies: any[]) {
  const calls: any[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const client = {
    messages: {
      create: async (p: any, opts?: { signal?: AbortSignal }) => {
        calls.push(JSON.parse(JSON.stringify(p)));
        signals.push(opts?.signal);
        const reply = replies[calls.length - 1];
        if (!reply) throw new Error(`resposta ${calls.length} não preparada no teste`);
        if (reply instanceof Error) throw reply;
        return typeof reply === "function" ? reply(p, opts) : reply;
      },
    },
  };
  return { client, calls, signals };
}

/**
 * Uma chamada que não termina: fica pendente até o sinal disparar e então falha como o `fetch` (com o motivo do sinal). Sem
 * sinal na chamada falha na hora, e com sinal que nunca dispara falha em 300 ms: o teste mostra que o cancelamento não chegou.
 */
function hangUntilAborted(signal?: AbortSignal | null): Promise<never> {
  if (!signal) return Promise.reject(new Error("a chamada não recebeu o sinal de cancelamento"));
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const late = setTimeout(() => reject(new Error("o cancelamento não chegou à chamada")), 300);
    signal.addEventListener("abort", () => { clearTimeout(late); reject(signal.reason); }, { once: true });
  });
}
/** Resposta que dispara o cancelamento ao chegar: o tempo-limite de quem chamou estoura logo depois da chamada. */
const thenAbort = (ac: AbortController, reply: unknown) => () => {
  ac.abort(new Error("Tempo esgotado (teste)."));
  return reply;
};
/** Espera a condição valer (a chamada em andamento aparecer nos registros). */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  if (!cond()) throw new Error("a condição do teste nunca valeu");
}
const claudeMsg = (over: Record<string, unknown> = {}) => ({
  model: "claude-sonnet-5-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: FENCED }],
  usage: { input_tokens: 100, output_tokens: 20, server_tool_use: { web_search_requests: 1 } },
  ...over,
});
/** Uma busca da Claude: o pedido do servidor e o resultado, com os links vistos. */
const searchBlocks = (id: string, urls: string[]) => [
  { type: "server_tool_use", id: `srv_${id}`, name: "web_search", input: { query: `consulta ${id}` } },
  { type: "web_search_tool_result", tool_use_id: `srv_${id}`, content: urls.map((url) => ({ type: "web_search_result", url, title: url, encrypted_content: "x", page_age: null })) },
];
/** Resposta pausada (`pause_turn`) com duas buscas e um texto de andamento. */
const paused = (n: number) =>
  claudeMsg({
    stop_reason: "pause_turn",
    content: [{ type: "text", text: `Buscando ${n}.` }, ...searchBlocks(`${n}a`, [`https://www.gov.br/saude/a${n}.pdf`]), ...searchBlocks(`${n}b`, [`https://bvsms.saude.gov.br/b${n}.pdf`])],
    usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } },
  });

/** `fetch` falso da OpenAI: guarda url, cabeçalhos, corpo e sinal de cada chamada e devolve as respostas na ordem (uma função calcula a resposta na hora). */
function fakeFetch(replies: ({ body: unknown; status?: number } | ((init: any) => Promise<Response> | Response))[]) {
  const calls: { url: string; headers: any; body: any; signal: AbortSignal | undefined }[] = [];
  const f = (async (url: string, init: any) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body), signal: init.signal });
    const r = replies[calls.length - 1];
    if (!r) throw new Error(`resposta ${calls.length} não preparada no teste`);
    if (typeof r === "function") return r(init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const searchCall = (id: string, urls: string[]) => ({ type: "web_search_call", id, status: "completed", action: { type: "search", query: `consulta ${id}`, sources: urls.map((url) => ({ type: "url", url })) } });
const openaiReply = (text: string, over: Record<string, unknown> = {}) => ({
  model: "modelo-x-2026-10",
  status: "completed",
  output: [
    searchCall("ws_1", ["https://www.gov.br/saude/a.pdf", "https://www.who.int/b.pdf"]),
    searchCall("ws_2", ["https://www.who.int/b.pdf", "https://www.gov.br/conitec/c.pdf"]),
    { type: "message", id: "msg_1", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] },
  ],
  usage: { input_tokens: 500, output_tokens: 120 },
  ...over,
});
const chatReply = (content: string) => ({ model: "modelo-x-2026-10", choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 80, completion_tokens: 40 } });

/** Cliente do Gemini que guarda uma cópia dos parâmetros de cada chamada (e o sinal de cancelamento da configuração; uma função calcula a resposta na hora). */
function fakeGemini(replies: any[]) {
  const calls: any[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const client = {
    models: {
      generateContent: async (p: any) => {
        calls.push(JSON.parse(JSON.stringify(p)));
        signals.push(p.config?.abortSignal);
        const reply = replies[calls.length - 1];
        if (!reply) throw new Error(`resposta ${calls.length} não preparada no teste`);
        return typeof reply === "function" ? reply(p) : reply;
      },
    },
  };
  return { client, calls, signals };
}
const ACCESS = { mode: "studio" as const, key: "k".repeat(40) };
const geminiReply = (text: string, grounding: unknown, over: Record<string, unknown> = {}) => ({
  text,
  candidates: [{ finishReason: "STOP", ...(grounding ? { groundingMetadata: grounding } : {}) }],
  usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 100, thoughtsTokenCount: 50, toolUsePromptTokenCount: 30 },
  ...over,
});
const GROUNDING = {
  webSearchQueries: ["hepatite c pcdt", "pcdt hepatite c 2025", "protocolo hepatite c"],
  groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/aaa", title: "gov.br" } }, { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/bbb", title: "who.int" } }],
};

/** O erro de uma chamada que tem de falhar (o teste falha se ela der certo). */
async function caught(call: Promise<unknown>): Promise<Error & { usage?: unknown }> {
  try {
    await call;
  } catch (e) {
    return e as Error;
  }
  throw new Error("a chamada devia ter falhado");
}

describe("Provedores", () => {
  // ---------------------------------------------------------------- Claude

  it("Claude: web_search_20260209 com allowed_domains e max_uses", async () => {
    const { client, calls } = fakeAnthropic([claudeMsg()]);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(1);
    expect(calls[0].tools).toEqual([{ type: "web_search_20260209", name: "web_search", allowed_domains: ["gov.br/saude"], max_uses: 4 }]);
    // o JSON vem no texto: a saída estruturada (output_config.format) não vai junto da busca
    expect(calls[0].output_config).toEqual({ effort: "low" });
    expect(calls[0]).toMatchObject({ model: "claude-sonnet-5-5", system: "sistema", messages: [{ role: "user", content: "pedido" }] });
    expect(calls[0].max_tokens).toBeGreaterThanOrEqual(8192);
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 20, webSearches: 1, seenUrls: [] });
  });

  it("Claude: modelo antigo usa web_search_20250305", async () => {
    const { client, calls } = fakeAnthropic([claudeMsg({ model: "claude-haiku-4-5-20251001" })]);
    await new AnthropicProvider("chave", "claude-haiku-4-5-20251001", client).generate(req());
    expect(calls[0].tools).toEqual([{ type: "web_search_20250305", name: "web_search", allowed_domains: ["gov.br/saude"], max_uses: 4 }]);
    // o Haiku 4.5 não aceita a opção de esforço (correção IA11 do main): a busca segue a mesma regra da resposta estruturada
    expect(calls[0].output_config).toBeUndefined();
  });

  it("Claude: a versão da ferramenta vem do modelo (Opus 5 e 4.6 a 4.8, Sonnet 5 e 4.6 usam a nova)", () => {
    for (const id of ["claude-opus-5", "claude-opus-5-1", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-5", "claude-sonnet-5-5", "claude-sonnet-4-6"]) {
      expect(anthropicSearchTool(id), id).toBe("web_search_20260209");
    }
    for (const id of ["claude-opus-4-5", "claude-opus-4-1", "claude-sonnet-4-5", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-3-7-sonnet-latest", "gemini-2.5-pro", ""]) {
      expect(anthropicSearchTool(id), id).toBe("web_search_20250305");
    }
  });

  it("Claude: o esforço vem do pedido, senão da variável do servidor, senão é médio", async () => {
    const run = async (r: StructuredRequest) => {
      const { client, calls } = fakeAnthropic([claudeMsg()]);
      await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate(r);
      return calls[0].output_config;
    };
    vi.stubEnv("CONTENT_HUB_ANTHROPIC_EFFORT", "");
    expect(await run(req({ effort: undefined }))).toEqual({ effort: "medium" });
    vi.stubEnv("CONTENT_HUB_ANTHROPIC_EFFORT", "high");
    expect(await run(req({ effort: undefined }))).toEqual({ effort: "high" });
    expect(await run(req({ effort: "low" }))).toEqual({ effort: "low" });
  });

  it("Claude: pause_turn continua até 3 vezes; cada continuação leva só o que sobra do máximo do pedido", async () => {
    expect(MAX_CONTINUATIONS).toBe(3);
    // máximo 8 e duas buscas por resposta pausada: a primeira chamada + 3 continuações gastam 2+2+2+2 = 8, o máximo do pedido
    // inteiro. No limite das continuações o servidor para de buscar e converte o texto acumulado, sem busca.
    // Contagem real: 4 chamadas com busca + 1 de conversão = 5.
    const search = { allowedDomains: ["gov.br/saude"], maxSearches: 8 };
    const replies = [paused(1), paused(2), paused(3), paused(4), claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }], usage: { input_tokens: 300, output_tokens: 80 } })];
    const { client, calls } = fakeAnthropic(replies);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req({ webSearch: search }));
    expect(calls).toHaveLength(5);
    expect(calls.slice(0, 4).every((c) => c.tools?.[0]?.name === "web_search")).toBe(true);
    // o máximo é do pedido, não da chamada: cada continuação manda o máximo menos as buscas já feitas
    expect(calls.slice(0, 4).map((c) => c.tools[0].max_uses)).toEqual([8, 6, 4, 2]);
    expect(calls[3].tools).toEqual([{ type: "web_search_20260209", name: "web_search", allowed_domains: ["gov.br/saude"], max_uses: 2 }]);
    // cada continuação reenvia a pergunta e as respostas pausadas, na ordem
    const user = { role: "user", content: "pedido" };
    const assistant = (i: number) => ({ role: "assistant", content: replies[i].content });
    expect(calls[0].messages).toEqual([user]);
    expect(calls[1].messages).toEqual([user, assistant(0)]);
    expect(calls[2].messages).toEqual([user, assistant(0), assistant(1)]);
    expect(calls[3].messages).toEqual([user, assistant(0), assistant(1), assistant(2)]);
    // a 5ª é a conversão: sem busca, pelo caminho estruturado, com o texto acumulado marcado como documento
    expect(calls[4].tools).toBeUndefined();
    expect(calls[4].system).toBe(CONVERT_SYSTEM);
    expect(calls[4].output_config.format.type).toBe("json_schema");
    expect(calls[4].messages).toHaveLength(1);
    expect(calls[4].messages[0].content).toContain("<documento>");
    for (let n = 1; n <= 4; n++) expect(calls[4].messages[0].content).toContain(`Buscando ${n}.`);
    // só o texto da IA entra na conversão: os resultados da busca (páginas da internet) não
    expect(calls[4].messages[0].content).not.toContain("a1.pdf");
    expect(r.output).toEqual(RESULT);
    expect(r.webSearches).toBe(8);
    expect(r.webSearches).toBeLessThanOrEqual(search.maxSearches);
    expect(r.seenUrls).toEqual([1, 2, 3, 4].flatMap((n) => [`https://www.gov.br/saude/a${n}.pdf`, `https://bvsms.saude.gov.br/b${n}.pdf`]));
    expect(r.inputTokens).toBe(4 * 100 + 300);
    expect(r.outputTokens).toBe(4 * 10 + 80);
  });

  it("Claude: o máximo de buscas vale para o pedido inteiro; sem sobra, para de continuar e converte", async () => {
    // máximo 4 e duas buscas por resposta pausada: a 1ª chamada leva max_uses 4, a continuação só o que sobra (2);
    // gastas as 4, não há 3ª chamada com busca: o texto acumulado vai direto para a conversão
    const final = claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }], usage: { input_tokens: 300, output_tokens: 80 } });
    const replies = [paused(1), paused(2), final];
    const { client, calls } = fakeAnthropic(replies);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(3);
    expect(calls[0].tools[0].max_uses).toBe(4);
    expect(calls[1].tools).toEqual([{ type: "web_search_20260209", name: "web_search", allowed_domains: ["gov.br/saude"], max_uses: 2 }]);
    expect(calls[1].messages).toEqual([{ role: "user", content: "pedido" }, { role: "assistant", content: replies[0].content }]);
    expect(calls[2].tools).toBeUndefined();
    expect(calls[2].system).toBe(CONVERT_SYSTEM);
    expect(calls[2].messages[0].content).toContain("<documento>");
    expect(calls[2].messages[0].content).toContain("Buscando 1.");
    expect(calls[2].messages[0].content).toContain("Buscando 2.");
    expect(r.output).toEqual(RESULT);
    expect(r.webSearches).toBe(4);
    expect(r.webSearches).toBeLessThanOrEqual(SEARCH.maxSearches);
    expect(r).toMatchObject({ inputTokens: 100 + 100 + 300, outputTokens: 10 + 10 + 80 });
  });

  it("Claude: se a resposta passa do máximo, não continua (e nunca manda max_uses negativo)", async () => {
    const over = claudeMsg({ stop_reason: "pause_turn", content: [{ type: "text", text: "Buscando muito." }], usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 5 } } });
    const conv = claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }], usage: { input_tokens: 30, output_tokens: 8 } });
    const { client, calls } = fakeAnthropic([over, conv]);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(2);
    expect(calls[1].tools).toBeUndefined();
    expect(calls.every((c) => (c.tools?.[0]?.max_uses ?? 0) >= 0)).toBe(true);
    // a contagem é o que o provedor cobrou, mesmo acima do máximo
    expect(r.webSearches).toBe(5);
  });

  it("Claude: pause_turn que termina antes do limite usa o JSON do texto, sem conversão", async () => {
    const replies = [paused(1), claudeMsg({ usage: { input_tokens: 150, output_tokens: 30, server_tool_use: { web_search_requests: 1 } } })];
    const { client, calls } = fakeAnthropic(replies);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toEqual([{ role: "user", content: "pedido" }, { role: "assistant", content: replies[0].content }]);
    expect(calls[1].tools).toEqual([{ type: "web_search_20260209", name: "web_search", allowed_domains: ["gov.br/saude"], max_uses: 2 }]);
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ webSearches: 3, inputTokens: 250, outputTokens: 40, seenUrls: ["https://www.gov.br/saude/a1.pdf", "https://bvsms.saude.gov.br/b1.pdf"] });
    expect(r.webSearches).toBeLessThanOrEqual(SEARCH.maxSearches);
  });

  it("Claude: no limite do pause_turn sem nenhum texto não gasta uma conversão à toa", async () => {
    const mute = (searches: number) => claudeMsg({ stop_reason: "pause_turn", content: searchBlocks("m", ["https://www.gov.br/saude/m.pdf"]), usage: { input_tokens: 10, output_tokens: 1, server_tool_use: { web_search_requests: searches } } });
    // limite das continuações (4 chamadas, uma busca cada, máximo 10)
    const byCount = fakeAnthropic([mute(1), mute(1), mute(1), mute(1)]);
    const e1 = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", byCount.client).generate(req({ webSearch: { ...SEARCH, maxSearches: 10 } })));
    expect(e1).toBeInstanceOf(AiInvalidOutput);
    expect(byCount.calls).toHaveLength(4);
    // máximo gasto antes disso (duas buscas por chamada, máximo 4): para na 2ª chamada
    const byMax = fakeAnthropic([mute(2), mute(2), mute(2)]);
    const e2 = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", byMax.client).generate(req()));
    expect(e2).toBeInstanceOf(AiInvalidOutput);
    expect(byMax.calls).toHaveLength(2);
  });

  it("Claude: links vistos só dos resultados em lista, sem repetir; erro da ferramenta não derruba", async () => {
    const content = [
      ...searchBlocks("1", ["https://www.gov.br/saude/a.pdf", "https://www.gov.br/saude/b.pdf"]),
      { type: "web_search_tool_result", tool_use_id: "srv_x", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
      ...searchBlocks("2", ["https://www.gov.br/saude/b.pdf", "https://www.gov.br/saude/c.pdf"]),
      { type: "text", text: FENCED },
    ];
    const { client } = fakeAnthropic([claudeMsg({ content, usage: { input_tokens: 5, output_tokens: 5, server_tool_use: { web_search_requests: 2 } } })]);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate(req());
    expect(r.seenUrls).toEqual(["https://www.gov.br/saude/a.pdf", "https://www.gov.br/saude/b.pdf", "https://www.gov.br/saude/c.pdf"]);
    expect(r.webSearches).toBe(2);
  });

  it("Claude: recusa e corte por limite de saída seguem como no caminho sem busca", async () => {
    const make = (over: Record<string, unknown>) => new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([claudeMsg(over)]).client);
    await expect(make({ stop_reason: "refusal", stop_details: { category: "cyber" } }).generate(req())).rejects.toThrow(/O provedor recusou a solicitação \(cyber\)/);
    await expect(make({ stop_reason: "max_tokens" }).generate(req())).rejects.toBeInstanceOf(AiInvalidOutput);
    await expect(make({ stop_reason: "max_tokens" }).generate(req())).rejects.toThrow(/Resposta cortada pelo limite de saída/);
    await expect(make({ stop_reason: "max_tokens" }).generate(req())).rejects.toMatchObject({ reason: "cortada" });
  });

  it("Claude: sem busca o caminho é o de sempre (saída estruturada, sem ferramenta e sem contagem de buscas)", async () => {
    const { client, calls } = fakeAnthropic([claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }] })]);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req({ webSearch: undefined }));
    expect(calls[0].tools).toBeUndefined();
    expect(calls[0].output_config.format.type).toBe("json_schema");
    expect(r.output).toEqual(RESULT);
    expect(r.webSearches).toBeUndefined();
    expect(r.seenUrls).toBeUndefined();
  });

  // ---------------------------------------------------------------- OpenAI

  it("OpenAI: busca vai para /responses só com hosts e pede as fontes", async () => {
    const { f, calls } = fakeFetch([{ body: openaiReply(FENCED) }]);
    const search = { allowedDomains: ["gov.br/saude", "gov.br/conitec", "who.int"], maxSearches: 5 };
    const r = await new OpenAIProvider("chave-teste", "modelo-x", f).generate<typeof RESULT>(req({ webSearch: search }));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].headers.Authorization).toBe("Bearer chave-teste");
    expect(calls[0].body).toMatchObject({ model: "modelo-x", instructions: "sistema", input: "pedido" });
    expect(calls[0].body.tools).toEqual([{ type: "web_search", filters: { allowed_domains: ["gov.br", "who.int"] } }]);
    expect(calls[0].body.include).toEqual(["web_search_call.action.sources"]);
    expect(calls[0].body.max_output_tokens).toBeGreaterThanOrEqual(4000);
    // o máximo de buscas é do pedido inteiro: a OpenAI o impõe com max_tool_calls
    expect(calls[0].body.max_tool_calls).toBe(5);
    // o JSON vem no texto: nada de resposta estruturada junto da busca
    expect(calls[0].body.response_format).toBeUndefined();
    expect(calls[0].body.text).toBeUndefined();
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ provider: "openai", model: "modelo-x-2026-10", inputTokens: 500, outputTokens: 120, webSearches: 2 });
    expect(r.webSearches).toBeLessThanOrEqual(search.maxSearches);
    expect(r.seenUrls).toEqual(["https://www.gov.br/saude/a.pdf", "https://www.who.int/b.pdf", "https://www.gov.br/conitec/c.pdf"]);
  });

  it("OpenAI: texto só das partes output_text das mensagens; a conversão vai pelo /chat/completions", async () => {
    const price = (i: number | null, o: number | null) => (i ?? 0) / 1000 + (o ?? 0) / 100;
    const body = openaiReply("Não achei como JSON.", {
      output: [
        { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "{\"a\":1} raciocínio que não conta" }] },
        searchCall("ws_1", ["https://www.who.int/b.pdf"]),
        { type: "message", id: "m1", role: "assistant", content: [{ type: "output_text", text: "Não achei" }, { type: "output_text", text: " como JSON." }] },
      ],
    });
    const { f, calls } = fakeFetch([{ body }, { body: chatReply(JSON.stringify(RESULT)) }]);
    const r = await new OpenAIProvider("chave-teste", "modelo-x", f, "https://api.openai.com/v1", price).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[1].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[1].body.tools).toBeUndefined();
    expect(calls[1].body.messages[0]).toEqual({ role: "system", content: CONVERT_SYSTEM });
    expect(calls[1].body.messages[1].content).toContain("<documento>");
    expect(calls[1].body.messages[1].content).toContain("Não achei como JSON.");
    expect(calls[1].body.messages[1].content).not.toContain("raciocínio");
    expect(calls[1].body.response_format.type).toBe("json_schema");
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ webSearches: 1, inputTokens: 580, outputTokens: 160, seenUrls: ["https://www.who.int/b.pdf"] });
    expect(r.costUsd).toBeCloseTo(580 / 1000 + 160 / 100, 10);
  });

  it("OpenAI: resposta incompleta, recusa e erro HTTP não viram resultado", async () => {
    const make = (body: unknown, status = 200) => new OpenAIProvider("k", "m", fakeFetch([{ body, status }]).f);
    await expect(make(openaiReply(FENCED, { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })).generate(req())).rejects.toBeInstanceOf(AiInvalidOutput);
    await expect(make(openaiReply(FENCED, { status: "incomplete" })).generate(req())).rejects.toThrow(/Resposta cortada pelo limite de saída/);
    await expect(make(openaiReply(FENCED, { status: "incomplete" })).generate(req())).rejects.toMatchObject({ reason: "cortada" });
    const refused = { model: "m", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "não posso" }] }], usage: { input_tokens: 1, output_tokens: 1 } };
    await expect(make(refused).generate(req())).rejects.toThrow(/recusou/);
    await expect(make({ error: { message: "limite" } }, 429).generate(req())).rejects.toThrow(/OpenAI respondeu 429/);
  });

  // ---------------------------------------------------------------- Gemini

  it("Gemini: googleSearch; 2.5 conta 1 por pedido, 3 conta por consulta", async () => {
    const run = async (model: string, grounding: unknown) => {
      const { client, calls } = fakeGemini([geminiReply(FENCED, grounding)]);
      const r = await new GeminiProvider(ACCESS, model, client).generate<typeof RESULT>(req());
      return { r, call: calls[0] };
    };
    const a = await run("gemini-2.5-pro", GROUNDING);
    expect(a.call.model).toBe("gemini-2.5-pro");
    expect(a.call.contents).toBe("pedido");
    expect(a.call.config.tools).toEqual([{ googleSearch: {} }]);
    expect(a.call.config.systemInstruction).toBe("sistema");
    expect(a.call.config.maxOutputTokens).toBe(4000);
    // o Gemini não aceita saída estruturada junto da busca: o JSON vem no texto
    expect(a.call.config.responseSchema).toBeUndefined();
    expect(a.call.config.responseMimeType).toBeUndefined();
    expect(a.r.output).toEqual(RESULT);
    expect(a.r.webSearches).toBe(1);
    expect((await run("gemini-3.5-flash", GROUNDING)).r.webSearches).toBe(3);
    // 2.5 sem pesquisa nenhuma (sem metadados de busca) não cobra; 3 sem consultas também não
    expect((await run("gemini-2.5-pro", null)).r.webSearches).toBe(0);
    expect((await run("gemini-3.5-flash", { groundingChunks: [] })).r.webSearches).toBe(0);
  });

  it("Gemini: links vistos vêm dos trechos da busca; tokens somam o raciocínio e o que a busca trouxe", async () => {
    const { client } = fakeGemini([geminiReply(FENCED, { ...GROUNDING, groundingChunks: [...GROUNDING.groundingChunks, { web: { uri: GROUNDING.groundingChunks[0].web.uri } }, { retrievedContext: { uri: "https://fora.example/x" } }, {}] })]);
    const r = await new GeminiProvider(ACCESS, "gemini-2.5-pro", client).generate(req());
    expect(r.seenUrls).toEqual(GROUNDING.groundingChunks.map((c) => c.web.uri));
    expect(r).toMatchObject({ provider: "gemini", model: "gemini-2.5-pro", inputTokens: 430, outputTokens: 150 });
  });

  it("Gemini: JSON inválido faz uma conversão sem busca pelo caminho estruturado; texto cortado não se converte", async () => {
    const { client, calls } = fakeGemini([geminiReply("Sem JSON.", GROUNDING), geminiReply(JSON.stringify(RESULT), null, { usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 25 } })]);
    const r = await new GeminiProvider(ACCESS, "gemini-3.5-flash", client).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(2);
    expect(calls[1].config.tools).toBeUndefined();
    expect(calls[1].config.systemInstruction).toBe(CONVERT_SYSTEM);
    expect(calls[1].config.responseMimeType).toBe("application/json");
    expect(calls[1].config.responseSchema).toBeTruthy();
    expect(calls[1].contents).toContain("<documento>");
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ webSearches: 3, inputTokens: 430 + 60, outputTokens: 150 + 25 });
    const cut = fakeGemini([geminiReply(FENCED, GROUNDING, { candidates: [{ finishReason: "MAX_TOKENS", groundingMetadata: GROUNDING }] })]);
    await expect(new GeminiProvider(ACCESS, "gemini-3.5-flash", cut.client).generate(req())).rejects.toThrow(/Resposta cortada pelo limite de saída/);
    expect(cut.calls).toHaveLength(1);
    const cutAgain = fakeGemini([geminiReply(FENCED, GROUNDING, { candidates: [{ finishReason: "MAX_TOKENS", groundingMetadata: GROUNDING }] })]);
    await expect(new GeminiProvider(ACCESS, "gemini-3.5-flash", cutAgain.client).generate(req())).rejects.toMatchObject({ reason: "cortada" });
  });

  it("Gemini: sem busca o caminho é o de sempre (JSON estruturado, sem ferramenta)", async () => {
    const { client, calls } = fakeGemini([{ text: JSON.stringify(RESULT), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }]);
    const r = await new GeminiProvider(ACCESS, "gemini-2.5-pro", client).generate<typeof RESULT>(req({ webSearch: undefined }));
    expect(calls[0].config.tools).toBeUndefined();
    expect(calls[0].config.responseMimeType).toBe("application/json");
    expect(calls[0].config.responseSchema).toBeTruthy();
    expect(r.output).toEqual(RESULT);
    expect(r.webSearches).toBeUndefined();
    expect(r.seenUrls).toBeUndefined();
  });

  // ---------------------------------------------------------------- Ollama

  it("Ollama recusa busca na internet", async () => {
    const f = vi.fn();
    await expect(new OllamaProvider("http://localhost:11434", "llama3", f as unknown as typeof fetch).generate(req())).rejects.toThrow(/Ollama não busca na internet/);
    expect(f).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------- JSON no fim do texto

  it("JSON no fim do texto: cercado ou solto", () => {
    const json = JSON.stringify(RESULT);
    expect(extractTrailingJson(`Achei.\n\`\`\`json\n${json}\n\`\`\``)).toEqual(RESULT);
    expect(extractTrailingJson(`Achei.\n\`\`\`JSON\n${json}\n\`\`\`\nFim.`)).toEqual(RESULT);
    // solto: o maior trecho que começa num { e termina no último } e é JSON (o primeiro { não serve, o segundo sim)
    expect(extractTrailingJson(`texto {"a":1} fim ${json}`)).toEqual(RESULT);
    expect(extractTrailingJson(`Resposta:\n${json}`)).toEqual(RESULT);
    expect(extractTrailingJson(`{"a":1}`)).toEqual({ a: 1 });
    // chaves dentro de textos do JSON não confundem
    expect(extractTrailingJson(`ok {"titulo":"x } y { z","n":2}`)).toEqual({ titulo: "x } y { z", n: 2 });
  });

  it("JSON no fim do texto: vale o último bloco cercado; bloco inválido cai para o trecho solto; sem JSON não há nada", () => {
    const json = JSON.stringify(RESULT);
    expect(extractTrailingJson(`\`\`\`json\n{"a":1}\n\`\`\`\ne depois\n\`\`\`json\n${json}\n\`\`\``)).toEqual(RESULT);
    expect(extractTrailingJson(`${json}\n\`\`\`json\n{quebrado\n\`\`\``)).toEqual(RESULT);
    expect(extractTrailingJson("")).toBeUndefined();
    expect(extractTrailingJson("Não achei nada.")).toBeUndefined();
    expect(extractTrailingJson("começa { e nunca fecha")).toBeUndefined();
    expect(extractTrailingJson("fecha } antes { de abrir")).toBeUndefined();
    expect(extractTrailingJson("```json\n{quebrado\n```")).toBeUndefined();
  });

  it("JSON no fim do texto: texto enorme cheio de chaves abertas não trava a busca do trecho solto", () => {
    // o texto vem da internet: 30 mil "{" e um "}" final dariam 30 mil tentativas de JSON.parse sobre 150 mil caracteres
    const lixo = `${'{"a":'.repeat(30_000)}}`;
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(extractTrailingJson(lixo)).toBeUndefined();
      expect(parse.mock.calls.length).toBeGreaterThan(0); // o espião vê as tentativas
      expect(parse.mock.calls.length).toBeLessThan(1000); // e elas têm limite
    } finally {
      parse.mockRestore();
    }
  });

  it("hostsOf: só o host, sem repetir, no máximo 100", () => {
    expect(hostsOf(["gov.br/saude", "gov.br/conitec", "who.int"])).toEqual(["gov.br", "who.int"]);
    expect(hostsOf(["https://www.gov.br/saude/x?y=1", "WWW.gov.br", " iris.paho.org/ ", ""])).toEqual(["www.gov.br", "iris.paho.org"]);
    expect(hostsOf([])).toEqual([]);
    const many = Array.from({ length: 150 }, (_, i) => `site${i}.org/pasta`);
    const hosts = hostsOf(many);
    expect(hosts).toHaveLength(100);
    expect(hosts[0]).toBe("site0.org");
    expect(hosts[99]).toBe("site99.org");
  });

  // ---------------------------------------------------------------- conversão

  it("JSON inválido: uma conversão sem busca, tokens somados; conversão inválida → AiInvalidOutput", async () => {
    // 1ª chamada sem JSON no texto; a 2ª é a conversão
    const first = claudeMsg({ content: [{ type: "text", text: "Encontrei o PCDT, mas esqueci o JSON." }], usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } } });
    const second = claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }], usage: { input_tokens: 300, output_tokens: 80 } });
    const ok = fakeAnthropic([first, second]);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", ok.client).generate<typeof RESULT>(req());
    expect(ok.calls).toHaveLength(2);
    expect(ok.calls[0].tools).toBeDefined();
    expect(ok.calls[1].tools).toBeUndefined();
    expect(ok.calls[1].system).toBe(CONVERT_SYSTEM);
    expect(ok.calls[1].messages).toEqual([{ role: "user", content: asDocument("Encontrei o PCDT, mas esqueci o JSON.") }]);
    expect(ok.calls[1].messages[0].content).toContain("<documento>");
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ inputTokens: 1300, outputTokens: 280, webSearches: 1 });
    // conversão que também não serve: erro de saída inválida, nunca "consertada"
    const bad = fakeAnthropic([first, claudeMsg({ content: [{ type: "text", text: '{"documentos":"nenhum"}' }] })]);
    await expect(new AnthropicProvider("chave", "claude-sonnet-5-5", bad.client).generate(req())).rejects.toBeInstanceOf(AiInvalidOutput);
    const notJson = fakeAnthropic([first, claudeMsg({ content: [{ type: "text", text: "sem json" }] })]);
    await expect(new AnthropicProvider("chave", "claude-sonnet-5-5", notJson.client).generate(req())).rejects.toBeInstanceOf(AiInvalidOutput);
    // JSON no texto que não cumpre o esquema também vai para a conversão (e não é usado como está)
    const wrong = fakeAnthropic([claudeMsg({ content: [{ type: "text", text: 'ver ```json\n{"documentos":[{"titulo":"sem link"}]}\n```' }] }), second]);
    const w = await new AnthropicProvider("chave", "claude-sonnet-5-5", wrong.client).generate<typeof RESULT>(req());
    expect(wrong.calls).toHaveLength(2);
    expect(w.output).toEqual(RESULT);
  });

  it("parseOrConvert: usa o JSON válido do texto; senão converte os últimos 30.000 caracteres como documento", async () => {
    const result = (output: unknown, tokens: number | null = 10): StructuredResult<any> => ({ output, provider: "p", model: "m", inputTokens: tokens, outputTokens: tokens, latencyMs: 1, costUsd: null });
    // válido: nenhuma chamada
    const never = vi.fn();
    expect(await parseOrConvert(req(), FENCED, never)).toEqual({ output: RESULT, extra: null });
    expect(never).not.toHaveBeenCalled();
    // inválido: uma chamada, sem busca, com o prompt da conversão e só o fim do texto
    const text = `${"a".repeat(25_000)}${"b".repeat(15_000)}`;
    const convert = vi.fn(async (r: StructuredRequest) => result(RESULT, 7));
    const out = await parseOrConvert(req(), text, convert);
    expect(convert).toHaveBeenCalledTimes(1);
    const sent = convert.mock.calls[0][0];
    expect(sent.webSearch).toBeUndefined();
    expect(sent.promptId).toBe("source_search.conversao");
    expect(sent.system).toBe(CONVERT_SYSTEM);
    expect(sent.schema).toBe(SCHEMA);
    expect(sent.input).toBe(asDocument(text.slice(-30_000)));
    expect(sent.input.startsWith("<documento>")).toBe(true);
    expect(out.output).toEqual(RESULT);
    expect(out.extra).toMatchObject({ inputTokens: 7 });
    // conversão fora do esquema: AiInvalidOutput; texto em branco: nem chama
    await expect(parseOrConvert(req(), "sem json", async () => result({ documentos: 3 }))).rejects.toBeInstanceOf(AiInvalidOutput);
    const blank = vi.fn();
    await expect(parseOrConvert(req(), "  \n ", blank)).rejects.toBeInstanceOf(AiInvalidOutput);
    expect(blank).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------- uso parcial no erro

  // Erro depois de buscas pagas leva o que já foi gasto (propriedade `usage`): quem registra a falha grava o custo e as
  // buscas reais, e o teto mensal não fica abaixo do que o provedor cobrou.

  it("Erro com uso (Claude): corte por limite de saída numa continuação leva buscas e tokens das duas chamadas", async () => {
    const cut = claudeMsg({ stop_reason: "max_tokens", content: [{ type: "text", text: "cort" }], usage: { input_tokens: 50, output_tokens: 60, server_tool_use: { web_search_requests: 1 } } });
    const { client } = fakeAnthropic([paused(1), cut]);
    const e = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate(req({ webSearch: { ...SEARCH, maxSearches: 10 } })));
    expect(e).toBeInstanceOf(AiInvalidOutput);
    expect(e.message).toMatch(/Resposta cortada pelo limite de saída/);
    expect(e.usage).toEqual({ inputTokens: 150, outputTokens: 70, webSearches: 3 });
    expect(partialUsageOf(e)).toEqual({ inputTokens: 150, outputTokens: 70, webSearches: 3 });
  });

  it("Erro com uso (Claude): texto vazio depois das pausas, recusa e falha de rede numa continuação", async () => {
    const mute = () => claudeMsg({ stop_reason: "pause_turn", content: searchBlocks("m", ["https://www.gov.br/saude/m.pdf"]), usage: { input_tokens: 10, output_tokens: 1, server_tool_use: { web_search_requests: 2 } } });
    const empty = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([mute(), mute()]).client).generate(req()));
    expect(empty).toBeInstanceOf(AiInvalidOutput);
    expect(empty.usage).toEqual({ inputTokens: 20, outputTokens: 2, webSearches: 4 });
    const refusal = claudeMsg({ stop_reason: "refusal", stop_details: { category: "cyber" }, usage: { input_tokens: 50, output_tokens: 5 } });
    const refused = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([paused(1), refusal]).client).generate(req({ webSearch: { ...SEARCH, maxSearches: 10 } })));
    expect(refused.message).toMatch(/recusou/);
    expect(refused.usage).toEqual({ inputTokens: 150, outputTokens: 15, webSearches: 2 });
    // a 1ª chamada pagou e a 2ª caiu: o que a 1ª gastou não se perde
    const down = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([paused(1), new Error("Anthropic respondeu 529")]).client).generate(req({ webSearch: { ...SEARCH, maxSearches: 10 } })));
    expect(down.message).toBe("Anthropic respondeu 529");
    expect(down.usage).toEqual({ inputTokens: 100, outputTokens: 10, webSearches: 2 });
  });

  it("Erro com uso (Claude): conversão fora do esquema soma a conversão ao que a busca gastou", async () => {
    const first = claudeMsg({ content: [{ type: "text", text: "Encontrei o PCDT, mas esqueci o JSON." }], usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } } });
    const bad = claudeMsg({ content: [{ type: "text", text: '{"documentos":"nenhum"}' }], usage: { input_tokens: 300, output_tokens: 80 } });
    const e = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([first, bad]).client).generate(req()));
    expect(e).toBeInstanceOf(AiInvalidOutput);
    expect(e.usage).toEqual({ inputTokens: 1300, outputTokens: 280, webSearches: 1 });
    // conversão que nem é JSON: o mesmo
    const notJson = claudeMsg({ content: [{ type: "text", text: "sem json" }], usage: { input_tokens: 300, output_tokens: 80 } });
    const n = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([first, notJson]).client).generate(req()));
    expect(n.usage).toEqual({ inputTokens: 1300, outputTokens: 280, webSearches: 1 });
  });

  it("Erro com uso: a 1ª chamada que cai não gastou nada, então não leva uso; sucesso também não", async () => {
    const e = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([new Error("Anthropic respondeu 401")]).client).generate(req()));
    expect(e.usage).toBeUndefined();
    expect(partialUsageOf(e)).toBeNull();
    const f = await caught(new OpenAIProvider("k", "m", fakeFetch([{ body: { error: { message: "limite" } }, status: 429 }]).f).generate(req()));
    expect(partialUsageOf(f)).toBeNull();
    const { client } = fakeAnthropic([claudeMsg()]);
    const ok = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate(req());
    expect((ok as any).usage).toBeUndefined();
  });

  it("Erro com uso (OpenAI): resposta incompleta, recusa e conversão fora do esquema", async () => {
    const incomplete = await caught(new OpenAIProvider("k", "m", fakeFetch([{ body: openaiReply(FENCED, { status: "incomplete" }) }]).f).generate(req()));
    expect(incomplete).toBeInstanceOf(AiInvalidOutput);
    expect(incomplete.usage).toEqual({ inputTokens: 500, outputTokens: 120, webSearches: 2 });
    const refused = { model: "m", status: "completed", output: [searchCall("ws_1", []), { type: "message", role: "assistant", content: [{ type: "refusal", refusal: "não posso" }] }], usage: { input_tokens: 7, output_tokens: 3 } };
    const r = await caught(new OpenAIProvider("k", "m", fakeFetch([{ body: refused }]).f).generate(req()));
    expect(r.message).toMatch(/recusou/);
    expect(r.usage).toEqual({ inputTokens: 7, outputTokens: 3, webSearches: 1 });
    const { f } = fakeFetch([{ body: openaiReply("Não achei como JSON.") }, { body: chatReply('{"documentos":3}') }]);
    const bad = await caught(new OpenAIProvider("k", "m", f).generate(req()));
    expect(bad).toBeInstanceOf(AiInvalidOutput);
    expect(bad.usage).toEqual({ inputTokens: 580, outputTokens: 160, webSearches: 2 });
  });

  it("Erro com uso (Gemini): corte por limite de saída, texto vazio e conversão fora do esquema", async () => {
    const cutReply = geminiReply(FENCED, GROUNDING, { candidates: [{ finishReason: "MAX_TOKENS", groundingMetadata: GROUNDING }] });
    const cut = await caught(new GeminiProvider(ACCESS, "gemini-3.5-flash", fakeGemini([cutReply]).client).generate(req()));
    expect(cut).toBeInstanceOf(AiInvalidOutput);
    expect(cut.usage).toEqual({ inputTokens: 430, outputTokens: 150, webSearches: 3 });
    const blank = await caught(new GeminiProvider(ACCESS, "gemini-2.5-pro", fakeGemini([geminiReply("", GROUNDING)]).client).generate(req()));
    expect(blank.usage).toEqual({ inputTokens: 430, outputTokens: 150, webSearches: 1 });
    const second = geminiReply('{"documentos":"x"}', null, { usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 25 } });
    const bad = await caught(new GeminiProvider(ACCESS, "gemini-3.5-flash", fakeGemini([geminiReply("Sem JSON.", GROUNDING), second]).client).generate(req()));
    expect(bad).toBeInstanceOf(AiInvalidOutput);
    expect(bad.usage).toEqual({ inputTokens: 430 + 60, outputTokens: 150 + 25, webSearches: 3 });
  });

  it("Erro com uso: o caminho sem busca também diz o que gastou (sem buscas)", async () => {
    // o caminho sem busca é o do main: o AiInvalidOutput leva só os tokens (AiUsage), e partialUsageOf o lê com 0 buscas
    const claude = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([claudeMsg({ content: [{ type: "text", text: "sem json" }] })]).client).generate(req({ webSearch: undefined })));
    expect(claude.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(partialUsageOf(claude)).toEqual({ inputTokens: 100, outputTokens: 20, webSearches: 0 });
    const wrongShape = await caught(new AnthropicProvider("chave", "claude-sonnet-5-5", fakeAnthropic([claudeMsg({ content: [{ type: "text", text: '{"documentos":1}' }] })]).client).generate(req({ webSearch: undefined })));
    expect(partialUsageOf(wrongShape)).toEqual({ inputTokens: 100, outputTokens: 20, webSearches: 0 });
    const gemini = await caught(new GeminiProvider(ACCESS, "gemini-2.5-pro", fakeGemini([{ text: "sem json", usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 } }]).client).generate(req({ webSearch: undefined })));
    expect(partialUsageOf(gemini)).toEqual({ inputTokens: 10, outputTokens: 7, webSearches: 0 });
    const chat = { model: "m", choices: [{ finish_reason: "stop", message: { content: "sem json" } }], usage: { prompt_tokens: 80, completion_tokens: 40 } };
    const openai = await caught(new OpenAIProvider("k", "m", fakeFetch([{ body: chat }]).f).generate(req({ webSearch: undefined })));
    expect(partialUsageOf(openai)).toEqual({ inputTokens: 80, outputTokens: 40, webSearches: 0 });
  });

  it("Erro com uso: parseOrConvert leva o gasto da conversão que não serviu; OpenAI que não concluiu leva o da busca", async () => {
    const converted = async () => ({ output: { documentos: 3 }, provider: "p", model: "m", inputTokens: 7, outputTokens: 9, latencyMs: 1, costUsd: null }) as StructuredResult<any>;
    const e = await caught(parseOrConvert(req(), "sem json", converted));
    expect(e).toBeInstanceOf(AiInvalidOutput);
    expect(e.usage).toEqual({ inputTokens: 7, outputTokens: 9, webSearches: 0 });
    // o texto em branco nem chama a conversão: nada gasto, nada a levar
    expect(partialUsageOf(await caught(parseOrConvert(req(), "  ", converted)))).toBeNull();
    const failed = { model: "m", status: "failed", error: { message: "queda" }, output: [searchCall("ws_1", [])], usage: { input_tokens: 40, output_tokens: 2 } };
    const f = await caught(new OpenAIProvider("k", "m", fakeFetch([{ body: failed }]).f).generate(req()));
    expect(f.message).toMatch(/OpenAI não concluiu a resposta: queda/);
    expect(f.usage).toEqual({ inputTokens: 40, outputTokens: 2, webSearches: 1 });
  });

  it("withUsage e partialUsageOf: somam o uso, aceitam nulos e ignoram o que não é erro", () => {
    const e = new Error("x");
    expect(partialUsageOf(e)).toBeNull();
    expect(withUsage(e, { inputTokens: 10, outputTokens: null, webSearches: 2 })).toBe(e);
    expect(partialUsageOf(e)).toEqual({ inputTokens: 10, outputTokens: null, webSearches: 2 });
    withUsage(e, { inputTokens: 5, outputTokens: 7, webSearches: 1 });
    expect(partialUsageOf(e)).toEqual({ inputTokens: 15, outputTokens: 7, webSearches: 3 });
    withUsage(e, { inputTokens: null, outputTokens: null, webSearches: 0 });
    expect(partialUsageOf(e)).toEqual({ inputTokens: 15, outputTokens: 7, webSearches: 3 });
    expect(withUsage("texto solto", { inputTokens: 1, outputTokens: 1, webSearches: 1 })).toBe("texto solto");
    // propriedade `usage` que não tem o feitio do uso não conta
    const odd = Object.assign(new Error("y"), { usage: "muito" });
    expect(partialUsageOf(odd)).toBeNull();
    expect(partialUsageOf(null)).toBeNull();
    expect(partialUsageOf("erro")).toBeNull();
    // o uso que o AiInvalidOutput do caminho sem busca leva (do main: só tokens) conta como 0 buscas, e a busca soma por cima
    const conv = new AiInvalidOutput("fora do formato", null, { usage: { inputTokens: 3, outputTokens: 4 }, reason: "formato" });
    expect(partialUsageOf(conv)).toEqual({ inputTokens: 3, outputTokens: 4, webSearches: 0 });
    withUsage(conv, { inputTokens: 10, outputTokens: 1, webSearches: 2 });
    expect(partialUsageOf(conv)).toEqual({ inputTokens: 13, outputTokens: 5, webSearches: 2 });
    expect(partialUsageOf(Object.assign(new Error("z"), { usage: { inputTokens: 1, outputTokens: 1, webSearches: null } }))).toBeNull();
  });

  // ---------------------------------------------------------------- cancelamento (req.signal)
  // O tempo-limite de quem chama (a Central) só corre contra a promessa: sem sinal, a busca de vários passos seguia em segundo
  // plano, pagando continuações e conversão que ninguém registrava. Com `req.signal` o provedor para e diz o que já gastou.

  const noJson = (over: Record<string, unknown> = {}) => claudeMsg({ content: [{ type: "text", text: "Achei, mas sem o JSON." }], ...over });

  it("Cancelamento (Claude): o sinal vai em cada chamada; cancelar no meio da busca para na hora, sem continuação nem conversão, e o erro leva o gasto das chamadas feitas", async () => {
    const ac = new AbortController();
    const { client, calls, signals } = fakeAnthropic([paused(1), (_p: any, opts: any) => hangUntilAborted(opts?.signal), paused(3), claudeMsg()]);
    const outcome = caught(new AnthropicProvider("k", "claude-sonnet-5-5", client).generate(req({ signal: ac.signal, webSearch: { allowedDomains: ["gov.br/saude"], maxSearches: 8 } })));
    await until(() => calls.length === 2); // a 2ª chamada está em andamento (a 1ª já pausou com 2 buscas)
    const reason = new Error("Tempo esgotado (teste).");
    ac.abort(reason);
    const error = await outcome;
    expect(signals).toEqual([ac.signal, ac.signal]);
    expect(error.message).toMatch(/cancelada/);
    // o gasto das chamadas concluídas não se perde: a 1ª chamada pagou 2 buscas
    expect(partialUsageOf(error)).toEqual({ inputTokens: 100, outputTokens: 10, webSearches: 2 });
    // o motivo do sinal é um objeto só: o erro é outro, e o gasto não é gravado nele
    expect(error).not.toBe(reason);
    expect((reason as Error & { usage?: unknown }).usage).toBeUndefined();
    // nada continua em segundo plano
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(2);
  });

  it("Cancelamento (Claude): se o sinal dispara entre uma chamada e a continuação, não há nova chamada", async () => {
    const ac = new AbortController();
    const { client, calls } = fakeAnthropic([thenAbort(ac, paused(1)), paused(2), claudeMsg()]);
    const error = await caught(new AnthropicProvider("k", "claude-sonnet-5-5", client).generate(req({ signal: ac.signal, webSearch: { allowedDomains: ["gov.br/saude"], maxSearches: 8 } })));
    expect(calls).toHaveLength(1);
    expect(error.message).toMatch(/cancelada/);
    expect(partialUsageOf(error)).toEqual({ inputTokens: 100, outputTokens: 10, webSearches: 2 });
  });

  it("Cancelamento (Claude): se o sinal dispara antes da conversão, a conversão paga não é feita; o erro leva só a busca", async () => {
    const ac = new AbortController();
    const { client, calls } = fakeAnthropic([thenAbort(ac, noJson()), claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }] })]);
    const error = await caught(new AnthropicProvider("k", "claude-sonnet-5-5", client).generate(req({ signal: ac.signal })));
    expect(calls).toHaveLength(1);
    expect(error.message).toMatch(/cancelada/);
    expect(partialUsageOf(error)).toEqual({ inputTokens: 100, outputTokens: 20, webSearches: 1 });
  });

  it("Cancelamento (Claude): resposta que já trouxe o JSON válido é usada mesmo com o sinal disparado (já foi paga)", async () => {
    const ac = new AbortController();
    const { client } = fakeAnthropic([thenAbort(ac, claudeMsg())]);
    const r = await new AnthropicProvider("k", "claude-sonnet-5-5", client).generate<typeof RESULT>(req({ signal: ac.signal }));
    expect(r.output).toEqual(RESULT);
    expect(r.webSearches).toBe(1);
  });

  it("Cancelamento (Claude): sem sinal nada muda (as opções da chamada vão vazias); a conversão sem busca leva o mesmo sinal", async () => {
    const plain = fakeAnthropic([claudeMsg()]);
    await new AnthropicProvider("k", "claude-sonnet-5-5", plain.client).generate(req());
    expect(plain.signals).toEqual([undefined]);
    const ac = new AbortController();
    const withConversion = fakeAnthropic([noJson(), claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }] })]);
    await new AnthropicProvider("k", "claude-sonnet-5-5", withConversion.client).generate(req({ signal: ac.signal }));
    expect(withConversion.calls).toHaveLength(2);
    expect(withConversion.signals).toEqual([ac.signal, ac.signal]);
  });

  it("Cancelamento (OpenAI): o sinal vai nas duas chamadas junto do tempo-limite próprio; cancelar no meio da busca falha na hora", async () => {
    const ac = new AbortController();
    const both = fakeFetch([{ body: openaiReply("Não achei como JSON.") }, { body: chatReply(JSON.stringify(RESULT)) }]);
    await new OpenAIProvider("k", "modelo-x", both.f).generate(req({ signal: ac.signal }));
    expect(both.calls).toHaveLength(2);
    expect(both.calls.map((c) => c.signal?.aborted)).toEqual([false, false]);
    ac.abort(); // o sinal de cada chamada segue o de quem pediu
    expect(both.calls.map((c) => c.signal?.aborted)).toEqual([true, true]);
    // sem sinal de quem chama, a chamada ainda tem o seu tempo-limite
    const alone = fakeFetch([{ body: openaiReply(FENCED) }]);
    await new OpenAIProvider("k", "modelo-x", alone.f).generate(req());
    expect(alone.calls[0].signal).toBeDefined();
    expect(alone.calls[0].signal?.aborted).toBe(false);

    const mid = new AbortController();
    const hung = fakeFetch([(init: any) => hangUntilAborted(init.signal)]);
    const outcome = caught(new OpenAIProvider("k", "modelo-x", hung.f).generate(req({ signal: mid.signal })));
    await until(() => hung.calls.length === 1);
    const reason = new Error("Tempo esgotado (teste).");
    mid.abort(reason);
    const error = await outcome;
    expect(error.message).toMatch(/cancelada/);
    expect(error).not.toBe(reason);
    expect(hung.calls).toHaveLength(1);
  });

  it("Cancelamento (OpenAI): se o sinal dispara antes da conversão, ela não é feita; o erro leva a busca", async () => {
    const ac = new AbortController();
    const { f, calls } = fakeFetch([
      (_init: any) => {
        ac.abort(new Error("Tempo esgotado (teste)."));
        return new Response(JSON.stringify(openaiReply("Não achei como JSON.")), { status: 200 });
      },
      { body: chatReply(JSON.stringify(RESULT)) },
    ]);
    const error = await caught(new OpenAIProvider("k", "modelo-x", f).generate(req({ signal: ac.signal })));
    expect(calls).toHaveLength(1);
    expect(error.message).toMatch(/cancelada/);
    expect(partialUsageOf(error)).toEqual({ inputTokens: 500, outputTokens: 120, webSearches: 2 });
  });

  it("Cancelamento (Gemini): o sinal vai na busca e na conversão; se dispara antes da conversão, ela não é feita; o erro leva a busca", async () => {
    const ac = new AbortController();
    const both = fakeGemini([geminiReply("Sem JSON.", GROUNDING), geminiReply(JSON.stringify(RESULT), null)]);
    await new GeminiProvider(ACCESS, "gemini-2.5-pro", both.client).generate(req({ signal: ac.signal }));
    expect(both.calls).toHaveLength(2);
    expect(both.signals).toEqual([ac.signal, ac.signal]);
    // sem sinal, a configuração não leva abortSignal
    const plain = fakeGemini([geminiReply(FENCED, GROUNDING)]);
    await new GeminiProvider(ACCESS, "gemini-2.5-pro", plain.client).generate(req());
    expect(plain.signals).toEqual([undefined]);

    const stop = new AbortController();
    const cut = fakeGemini([thenAbort(stop, geminiReply("Sem JSON.", GROUNDING)), geminiReply(JSON.stringify(RESULT), null)]);
    const error = await caught(new GeminiProvider(ACCESS, "gemini-2.5-pro", cut.client).generate(req({ signal: stop.signal })));
    expect(cut.calls).toHaveLength(1);
    expect(error.message).toMatch(/cancelada/);
    expect(partialUsageOf(error)).toEqual({ inputTokens: 430, outputTokens: 150, webSearches: 1 });
  });

  it("Cancelamento: sinal já disparado antes de começar não chama ninguém", async () => {
    const ac = new AbortController();
    ac.abort(new Error("Tempo esgotado (teste)."));
    const claude = fakeAnthropic([claudeMsg()]);
    const claudeError = await caught(new AnthropicProvider("k", "claude-sonnet-5-5", claude.client).generate(req({ signal: ac.signal })));
    const openai = fakeFetch([{ body: openaiReply(FENCED) }]);
    const openaiError = await caught(new OpenAIProvider("k", "modelo-x", openai.f).generate(req({ signal: ac.signal })));
    const gemini = fakeGemini([geminiReply(FENCED, GROUNDING)]);
    const geminiError = await caught(new GeminiProvider(ACCESS, "gemini-2.5-pro", gemini.client).generate(req({ signal: ac.signal })));
    expect([claude.calls.length, openai.calls.length, gemini.calls.length]).toEqual([0, 0, 0]);
    for (const e of [claudeError, openaiError, geminiError]) {
      expect(e.message).toMatch(/cancelada/);
      expect(partialUsageOf(e)).toBeNull(); // nada foi gasto
    }
  });

  it("Cancelamento: só vira \"cancelada\" o erro de quem foi cancelado (o do próprio sinal, o da SDK, o AbortError); os outros passam como estão", () => {
    const ac = new AbortController();
    const sdk = new Error("Request was aborted.");
    const domain = new AiInvalidOutput("Resposta fora do formato.", null);
    // sinal que não disparou: nada é trocado, nem erro que fala em abortar
    expect(ownError(sdk, ac.signal)).toBe(sdk);
    expect(ownError(sdk, undefined)).toBe(sdk);
    ac.abort(new Error("Tempo esgotado (teste)."));
    expect(ownError(ac.signal.reason, ac.signal)).not.toBe(ac.signal.reason);
    expect((ownError(sdk, ac.signal) as Error).message).toBe("Chamada cancelada.");
    expect((ownError(Object.assign(new Error("x"), { name: "AbortError" }), ac.signal) as Error).message).toBe("Chamada cancelada.");
    expect(((ownError(sdk, ac.signal) as Error).cause as Error).message).toBe("Tempo esgotado (teste).");
    expect(ownError(domain, ac.signal)).toBe(domain);
    // quem já leva o gasto de uma camada de baixo não é trocado (o gasto se perderia)
    const paid = withUsage(new Error("Request was aborted."), { inputTokens: 1, outputTokens: 1, webSearches: 1 });
    expect(ownError(paid, ac.signal)).toBe(paid);
    expect(ownError("texto solto", ac.signal)).toBe("texto solto");
  });

  it("Cancelamento: parseOrConvert não faz a conversão com o sinal disparado, mas usa o JSON válido que já veio", async () => {
    const ac = new AbortController();
    ac.abort(new Error("Tempo esgotado (teste)."));
    const convert = vi.fn(async () => ({ output: RESULT, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, latencyMs: 1, costUsd: null }) as StructuredResult<any>);
    const error = await caught(parseOrConvert(req({ signal: ac.signal }), "sem json", convert));
    expect(error.message).toMatch(/cancelada/);
    expect(convert).not.toHaveBeenCalled();
    const ok = await parseOrConvert<typeof RESULT>(req({ signal: ac.signal }), FENCED, convert);
    expect(ok.output).toEqual(RESULT);
    expect(convert).not.toHaveBeenCalled();
  });
});

// ================================================================ Central de IAs: função "Busca de fontes oficiais"

describe("Central", () => {
  type R = ModelRef;
  const A: R = { provider: "anthropic", model: "claude-sonnet-5-5" };
  const O: R = { provider: "openai", model: "gpt-5.4" };
  const L: R = { provider: "ollama", model: "qwen3" };
  const key = (r: R) => `${r.provider}:${r.model}`;
  const SITES = ["gov.br/saude", "who.int"];
  const origin = { source: "fontes" as const, itemId: "busca-1", actorId: null };
  const SEARCH_REQ = {
    promptId: "source_search",
    promptVersion: "1.0.0",
    system: "sistema",
    input: "x".repeat(400),
    schema: { type: "object" as const },
    schemaName: "staziamed_source_search",
    maxOutputTokens: 1000,
    webSearch: { allowedDomains: SITES, maxSearches: 99 },
  };
  const PLAIN_REQ = { ...SEARCH_REQ, webSearch: undefined };

  /** Preços do Claude como no seed: tokens por milhão e o preço de cada busca. */
  const PRICED = { provider: "anthropic", model: "claude-sonnet-5-5", input_per_mtok: 2, output_per_mtok: 10, per_search_usd: 0.01 };
  /** Configuração no feitio do que a tela lê, sem banco: as 4 IAs ligadas (ou as pedidas) e os preços dados. */
  const mkCfg = (over: { enabled?: string[]; caps?: boolean; prices?: any[]; models?: Record<string, string[]> } = {}): any => {
    const enabled = over.enabled ?? ["anthropic", "openai", "gemini", "ollama"];
    const providers: any = {};
    for (const id of ["anthropic", "openai", "gemini", "ollama"]) {
      providers[id] = { enabled: enabled.includes(id), models: (over.models?.[id] ?? []).map((m) => ({ id: m, label: m })), status: null };
    }
    return { providers, functions: {}, settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: over.caps ?? false, tab_override_enabled: false }, prices: over.prices ?? [] };
  };
  const searchFc = (over: Record<string, unknown> = {}): any => ({ key: "busca_fontes", mode: "sozinha", primary: A, fallback: null, reviewers: [], care: "caprichado", max_searches: null, ...over });

  // ---------------------------------------------------------------- sem banco

  describe("preços e problemas (sem banco)", () => {
    it("a função é a sétima e a última; só ela é função de busca; as variáveis de ambiente nunca a definem", () => {
      expect(FUNCTION_KEYS).toEqual(["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "busca_fontes"]);
      expect(DEFAULT_MAX_SEARCHES).toBe(5);
      expect(FUNCTION_KEYS.filter((k) => isSearchFunction(k))).toEqual(["busca_fontes"]);
      const env = { CONTENT_HUB_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "x", CONTENT_HUB_MODEL_CREATE: "claude-sonnet-5-5" } as NodeJS.ProcessEnv;
      expect(envFallbackRef("criacao", env)).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" }); // as outras seguem as variáveis
      expect(envFallbackRef("busca_fontes", env)).toBeNull();
      for (const ui of ["anthropic", "openai", "gemini", "ollama"] as const) expect(envFallbackRef("busca_fontes", env, ui)).toBeNull();
    });

    it("estimateCostUsd soma buscas × preço por busca MAIS a folga de 30.000 tokens de entrada por busca; costUsd (o gasto real) não tem folga", () => {
      const base = (1000 * 2 + 1000 * 10) / 1e6; // 4000 caracteres = 1000 tokens de entrada; 1000 de saída
      const headroom = (5 * SEARCH_RESULT_TOKENS * 2) / 1e6; // 5 buscas × 30.000 tokens × US$ 2 por milhão = US$ 0,30
      expect(SEARCH_RESULT_TOKENS).toBe(30_000);
      expect(headroom).toBeCloseTo(0.3, 6);
      expect(estimateCostUsd(PRICED, 4000, 1000, 5)).toBeCloseTo(base + 5 * 0.01 + headroom, 6);
      expect(estimateCostUsd(PRICED, 4000, 1000)).toBeCloseTo(base, 6);
      // sem preço por busca a folga de tokens continua (o resultado da busca volta como entrada)
      expect(estimateCostUsd({ ...PRICED, per_search_usd: null }, 4000, 1000, 5)).toBeCloseTo(base + headroom, 6);
      expect(estimateCostUsd({ input_per_mtok: 2, output_per_mtok: 10 }, 4000, 1000, 5)).toBeCloseTo(base + headroom, 6);
      expect(estimateCostUsd(null, 4000, 1000, 5)).toBeNull();
      expect(costUsd(PRICED, 1000, 500, 4)).toBeCloseTo(0.047, 6);
      expect(costUsd(PRICED, 1000, 500)).toBeCloseTo(0.007, 6);
      expect(costUsd({ ...PRICED, per_search_usd: null }, 1000, 500, 4)).toBeCloseTo(0.007, 6);
      expect(costUsd(PRICED, null, 500, 4)).toBeNull();
      expect(costUsd(null, 1000, 500, 4)).toBeNull();
    });

    it("o catálogo traz preço por busca de todos os modelos (Claude e OpenAI 0,01; Gemini 3+ 0,014; Gemini 2.5 0,035 por prompt)", () => {
      const by = (p: string) => PRICE_SEED.filter((x) => x.provider === p);
      expect(by("anthropic").length).toBeGreaterThan(0);
      for (const x of by("anthropic")) expect(x.per_search_usd, x.model).toBe(0.01);
      expect(by("openai").length).toBeGreaterThan(0);
      for (const x of by("openai")) expect(x.per_search_usd, x.model).toBe(0.01);
      expect(by("gemini").length).toBeGreaterThan(0);
      for (const x of by("gemini")) expect(x.per_search_usd, x.model).toBe(x.model.startsWith("gemini-3") ? 0.014 : 0.035);
      for (const m of ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"]) expect(PRICE_SEED.find((x) => x.model === m)?.per_search_usd, m).toBe(0.014);
      expect(PRICE_SEED.find((x) => x.model === "gemini-2.5-flash")?.per_search_usd).toBe(0.035);
    });

    it("a migração 9610 preenche o preço por busca com os mesmos valores do catálogo, só onde está vazio (e pode rodar de novo)", () => {
      const sqlText = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003009610_fontes_oficiais_ia.sql"), "utf8");
      const block = sqlText.slice(sqlText.indexOf("update public.ai_model_prices p"), sqlText.indexOf("-- ---------------------------------------------------------------- permissões"));
      expect(block).toMatch(/per_search_usd is null/);
      const fromSql = [...block.matchAll(/\('(\w+)', '([^']+)', ([0-9.]+)\)/g)].map((m) => `${m[1]}/${m[2]}=${m[3]}`).sort();
      const fromSeed = PRICE_SEED.filter((x) => typeof x.per_search_usd === "number").map((x) => `${x.provider}/${x.model}=${x.per_search_usd}`).sort();
      expect(fromSql).toEqual(fromSeed);
    });

    it("com os tetos ligados, todo modelo do catálogo (Claude, OpenAI e Gemini) já tem preço por busca: nenhum fica bloqueado por isso", () => {
      for (const price of PRICE_SEED) {
        const ref = { provider: price.provider, model: price.model } as any;
        // o Gemini tem preço, mas a busca de fontes não o aceita (SEARCH_NO_GEMINI): o único problema dele é esse, nunca o preço
        const expected = price.provider === "gemini" ? [SEARCH_NO_GEMINI] : [];
        expect(refProblems(ref, mkCfg({ caps: true, enabled: [price.provider] as any, prices: [price] }), "busca_fontes"), `${price.provider}/${price.model}`).toEqual(expected);
      }
    });

    it("refProblems: Ollama não busca; com os tetos ligados, modelo sem preço por busca é problema; outras funções não mudam", () => {
      const priced = mkCfg({ caps: true, prices: [PRICED] });
      const noSearchPrice = mkCfg({ caps: true, prices: [{ ...PRICED, per_search_usd: null }] });
      expect(refProblems(A, priced, "busca_fontes")).toEqual([]);
      expect(refProblems(A, noSearchPrice, "busca_fontes")).toEqual(["anthropic claude-sonnet-5-5: sem preço por busca cadastrado, e os tetos estão ligados.".replace("anthropic", "Claude")]);
      // sem os tetos ligados o preço por busca não é exigido
      expect(refProblems(A, mkCfg({ caps: false, prices: [{ ...PRICED, per_search_usd: null }] }), "busca_fontes")).toEqual([]);
      // outras funções (e sem função) não exigem preço por busca
      expect(refProblems(A, noSearchPrice, "criacao")).toEqual([]);
      expect(refProblems(A, noSearchPrice)).toEqual([]);
      // Ollama
      expect(refProblems(L, mkCfg(), "busca_fontes")).toEqual(["Ollama não busca na internet."]);
      expect(refProblems(L, mkCfg({ caps: true }), "busca_fontes")).toEqual(["Ollama não busca na internet."]);
      expect(refProblems(L, mkCfg())).toEqual([]);
      expect(refProblems(L, mkCfg(), "criacao")).toEqual([]);
      // Gemini: recusado na busca de fontes, com ou sem tetos; Claude e OpenAI aceitos; outras funções não mudam
      const G = { provider: "gemini", model: "gemini-3.5-flash" } as any;
      expect(refProblems(G, mkCfg(), "busca_fontes")).toEqual([SEARCH_NO_GEMINI]);
      expect(refProblems(G, mkCfg({ caps: true }), "busca_fontes")).toEqual([`Gemini gemini-3.5-flash: sem preço cadastrado, e os tetos estão ligados.`, SEARCH_NO_GEMINI]);
      expect(refProblems(G, mkCfg(), "criacao")).toEqual([]);
      expect(refProblems(G, mkCfg())).toEqual([]);
      expect(refProblems(O, mkCfg(), "busca_fontes")).toEqual([]);
      expect(SEARCH_NO_GEMINI).toBe("A busca de fontes oficiais não funciona com o Gemini: ele não consegue limitar a pesquisa aos sites oficiais. Escolha Claude ou OpenAI.");
      // a IA desligada continua sendo o primeiro problema
      expect(refProblems(A, mkCfg({ enabled: [], caps: true, prices: [PRICED] }), "busca_fontes")).toEqual(["Claude está desligada na Central de IAs."]);
    });

    it("validateFunctionConfig: só o modo sozinha, sem Ollama e máximo de buscas de 1 a 10", () => {
      const cfg = mkCfg({ caps: true, prices: [PRICED, { provider: "openai", model: "gpt-5.4", input_per_mtok: 1, output_per_mtok: 2, per_search_usd: 0.02 }] });
      expect(validateFunctionConfig(searchFc(), cfg).problems).toEqual([]);
      expect(validateFunctionConfig(searchFc({ fallback: O, max_searches: 1 }), cfg).problems).toEqual([]);
      expect(validateFunctionConfig(searchFc({ max_searches: 10 }), cfg).problems).toEqual([]);

      const wrongMode = validateFunctionConfig(searchFc({ mode: "linha", reviewers: [O], fallback: L }), cfg).problems;
      expect(wrongMode).toContain("A busca de fontes oficiais só usa o modo sozinha.");
      expect(wrongMode).toContain("Ollama não busca na internet.");
      expect(validateFunctionConfig(searchFc({ mode: "comite", reviewers: [O] }), cfg).problems).toContain("A busca de fontes oficiais só usa o modo sozinha.");
      // Ollama como principal
      expect(validateFunctionConfig(searchFc({ primary: L }), mkCfg()).problems).toContain("Ollama não busca na internet.");
      // Gemini como principal ou como reserva; Claude e OpenAI passam
      const G = { provider: "gemini", model: "gemini-3.5-flash" } as any;
      expect(validateFunctionConfig(searchFc({ primary: G }), mkCfg()).problems).toContain(SEARCH_NO_GEMINI);
      expect(validateFunctionConfig(searchFc({ fallback: G }), mkCfg()).problems).toContain(SEARCH_NO_GEMINI);
      expect(validateFunctionConfig(searchFc({ primary: A, fallback: O }), mkCfg()).problems).toEqual([]);
      expect(validateFunctionConfig({ ...searchFc({ primary: G }), key: "criacao" }, mkCfg()).problems).toEqual([]);

      for (const bad of [0, 11, -1, 2.5, "3", Number.NaN]) {
        expect(validateFunctionConfig(searchFc({ max_searches: bad }), cfg).problems, String(bad)).toContain("Máximo de buscas por pedido: de 1 a 10.");
      }
      // as outras funções não têm essas regras
      const other = { ...searchFc({ primary: L, max_searches: 99 }), key: "criacao" };
      expect(validateFunctionConfig(other, mkCfg()).problems).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- com banco

  describe("com banco", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-central-"));
    let t: FontesDb;
    const servers: http.Server[] = [];
    let token = "";
    let base = "";
    const KEY = "chave-de-teste";

    const fetchImpl = (async (url: any) => {
      if (String(url).includes("anthropic")) {
        return new Response(JSON.stringify({ data: [{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5" }, { id: "claude-x", display_name: "X" }] }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    beforeAll(async () => {
      t = await openFontesDb(path.join(tmp, "db"));
      token = await t.dev.createSession(t.ADMIN);
      const app = express();
      app.use("/api/ai-central", createAiRouter({ db: t.db }, { fetchImpl, env: { ANTHROPIC_API_KEY: KEY } as any }));
      base = await new Promise<string>((resolve) => {
        const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/ai-central`));
        servers.push(srv);
      });
    }, 300_000);
    afterAll(async () => {
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
      await t?.dev.db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }, 120_000);

    const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
    async function reset() {
      for (const q of [
        "delete from public.ai_calls",
        "delete from public.ai_functions",
        "delete from public.ai_model_prices",
        "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null",
        "update public.ai_settings set caps_enabled = false, monthly_cap_usd = null, per_run_cap_usd = null, tab_override_enabled = false",
      ]) {
        await t.dev.db.query(q);
      }
      invalidateAiConfig(t.db);
    }
    beforeEach(reset);

    const on = async (...ids: string[]) => {
      for (const id of ids) await t.db.service("ch_worker_ai_set_provider", { p_actor: t.ADMIN, p_provider: id, p_enabled: true });
    };
    const saveFn = async (k: string, primary: R | null, opts: { fallback?: R | null; max?: number | null; mode?: string } = {}) => {
      const config: Record<string, unknown> = { mode: opts.mode ?? "sozinha", primary_ref: primary, fallback_ref: opts.fallback ?? null, reviewers: [], care: "caprichado" };
      if (opts.max !== undefined) config.max_searches = opts.max;
      await t.db.service("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: k, p_config: config });
    };
    const price = async (r: R, inTok: number, outTok: number, perSearch?: number | null) => {
      const p: Record<string, unknown> = { input_per_mtok: inTok, output_per_mtok: outTok, source_url: "https://exemplo.com", checked_on: "2026-10-07" };
      if (perSearch !== undefined) p.per_search_usd = perSearch;
      await t.db.service("ch_worker_ai_save_price", { p_actor: t.ADMIN, p_provider: r.provider, p_model: r.model, p_price: p });
    };
    const settings = (s: object) => t.db.service("ch_worker_ai_save_settings", { p_actor: t.ADMIN, p_settings: s });
    const refresh = () => invalidateAiConfig(t.db);
    const rows = async (runId: string) =>
      sql(
        `select role, provider, model, outcome, error, source, item_id, function_key, input_tokens, output_tokens, web_searches, cost_usd::float8 as cost
           from public.ai_calls where run_id = $1 order by id`,
        [runId],
      );
    const callCount = async () => Number((await sql("select count(*)::int as n from public.ai_calls"))[0].n);

    type Handler = (req: any, n: number) => unknown | Promise<unknown>;
    /** Provedores falsos por ref: cada chamada passa por `handler`; devolvem os tokens e as buscas pedidos. Sem rede. */
    function fakes(handlers: Record<string, Handler>, use: { inTok?: number; outTok?: number; webSearches?: number; seenUrls?: string[] } = {}) {
      const calls: Record<string, any[]> = {};
      const makeProviderFor = (ref: R) => {
        const h = handlers[key(ref)];
        if (!h) return null;
        return {
          name: ref.provider,
          model: ref.model,
          isMock: false,
          async generate(req: any) {
            const list = (calls[key(ref)] ??= []);
            list.push(req);
            const output = await h(req, list.length);
            return { output, provider: ref.provider, model: ref.model, inputTokens: use.inTok ?? 10, outputTokens: use.outTok ?? 20, latencyMs: 1, costUsd: null, webSearches: use.webSearches ?? 1, seenUrls: use.seenUrls ?? [] };
          },
        } as any;
      };
      return { makeProviderFor, calls, total: () => Object.values(calls).reduce((a, l) => a + l.length, 0) };
    }
    const deps = (f: ReturnType<typeof fakes> | null, env: any = {}, extra: any = {}) => ({ db: t.db, env, makeProviderFor: f?.makeProviderFor, log: () => {}, ...extra });
    const run = (d: any, fn: any, req: any = SEARCH_REQ, o: any = origin, override?: any) => runFunction<any>(d, fn, req, o, override);
    const OK = () => ({ documentos: [], observacao: null });

    it("busca_fontes sem configuração não roda e não usa as variáveis de ambiente", async () => {
      await on("anthropic");
      refresh();
      const env = { CONTENT_HUB_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "x" } as NodeJS.ProcessEnv;
      const checks = functionChecks(await loadAiConfig(t.db), env);
      expect(checks.busca_fontes).toMatchObject({ source: "variaveis", ready: false, ref: null, problems: ["Desligada: configure esta função na Central de IAs."] });
      // as outras seis seguem usando as variáveis
      expect(checks.criacao).toMatchObject({ source: "variaveis", ready: true });

      const f = fakes({ [key(A)]: OK });
      const r = await run(deps(f, env), "busca_fontes");
      expect(r.status).toBe("falhou");
      expect(r.message).toMatch(/Desligada/);
      expect(r.output).toBeNull();
      // nem a escolha de uma IA por quem chama (ref ou aba) contorna a função desligada
      const r2 = await run(deps(f, env), "busca_fontes", SEARCH_REQ, origin, { ref: A, uiKind: "anthropic" });
      expect(r2.status).toBe("falhou");
      expect(f.total()).toBe(0);
      expect(await callCount()).toBe(0);
      // tirar a configuração (null) desliga de novo, sem voltar às variáveis
      await saveFn("busca_fontes", A);
      refresh();
      expect(functionChecks(await loadAiConfig(t.db), env).busca_fontes).toMatchObject({ source: "banco", ready: true });
      await t.db.service("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: "busca_fontes", p_config: null });
      refresh();
      expect(functionChecks(await loadAiConfig(t.db), env).busca_fontes.ready).toBe(false);
      expect((await run(deps(f, env), "busca_fontes")).status).toBe("falhou");
      expect(f.total()).toBe(0);
    });

    it("Gemini na busca de fontes: a rota recusa (principal e reserva), Claude e OpenAI passam, e um Gemini já salvo fica desligado e nunca busca", async () => {
      await on("anthropic", "openai", "gemini");
      refresh();
      const G: R = { provider: "gemini", model: "gemini-3.5-flash" };
      for (const r of [A, O, G]) await price(r, 1, 2, 0.01); // com preço: o único problema do Gemini é a regra da busca
      refresh();
      const put = (fn: string, config: unknown) =>
        fetch(`${base}/functions/${fn}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      for (const config of [{ mode: "sozinha", care: "caprichado", primary: G }, { mode: "sozinha", care: "caprichado", primary: A, fallback: G }]) {
        const r = await put("busca_fontes", config);
        expect(r.status).toBe(400);
        expect((await r.json()).error).toContain(SEARCH_NO_GEMINI);
      }
      expect(await sql("select 1 from public.ai_functions where key = 'busca_fontes'")).toHaveLength(0);
      expect((await put("busca_fontes", { mode: "sozinha", care: "caprichado", primary: A, fallback: O })).status).toBe(200);
      expect((await put("busca_fontes", { mode: "sozinha", care: "caprichado", primary: O })).status).toBe(200);
      // o Gemini segue valendo nas outras funções
      expect((await put("criacao", { mode: "sozinha", care: "caprichado", primary: G })).status).toBe(200);

      // configuração antiga já gravada com Gemini (por fora da função do banco): desligada com aviso, sem chamar ninguém
      for (const [primary, fallback] of [[G, null], [A, G], [G, A]] as const) {
        await sql("delete from public.ai_functions where key = 'busca_fontes'");
        await sql("insert into public.ai_functions (key, mode, primary_ref, fallback_ref, reviewers, care) values ('busca_fontes', 'sozinha', $1::jsonb, $2::jsonb, '[]'::jsonb, 'caprichado')", [JSON.stringify(primary), fallback ? JSON.stringify(fallback) : null]);
        refresh();
        const check = functionChecks(await loadAiConfig(t.db), {} as NodeJS.ProcessEnv).busca_fontes;
        expect(check.ready).toBe(false);
        expect(check.problems).toContain(SEARCH_NO_GEMINI);
        const f = fakes({ [key(A)]: OK, [key(G)]: OK, [key(O)]: OK });
        const r = await run(deps(f, {}), "busca_fontes");
        expect(r.status).toBe("falhou");
        expect(r.message).toContain("Gemini");
        expect(r.output).toBeNull();
        expect(f.total()).toBe(0);
      }
      expect(await callCount()).toBe(0);
    });

    it("só modo sozinha e sem Ollama: a validação e a rota recusam", async () => {
      await on("anthropic", "openai", "ollama");
      refresh();
      const cfg = await loadAiConfig(t.db);
      const problems = validateFunctionConfig(searchFc({ mode: "linha", reviewers: [O], fallback: L }), cfg).problems;
      expect(problems).toContain("A busca de fontes oficiais só usa o modo sozinha.");
      expect(problems).toContain("Ollama não busca na internet.");

      const put = (fn: string, config: unknown) =>
        fetch(`${base}/functions/${fn}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      const withOllama = await put("busca_fontes", { mode: "sozinha", care: "caprichado", primary: A, fallback: L });
      expect(withOllama.status).toBe(400);
      expect((await withOllama.json()).error).toContain("Ollama não busca na internet.");
      expect((await put("busca_fontes", { mode: "sozinha", care: "caprichado", primary: L })).status).toBe(400);
      const linha = await put("busca_fontes", { mode: "linha", care: "caprichado", primary: A, reviewers: [O] });
      expect(linha.status).toBe(400);
      expect((await linha.json()).problems.join(" ")).toContain("só usa o modo sozinha");
      expect(await sql("select 1 from public.ai_functions where key = 'busca_fontes'")).toHaveLength(0);
      // o Ollama segue valendo nas outras funções
      expect((await put("criacao", { mode: "sozinha", care: "caprichado", primary: L })).status).toBe(200);
    });

    it("estimativa e teto contam o máximo de buscas vezes o preço por busca", async () => {
      await on("anthropic");
      await price(A, 0, 0, 0.01);
      await settings({ monthly_cap_usd: 100, per_run_cap_usd: 0.05, caps_enabled: true });
      const f = fakes({ [key(A)]: OK }, { webSearches: 2 });

      await saveFn("busca_fontes", A, { max: 10 });
      refresh();
      const stopped = await run(deps(f), "busca_fontes");
      expect(stopped.status).toBe("parou_no_teto");
      expect(stopped.message).toMatch(/passa do teto por chamada/);
      expect(f.total()).toBe(0);
      expect((await rows(stopped.runId)).map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:teto"]);

      await saveFn("busca_fontes", A, { max: 3 });
      refresh();
      const ok = await run(deps(f), "busca_fontes");
      expect(ok.status).toBe("ok");
      expect(f.total()).toBe(1);
      expect(ok.costUsd).toBeCloseTo(0.02, 6); // as buscas feitas de verdade (2), não o máximo (3)

      // sem máximo salvo vale 5: a estimativa de 5 x 0,01 = 0,05 é igual ao teto, e só passar dele para
      await saveFn("busca_fontes", A);
      refresh();
      expect((await run(deps(f), "busca_fontes")).status).toBe("ok");
      await settings({ per_run_cap_usd: 0.04 });
      refresh();
      expect((await run(deps(f), "busca_fontes")).status).toBe("parou_no_teto");
    });

    it("o teto mensal conta a estimativa das buscas junto do gasto do mês", async () => {
      await on("anthropic");
      await price(A, 0, 0, 0.01);
      await saveFn("busca_fontes", A, { max: 4 });
      await settings({ monthly_cap_usd: 0.05, per_run_cap_usd: 1, caps_enabled: true });
      refresh();
      const f = fakes({ [key(A)]: OK }, { webSearches: 4 });
      const first = await run(deps(f), "busca_fontes"); // estimativa 0,04 cabe em 0,05
      expect(first.status).toBe("ok");
      expect(first.costUsd).toBeCloseTo(0.04, 6);
      const second = await run(deps(f), "busca_fontes"); // 0,04 gasto + 0,04 estimado passa de 0,05
      expect(second.status).toBe("parou_no_teto");
      expect(second.message).toMatch(/teto mensal/);
      expect(f.total()).toBe(1);
    });

    it("modelo sem preço por busca com os tetos ligados fica bloqueado", async () => {
      await on("anthropic");
      await price(A, 1, 2); // sem a chave: sem preço por busca
      await settings({ monthly_cap_usd: 100, per_run_cap_usd: 5, caps_enabled: true });
      await saveFn("busca_fontes", A);
      refresh();
      const cfg = await loadAiConfig(t.db);
      const check = functionChecks(cfg, {}).busca_fontes;
      expect(check.ready).toBe(false);
      expect(check.problems.join(" ")).toMatch(/sem preço por busca/);
      const f = fakes({ [key(A)]: OK });
      const r = await run(deps(f), "busca_fontes");
      expect(r.status).toBe("falhou");
      expect(r.message).toMatch(/sem preço por busca/);
      expect(f.total()).toBe(0);
      expect((await rows(r.runId)).map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:bloqueada"]);
      // a rota também recusa salvar a função assim
      const put = await fetch(`${base}/functions/busca_fontes`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ config: { mode: "sozinha", primary: A } }) });
      expect(put.status).toBe(400);
      expect((await put.json()).error).toMatch(/sem preço por busca/);

      // com o preço por busca cadastrado (mesmo 0), roda
      await price(A, 1, 2, 0);
      refresh();
      expect(functionChecks(await loadAiConfig(t.db), {}).busca_fontes.ready).toBe(true);
      expect((await run(deps(f), "busca_fontes")).status).toBe("ok");
      expect(f.total()).toBe(1);
    });

    it("ai_calls registra as buscas e o custo inclui as buscas", async () => {
      await on("anthropic");
      await price(A, 2, 10, 0.01);
      await saveFn("busca_fontes", A);
      refresh();
      const seen = ["https://www.gov.br/saude/a.pdf", "https://www.who.int/b.pdf"];
      const f = fakes({ [key(A)]: OK }, { inTok: 1000, outTok: 500, webSearches: 4, seenUrls: seen });
      const r = await run(deps(f), "busca_fontes");
      expect(r.status).toBe("ok");
      expect(r.webSearches).toBe(4);
      expect(r.seenUrls).toEqual(seen);
      expect(r.costUsd).toBeCloseTo(0.047, 6);
      const logged = await rows(r.runId);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({ role: "principal", outcome: "ok", provider: "anthropic", web_searches: 4, input_tokens: 1000, output_tokens: 500, source: "fontes", item_id: "busca-1", function_key: "busca_fontes" });
      expect(logged[0].cost).toBeCloseTo(0.047, 6);
      // o gasto do mês (que alimenta os tetos e o painel) inclui as buscas
      expect(Number(await t.db.service<any>("ch_worker_ai_month_spend", { p_now: new Date().toISOString() }))).toBeCloseTo(0.047, 6);
      // sem busca no pedido, nada de buscas no resultado
      await saveFn("criacao", A);
      refresh();
      const plain = fakes({ [key(A)]: OK }, { webSearches: 0 });
      const p = await run(deps(plain), "criacao", PLAIN_REQ);
      expect(p.webSearches).toBe(0);
      expect(p.seenUrls).toEqual([]);
      expect((await rows(p.runId))[0].web_searches).toBe(0);
    });

    it("max_searches salvo vai no pedido; sem ele, 5; o que a função manda vale mais que o do pedido", async () => {
      await on("anthropic");
      const f = fakes({ [key(A)]: OK });
      await saveFn("busca_fontes", A, { max: 3 });
      refresh();
      await run(deps(f), "busca_fontes");
      await saveFn("busca_fontes", A); // sem máximo: o padrão
      refresh();
      await run(deps(f), "busca_fontes");
      const sent = f.calls[key(A)];
      expect(sent.map((c: any) => c.webSearch.maxSearches)).toEqual([3, 5]);
      expect(sent[0].webSearch.allowedDomains).toEqual(SITES);
      expect(SEARCH_REQ.webSearch.maxSearches).toBe(99); // o pedido do chamador não é alterado
      // pedido sem busca: nada é inventado
      await saveFn("criacao", A);
      refresh();
      await run(deps(f), "criacao", PLAIN_REQ);
      expect(f.calls[key(A)][2].webSearch).toBeUndefined();
    });

    it("a configuração lê max_searches e per_search_usd do banco (nulos quando não há)", async () => {
      await on("anthropic");
      await saveFn("busca_fontes", A, { max: 7 });
      await saveFn("criacao", A);
      await price(A, 2, 10, 0.01);
      await price(O, 1, 2);
      refresh();
      const cfg = await loadAiConfig(t.db);
      expect(cfg.functions.busca_fontes?.max_searches).toBe(7);
      expect(cfg.functions.criacao?.max_searches).toBeNull();
      expect(cfg.prices.find((p) => p.model === A.model)?.per_search_usd).toBe(0.01);
      expect(cfg.prices.find((p) => p.model === O.model)?.per_search_usd).toBeNull();
    });

    it("erro depois de buscas pagas grava o gasto parcial na linha de falha (tokens, buscas e custo)", async () => {
      await on("anthropic", "openai");
      await price(A, 2, 10, 0.01);
      await price(O, 1, 2, 0.02);
      await saveFn("busca_fontes", A, { fallback: O });
      await settings({ monthly_cap_usd: 100, per_run_cap_usd: 5, caps_enabled: true });
      refresh();
      const paidFailure = (usage: any) => () => {
        throw withUsage(new Error("Resposta cortada pelo limite de saída."), usage);
      };
      const f = fakes({
        [key(A)]: paidFailure({ inputTokens: 300, outputTokens: 40, webSearches: 3 }),
        [key(O)]: paidFailure({ inputTokens: null, outputTokens: null, webSearches: 2 }),
      });
      const r = await run(deps(f), "busca_fontes");
      expect(r.status).toBe("falhou");
      const logged = await rows(r.runId);
      expect(logged.map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:falha", "principal:falha", "reserva:falha"]);
      // as duas tentativas da principal: (300 x 2 + 40 x 10) / 1e6 + 3 x 0,01
      for (const x of logged.slice(0, 2)) {
        expect(x).toMatchObject({ input_tokens: 300, output_tokens: 40, web_searches: 3 });
        expect(x.cost).toBeCloseTo(0.001 + 0.03, 6);
      }
      // a reserva não informou tokens: só as buscas contam (2 x 0,02)
      expect(logged[2]).toMatchObject({ input_tokens: 0, output_tokens: 0, web_searches: 2 });
      expect(logged[2].cost).toBeCloseTo(0.04, 6);
      expect(r.costUsd).toBeCloseTo(2 * 0.031 + 0.04, 6);
      expect(r.webSearches).toBe(3 + 3 + 2); // as buscas cobradas nas linhas de falha também contam (o custo já as inclui)
      // o gasto das falhas conta no teto mensal e no painel
      expect(Number(await t.db.service<any>("ch_worker_ai_month_spend", { p_now: new Date().toISOString() }))).toBeCloseTo(2 * 0.031 + 0.04, 6);
      // erro comum (sem gasto) continua com custo e buscas zerados
      const plain = fakes({ [key(A)]: () => { throw new Error("boom"); }, [key(O)]: OK });
      const r2 = await run(deps(plain), "busca_fontes");
      expect(r2.status).toBe("ok");
      const rows2 = await rows(r2.runId);
      expect(rows2.map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:falha", "principal:falha", "reserva:ok"]);
      expect(rows2[0]).toMatchObject({ web_searches: 0, input_tokens: 0, output_tokens: 0, cost: 0 });
    });

    it("tempo-limite da busca: cancela a chamada, espera ela parar, grava o gasto e só então chama a reserva", async () => {
      await on("anthropic", "openai");
      await price(A, 2, 10, 0.01);
      await price(O, 1, 2, 0.02);
      await saveFn("busca_fontes", A, { fallback: O });
      refresh();
      let active = 0;
      let maxActive = 0;
      const signals: (AbortSignal | undefined)[] = [];
      // a chamada fica pendente até o sinal disparar; então termina na hora, com o gasto das buscas já concluídas
      const hang = (req: any) => {
        signals.push(req.signal);
        active++;
        maxActive = Math.max(maxActive, active);
        return new Promise((_, reject) => {
          req.signal.addEventListener(
            "abort",
            () => {
              active--;
              reject(withUsage(new Error("Chamada cancelada."), { inputTokens: 100, outputTokens: 10, webSearches: 2 }));
            },
            { once: true },
          );
        });
      };
      const f = fakes({ [key(A)]: hang, [key(O)]: hang });
      const r = await run(deps(f, {}, { timeouts: { searchMs: 40 } }), "busca_fontes");
      expect(r.status).toBe("falhou");
      // tempo esgotado não se repete na mesma IA (shouldRetrySame): vai direto para a reserva, depois que a principal parou
      expect(f.calls[key(A)]).toHaveLength(1);
      expect(f.calls[key(O)]).toHaveLength(1);
      expect(maxActive).toBe(1);
      expect(signals.every((s) => s instanceof AbortSignal && s.aborted)).toBe(true);
      expect(signals[0]).not.toBe(signals[1]);
      const logged = await rows(r.runId);
      expect(logged.map((x: any) => `${x.role}:${x.outcome}`)).toEqual(["principal:falha", "reserva:falha"]);
      for (const x of logged) {
        expect(x.error).toMatch(/Tempo esgotado/);
        expect(x).toMatchObject({ input_tokens: 100, output_tokens: 10, web_searches: 2 });
      }
      // o gasto das buscas concluídas conta; vale o maior entre ele e o pior caso estimado da chamada (as buscas máximas, 5)
      expect(logged[0].cost).toBeGreaterThanOrEqual((100 * 2 + 10 * 10) / 1e6 + 0.02);
      expect(r.message).toMatch(/Tempo esgotado/);
    });

    it("tempo-limite da busca: provedor que ignora o sinal não trava a execução", async () => {
      await on("anthropic");
      await saveFn("busca_fontes", A);
      refresh();
      const f = fakes({ [key(A)]: () => new Promise(() => {}) });
      const r = await run(deps(f, {}, { timeouts: { searchMs: 30, graceMs: 30 } }), "busca_fontes");
      expect(r.status).toBe("falhou");
      expect(f.total()).toBe(1);
      expect(r.message).toMatch(/Tempo esgotado/);
      expect((await rows(r.runId)).map((x: any) => x.outcome)).toEqual(["falha"]);
    });

    it("tempo-limite da busca: a resposta que chega durante a espera vale (já foi paga)", async () => {
      await on("anthropic");
      await price(A, 2, 10, 0.01);
      await saveFn("busca_fontes", A);
      refresh();
      const late = (req: any) => new Promise((resolve) => req.signal.addEventListener("abort", () => setTimeout(() => resolve({ documentos: [], observacao: null }), 5), { once: true }));
      const f = fakes({ [key(A)]: late }, { webSearches: 2 });
      const r = await run(deps(f, {}, { timeouts: { searchMs: 30, graceMs: 500 } }), "busca_fontes");
      expect(r.status).toBe("ok");
      expect(r.webSearches).toBe(2);
    });

    it("chamada sem busca segue como antes: tempo-limite de sempre, sem espera depois do cancelamento", async () => {
      await on("anthropic");
      await saveFn("criacao", A);
      refresh();
      const f = fakes({ [key(A)]: OK }, { webSearches: 0 });
      await run(deps(f), "criacao", PLAIN_REQ);
      // o sinal do cancelamento vai em toda chamada (o maestro cancela no tempo-limite); aqui não disparou
      expect(f.calls[key(A)][0].signal).toBeInstanceOf(AbortSignal);
      expect(f.calls[key(A)][0].signal.aborted).toBe(false);
    });

    it("rotas: o máximo de buscas da função, o preço por busca e a atualização da lista", async () => {
      const call = (method: string, p: string, body?: unknown) =>
        fetch(base + p, { method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const putFn = (fn: string, config: unknown) => call("PUT", `/functions/${fn}`, { config });
      const maxOf = async (fn: string) => (await sql("select max_searches from public.ai_functions where key = $1", [fn]))[0]?.max_searches;
      expect((await call("POST", "/providers/anthropic/enabled", { enabled: true })).status).toBe(200);
      // o modelo pago precisa de preço para a função ser salva (IA09)
      await price(A, 2, 10, 0.01);
      refresh();

      // máximo de 1 a 10, inteiro
      for (const bad of [0, 11, -3, 2.5, "3", true]) {
        const r = await putFn("busca_fontes", { mode: "sozinha", primary: A, max_searches: bad });
        expect(r.status, String(bad)).toBe(400);
        expect((await r.json()).error, String(bad)).toContain("Máximo de buscas por pedido: de 1 a 10.");
      }
      expect(await sql("select 1 from public.ai_functions where key = 'busca_fontes'")).toHaveLength(0);
      for (const good of [1, 7, 10]) {
        expect((await putFn("busca_fontes", { mode: "sozinha", primary: A, max_searches: good })).status, String(good)).toBe(200);
        expect(await maxOf("busca_fontes")).toBe(good);
      }
      expect((await putFn("busca_fontes", { mode: "sozinha", primary: A })).status).toBe(200);
      expect(await maxOf("busca_fontes")).toBeNull();
      expect((await putFn("busca_fontes", { mode: "sozinha", primary: A, max_searches: null })).status).toBe(200);
      expect(await maxOf("busca_fontes")).toBeNull();
      // nas outras funções o campo não vale
      expect((await putFn("criacao", { mode: "sozinha", primary: A, max_searches: 4 })).status).toBe(200);
      expect(await maxOf("criacao")).toBeNull();
      // tirar a configuração desliga a busca
      expect(await (await putFn("busca_fontes", null)).json()).toEqual({ ok: true, warnings: [] });
      expect(await sql("select 1 from public.ai_functions where key = 'busca_fontes'")).toHaveLength(0);

      // preço por busca: número >= 0 ou nulo; sem a chave o valor guardado fica
      const putPrice = (body: object) => call("PUT", "/prices/anthropic/claude-sonnet-5-5", { input_per_mtok: 2, output_per_mtok: 10, ...body });
      const perSearch = async () => (await sql("select per_search_usd::float8 as v from public.ai_model_prices where provider = 'anthropic' and model = 'claude-sonnet-5-5'"))[0]?.v;
      expect((await putPrice({ per_search_usd: 0.01 })).status).toBe(200);
      expect(await perSearch()).toBe(0.01);
      expect((await putPrice({})).status).toBe(200);
      expect(await perSearch()).toBe(0.01);
      expect((await putPrice({ per_search_usd: 0 })).status).toBe(200);
      expect(await perSearch()).toBe(0);
      expect((await putPrice({ per_search_usd: null })).status).toBe(200);
      expect(await perSearch()).toBeNull();
      for (const bad of [-0.01, "0.01", true, [0.01]]) {
        const r = await putPrice({ per_search_usd: bad });
        expect(r.status, String(bad)).toBe(400);
        expect((await r.json()).error, String(bad)).toContain("preço por busca");
      }
      expect(await perSearch()).toBeNull();

      // atualizar a lista cadastra o preço por busca do seed (só para o modelo ainda sem preço)
      await sql("delete from public.ai_model_prices");
      refresh();
      const refreshed = await (await call("POST", "/providers/anthropic/refresh", {})).json();
      expect(refreshed.prices_added).toBe(1);
      expect(await perSearch()).toBe(0.01);
      // preço que o dono já ajustou não é sobrescrito pela atualização
      expect((await putPrice({ per_search_usd: 0.02 })).status).toBe(200);
      expect((await (await call("POST", "/providers/anthropic/refresh", {})).json()).prices_added).toBe(0);
      expect(await perSearch()).toBe(0.02);

      // linha que já existe com o preço por busca VAZIO: a atualização preenche só esse campo (0,01 do catálogo) e não toca
      // no preço por token que o dono digitou; depois de preenchido, nunca mais sobrescreve
      expect((await call("PUT", "/prices/anthropic/claude-sonnet-5-5", { input_per_mtok: 7, output_per_mtok: 8, per_search_usd: null })).status).toBe(200);
      const filled = await (await call("POST", "/providers/anthropic/refresh", {})).json();
      expect(filled.prices_added).toBe(0);
      expect(await perSearch()).toBe(0.01);
      expect((await sql("select input_per_mtok::float8 as i, output_per_mtok::float8 as o from public.ai_model_prices where model = 'claude-sonnet-5-5'"))[0]).toEqual({ i: 7, o: 8 });
      await call("PUT", "/prices/anthropic/claude-sonnet-5-5", { input_per_mtok: 7, output_per_mtok: 8, per_search_usd: 0.5 });
      await call("POST", "/providers/anthropic/refresh", {});
      expect(await perSearch()).toBe(0.5);
    });
  });
});
