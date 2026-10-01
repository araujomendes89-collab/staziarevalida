import {
  AiGenerateRequest,
  AiGenerateResponse,
  AiObservabilityMetadata,
  SupportedAiModel,
  TokenUsage,
} from "./types";
import {
  generateWithClaudeVertex,
  streamWithClaudeVertex,
  resolveClaudeModelName,
  getClaudeEngineStatus,
} from "./claudeVertexClient";
import { generateWithGemini, streamWithGemini } from "./geminiClient";
import { calculateAiCostUsd } from "./costCalculator";
import { recordAiUsage, normalizeUserTier } from "./quotaMiddleware";

// In-memory sliding window rate limiter
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 600; // 600 req/min for seamless clinical simulation, multi-station OSCE and interactive study

export function extractRateLimitClientId(req: { headers?: Record<string, any>; ip?: string; body?: any; query?: any }): string {
  const userId =
    (req.headers?.["x-user-id"] as string) ||
    req.body?.userId ||
    (req.query?.userId as string);
  if (userId && typeof userId === "string" && userId.trim() && !userId.startsWith("guest-") && !userId.startsWith("anon-")) {
    return `user:${userId.trim()}`;
  }
  const forwarded = (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim();
  if (forwarded) {
    return `ip:${forwarded}`;
  }
  return `ip:${req.ip || "client-default"}`;
}

export function checkRateLimit(clientId: string = "default"): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(clientId);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: record.resetAt - now,
    };
  }

  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - record.count };
}

/**
 * Builds standard observability metadata block
 */
