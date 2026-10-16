import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CUES_NOVOS } from '../celebracoes/tipos';
import { CATALOGO } from '../celebracoes/catalogo';
import { montarAgenda } from '../celebracoes/agendaSom';
import veo from '../sound/veo/manifest.json';
import liberadas from '../sound/voz/liberadas.json';

const dir = resolve(__dirname, '../sound');
interface V { grupo: string; dur_s: number; pico_db: number; kb: number; prompt: string; seed: number; modelo: string; mp4: string; padrao: boolean; origem: string }
const M = veo as unknown as Record<string, V>;
const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;
const GRUPOS = ['conquista', 'xp', 'missao', 'nivel', 'liga', 'lendaria', 'sequencia', 'erro'];

describe('sons do Veo 3.1 (rodada 6: audio nativo)', () => {
  it('cada grupo tem um padrao (a preferencia geral do dono), moeda sem padrao; prompt, seed e modelo registrados', () => {
    for (const g of GRUPOS) {
      const ops = Object.entries(M).filter(([, v]) => v.grupo === g);
      expect(ops.length, g).toBeGreaterThanOrEqual(1);
      expect(ops.filter(([, v]) => v.padrao).length, g).toBe(1);
    }
    expect(Object.values(M).filter((v) => v.grupo === 'moeda').length).toBe(1);
    expect(Object.values(M).some((v) => v.grupo === 'moeda' && v.padrao)).toBe(false); // a moeda aprovada continua coins-grande
    for (const [c, v] of Object.entries(M)) {
      expect(v.modelo, c).toMatch(/^veo-3\.1-fast/);
      expect(v.prompt, c).toMatch(/No background music/);
      expect(v.seed, c).toBeGreaterThan(0);
      expect(v.mp4, c).toMatch(/^PortableSSD\//); // MP4 original fica fora do repositorio
      expect((CUES_NOVOS as readonly string[]).includes(c), c).toBe(true);
    }
  });
  it('arquivos: mp3 valido, <= 2,5 s (XP <= 0,8 s; moeda <= 1 s; marco de 7 dias e rebaixamento <= 2,65 s; resultado e lendaria das ligas <= 3,05 s), >= 0,4 s, pico <= -3 dBFS, pequeno', () => {
    for (const [c, v] of Object.entries(M)) {
      const f = resolve(dir, `veo/${c}.mp3`);
      expect(existsSync(f), c).toBe(true);
      const b = readFileSync(f);
      expect(b[0] === 0x49 || b[0] === 0xff, c).toBe(true);
      expect(statSync(f).size / 1024, c).toBeLessThanOrEqual(25);
      expect(v.dur_s, c).toBeGreaterThanOrEqual(0.4);
      // sons aprovados pelo dono em 16/10 como estao: marco de 7 dias (2,57 s), rebaixamento (ate 2,62 s), resultado e lendaria das ligas (3,02 s)
      const teto = v.grupo === 'xp' ? 0.8 : v.grupo === 'moeda' ? 1.0 : ['liga-resultado', 'liga-lendaria'].includes(v.grupo) ? 3.05 : ['streak7', 'liga-desce'].includes(v.grupo) ? 2.65 : 2.55;
      expect(v.dur_s, c).toBeLessThanOrEqual(teto);
      expect(v.pico_db, c).toBeLessThanOrEqual(-2.9);
    }
  });
  it('fala da Durona (quando ha uma curta) entra junto do efeito do Veo; o efeito nunca sobe por causa da fala', () => {
    const lib = (liberadas as { liberadas: string[] }).liberadas;
    for (const e of CATALOGO.eventos) {
      const com = montarAgenda(e, { voz: { estilo: 'durona' }, seed: 1, vozesDisponiveis: lib });
      const sem = montarAgenda(e, { voz: { estilo: 'desligada' }, seed: 1, vozesDisponiveis: lib });
      const efC = com.agenda.filter((c) => !c.cue.startsWith('voz:'));
      expect(efC.map((c) => c.cue), e.id).toEqual(sem.agenda.map((c) => c.cue));
      efC.forEach((c, k) => expect(c.gain, e.id).toBeLessThanOrEqual(sem.agenda[k].gain));
    }
  });
});
