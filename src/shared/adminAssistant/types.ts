/**
 * Assistente de IA nas abas da Administração: tipos e textos comuns ao servidor
 * (server/adminAssistant) e à tela (src/novo/app/admin/assistant). Sem dependências.
 * Especificação: docs/superpowers/specs/2026-10-09-assistentes-abas-design.md.
 */

export type AssistTab = "questoes" | "atualizacoes" | "planos";
export type AssistMode = "preencher" | "conferir" | "conversar";

/** Formato do campo: texto, linhas (lista de textos), linha do tempo ou flashcards. */
export type FieldKind = "text" | "lines" | "timeline" | "flashcards";
/** O que o assistente faz no campo: propõe texto, só aponta, ou nunca toca. */
export type FieldAi = "editar" | "conferir" | "nunca";
/** Base exigida: fonte citada ([T] material ou [F] trecho oficial), o próprio item ou as notas da pessoa. */
export type FieldBase = "fonte" | "item" | "notas";

export interface TimelineEntry {
  year: number;
  text: string;
}
export interface Flashcard {
  front: string;
  back: string;
}
export type FieldValue = string | string[] | TimelineEntry[] | Flashcard[];

/**
 * Campo de uma aba. Texto: `max` = caracteres. Lista: `max` = itens e `itemMax` = caracteres por item.
 * `owner` = quem muda o campo, mostrado no achado do Conferir em campo que o assistente não muda.
 */
export interface AdapterField {
  name: string;
  label: string;
  kind: FieldKind;
  ai: FieldAi;
  base: FieldBase;
  max: number;
  itemMax?: number;
  owner?: string;
}

/** Formulário da aba como está na tela (inclusive o que ainda não foi salvo). */
export type AssistForm = Record<string, any>;

export interface TabSpec {
  tab: AssistTab;
  medical: boolean;
  material: "material" | "notas";
  fields: AdapterField[];
  /** Valor de cada campo da lista, lido do formulário. */
  values(form: AssistForm): Record<string, FieldValue>;
  /** Só as chaves a mesclar no formulário para pôr `value` no campo. */
  patch(form: AssistForm, field: string, value: FieldValue): AssistForm;
}

export interface SourceRef {
  label: string;
  kind: "item" | "material" | "oficial";
}
export type FindingKind = "erro" | "contradicao" | "pouco_claro" | "desatualizado";

export interface AssistSuggestion {
  id: string;
  field: string;
  value: FieldValue;
  before: FieldValue | null;
  sources: SourceRef[];
  warnings: string[];
  append: boolean;
  reason: string | null;
}

export interface AssistFinding {
  id: string;
  field: string | null;
  kind: FindingKind;
  detail: string;
  sources: SourceRef[];
  suspeita: boolean;
  owner: string | null;
}

export interface AssistMissing {
  field: string;
  reason: string;
}

export interface AssistUsage {
  provider: string;
  model: string;
  label: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}

export interface AssistResult {
  mode: AssistMode;
  suggestions: AssistSuggestion[];
  findings: AssistFinding[];
  missing: AssistMissing[];
  reply: string | null;
  no_source: string[];
  warnings: string[];
  usage: AssistUsage | null;
  /**
   * Quantos trechos foram à IA: do material enviado e da biblioteca de fontes oficiais. O painel usa para dizer por que
   * faltou fonte (Q14): a biblioteca não tem o tema, ou havia trecho e nenhum sustentou os campos. Opcional: servidor antigo.
   */
  source_passages?: { material: number; official: number };
}

/** IA de um modo: pronta (com rótulo e modelo) ou o motivo de não estar. */
export interface AiLine {
  ready: boolean;
  label: string | null;
  model: string | null;
  pending: string | null;
}
export interface AssistStatus {
  tab: AssistTab;
  modes: Record<AssistMode, AiLine>;
}

