/**
 * Provedores de IA da Central de Conteúdo, com respostas estruturadas e validadas.
 *
 * Configuração (variáveis de ambiente do SERVIDOR; nunca no navegador):
 *   CONTENT_HUB_AI_PROVIDER        anthropic | gemini | openai | mock   (mock só fora de produção)
 *   CONTENT_HUB_AI_FALLBACK_PROVIDER   provedor secundário (nova tentativa no principal e depois nele); só para o papel de CRIAÇÃO e para conferentes independentes
 *   OPENAI_API_KEY / CONTENT_HUB_OPENAI_MODEL (modelo obrigatório)
 *   CONTENT_HUB_AI_ALLOW_EXTERNAL  1 = autoriza enviar trechos dos documentos ao provedor externo
 *   ANTHROPIC_API_KEY / CONTENT_HUB_ANTHROPIC_MODEL
 *   VERTEX_API_KEY (Vertex AI, manda) ou GEMINI_API_KEY (AI Studio) / CONTENT_HUB_GEMINI_MODEL
 *   CONTENT_HUB_PRICE_INPUT_PER_MTOK / CONTENT_HUB_PRICE_OUTPUT_PER_MTOK   (custo; sem isso fica nulo)
 *
 * Sem configuração válida, as etapas de IA ficam como pendência real — nada é simulado em produção.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { googleAiAccess, googleGenAiOptions, GOOGLE_KEY_MISSING, type GoogleAiAccess } from "../../ai/googleKey";
import { toProviderSchema, validate, type Schema } from "./schema";
import { OpenAIProvider } from "./openai";
import { FallbackProvider } from "./fallback";

export interface StructuredRequest {
  promptId: string;
  promptVersion: string;
  system: string;
  input: string;
  schema: Schema;
  schemaName: string;
  maxOutputTokens?: number;
  /** Quanto o modelo "pensa" antes de responder (Anthropic). Conversa pede resposta rápida; conferência pede cuidado. */
  effort?: "low" | "medium" | "high";
  /** Cuidado da função na Central de IAs (só a Central manda): Rápido reduz o raciocínio do Gemini e da OpenAI. */
  care?: "rapido" | "caprichado";
  /**
   * Cancelamento do pedido (o maestro cancela quando o tempo esgota). Cada provedor o entrega à sua biblioteca, que fecha a
   * conexão em vez de deixar o pedido aberto.
   */
  signal?: AbortSignal;
}

/** Limite próprio dos provedores que usam fetch (OpenAI, Ollama): 180 s. */
const FETCH_TIMEOUT_MS = 180_000;

