import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../celebracoes/catalogo';
import { escolherFrase, JANELA_REPETICAO, prng, preencher, semente, textoDetalhe, textoTitulo } from '../celebracoes/frases';

const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;

describe('frases', () => {
  it('semente estavel: mesma semente, mesma frase; PRNG deterministico', () => {
    const a = escolherFrase(ev('streak-30'), { n: 30, recorde: 30 }, 123);
    const b = escolherFrase(ev('streak-30'), { n: 30, recorde: 30 }, 123);
    expect(a).toEqual(b);
    const r1 = prng(5);
    const r2 = prng(5);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    expect(semente('a', 1)).toBe(semente('a', 1));
    expect(semente('a', 1)).not.toBe(semente('a', 2));
  });
  it('usa o numero REAL dos dados (nunca outro)', () => {
    for (let s = 0; s < 40; s++) {
      const { frase } = escolherFrase(ev('streak-30'), { n: 30, recorde: 30 }, s);
      expect(frase).not.toMatch(/\{/);
      const nums = frase.match(/\d+/g) ?? [];
      for (const n of nums) expect(n).toBe('30');
    }
    expect(textoTitulo(ev('streak-7'), { n: 7 })).toBe('7 dias de sequência');
    expect(textoDetalhe(ev('streak-7'), { n: 7, recorde: 12 })).toBe('Maior sequência: 12 dias');
  });
  it('limite de repeticao: nao repete as ultimas frases usadas', () => {
    const e = ev('questao-correta');
    const recentes: number[] = [];
    let ultimo = -1;
    for (let k = 0; k < 60; k++) {
      const { indice } = escolherFrase(e, {}, 1000 + k, recentes);
      expect(recentes.slice(-JANELA_REPETICAO)).not.toContain(indice);
      expect(indice).not.toBe(ultimo);
      recentes.push(indice);
      ultimo = indice;
    }
    // com o tempo, varia (usa varias frases)
    expect(new Set(recentes).size).toBeGreaterThanOrEqual(5);
  });
  it('frases que precisam de variavel ausente nao sao sorteadas', () => {
    const e = ev('simulado-alto');
    for (let s = 0; s < 20; s++) expect(escolherFrase(e, {}, s).frase).not.toMatch(/\{|undefined|NaN/);
    expect(preencher('Dia {n}', {})).toBeNull();
    expect(preencher('Dia {n}', { n: 4 })).toBe('Dia 4');
  });
  it('distribuicao: todas as frases de um evento aparecem com sementes diferentes', () => {
    const e = ev('meta-diaria');
    const vistas = new Set<number>();
    for (let s = 0; s < 200; s++) vistas.add(escolherFrase(e, {}, s).indice);
    expect(vistas.size).toBe(e.frases.length);
  });
});