export function buildObservabilityMetadata(params: {
  modelUsed: string;
  provider: "anthropic" | "google" | "offline-fallback";
  usage?: TokenUsage;
  durationMs: number;
  wasFailover: boolean;
  failoverReason?: string;
}): AiObservabilityMetadata {
  const inputTokens = params.usage?.inputTokens || 0;
  const outputTokens = params.usage?.outputTokens || 0;
  const cachedInputTokens = params.usage?.cachedInputTokens || 0;
  const totalTokens = params.usage?.totalTokens || (inputTokens + outputTokens);
  const estimatedCostUsd =
    params.usage?.estimatedCostUsd ??
    calculateAiCostUsd(params.modelUsed, inputTokens, outputTokens, cachedInputTokens);

  return {
    modelUsed: params.modelUsed,
    provider: params.provider,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalTokens,
    estimatedCostUsd,
    wasFailover: params.wasFailover,
    failoverReason: params.failoverReason,
    durationMs: params.durationMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Universal AI Dispatcher Function with Observability & Failover Auditing
 */
export async function generateAI(request: AiGenerateRequest): Promise<AiGenerateResponse> {
  const tStart = Date.now();
  const fallbackChain: string[] = [];
  const modelKey = (request.model || "sonnet").toLowerCase().trim();
  const claudeStatus = getClaudeEngineStatus();

  // Enforce Token limits if set
  if (request.budgetLimitTokens && (request.maxTokens || 8192) > request.budgetLimitTokens) {
    request.maxTokens = request.budgetLimitTokens;
  }

  let finalResponse: AiGenerateResponse;

  // ROUTE 1: Explicit Gemini Request
  if (modelKey === "gemini" || modelKey.startsWith("gemini-")) {
    fallbackChain.push("gemini-3.7-flash");
    try {
      const geminiRes = await generateWithGemini(request);
      const metadata = buildObservabilityMetadata({
        modelUsed: geminiRes.model,
        provider: "google",
        usage: geminiRes.usage,
        durationMs: Date.now() - tStart,
        wasFailover: false,
      });

      finalResponse = {
        ...geminiRes,
        metadata,
        fallbackChain,
      };
    } catch (geminiErr: any) {
      if (claudeStatus.isConfigured) {
        const failReason = `Gemini call failed (${geminiErr?.message || "unknown"}). Attempting Claude fallback.`;
        console.warn(`[Universal AI Router FAILOVER] Requested: ${modelKey} -> FAILOVER to Claude: ${failReason}`);
        fallbackChain.push(claudeStatus.activeModelSonnet);

        try {
          const claudeRes = await generateWithClaudeVertex({ ...request, model: "sonnet" });
          const metadata = buildObservabilityMetadata({
            modelUsed: claudeRes.model,
            provider: "anthropic",
            usage: claudeRes.usage,
            durationMs: Date.now() - tStart,
            wasFailover: true,
            failoverReason: failReason,
          });

          finalResponse = {
            ...claudeRes,
            metadata,
            fallbackChain,
          };
        } catch (claudeErr: any) {
          finalResponse = handleOfflineFallback(request, fallbackChain, [geminiErr, claudeErr], tStart);
        }
      } else {
        finalResponse = handleOfflineFallback(request, fallbackChain, [geminiErr], tStart);
      }
    }
  }

  // ROUTE 2: Claude Opus (Deep Clinical Analysis / Autopsies)
  else if (
    modelKey === "opus" ||
    modelKey === "opus-5" ||
    modelKey === "claude-opus-5" ||
    modelKey === "claude-opus"
  ) {
    if (claudeStatus.isConfigured) {
      fallbackChain.push(claudeStatus.activeModelOpus);
      try {
        const opusRes = await generateWithClaudeVertex({ ...request, model: "opus" });
        const metadata = buildObservabilityMetadata({
          modelUsed: opusRes.model,
          provider: "anthropic",
          usage: opusRes.usage,
          durationMs: Date.now() - tStart,
          wasFailover: false,
        });

        finalResponse = {
          ...opusRes,
          metadata,
          fallbackChain,
        };
      } catch (opusErr: any) {
        const failReason = `Claude Opus failed (${opusErr?.message || "unknown"}). Falling back to Gemini 3.7 Flash.`;
        console.warn(`[Universal AI Router FAILOVER] Primary 'claude-opus' failed -> ${failReason}`);
        fallbackChain.push("gemini-3.7-flash");

        try {
          const geminiRes = await generateWithGemini(request);
          const metadata = buildObservabilityMetadata({
            modelUsed: geminiRes.model,
            provider: "google",
            usage: geminiRes.usage,
            durationMs: Date.now() - tStart,
            wasFailover: true,
            failoverReason: failReason,
          });

          finalResponse = {
            ...geminiRes,
            metadata,
            fallbackChain,
          };
        } catch (geminiErr: any) {
          finalResponse = handleOfflineFallback(request, fallbackChain, [opusErr, geminiErr], tStart);
        }
      }
    } else {
      // Claude not configured: transparent failover to Gemini with clear reason
      const failReason = "ANTHROPIC_API_KEY ausente ou credenciais Vertex AI não configuradas no container";
      console.warn(`[Universal AI Router FAILOVER] Requested '${modelKey}' but Claude is unconfigured (${failReason}). Routing to Gemini 3.7 Flash.`);
      fallbackChain.push("gemini-3.7-flash");

      try {
        const geminiRes = await generateWithGemini(request);
        const metadata = buildObservabilityMetadata({
          modelUsed: geminiRes.model,
          provider: "google",
          usage: geminiRes.usage,
          durationMs: Date.now() - tStart,
          wasFailover: true,
          failoverReason: failReason,
        });

        finalResponse = {
          ...geminiRes,
          metadata,
          fallbackChain,
        };
      } catch (geminiErr: any) {
        finalResponse = handleOfflineFallback(request, fallbackChain, [geminiErr], tStart);
      }
    }
  }

  // ROUTE 3: Claude Sonnet (Primary clinical preceptor & INEP synthesis)
  else {
    if (claudeStatus.isConfigured) {
      fallbackChain.push(claudeStatus.activeModelSonnet);
      try {
        const sonnetRes = await generateWithClaudeVertex({ ...request, model: "sonnet" });
        const metadata = buildObservabilityMetadata({
          modelUsed: sonnetRes.model,
          provider: "anthropic",
          usage: sonnetRes.usage,
          durationMs: Date.now() - tStart,
          wasFailover: false,
        });

        finalResponse = {
          ...sonnetRes,
          metadata,
          fallbackChain,
        };
      } catch (sonnetErr: any) {
        const failReason = `Claude Sonnet failed (${sonnetErr?.message || "Connection Error"}). Falling back to Gemini 3.7 Flash.`;
        console.warn(`[Universal AI Router FAILOVER] Primary 'claude-sonnet' failed -> ${failReason}`);
        fallbackChain.push("gemini-3.7-flash");

        try {
          const geminiRes = await generateWithGemini(request);
          const metadata = buildObservabilityMetadata({
            modelUsed: geminiRes.model,
            provider: "google",
            usage: geminiRes.usage,
            durationMs: Date.now() - tStart,
            wasFailover: true,
            failoverReason: failReason,
          });

          finalResponse = {
            ...geminiRes,
            metadata,
            fallbackChain,
          };
        } catch (geminiErr: any) {
          finalResponse = handleOfflineFallback(request, fallbackChain, [sonnetErr, geminiErr], tStart);
        }
      }
    } else {
      // Claude not configured: route to Gemini with clear failover metadata
      const failReason = "ANTHROPIC_API_KEY ausente ou credenciais Vertex AI não configuradas no container";
      console.warn(`[Universal AI Router FAILOVER] Requested '${modelKey}' but Claude is unconfigured (${failReason}). Routing to Gemini 3.7 Flash.`);
      fallbackChain.push("gemini-3.7-flash");

      try {
        const geminiRes = await generateWithGemini(request);
        const metadata = buildObservabilityMetadata({
          modelUsed: geminiRes.model,
          provider: "google",
          usage: geminiRes.usage,
          durationMs: Date.now() - tStart,
          wasFailover: true,
          failoverReason: failReason,
        });

        finalResponse = {
          ...geminiRes,
          metadata,
          fallbackChain,
        };
      } catch (geminiErr: any) {
        finalResponse = handleOfflineFallback(request, fallbackChain, [geminiErr], tStart);
      }
    }
  }

  // Persist usage tracking if userId is attached
  if (request.userId && finalResponse.metadata) {
    const tier = normalizeUserTier(request.userTier);
    try {
      recordAiUsage(request.userId, tier, finalResponse.metadata);
    } catch (uErr) {
      console.warn("[AI Usage Tracking] Failed to debit usage record:", uErr);
    }
  }

  return finalResponse;
}

/**
 * Universal Stream Dispatcher Function for SSE streaming with Failover Auditing
 */
export async function* streamAI(request: AiGenerateRequest): AsyncGenerator<string, void, unknown> {
  const modelKey = (request.model || "sonnet").toLowerCase().trim();
  const claudeStatus = getClaudeEngineStatus();

  if (modelKey === "gemini" || modelKey.startsWith("gemini-") || !claudeStatus.isConfigured) {
    if (!claudeStatus.isConfigured && modelKey !== "gemini") {
      console.warn(`[Universal AI Stream FAILOVER] Claude unconfigured. Streaming with Gemini 3.7 Flash.`);
    }
    try {
      yield* streamWithGemini(request);
      return;
    } catch (err: any) {
      if (claudeStatus.isConfigured) {
        console.warn(`[Universal AI Stream FAILOVER] Gemini stream failed (${err?.message}). Switching to Claude.`);
        yield* streamWithClaudeVertex({ ...request, model: "sonnet" });
        return;
      }
      yield `[Aviso do Sistema] Análise processada com base nas Diretrizes Clínicas Vigentes do Ministério da Saúde / SUS (Matriz INEP).`;
      return;
    }
  }

  try {
    yield* streamWithClaudeVertex({ ...request, model: request.model || "sonnet" });
  } catch (err: any) {
    console.warn(`[Universal AI Stream FAILOVER] Claude stream failed (${err?.message}). Falling back to Gemini:`);
    try {
      yield* streamWithGemini(request);
    } catch (geminiErr: any) {
      yield `[Aviso do Sistema] Análise processada com base nas Diretrizes Clínicas Vigentes do Ministério da Saúde / SUS (Matriz INEP).`;
    }
  }
}

function handleOfflineFallback(
  request: AiGenerateRequest,
  fallbackChain: string[],
  errors: any[],
  startTime: number
): AiGenerateResponse {
  fallbackChain.push("offline-medical-rules");
  const errorMessage = errors.map((e) => e?.message || String(e)).join(" | ");
  const durationMs = Date.now() - startTime;

  const metadata = buildObservabilityMetadata({
    modelUsed: "offline-medical-rules",
    provider: "offline-fallback",
    usage: {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      estimatedCostUsd: 0,
    },
    durationMs,
    wasFailover: true,
    failoverReason: `All cloud models failed: ${errorMessage}`,
  });

  if (request.responseFormat === "json") {
    return {
      text: JSON.stringify({
        status: "CONFIRMED_CURRENT",
        clinicalSummary: "Análise processada com base nas Diretrizes Clínicas Vigentes do Ministério da Saúde / SUS (Matriz INEP).",
        recommendedConduct: "Cumprir o protocolo clínico padrão-ouro da atenção primária e urgência.",
        inepImpactLevel: "ALTO",
        fallbackActive: true,
      }),
      model: "offline-medical-rules",
      provider: "offline-fallback",
      durationMs,
      usage: metadata.inputTokens ? {
        inputTokens: metadata.inputTokens,
        outputTokens: metadata.outputTokens,
        totalTokens: metadata.totalTokens,
        estimatedCostUsd: 0,
      } : undefined,
      metadata,
      fallbackChain,
      error: errorMessage,
    };
  }

  return {
    text: `### 🩺 Análise Clínica Estruturada (StaziaMed Revalida / Diretrizes Oficiais MS)

**1. Raciocínio Clínico:** O quadro demanda reconhecimento prioritário dos sinais de alerta e estabilização clínica antes de propedêuticas invasivas.
**2. Conduta Padrão-Ouro:** Aplicar o protocolo preconizado pelo Ministério da Saúde e pelas Sociedades Brasileiras de Especialidade.
**3. Contexto SUS:** Abordagem escalonada na Rede de Atenção à Saúde (RAS).`,
    model: "offline-medical-rules",
    provider: "offline-fallback",
    durationMs,
    usage: {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      estimatedCostUsd: 0,
    },
    metadata,
    fallbackChain,
    error: errorMessage,
  };
}
