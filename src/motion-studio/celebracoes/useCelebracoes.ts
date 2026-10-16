import { useCallback, useMemo, useRef, useState } from 'react';
import { CATALOGO } from './catalogo';
import type { CelebracaoStaziProps, EventoCelebracao } from './CelebracaoStazi';
import type { EventoApp } from './mapear';
import { ESTADO_VAZIO, PREFERENCIAS_PADRAO, decidir, normalizarDia, ordenarPorPrioridade, registrar, type Contexto, type Decisao, type EstadoCelebracoes, type PreferenciasCelebracao } from './regras';
import { escolherFigurino } from './figurino';
import { semente } from './frases';
import type { Figurino } from '../mascot/figurinos';
import type { Catalogo, EventoCatalogo, Intensidade } from './tipos';

export const CHAVE_ESTADO = 'stazia-celebracoes-v1';
/** Quantos eventos podem esperar na fila alem do atual. */
export const MAX_FILA = 2;

export interface ArmazenamentoEstado {
  ler(): EstadoCelebracoes | null;
  gravar(e: EstadoCelebracoes): void;
}

/** localStorage com try/catch (modo privado, bloqueio de dados do site...): sem storage, segue so em memoria. */
export function armazenamentoLocal(chave = CHAVE_ESTADO): ArmazenamentoEstado {
  return {
    ler() {
      try {
        const bruto = typeof localStorage !== 'undefined' ? localStorage.getItem(chave) : null;
        return bruto ? (JSON.parse(bruto) as EstadoCelebracoes) : null;
      } catch {
        return null;
      }
    },
    gravar(e) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(chave, JSON.stringify(e));
      } catch {
        /* sem armazenamento: o controle de fadiga vale so nesta sessao */
      }
    },
  };
}

export const diaLocal = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface ItemCelebracao {
  evento: EventoApp;
  def: EventoCatalogo;
  decisao: Decisao;
  seed: number;
  /** Figurino do Stazi sorteado (rodizio por evento e global). */
  figurino: Figurino;
}

export interface UseCelebracoesOpcoes {
  /** gamification_preferences.show_streak + preferencia de celebracoes (normal | reduzidas | silenciosas | desligadas). */
  preferencias?: PreferenciasCelebracao;
  /** "prova" e "simulado" (em andamento) bloqueiam o que o catalogo marca como bloqueado. */
  contexto?: Contexto;
  catalogo?: Catalogo;
  armazenamento?: ArmazenamentoEstado;
  /** Injecao para teste. */
  agora?: () => number;
  hoje?: () => string;
}

export interface UseCelebracoes {
  atual: ItemCelebracao | null;
  fila: ItemCelebracao[];
  /** Entrega um ou varios eventos do app; o hook decide intensidade, fila e limites. Retorna o que foi aceito. */
  disparar(eventos: EventoApp | readonly EventoApp[]): ItemCelebracao[];
  fechar(): void;
  /** Props prontas para <CelebracaoStazi />; o app so acrescenta onContinuar/onCompartilhar. */
  propsDoAtual(): Pick<CelebracaoStaziProps, 'evento' | 'intensidade' | 'fatorIntensidade' | 'modo' | 'volume' | 'frasesRecentes' | 'figurino' | 'voz' | 'onFraseEscolhida' | 'onFechar'> | null;
  estado: EstadoCelebracoes;
}

