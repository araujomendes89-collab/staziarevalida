/**
 * Sorteio dos sons aprovados (pedido do dono, 16/10/2026): quando um evento tem mais de um som aprovado, o app sorteia um a cada vez
 * e nunca toca o mesmo duas vezes seguidas.
 *
 * - A memoria do "ultimo tocado" e por CONJUNTO de sons, nao por evento: eventos que dividem os mesmos sons (dia 2, dia 3 e dia comum da
 *   sequencia; as 5 promocoes de liga) tambem nao repetem entre si.
 * - A memoria fica no aparelho (localStorage) para valer de um dia para o outro; sem localStorage (modo privado, bloqueado), fica so na
 *   sessao e o sorteio continua funcionando.
 * - Serve para qualquer evento do catalogo: basta listar os sons aprovados em `variantes` (ligas incluidas).
 */

export interface MemoriaSorteio {
  ler(chave: string): string | undefined;
  gravar(chave: string, cue: string): void;
}

/** Chave do conjunto: a ordem da lista nao importa. */
export const chaveDoConjunto = (lista: readonly string[]): string => [...new Set(lista)].sort().join('|');

/** Sorteia um da lista, nunca o `ultimo` quando ha alternativa. `aleatorio` devolve [0, 1). */
export function sortearVariante(lista: readonly string[], ultimo: string | undefined, aleatorio: () => number = Math.random): string {
  const unicos = [...new Set(lista)];
  if (unicos.length === 0) throw new Error('sortearVariante: lista vazia');
  if (unicos.length === 1) return unicos[0];
  const livres = ultimo !== undefined && unicos.includes(ultimo) ? unicos.filter((c) => c !== ultimo) : unicos;
  const r = aleatorio();
  const i = Math.min(livres.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * livres.length)));
  return livres[i];
}

/** Chave no localStorage (um objeto { conjunto: ultimo cue }). */
export const CHAVE_MEMORIA_SORTEIO = 'stazia:sons:ultimo-sorteado';

/** Memoria em localStorage com reserva em memoria (nenhum erro de armazenamento chega ao som). */
export function memoriaLocal(chave: string = CHAVE_MEMORIA_SORTEIO): MemoriaSorteio {
  const sessao = new Map<string, string>();
  const ls = (): Storage | undefined => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : undefined;
    } catch {
      return undefined;
    }
  };
  const lerTudo = (): Record<string, string> => {
    try {
      const v = ls()?.getItem(chave);
      const o = v ? (JSON.parse(v) as unknown) : null;
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {};
    } catch {
      return {};
    }
  };
  return {
    ler(k) {
      const v = lerTudo()[k];
      return typeof v === 'string' ? v : sessao.get(k);
    },
    gravar(k, cue) {
      sessao.set(k, cue);
      try {
        ls()?.setItem(chave, JSON.stringify({ ...lerTudo(), [k]: cue }));
      } catch {
        /* sem armazenamento: fica so a memoria da sessao */
      }
    },
  };
}

/** Funcao de sorteio com memoria: recebe a lista de sons aprovados e devolve o da vez (e guarda como ultimo). */
export function criarSorteio(memoria: MemoriaSorteio = memoriaLocal(), aleatorio: () => number = Math.random): (lista: readonly string[]) => string {
  return (lista) => {
    const k = chaveDoConjunto(lista);
    const cue = sortearVariante(lista, memoria.ler(k), aleatorio);
    if (new Set(lista).size > 1) memoria.gravar(k, cue);
    return cue;
  };
}

/** Sorteio usado pelo app (um por pagina). */
export const sortearSomDoApp = criarSorteio();
