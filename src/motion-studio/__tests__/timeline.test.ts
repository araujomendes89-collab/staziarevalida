import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRAND, CELEBRATION_POSES, JUMP, LAYOUT, MAX_PARTICLES, T, TOKENS, TOTAL_MS, contrast, frameAt, mixColor } from '../timeline';
import { DEMO_WEEK } from '../demoData';

const input = { previousStreak: 29, newStreak: 30, week: DEMO_WEEK };

describe('linha do tempo', () => {
  it('comeca neutra com 29 e termina com 30, semana e botoes visiveis', () => {
    const a = frameAt(0, input);
    expect(a.displayedStreak).toBe(29);
    expect(a.morph).toBe(0);
    expect(a.particles).toHaveLength(0);
    expect(a.flood.dark).toBe(0);
    const z = frameAt(TOTAL_MS, input);
    expect(z.displayedStreak).toBe(30);
    expect(z.finished).toBe(true);
    expect(z.buttonsEnabled).toBe(true);
    expect(z.buttons.share.opacity).toBe(1);
    expect(z.week.opacity).toBe(1);
    expect(z.flood.dark).toBe(1);
  });
  it('o numero logico so assume valores recebidos nos dados', () => {
    for (let ms = 0; ms <= TOTAL_MS; ms += 16) expect([29, 30]).toContain(frameAt(ms, input).displayedStreak);
    for (let ms = 0; ms <= TOTAL_MS; ms += 40) expect([41, 47]).toContain(frameAt(ms, { ...input, previousStreak: 41, newStreak: 47 }).displayedStreak);
  });
  it('e deterministica', () => {
    const f = (ms: number) => JSON.stringify({ ...frameAt(ms, input), week: 0 });
    expect(f(3000)).toBe(f(3000));
    expect(f(2100)).toBe(f(2100));
  });
  it('morph elastico: a forma ultrapassa o corpo final (overshoot)', () => {
    let max = 0;
    for (let ms = T.morphStart; ms < T.contract[0]; ms += 8) max = Math.max(max, frameAt(ms, input).shape);
    expect(max).toBeGreaterThan(1.08);
  });
  it('explosao: escala passa do alvo e particulas respeitam o limite', () => {
    let maxScale = 0;
    let maxP = 0;
    for (let ms = T.burst; ms < T.settle[0]; ms += 8) {
      const f = frameAt(ms, input);
      maxScale = Math.max(maxScale, f.mascot.scale);
      maxP = Math.max(maxP, f.particles.length);
    }
    expect(maxScale).toBeGreaterThan(1.08);
    expect(maxP).toBeGreaterThan(20);
    expect(maxP).toBeLessThanOrEqual(MAX_PARTICLES);
  });
  it('particulas sofrem gravidade e somem', () => {
    const p1 = frameAt(T.burst + 300, input).particles.find((p) => p.id === 'burst0')!;
    const p2 = frameAt(T.burst + 900, input).particles.find((p) => p.id === 'burst0');
    expect(p1).toBeTruthy();
    if (p2) expect(p2.y).toBeGreaterThan(p1.y);
    expect(frameAt(T.burst + 2000, input).particles.filter((p) => p.origin === 'mascot')).toHaveLength(0);
  });
  it('flood radial: tela vira de branco para o fundo escuro em ~120 ms', () => {
    expect(frameAt(T.flood[0] - 10, input).flood.dark).toBe(0);
    expect(frameAt(T.flood[1] + 10, input).flood.dark).toBe(1);
    expect(T.flood[1] - T.flood[0]).toBeLessThanOrEqual(150);
  });
  it('numero rola com overshoot e cresce (pop)', () => {
    let maxRoll = 0;
    let maxPop = 0;
    for (let ms = T.roll; ms < T.roll + 500; ms += 8) {
      const f = frameAt(ms, input);
      maxRoll = Math.max(maxRoll, f.number.roll);
      maxPop = Math.max(maxPop, f.number.pop);
    }
    expect(maxRoll).toBeGreaterThan(1.03);
    expect(maxPop).toBeGreaterThan(1.1);
    expect(frameAt(T.roll + 800, input).number.roll).toBeCloseTo(1, 1);
  });
  it('cascata da semana: marcadores acendem em sequencia e o de hoje por ultimo', () => {
    const f = frameAt(T.weekStart + 200, input);
    expect(f.week.marker(0).lit).toBeGreaterThan(f.week.marker(3).lit);
    const end = frameAt(TOTAL_MS, input);
    DEMO_WEEK.forEach((d, i) => {
      const m = end.week.marker(i);
      if (d.done) expect(m.lit).toBeGreaterThan(0.99);
      else expect(m.lit).toBe(0);
    });
    expect(end.week.marker(4).check).toBe(1);
    expect(frameAt(T.todayStretch[0] - 10, input).week.marker(4).blob).toBe(0);
    expect(frameAt(T.todayStretch[0] + 50, input).week.marker(4).blob).toBe(1);
  });
  it('a semana vem dos dados: dia nao estudado nunca acende', () => {
    const week = DEMO_WEEK.map((d, i) => (i === 1 ? { ...d, done: false } : d));
    const end = frameAt(TOTAL_MS, { ...input, week });
    expect(end.week.marker(1).lit).toBe(0);
  });
  it('intensidade reduzida: menos particulas e menos overshoot', () => {
    const count = (I: number) => frameAt(T.burst + 300, { ...input, intensity: I }).particles.length;
    expect(count(0.2)).toBeLessThan(count(1));
    const peak = (I: number) => Math.max(...Array.from({ length: 80 }, (_, k) => frameAt(T.burst + k * 8, { ...input, intensity: I }).mascot.scale));
    expect(peak(0.2)).toBeLessThan(peak(1));
  });
  it('contraste do texto no fundo final >= 4,5:1 (inicio, meio e fim do degrade)', () => {
    expect(contrast('#FFFFFF', BRAND.blue800)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', BRAND.blue600)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.navy, BRAND.blue100)).toBeGreaterThanOrEqual(4.5); // check sobre marcador aceso
    expect(contrast(BRAND.navy, '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // texto do botao
    expect(contrast('#4B5870', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // tinta antes do flood
  });
  it('tokens copiados batem com o design system', () => {
    const css = readFileSync(resolve(__dirname, '../../novo/ds/tokens/colors.css'), 'utf8').toUpperCase();
    for (const key of ['navy950', 'navy900', 'navy700', 'teal50', 'teal200', 'teal300', 'teal400', 'teal500', 'teal600', 'teal700', 'teal800'] as const) expect(css).toContain(TOKENS[key]);
  });
  it('mixColor interpola', () => {
    expect(mixColor('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('poses: base, agachar, comemorando, pouso e orgulhosa na ordem do roteiro', () => {
    const seq = [T.mascotIn[1] + 100, T.toCrouch + 200, T.burst + 100, T.land + 20, T.toProud + 200, TOTAL_MS].map((ms) => frameAt(ms, input).pose);
    expect(seq).toEqual(['base', 'agachar', 'comemorando', 'pouso', 'orgulhosa', 'orgulhosa']);
  });
  it('pesos das poses somam ~1 depois que a lontra surge e a troca e curta', () => {
    for (let ms = T.mascotIn[1]; ms <= TOTAL_MS; ms += 10) {
      const f = frameAt(ms, input);
      const sum = CELEBRATION_POSES.reduce((a, p) => a + f.poseWeights[p], 0);
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    }
    expect(frameAt(T.toCrouch - 5, input).poseWeights.agachar).toBe(0);
  });
  it('lontra comeca oculta e surge pequena no disco', () => {
    expect(frameAt(T.mascotIn[0] - 5, input).mascot.scale).toBe(0);
    const f = frameAt(T.contract[0] - 50, input);
    expect(f.mascot.scale).toBeGreaterThan(0.4);
    expect(f.mascot.scale).toBeLessThan(0.8);
  });
  it('pulo em parabola: sobe, alcanca o apice, volta ao chao e amassa no pouso; pe no chao apos o climax', () => {
    let apex = 0;
    let maxSy = 0;
    for (let ms = T.burst; ms < T.land; ms += 8) {
      const f = frameAt(ms, input);
      apex = Math.max(apex, -f.mascot.y);
      maxSy = Math.max(maxSy, f.mascot.sy);
    }
    expect(apex).toBeGreaterThan(JUMP.height * 0.9);
    expect(maxSy).toBeGreaterThan(1.05); // stretch
    expect(frameAt(T.land + 5, input).mascot.sy).toBeLessThan(0.9); // squash no pouso
    expect(frameAt(T.roll - 50, input).mascot.y).toBeCloseTo(0, 0);
    expect(frameAt(T.settle[1], input).mascot.footY).toBe(LAYOUT.ground);
  });
  it('sombra de contato so existe depois do climax e encolhe no ar', () => {
    expect(frameAt(T.burst - 20, input).shadow.opacity).toBe(0);
    expect(frameAt(T.burst + 330, input).shadow.opacity).toBeLessThan(frameAt(T.settle[1], input).shadow.opacity);
  });
  it('disco-simbolo: S neutro some e o disco vira azul claro da marca', () => {
    expect(frameAt(0, input).symbol).toBe(1);
    expect(frameAt(T.faceOpen + 100, input).symbol).toBe(0);
    expect(frameAt(0, input).morph).toBe(0);
    expect(frameAt(1200, input).morph).toBe(1);
    expect(frameAt(T.burst + 200, input).disc.opacity).toBe(0);
  });
});
