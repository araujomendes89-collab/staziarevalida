/**
 * Preços oficiais dos modelos de IA (Central de IAs).
 * Cada preço vem da página oficial da empresa com fonte e data da conferência.
 * Um modelo sem preço fica de fora do PRICE_SEED; o dono preenche o preço na tela.
 * Ollama e simulação custam 0 e são tratados pelo chamador, não estão aqui.
 */
import type { AiProviderId } from "./models";

export interface ModelPrice {
  provider: AiProviderId;
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  source_url: string;
  checked_on: string;
}

/**
 * Preços iniciais de todos os modelos. Conferidos em 2026-10-07.
 * Nota: gemini-3.6/3.7/3.8-flash custam 0.75/3.75 até 31/12/2026 e passam a 1.50/7.50 em 01/01/2027.
 */
export const PRICE_SEED: ModelPrice[] = [
  // Claude
  { provider: "anthropic", model: "claude-fable-5-1", input_per_mtok: 10, output_per_mtok: 50, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  { provider: "anthropic", model: "claude-opus-5-5", input_per_mtok: 4, output_per_mtok: 20, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  // Opus 5: em produção é a reserva da Criação e da Verificação e a principal da Engenharia reversa (faltava o preço)
  { provider: "anthropic", model: "claude-opus-5", input_per_mtok: 5, output_per_mtok: 25, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-10" },
  { provider: "anthropic", model: "claude-sonnet-5-5", input_per_mtok: 2, output_per_mtok: 10, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", input_per_mtok: 1, output_per_mtok: 5, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  // Haiku 5.5: preço para pedidos de até 100 mil tokens; acima disso custa 0.50/2.50 (página oficial, conferida em 2026-10-10)
  { provider: "anthropic", model: "claude-haiku-5-5", input_per_mtok: 0.1, output_per_mtok: 0.5, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-10" },

  // OpenAI
  { provider: "openai", model: "gpt-6-astra", input_per_mtok: 10, output_per_mtok: 50, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-6.1-sol", input_per_mtok: 2, output_per_mtok: 10, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-6-sol", input_per_mtok: 2, output_per_mtok: 10, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-6-luna", input_per_mtok: 0.1, output_per_mtok: 0.5, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.6-sol", input_per_mtok: 4, output_per_mtok: 20, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.6-terra", input_per_mtok: 2, output_per_mtok: 12, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.6-luna", input_per_mtok: 0.2, output_per_mtok: 1.2, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.5", input_per_mtok: 5, output_per_mtok: 30, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.4", input_per_mtok: 2.5, output_per_mtok: 15, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.4-mini", input_per_mtok: 0.75, output_per_mtok: 4.5, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.4-nano", input_per_mtok: 0.2, output_per_mtok: 1.25, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5-mini", input_per_mtok: 0.25, output_per_mtok: 2, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },

  // Gemini
  { provider: "gemini", model: "gemini-3.8-flash", input_per_mtok: 0.75, output_per_mtok: 3.75, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-3.7-flash", input_per_mtok: 0.75, output_per_mtok: 3.75, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-3.6-flash", input_per_mtok: 0.75, output_per_mtok: 3.75, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-3.5-flash", input_per_mtok: 1.5, output_per_mtok: 9, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-3.5-flash-lite", input_per_mtok: 0.3, output_per_mtok: 2.5, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-3.1-flash-lite", input_per_mtok: 0.25, output_per_mtok: 1.5, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-3.1-pro-preview", input_per_mtok: 2, output_per_mtok: 12, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-2.5-pro", input_per_mtok: 1.25, output_per_mtok: 10, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-2.5-flash", input_per_mtok: 0.3, output_per_mtok: 2.5, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "gemini", model: "gemini-2.5-flash-lite", input_per_mtok: 0.1, output_per_mtok: 0.4, source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_on: "2026-10-07" },
];

/**
 * Arredonda para 6 casas decimais (padrão para valores em USD).
 */
function roundToSixDecimals(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Estima o custo no pior caso antes de chamar a IA.
 * Fórmula: ceil(inputChars/4) × input_per_mtok + maxOutputTokens × output_per_mtok, por milhão de tokens.
 * @param price Um objeto com input_per_mtok e output_per_mtok, ou null se sem preço.
 * @param inputChars Número de caracteres de entrada.
 * @param maxOutputTokens Número máximo de tokens de saída.
 * @returns Custo estimado em USD, ou null se sem preço.
 */
export function estimateCostUsd(
  price: Pick<ModelPrice, "input_per_mtok" | "output_per_mtok"> | null,
  inputChars: number,
  maxOutputTokens: number
): number | null {
  if (price === null) return null;
  const inputTokens = Math.ceil(inputChars / 4);
  const costUsd = (inputTokens * price.input_per_mtok + maxOutputTokens * price.output_per_mtok) / 1_000_000;
  return roundToSixDecimals(costUsd);
}

/**
 * Calcula o custo exato após a chamada de IA, com os tokens reais.
 * @param price Um objeto com input_per_mtok e output_per_mtok, ou null se sem preço.
 * @param inputTokens Número de tokens de entrada (ou null).
 * @param outputTokens Número de tokens de saída (ou null).
 * @returns Custo em USD, ou null se sem preço ou com token nulo.
 */
export function costUsd(
  price: Pick<ModelPrice, "input_per_mtok" | "output_per_mtok"> | null,
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (price === null || inputTokens === null || outputTokens === null) return null;
  const costValue = (inputTokens * price.input_per_mtok + outputTokens * price.output_per_mtok) / 1_000_000;
  return roundToSixDecimals(costValue);
}
