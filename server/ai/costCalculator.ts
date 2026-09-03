/**
 * Centralized Token Pricing & Cost Calculation Engine for PRAXIS REVALIDA
 * Grounded in official Anthropic and Google Gemini 2026 pricing tables.
 */

export interface TokenCountDetails {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export interface PricingRates {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
}

export const AI_MODEL_PRICING: Record<string, PricingRates> = {
  // Anthropic Claude 3.7 Sonnet (Direct & Vertex)
  "claude-3-7-sonnet-20250219": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.3,
  },
  "claude-3-7-sonnet@20250219": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.3,
  },
  "claude-sonnet-5": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.3,
  },
  "sonnet": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.3,
  },

  // Anthropic Claude 3 Opus / Opus 5 (Direct & Vertex)
  "claude-3-opus-20240229": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cachedInputPerMillion: 1.5,
  },
  "claude-3-opus@20240229": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cachedInputPerMillion: 1.5,
  },
  "claude-opus-5": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cachedInputPerMillion: 1.5,
  },
  "opus": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cachedInputPerMillion: 1.5,
  },

  // Google Gemini 3.7 Flash & 2.5 Flash
  "gemini-3.7-flash": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cachedInputPerMillion: 0.0375,
  },
  "gemini-2.5-flash": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cachedInputPerMillion: 0.0375,
  },
  "gemini-3.1-pro-preview": {
    inputPerMillion: 1.25,
    outputPerMillion: 5.0,
    cachedInputPerMillion: 0.3125,
  },
  "gemini": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cachedInputPerMillion: 0.0375,
  },
};

/**
 * Calculates estimated cost in USD based on model identifier and token consumption
 */
export function calculateAiCostUsd(
  model: string,
  inputTokens: number = 0,
  outputTokens: number = 0,
  cachedInputTokens: number = 0
): number {
  const norm = (model || "").toLowerCase().trim();
  
  // Find matching pricing or fallback based on family
  let rates: PricingRates = AI_MODEL_PRICING[norm] || AI_MODEL_PRICING[model];

  if (!rates) {
    if (norm.includes("opus")) {
      rates = AI_MODEL_PRICING["opus"];
    } else if (norm.includes("sonnet") || norm.includes("claude")) {
      rates = AI_MODEL_PRICING["sonnet"];
    } else {
      rates = AI_MODEL_PRICING["gemini-3.7-flash"];
    }
  }

  const cost =
    (inputTokens * rates.inputPerMillion +
      outputTokens * rates.outputPerMillion +
      cachedInputTokens * rates.cachedInputPerMillion) /
    1_000_000;

  // Round to 6 decimal places for precision
  return Math.round(cost * 1_000_000) / 1_000_000;
}
