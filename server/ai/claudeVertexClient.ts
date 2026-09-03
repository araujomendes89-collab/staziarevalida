import Anthropic from "@anthropic-ai/sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { ChatMessage, AiGenerateRequest, AiGenerateResponse, TokenUsage } from "./types";
import { calculateAiCostUsd } from "./costCalculator";

const GCP_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.ANTHROPIC_VERTEX_PROJECT_ID ||
  process.env.GCP_PROJECT_ID;

const GCP_REGION =
  process.env.GOOGLE_CLOUD_LOCATION ||
  process.env.CLOUD_ML_REGION ||
  "us-east5";

let vertexClientInstance: AnthropicVertex | null = null;
let directClientInstance: Anthropic | null = null;

export type ClaudeEngineMode = "anthropic-direct" | "vertex-ai" | "unconfigured";

export interface ClaudeEngineStatus {
  isConfigured: boolean;
  mode: ClaudeEngineMode;
  hasDirectKey: boolean;
  hasVertexProject: boolean;
  activeModelSonnet: string;
  activeModelOpus: string;
  details: string;
}

export function getClaudeEngineStatus(): ClaudeEngineStatus {
  const hasDirectKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 5;
  const hasVertexProject = !!GCP_PROJECT && GCP_PROJECT.trim().length > 0;

  if (hasDirectKey) {
    return {
      isConfigured: true,
      mode: "anthropic-direct",
      hasDirectKey: true,
      hasVertexProject,
      activeModelSonnet: "claude-3-7-sonnet-20250219",
      activeModelOpus: "claude-3-opus-20240229",
      details: "Anthropic API Key ativa para Claude 3.7 Sonnet e Claude 3 Opus.",
    };
  }

  if (hasVertexProject) {
    return {
      isConfigured: true,
      mode: "vertex-ai",
      hasDirectKey: false,
      hasVertexProject: true,
      activeModelSonnet: "claude-3-7-sonnet@20250219",
      activeModelOpus: "claude-3-opus@20240229",
      details: `Google Cloud Vertex AI configurado no projeto ${GCP_PROJECT} (${GCP_REGION}).`,
    };
  }

  return {
    isConfigured: false,
    mode: "unconfigured",
    hasDirectKey: false,
    hasVertexProject: false,
    activeModelSonnet: "gemini-3.7-flash (Fallback Ativo)",
    activeModelOpus: "gemini-3.7-flash (Fallback Ativo)",
    details: "Nenhuma credencial do Claude (ANTHROPIC_API_KEY ou Google Cloud Vertex ADC) detectada no ambiente.",
  };
}

export function getAnthropicDirectClient(): Anthropic {
  if (!directClientInstance) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required for direct Anthropic access.");
    }
    directClientInstance = new Anthropic({ apiKey: key });
  }
  return directClientInstance;
}

export function getAnthropicVertexClient(): AnthropicVertex {
  if (!vertexClientInstance) {
    if (!GCP_PROJECT) {
      throw new Error("GOOGLE_CLOUD_PROJECT or ANTHROPIC_VERTEX_PROJECT_ID is required for Vertex AI access.");
    }
    vertexClientInstance = new AnthropicVertex({
      projectId: GCP_PROJECT,
      region: GCP_REGION,
    });
  }
  return vertexClientInstance;
}

/**
 * Standardize model name to canonical identifier depending on mode:
 * Direct: claude-3-7-sonnet-20250219 / claude-3-opus-20240229
 * Vertex: claude-3-7-sonnet@20250219 / claude-3-opus@20240229 / claude-sonnet-5
 */
export function resolveClaudeModelName(model?: string, mode: ClaudeEngineMode = "anthropic-direct"): string {
  const normalized = (model || "").toLowerCase().trim();
  const isOpus =
    normalized === "opus" ||
    normalized === "opus-5" ||
    normalized === "claude-opus-5" ||
    normalized === "claude-opus" ||
    normalized.includes("opus");

  if (mode === "anthropic-direct") {
    return isOpus ? "claude-3-opus-20240229" : "claude-3-7-sonnet-20250219";
  }

  return isOpus ? "claude-opus-5" : "claude-sonnet-5";
}

