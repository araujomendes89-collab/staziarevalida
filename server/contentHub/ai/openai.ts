/**
 * Provedor OpenAI (Chat Completions com resposta estruturada), sem biblioteca nova: só `fetch`.
 * Com busca na internet (`req.webSearch`) usa a API Responses (`/responses`), a única que tem a ferramenta `web_search`.
 *
 *   OPENAI_API_KEY             chave (só no servidor)
 *   CONTENT_HUB_OPENAI_MODEL   modelo — obrigatório de propósito: não se adivinha o modelo de quem paga a conta
 *
 * A resposta é sempre validada pelo nosso validador de schema; fora do formato é recusada, nunca "consertada".
 */
import { toProviderSchema } from "./schema";
import { AiInvalidOutput, AiRefused, FETCH_TIMEOUT_MS, SEARCH_TIMEOUT_MS, fetchSignal, withUsage, type AiProvider, type AiUsage, type PartialUsage, type StructuredRequest, type StructuredResult, type WebSearchOptions } from "./provider";
import { validate } from "./schema";
import { hostsOf, ownError, parseOrConvert, sumTokens, throwIfCancelled, timeoutError } from "./webSearch";

/**
 * Cuidado na OpenAI (correção IA07, 2026-10-10; página oficial "Reasoning"): Rápido manda reasoning_effort "low" nos modelos de
 * raciocínio (GPT-5, GPT-6, série o, menos as variantes de conversa "-chat"); Caprichado usa o padrão do modelo. Outros modelos
 * e pedidos sem o Cuidado da Central (o Tutor, por exemplo) não recebem nada.
 */
export function openAiReasoningEffort(model: string, care: string | undefined): boolean {
  const m = String(model ?? "").trim().toLowerCase();
  return care === "rapido" && /^(gpt-5|gpt-6|o\d)/.test(m) && !m.includes("-chat");
}

/**
 * O max_completion_tokens que o provedor da OpenAI manda: o pedido (padrão 8.192), no mínimo 4.096. A estimativa dos tetos usa
 * esta mesma conta (effectiveMaxOut, revisão rodada 5).
 */
export function openAiMaxCompletionTokens(requested?: number): number {
  return Math.max(requested ?? 8192, 4096);
}

