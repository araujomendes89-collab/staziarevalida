import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../celebracoes/catalogo';
import { DURACAO, TEMPOS, frameMascote, frameTextos, maxParticulas, momentoMs, particulasAt } from '../celebracoes/coreografia';
import { CENARIO_INFO } from '../celebracoes/cenarios/registro';
import { INTENSIDADES } from '../celebracoes/tipos';

const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;
const spec = (id: string, i = ev(id).intensidade, fator = 1) => ({ coreografia: ev(id).reacao.coreografia, poses: ev(id).reacao.poses, intensidade: i, fator });

describe('coreografia (funcao pura do tempo)', () => {
  it('duracoes e momentos crescem com a intensidade', () => {
    for (let k = 1; k < INTENSIDADES.length; k++) {
      expect(DURACAO[INTENSIDADES[k]]).toBeGreaterThan(DURACAO[INTENSIDADES[k - 1]]);
      expect(TEMPOS[INTENSIDADES[k]].climax).toBeGreaterThanOrEqual(TEMPOS[INTENSIDADES[k - 1]].climax);
    }
    for (const i of INTENSIDADES) {
      const T = TEMPOS[i];
      expect(T.antecipacao).toBeLessThanOrEqual(T.climax);
      expect(T.climax).toBeLessThan(T.pouso);
      expect(T.pouso).toBeLessThan(T.fim);
    }
    expect(momentoMs('micro', 'botoes')).toBe(TEMPOS.micro.frase); // sem botoes: cai na frase
  });
  it('todos os eventos: valores finitos o tempo todo, pesos de pose coerentes e determinismo', () => {
    for (const e of CATALOGO.eventos) {
      const fim = DURACAO[e.intensidade];
      for (let ms = 0; ms <= fim; ms += 40) {
        const f = frameMascote(ms, spec(e.id));
        for (const v of Object.values(f.mascote)) expect(Number.isFinite(v), `${e.id}@${ms}`).toBe(true);
        const soma = Object.values(f.poseWeights).reduce((a, b) => a + (b ?? 0), 0);
        expect(soma).toBeGreaterThan(0.99);
        expect(soma).toBeLessThan(1.01);
        expect(JSON.stringify(frameMascote(ms, spec(e.id)))).toBe(JSON.stringify(f));
      }
      expect(frameMascote(fim, spec(e.id)).pose).toBe(e.reacao.poses.final);
    }
  });
  it('movimento contido: nunca ha salto; o corpo fica no chao (y pequeno) e a escala so varia de leve', () => {
    for (const e of CATALOGO.eventos) {
      for (let ms = 0; ms <= DURACAO[e.intensidade]; ms += 20) {
        const f = frameMascote(ms, spec(e.id)).mascote;
        expect(f.y, `${e.id}@${ms}`).toBeGreaterThan(-8); // sem pulo para cima
        expect(f.scale).toBeLessThan(1.25);
      }
    }
  });
  it('impacto: soco de escala e tremor seco no climax, aceno de cabeca e empurrao lento ate o fim', () => {
    const T = TEMPOS.grande;
    const antes = frameMascote(T.climax - 60, spec('streak-30')).mascote;
    const soco = frameMascote(T.climax + 40, spec('streak-30')).mascote;
    expect(soco.scale).toBeGreaterThan(antes.scale);
    let tremor = 0;
    let nod = 0;
    for (let ms = T.climax; ms < T.climax + 420; ms += 6) {
      const f = frameMascote(ms, spec('streak-30')).mascote;
      tremor = Math.max(tremor, Math.abs(f.x));
      nod = Math.max(nod, Math.abs(f.rotate));
    }
    expect(tremor).toBeGreaterThan(1);
    expect(tremor).toBeLessThan(8);
    expect(nod).toBeGreaterThan(1);
    expect(frameMascote(DURACAO.grande, spec('streak-30')).mascote.scale).toBeGreaterThan(frameMascote(T.pouso, spec('streak-30')).mascote.scale);
    expect(Math.abs(frameMascote(DURACAO.grande, spec('streak-30')).mascote.x)).toBeLessThan(0.5); // termina parado
  });
  it('intensidade reduzida (fator): menos soco e menos tremor', () => {
    const pico = (fator: number) => {
      let a = 0;
      for (let ms = TEMPOS.grande.climax; ms < TEMPOS.grande.climax + 400; ms += 8) a = Math.max(a, Math.abs(frameMascote(ms, spec('streak-30', 'grande', fator)).mascote.x));
      return a;
    };
    expect(pico(0.2)).toBeLessThan(pico(1));
  });
  it('particulas refinadas: faiscas, ondas de choque e flare (sem confete); limite, densidade e fim', () => {
    const pal = CENARIO_INFO.liga.paleta;
    const T = TEMPOS.grande;
    for (const tipo of ['faiscas', 'onda', 'poeira', 'brasas'] as const) {
      let max = 0;
      const formas = new Set<string>();
      for (let ms = 0; ms < DURACAO.grande; ms += 20) {
        const ps = particulasAt(ms, tipo, 1, 'grande', pal);
        max = Math.max(max, ps.length);
        ps.forEach((p) => formas.add(p.shape));
        ps.forEach((p) => { expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.size)).toBe(true); });
      }
      expect(max, tipo).toBeGreaterThan(2);
      expect(max, tipo).toBeLessThanOrEqual(maxParticulas(tipo, 'grande'));
      expect(formas.has('star' as never)).toBe(false);
      expect(formas.has('bar' as never)).toBe(false);
    }
    // onda de choque e flare existem no efeito "onda"
    const formas = particulasAt(T.climax + 200, 'onda', 1, 'grande', pal).map((p) => p.shape);
    expect(formas).toContain('ring');
    expect(formas).toContain('flare');
    expect(particulasAt(T.climax - 300, 'faiscas', 1, 'grande', pal)).toHaveLength(0);
    expect(particulasAt(T.climax + 300, 'nenhum', 1, 'grande', pal)).toHaveLength(0);
    const cheia = particulasAt(T.climax + 200, 'faiscas', 1, 'grande', pal, 1).length;
    expect(particulasAt(T.climax + 200, 'faiscas', 1, 'grande', pal, 0.2).length).toBeLessThan(cheia);
    expect(particulasAt(T.climax + 200, 'faiscas', 0.3, 'grande', pal, 1).length).toBeLessThan(cheia);
    expect(particulasAt(T.climax + 4000, 'faiscas', 1, 'grande', pal)).toHaveLength(0);
    const er = ev('erro-encorajador');
    for (let ms = 0; ms < DURACAO.micro; ms += 20) expect(particulasAt(ms, er.efeito.tipo, er.efeito.densidade, 'micro', pal)).toHaveLength(0);
  });
  it('textos: titulo, numero rolando com overshoot, frase e botoes em ordem; micro e pequena sem botoes', () => {
    const T = TEMPOS.grande;
    const ft = (ms: number) => frameTextos(ms, 'grande', 'rolar');
    expect(ft(T.titulo - 50).titulo.opacity).toBe(0);
    expect(ft(T.frase + 400).frase.opacity).toBeGreaterThan(0.99);
    expect(ft(T.numero + 10).numero.mostrar).toBe('antes');
    expect(ft(T.numero + 400).numero.mostrar).toBe('depois');
    let max = 0;
    for (let ms = T.numero; ms < T.numero + 500; ms += 8) max = Math.max(max, ft(ms).numero.roll);
    expect(max).toBeGreaterThan(1.03);
    expect(ft(T.botoes - 10).botoes.ativos).toBe(false);
    expect(ft(T.botoes + 200).botoes.ativos).toBe(true);
    expect(ft(DURACAO.grande).finalizado).toBe(true);
    expect(frameTextos(DURACAO.micro, 'micro', 'nenhum').botoes.ativos).toBe(false);
    expect(frameTextos(DURACAO.pequena, 'pequena', 'fixo').botoes.ativos).toBe(false);
    expect(frameTextos(DURACAO.grande, 'grande', 'nenhum').numero.opacity).toBe(0);
  });
});
