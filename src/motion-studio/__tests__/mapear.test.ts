import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../celebracoes/catalogo';
import { diasEntre, faixaSimulado, mapearLinha, mapearSequencia, mapearVolta, proximaSerie } from '../celebracoes/mapear';

const st = (current_streak: number, longest_streak = current_streak, extra = {}) => ({ current_streak, longest_streak, ...extra });

describe('mapear dados do banco para eventos do catalogo', () => {
  it('sequencia: primeiro dia, 2o, 3o, dia comum e marcos', () => {
    expect(mapearSequencia(st(0, 0), st(1, 1))[0].id).toBe('primeiro-dia');
    expect(mapearSequencia(st(1), st(2))[0].id).toBe('dia-2');
    expect(mapearSequencia(st(2), st(3))[0].id).toBe('dia-3');
    expect(mapearSequencia(st(8, 8), st(9, 9))[0].id).toBe('streak-dia-comum');
    for (const n of [7, 14, 30, 60, 100, 365]) {
      const [e] = mapearSequencia(st(n - 1, n - 1), st(n, n));
      expect(e.id).toBe(`streak-${n}`);
      expect(e.dados.n).toBe(n);
    }
  });
  it('nao celebra quando a sequencia nao aumentou (dados reais, sem inventar)', () => {
    expect(mapearSequencia(st(5), st(5))).toEqual([]);
    expect(mapearSequencia(st(5), st(0))).toEqual([]);
  });
  it('novo recorde so com recorde anterior >= 3; marco tem prioridade', () => {
    expect(mapearSequencia(st(1, 1), st(2, 2)).map((e) => e.id)).toEqual(['dia-2']);
    const r = mapearSequencia(st(9, 9), st(10, 10));
    expect(r.map((e) => e.id)).toEqual(['streak-dia-comum', 'novo-recorde']);
    expect(r[1].dados).toEqual({ n: 10, recorde: 9 });
    expect(mapearSequencia(st(6, 6), st(7, 7)).map((e) => e.id)).toEqual(['streak-7']);
  });
  it('volta depois de pausa: 3 dias ou mais, usando last_qualified_date de antes', () => {
    expect(mapearVolta(st(5, 5, { last_qualified_date: '2026-10-09' }), '2026-10-15')).toEqual([{ id: 'volta-apos-pausa', dados: { dias: 6 } }]);
    expect(mapearVolta(st(5, 5, { last_qualified_date: '2026-10-14' }), '2026-10-15')).toEqual([]);
    expect(mapearVolta(undefined, '2026-10-15')).toEqual([]);
    expect(diasEntre('2026-10-09', '2026-10-15')).toBe(6);
  });
  it('linhas de gamification_events viram os ids certos', () => {
    const ctx = { antes: st(29, 29), depois: st(30, 30), hoje: '2026-10-15' };
    expect(mapearLinha({ event_type: 'STREAK_INCREMENTED' }, ctx).map((e) => e.id)).toEqual(['streak-30']);
    expect(mapearLinha({ event_type: 'LESSON_COMPLETED', xp_awarded: 30 }, ctx)).toEqual([{ id: 'aula-concluida', dados: { xp: 30 } }]);
    expect(mapearLinha({ event_type: 'QUESTION_CORRECT' }, ctx)[0].id).toBe('questao-correta');
    expect(mapearLinha({ event_type: 'DAILY_GOAL_COMPLETED' }, ctx)[0].id).toBe('meta-diaria');
    expect(mapearLinha({ event_type: 'MISSION_COMPLETED', xp_awarded: 50 }, ctx)[0]).toEqual({ id: 'missao-cumprida', dados: { xp: 50 } });
    expect(mapearLinha({ event_type: 'DAILY_MISSIONS_COMPLETED' }, ctx)[0].id).toBe('missao-cumprida');
    expect(mapearLinha({ event_type: 'LEVEL_UP', xp_awarded: 200, metadata: { level_name: 'Residente' } }, ctx)[0]).toEqual({ id: 'novo-nivel', dados: { xp: 200, nivel: 'Residente' } });
    expect(mapearLinha({ event_type: 'STREAK_FREEZE_USED' }, { ...ctx, antes: st(12, 12), depois: st(12, 12, { streak_freezes: 1 }) })[0]).toEqual({ id: 'congelamento-usado', dados: { n: 12, restantes: 1 } });
    expect(mapearLinha({ event_type: 'ALGO_DESCONHECIDO' }, ctx)).toEqual([]);
  });
  it('simulado: faixa pelo percentual; sem percentual cai em medio sem inventar numero', () => {
    expect(faixaSimulado(82)).toBe('alto');
    expect(faixaSimulado(56)).toBe('medio');
    expect(faixaSimulado(31)).toBe('baixo');
    const ctx = { hoje: '2026-10-15' };
    expect(mapearLinha({ event_type: 'SIMULATION_COMPLETED', metadata: { percentual: 81.6 } }, ctx)[0]).toEqual({ id: 'simulado-alto', dados: { pct: 82 } });
    expect(mapearLinha({ event_type: 'SIMULATION_COMPLETED' }, ctx)[0]).toEqual({ id: 'simulado-medio', dados: {} });
  });
  it('serie de acertos 5/10/20 e zera no erro', () => {
    let s = 0;
    const gerados: string[] = [];
    for (let k = 0; k < 21; k++) {
      const r = proximaSerie(s, true);
      s = r.seguidas;
      if (r.evento) gerados.push(r.evento.id);
    }
    expect(gerados).toEqual(['serie-acertos-5', 'serie-acertos-10', 'serie-acertos-20']);
    expect(proximaSerie(7, false).seguidas).toBe(0);
  });
  it('todo id gerado existe no catalogo', () => {
    const ids = new Set(CATALOGO.eventos.map((e) => e.id));
    const gerados = ['primeiro-dia', 'dia-2', 'dia-3', 'streak-dia-comum', 'novo-recorde', 'volta-apos-pausa', 'congelamento-usado', 'simulado-alto', 'simulado-medio', 'simulado-baixo', 'serie-acertos-5', 'serie-acertos-10', 'serie-acertos-20'];
    for (const g of gerados) expect(ids.has(g)).toBe(true);
  });
});

