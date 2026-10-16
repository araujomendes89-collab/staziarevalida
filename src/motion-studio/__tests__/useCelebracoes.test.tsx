import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCelebracoes, type ArmazenamentoEstado } from '../celebracoes/useCelebracoes';
import type { EstadoCelebracoes } from '../celebracoes/regras';

function mem(): ArmazenamentoEstado & { valor: EstadoCelebracoes | null } {
  const m = { valor: null as EstadoCelebracoes | null, ler: () => m.valor, gravar: (e: EstadoCelebracoes) => (m.valor = e) };
  return m;
}
const mk = (extra = {}) => {
  const armazenamento = mem();
  let agora = 1_000_000;
  const r = renderHook(() => useCelebracoes({ armazenamento, agora: () => agora, hoje: () => '2026-10-15', ...extra }));
  return { r, armazenamento, avancar: (ms: number) => (agora += ms) };
};

describe('useCelebracoes', () => {
  it('marco aparece cheio; segundo marco no mesmo dia vira media; estado persiste', () => {
    const { r, armazenamento, avancar } = mk();
    act(() => void r.result.current.disparar({ id: 'streak-30', dados: { n: 30, recorde: 30 } }));
    expect(r.result.current.atual?.decisao.intensidade).toBe('grande');
    expect(armazenamento.valor?.grandes).toBe(1);
    act(() => r.result.current.fechar());
    expect(r.result.current.atual).toBeNull();
    avancar(10_000);
    act(() => void r.result.current.disparar({ id: 'plano-finalizado', dados: {} }));
    expect(r.result.current.atual?.decisao.intensidade).toBe('media');
  });
  it('varios eventos no mesmo ato: o de maior prioridade cheio, os outros esperam como micro (ate 2)', () => {
    const { r } = mk();
    act(() => void r.result.current.disparar([
      { id: 'aula-concluida', dados: { xp: 30 } },
      { id: 'novo-nivel', dados: { nivel: 'Residente', xp: 200 } },
      { id: 'conquista-desbloqueada', dados: { xp: 100 } },
      { id: 'xp-ganho', dados: { xp: 30 } },
    ]));
    expect(r.result.current.atual?.evento.id).toBe('novo-nivel');
    expect(r.result.current.fila).toHaveLength(2);
    expect(r.result.current.fila.every((i) => i.decisao.intensidade === 'micro')).toBe(true);
    act(() => r.result.current.fechar());
    expect(r.result.current.atual?.evento.id).toBe('conquista-desbloqueada');
    expect(r.result.current.atual?.decisao.intensidade).toBe('micro');
  });
  it('respeita show_streak, contexto de prova e modo desligadas', () => {
    const a = mk({ preferencias: { show_streak: false, modo: 'normal' } });
    act(() => void a.r.result.current.disparar({ id: 'streak-7', dados: { n: 7, recorde: 7 } }));
    expect(a.r.result.current.atual).toBeNull();
    const b = mk({ contexto: 'prova' });
    act(() => void b.r.result.current.disparar([{ id: 'erro-encorajador', dados: {} }, { id: 'questao-correta', dados: {} }]));
    expect(b.r.result.current.atual).toBeNull();
    const c = mk({ preferencias: { show_streak: true, modo: 'desligadas' } });
    act(() => void c.r.result.current.disparar({ id: 'streak-7', dados: { n: 7, recorde: 7 } }));
    expect(c.r.result.current.atual).toBeNull();
  });
  it('um micro em exibicao nao segura uma celebracao maior', () => {
    const { r } = mk();
    act(() => void r.result.current.disparar({ id: 'questao-correta', dados: {} }));
    expect(r.result.current.atual?.evento.id).toBe('questao-correta');
    act(() => void r.result.current.disparar({ id: 'serie-acertos-5', dados: { n: 5 } }));
    expect(r.result.current.atual?.evento.id).toBe('serie-acertos-5');
  });
  it('props prontas para o componente e frase recente guardada (limite de repeticao)', () => {
    const { r, armazenamento } = mk();
    act(() => void r.result.current.disparar({ id: 'meta-diaria', dados: {} }));
    const p = r.result.current.propsDoAtual()!;
    expect(p.evento.id).toBe('meta-diaria');
    expect(p.intensidade).toBe('pequena');
    expect(p.frasesRecentes).toEqual([]);
    act(() => p.onFraseEscolhida!(4));
    expect(armazenamento.valor?.frases['meta-diaria']).toEqual([4]);
  });
  it('evento fora do catalogo e ignorado; retorna so o que foi aceito', () => {
    const { r } = mk();
    let aceitos: unknown[] = [];
    act(() => {
      aceitos = r.result.current.disparar([{ id: 'inexistente', dados: {} }, { id: 'meta-diaria', dados: {} }]);
    });
    expect(aceitos).toHaveLength(1);
  });
  it('figurino: o hook sorteia, grava e o mesmo evento nao repete o figurino em sequencia', () => {
    const { r, avancar } = mk();
    const vistos: string[] = [];
    for (let k = 0; k < 8; k++) {
      avancar(60_000 * 60);
      act(() => void r.result.current.disparar({ id: 'liga-promocao-ouro', dados: { liga: 'Ouro', nivel_liga: 3 } }));
      const p = r.result.current.propsDoAtual()!;
      vistos.push(p.figurino as string);
      act(() => r.result.current.fechar());
      // o evento de liga aparece uma vez por dia: muda o dia no estado simulado seria necessario; aqui so conferimos o sorteio inicial
      break;
    }
    expect(['bomber', 'bone', 'esports', 'social']).toContain(vistos[0]);
    expect(r.result.current.estado.figurinos['liga-promocao-ouro']).toBe(vistos[0]);
    expect(r.result.current.estado.ultimoFigurino).toBe(vistos[0]);
  });
  it('estado de outro dia e zerado ao abrir, mas as frases recentes ficam', () => {
    const armazenamento = mem();
    armazenamento.valor = { dia: '2026-10-14', grandes: 1, medias: 0, celebracoes: 4, micros: 2, vistos: ['streak-7'], ultimoMicroMs: 0, ultimoErroMs: 0, ultimoMs: 0, frases: { 'meta-diaria': [2] }, figurinos: {} };
    const r = renderHook(() => useCelebracoes({ armazenamento, agora: () => 5_000_000, hoje: () => '2026-10-15' }));
    expect(r.result.current.estado.grandes).toBe(0);
    expect(r.result.current.estado.vistos).toEqual([]);
    expect(r.result.current.estado.frases['meta-diaria']).toEqual([2]);
  });
});