export function useCelebracoes(op: UseCelebracoesOpcoes = {}): UseCelebracoes {
  const { preferencias = PREFERENCIAS_PADRAO, contexto = 'normal', catalogo = CATALOGO, armazenamento, agora = Date.now, hoje = () => diaLocal() } = op;
  const store = useMemo(() => armazenamento ?? armazenamentoLocal(), [armazenamento]);
  const estadoRef = useRef<EstadoCelebracoes | null>(null);
  if (estadoRef.current === null) estadoRef.current = normalizarDia(store.ler() ?? ESTADO_VAZIO(hoje()), hoje());
  const [estado, setEstadoState] = useState<EstadoCelebracoes>(estadoRef.current);
  const [atual, setAtual] = useState<ItemCelebracao | null>(null);
  const [fila, setFila] = useState<ItemCelebracao[]>([]);
  const atualRef = useRef<ItemCelebracao | null>(null);
  const filaRef = useRef<ItemCelebracao[]>([]);
  const contador = useRef(0);

  const gravar = useCallback(
    (e: EstadoCelebracoes) => {
      estadoRef.current = e;
      setEstadoState(e);
      store.gravar(e);
    },
    [store],
  );
  const mostrar = useCallback(
    (item: ItemCelebracao | null) => {
      atualRef.current = item;
      setAtual(item);
      if (item) gravar(registrar(normalizarDia(estadoRef.current!, hoje()), item.def, item.decisao, hoje(), agora(), undefined, item.figurino));
    },
    [agora, gravar, hoje],
  );

  const disparar = useCallback(
    (entrada: EventoApp | readonly EventoApp[]): ItemCelebracao[] => {
      const lista = Array.isArray(entrada) ? entrada : [entrada as EventoApp];
      const dia = hoje();
      let est = normalizarDia(estadoRef.current!, dia);
      const t = agora();
      const aceitos: ItemCelebracao[] = [];
      for (const ev of lista) {
        const def = catalogo.eventos.find((e) => e.id === ev.id);
        if (!def) continue;
        const decisao = decidir(def, est, preferencias, contexto, t);
        if (!decisao.mostrar) continue;
        contador.current += 1;
        const seed = semente(def.id, dia, contador.current);
        aceitos.push({ evento: ev, def, decisao, seed, figurino: escolherFigurino(def, seed, [est.figurinos[def.id], est.ultimoFigurino]) });
      }
      const ordenados = ordenarPorPrioridade(aceitos, (i) => i.def);
      // No mesmo ato, so o de maior prioridade vem na intensidade cheia; os demais esperam na fila como micro (ate MAX_FILA).
      const comoMicro = (i: ItemCelebracao): ItemCelebracao => ({ ...i, decisao: { ...i.decisao, intensidade: 'micro' as Intensidade, rebaixada: i.decisao.intensidade !== 'micro' } });
      const [topo, ...resto] = ordenados;
      if (topo) {
        const atualIt = atualRef.current;
        // um micro em exibicao nao segura uma celebracao maior: ela entra na hora
        if (atualIt === null || (atualIt.decisao.intensidade === 'micro' && topo.decisao.intensidade !== 'micro')) {
          mostrar(topo);
          filaRef.current = [...filaRef.current, ...resto.map(comoMicro)].slice(0, MAX_FILA);
        } else {
          filaRef.current = [...filaRef.current, ...[topo, ...resto].map(comoMicro)].slice(0, MAX_FILA);
        }
      }
      setFila(filaRef.current);
      return aceitos;
    },
    [agora, catalogo, contexto, hoje, mostrar, preferencias],
  );

  const fechar = useCallback(() => {
    const [prox, ...resto] = filaRef.current;
    filaRef.current = resto;
    setFila(resto);
    mostrar(prox ?? null);
  }, [mostrar]);

  const propsDoAtual = useCallback(() => {
    const item = atualRef.current;
    if (!item) return null;
    const ev: EventoCelebracao = { id: item.evento.id, dados: item.evento.dados, seed: item.seed, ...(item.evento.complemento ? { complemento: item.evento.complemento } : {}) };
    return {
      evento: ev,
      intensidade: item.decisao.intensidade,
      fatorIntensidade: item.decisao.fatorIntensidade,
      modo: preferencias.modo,
      volume: item.decisao.volume,
      frasesRecentes: estadoRef.current?.frases[item.def.id] ?? [],
      figurino: item.figurino,
      voz: preferencias.voz,
      onFraseEscolhida: (indice: number) => {
        const e = estadoRef.current!;
        gravar({ ...e, frases: { ...e.frases, [item.def.id]: [...(e.frases[item.def.id] ?? []).filter((_, k, a) => k >= a.length - 5), indice].slice(-6) } });
      },
      onFechar: fechar,
    };
  }, [fechar, gravar, preferencias.modo, preferencias.voz]);

  return { atual, fila, disparar, fechar, propsDoAtual, estado };
}