/** O sinal do fetch: o limite próprio de 180 s e, quando houver, o cancelamento de quem chamou (o maestro). */
export function fetchSignal(outer: AbortSignal | undefined, ms = FETCH_TIMEOUT_MS): AbortSignal {
  const own = AbortSignal.timeout(ms);
  if (!outer) return own;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([outer, own]);
  const ac = new AbortController();
  for (const s of [outer, own]) {
    if (s.aborted) ac.abort(s.reason);
    else s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
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

/** Tokens de uma resposta (também da que falhou: o provedor cobra o que gerou). */
export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Por que a resposta não serviu: cortada pelo limite de saída, interrompida ou bloqueada pelo provedor, vazia (só o raciocínio)
 * ou fora do formato. Cortada e bloqueada se repetiriam iguais na mesma IA (o maestro vai direto para a reserva).
 */
export type AiInvalidReason = "cortada" | "bloqueada" | "vazia" | "formato";

export class AiInvalidOutput extends Error {
  readonly usage?: AiUsage;
  readonly reason?: AiInvalidReason;
  constructor(message: string, readonly raw: unknown, extra: { usage?: AiUsage; reason?: AiInvalidReason } = {}) {
    super(message);
    this.usage = extra.usage;
    this.reason = extra.reason;
  }
}

/**
 * A IA recusou o pedido: Claude com stop_reason "refusal"; OpenAI com message.refusal ou finish_reason "content_filter". Os tokens
 * que vieram são cobrados, e repetir o mesmo pedido na mesma IA recusa igual (o maestro vai direto para a reserva). Não é
 * AiInvalidOutput de propósito: quem repete ao receber resposta fora do formato (Tutor, Aulas, Podcasts) não repete uma recusa.
 */
export class AiRefused extends Error {
  constructor(message: string, readonly usage?: AiUsage) {
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

function checked<T>(schema: Schema, raw: unknown, usage?: AiUsage): T {
  const errors = validate(schema, raw);
  if (errors.length) throw new AiInvalidOutput(`Resposta fora do formato: ${errors.slice(0, 5).join("; ")}`, raw, { usage, reason: "formato" });
  return raw as T;
}

/**
 * Modelos do Claude que aceitam a opção de esforço (página oficial "Effort", conferida em 2026-10-10). Correção IA11: o esforço
 * ia para qualquer modelo; o Claude Haiku 4.5, por exemplo, não aceita.
 */
export const CLAUDE_EFFORT_MODELS = [
  "claude-fable-5-1",
  "claude-mythos-5-1",
  "claude-fable-5",
  "claude-mythos-5",
  "claude-mythos-preview",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-5-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-5-5",
];

/** output_config do Claude: o formato sempre; o esforço só nos modelos que aceitam (sem a data no fim do nome). */
export function anthropicOutputConfig(model: string, effort: string | undefined, schema: Schema): { effort?: string; format: { type: "json_schema"; schema: unknown } } {
  const format = { type: "json_schema" as const, schema: toProviderSchema(schema) };
  const base = String(model ?? "").trim().toLowerCase().replace(/-\d{8}$/, "");
  return CLAUDE_EFFORT_MODELS.includes(base) ? { effort: effort || process.env.CONTENT_HUB_ANTHROPIC_EFFORT || "medium", format } : { format };
}

/**
 * Como o Gemini pensa, pela família do modelo (regra de prefixo, revisão rodada 3; páginas oficiais "Thinking" do Vertex AI e do
 * AI Studio, conferidas em 10/10/2026). Vale também para os nomes com versão ou prévia (gemini-2.5-flash-preview-09-2025) e com
 * o caminho na frente (models/...):
 *   "orcamento": família 2.5 inteira (Pro, Flash e Flash-Lite). Pensa por padrão no Vertex AI ("Auto, até 8.192 tokens") e
 *     aceita só thinking_budget (thinking_level dá erro no Vertex). Mínimos: Pro 128, Flash 1, Flash-Lite 512.
 *   "nivel": Gemini 3 e seguintes. Pensa por nível (thinking_level; thinking_budget está obsoleto e pode dar erro 400); todos os
 *     de texto aceitam LOW.
 *   "apelido": gemini-flash-latest, gemini-flash-lite-latest, gemini-pro-latest (AI Studio). O Google troca o modelo por trás a
 *     cada lançamento (pode ser um 2.5 ou um 3); no AI Studio, thinking_level vale para os dois.
 *   null: modelos que não são de texto (imagem, voz, vetores, ao vivo) e os que não pensam (2.0, Gemma).
 */
type GeminiThinkingKind = "orcamento" | "nivel" | "apelido";

function geminiThinkingKind(model: string): GeminiThinkingKind | null {
  const m = String(model ?? "").trim().toLowerCase().replace(/^.*\//, "");
  if (/(image|tts|audio|live|embedding|transcribe|translate)/.test(m)) return null;
  if (/^gemini-2\.5-/.test(m)) return "orcamento";
  if (/^gemini-(?:[3-9]|\d{2,})(?:\.\d+)?-/.test(m)) return "nivel";
  if (/^gemini-[a-z-]+-latest$/.test(m)) return "apelido";
  return null;
}

/** Flash-Lite (pelo nome, também com versão, prévia ou caminho na frente): pensa o mínimo ou nada por padrão. */
const isFlashLite = (model: string) => /flash-lite/.test(String(model ?? "").trim().toLowerCase());

/**
 * Cuidado no Gemini (correção IA07, 2026-10-10; revisões rodadas 3 e 5): Rápido nunca pensa mais que o padrão do modelo;
 * Caprichado usa o padrão do modelo.
 *   Família 2.5: orçamento de 1.024 tokens (o padrão é "Auto, até 8.192"). O 2.5 Flash-Lite recebe orçamento 0 (raciocínio
 *     desligado): pelo AI Studio ele não pensa por padrão, e 1.024 ligaria o raciocínio; no Vertex AI ele pensa até 8.192.
 *     Página "Thinking" do Vertex AI: "0 turns off thinking" no 2.5 Flash e no Flash-Lite; biblioteca do Google: "0 is DISABLED".
 *   Gemini 3 e apelidos "-latest": nível baixo (LOW). Os Flash-Lite (3.1, 3.5 e o apelido gemini-flash-lite-latest) ficam no
 *     padrão: na tabela "Supported thinking levels by model" do Vertex AI (conferida em 10/10/2026) o padrão deles é MINIMAL, o
 *     menor nível, e LOW aumentaria o raciocínio.
 */
export function geminiThinking(model: string, care: string | undefined): { thinkingBudget: number } | { thinkingLevel: "LOW" } | null {
  if (care !== "rapido") return null;
  const kind = geminiThinkingKind(model);
  if (kind === "orcamento") return { thinkingBudget: isFlashLite(model) ? 0 : 1024 };
  if ((kind === "nivel" || kind === "apelido") && !isFlashLite(model)) return { thinkingLevel: "LOW" };
  return null;
}

/** Maior saída que os modelos Gemini aceitam (65.536 tokens). */
const GEMINI_MAX_OUTPUT = 65_536;

/**
 * Folga para o raciocínio no limite de saída do Gemini (falha vista em produção, 2026-10-09). O raciocínio conta DENTRO do
 * maxOutputTokens (página oficial "Thinking": "including thought tokens"); batendo no limite, a resposta sai cortada ou vazia e
 * o raciocínio é cobrado mesmo assim. O Google cobra só o que foi gerado: a folga não encarece as respostas que dão certo.
 *   Família 2.5 (Pro, Flash, Flash-Lite e nomes com versão): o orçamento mandado no Rápido (1.024; 0 no Flash-Lite, que fica sem
 *     raciocínio); senão o teto do raciocínio automático no Vertex AI (8.192).
 *   Gemini 3 (raciocínio por nível, sem orçamento fixo) e apelidos "-latest" (podem ser 2.5 ou 3): 16.384.
 *   Modelos que não são de texto ou não pensam: nada.
 */
export function geminiThinkingReserve(model: string, care: string | undefined): number {
  const kind = geminiThinkingKind(model);
  if (kind === "orcamento") return care === "rapido" ? (isFlashLite(model) ? 0 : 1024) : 8192;
  if (kind === "nivel" || kind === "apelido") return 16_384;
  return 0;
}

/** O limite de saída mandado ao Gemini: o pedido (padrão 4.096) mais a folga do raciocínio, até 65.536. */
export function geminiOutputLimit(model: string, care: string | undefined, requested?: number): number {
  return Math.min(GEMINI_MAX_OUTPUT, (requested ?? 4096) + geminiThinkingReserve(model, care));
}

/** Motivos de parada do Gemini que interrompem a resposta (o texto some ou fica pela metade), em português simples. */
const GEMINI_STOPPED: Record<string, string> = {
  SAFETY: "barrada pelo filtro de segurança",
  RECITATION: "parecida demais com texto já publicado",
  BLOCKLIST: "termo de uma lista bloqueada",
  PROHIBITED_CONTENT: "conteúdo proibido pelas regras do provedor",
  SPII: "dados pessoais sensíveis",
  LANGUAGE: "idioma não aceito",
  IMAGE_SAFETY: "barrada pelo filtro de segurança",
  IMAGE_PROHIBITED_CONTENT: "conteúdo proibido pelas regras do provedor",
  OTHER: "motivo não informado pelo provedor",
};

/**
 * O max_tokens que o provedor do Claude manda: o pedido, no mínimo 8.192 (o raciocínio do esforço também gasta saída). A
 * estimativa dos tetos usa esta mesma conta (effectiveMaxOut): um corte do Claude custa até este limite, não só o pedido (revisão
 * rodada 5: nas Aulas e nos assistentes, 6.000 pedidos viram 8.192).
 */
export function anthropicMaxTokens(requested?: number): number {
  return Math.max(requested ?? 8192, 8192);
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
    // O esforço padrão é "medium": conferência exige cuidado, mas o raciocínio também consome o limite de saída. Só vai para os
    // modelos que aceitam (anthropicOutputConfig).
    const res = await (this.client.messages.create as any)(
      {
        model: this.model,
        max_tokens: anthropicMaxTokens(req.maxOutputTokens),
        system: req.system,
        output_config: anthropicOutputConfig(this.model, req.effort, req.schema),
        messages: [{ role: "user", content: req.input }],
      },
      // tempo esgotado no maestro: a biblioteca fecha o pedido
      req.signal ? { signal: req.signal } : undefined,
    );
    const usage = res.usage as any;
    const spent: AiUsage = { inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null };
    // a recusa também é cobrada: os tokens vão junto, para o registro e os tetos
    if (res.stop_reason === "refusal") {
      throw new AiRefused(`O provedor recusou a solicitação (${res.stop_details?.category ?? "sem categoria"}).`, spent);
    }
    if (res.stop_reason === "max_tokens") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null, { usage: spent, reason: "cortada" });
    const block = (res.content as any[]).find((c) => c.type === "text");
    let raw: unknown;
    try {
      raw = JSON.parse(block?.text ?? "");
    } catch {
      throw new AiInvalidOutput("Resposta não é JSON.", block?.text, { usage: spent, reason: "formato" });
    }
    const output = checked<T>(req.schema, raw, spent);
    return { output, provider: this.name, model: res.model ?? this.model, inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, latencyMs: Date.now() - t0, costUsd: price(usage?.input_tokens ?? null, usage?.output_tokens ?? null) };
  }
}

class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  readonly isMock = false;
  private client: GoogleGenAI;
  constructor(access: GoogleAiAccess, readonly model: string) {
    this.client = new GoogleGenAI(googleGenAiOptions(access));
  }
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    const thinking = geminiThinking(this.model, req.care);
    // o raciocínio conta dentro do limite de saída: o pedido ganha a folga do raciocínio (geminiOutputLimit)
    const limit = geminiOutputLimit(this.model, req.care, req.maxOutputTokens);
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: req.input,
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseSchema: toProviderSchema(req.schema) as any,
        maxOutputTokens: limit,
        ...(thinking ? { thinkingConfig: thinking as any } : {}),
        // tempo esgotado no maestro: a biblioteca fecha o pedido (ela avisa que o Google pode cobrar o que já gerou)
        ...(req.signal ? { abortSignal: req.signal } : {}),
      },
    });
    // tokens lidos antes de conferir a resposta: a que falha também é cobrada e entra no registro e nos tetos
    const u = res.usageMetadata as any;
    const thoughts = Number(u?.thoughtsTokenCount ?? 0) || 0;
    // O raciocínio do modelo (thoughtsTokenCount) é cobrado como saída: entra na conta, senão o gasto e os tetos ficam abaixo do real.
    const outputTokens = u?.candidatesTokenCount == null && u?.thoughtsTokenCount == null ? null : (u?.candidatesTokenCount ?? 0) + thoughts;
    const usage: AiUsage = { inputTokens: u?.promptTokenCount ?? null, outputTokens };
    const text = res.text;
    // o motivo real quando a resposta não chega inteira (antes tudo virava "Resposta não é JSON.")
    const blocked = (res as any).promptFeedback?.blockReason;
    if (blocked) throw new AiInvalidOutput(`O provedor bloqueou o pedido (motivo ${blocked}).`, null, { usage, reason: "bloqueada" });
    const finish = String((res as any).candidates?.[0]?.finishReason ?? "");
    if (finish === "MAX_TOKENS") {
      throw new AiInvalidOutput(`Resposta cortada pelo limite de saída (raciocínio usou ${thoughts} de ${limit} tokens).`, text ?? null, { usage, reason: "cortada" });
    }
    if (GEMINI_STOPPED[finish]) throw new AiInvalidOutput(`O provedor interrompeu a resposta: ${GEMINI_STOPPED[finish]} (${finish}).`, text ?? null, { usage, reason: "bloqueada" });
    if (!text && thoughts > 0) throw new AiInvalidOutput("Resposta veio só com o raciocínio, sem o texto final.", null, { usage, reason: "vazia" });
    let raw: unknown;
    try {
      raw = JSON.parse(text ?? "");
    } catch {
      throw new AiInvalidOutput("Resposta não é JSON.", text, { usage, reason: "formato" });
    }
    const output = checked<T>(req.schema, raw, usage);
    // o modelo registrado é o pedido (this.model): as respostas guardadas (ch_worker_cached_run) são procuradas por ele
    return { output, provider: this.name, model: this.model, inputTokens: usage.inputTokens, outputTokens, latencyMs: Date.now() - t0, costUsd: price(usage.inputTokens, outputTokens) };
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
  /**
   * Só no maestro: a principal (provider/model acima) está bloqueada e todo pedido vai direto para a reserva. Quem responde de
   * fato e o motivo do bloqueio da principal.
   */
  viaReserve?: { provider: string; model: string; why: string };
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
export interface ResolveOptions {
  /** Autorização de envio ao provedor externo decidida por quem chama (ex.: o Tutor tem a sua própria chave de consentimento). */
  allowExternal?: boolean;
  /** Como autorizar, na mensagem de pendência. */
  allowHint?: string;
}

