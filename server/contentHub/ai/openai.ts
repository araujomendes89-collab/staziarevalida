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
import { AiInvalidOutput, type AiProvider, type StructuredRequest, type StructuredResult, type WebSearchOptions } from "./provider";
import { validate } from "./schema";
import { hostsOf, parseOrConvert, sumTokens } from "./webSearch";

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
        max_completion_tokens: Math.max(req.maxOutputTokens ?? 8192, 4096),
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`OpenAI respondeu ${res.status}${body ? `: ${body}` : ""}`);
    }
    const data = (await res.json()) as any;
    const choice = data?.choices?.[0];
    if (choice?.message?.refusal) throw new Error(`O provedor recusou a solicitação (${String(choice.message.refusal).slice(0, 120)}).`);
    if (choice?.finish_reason === "length") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null);
    let raw: unknown;
    try {
      raw = JSON.parse(choice?.message?.content ?? "");
    } catch {
      throw new AiInvalidOutput("Resposta não é JSON.", choice?.message?.content);
    }
    const errors = validate(req.schema, raw);
    if (errors.length) throw new AiInvalidOutput(`Resposta fora do formato: ${errors.slice(0, 5).join("; ")}`, raw);
    const inTok = data?.usage?.prompt_tokens ?? null;
    const outTok = data?.usage?.completion_tokens ?? null;
    return { output: raw as T, provider: this.name, model: data?.model ?? this.model, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - t0, costUsd: this.price(inTok, outTok) };
  }

  /**
   * Com busca na internet: API Responses, ferramenta `web_search` filtrada pelos sites da lista (o filtro só tem host, sem
   * caminho) e pedindo as fontes de cada busca. Sem resposta estruturada: a IA termina o texto com o JSON (ver webSearch.ts).
   * Se o JSON não servir, a conversão curta, sem busca, vai pelo `/chat/completions` de sempre.
   */
  private async generateWithSearch<T>(req: StructuredRequest, search: WebSearchOptions): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    const res = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        instructions: req.system,
        input: req.input,
        tools: [{ type: "web_search", filters: { allowed_domains: hostsOf(search.allowedDomains) } }],
        include: ["web_search_call.action.sources"],
        max_output_tokens: Math.max(req.maxOutputTokens ?? 8192, 4096),
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`OpenAI respondeu ${res.status}${body ? `: ${body}` : ""}`);
    }
    const data = (await res.json()) as any;
    if (data?.status === "incomplete") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null);
    if (data?.status === "failed") throw new Error(`OpenAI não concluiu a resposta${data?.error?.message ? `: ${String(data.error.message).slice(0, 300)}` : "."}`);
    let webSearches = 0;
    const seen = new Set<string>();
    const texts: string[] = [];
    for (const item of Array.isArray(data?.output) ? data.output : []) {
      if (item?.type === "web_search_call") {
        webSearches++;
        for (const source of Array.isArray(item.action?.sources) ? item.action.sources : []) if (typeof source?.url === "string" && source.url) seen.add(source.url);
      } else if (item?.type === "message") {
        const parts: any[] = Array.isArray(item.content) ? item.content : [];
        const refusal = parts.find((p) => p?.type === "refusal");
        if (refusal) throw new Error(`O provedor recusou a solicitação (${String(refusal.refusal ?? "").slice(0, 120)}).`);
        const text = parts.filter((p) => p?.type === "output_text").map((p) => String(p.text ?? "")).join("");
        if (text) texts.push(text);
      }
    }
    const { output, extra } = await parseOrConvert<T>(req, texts.join("\n"), (r) => this.generate<T>(r));
    const inTok = sumTokens(data?.usage?.input_tokens, extra?.inputTokens);
    const outTok = sumTokens(data?.usage?.output_tokens, extra?.outputTokens);
    return { output, provider: this.name, model: data?.model ?? this.model, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - t0, costUsd: this.price(inTok, outTok), webSearches, seenUrls: [...seen] };
  }
}
