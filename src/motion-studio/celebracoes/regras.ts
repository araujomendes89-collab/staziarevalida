import type { PreferenciaVoz } from './agendaSom';
import { INTENSIDADES, nivelIntensidade, type EventoCatalogo, type Intensidade } from './tipos';

/** Regras anti-fadiga: funcoes PURAS (sem relogio nem storage) para testar e para o hook reutilizar. */
export type Contexto = 'normal' | 'prova' | 'simulado';
/** normal | reduzidas (no maximo "pequena", menos particulas, som baixo) | silenciosas (como reduzidas, sem som) | desligadas (nada). */
export type ModoCelebracoes = 'normal' | 'reduzidas' | 'silenciosas' | 'desligadas';

export interface PreferenciasCelebracao {
  /** gamification_preferences.show_streak */
  show_streak: boolean;
  modo: ModoCelebracoes;
  /** Voz das falas: estilo (durona | stazi | desligada) e nivel da Durona (tutor_config.durona_level). Padrao: Durona, moderada. */
  voz?: PreferenciaVoz;
}
export const PREFERENCIAS_PADRAO: PreferenciasCelebracao = { show_streak: true, modo: 'normal' };

export interface EstadoCelebracoes {
  /** Dia local (AAAA-MM-DD) a que os contadores se referem. */
  dia: string;
  grandes: number;
  medias: number;
  /** Celebracoes de intensidade >= pequena mostradas hoje. */
  celebracoes: number;
  micros: number;
  /** Eventos "uma vez por dia" ja mostrados hoje. */
  vistos: string[];
  ultimoMicroMs: number;
  ultimoErroMs: number;
  ultimoMs: number;
  /** Indices das ultimas frases usadas por evento (limite de repeticao). */
  frases: Record<string, number[]>;
  /** Ultimo figurino do Stazi usado em cada evento (rodizio: nao repete em sequencia). */
  figurinos: Record<string, string>;
  /** Ultimo figurino usado em qualquer celebracao. */
  ultimoFigurino?: string;
}

export const ESTADO_VAZIO = (dia: string): EstadoCelebracoes => ({ dia, grandes: 0, medias: 0, celebracoes: 0, micros: 0, vistos: [], ultimoMicroMs: -1e12, ultimoErroMs: -1e12, ultimoMs: -1e12, frases: {}, figurinos: {} });

export const LIMITES = {
  /** No maximo 1 celebracao grande (ou epica) por dia; as demais viram "media". */
  grandesPorDia: 1,
  /** Depois de tantas celebracoes grandes/medias no dia, rebaixa uma intensidade. */
  celebracoesAteRebaixar: 6,
  /** Intervalo minimo entre micros (ms). */
  intervaloMicroMs: 3000,
  /** Depois de tantos micros no dia, eles ficam sem som. */
  microsComSom: 12,
  /** Intervalo minimo entre mensagens de erro encorajador (3 min). */
  intervaloErroMs: 180000,
} as const;

/** Eventos que podem repetir no dia (todo o resto aparece uma vez por dia). */
const REPETIVEIS = /^(questao-correta|xp-ganho|erro-encorajador|dica-disponivel|serie-acertos-\d+|missao-cumprida|aula-concluida|conquista-desbloqueada|ranking-subiu)$/;

export interface Decisao {
  mostrar: boolean;
  motivo?: 'desligadas' | 'contexto' | 'show_streak' | 'ja-visto-hoje' | 'intervalo' | 'erro-intervalo';
  intensidade: Intensidade;
  /** 0,2..1: multiplica particulas/overshoot (usuario frequente = menos). */
  fatorIntensidade: number;
  /** 0..1: volume relativo (0 = sem som). */
  volume: number;
  rebaixada: boolean;
}

const nega = (motivo: Decisao['motivo'], intensidade: Intensidade): Decisao => ({ mostrar: false, motivo, intensidade, fatorIntensidade: 1, volume: 0, rebaixada: false });
const abaixo = (i: Intensidade): Intensidade => INTENSIDADES[Math.max(0, nivelIntensidade(i) - 1)];
const limitar = (i: Intensidade, max: Intensidade): Intensidade => (nivelIntensidade(i) > nivelIntensidade(max) ? max : i);

