import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { AVAILABLE_POSES, POSE_ALT, spriteInfo } from '../mascot/StaziMascote';
import { CELEBRATION_POSES } from '../timeline';
import { FIGURINOS, PAPEIS } from '../mascot/figurinos';

const dir = resolve(__dirname, '../mascot/sprites');

describe('sprites do Stazi', () => {
  it('tem as 5 poses da celebracao e as poses extras do app', () => {
    for (const p of CELEBRATION_POSES) expect(AVAILABLE_POSES).toContain(p);
    for (const p of ['acenando', 'polegar', 'pensativo', 'surpreso', 'triste', 'dormindo']) expect(AVAILABLE_POSES).toContain(p);
  });
  it('os 8 figurinos tem as 3 poses (cruzado, acao, celebra) e o casual tem os papeis mapeados', () => {
    for (const f of FIGURINOS.filter((x) => x !== 'casual')) for (const p of PAPEIS) expect(AVAILABLE_POSES, `${f}-${p}`).toContain(`${f}-${p}`);
  });
  it('cada sprite e WebP com transparencia, <= 120 KB e ancora dentro da imagem', () => {
    for (const p of AVAILABLE_POSES) {
      const s = spriteInfo(p);
      const f = resolve(dir, s.file);
      expect(statSync(f).size).toBeLessThanOrEqual(120 * 1024);
      const b = readFileSync(f);
      expect(b.subarray(0, 4).toString()).toBe('RIFF');
      expect(b.subarray(8, 12).toString()).toBe('WEBP');
      expect(b.includes(Buffer.from('ALPH'))).toBe(true); // canal alfa
      expect(s.ax).toBeGreaterThan(0);
      expect(s.ax).toBeLessThan(s.w);
      expect(s.ay).toBeLessThanOrEqual(s.h);
      expect(s.ay).toBeGreaterThan(s.h * 0.9); // ancora = pe, perto da base
    }
  });
  it('todo sprite tem texto alternativo com o nome do mascote', () => {
    for (const p of AVAILABLE_POSES) expect(POSE_ALT[p]).toContain('Stazi, o mascote do StaziaMed');
  });
});
