import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../celebracoes/catalogo';
import { escolherFigurino } from '../celebracoes/figurino';
import { FIGURINOS, resolverPose, ROTULO_FIGURINO } from '../mascot/figurinos';
import { AVAILABLE_POSES, hasPose, poseAlt } from '../mascot/StaziMascote';

const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;

describe('figurinos do Stazi', () => {
  it('todos os figurinos tem rotulo e o sorteio e estavel por semente', () => {
    for (const f of FIGURINOS) expect(ROTULO_FIGURINO[f].length).toBeGreaterThan(3);
    expect(escolherFigurino(ev('streak-30'), 5)).toBe(escolherFigurino(ev('streak-30'), 5));
  });
  it('rodizio: nunca repete o ultimo do evento nem o ultimo global quando ha alternativa', () => {
    const e = ev('streak-30');
    let ultimo: string | undefined;
    let global: string | undefined;
    for (let s = 0; s < 80; s++) {
      const f = escolherFigurino(e, s, [ultimo, global]);
      expect(f).not.toBe(ultimo);
      expect(e.reacao.figurinos).toContain(f);
      ultimo = f;
      global = f;
    }
  });
  it('com um unico figurino possivel, usa ele mesmo (sem travar)', () => {
    const e = { ...ev('streak-30'), reacao: { ...ev('streak-30').reacao, figurinos: ['social' as const] } };
    expect(escolherFigurino(e, 1, ['social', 'social'])).toBe('social');
  });
  it('distribuicao: com sementes diferentes aparecem todos os figurinos do pool', () => {
    const e = ev('liga-promocao-ouro');
    const vistos = new Set<string>();
    for (let s = 0; s < 200; s++) vistos.add(escolherFigurino(e, s));
    expect(vistos.size).toBe(e.reacao.figurinos.length);
  });
  it('resolverPose: papel vira o sprite do figurino; pose casual vira o papel equivalente; casual fica como esta', () => {
    expect(resolverPose('cruzado', 'bone', hasPose)).toBe('bone-cruzado');
    expect(resolverPose('base', 'bone', hasPose)).toBe('bone-cruzado');
    expect(resolverPose('orgulhosa', 'doutor', hasPose)).toBe('doutor-acao');
    expect(resolverPose('trofeu', 'social', hasPose)).toBe('social-celebra');
    expect(resolverPose('polegar', 'esports', hasPose)).toBe('esports-celebra');
    expect(resolverPose('base', 'casual', hasPose)).toBe('base');
    expect(resolverPose('trofeu', 'casual', hasPose)).toBe('trofeu');
    // sprite inexistente cai na pose casual
    expect(resolverPose('base', 'bone', () => false)).toBe('base');
  });
  it('toda pose de todo evento resolve para um sprite que existe, em todos os figurinos do evento', () => {
    for (const e of CATALOGO.eventos) {
      for (const f of e.reacao.figurinos) {
        for (const p of [e.reacao.poses.inicio, e.reacao.poses.climax, e.reacao.poses.final]) {
          const r = resolverPose(p, f, hasPose);
          expect(AVAILABLE_POSES, `${e.id}/${f}/${p}`).toContain(r);
        }
      }
    }
  });
  it('texto alternativo descreve a roupa', () => {
    expect(poseAlt('bone-cruzado')).toMatch(/Stazi, o mascote do StaziaMed, de boné/);
    expect(poseAlt('doutor-celebra')).toMatch(/jaleco/);
    expect(poseAlt('plantao-acao')).toMatch(/plantão/);
    expect(poseAlt('base')).toMatch(/^Stazi, o mascote do StaziaMed/);
  });
});