/** Textos exatos da especificação, usados pelo servidor e pela tela. */
export const ASSIST_TEXTS = {
  noSource: "Sem fonte: cole um trecho da diretriz ou envie o material",
  /** Preencher devolveu "Sem fonte" em todos os campos pedidos: a biblioteca de fontes oficiais não tem trecho do tema (Q14). */
  noSourceAllTitle: "Faltou fonte para este tema",
  noSourceAll: "A biblioteca de fontes oficiais ainda não tem trecho sobre este tema. Cole o trecho da diretriz ou envie o PDF ou o link.",
  noSourceAllNotes: "A biblioteca de fontes oficiais ainda não tem trecho sobre este tema. Escreva o trecho da diretriz em Suas notas.",
  /** O mesmo, quando havia material enviado: a biblioteca não é o motivo (leva 2). */
  noSourceAllMaterial: "Nenhum campo pedido ficou apoiado no material enviado. Confira se ele fala deste tema ou envie outro trecho da diretriz.",
  noSourceAllMaterialNotes: "Nenhum campo pedido ficou apoiado em Suas notas. Escreva nelas o trecho da diretriz sobre este tema.",
  /** O mesmo, quando a biblioteca achou trechos, mas nenhum sustentou os campos (leva 2). */
  noSourceAllOfficial: "A biblioteca de fontes oficiais achou trechos, mas nenhum sustenta os campos pedidos. Cole o trecho da diretriz ou envie o PDF ou o link.",
  noSourceAllOfficialNotes: "A biblioteca de fontes oficiais achou trechos, mas nenhum sustenta os campos pedidos. Escreva o trecho da diretriz em Suas notas.",
  discarded: "Sugestão para campo que o assistente não muda foi descartada",
  suspeita: "Suspeita sem fonte: confira antes de mudar",
  stale: "O campo mudou depois da proposta: peça de novo",
  diverge: "A fonte diverge do gabarito oficial: veja o Conferir",
  newFeature: "Recurso novo: confirme que o plano tem",
  annulled: "Questão anulada: sem explicação de gabarito.",
  questoesNotice: "Enunciado e alternativas aparecem na hora para o aluno. Explicações, conduta e “o que avalia” esperam a aprovação do revisor médico.",
  figure: "a questão cita uma figura que o assistente não vê",
  aiReason: "assistente de IA",
  mockLabel: "Simulação (sem IA)",
  gabaritoOwner: "O gabarito só muda pelo registro do gabarito oficial (administrador).",
  aiDefined: "IA definida na Central de IAs: {IA} {modelo}",
  centralName: "Assistente: conversar e revisar",
  /** Questão sem gabarito gravado (nova ou vazio no banco): as explicações não vão para a IA (decisão C2). */
  noAnswer: "Grave o gabarito antes de pedir as explicações.",
  /** Explicação sugerida que começa dizendo o contrário do gabarito gravado (decisão D6): vai para "A fonte não esclarece". */
  contradicts: "A explicação contradiz o gabarito gravado.",
} as const;

/** Linha "IA definida na Central de IAs: {IA} {modelo}" preenchida (sem modelo, só a IA). */
export function aiDefinedText(label: string, model: string | null): string {
  return ASSIST_TEXTS.aiDefined.replace("{IA}", label).replace("{modelo}", model ?? "").trimEnd();
}

/** Forma canônica de JSON: nulo e ausente viram null, chaves em ordem, chave com valor ausente some. */
function canonical(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(canonical);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as object).sort()) {
      const item = (v as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonical(item);
    }
    return out;
  }
  return v;
}

/** Igualdade exata de JSON (ordem das chaves não conta; `null` e `undefined` são iguais entre si). */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function entryText(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const e = entry as Record<string, unknown>;
    if ("year" in e) return `${e.year}: ${e.text ?? ""}`;
    if ("front" in e) return `${e.front} → ${e.back ?? ""}`;
  }
  return String(entry ?? "");
}

/** Valor em texto: o próprio texto; lista uma entrada por linha ("2024: texto", "frente → verso"). */
export function valueText(v: FieldValue | null | undefined): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return (v as unknown[]).map(entryText).join("\n");
  return String(v);
}

/** Texto só com espaços, lista vazia ou valor ausente. */
export function isEmptyValue(v: FieldValue | null | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === "";
}
