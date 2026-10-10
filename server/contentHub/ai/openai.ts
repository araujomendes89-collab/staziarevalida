/**
 * Provedor OpenAI (Chat Completions com resposta estruturada), sem biblioteca nova: só `fetch`.
 *
 *   OPENAI_API_KEY             chave (só no servidor)
 *   CONTENT_HUB_OPENAI_MODEL   modelo — obrigatório de propósito: não se adivinha o modelo de quem paga a conta
 *
 * A resposta é sempre validada pelo nosso validador de schema; fora do formato é recusada, nunca "consertada".
 */
import { toProviderSchema } from "./schema";
import { AiInvalidOutput, type AiProvider, type AiUsage, type StructuredRequest, type StructuredResult } from "./provider";
import { validate } from "./schema";

/**
 * Cuidado na OpenAI (correção IA07, 2026-10-10; página oficial "Reasoning"): Rápido manda reasoning_effort "low" nos modelos de
 * raciocínio (GPT-5, GPT-6, série o, menos as variantes de conversa "-chat"); Caprichado usa o padrão do modelo. Outros modelos
 * e pedidos sem o Cuidado da Central (o Tutor, por exemplo) não recebem nada.
 */
export function openAiReasoningEffort(model: string, care: string | undefined): boolean {
  const m = String(model ?? "").trim().toLowerCase();
  return care === "rapido" && /^(gpt-5|gpt-6|o\d)/.test(m) && !m.includes("-chat");
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
        ...(openAiReasoningEffort(this.model, req.care) ? { reasoning_effort: "low" } : {}),
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
    // tokens lidos antes de conferir a resposta: a que falha também é cobrada e entra no registro e nos tetos
    const inTok = data?.usage?.prompt_tokens ?? null;
    const outTok = data?.usage?.completion_tokens ?? null;
    const usage: AiUsage = { inputTokens: inTok, outputTokens: outTok };
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
}