import { mapearBlocoPlay } from '../celebracoes/mapear';
describe('bloco play da resposta', () => {
  it('sequencia, nivel e conquistas viram eventos com os valores do banco', () => {
    const play = { streak_incremented: true, stats: { streak: 30, longest_streak: 30 }, level_up: { from: 'a', to: 'b', name: 'Residente' }, achievements_unlocked: [{ slug: 'x', xp: 100 }, { slug: 'y' }] };
    const r = mapearBlocoPlay(play, { hoje: '2026-10-15' });
    expect(r.map((e) => e.id)).toEqual(['streak-30', 'novo-nivel', 'conquista-desbloqueada', 'conquista-desbloqueada']);
    expect(r[0].dados.n).toBe(30);
    expect(r[1].dados).toEqual({ nivel: 'Residente' });
    expect(r[2].dados).toEqual({ xp: 100 });
    expect(r[3].dados).toEqual({});
  });
  it('sem incremento nem nivel nem conquista nao celebra nada; bloco nulo e tolerado', () => {
    expect(mapearBlocoPlay({ streak_incremented: false, stats: { streak: 5 } }, { hoje: '2026-10-15' })).toEqual([]);
    expect(mapearBlocoPlay(null, { hoje: '2026-10-15' })).toEqual([]);
  });
  it('novo recorde usa o recorde lido antes e o nome do nivel pode vir de uma funcao do app', () => {
    const r = mapearBlocoPlay({ streak_incremented: true, stats: { streak: 10 }, level_up: { to: 'residente' } }, { hoje: '2026-10-15', recordeAnterior: 9, nivelNome: (s) => (s === 'residente' ? 'Residente' : undefined) });
    expect(r.map((e) => e.id)).toEqual(['streak-dia-comum', 'novo-recorde', 'novo-nivel']);
    expect(r[2].dados).toEqual({ nivel: 'Residente' });
  });
});
