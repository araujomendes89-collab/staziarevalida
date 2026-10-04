/**
 * Provedores de IA da Central de Conteúdo, com respostas estruturadas e validadas.
 *
 * Configuração (variáveis de ambiente do SERVIDOR; nunca no navegador):
 *   CONTENT_HUB_AI_PROVIDER        anthropic | gemini | mock   (mock só fora de produção)
 *   CONTENT_HUB_AI_ALLOW_EXTERNAL  1 = autoriza enviar trechos dos documentos ao provedor externo
 *   ANTHROPIC_API_KEY / CONTENT_HUB_ANTHROPIC_MODEL
 *   GEMINI_API_KEY / CONTENT_HUB_GEMINI_MODEL
 *   CONTENT_HUB_PRICE_INPUT_PER_MTOK / CONTENT_HUB_PRICE_OUTPUT_PER_MTOK   (custo; sem isso fica nulo)
 *
 * Sem configuração válida, as etapas de IA ficam como pendência real — nada é simulado em produção.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { toProviderSchema, validate, type Schema } from "./schema";

export interface StructuredRequest {
  promptId: string;
  promptVersion: string;
  system: string;
  input: string;
  schema: Schema;
  schemaName: string;
  maxOutputTokens?: number;
}

export interface StructuredResult<T> {
  output: T;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  costUsd: number | null;
}

export class AiNotConfigured extends Error {}
export class AiInvalidOutput extends Error {
  constructor(message: string, readonly raw: unknown) {
    super(message);
  }
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  readonly isMock: boolean;
  generate<T>(request: StructuredRequest): Promise<StructuredResult<T>>;
}

function price(inputTokens: number | null, outputTokens: number | null): number | null {
  const pin = Number(process.env.CONTENT_HUB_PRICE_INPUT_PER_MTOK);
  const pout = Number(process.env.CONTENT_HUB_PRICE_OUTPUT_PER_MTOK);
  if (!pin || !pout || inputTokens == null || outputTokens == null) return null;
  return Math.round(((inputTokens * pin + outputTokens * pout) / 1_000_000) * 100000) / 100000;
}

function checked<T>(schema: Schema, raw: unknown): T {
  const errors = validate(schema, raw);
  if (errors.length) throw new AiInvalidOutput(`Resposta fora do formato: ${errors.slice(0, 5).join("; ")}`, raw);
  return raw as T;
}

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly isMock = false;
  private client: Anthropic;
  constructor(apiKey: string, readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    // Saída estruturada (output_config.format): os modelos atuais recusam tool_choice forçado (400).
    // O esforço padrão é "medium": conferência exige cuidado, mas o raciocínio também consome o limite de saída.
    const res = await (this.client.messages.create as any)({
      model: this.model,
      max_tokens: Math.max(req.maxOutputTokens ?? 8192, 8192),
      system: req.system,
      output_config: { effort: process.env.CONTENT_HUB_ANTHROPIC_EFFORT || "medium", format: { type: "json_schema", schema: toProviderSchema(req.schema) } },
      messages: [{ role: "user", content: req.input }],
    });
    const usage = res.usage as any;
    if (res.stop_reason === "refusal") {
      throw new Error(`O provedor recusou a solicitação (${res.stop_details?.category ?? "sem categoria"}).`);
    }
    if (res.stop_reason === "max_tokens") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null);
    const block = (res.content as any[]).find((c) => c.type === "text");
    let raw: unknown;
    try {
      raw = JSON.parse(block?.text ?? "");
    } catch {
      throw new AiInvalidOutput("Resposta não é JSON.", block?.text);
    }
    const output = checked<T>(req.schema, raw);
    return { output, provider: this.name, model: res.model ?? this.model, inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, latencyMs: Date.now() - t0, costUsd: price(usage?.input_tokens ?? null, usage?.output_tokens ?? null) };
  }
}

class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  readonly isMock = false;
  private client: GoogleGenAI;
  constructor(apiKey: string, readonly model: string) {
    this.client = new GoogleGenAI({ apiKey });
  }
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: req.input,
      config: { systemInstruction: req.system, responseMimeType: "application/json", responseSchema: toProviderSchema(req.schema) as any, maxOutputTokens: req.maxOutputTokens ?? 4096 },
    });
    let raw: unknown;
    try {
      raw = JSON.parse(res.text ?? "");
    } catch {
      throw new AiInvalidOutput("Resposta não é JSON.", res.text);
    }
    const output = checked<T>(req.schema, raw);
    const u = res.usageMetadata as any;
    return { output, provider: this.name, model: this.model, inputTokens: u?.promptTokenCount ?? null, outputTokens: u?.candidatesTokenCount ?? null, latencyMs: Date.now() - t0, costUsd: price(u?.promptTokenCount ?? null, u?.candidatesTokenCount ?? null) };
  }
}

/** Provedor de SIMULAÇÃO: só em desenvolvimento/testes, identificado em todas as saídas. */
export class MockProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-dev (simulação, não é IA)";
  readonly isMock = true;
  constructor(private respond: (req: StructuredRequest) => unknown) {}
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    const output = checked<T>(req.schema, this.respond(req));
    return { output, provider: this.name, model: this.model, inputTokens: null, outputTokens: null, latencyMs: Date.now() - t0, costUsd: null };
  }
}

