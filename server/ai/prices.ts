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
  /** Preço de cada busca na internet em dólares (nulo ou ausente: sem preço cadastrado; conta 0 nas contas). */
  per_search_usd?: number | null;
  source_url: string;
  checked_on: string;
}

/**
 * Preço por busca na internet (per_search_usd), em dólares. Fontes oficiais conferidas em 2026-10-11:
 * - Claude: US$ 10 por 1.000 buscas (0,01 cada); busca com erro não é cobrada; os resultados voltam como tokens de entrada
 *   (já contados pelo preço por token). platform.claude.com/docs/en/about-claude/pricing
 * - OpenAI (ferramenta web_search): US$ 10 por 1.000 chamadas (0,01 cada), mais os tokens do conteúdo buscado pelo preço do
 *   modelo. O web_search_preview antigo (US$ 25 por 1.000) não é usado. developers.openai.com/api/docs/pricing
 * - Gemini 3 e mais novos: US$ 14 por 1.000 CONSULTAS de busca (0,014 cada; um pedido pode fazer várias), com 5.000 consultas
 *   grátis por mês compartilhadas entre os modelos Gemini 3+ (a franquia não é descontada aqui: a estimativa é o pior caso).
 * - Gemini 2.5 (Pro, Flash e Flash-Lite): SAIU DO CATÁLOGO em 2026-10-17 porque o Google tira a família do ar em 20/10/2026
 *   (página "Model versions" do Vertex AI). Cobrava US$ 35 por 1.000 PROMPTS com busca (0,035 por prompt). Os preços já gravados
 *   no banco ficam (a lista antiga de gastos continua legível); a migração 013580 troca os modelos das funções.
 * Preços iniciais de todos os modelos. Conferidos em 2026-10-07 (por busca: 2026-10-11). Os Gemini 3 foram conferidos de novo na
 * página oficial de preços do Vertex AI (cloud.google.com/vertex-ai/generative-ai/pricing) em 2026-10-17: os valores abaixo são os
 * do endpoint "global"; os endpoints regionais (não globais) custam 10% a mais (3.8 Flash: 0,825 / 4,125 até 31/12/2026).
 * Nota: gemini-3.6/3.7/3.8-flash custam 0.75/3.75 até 31/12/2026 e passam a 1.50/7.50 em 01/01/2027 (o preço abaixo é o de hoje:
 * atualizar na Central de IAs em janeiro). gemini-3.6-flash sai do ar em 19/11/2026 e gemini-3.7-flash em 28/01/2027.
 */
