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
import { MAX_CONTINUATIONS, parseOrConvert, sumTokens } from "./webSearch";

/**
 * Busca na internet pedida ao provedor: só estes sites (endereços da lista, com ou sem caminho) e até este número de buscas
 * NO PEDIDO INTEIRO (não por chamada). Cada provedor impõe o que a sua API deixa: a Claude, os sites e o máximo (cada
 * continuação de `pause_turn` leva só o que sobra do máximo; sem sobra, para de buscar); a OpenAI, os sites (por host, sem
 * caminho) e o máximo (`max_tool_calls`); o Gemini, nenhum dos dois. O servidor confere cada link depois, então os sites
 * que o provedor não impõe não abrem brecha; o que passar do máximo aparece em `webSearches` (o cobrado de verdade).
 */
export interface WebSearchOptions {
  allowedDomains: string[];
  maxSearches: number;
}

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
  /**
   * Com busca na internet o provedor NÃO pede JSON estruturado junto da ferramenta: a IA termina o texto com o JSON, que
   * é conferido pelo esquema (inválido → uma chamada curta, sem busca, só para converter). Ver webSearch.ts.
   */
  webSearch?: WebSearchOptions;
}

export interface StructuredResult<T> {
  output: T;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  costUsd: number | null;
  /** Só nas chamadas com busca: quantas buscas o provedor cobra. */
  webSearches?: number;
  /** Só nas chamadas com busca: os links que a busca mostrou (sinal, não prova: quem prova é o servidor baixando o arquivo). */
  seenUrls?: string[];
}

export class AiNotConfigured extends Error {}
export class AiInvalidOutput extends Error {
  constructor(message: string, readonly raw: unknown) {
    super(message);
  }
}

/** O que uma ou mais chamadas já gastaram: tokens (nulo = o provedor não disse) e buscas cobradas. */
export interface PartialUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  webSearches: number;
}

const isTokenCount = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));

/**
 * O gasto parcial que um erro leva (`error.usage`), ou nulo. Erro depois de buscas pagas (corte por limite de saída numa
 * continuação, texto vazio depois das pausas, conversão fora do esquema, recusa...) não pode sumir com o que já foi cobrado:
 * quem registra a falha grava esse gasto, e o teto mensal e o custo da Central não ficam abaixo do real.
 */
export function partialUsageOf(error: unknown): PartialUsage | null {
  if (!error || typeof error !== "object") return null;
  const u = (error as { usage?: unknown }).usage;
  if (!u || typeof u !== "object") return null;
  const { inputTokens, outputTokens, webSearches } = u as Record<string, unknown>;
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens) || typeof webSearches !== "number" || !Number.isFinite(webSearches)) return null;
  return { inputTokens, outputTokens, webSearches };
}

/**
 * Soma `usage` ao gasto que o erro já leva (cada camada acrescenta o seu: a conversão leva a dela, quem chamou soma a busca)
 * e devolve o próprio erro, para `throw withUsage(e, ...)`. Gasto vazio (nada informado, nenhuma busca) não marca o erro: a
 * chamada que cai antes de gastar não leva uso. O que não é objeto passa como está.
 */
