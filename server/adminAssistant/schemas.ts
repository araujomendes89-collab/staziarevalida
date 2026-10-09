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
 *
 * Limites (decisão D3d): `toProviderSchema` não manda maxLength/maxItems ao provedor, então a IA só os conhece pelo pedido
 * (LIMITS, ditos no sistema). O provedor confere a resposta com o esquema sem limites (`providerSchemaFor`); o motor ajusta a
 * resposta (`fitOutput`: corta textos livres, limita listas e separa marcas juntas) e só então confere com o esquema estrito.
 * O que não tem conserto sai com aviso, sem derrubar o pedido inteiro. Fonte que não é só marca fica como marca desconhecida
 * (decisão D5), para o campo que exige fonte ir para "Sem fonte".
 */
import type { Schema } from "../contentHub/ai/schema";
import type { AssistMode, FieldKind, FieldValue, Flashcard, FindingKind, TimelineEntry } from "../../src/shared/adminAssistant/types";

export const ADMIN_ASSIST_VERSION = "1.0.0";

/** Tipos de achado do Conferir. */
export const FINDING_KINDS: FindingKind[] = ["erro", "contradicao", "pouco_claro", "desatualizado"];

/**
 * Limites da resposta, iguais no esquema estrito e no pedido à IA. Listas do valor: maiores campos de cada tipo (Planos:
 * recursos; Atualizações: linha do tempo e flashcards).
 */
export const LIMITS = {
  text: 6000,
  line: 300,
  entry: 2000,
  lines: 20,
  timeline: 30,
  flashcards: 40,
  sources: 8,
  mark: 8,
  field: 60,
  suggestions: 30,
  missing: 20,
  findings: 20,
  changes: 10,
  reason: 300,
  detail: 600,
  reply: 1500,
} as const;

const nullableList = (maxItems: number, items: Schema): Schema => ({ type: "array", nullable: true, maxItems, items });

export const VALUE_SCHEMA: Schema = {
  type: "object",
  additionalProperties: false,
  description:
    "Preencha só a parte do tipo do campo (texto, linhas, linha do tempo ou flashcards) e deixe as outras em null. Nas listas, só os itens a acrescentar.",
  required: ["text", "items", "timeline", "flashcards"],
  properties: {
    text: { type: "string", nullable: true, maxLength: LIMITS.text },
    items: nullableList(LIMITS.lines, { type: "string", maxLength: LIMITS.line }),
    timeline: nullableList(LIMITS.timeline, {
      type: "object",
      additionalProperties: false,
      required: ["year", "text"],
      properties: { year: { type: "integer" }, text: { type: "string", maxLength: LIMITS.entry } },
    }),
    flashcards: nullableList(LIMITS.flashcards, {
      type: "object",
      additionalProperties: false,
      required: ["front", "back"],
      properties: { front: { type: "string", maxLength: LIMITS.entry }, back: { type: "string", maxLength: LIMITS.entry } },
    }),
  },
};

/** Marcas citadas ("I2", "T3", "F1"). */
const SOURCES: Schema = { type: "array", maxItems: LIMITS.sources, items: { type: "string", maxLength: LIMITS.mark } };
const FIELD: Schema = { type: "string", maxLength: LIMITS.field };

const object = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const PREENCHER_SCHEMA: Schema = object({
  suggestions: { type: "array", maxItems: LIMITS.suggestions, items: object({ field: FIELD, value: VALUE_SCHEMA, sources: SOURCES }) },
  missing: { type: "array", maxItems: LIMITS.missing, items: object({ field: FIELD, reason: { type: "string", maxLength: LIMITS.reason } }) },
});

export const CONFERIR_SCHEMA: Schema = object({
  findings: {
    type: "array",
    maxItems: LIMITS.findings,
    items: object({
      field: { ...FIELD, nullable: true },
      kind: { type: "string", enum: FINDING_KINDS },
      detail: { type: "string", maxLength: LIMITS.detail },
      sources: SOURCES,
    }),
  },
});

export const CONVERSAR_SCHEMA: Schema = object({
  reply: { type: "string", maxLength: LIMITS.reply },
  changes: {
    type: "array",
    maxItems: LIMITS.changes,
    items: object({ field: FIELD, after: VALUE_SCHEMA, sources: SOURCES, reason: { type: "string", maxLength: LIMITS.reason } }),
  },
});

/** Esquema estrito de cada modo (com os limites): a conferência final da resposta, depois de `fitOutput`. */
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

/** O mesmo esquema sem maxLength/maxItems (o que o provedor recebe de fato, porque `toProviderSchema` não os manda). */
function relaxed(schema: Schema): Schema {
  const { maxLength: _maxLength, maxItems: _maxItems, ...rest } = schema;
  const out: Schema = { ...rest };
  if (schema.properties) out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, relaxed(v)]));
  if (schema.items) out.items = relaxed(schema.items);
  return out;
}

const PROVIDER_SCHEMAS: Record<AssistMode, Schema> = {
  preencher: relaxed(PREENCHER_SCHEMA),
  conferir: relaxed(CONFERIR_SCHEMA),
  conversar: relaxed(CONVERSAR_SCHEMA),
};

/** Esquema do pedido ao provedor: tipos, obrigatórios e lista de valores, sem os limites (decisão D3d). */
export function providerSchemaFor(mode: AssistMode): Schema {
  return PROVIDER_SCHEMAS[mode];
}

