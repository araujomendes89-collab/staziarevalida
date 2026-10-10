// @vitest-environment node
/**
 * Fontes oficiais com IA, parte da IA. "Provedores": a busca na internet em cada provedor (Claude, OpenAI, Gemini; o Ollama
 * recusa), o JSON que a IA deixa no fim do texto e a conversão curta, sem busca, quando esse JSON não serve. Clientes e
 * `fetch` falsos: nenhum teste chama IA real nem a internet.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiInvalidOutput, AnthropicProvider, GeminiProvider, anthropicSearchTool, type StructuredRequest, type StructuredResult } from "../../server/contentHub/ai/provider";
import { OpenAIProvider } from "../../server/contentHub/ai/openai";
import { OllamaProvider } from "../../server/contentHub/ai/ollama";
import { asDocument } from "../../server/contentHub/ai/prompts";
import { CONVERT_SYSTEM, MAX_CONTINUATIONS, extractTrailingJson, hostsOf, parseOrConvert } from "../../server/contentHub/ai/webSearch";

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

/** Cliente da Anthropic que guarda uma CÓPIA dos parâmetros de cada chamada e devolve as respostas na ordem. */
function fakeAnthropic(replies: any[]) {
  const calls: any[] = [];
  const client = {
    messages: {
      create: async (p: any) => {
        calls.push(JSON.parse(JSON.stringify(p)));
        if (!replies[calls.length - 1]) throw new Error(`resposta ${calls.length} não preparada no teste`);
        return replies[calls.length - 1];
      },
    },
  };
  return { client, calls };
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

/** `fetch` falso da OpenAI: guarda url, cabeçalhos e corpo de cada chamada e devolve as respostas na ordem. */
function fakeFetch(replies: { body: unknown; status?: number }[]) {
  const calls: { url: string; headers: any; body: any }[] = [];
  const f = (async (url: string, init: any) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    const r = replies[calls.length - 1];
    if (!r) throw new Error(`resposta ${calls.length} não preparada no teste`);
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

/** Cliente do Gemini que guarda uma cópia dos parâmetros de cada chamada. */
function fakeGemini(replies: any[]) {
  const calls: any[] = [];
  const client = {
    models: {
      generateContent: async (p: any) => {
        calls.push(JSON.parse(JSON.stringify(p)));
        if (!replies[calls.length - 1]) throw new Error(`resposta ${calls.length} não preparada no teste`);
        return replies[calls.length - 1];
      },
    },
  };
  return { client, calls };
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

  it("Claude: pause_turn continua até 3 vezes e soma buscas e links", async () => {
    expect(MAX_CONTINUATIONS).toBe(3);
    // 4 respostas pausadas (a primeira chamada + 3 continuações): no limite o servidor para de buscar e faz a conversão
    // sem busca com o texto acumulado. Contagem real: 4 chamadas com busca + 1 de conversão = 5; as buscas são as 4 x 2.
    const replies = [paused(1), paused(2), paused(3), paused(4), claudeMsg({ content: [{ type: "text", text: JSON.stringify(RESULT) }], usage: { input_tokens: 300, output_tokens: 80 } })];
    const { client, calls } = fakeAnthropic(replies);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(5);
    expect(calls.slice(0, 4).every((c) => c.tools?.[0]?.name === "web_search")).toBe(true);
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
    expect(r.seenUrls).toEqual([1, 2, 3, 4].flatMap((n) => [`https://www.gov.br/saude/a${n}.pdf`, `https://bvsms.saude.gov.br/b${n}.pdf`]));
    expect(r.inputTokens).toBe(4 * 100 + 300);
    expect(r.outputTokens).toBe(4 * 10 + 80);
  });

  it("Claude: pause_turn que termina antes do limite usa o JSON do texto, sem conversão", async () => {
    const replies = [paused(1), claudeMsg({ usage: { input_tokens: 150, output_tokens: 30, server_tool_use: { web_search_requests: 1 } } })];
    const { client, calls } = fakeAnthropic(replies);
    const r = await new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate<typeof RESULT>(req());
    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toEqual([{ role: "user", content: "pedido" }, { role: "assistant", content: replies[0].content }]);
    expect(calls[1].tools).toBeDefined();
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ webSearches: 3, inputTokens: 250, outputTokens: 40, seenUrls: ["https://www.gov.br/saude/a1.pdf", "https://bvsms.saude.gov.br/b1.pdf"] });
  });

  it("Claude: no limite do pause_turn sem nenhum texto não gasta uma conversão à toa", async () => {
    const mute = () => claudeMsg({ stop_reason: "pause_turn", content: searchBlocks("m", ["https://www.gov.br/saude/m.pdf"]), usage: { input_tokens: 10, output_tokens: 1, server_tool_use: { web_search_requests: 1 } } });
    const { client, calls } = fakeAnthropic([mute(), mute(), mute(), mute()]);
    await expect(new AnthropicProvider("chave", "claude-sonnet-5-5", client).generate(req())).rejects.toBeInstanceOf(AiInvalidOutput);
    expect(calls).toHaveLength(4);
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
    // o JSON vem no texto: nada de resposta estruturada junto da busca
    expect(calls[0].body.response_format).toBeUndefined();
    expect(calls[0].body.text).toBeUndefined();
    expect(r.output).toEqual(RESULT);
    expect(r).toMatchObject({ provider: "openai", model: "modelo-x-2026-10", inputTokens: 500, outputTokens: 120, webSearches: 2 });
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
});