export function withUsage<E>(error: E, usage: PartialUsage): E {
  if (!error || typeof error !== "object") return error;
  if (usage.inputTokens == null && usage.outputTokens == null && !(usage.webSearches > 0)) return error;
  const before = partialUsageOf(error);
  const total: PartialUsage = before
    ? { inputTokens: sumTokens(before.inputTokens, usage.inputTokens), outputTokens: sumTokens(before.outputTokens, usage.outputTokens), webSearches: before.webSearches + usage.webSearches }
    : { ...usage };
  try {
    (error as { usage?: PartialUsage }).usage = total;
  } catch {
    // erro congelado: segue sem o gasto, a mensagem original é o que importa
  }
  return error;
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

/** Versão da ferramenta de busca da Claude: a nova só nos modelos que a aceitam (Opus 5 e 4.6 a 4.8, Sonnet 5 e 4.6). */
export function anthropicSearchTool(model: string): "web_search_20260209" | "web_search_20250305" {
  return /^claude-(opus-(5|4-[678])|sonnet-(5|4-6))/.test(model) ? "web_search_20260209" : "web_search_20250305";
}

/** O esforço padrão é "medium": conferência exige cuidado, mas o raciocínio também consome o limite de saída. */
const anthropicEffort = (req: StructuredRequest) => req.effort || process.env.CONTENT_HUB_ANTHROPIC_EFFORT || "medium";

/** O que o provedor usa do cliente da Anthropic (o de verdade, ou um falso nos testes). */
type MessagesClient = { messages: { create(params: any): Promise<any> } };

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly isMock = false;
  private client: MessagesClient;
  constructor(apiKey: string, readonly model: string, client?: MessagesClient) {
    this.client = client ?? new Anthropic({ apiKey });
  }
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    if (req.webSearch) return this.generateWithSearch<T>(req, req.webSearch);
    const t0 = Date.now();
    // Saída estruturada (output_config.format): os modelos atuais recusam tool_choice forçado (400).
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: Math.max(req.maxOutputTokens ?? 8192, 8192),
      system: req.system,
      output_config: { effort: anthropicEffort(req), format: { type: "json_schema", schema: toProviderSchema(req.schema) } },
      messages: [{ role: "user", content: req.input }],
    });
    const usage = res.usage as any;
    const spent: PartialUsage = { inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, webSearches: 0 };
    try {
      const output = this.parseStructured<T>(req, res);
      return { output, provider: this.name, model: res.model ?? this.model, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens, latencyMs: Date.now() - t0, costUsd: price(spent.inputTokens, spent.outputTokens) };
    } catch (error) {
      throw withUsage(error, spent); // a chamada foi paga mesmo que a resposta não sirva
    }
  }

  /** A resposta estruturada de uma chamada sem busca; recusa, corte e fora do formato são erros. */
  private parseStructured<T>(req: StructuredRequest, res: any): T {
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
    return checked<T>(req.schema, raw);
  }

  /**
   * Com busca na internet: a ferramenta `web_search` roda no servidor da Anthropic e a resposta termina com o JSON no texto
   * (sem `format`, ver webSearch.ts). `pause_turn` é o servidor pausando um turno longo: reenvia-se a pergunta com cada
   * resposta pausada, até `MAX_CONTINUATIONS` vezes depois da primeira chamada.
   *
   * O máximo de buscas vale para o PEDIDO inteiro, não para cada chamada (`max_uses` da Anthropic é por chamada): cada
   * continuação manda o máximo menos as buscas já cobradas. Sem sobra, ou no limite das continuações, para de buscar: o
   * texto acumulado vai para `parseOrConvert`, que usa o JSON dele ou faz a conversão curta, sem busca.
   *
   * Erro depois de buscas pagas leva o gasto parcial (`withUsage`): a chamada que falha não apaga o que já foi cobrado.
   */
  private async generateWithSearch<T>(req: StructuredRequest, search: WebSearchOptions): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    const toolType = anthropicSearchTool(this.model);
    const messages: any[] = [{ role: "user", content: req.input }];
    const texts: string[] = [];
    const seen = new Set<string>();
    const spent: PartialUsage = { inputTokens: null, outputTokens: null, webSearches: 0 };
    let model = this.model;
    try {
      for (let continuation = 0; ; continuation++) {
        const res = await this.client.messages.create({
          model: this.model,
          max_tokens: Math.max(req.maxOutputTokens ?? 8192, 8192),
          system: req.system,
          tools: [{ type: toolType, name: "web_search", allowed_domains: search.allowedDomains, max_uses: search.maxSearches - spent.webSearches }],
          output_config: { effort: anthropicEffort(req) },
          messages: [...messages],
        });
        const usage = res.usage as any;
        spent.webSearches += usage?.server_tool_use?.web_search_requests ?? 0;
        spent.inputTokens = sumTokens(spent.inputTokens, usage?.input_tokens);
        spent.outputTokens = sumTokens(spent.outputTokens, usage?.output_tokens);
        model = res.model ?? model;
        const content: any[] = Array.isArray(res.content) ? res.content : [];
        // o texto de uma resposta pode vir partido em vários blocos (citações): emendar sem separador
        const text = content.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("");
        if (text) texts.push(text);
        for (const block of content) {
          // resultado em lista = links vistos; resultado em erro (objeto) não tem links
          if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const item of block.content) if (typeof item?.url === "string" && item.url) seen.add(item.url);
          }
        }
        if (res.stop_reason === "refusal") {
          throw new Error(`O provedor recusou a solicitação (${res.stop_details?.category ?? "sem categoria"}).`);
        }
        if (res.stop_reason === "max_tokens") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null);
        // sem sobra do máximo do pedido, ou no limite das continuações: para de buscar e converte o que há
        if (res.stop_reason !== "pause_turn" || continuation >= MAX_CONTINUATIONS || spent.webSearches >= search.maxSearches) break;
        messages.push({ role: "assistant", content });
      }
      const { output, extra } = await parseOrConvert<T>(req, texts.join("\n"), (r) => this.generate<T>(r));
      const inTok = sumTokens(spent.inputTokens, extra?.inputTokens);
      const outTok = sumTokens(spent.outputTokens, extra?.outputTokens);
      return { output, provider: this.name, model, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - t0, costUsd: price(inTok, outTok), webSearches: spent.webSearches, seenUrls: [...seen] };
    } catch (error) {
      // a conversão que falhou já leva o seu gasto; aqui entra o da busca
      throw withUsage(error, spent);
    }
  }
}