// ------------------------------------------------------------------ ajuste da resposta aos limites (decisão D3d)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Textos livres que se cortam no limite; qualquer outro texto acima do limite (conteúdo, nome de campo, marca) não se corta. */
const CUTTABLE = new Set(["reply", "reason", "detail"]);
const CUT_NAME: Record<string, string> = { reply: "resposta", reason: "motivo", detail: "explicação do achado" };
const LIST_NAME: Record<string, string> = {
  suggestions: "sugestões",
  missing: 'campos em "A fonte não esclarece"',
  findings: "achados",
  changes: "mudanças",
  items: "linhas",
  timeline: "anos na linha do tempo",
  flashcards: "flashcards",
  sources: "marcas de fonte",
};
const DROPPED: Record<string, string> = {
  suggestions: "uma sugestão foi descartada",
  missing: 'um campo de "A fonte não esclarece" foi descartado',
  findings: "um achado foi descartado",
  changes: "uma mudança foi descartada",
  items: "uma linha foi descartada",
  timeline: "um ano da linha do tempo foi descartado",
  flashcards: "um flashcard foi descartado",
  sources: "uma fonte citada foi descartada",
};

/** 1500 → "1.500". */
export const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const cutWarning = (key: string, max: number) => `Resposta da IA cortada no limite de ${thousands(max)} caracteres (${CUT_NAME[key] ?? key}).`;
const capWarning = (key: string, max: number, left: number) =>
  `Resposta da IA acima do limite de ${max} ${LIST_NAME[key] ?? "itens"}: ${left} ${left === 1 ? "ficou" : "ficaram"} de fora.`;
const dropWarning = (key: string, max: number) => `Resposta da IA com texto acima de ${thousands(max)} caracteres: ${DROPPED[key] ?? "um item foi descartado"}.`;

/** Texto acima do limite que não se corta: sobe até a entrada de lista mais próxima, que sai com aviso. */
class Dropped {
  constructor(readonly max: number) {}
}

/** Uma marca na fonte citada, com colchetes opcionais ("T1", "[I9]", "t 3"). */
const MARK_IN_TEXT = /\[?\s*\b([ITF])\s*(\d{1,4})\b\s*\]?/gi;
/** O que pode sobrar entre as marcas de uma fonte feita só de marcas: espaços e pontuação de lista. */
const ONLY_SEPARATORS = /^[\s,;\/|&+.-]*$/;

/**
 * Fonte em texto livre que fica como marca desconhecida: cortada no limite com "…" no fim, que nenhuma marca do pedido tem,
 * para nunca virar uma marca válida (ex.: "[T1]      x" não vira "[T1]").
 */
const unknownMark = (entry: string) => (entry.length > LIMITS.mark ? `${entry.slice(0, LIMITS.mark - 1).trimEnd()}…` : entry);

/**
 * Fontes citadas, uma marca por entrada, sem repetir (decisão D5). Só a fonte feita apenas de marcas e separadores ("T1, T2",
 * "[I9]", "t3; F2") vira as marcas separadas. Qualquer outra ("Diretriz SBP 2023", "I9 e literatura", "sem trecho: T1 não
 * cobre isso") fica como marca desconhecida, cortada se longa: `resolveMarks` a põe em `unknown` e o campo que exige fonte vai
 * para "Sem fonte", em vez de a marca de dentro do texto livre valer como citação. Fonte em branco fica como veio (não cita nada).
 */
function splitMarks(list: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") {
      out.push(entry);
      continue;
    }
    const found = [...entry.matchAll(MARK_IN_TEXT)].map((m) => `${m[1].toUpperCase()}${m[2]}`);
    const onlyMarks = found.length > 0 && ONLY_SEPARATORS.test(entry.replace(MARK_IN_TEXT, " "));
    for (const mark of onlyMarks ? found : [unknownMark(entry)]) if (!out.includes(mark)) out.push(mark);
  }
  return out;
}

function fit(schema: Schema, value: unknown, key: string, notes: Set<string>): unknown {
  if (value === null || value === undefined) return value;
  switch (schema.type) {
    case "object": {
      if (!isObject(value)) return value;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const sub = schema.properties?.[k];
        const fixed = sub ? fit(sub, v, k, notes) : v;
        if (fixed instanceof Dropped) return fixed;
        out[k] = fixed;
      }
      return out;
    }
    case "array": {
      if (!Array.isArray(value)) return value;
      const kept: unknown[] = [];
      for (const entry of schema === SOURCES ? splitMarks(value) : value) {
        const fixed = schema.items ? fit(schema.items, entry, key, notes) : entry;
        if (fixed instanceof Dropped) notes.add(dropWarning(key, fixed.max));
        else kept.push(fixed);
      }
      if (schema.maxItems !== undefined && kept.length > schema.maxItems) {
        notes.add(capWarning(key, schema.maxItems, kept.length - schema.maxItems));
        kept.length = schema.maxItems;
      }
      return kept;
    }
    case "string": {
      if (typeof value !== "string" || schema.maxLength === undefined || value.length <= schema.maxLength) return value;
      if (!CUTTABLE.has(key)) return new Dropped(schema.maxLength);
      notes.add(cutWarning(key, schema.maxLength));
      return value.slice(0, schema.maxLength).trimEnd();
    }
    default:
      return value;
  }
}

/**
 * A resposta da IA ajustada aos limites do esquema estrito, com os avisos: textos livres (resposta, motivo, detalhe) cortados;
 * listas acima do máximo limitadas; fonte feita só de marcas ("T1, T2, T3") separada e qualquer outra fonte mantida como marca
 * desconhecida, cortada se longa (decisão D5); o que não tem conserto (texto de valor ou nome de campo acima do limite) sai da
 * lista em que está. Tipo errado fica para a conferência estrita.
 */
export function fitOutput(mode: AssistMode, raw: unknown): { output: unknown; warnings: string[] } {
  const notes = new Set<string>();
  const output = fit(schemaFor(mode), raw, "", notes);
  return { output: output instanceof Dropped ? raw : output, warnings: [...notes] };
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
