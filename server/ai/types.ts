export type SupportedAiModel =
  | "opus"
  | "opus-5"
  | "claude-opus-5"
  | "sonnet"
  | "sonnet-5"
  | "claude-sonnet-5"
  | "gemini"
  | "gemini-3.7-flash";

export type AiProvider = "anthropic" | "google" | "offline-fallback" | "anthropic-vertex" | "google-gemini";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PromptCacheConfig {
  enablePromptCache?: boolean;
  cacheTtl?: "ephemeral";
}

export interface AiGenerateRequest {
  provider?: AiProvider | string;
  model?: SupportedAiModel | string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  stream?: boolean;
  cacheConfig?: PromptCacheConfig;
  budgetLimitTokens?: number;
  // User Context for quota tracking
  userId?: string;
  userTier?: "TRIAL" | "EXPIRED" | "FREE" | "PRO" | "PRO_PLUS" | "ADMIN";
  subscriptionExpiresAt?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AiObservabilityMetadata {
  modelUsed: string;
  provider: "anthropic" | "google" | "offline-fallback";
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  totalTokens: number;
  estimatedCostUsd: number;
  wasFailover: boolean;
  failoverReason?: string;
  durationMs: number;
  timestamp: string;
}

export interface AiGenerateResponse {
  text: string;
  model: string;
  provider: AiProvider;
  durationMs: number;
  usage?: TokenUsage;
  metadata?: AiObservabilityMetadata;
  cached?: boolean;
  error?: string;
  fallbackChain?: string[];
}

export interface AiStreamChunk {
  type: "chunk" | "done" | "error";
  text?: string;
  model?: string;
  provider?: AiProvider;
  usage?: TokenUsage;
  metadata?: AiObservabilityMetadata;
  error?: string;
}

// User Tier & Quota Control
export type UserTier = "TRIAL" | "EXPIRED" | "FREE" | "PRO" | "PRO_PLUS" | "ADMIN";

export interface TierQuotaLimits {
  tier: UserTier;
  maxDailyCostUsd: number;
  maxDailyTokens: number;
  maxDailyRequests: number;
}

export interface DailyUsageRecord {
  userId: string;
  date: string; // YYYY-MM-DD
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  requestCount: number;
  lastModelUsed: string;
  lastUpdatedAt: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: "AUTH_REQUIRED" | "EMAIL_NOT_VERIFIED" | "PLAN_EXPIRED" | "DAILY_COST_EXCEEDED" | "DAILY_TOKENS_EXCEEDED" | "DAILY_REQUESTS_EXCEEDED" | "RATE_LIMIT";
  message?: string;
  tier: UserTier;
  dailyLimitUsd: number;
  currentUsageUsd: number;
  remainingCostUsd: number;
  dailyLimitTokens: number;
  currentTokens: number;
  remainingTokens: number;
  dailyLimitRequests: number;
  currentRequests: number;
  resetsAt: string;
}
