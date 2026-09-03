import { Request, Response, NextFunction } from "express";
import {
  DailyUsageRecord,
  QuotaCheckResult,
  TierQuotaLimits,
  UserTier,
  AiObservabilityMetadata,
} from "./types";

// Tier Limits Configuration (Daily)
// Trial: Ajustado para permitir estudo completo e estações OSCE (200 requisições/dia, 250k tokens/dia, $1.00/dia)
export const TIER_QUOTA_LIMITS: Record<UserTier, TierQuotaLimits> = {
  TRIAL: {
    tier: "TRIAL",
    maxDailyCostUsd: 1.0, // $1.00 USD / day
    maxDailyTokens: 250_000,
    maxDailyRequests: 200,
  },
  EXPIRED: {
    tier: "EXPIRED",
    maxDailyCostUsd: 0.0,
    maxDailyTokens: 0,
    maxDailyRequests: 0,
  },
  FREE: {
    tier: "FREE",
    maxDailyCostUsd: 1.0,
    maxDailyTokens: 250_000,
    maxDailyRequests: 200,
  },
  PRO: {
    tier: "PRO",
    maxDailyCostUsd: 10.0, // $10.00 USD / day
    maxDailyTokens: 2_000_000,
    maxDailyRequests: 1_500,
  },
  PRO_PLUS: {
    tier: "PRO_PLUS",
    maxDailyCostUsd: 25.0, // $25.00 USD / day
    maxDailyTokens: 10_000_000,
    maxDailyRequests: 5_000,
  },
  ADMIN: {
    tier: "ADMIN",
    maxDailyCostUsd: 100.0,
    maxDailyTokens: 50_000_000,
    maxDailyRequests: 20_000,
  },
};

// In-Memory Fast Cache of daily usage: key = `${userId}:${dateKey}`
const dailyUsageStore = new Map<string, DailyUsageRecord>();