export function resolveProviderKind(kind: string, mockRespond?: (req: StructuredRequest) => unknown, modelOverride?: string, opts: ResolveOptions = {}): { provider: AiProvider | null; status: AiStatus } {
  const production = process.env.NODE_ENV === "production";
  const pending = (why: string) => ({ provider: null, status: { ready: false, provider: kind || null, model: null, isMock: false, pending: why } });

  if (!kind) return pending("IA não configurada: defina CONTENT_HUB_AI_PROVIDER (anthropic ou gemini) e a chave no servidor.");
  if (kind === "mock") {
    if (production) return pending("O modo de simulação não existe em produção.");
    if (!mockRespond) return pending("Simulação sem respostas definidas.");
    const p = new MockProvider(mockRespond);
    return { provider: p, status: { ready: true, provider: p.name, model: p.model, isMock: true, pending: null } };
  }
  if (!(opts.allowExternal ?? process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL === "1")) {
    return pending(opts.allowHint ?? "Envio de trechos dos documentos a um provedor externo não autorizado: defina CONTENT_HUB_AI_ALLOW_EXTERNAL=1 depois de aprovar o uso.");
  }
  if (kind === "anthropic") {
    const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (!key) return pending("ANTHROPIC_API_KEY vazia no servidor.");
    const p = new AnthropicProvider(key, modelOverride || process.env.CONTENT_HUB_ANTHROPIC_MODEL || "claude-sonnet-5-5");
    return { provider: p, status: { ready: true, provider: p.name, model: p.model, isMock: false, pending: null } };
  }
  if (kind === "gemini") {
    // Vertex AI (VERTEX_API_KEY) quando houver; senão AI Studio (GEMINI_API_KEY)
    const access = googleAiAccess();
    if (!access) return pending(GOOGLE_KEY_MISSING);
    const p = new GeminiProvider(access, modelOverride || process.env.CONTENT_HUB_GEMINI_MODEL || "gemini-2.5-pro");
    return { provider: p, status: { ready: true, provider: p.name, model: p.model, isMock: false, pending: null } };
  }
  if (kind === "openai") {
    const key = (process.env.OPENAI_API_KEY ?? "").trim();
    const model = (modelOverride || process.env.CONTENT_HUB_OPENAI_MODEL || "").trim();
    if (!key) return pending("OPENAI_API_KEY vazia no servidor.");
    if (!model) return pending("Defina CONTENT_HUB_OPENAI_MODEL (o modelo da OpenAI a usar).");
    const p = new OpenAIProvider(key, model, fetch, process.env.CONTENT_HUB_OPENAI_BASE_URL || "https://api.openai.com/v1", price);
    return { provider: p, status: { ready: true, provider: p.name, model: p.model, isMock: false, pending: null } };
  }
  return pending(`Provedor de IA desconhecido: ${kind}.`);
}