export function decidir(evento: EventoCatalogo, estado: EstadoCelebracoes, prefs: PreferenciasCelebracao, contexto: Contexto, agoraMs: number): Decisao {
  const base = evento.intensidade;
  if (prefs.modo === 'desligadas') return nega('desligadas', base);
  if (contexto !== 'normal' && evento.bloqueado_em.includes(contexto)) return nega('contexto', base);
  if (evento.requer_show_streak && !prefs.show_streak) return nega('show_streak', base);
  if (!REPETIVEIS.test(evento.id) && estado.vistos.includes(evento.id)) return nega('ja-visto-hoje', base);
  if (evento.categoria === 'erro' && agoraMs - estado.ultimoErroMs < LIMITES.intervaloErroMs) return nega('erro-intervalo', base);

  let intensidade = base;
  let rebaixada = false;
  const mexe = (nova: Intensidade) => {
    if (nova !== intensidade) {
      intensidade = nova;
      rebaixada = true;
    }
  };
  if (nivelIntensidade(intensidade) >= nivelIntensidade('grande') && estado.grandes >= LIMITES.grandesPorDia) mexe('media');
  if (nivelIntensidade(intensidade) >= nivelIntensidade('media') && estado.celebracoes >= LIMITES.celebracoesAteRebaixar) mexe(abaixo(intensidade));
  if (prefs.modo === 'reduzidas' || prefs.modo === 'silenciosas') mexe(limitar(intensidade, 'pequena'));
  if (intensidade === 'micro' && agoraMs - estado.ultimoMicroMs < LIMITES.intervaloMicroMs) return nega('intervalo', intensidade);

  let fator = 1;
  if (estado.celebracoes >= 3) fator = 0.7;
  if (estado.celebracoes >= LIMITES.celebracoesAteRebaixar) fator = 0.5;
  if (prefs.modo === 'reduzidas' || prefs.modo === 'silenciosas') fator = Math.min(fator, 0.5);
  let volume = prefs.modo === 'normal' ? 1 : prefs.modo === 'reduzidas' ? 0.5 : 0;
  if (intensidade === 'micro' && estado.micros >= LIMITES.microsComSom) volume = 0;
  if (fator < 1 && volume > 0) volume *= 0.5 + 0.5 * fator;
  return { mostrar: true, intensidade, fatorIntensidade: fator, volume, rebaixada };
}

/** Atualiza contadores depois que a celebracao foi MOSTRADA (retorna estado novo; nunca muta). */
export function registrar(estado: EstadoCelebracoes, evento: EventoCatalogo, decisao: Decisao, hoje: string, agoraMs: number, indiceFrase?: number, figurino?: string): EstadoCelebracoes {
  const e: EstadoCelebracoes = estado.dia === hoje ? { ...estado, vistos: [...estado.vistos], frases: { ...estado.frases }, figurinos: { ...(estado.figurinos ?? {}) } } : { ...ESTADO_VAZIO(hoje), frases: { ...estado.frases }, figurinos: { ...(estado.figurinos ?? {}) }, ultimoFigurino: estado.ultimoFigurino };
  const i = decisao.intensidade;
  if (i === 'micro') {
    e.micros += 1;
    e.ultimoMicroMs = agoraMs;
  } else {
    e.celebracoes += 1;
    if (nivelIntensidade(i) >= nivelIntensidade('grande')) e.grandes += 1;
    if (i === 'media') e.medias += 1;
  }
  if (evento.categoria === 'erro') e.ultimoErroMs = agoraMs;
  if (!e.vistos.includes(evento.id)) e.vistos.push(evento.id);
  e.ultimoMs = agoraMs;
  if (figurino) {
    e.figurinos[evento.id] = figurino;
    e.ultimoFigurino = figurino;
  }
  if (indiceFrase !== undefined) e.frases[evento.id] = [...(e.frases[evento.id] ?? []), indiceFrase].slice(-6);
  return e;
}

/** Estado vindo do storage de outro dia: zera os contadores do dia e preserva as frases recentes. */
export function normalizarDia(estado: EstadoCelebracoes, hoje: string): EstadoCelebracoes {
  return estado.dia === hoje ? { ...estado, figurinos: estado.figurinos ?? {} } : { ...ESTADO_VAZIO(hoje), frases: estado.frases, figurinos: estado.figurinos ?? {}, ultimoFigurino: estado.ultimoFigurino };
}

/** Varios eventos no mesmo ato (ex.: aula + conquista + nivel): maior prioridade primeiro; o resto vira fila. */
export function ordenarPorPrioridade<T>(itens: readonly T[], def: (t: T) => EventoCatalogo): T[] {
  return [...itens].sort((a, b) => def(b).prioridade - def(a).prioridade);
}