/** O que o provedor usa do cliente do Google (o de verdade, ou um falso nos testes). */
type GenerateClient = { models: { generateContent(params: any): Promise<any> } };

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  readonly isMock = false;
  private client: GenerateClient;
  constructor(access: GoogleAiAccess, readonly model: string, client?: GenerateClient) {
    this.client = client ?? new GoogleGenAI(googleGenAiOptions(access));
  }
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    if (req.webSearch) return this.generateWithSearch<T>(req);
    const t0 = Date.now();
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: req.input,
      config: { systemInstruction: req.system, responseMimeType: "application/json", responseSchema: toProviderSchema(req.schema) as any, maxOutputTokens: req.maxOutputTokens ?? 4096 },
    });
    const u = res.usageMetadata as any;
    // O raciocínio do modelo (thoughtsTokenCount) é cobrado como saída: entra na conta, senão o gasto e os tetos ficam abaixo do real.
    const outputTokens = u?.candidatesTokenCount == null && u?.thoughtsTokenCount == null ? null : (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
    const spent: PartialUsage = { inputTokens: u?.promptTokenCount ?? null, outputTokens, webSearches: 0 };
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(res.text ?? "");
      } catch {
        throw new AiInvalidOutput("Resposta não é JSON.", res.text);
      }
      const output = checked<T>(req.schema, raw);
      return { output, provider: this.name, model: this.model, inputTokens: spent.inputTokens, outputTokens, latencyMs: Date.now() - t0, costUsd: price(spent.inputTokens, outputTokens) };
    } catch (error) {
      throw withUsage(error, spent); // a chamada foi paga mesmo que a resposta não sirva
    }
  }

  /**
   * Com busca na internet: ferramenta `googleSearch`, sem `responseSchema` (o Gemini não mistura as duas coisas): a resposta
   * termina com o JSON no texto (ver webSearch.ts). A API não filtra sites: `allowedDomains` não vai à API (a lista de sites
   * vai escrita no texto do pedido, por quem o monta) e quem filtra é o servidor, ao conferir e baixar cada link. Os links
   * vistos são os da busca (endereços de redirecionamento do Google).
   */
  private async generateWithSearch<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const t0 = Date.now();
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: req.input,
      config: { systemInstruction: req.system, tools: [{ googleSearch: {} }], maxOutputTokens: req.maxOutputTokens ?? 4096 },
    });
    const candidate = res.candidates?.[0];
    const grounding = candidate?.groundingMetadata;
    // Gemini 2.x cobra por pedido que usou a busca; do 3 em diante, por consulta feita
    const webSearches = /^gemini-2/.test(this.model) ? (grounding ? 1 : 0) : Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries.length : 0;
    const seen = new Set<string>();
    for (const chunk of Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : []) if (typeof chunk?.web?.uri === "string" && chunk.web.uri) seen.add(chunk.web.uri);
    const u = res.usageMetadata as any;
    // o que a busca trouxe para o modelo ler (toolUsePromptTokenCount) é cobrado como entrada; o raciocínio, como saída
    const spent: PartialUsage = { inputTokens: sumTokens(u?.promptTokenCount, u?.toolUsePromptTokenCount), outputTokens: sumTokens(u?.candidatesTokenCount, u?.thoughtsTokenCount), webSearches };
    try {
      if (candidate?.finishReason === "MAX_TOKENS") throw new AiInvalidOutput("Resposta cortada pelo limite de saída.", null);
      const { output, extra } = await parseOrConvert<T>(req, String(res.text ?? ""), (r) => this.generate<T>(r));
      const inTok = sumTokens(spent.inputTokens, extra?.inputTokens);
      const outTok = sumTokens(spent.outputTokens, extra?.outputTokens);
      return { output, provider: this.name, model: this.model, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - t0, costUsd: price(inTok, outTok), webSearches, seenUrls: [...seen] };
    } catch (error) {
      // a conversão que falhou já leva o seu gasto; aqui entra o da busca
      throw withUsage(error, spent);
    }
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