function buildSystemBlock(systemPrompt?: string, enableCache = true): any {
  if (!systemPrompt) return undefined;

  if (enableCache && systemPrompt.length > 500) {
    return [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  return systemPrompt;
}

/**
 * Execute completion with Claude (Direct API or Google Cloud Vertex AI)
 */
export async function generateWithClaudeVertex(
  request: AiGenerateRequest,
  options: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<AiGenerateResponse> {
  const startTime = Date.now();
  const status = getClaudeEngineStatus();

  if (!status.isConfigured) {
    throw new Error("Claude engine is not configured: missing ANTHROPIC_API_KEY and GCP Vertex credentials.");
  }

  const timeoutMs = options.timeoutMs || 25000;
  const maxRetries = options.maxRetries ?? 0;
  const targetModel = resolveClaudeModelName(request.model, status.mode);

  // Transform messages to Anthropic format (only 'user' and 'assistant')
  let combinedSystemPrompt = request.systemPrompt || "";
  const anthropicMessages: { role: "user" | "assistant"; content: any }[] = [];

  for (const m of request.messages) {
    if (m.role === "system") {
      combinedSystemPrompt = combinedSystemPrompt
        ? `${combinedSystemPrompt}\n\n${m.content}`
        : m.content;
    } else {
      anthropicMessages.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }
  }

  if (anthropicMessages.length === 0) {
    anthropicMessages.push({ role: "user", content: "Iniciar análise médica estruturada." });
  }

  const systemBlock = buildSystemBlock(combinedSystemPrompt, request.cacheConfig?.enablePromptCache !== false);

  const requestPayload: any = {
    model: targetModel,
    max_tokens: Math.min(request.maxTokens || 8192, 8192),
    messages: anthropicMessages,
    temperature: request.temperature ?? 0.2,
  };

  if (systemBlock) {
    requestPayload.system = systemBlock;
  }

  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      let client: Anthropic | AnthropicVertex;
      if (status.mode === "anthropic-direct") {
        client = getAnthropicDirectClient();
      } else {
        client = getAnthropicVertexClient();
      }

      const responsePromise = client.messages.create(requestPayload);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${timeoutMs}ms waiting for Claude (${targetModel})`)),
          timeoutMs
        )
      );

      const response: any = await Promise.race([responsePromise, timeoutPromise]);

      const text = (response.content || [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");

      const durationMs = Date.now() - startTime;
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cachedInputTokens = (response.usage as any)?.cache_read_input_tokens || 0;
      const totalTokens = inputTokens + outputTokens;
      const estimatedCostUsd = calculateAiCostUsd(targetModel, inputTokens, outputTokens, cachedInputTokens);

      const usage: TokenUsage = {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        totalTokens,
        estimatedCostUsd,
      };

      return {
        text,
        model: targetModel,
        provider: "anthropic",
        durationMs,
        usage,
        cached: cachedInputTokens > 0,
      };
    } catch (err: any) {
      lastError = err;

      const isRetryable =
        err?.status === 429 ||
        err?.status === 503 ||
        err?.status === 500;

      if (attempt <= maxRetries && isRetryable) {
        console.warn(`[Claude Client] Retry attempt ${attempt} for ${targetModel} due to ${err.message}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      break;
    }
  }

  throw lastError || new Error(`Failed to generate with Claude (${targetModel})`);
}

/**
 * Execute streaming with Claude
 */
export async function* streamWithClaudeVertex(
  request: AiGenerateRequest
): AsyncGenerator<string, void, unknown> {
  const status = getClaudeEngineStatus();

  if (!status.isConfigured) {
    throw new Error("Claude engine is not configured: missing ANTHROPIC_API_KEY and GCP Vertex credentials.");
  }

  const targetModel = resolveClaudeModelName(request.model, status.mode);

  let combinedSystemPrompt = request.systemPrompt || "";
  const anthropicMessages: { role: "user" | "assistant"; content: any }[] = [];

  for (const m of request.messages) {
    if (m.role === "system") {
      combinedSystemPrompt = combinedSystemPrompt
        ? `${combinedSystemPrompt}\n\n${m.content}`
        : m.content;
    } else {
      anthropicMessages.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }
  }

  if (anthropicMessages.length === 0) {
    anthropicMessages.push({ role: "user", content: "Iniciar análise médica estruturada." });
  }

  const systemBlock = buildSystemBlock(combinedSystemPrompt, request.cacheConfig?.enablePromptCache !== false);

  const requestPayload: any = {
    model: targetModel,
    max_tokens: Math.min(request.maxTokens || 8192, 8192),
    messages: anthropicMessages,
    temperature: request.temperature ?? 0.2,
    stream: true,
  };

  if (systemBlock) {
    requestPayload.system = systemBlock;
  }

  let client: Anthropic | AnthropicVertex;
  if (status.mode === "anthropic-direct") {
    client = getAnthropicDirectClient();
  } else {
    client = getAnthropicVertexClient();
  }

  const stream = await client.messages.create(requestPayload) as any;

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
      yield chunk.delta.text;
    }
  }
}