export const PRICE_SEED: ModelPrice[] = [
  // Claude
  { provider: "anthropic", model: "claude-fable-5-1", input_per_mtok: 10, output_per_mtok: 50, per_search_usd: 0.01, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  { provider: "anthropic", model: "claude-opus-5-5", input_per_mtok: 4, output_per_mtok: 20, per_search_usd: 0.01, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  // Opus 5: em produção é a reserva da Criação e da Verificação e a principal da Engenharia reversa (faltava o preço)
  { provider: "anthropic", model: "claude-opus-5", input_per_mtok: 5, output_per_mtok: 25, per_search_usd: 0.01, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-10" },
  { provider: "anthropic", model: "claude-sonnet-5-5", input_per_mtok: 2, output_per_mtok: 10, per_search_usd: 0.01, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", input_per_mtok: 1, output_per_mtok: 5, per_search_usd: 0.01, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-07" },
  // Haiku 5.5: preço para pedidos de até 100 mil tokens; acima disso custa 0.50/2.50 (página oficial, conferida em 2026-10-10)
  { provider: "anthropic", model: "claude-haiku-5-5", input_per_mtok: 0.1, output_per_mtok: 0.5, per_search_usd: 0.01, source_url: "https://platform.claude.com/docs/en/about-claude/pricing", checked_on: "2026-10-10" },

  // OpenAI
  { provider: "openai", model: "gpt-6-astra", input_per_mtok: 10, output_per_mtok: 50, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-6.1-sol", input_per_mtok: 2, output_per_mtok: 10, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-6-sol", input_per_mtok: 2, output_per_mtok: 10, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-6-luna", input_per_mtok: 0.1, output_per_mtok: 0.5, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.6-sol", input_per_mtok: 4, output_per_mtok: 20, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.6-terra", input_per_mtok: 2, output_per_mtok: 12, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.6-luna", input_per_mtok: 0.2, output_per_mtok: 1.2, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.5", input_per_mtok: 5, output_per_mtok: 30, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.4", input_per_mtok: 2.5, output_per_mtok: 15, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.4-mini", input_per_mtok: 0.75, output_per_mtok: 4.5, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5.4-nano", input_per_mtok: 0.2, output_per_mtok: 1.25, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },
  { provider: "openai", model: "gpt-5-mini", input_per_mtok: 0.25, output_per_mtok: 2, per_search_usd: 0.01, source_url: "https://developers.openai.com/api/docs/pricing", checked_on: "2026-10-07" },

  // Gemini
  { provider: "gemini", model: "gemini-3.8-flash", input_per_mtok: 0.75, output_per_mtok: 3.75, per_search_usd: 0.014, source_url: "https://cloud.google.com/vertex-ai/generative-ai/pricing", checked_on: "2026-10-17" },
  { provider: "gemini", model: "gemini-3.7-flash", input_per_mtok: 0.75, output_per_mtok: 3.75, per_search_usd: 0.014, source_url: "https://cloud.google.com/vertex-ai/generative-ai/pricing", checked_on: "2026-10-17" },
  { provider: "gemini", model: "gemini-3.6-flash", input_per_mtok: 0.75, output_per_mtok: 3.75, per_search_usd: 0.014, source_url: "https://cloud.google.com/vertex-ai/generative-ai/pricing", checked_on: "2026-10-17" },
  { provider: "gemini", model: "gemini-3.5-flash", input_per_mtok: 1.5, output_per_mtok: 9, per_search_usd: 0.014, source_url: "https://cloud.google.com/vertex-ai/generative-ai/pricing", checked_on: "2026-10-17" },
  { provider: "gemini", model: "gemini-3.5-flash-lite", input_per_mtok: 0.3, output_per_mtok: 2.5, per_search_usd: 0.014, source_url: "https://cloud.google.com/vertex-ai/generative-ai/pricing", checked_on: "2026-10-17" },
  { provider: "gemini", model: "gemini-3.1-flash-lite", input_per_mtok: 0.25, output_per_mtok: 1.5, per_search_usd: 0.014, source_url: "https://cloud.google.com/vertex-ai/generative-ai/pricing", checked_on: "2026-10-17" },
  { provider: "gemini", model: "gemini-3.1-pro-preview", input_per_mtok: 2, output_per_mtok: 12, per_search_usd: 0.014, source_url: "https://cloud.google.com/vertex-ai/generative-ai/pricing", checked_on: "2026-10-17" },
];

/**
 * Arredonda para 6 casas decimais (padrão para valores em USD).
 */
function roundToSixDecimals(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Preço dos tokens e, se houver, o de cada busca na internet. */
type PriceTerms = Pick<ModelPrice, "input_per_mtok" | "output_per_mtok" | "per_search_usd">;

/**
 * Folga fixa da ESTIMATIVA (teto) por busca na internet: os resultados da busca voltam como tokens de entrada que o pedido
 * não mostra antes de chamar. Cada busca soma 30.000 tokens de entrada, ao preço de entrada do modelo, à estimativa do pior
 * caso, para o teto por chamada não ser estourado de surpresa. O custo REAL (costUsd) usa os tokens que o provedor devolve.
 */
export const SEARCH_RESULT_TOKENS = 30_000;

/** O que as buscas custam: quantidade × preço por busca (sem preço por busca cadastrado, conta 0). */
const searchCost = (price: PriceTerms, searches: number) => Math.max(0, searches || 0) * (price.per_search_usd ?? 0);

/**
 * Estima o custo no pior caso antes de chamar a IA.
 * Fórmula: ceil(inputChars/4) × input_per_mtok + maxOutputTokens × output_per_mtok, por milhão de tokens,
 * mais searches × per_search_usd (nulo conta 0) e, por busca, a folga de SEARCH_RESULT_TOKENS tokens de entrada.
 * @param price Um objeto com input_per_mtok e output_per_mtok (e per_search_usd), ou null se sem preço.
 * @param searches Máximo de buscas na internet do pedido (0 sem busca).
 * @param inputChars Número de caracteres de entrada.
 * @param maxOutputTokens Número máximo de tokens de saída.
 * @returns Custo estimado em USD, ou null se sem preço.
 */
export function estimateCostUsd(price: PriceTerms | null, inputChars: number, maxOutputTokens: number, searches = 0): number | null {
  if (price === null) return null;
  const inputTokens = Math.ceil(inputChars / 4);
  const headroom = (Math.max(0, searches || 0) * SEARCH_RESULT_TOKENS * price.input_per_mtok) / 1_000_000;
  const costUsd = (inputTokens * price.input_per_mtok + maxOutputTokens * price.output_per_mtok) / 1_000_000 + searchCost(price, searches) + headroom;
  return roundToSixDecimals(costUsd);
}

/**
 * Calcula o custo exato após a chamada de IA, com os tokens reais e as buscas feitas.
 * @param price Um objeto com input_per_mtok e output_per_mtok (e per_search_usd), ou null se sem preço.
 * @param searches Buscas na internet cobradas (0 sem busca); cada uma custa per_search_usd (nulo conta 0).
 * @param inputTokens Número de tokens de entrada (ou null).
 * @param outputTokens Número de tokens de saída (ou null).
 * @returns Custo em USD, ou null se sem preço ou com token nulo.
 */
export function costUsd(price: PriceTerms | null, inputTokens: number | null, outputTokens: number | null, searches = 0): number | null {
  if (price === null || inputTokens === null || outputTokens === null) return null;
  const costValue = (inputTokens * price.input_per_mtok + outputTokens * price.output_per_mtok) / 1_000_000 + searchCost(price, searches);
  return roundToSixDecimals(costValue);
}
