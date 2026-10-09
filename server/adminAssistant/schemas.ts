/**
 * Assistente de IA nas abas da Administração: esquema JSON da resposta da IA em cada modo (§6.5 da especificação).
 *
 * O esquema é folgado no tamanho do texto (o maior campo de texto que o assistente muda tem 4.000 caracteres) e o servidor
 * confere cada campo estrito depois (checks.ts), descartando com aviso em vez de falhar a execução inteira. Nas listas, o
 * número de entradas acompanha o maior campo de cada tipo (decisão A3): Recursos incluídos até 20 linhas, Linha do tempo até
 * 30 anos e Flashcards até 40. Nas listas a IA devolve só os itens a acrescentar, nunca o campo inteiro.
 *
 * O valor é um objeto `{ text, items, timeline, flashcards }` porque o validador (contentHub/ai/schema.ts) não tem união: a
 * IA preenche a parte do tipo do campo e deixa as outras em null; `pickValue` lê só essa parte.
 */
import type { Schema } from "../contentHub/ai/schema";
import type { AssistMode, FieldKind, FieldValue, Flashcard, FindingKind, TimelineEntry } from "../../src/shared/adminAssistant/types";

export const ADMIN_ASSIST_VERSION = "1.0.0";

/** Tipos de achado do Conferir. */
export const FINDING_KINDS: FindingKind[] = ["erro", "contradicao", "pouco_claro", "desatualizado"];

/** Maiores campos de lista de cada tipo (Planos: recursos; Atualizações: linha do tempo e flashcards). */
const MAX_LINES = 20;
const MAX_TIMELINE = 30;
const MAX_FLASHCARDS = 40;

const nullableList = (maxItems: number, items: Schema): Schema => ({ type: "array", nullable: true, maxItems, items });

export const VALUE_SCHEMA: Schema = {
  type: "object",
  additionalProperties: false,
  description:
    "Preencha só a parte do tipo do campo (texto, linhas, linha do tempo ou flashcards) e deixe as outras em null. Nas listas, só os itens a acrescentar.",
  required: ["text", "items", "timeline", "flashcards"],
  properties: {
    text: { type: "string", nullable: true, maxLength: 6000 },
    items: nullableList(MAX_LINES, { type: "string", maxLength: 300 }),
    timeline: nullableList(MAX_TIMELINE, {
      type: "object",
      additionalProperties: false,
      required: ["year", "text"],
      properties: { year: { type: "integer" }, text: { type: "string", maxLength: 2000 } },
    }),
    flashcards: nullableList(MAX_FLASHCARDS, {
      type: "object",
      additionalProperties: false,
      required: ["front", "back"],
      properties: { front: { type: "string", maxLength: 2000 }, back: { type: "string", maxLength: 2000 } },
    }),
  },
};

/** Marcas citadas ("I2", "T3", "F1"). */
const SOURCES: Schema = { type: "array", maxItems: 8, items: { type: "string", maxLength: 8 } };
const FIELD: Schema = { type: "string", maxLength: 60 };

const object = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const PREENCHER_SCHEMA: Schema = object({
  suggestions: { type: "array", maxItems: 30, items: object({ field: FIELD, value: VALUE_SCHEMA, sources: SOURCES }) },
  missing: { type: "array", maxItems: 20, items: object({ field: FIELD, reason: { type: "string", maxLength: 300 } }) },
});

export const CONFERIR_SCHEMA: Schema = object({
  findings: {
    type: "array",
    maxItems: 20,
    items: object({
      field: { ...FIELD, nullable: true },
      kind: { type: "string", enum: FINDING_KINDS },
      detail: { type: "string", maxLength: 600 },
      sources: SOURCES,
    }),
  },
});

export const CONVERSAR_SCHEMA: Schema = object({
  reply: { type: "string", maxLength: 1500 },
  changes: {
    type: "array",
    maxItems: 10,
    items: object({ field: FIELD, after: VALUE_SCHEMA, sources: SOURCES, reason: { type: "string", maxLength: 300 } }),
  },
});

export function schemaFor(mode: AssistMode): Schema {
  switch (mode) {
    case "preencher":
      return PREENCHER_SCHEMA;
    case "conferir":
      return CONFERIR_SCHEMA;
    case "conversar":
      return CONVERSAR_SCHEMA;
  }
}

/** Respostas já validadas pelo esquema de cada modo. */
export interface RawValue {
  text: string | null;
  items: string[] | null;
  timeline: TimelineEntry[] | null;
  flashcards: Flashcard[] | null;
}
export interface RawPreencher {
  suggestions: { field: string; value: RawValue; sources: string[] }[];
  missing: { field: string; reason: string }[];
}
export interface RawConferir {
  findings: { field: string | null; kind: FindingKind; detail: string; sources: string[] }[];
}
export interface RawConversar {
  reply: string;
  changes: { field: string; after: RawValue; sources: string[]; reason: string }[];
}

const trimmed = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const listOrNull = <T>(list: T[]): T[] | null => (list.length ? list : null);

/**
 * A parte do valor do tipo do campo (texto → `text`, linhas → `items`, linha do tempo → `timeline`, flashcards →
 * `flashcards`), com os textos aparados. Linha vazia sai; valor vazio vira null. Ano e tamanho ficam para `checkValue`.
 */
export function pickValue(kind: FieldKind, raw: RawValue | null | undefined): FieldValue | null {
  if (!isObject(raw)) return null;
  switch (kind) {
    case "text":
      return trimmed(raw.text) || null;
    case "lines":
      return Array.isArray(raw.items) ? listOrNull(raw.items.map(trimmed).filter(Boolean)) : null;
    case "timeline":
      return Array.isArray(raw.timeline)
        ? listOrNull(raw.timeline.filter(isObject).map((e) => ({ year: e.year as number, text: trimmed(e.text) })))
        : null;
    case "flashcards":
      return Array.isArray(raw.flashcards)
        ? listOrNull(raw.flashcards.filter(isObject).map((c) => ({ front: trimmed(c.front), back: trimmed(c.back) })))
        : null;
  }
}
