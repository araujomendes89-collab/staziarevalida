import { variaveisDe } from './schema';
import type { Dados, EventoCatalogo } from './tipos';

/** PRNG com semente (mulberry32): mesma semente = mesma frase, para testes e video. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash estavel de texto -> semente. */
export function semente(...partes: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of partes.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Troca {variavel} pelo valor REAL recebido da aplicacao. Variavel ausente = texto nao usavel (retorna null). */
export function preencher(modelo: string, dados: Dados): string | null {
  let falta = false;
  const out = modelo.replace(/\{(\w+)\}/g, (_, v: string) => {
    const x = dados[v as keyof Dados];
    if (x === undefined || x === null || x === '') {
      falta = true;
      return '';
    }
    return String(x);
  });
  return falta ? null : out;
}

/** Quantas frases recentes (do mesmo evento) ficam de fora para nao repetir. */
export const JANELA_REPETICAO = 3;

export interface EscolhaFrase {
  frase: string;
  indice: number;
}

/**
 * Escolhe uma frase do evento: so as que tem todas as variaveis disponiveis, fora as usadas nas
 * ultimas JANELA_REPETICAO vezes (indices em `recentes`), sorteio com semente estavel.
 */
export function escolherFrase(evento: EventoCatalogo, dados: Dados, sementeBase: number, recentes: readonly number[] = []): EscolhaFrase {
  const usaveis = evento.frases.map((f, i) => ({ f, i, t: preencher(f, dados) })).filter((x): x is { f: string; i: number; t: string } => x.t !== null);
  const pool = usaveis.length > 0 ? usaveis : [{ f: evento.frases[0], i: 0, t: preencher(evento.frases[0], { ...dados, n: dados.n ?? '' }) ?? evento.frases[0].replace(/\{\w+\}/g, '') }];
  const janela = Math.min(JANELA_REPETICAO, Math.max(0, pool.length - 1));
  const bloqueados = new Set(recentes.slice(-janela));
  const livres = pool.filter((x) => !bloqueados.has(x.i));
  const lista = livres.length > 0 ? livres : pool;
  const escolhida = lista[Math.floor(prng(sementeBase)() * lista.length)];
  return { frase: escolhida.t, indice: escolhida.i };
}

export function textoTitulo(evento: EventoCatalogo, dados: Dados): string {
  return preencher(evento.titulo, dados) ?? evento.titulo.replace(/\{\w+\}/g, '').trim();
}

export function textoDetalhe(evento: EventoCatalogo, dados: Dados): string | null {
  return evento.detalhe ? preencher(evento.detalhe, dados) : null;
}

/** Variaveis que o app precisa fornecer para o evento (do titulo e do numero principal). */
export function variaveisObrigatorias(evento: EventoCatalogo): string[] {
  return Array.from(new Set([...variaveisDe(evento.titulo), ...(evento.numero.modo !== 'nenhum' ? [evento.numero.variavel] : [])]));
}
