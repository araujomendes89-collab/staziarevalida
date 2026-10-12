/**
 * Custo estimado ANTES de gastar (Gerar, Conferir pendentes e Buscar fonte oficial). Usa os modelos e os preços da Central de IAs
 * (`estimateCostUsd`), no pior caso de cada chamada. Modelo sem preço entra em `sem_preco` e o custo fica desconhecido (nulo): o
 * painel diz isso em vez de inventar um número. Ollama e a simulação custam zero.
 *
 * Chamadas por questão: criação 1 + conferências 5 (fontes 1, atualidade 1, revisão clínica 2, pedagógica 1) = 6 sem reescrita;
 * com a reescrita (que repete a criação e as conferências) chega a 12.
 */
import { envFallbackRef, type AiConfig, type ModelRef } from "../../ai/config";
import { estimateCostUsd } from "../../ai/prices";

/** Tamanho de uma chamada típica: o mínimo para a conta do pior caso (entrada em caracteres, saída máxima em tokens). */
export const CALL_PROFILE = {
  criacao: { inputChars: 24_000, maxOut: 8192 },
  conferencia: { inputChars: 18_000, maxOut: 4096 },
} as const;

export interface Estimate {
  chamadas_min: number;
  chamadas_max: number;
  usd_min: number | null;
  usd_max: number | null;
  sem_preco: string[];
  ias: { criadora: string | null; conferentes: string[] };
}

type Kind = keyof typeof CALL_PROFILE;
const label = (r: ModelRef) => `${r.provider}/${r.model}`;

/** A IA de cada papel: o que a Central salvou, ou as variáveis de ambiente quando a função não tem configuração salva. */
function refs(cfg: AiConfig, env: NodeJS.ProcessEnv) {
  const criacao = cfg.functions.criacao?.primary ?? envFallbackRef("criacao", env);
  const fv = cfg.functions.verificacao;
  const fallback = envFallbackRef("verificacao", env);
  const role = (k: 0 | 1 | 2) => fv?.reviewers[k] ?? fv?.primary ?? fallback;
  return { criacao, fontes: role(0), atualidade: role(1), clinica: role(2), pedagogica: role(2) };
}

function priceOf(cfg: AiConfig, ref: ModelRef | null, kind: Kind, semPreco: Set<string>): number | null {
  if (!ref) return null;
  if (ref.provider === "ollama" || ref.model.startsWith("mock")) return 0;
  const price = cfg.prices.find((p) => p.provider === ref.provider && p.model === ref.model) ?? null;
  const usd = estimateCostUsd(price, CALL_PROFILE[kind].inputChars, CALL_PROFILE[kind].maxOut);
  if (usd === null) semPreco.add(label(ref));
  return usd;
}

/** Soma `n` chamadas de cada tipo; algum sem preço deixa o total desconhecido. */
function build(cfg: AiConfig, plan: { ref: ModelRef | null; kind: Kind; min: number; max: number }[], semPreco: Set<string>): Estimate {
  let usdMin: number | null = 0;
  let usdMax: number | null = 0;
  let cmin = 0;
  let cmax = 0;
  for (const p of plan) {
    cmin += p.min;
    cmax += p.max;
    const one = priceOf(cfg, p.ref, p.kind, semPreco);
    if (one === null) {
      usdMin = null;
      usdMax = null;
    } else {
      if (usdMin !== null) usdMin += one * p.min;
      if (usdMax !== null) usdMax += one * p.max;
    }
  }
  const round = (v: number | null) => (v === null ? null : Math.round(v * 1e5) / 1e5);
  return { chamadas_min: cmin, chamadas_max: cmax, usd_min: round(usdMin), usd_max: round(usdMax), sem_preco: [...semPreco], ias: { criadora: null, conferentes: [] } };
}

export function estimateGeneration(cfg: AiConfig, count: number, env: NodeJS.ProcessEnv = process.env): Estimate {
  const r = refs(cfg, env);
  const semPreco = new Set<string>();
  const e = build(
    cfg,
    [
      { ref: r.criacao, kind: "criacao", min: count, max: count * 2 },
      { ref: r.fontes, kind: "conferencia", min: count, max: count * 2 },
      { ref: r.atualidade, kind: "conferencia", min: count, max: count * 2 },
      { ref: r.clinica, kind: "conferencia", min: count * 2, max: count * 4 },
      { ref: r.pedagogica, kind: "conferencia", min: count, max: count * 2 },
    ],
    semPreco
  );
  return { ...e, ias: { criadora: r.criacao ? label(r.criacao) : null, conferentes: [...new Set([r.fontes, r.atualidade, r.clinica].filter((x): x is ModelRef => Boolean(x)).map(label))] } };
}

/** Conferir: 5 chamadas por rascunho (fontes 1, atualidade 1, revisão clínica 2, pedagógica 1). */
export function estimateChecks(cfg: AiConfig, drafts: number, env: NodeJS.ProcessEnv = process.env): Estimate {
  const r = refs(cfg, env);
  const semPreco = new Set<string>();
  const e = build(
    cfg,
    [
      { ref: r.fontes, kind: "conferencia", min: drafts, max: drafts },
      { ref: r.atualidade, kind: "conferencia", min: drafts, max: drafts },
      { ref: r.clinica, kind: "conferencia", min: drafts * 2, max: drafts * 2 },
      { ref: r.pedagogica, kind: "conferencia", min: drafts, max: drafts },
    ],
    semPreco
  );
  return { ...e, ias: { criadora: null, conferentes: [...new Set([r.fontes, r.atualidade, r.clinica].filter((x): x is ModelRef => Boolean(x)).map(label))] } };
}

/** Buscar fonte: 1 chamada de verificação (papel 0) por afirmação. */
export function estimateSource(cfg: AiConfig, claims: number, env: NodeJS.ProcessEnv = process.env): Estimate {
  const r = refs(cfg, env);
  const semPreco = new Set<string>();
  const e = build(cfg, [{ ref: r.fontes, kind: "conferencia", min: claims, max: claims }], semPreco);
  return { ...e, ias: { criadora: null, conferentes: r.fontes ? [label(r.fontes)] : [] } };
}
