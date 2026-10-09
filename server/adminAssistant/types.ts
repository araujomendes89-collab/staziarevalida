/**
 * Assistente de IA nas abas da Administração: tipos do servidor (adaptador de cada aba, quem pede e o contexto do item).
 * Os campos e textos comuns ficam em src/shared/adminAssistant/types.ts, usados também pela tela.
 * Especificação: docs/superpowers/specs/2026-10-09-assistentes-abas-design.md (§6.2).
 */
import type { AssistForm, AssistMissing, FieldValue, TabSpec } from "../../src/shared/adminAssistant/types";

/** Quem pede, pelo `app_ch_whoami` com o token da pessoa. */
export interface Whoami {
  admin: boolean;
  staff: boolean;
  reviewer_areas: string[];
}

/** Acesso ao banco com o token da pessoa (as regras de permissão do banco valem). */
export interface AdapterCtx {
  asUser<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

/**
 * Contexto do item para o pedido à IA. `item` vira as marcas `[I1…]`; `readOnly` são linhas sem marca dentro de `<item>`
 * (ex.: o gabarito gravado); `query` alimenta a busca oficial; `skip` são campos que a aba recusa para este item (vão para
 * "A fonte não esclarece"); `warnings` são avisos gerais da resposta. `refuse` recusa um valor da IA que a aba não aceita
 * para este item (ex.: explicação que contradiz o gabarito gravado, decisão D6): devolve o motivo, que vai para "A fonte não
 * esclarece", ou null.
 */
export interface ItemContext {
  item: { field: string; label: string; text: string }[];
  readOnly: string[];
  query: string;
  skip: AssistMissing[];
  warnings: string[];
  refuse?: (field: string, value: FieldValue) => string | null;
}

/** Adaptador de uma aba: os campos (TabSpec) mais a permissão, o contexto e o id do item. */
export interface TabAdapter extends TabSpec {
  /** Regras da aba acrescentadas ao pedido do sistema. */
  rules: string[];
  /** Regra da aba sem o item (usada pelo status). */
  allowTab(me: Whoami): boolean;
  /** Permissão para este item, antes de qualquer gasto; recusa lançando `httpError(403 | 404, texto)`. */
  allow(me: Whoami, form: AssistForm, ctx: AdapterCtx): Promise<{ stored: AssistForm | null }>;
  context(form: AssistForm, stored: AssistForm | null): ItemContext;
  /** Item registrado no maestro: `<aba>:<id>` (novo: `<aba>:novo`). */
  itemId(form: AssistForm): string;
}

/** Erro com o status HTTP que a rota devolve. */
export function httpError(status: number, text: string): Error & { status: number } {
  return Object.assign(new Error(text), { status });
}
