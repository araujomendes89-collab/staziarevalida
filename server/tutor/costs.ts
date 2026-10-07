/**
 * AI_COST_CONFIG: preço de cada modelo usado pelo Tutor, num lugar só. Serve para ESTIMAR custo (telemetria e relatórios); a cota
 * comercial do aluno nunca depende disto (texto conta interações; voz conta tempo autorizado pelo servidor).
 *
 * Para atualizar sem migração e sem mexer no código: defina AI_COST_CONFIG no .env do servidor com um JSON no mesmo formato
 * (só os modelos que mudaram). Preços em US$ por milhão de tokens.
 *
 * Valores padrão conferidos em 2026-10 (páginas de preço públicas; ver docs/architecture/STAZIA_TUTOR_V2.md):
 *   gpt-realtime-2.1       áudio 32 entrada / 64 saída / 0,40 em cache · texto 4 / 24
 *   gpt-realtime-2.1-mini  áudio 10 / 20 / 0,30 em cache · texto 0,60 / 2,40
 *   gpt-live-1             US$ 0,05 por minuto de voz, cobrado por segundo (página do modelo, 2026-10); o servidor que
 *                          responde às delegações é cobrado à parte (tutor_voice_backend, pelos tokens do modelo de texto)
 *   gemini-3.8-live        áudio US$ 0,005/min de entrada + 0,018/min de saída (página de preços do Gemini, 2026-10); a
 *                          estimativa usa a soma (teto: como se o professor falasse o tempo todo), então a conta real é menor
 */
export interface ModelPrice {
  text_in?: number;
  text_out?: number;
  audio_in?: number;
  audio_out?: number;
  cached_in?: number;
  /** Voz cobrada por tempo (GPT-Live): US$ por minuto. */
  per_minute?: number;
}

const DEFAULTS: Record<string, ModelPrice> = {
  "gpt-realtime-2.1": { text_in: 4, text_out: 24, audio_in: 32, audio_out: 64, cached_in: 0.4 },
  "gpt-realtime-2.1-mini": { text_in: 0.6, text_out: 2.4, audio_in: 10, audio_out: 20, cached_in: 0.3 },
  "gpt-live-1": { per_minute: 0.05 },
  "gemini-3.8-live": { per_minute: 0.023 },
};

export function costConfig(env: NodeJS.ProcessEnv = process.env): Record<string, ModelPrice> {
  const raw = (env.AI_COST_CONFIG ?? "").trim();
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Record<string, ModelPrice>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

/** Preço do modelo: nome exato, ou o mais longo que for prefixo (gpt-realtime-2.1-2026-09-01 → gpt-realtime-2.1). */
export function priceFor(model: string | null | undefined, env: NodeJS.ProcessEnv = process.env): ModelPrice | null {
  if (!model) return null;
  const table = costConfig(env);
  if (table[model]) return table[model];
  const hit = Object.keys(table).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return hit ? table[hit] : null;
}

export interface TokenUsage {
  input_text_tokens?: number;
  output_text_tokens?: number;
  input_audio_tokens?: number;
  output_audio_tokens?: number;
  cached_tokens?: number;
}

/** Custo estimado (US$) de um uso. Sem preço conhecido para o modelo, devolve null (o registro fica com custo 0 e o modelo anotado). */
export function estimateCost(model: string | null | undefined, u: TokenUsage, env: NodeJS.ProcessEnv = process.env): number | null {
  const p = priceFor(model, env);
  if (!p) return null;
  const n = (x?: number) => Math.max(0, Number(x) || 0);
  const cached = n(u.cached_tokens);
  // os tokens em cache vêm dentro da entrada; cobra-se o preço de cache por eles e o cheio pelo resto (primeiro do áudio)
  const audioIn = Math.max(0, n(u.input_audio_tokens) - cached);
  const textIn = Math.max(0, n(u.input_text_tokens) - Math.max(0, cached - n(u.input_audio_tokens)));
  const usd =
    (textIn * (p.text_in ?? 0) + n(u.output_text_tokens) * (p.text_out ?? 0) + audioIn * (p.audio_in ?? 0) + n(u.output_audio_tokens) * (p.audio_out ?? 0) + cached * (p.cached_in ?? p.audio_in ?? 0)) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

/** Custo estimado (US$) de voz cobrada por tempo (GPT-Live). Sem preço por minuto conhecido, devolve null. */
export function voiceTimeCost(model: string | null | undefined, seconds: number, env: NodeJS.ProcessEnv = process.env): number | null {
  const p = priceFor(model, env);
  if (!p?.per_minute) return null;
  return Math.round((Math.max(0, Number(seconds) || 0) / 60) * p.per_minute * 1e6) / 1e6;
}
