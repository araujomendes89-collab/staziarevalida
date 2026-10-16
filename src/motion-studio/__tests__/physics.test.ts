import { describe, expect, it } from 'vitest';
import { overshoot, seededRandom, settleTime, springStep, squashStretch } from '../physics';
import { SPRINGS, burstParticle, elasticPop, organicIdle, softBounce, successReveal } from '../presets';

describe('fisica', () => {
  it('mola comeca em 0 e assenta em 1', () => {
    for (const cfg of Object.values(SPRINGS)) {
      expect(springStep(0, cfg)).toBe(0);
      expect(springStep(6, cfg)).toBeCloseTo(1, 3);
    }
  });
  it('elastico ultrapassa o alvo; amortecimento critico nao', () => {
    expect(overshoot(SPRINGS.elasticPop)).toBeGreaterThan(0.1);
    expect(overshoot({ omega: 12, zeta: 1 })).toBeLessThan(1e-6);
    expect(overshoot({ omega: 12, zeta: 1.4 })).toBeLessThan(1e-6);
  });
  it('assenta em tempo razoavel (< 1,6 s)', () => {
    expect(settleTime(SPRINGS.elasticPop)).toBeLessThan(1600);
  });
  it('squash/stretch conserva o volume aparente', () => {
    const { sx, sy } = squashStretch(0.2);
    expect(sx * sy).toBeCloseTo(1, 6);
  });
  it('prng e deterministico', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('presets terminam em repouso', () => {
    expect(elasticPop(3000).scale).toBeCloseTo(1, 3);
    expect(softBounce(3000).y).toBeCloseTo(0, 2);
    expect(successReveal(2000, 5)).toBe(1);
    expect(successReveal(0, 5)).toBe(0);
  });
  it('idle e periodico e sutil', () => {
    const o = organicIdle(1234);
    expect(Math.abs(o.rotate)).toBeLessThan(3);
    expect(Math.abs(o.sy - 1)).toBeLessThan(0.03);
  });
  it('particula de explosao cai com gravidade', () => {
    expect(burstParticle(0, 0, 300).x).toBe(0);
    expect(burstParticle(1000, -Math.PI / 2, 0).y).toBeGreaterThan(200);
  });
});