export class OpenAIProvider implements AiProvider {
  readonly name = "openai";
  readonly isMock = false;
  constructor(
    private apiKey: string,
    readonly model: string,
    private fetchImpl: typeof fetch = fetch,
    private baseUrl = "https://api.openai.com/v1",
    private price: (i: number | null, o: number | null) => number | null = () => null,
  ) {}

  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    if (req.webSearch) return this.generateWithSearch<T>(req, req.webSearch);
    const t0 = Date.now();
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.input },
        ],
        response_format: { type: "json_schema", json_schema: { name: req.schemaName.slice(0, 60), schema: toProviderSchema(req.schema), strict: false } },
        max_completion_tokens: openAiMaxCompletionTokens(req.maxOutputTokens),
        ...(openAiReasoningEffort(this.model, req.care) ? { reasoning_effort: "low" } : {}),
      }),
      // limite próprio de 180 s e o cancelamento do maestro (tempo esgotado)
      signal: fetchSignal(req.signal),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`OpenAI respondeu ${res.status}${body ? `: ${body}` : ""}`);
    }
    const data = (await res.json()) as any;
    const choice = data?.choices?.[0];
    // tokens lidos antes de conferir a resposta: a que falha também é cobrada e entra no registro e nos tetos
    const inTok = data?.usage?.prompt_tokens ?? null;
    const outTok = data?.usage?.completion_tokens ?? null;
    const usage: AiUsage = { inputTokens: inTok, outputTokens: outTok };
    // recusa e filtro de conteúdo: cobrados, e repetir na mesma IA recusa igual (o maestro vai direto para a reserva)
    if (choice?.message?.refusal) throw new AiRefused("O provedor recusou a solicitação.", usage);
    if (choice?.finish_reason === "content_filter") throw new AiRefused("O provedor interrompeu a resposta: barrada pelo filtro de conteúdo.", usage);
    if (choice?.finish_reason === "length") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null, { usage, reason: "cortada" });
    let raw: unknown;
    try {
      raw = JSON.parse(choice?.message?.content ?? "");
    } catch {
      throw new AiInvalidOutput("Resposta não é JSON.", choice?.message?.content, { usage, reason: "formato" });
    }
    const errors = validate(req.schema, raw);
    if (errors.length) throw new AiInvalidOutput(`Resposta fora do formato: ${errors.slice(0, 5).join("; ")}`, raw, { usage, reason: "formato" });
    return { output: raw as T, provider: this.name, model: data?.model ?? this.model, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - t0, costUsd: this.price(inTok, outTok) };
  }

  /**
   * Com busca na internet: API Responses, ferramenta `web_search` filtrada pelos sites da lista (o filtro só tem host, sem
   * caminho) e pedindo as fontes de cada busca. O máximo de buscas vale para o pedido inteiro: `max_tool_calls` o impõe.
   * Sem resposta estruturada: a IA termina o texto com o JSON (ver webSearch.ts). Se o JSON não servir, a conversão curta,
   * sem busca, vai pelo `/chat/completions` de sempre. Erro depois da resposta (cortada, recusada, fora do esquema) leva o
   * gasto parcial (`withUsage`): as buscas e os tokens já foram cobrados. O cancelamento de quem pediu (`req.signal`) vale para as duas
   * chamadas; a conversão não começa se ele já disparou. Resposta cortada pelo limite de saída é "cortada": o maestro não repete a
   * mesma IA (pagaria as buscas de novo). O limite de saída segue a conta da chamada sem busca (openAiMaxCompletionTokens).
   */
  private async generateWithSearch<T>(req: StructuredRequest, search: WebSearchOptions): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    throwIfCancelled(req.signal);
    // erro de rede ou de cancelamento aqui não leva gasto (nada voltou); o `reason` do sinal vira um erro novo. O limite próprio
    // do fetch (o mesmo da Claude com busca) vira AiTimeout: o maestro não repete a busca paga e grava o pior caso de custo
    const data = await this.postResponses(req, search).catch((error) => {
      throw timeoutError(ownError(error, req.signal), req.signal, SEARCH_TIMEOUT_MS);
    });
    // o que a resposta gastou, contado antes de qualquer recusa: buscas = itens web_search_call
    const items: any[] = Array.isArray(data?.output) ? data.output : [];
    const spent: PartialUsage = { inputTokens: data?.usage?.input_tokens ?? null, outputTokens: data?.usage?.output_tokens ?? null, webSearches: items.filter((item) => item?.type === "web_search_call").length };
    try {
      if (data?.status === "incomplete") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null, { reason: "cortada" });
      if (data?.status === "failed") throw new Error(`OpenAI não concluiu a resposta${data?.error?.message ? `: ${String(data.error.message).slice(0, 300)}` : "."}`);
      const seen = new Set<string>();
      const texts: string[] = [];
      for (const item of items) {
        if (item?.type === "web_search_call") {
          for (const source of Array.isArray(item.action?.sources) ? item.action.sources : []) if (typeof source?.url === "string" && source.url) seen.add(source.url);
        } else if (item?.type === "message") {
          const parts: any[] = Array.isArray(item.content) ? item.content : [];
          const refusal = parts.find((p) => p?.type === "refusal");
          // como no caminho sem busca: AiRefused (o maestro não repete a busca paga); o gasto entra pelo `withUsage` do catch
          if (refusal) throw new AiRefused("O provedor recusou a solicitação.");
          const text = parts.filter((p) => p?.type === "output_text").map((p) => String(p.text ?? "")).join("");
          if (text) texts.push(text);
        }
      }
      const { output, extra } = await parseOrConvert<T>(req, texts.join("\n"), (r) => this.generate<T>(r));
      const inTok = sumTokens(spent.inputTokens, extra?.inputTokens);
      const outTok = sumTokens(spent.outputTokens, extra?.outputTokens);
      return { output, provider: this.name, model: data?.model ?? this.model, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - t0, costUsd: this.price(inTok, outTok), webSearches: spent.webSearches, seenUrls: [...seen] };
    } catch (error) {
      // a conversão que falhou já leva o seu gasto; aqui entra o da busca. A conversão (sem busca) tem o limite de 180 s do fetch:
      // se estourar, também é tempo esgotado em português, com o gasto da busca
      throw withUsage(timeoutError(ownError(error, req.signal), req.signal, FETCH_TIMEOUT_MS), spent);
    }
  }

  /** A chamada à API Responses com a busca: o corpo da resposta, ou o erro de HTTP. */
  private async postResponses(req: StructuredRequest, search: WebSearchOptions): Promise<any> {
    const res = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        instructions: req.system,
        input: req.input,
        tools: [{ type: "web_search", filters: { allowed_domains: hostsOf(search.allowedDomains) } }],
        include: ["web_search_call.action.sources"],
        max_tool_calls: search.maxSearches,
        max_output_tokens: openAiMaxCompletionTokens(req.maxOutputTokens),
      }),
      // limite próprio da chamada com busca (o mesmo da Claude, SEARCH_TIMEOUT_MS) e o cancelamento de quem pediu
      signal: fetchSignal(req.signal, SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`OpenAI respondeu ${res.status}${body ? `: ${body}` : ""}`);
    }
    return res.json();
  }
}
