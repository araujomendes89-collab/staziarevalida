import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../celebracoes/catalogo';
import { ESTADO_VAZIO, LIMITES, PREFERENCIAS_PADRAO, decidir, normalizarDia, ordenarPorPrioridade, registrar } from '../celebracoes/regras';

const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;
const HOJE = '2026-10-15';
const T0 = 1_000_000;

describe('regras anti-fadiga', () => {
  it('marco grande aparece cheio na primeira vez do dia', () => {
    const d = decidir(ev('streak-30'), ESTADO_VAZIO(HOJE), PREFERENCIAS_PADRAO, 'normal', T0);
    expect(d.mostrar).toBe(true);
    expect(d.intensidade).toBe('grande');
    expect(d.rebaixada).toBe(false);
    expect(d.fatorIntensidade).toBe(1);
    expect(d.volume).toBe(1);
  });
  it('no maximo 1 grande por dia: a segunda vira media', () => {
    let est = ESTADO_VAZIO(HOJE);
    const d1 = decidir(ev('streak-30'), est, PREFERENCIAS_PADRAO, 'normal', T0);
    est = registrar(est, ev('streak-30'), d1, HOJE, T0);
    expect(est.grandes).toBe(1);
    const d2 = decidir(ev('plano-finalizado'), est, PREFERENCIAS_PADRAO, 'normal', T0 + 5000);
    expect(d2.intensidade).toBe('media');
    expect(d2.rebaixada).toBe(true);
    const d3 = decidir(ev('streak-100'), est, PREFERENCIAS_PADRAO, 'normal', T0 + 5000);
    expect(d3.intensidade).toBe('media');
  });
  it('evento de sequencia aparece uma vez por dia; os repetiveis (questao correta) nao', () => {
    let est = ESTADO_VAZIO(HOJE);
    const d = decidir(ev('streak-7'), est, PREFERENCIAS_PADRAO, 'normal', T0);
    est = registrar(est, ev('streak-7'), d, HOJE, T0);
    const de = decidir(ev('streak-7'), est, PREFERENCIAS_PADRAO, 'normal', T0 + 10000);
    expect(de.mostrar).toBe(false);
    expect(de.motivo).toBe('ja-visto-hoje');
    const q = decidir(ev('questao-correta'), registrar(est, ev('questao-correta'), { ...d, intensidade: 'micro' }, HOJE, T0), PREFERENCIAS_PADRAO, 'normal', T0 + 10000);
    expect(q.mostrar).toBe(true);
  });
  it('respeita show_streak: eventos de sequencia somem, os demais continuam', () => {
    const p = { ...PREFERENCIAS_PADRAO, show_streak: false };
    const d = decidir(ev('streak-30'), ESTADO_VAZIO(HOJE), p, 'normal', T0);
    expect(d.mostrar).toBe(false);
    expect(d.motivo).toBe('show_streak');
    expect(decidir(ev('aula-concluida'), ESTADO_VAZIO(HOJE), p, 'normal', T0).mostrar).toBe(true);
    for (const e of CATALOGO.eventos.filter((x) => x.requer_show_streak)) expect(['sequencia', 'retorno']).toContain(e.categoria);
  });
  it('prova e simulado em andamento bloqueiam o que o catalogo marca; erro nunca aparece neles', () => {
    for (const ctx of ['prova', 'simulado'] as const) {
      expect(decidir(ev('erro-encorajador'), ESTADO_VAZIO(HOJE), PREFERENCIAS_PADRAO, ctx, T0).mostrar).toBe(false);
      expect(decidir(ev('questao-correta'), ESTADO_VAZIO(HOJE), PREFERENCIAS_PADRAO, ctx, T0).mostrar).toBe(false);
      expect(decidir(ev('streak-30'), ESTADO_VAZIO(HOJE), PREFERENCIAS_PADRAO, ctx, T0).motivo).toBe('contexto');
    }
    // o resultado do simulado, ja fora da prova, aparece
    expect(decidir(ev('simulado-alto'), ESTADO_VAZIO(HOJE), PREFERENCIAS_PADRAO, 'simulado', T0).mostrar).toBe(true);
  });
  it('modo reduzidas: no maximo pequena e som baixo; silenciosas: sem som; desligadas: nada', () => {
    const red = decidir(ev('streak-100'), ESTADO_VAZIO(HOJE), { show_streak: true, modo: 'reduzidas' }, 'normal', T0);
    expect(red.intensidade).toBe('pequena');
    expect(red.volume).toBeGreaterThan(0);
    expect(red.volume).toBeLessThanOrEqual(0.5);
    expect(red.fatorIntensidade).toBeLessThanOrEqual(0.5);
    const sil = decidir(ev('streak-30'), ESTADO_VAZIO(HOJE), { show_streak: true, modo: 'silenciosas' }, 'normal', T0);
    expect(sil.volume).toBe(0);
    expect(sil.intensidade).toBe('pequena');
    const off = decidir(ev('streak-30'), ESTADO_VAZIO(HOJE), { show_streak: true, modo: 'desligadas' }, 'normal', T0);
    expect(off.mostrar).toBe(false);
  });
  it('micros: intervalo minimo, e depois de muitos ficam sem som', () => {
    let est = ESTADO_VAZIO(HOJE);
    const e = ev('questao-correta');
    let d = decidir(e, est, PREFERENCIAS_PADRAO, 'normal', T0);
    est = registrar(est, e, d, HOJE, T0);
    expect(decidir(e, est, PREFERENCIAS_PADRAO, 'normal', T0 + 500).motivo).toBe('intervalo');
    expect(decidir(e, est, PREFERENCIAS_PADRAO, 'normal', T0 + LIMITES.intervaloMicroMs + 1).mostrar).toBe(true);
    for (let k = 1; k <= LIMITES.microsComSom; k++) {
      const t = T0 + k * 10000;
      d = decidir(e, est, PREFERENCIAS_PADRAO, 'normal', t);
      est = registrar(est, e, d, HOJE, t);
    }
    const tarde = decidir(e, est, PREFERENCIAS_PADRAO, 'normal', T0 + 1e6);
    expect(tarde.mostrar).toBe(true);
    expect(tarde.volume).toBe(0);
  });
  it('erro encorajador: no maximo um a cada 3 minutos', () => {
    let est = ESTADO_VAZIO(HOJE);
    const e = ev('erro-encorajador');
    const d = decidir(e, est, PREFERENCIAS_PADRAO, 'normal', T0);
    est = registrar(est, e, d, HOJE, T0);
    expect(decidir(e, est, PREFERENCIAS_PADRAO, 'normal', T0 + 60000).motivo).toBe('erro-intervalo');
    expect(decidir(e, est, PREFERENCIAS_PADRAO, 'normal', T0 + LIMITES.intervaloErroMs + 1).mostrar).toBe(true);
  });
  it('usuario frequente: depois de varias celebracoes cai a intensidade e o volume', () => {
    let est = ESTADO_VAZIO(HOJE);
    for (let k = 0; k < LIMITES.celebracoesAteRebaixar; k++) est = registrar(est, ev('meta-diaria'), { mostrar: true, intensidade: 'pequena', fatorIntensidade: 1, volume: 1, rebaixada: false }, HOJE, T0 + k);
    const d = decidir(ev('aula-concluida'), est, PREFERENCIAS_PADRAO, 'normal', T0 + 99999);
    expect(d.intensidade).toBe('pequena');
    expect(d.fatorIntensidade).toBe(0.5);
    expect(d.volume).toBeLessThan(1);
  });
  it('registrar nao muta o estado e vira o dia zerando contadores mas guardando frases', () => {
    const est = ESTADO_VAZIO(HOJE);
    const novo = registrar(est, ev('streak-7'), { mostrar: true, intensidade: 'grande', fatorIntensidade: 1, volume: 1, rebaixada: false }, HOJE, T0, 3);
    expect(est.grandes).toBe(0);
    expect(novo.grandes).toBe(1);
    expect(novo.frases['streak-7']).toEqual([3]);
    const amanha = normalizarDia(novo, '2026-10-16');
    expect(amanha.grandes).toBe(0);
    expect(amanha.vistos).toEqual([]);
    expect(amanha.frases['streak-7']).toEqual([3]);
  });
  it('varios eventos juntos: maior prioridade primeiro', () => {
    const itens = ['streak-30', 'aula-concluida', 'novo-nivel', 'xp-ganho'].map((id) => ({ def: ev(id) }));
    expect(ordenarPorPrioridade(itens, (i) => i.def).map((i) => i.def.id)).toEqual(['streak-30', 'novo-nivel', 'aula-concluida', 'xp-ganho']);
  });
});