export function getTodayDateKey(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

export function getNextMidnightIso(): string {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow.toISOString();
}

/**
 * Checks if a given userId represents an unauthenticated, guest, or anonymous session
 */
export function isAnonymousOrGuestUser(userId?: string): boolean {
  if (!userId) return true;
  const clean = userId.trim().toLowerCase();
  if (
    clean === "" ||
    clean === "guest" ||
    clean.startsWith("guest-") ||
    clean.startsWith("guest_") ||
    clean === "anonymous" ||
    clean.startsWith("anon-") ||
    clean.startsWith("anon_") ||
    clean === "offline" ||
    clean === "usr-default" ||
    clean === "null" ||
    clean === "undefined"
  ) {
    return true;
  }
  return false;
}

/**
 * Normalizes user tier with fallback to TRIAL
 */
export function normalizeUserTier(tierStr?: string): UserTier {
  if (!tierStr) return "TRIAL";
  const upper = tierStr.toUpperCase().trim();
  if (upper === "EXPIRED") return "EXPIRED";
  if (upper === "TRIAL") return "TRIAL";
  if (upper === "PRO_PLUS" || upper === "PRO+" || upper === "PREMIUM") return "PRO_PLUS";
  if (upper === "PRO") return "PRO";
  if (upper === "ADMIN" || upper === "EDITOR") return "ADMIN";
  if (upper === "FREE") return "TRIAL";
  return "TRIAL";
}

/**
 * Retrieves or initializes the daily usage record for a user
 */
export function getOrCreateDailyUsage(userId: string, dateKey: string = getTodayDateKey()): DailyUsageRecord {
  const storageKey = `${userId}:${dateKey}`;
  let record = dailyUsageStore.get(storageKey);

  if (!record) {
    record = {
      userId,
      date: dateKey,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      requestCount: 0,
      lastModelUsed: "none",
      lastUpdatedAt: new Date().toISOString(),
    };
    dailyUsageStore.set(storageKey, record);
  }

  return record;
}

/**
 * Checks if a user is allowed to make an AI request based on authentication, plan expiration and daily quotas
 */
export function checkUserAiQuota(params: {
  userId: string;
  tier: UserTier;
  subscriptionExpiresAt?: string;
  trialEndsAt?: string;
  isEmailVerified?: boolean;
  authProvider?: string;
  dateKey?: string;
}): QuotaCheckResult {
  const { userId, isEmailVerified, authProvider, dateKey = getTodayDateKey() } = params;
  const tier = params.tier || "TRIAL";
  const limits = TIER_QUOTA_LIMITS[tier] || TIER_QUOTA_LIMITS.TRIAL;
  const resetsAt = getNextMidnightIso();

  // 1. Block Guest / Anonymous Users completely from AI endpoints
  if (isAnonymousOrGuestUser(userId)) {
    return {
      allowed: false,
      reason: "AUTH_REQUIRED",
      message: "É necessário criar uma conta ou fazer login para utilizar os recursos de inteligência artificial.",
      tier,
      dailyLimitUsd: 0,
      currentUsageUsd: 0,
      remainingCostUsd: 0,
      dailyLimitTokens: 0,
      currentTokens: 0,
      remainingTokens: 0,
      dailyLimitRequests: 0,
      currentRequests: 0,
      resetsAt,
    };
  }

  // 2. Email verification check for email/password credentials
  const isGoogle = authProvider === "google.com" || authProvider === "google";
  if (!isGoogle && isEmailVerified === false) {
    return {
      allowed: false,
      reason: "EMAIL_NOT_VERIFIED",
      message: "Por favor, confirme seu endereço de e-mail através do link enviado para liberar os recursos de Inteligência Artificial.",
      tier,
      dailyLimitUsd: limits.maxDailyCostUsd,
      currentUsageUsd: 0,
      remainingCostUsd: limits.maxDailyCostUsd,
      dailyLimitTokens: limits.maxDailyTokens,
      currentTokens: 0,
      remainingTokens: limits.maxDailyTokens,
      dailyLimitRequests: limits.maxDailyRequests,
      currentRequests: 0,
      resetsAt,
    };
  }

  // 3. Explicit Expired Plan Check
  if (tier === "EXPIRED") {
    return {
      allowed: false,
      reason: "PLAN_EXPIRED",
      message: "Seu período de avaliação gratuita (Trial de 7 dias) expirou. Adquira um plano PRO ou PRO+ para continuar utilizando os recursos de IA.",
      tier: "EXPIRED",
      dailyLimitUsd: 0,
      currentUsageUsd: 0,
      remainingCostUsd: 0,
      dailyLimitTokens: 0,
      currentTokens: 0,
      remainingTokens: 0,
      dailyLimitRequests: 0,
      currentRequests: 0,
      resetsAt,
    };
  }

  // 3. Expiration Timestamp Check (Trial 7 days or Paid subscription)
  const expirationTimestamp = params.trialEndsAt || params.subscriptionExpiresAt;
  if (tier !== "ADMIN" && expirationTimestamp) {
    const expiresDate = new Date(expirationTimestamp);
    if (!isNaN(expiresDate.getTime()) && expiresDate < new Date()) {
      const isTrial = tier === "TRIAL" || tier === "FREE";
      return {
        allowed: false,
        reason: "PLAN_EXPIRED",
        message: isTrial
          ? `Seu período de teste gratuito (Trial de 7 dias) encerrou em ${expiresDate.toLocaleDateString("pt-BR")}. Faça o upgrade para um plano pago para liberar acesso aos recursos de IA.`
          : `Sua assinatura do plano ${tier} expirou em ${expiresDate.toLocaleDateString("pt-BR")}. Renove para continuar utilizando a IA em capacidade total.`,
        tier: "EXPIRED",
        dailyLimitUsd: 0,
        currentUsageUsd: 0,
        remainingCostUsd: 0,
        dailyLimitTokens: 0,
        currentTokens: 0,
        remainingTokens: 0,
        dailyLimitRequests: 0,
        currentRequests: 0,
        resetsAt,
      };
    }
  }

  // 4. Check Daily Usage (Ledger)
  const usage = getOrCreateDailyUsage(userId, dateKey);
  const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;
  const remainingCostUsd = Math.max(0, limits.maxDailyCostUsd - usage.totalCostUsd);
  const remainingTokens = Math.max(0, limits.maxDailyTokens - totalTokens);

  // Cost Limit Check
  if (usage.totalCostUsd >= limits.maxDailyCostUsd) {
    return {
      allowed: false,
      reason: "DAILY_COST_EXCEEDED",
      message: `Cota diária de custo de IA atingida para o plano ${tier} ($${limits.maxDailyCostUsd.toFixed(2)}/dia). O saldo reseta à meia-noite (UTC) ou faça upgrade para o plano PRO.`,
      tier,
      dailyLimitUsd: limits.maxDailyCostUsd,
      currentUsageUsd: usage.totalCostUsd,
      remainingCostUsd: 0,
      dailyLimitTokens: limits.maxDailyTokens,
      currentTokens: totalTokens,
      remainingTokens: 0,
      dailyLimitRequests: limits.maxDailyRequests,
      currentRequests: usage.requestCount,
      resetsAt,
    };
  }

  // Token Limit Check
  if (totalTokens >= limits.maxDailyTokens) {
    return {
      allowed: false,
      reason: "DAILY_TOKENS_EXCEEDED",
      message: `Cota diária de tokens de IA atingida para o plano ${tier} (${limits.maxDailyTokens.toLocaleString("pt-BR")} tokens/dia). O saldo reseta à meia-noite ou faça upgrade de plano.`,
      tier,
      dailyLimitUsd: limits.maxDailyCostUsd,
      currentUsageUsd: usage.totalCostUsd,
      remainingCostUsd,
      dailyLimitTokens: limits.maxDailyTokens,
      currentTokens: totalTokens,
      remainingTokens: 0,
      dailyLimitRequests: limits.maxDailyRequests,
      currentRequests: usage.requestCount,
      resetsAt,
    };
  }

  // Requests Limit Check
  if (usage.requestCount >= limits.maxDailyRequests) {
    return {
      allowed: false,
      reason: "DAILY_REQUESTS_EXCEEDED",
      message: `Limite diário de requisições de IA atingido (${limits.maxDailyRequests} requisições/dia). Aguarde o reset diário ou migre de plano.`,
      tier,
      dailyLimitUsd: limits.maxDailyCostUsd,
      currentUsageUsd: usage.totalCostUsd,
      remainingCostUsd,
      dailyLimitTokens: limits.maxDailyTokens,
      currentTokens: totalTokens,
      remainingTokens,
      dailyLimitRequests: limits.maxDailyRequests,
      currentRequests: usage.requestCount,
      resetsAt,
    };
  }

  return {
    allowed: true,
    tier,
    dailyLimitUsd: limits.maxDailyCostUsd,
    currentUsageUsd: usage.totalCostUsd,
    remainingCostUsd,
    dailyLimitTokens: limits.maxDailyTokens,
    currentTokens: totalTokens,
    remainingTokens,
    dailyLimitRequests: limits.maxDailyRequests,
    currentRequests: usage.requestCount,
    resetsAt,
  };
}

/**
 * Debits/Records persistent usage after an AI request finishes
 */
export function recordAiUsage(
  userId: string,
  _tier: UserTier,
  metadata: AiObservabilityMetadata,
  dateKey: string = getTodayDateKey()
): DailyUsageRecord {
  const usage = getOrCreateDailyUsage(userId, dateKey);

  usage.totalInputTokens += metadata.inputTokens || 0;
  usage.totalOutputTokens += metadata.outputTokens || 0;
  usage.totalCostUsd = Math.round((usage.totalCostUsd + (metadata.estimatedCostUsd || 0)) * 1_000_000) / 1_000_000;
  usage.requestCount += 1;
  usage.lastModelUsed = metadata.modelUsed;
  usage.lastUpdatedAt = new Date().toISOString();

  // Keep in store
  dailyUsageStore.set(`${userId}:${dateKey}`, usage);

  return usage;
}

/**
 * Express Middleware: Verifies quota & access before calling AI model
 */
export function requireAiQuotaMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract user identifiers from headers or body
  const rawUserId =
    (req.headers["x-user-id"] as string) ||
    req.body?.userId ||
    (req.query?.userId as string) ||
    "";

  // Reject anonymous / guest sessions immediately with 401
  if (isAnonymousOrGuestUser(rawUserId)) {
    console.warn(`[AI Auth Middleware 401] Blocked unauthenticated/anonymous access from ${req.ip} (userId: "${rawUserId}")`);
    return res.status(401).json({
      error: "Autenticação obrigatória",
      code: "AUTH_REQUIRED",
      message: "É necessário criar uma conta ou fazer login para utilizar os recursos de inteligência artificial.",
      requiresAuth: true,
    });
  }

  const rawTier = (req.headers["x-user-tier"] as string) || req.body?.userTier;
  const subscriptionExpiresAt =
    (req.headers["x-subscription-expires-at"] as string) ||
    req.body?.subscriptionExpiresAt ||
    (req.headers["x-trial-ends-at"] as string) ||
    req.body?.trialEndsAt;

  const rawEmailVerified = (req.headers["x-email-verified"] as string) || req.body?.emailVerified;
  const authProvider = (req.headers["x-auth-provider"] as string) || req.body?.authProvider || "";
  const isEmailVerified = rawEmailVerified !== undefined ? (rawEmailVerified === "true" || rawEmailVerified === true) : undefined;

  const tier = normalizeUserTier(rawTier);
  const quotaCheck = checkUserAiQuota({
    userId: rawUserId,
    tier,
    subscriptionExpiresAt,
    isEmailVerified,
    authProvider,
  });

  if (!quotaCheck.allowed) {
    console.warn(`[AI Quota Middleware BLOCKED] User: ${rawUserId} (${tier}) - Reason: ${quotaCheck.reason} - ${quotaCheck.message}`);
    const statusCode = quotaCheck.reason === "AUTH_REQUIRED" ? 401 : 403;
    const errorTitle = quotaCheck.reason === "EMAIL_NOT_VERIFIED"
      ? "Confirmação de e-mail pendente"
      : quotaCheck.reason === "PLAN_EXPIRED"
      ? "Período de avaliação gratuita expirado"
      : "Acesso de IA bloqueado por limite de cota ou assinatura";

    return res.status(statusCode).json({
      error: errorTitle,
      code: quotaCheck.reason,
      message: quotaCheck.message,
      requiresEmailVerification: quotaCheck.reason === "EMAIL_NOT_VERIFIED",
      quota: quotaCheck,
    });
  }

  // Attach resolved context to request for downstream usage recording
  (req as any).aiUserContext = {
    userId: rawUserId,
    tier,
    quotaCheck,
  };

  next();
}
