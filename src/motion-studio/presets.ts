import { clamp, easeOutCubic, spring, springStep, squashStretch, windowProgress, type SpringConfig } from './physics';

/** Presets de movimento do Motion Studio (ver references/animation-presets.md da skill). */
export const SPRINGS = {
  softBounce: { omega: 14, zeta: 0.55 } as SpringConfig,
  elasticPop: { omega: 20, zeta: 0.32 } as SpringConfig,
  gentle: { omega: 9, zeta: 0.9 } as SpringConfig,
  snap: { omega: 26, zeta: 0.8 } as SpringConfig,
} as const;

export interface Transform2D {
  scale: number;
  sx: number;
  sy: number;
  y: number;
  rotate: number;
}

/** Soft Bounce: antecipa (comprime), aterrissa e recupera. `ms` desde o disparo. */
export function softBounce(ms: number, dropPx = 28): Transform2D {
  const k = springStep(ms / 1000, SPRINGS.softBounce);
  const y = (1 - k) * -dropPx;
  const impact = clamp(1 - Math.abs(k - 1) * 3) * windowProgress(ms, 120, 400);
  const { sx, sy } = squashStretch(-0.16 * impact);
  return { scale: 1, sx, sy, y, rotate: 0 };
}

/** Elastic Pop: surge com expansao e pequena oscilacao. */
export function elasticPop(ms: number, from = 0.2): Transform2D {
  const s = spring(ms, from, 1, SPRINGS.elasticPop);
  return { scale: s, sx: 1, sy: 1, y: 0, rotate: 0 };
}

/** Organic Idle: respiracao e leve balanco; periodo fixo, sem aleatorio. */
export function organicIdle(ms: number, intensity = 1): Transform2D {
  const s = ms / 1000;
  const breathe = Math.sin(s * 2 * Math.PI * 0.45) * 0.018 * intensity;
  const sway = Math.sin(s * 2 * Math.PI * 0.22) * 1.6 * intensity;
  const { sx, sy } = squashStretch(breathe);
  return { scale: 1, sx, sy, y: Math.sin(s * 2 * Math.PI * 0.45 + 0.6) * -2 * intensity, rotate: sway };
}

/** Success Reveal: itens em sequencia (stagger) com entrada suave. Retorna 0..1 por item. */
export function successReveal(ms: number, index: number, staggerMs = 32, durationMs = 360): number {
  return easeOutCubic(windowProgress(ms - index * staggerMs, 0, durationMs));
}

/**
 * Celebration Burst: parametros de uma particula na posicao `i` de `n`.
 * Devolve posicao relativa ao centro em px no instante `ms` (gravidade + arrasto).
 */
export function burstParticle(
  ms: number,
  angle: number,
  speed: number,
  gravity = 520,
  drag = 1.6,
): { x: number; y: number; life: number } {
  const s = Math.max(0, ms) / 1000;
  const k = (1 - Math.exp(-drag * s)) / drag;
  return { x: Math.cos(angle) * speed * k, y: Math.sin(angle) * speed * k + 0.5 * gravity * s * s, life: clamp(s / 1.1) };
}