/** Provedor das etapas de criação (configuração global). */
export function resolveProvider(mockRespond?: (req: StructuredRequest) => unknown): { provider: AiProvider | null; status: AiStatus } {
  return resolveProviderKind((process.env.CONTENT_HUB_AI_PROVIDER ?? "").trim(), mockRespond);
}

/** Provedor do papel de CRIAÇÃO das análises (padrão: anthropic; CONTENT_HUB_AI_PROVIDER_CREATE e CONTENT_HUB_MODEL_CREATE). */
export function resolveCreatorProvider(mockRespond?: (req: StructuredRequest) => unknown) {
  const env = process.env;
  const primary = resolveProviderKind((env.CONTENT_HUB_AI_PROVIDER_CREATE || "anthropic").trim(), mockRespond, env.CONTENT_HUB_MODEL_CREATE);
  return withFallback(primary, mockRespond);
}

/** Acrescenta o secundário (CONTENT_HUB_AI_FALLBACK_PROVIDER) quando os dois estão prontos; senão devolve o principal como está. */
export function withFallback(primary: { provider: AiProvider | null; status: AiStatus }, mockRespond?: (req: StructuredRequest) => unknown, guard?: (secondary: AiProvider) => string | null, opts: ResolveOptions = {}) {
  const kind = (process.env.CONTENT_HUB_AI_FALLBACK_PROVIDER ?? "").trim();
  if (!kind || !primary.provider) return primary;
  const sec = resolveProviderKind(kind, mockRespond, undefined, opts);
  if (!sec.provider || sec.provider.name === primary.provider.name) return primary;
  if (guard?.(sec.provider)) return primary;       // o secundário não passa na regra de independência: não entra
  const p = new FallbackProvider(primary.provider, sec.provider, { onFallback: (i) => console.warn(`[central] IA principal falhou (${i.error}); usando ${i.to}.`) });
  return { provider: p as AiProvider, status: { ...primary.status, pending: null } };
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
  // o secundário do conferente também precisa ser de outra família que a do criador
  return withFallback(resolved, mockRespond, (sec) => (familyOfModel(sec.model) === familyOfModel(creatorModel) ? "mesma família do criador" : null));
}