export interface AiStatus {
  ready: boolean;
  provider: string | null;
  model: string | null;
  isMock: boolean;
  pending: string | null;   // motivo, quando não está pronto
}

/** Família do modelo (quem o treinou): conferente e criador não podem ser da mesma família. */
export function familyOfModel(model: string | null | undefined): string {
  const m = String(model ?? "").toLowerCase();
  if (!m) return "desconhecida";
  if (m.startsWith("mock")) return "mock";
  if (/claude/.test(m)) return "anthropic";
  if (/gpt|^o\d|openai|luna/.test(m)) return "openai";
  if (/gemini|gemma/.test(m)) return "google";
  if (/qwen/.test(m)) return "qwen";
  if (/llama/.test(m)) return "meta";
  if (/mistral|mixtral/.test(m)) return "mistral";
  return m.split(/[-:/]/)[0];
}

/** Escolhe o provedor para um tipo ("anthropic", "gemini", "mock"). Devolve o motivo quando não há como usar IA. */
export function resolveProviderKind(kind: string, mockRespond?: (req: StructuredRequest) => unknown, modelOverride?: string): { provider: AiProvider | null; status: AiStatus } {
  const production = process.env.NODE_ENV === "production";
  const pending = (why: string) => ({ provider: null, status: { ready: false, provider: kind || null, model: null, isMock: false, pending: why } });

  if (!kind) return pending("IA não configurada: defina CONTENT_HUB_AI_PROVIDER (anthropic ou gemini) e a chave no servidor.");
  if (kind === "mock") {
    if (production) return pending("O modo de simulação não existe em produção.");
    if (!mockRespond) return pending("Simulação sem respostas definidas.");
    const p = new MockProvider(mockRespond);
    return { provider: p, status: { ready: true, provider: p.name, model: p.model, isMock: true, pending: null } };
  }
  if (process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL !== "1") {
    return pending("Envio de trechos dos documentos a um provedor externo não autorizado: defina CONTENT_HUB_AI_ALLOW_EXTERNAL=1 depois de aprovar o uso.");
  }
  if (kind === "anthropic") {
    const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (!key) return pending("ANTHROPIC_API_KEY vazia no servidor.");
    const p = new AnthropicProvider(key, modelOverride || process.env.CONTENT_HUB_ANTHROPIC_MODEL || "claude-sonnet-5-5");
    return { provider: p, status: { ready: true, provider: p.name, model: p.model, isMock: false, pending: null } };
  }
  if (kind === "gemini") {
    const key = (process.env.GEMINI_API_KEY ?? "").trim();
    if (key.length < 30) return pending("GEMINI_API_KEY ausente ou com formato inválido no servidor.");
    const p = new GeminiProvider(key, modelOverride || process.env.CONTENT_HUB_GEMINI_MODEL || "gemini-2.5-pro");
    return { provider: p, status: { ready: true, provider: p.name, model: p.model, isMock: false, pending: null } };
  }
  return pending(`Provedor de IA desconhecido: ${kind}.`);
}

/** Provedor das etapas de criação (configuração global). */
export function resolveProvider(mockRespond?: (req: StructuredRequest) => unknown): { provider: AiProvider | null; status: AiStatus } {
  return resolveProviderKind((process.env.CONTENT_HUB_AI_PROVIDER ?? "").trim(), mockRespond);
}

export type VerifierRole = "sources" | "currency" | "redteam";

/**
 * Provedor de um papel de CONFERÊNCIA. Padrão: anthropic. Cada papel pode ter o seu
 * (CONTENT_HUB_AI_PROVIDER_SOURCES / _CURRENCY / _REDTEAM) e o seu modelo (CONTENT_HUB_MODEL_<PAPEL>).
 * Regra de independência: o conferente nunca é da mesma família do modelo que criou o conteúdo.
 */
export function resolveRoleProvider(role: VerifierRole, creatorModel: string | null | undefined, mockRespond?: (req: StructuredRequest) => unknown) {
  const env = process.env;
  const key = role.toUpperCase();
  const kind = (env[`CONTENT_HUB_AI_PROVIDER_${key}`] || env.CONTENT_HUB_VERIFIER_PROVIDER || "anthropic").trim();
  const resolved = resolveProviderKind(kind, mockRespond, env[`CONTENT_HUB_MODEL_${key}`]);
  if (resolved.provider && familyOfModel(resolved.provider.model) === familyOfModel(creatorModel)) {
    return {
      provider: null as AiProvider | null,
      status: { ...resolved.status, ready: false, pending: `Sem independência: o conferente (${resolved.provider.model}) é da mesma família do criador (${creatorModel}). Use outro provedor para o papel "${role}".` },
    };
  }
  return resolved;
}
