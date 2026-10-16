import json from './catalogo.json';
import { assertCatalogo } from './schema';
import type { Catalogo, EventoCatalogo } from './tipos';

assertCatalogo(json);
/** Catalogo padrao (validado ao carregar: JSON invalido derruba o build/teste, nunca a tela do aluno em silencio). */
export const CATALOGO: Catalogo = json as unknown as Catalogo;

export function eventoPorId(id: string, catalogo: Catalogo = CATALOGO): EventoCatalogo | undefined {
  return catalogo.eventos.find((e) => e.id === id);
}
