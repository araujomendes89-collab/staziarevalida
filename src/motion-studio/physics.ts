/**
 * Motion Studio: fisica procedural pura (sem DOM, sem relogio, sem aleatorio global).
 * Toda funcao recebe o tempo e devolve um valor: assim a mesma animacao pode ser
 * testada, capturada quadro a quadro e renderizada em video sem mudar de resultado.
 */

export interface SpringConfig {
  /** Frequencia natural em rad/s (rigidez). */
  omega: number;
  /** Razao de amortecimento: <1 oscila (elastico), 1 critico, >1 sem oscilar. */
  zeta: number;
}

export const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Progresso 0..1 de `t` dentro da janela [inicio, fim]. */
export const windowProgress = (t: number, start: number, end: number): number =>
  end <= start ? (t >= end ? 1 : 0) : clamp((t - start) / (end - start));

export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOutCubic = (x: number): number => {
  const c = clamp(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

/**
 * Resposta ao degrau de uma mola (0 -> 1) em forma fechada. `seconds` em segundos.
 * Para zeta<1 ultrapassa 1 (overshoot) e assenta em 1.
 */
export function springStep(seconds: number, { omega, zeta }: SpringConfig): number {
  if (seconds <= 0) return 0;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega * seconds);
    return 1 - decay * (Math.cos(wd * seconds) + ((zeta * omega) / wd) * Math.sin(wd * seconds));
  }
  if (zeta === 1) {
    return 1 - Math.exp(-omega * seconds) * (1 + omega * seconds);
  }
  const s = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega * (zeta - s);
  const r2 = -omega * (zeta + s);
  return 1 - (r2 * Math.exp(r1 * seconds) - r1 * Math.exp(r2 * seconds)) / (r2 - r1);
}

/** Mola entre dois valores; `ms` desde o inicio do movimento. */
export function spring(ms: number, from: number, to: number, cfg: SpringConfig): number {
  return lerp(from, to, springStep(ms / 1000, cfg));
}

/** Maior ultrapassagem relativa (0 = nenhuma) medida numericamente. */
export function overshoot(cfg: SpringConfig, horizonMs = 3000): number {
  let peak = 0;
  for (let ms = 0; ms <= horizonMs; ms += 4) peak = Math.max(peak, springStep(ms / 1000, cfg));
  return Math.max(0, peak - 1);
}

/** Tempo (ms) ate a mola ficar dentro de `eps` do alvo para sempre. */
export function settleTime(cfg: SpringConfig, eps = 0.005, horizonMs = 6000): number {
  let last = 0;
  for (let ms = 0; ms <= horizonMs; ms += 4) {
    if (Math.abs(springStep(ms / 1000, cfg) - 1) > eps) last = ms;
  }
  return last;
}

/** Compressao e alongamento conservando volume aparente: sx * sy ~= 1. */
export function squashStretch(amount: number): { sx: number; sy: number } {
  const sy = 1 + amount;
  return { sx: 1 / sy, sy };
}

/** PRNG deterministico (mulberry32): mesma semente, mesmas particulas. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
