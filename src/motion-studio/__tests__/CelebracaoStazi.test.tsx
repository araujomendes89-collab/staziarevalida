import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CelebracaoStazi } from '../celebracoes/CelebracaoStazi';
import { CATALOGO } from '../celebracoes/catalogo';
import { DADOS_DEMO } from '../celebracoes/demoDados';
import { DURACAO } from '../celebracoes/coreografia';
import { preencher } from '../celebracoes/frases';

const ev = (id: string, seed = 1) => ({ id, dados: DADOS_DEMO[id], seed });
const def = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;
const base = { onFechar: () => {} };

describe('CelebracaoStazi', () => {
  beforeEach(() => localStorage.clear());

  it('role=status com titulo e frase do catalogo (numero real) para leitor de tela', () => {
    render(<CelebracaoStazi {...base} evento={ev('streak-30')} time={DURACAO.grande} />);
    const s = screen.getByTestId('cz-status');
    expect(s.getAttribute('role')).toBe('status');
    expect(s.textContent).toContain('30 dias de sequência');
    const frases = def('streak-30').frases.map((f) => preencher(f, DADOS_DEMO['streak-30'])!);
    expect(frases.some((f) => s.textContent!.includes(f))).toBe(true);
    expect(screen.getByTestId('cz-alt').textContent).toMatch(/^Stazi, o mascote do StaziaMed, /);
  });
  it('mesma semente = mesma frase; sementes diferentes variam', () => {
    const txt = (seed: number) => {
      const { unmount } = render(<CelebracaoStazi {...base} evento={ev('meta-diaria', seed)} time={DURACAO.pequena} />);
      const t = screen.getByTestId('cz-status').textContent;
      unmount();
      return t;
    };
    expect(txt(3)).toBe(txt(3));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(txt)).size).toBeGreaterThan(2);
  });
  it('grande: no inicio tem Pular e nenhum botao de saida; no fim mostra 30, Compartilhar e Continuar', () => {
    const onContinuar = vi.fn();
    const onCompartilhar = vi.fn();
    const { container, unmount } = render(<CelebracaoStazi {...base} evento={ev('streak-30')} time={0} onContinuar={onContinuar} onCompartilhar={onCompartilhar} />);
    expect(screen.getByRole('button', { name: 'Pular' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    unmount();
    const r = render(<CelebracaoStazi {...base} evento={ev('streak-30')} time={DURACAO.grande} onContinuar={onContinuar} onCompartilhar={onCompartilhar} />);
    expect(r.container.querySelector('.cz-numero')?.textContent).toContain('30');
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar marco' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onCompartilhar).toHaveBeenCalledTimes(1);
    expect(onContinuar).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('[data-finished="true"]')).toBeTruthy();
    void container;
  });
  it('so mostra Compartilhar quando o evento e compartilhavel E o app forneceu o callback', () => {
    const { unmount } = render(<CelebracaoStazi {...base} evento={ev('aula-concluida')} time={DURACAO.media} onCompartilhar={() => {}} />);
    expect(screen.queryByRole('button', { name: /Compartilhar/ })).toBeNull(); // aula nao e compartilhavel
    unmount();
    render(<CelebracaoStazi {...base} evento={ev('streak-30')} time={DURACAO.grande} />);
    expect(screen.queryByRole('button', { name: /Compartilhar/ })).toBeNull(); // sem callback
  });
  it('Pular leva ao final e avisa; Esc fecha', () => {
    const onPular = vi.fn();
    const onFechar = vi.fn();
    render(<CelebracaoStazi evento={ev('novo-nivel')} onPular={onPular} onFechar={onFechar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onPular).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText(/Celebração/), { key: 'Escape' });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
  it('movimento reduzido: estado final imediato (pose final + frase), sem Pular, sem som, sem particulas', () => {
    const onConcluir = vi.fn();
    const { container } = render(<CelebracaoStazi {...base} evento={ev('streak-30')} reducedMotion sound={{ urls: { pop: 'x' } }} onConcluir={onConcluir} />);
    expect(screen.queryByRole('button', { name: 'Pular' })).toBeNull();
    expect(screen.queryByRole('button', { name: /som/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    expect(container.querySelectorAll('.cz-fx-top g g').length).toBe(0);
    expect(screen.getByTestId('cz-status').textContent).toContain('30 dias de sequência');
    expect(onConcluir).toHaveBeenCalledTimes(1);
  });
  it('micro: faixa sem botoes, fecha sozinha ao terminar; reduzido tambem fecha depois de alguns segundos', () => {
    vi.useFakeTimers();
    const onFechar = vi.fn();
    const { container, unmount } = render(<CelebracaoStazi evento={ev('questao-correta')} onFechar={onFechar} reducedMotion />);
    expect(container.querySelector('.cz-chip')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    vi.advanceTimersByTime(3900);
    expect(onFechar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onFechar).toHaveBeenCalledTimes(1);
    unmount();
    vi.useRealTimers();
  });
  it('erro encorajador: micro, sem botoes e texto acolhedor (sem comemorar)', () => {
    const { container } = render(<CelebracaoStazi {...base} evento={ev('erro-encorajador')} time={DURACAO.micro} />);
    expect(container.querySelector('.cz--micro')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelectorAll('.cz-fx g').length).toBe(0);
    expect(screen.getByTestId('cz-status').textContent).toMatch(/Recuo tático/);
  });
  it('intensidade forcada pelo app (hook) vale sobre a do catalogo', () => {
    const { container } = render(<CelebracaoStazi {...base} evento={ev('streak-100')} intensidade="pequena" time={DURACAO.pequena} />);
    expect(container.querySelector('.cz--pequena')).toBeTruthy();
    expect(container.querySelector('.cz--epica')).toBeNull();
  });
  it('evento desconhecido nao renderiza nada (nao quebra a tela)', () => {
    const { container } = render(<CelebracaoStazi {...base} evento={{ id: 'nao-existe', dados: {} }} />);
    expect(container.firstChild).toBeNull();
  });
  it('cenario do catalogo aplicado e dados nao alterados pela animacao', () => {
    const dados = { n: 7, recorde: 7 };
    const snap = JSON.stringify(dados);
    const { container } = render(<CelebracaoStazi {...base} evento={{ id: 'streak-7', dados }} time={4000} />);
    expect(container.querySelector('[data-cenario="estudio-escuro"]')).toBeTruthy();
    expect(JSON.stringify(dados)).toBe(snap);
  });
  it('numero ausente nos dados nao inventa valor', () => {
    const { container } = render(<CelebracaoStazi {...base} evento={{ id: 'simulado-medio', dados: {} }} time={DURACAO.media} />);
    expect(container.querySelector('.cz-numero')).toBeNull();
    expect(screen.getByTestId('cz-status').textContent).not.toMatch(/undefined|NaN|\{/);
  });
  it('com som: botao de mudo aparece, alterna e persiste; relogio controlado nao cria motor', () => {
    const { unmount } = render(<CelebracaoStazi {...base} evento={ev('streak-14')} sound={{ urls: {} }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desligar som' }));
    expect(screen.getByRole('button', { name: 'Ligar som' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('stazia-motion-muted')).toBe('1');
    unmount();
    render(<CelebracaoStazi {...base} evento={ev('streak-14')} time={1000} sound={{ urls: {} }} />);
    expect(screen.queryByRole('button', { name: /som/i })).toBeNull();
  });
  it('preferencia silenciosa ou volume 0: nenhum botao/motor de som', () => {
    const { unmount } = render(<CelebracaoStazi {...base} evento={ev('streak-14')} modo="silenciosas" sound={{ urls: {} }} />);
    expect(screen.queryByRole('button', { name: /som/i })).toBeNull();
    unmount();
    render(<CelebracaoStazi {...base} evento={ev('streak-14')} volume={0} sound={{ urls: {} }} />);
    expect(screen.queryByRole('button', { name: /som/i })).toBeNull();
  });
  it('avisa a frase escolhida (para o limite de repeticao)', () => {
    const onFraseEscolhida = vi.fn();
    render(<CelebracaoStazi {...base} evento={ev('meta-diaria')} time={1000} onFraseEscolhida={onFraseEscolhida} />);
    expect(onFraseEscolhida).toHaveBeenCalledTimes(1);
    expect(onFraseEscolhida.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });
  it('figurino: o Stazi muda de roupa por semente, respeita o pool do evento e nunca repete o evitado', () => {
    const fig = (seed: number, evitar: string[] = []) => {
      const { container, unmount } = render(<CelebracaoStazi {...base} evento={ev('streak-30', seed)} evitarFigurinos={evitar} time={DURACAO.grande} />);
      const f = container.querySelector('[data-figurino]')!.getAttribute('data-figurino')!;
      unmount();
      return f;
    };
    const pool = def('streak-30').reacao.figurinos as string[];
    const vistos = new Set<string>();
    for (let s = 1; s <= 30; s++) {
      const f = fig(s);
      expect(pool).toContain(f);
      vistos.add(f);
      expect(fig(s, [f])).not.toBe(f);
    }
    expect(vistos.size).toBeGreaterThanOrEqual(2);
  });
  it('figurino forcado vira o sprite do figurino e o alt descreve a roupa', () => {
    const { container } = render(<CelebracaoStazi {...base} evento={ev('streak-30')} figurino="bone" time={DURACAO.grande} />);
    expect(container.querySelector('[data-figurino="bone"]')).toBeTruthy();
    expect(screen.getByTestId('cz-alt').textContent).toMatch(/boné/);
    const srcs = Array.from(container.querySelectorAll('img.cz-sprite')).map((i) => i.getAttribute('src'));
    expect(srcs.length).toBe(3);
    expect(srcs.some((x) => /bone-cruzado/.test(x ?? ''))).toBe(true);
  });
  it('mapa evento -> arquivo do dono: o motor de som nasce com o arquivo mapeado (so em tela cheia ha botao de mudo)', () => {
    const { unmount } = render(<CelebracaoStazi {...base} evento={ev('aula-concluida')} sound={{ urls: {}, porEvento: { 'aula-concluida': { url: 'hee.mp3', momento: 'climax', gain: 1 } } }} />);
    expect(screen.getByRole('button', { name: 'Desligar som' })).toBeTruthy();
    unmount();
  });
  it('todos os eventos renderizam no inicio, no meio e no fim sem erro e sem texto quebrado', () => {
    for (const e of CATALOGO.eventos) {
      for (const t of [0, DURACAO[e.intensidade] / 2, DURACAO[e.intensidade]]) {
        const { unmount } = render(<CelebracaoStazi {...base} evento={ev(e.id)} time={t} />);
        expect(screen.getByTestId('cz-status').textContent).not.toMatch(/undefined|NaN|\{|\}/);
        unmount();
      }
    }
  });
});
