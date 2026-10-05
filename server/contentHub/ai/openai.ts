/**
 * Provedor OpenAI (Chat Completions com resposta estruturada), sem biblioteca nova: só `fetch`.
 *
 *   OPENAI_API_KEY             chave (só no servidor)
 *   CONTENT_HUB_OPENAI_MODEL   modelo — obrigatório de propósito: não se adivinha o modelo de quem paga a conta
 *
 * A resposta é sempre validada pelo nosso validador de schema; fora do formato é recusada, nunca "consertada".
 */
import { toProviderSchema } from "./schema";
import { AiInvalidOutput, type AiProvider, type StructuredRequest, type StructuredResult } from "./provider";
import { validate } from "./schema";

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
}
