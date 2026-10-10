/**
 * Provedor Ollama (modelos locais no Mac do dono), sem biblioteca nova: só `fetch`.
 *
 *   OLLAMA_BASE_URL   endereço do Ollama (padrão http://localhost:11434); sem chave
 *
 * Roda só onde o endereço responde (o Mac). A resposta é validada pelo nosso validador de schema; fora do formato é
 * recusada, nunca "consertada". Modelo local não custa nada: costUsd = 0.
 */
import { toProviderSchema, validate } from "./schema";
import { AiInvalidOutput, type AiProvider, type StructuredRequest, type StructuredResult } from "./provider";

export class OllamaProvider implements AiProvider {
  readonly name = "ollama";
  readonly isMock = false;
  constructor(
    private baseUrl: string,
    readonly model: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    // o Ollama roda no Mac e não tem ferramenta de busca: quem pede busca precisa de outra IA
    if (req.webSearch) throw new Error("Ollama não busca na internet.");
    const t0 = Date.now();
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.input },
        ],
        format: toProviderSchema(req.schema),
        stream: false,
        options: { num_predict: req.maxOutputTokens ?? 8192 },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`Ollama respondeu ${res.status}.`);
    const data = (await res.json().catch(() => null)) as any;
    const content = data?.message?.content;
    let raw: unknown;
    try {
      raw = JSON.parse(content ?? "");
    } catch {
      throw new AiInvalidOutput("Resposta não é JSON.", content);
    }
    const errors = validate(req.schema, raw);
    if (errors.length) throw new AiInvalidOutput(`Resposta fora do formato: ${errors.slice(0, 5).join("; ")}`, raw);
    return {
      output: raw as T,
      provider: this.name,
      model: this.model,
      inputTokens: data?.prompt_eval_count ?? null,
      outputTokens: data?.eval_count ?? null,
      latencyMs: Date.now() - t0,
      costUsd: 0,
    };
  }
}
