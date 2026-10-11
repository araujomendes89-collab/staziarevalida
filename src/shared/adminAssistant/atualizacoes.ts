/**
 * Assistente das abas — campos de Atualizações (especificação §5.2).
 * O assistente só mexe nos textos que descrevem a mudança (antes, linha do tempo, conduta vigente, como pode aparecer na prova,
 * pegadinha, impacto clínico e flashcards), sempre com trecho citado. Área, tema, subtema, prioridade, fonte (instituição,
 * documento, data, endereço), termos do treino, posição, questão de treino, conferência médica e publicação nunca viram sugestão.
 */
import type { AdapterField, AssistForm, FieldValue, TabSpec, Flashcard, TimelineEntry } from "./types";

const SOURCE_OWNER = "A fonte é o que o revisor confere: fica com a pessoa.";
const FORM_OWNER = "Fica com a pessoa, no formulário.";

const edit = (name: string, label: string, max: number): AdapterField => ({ name, label, kind: "text", ai: "editar", base: "fonte", max });
const list = (name: string, label: string, kind: "timeline" | "flashcards", max: number): AdapterField => ({
  name,
  label,
  kind,
  ai: "editar",
  base: "fonte",
  max,
  itemMax: 2000,
});
const never = (name: string, label: string, owner: string): AdapterField => ({ name, label, kind: "text", ai: "nunca", base: "item", max: 400, owner });

const FIELDS: AdapterField[] = [
  edit("before_text", "Antes (conduta anterior)", 4000),
  list("timeline", "Linha do tempo", "timeline", 30),
  edit("current_conduct", "Conduta vigente", 4000),
  edit("exam_impact", "Como pode aparecer no Revalida", 4000),
  edit("trap", "Pegadinha da banca", 2000),
  edit("clinical_impact", "Impacto clínico", 4000),
  list("flashcards", "Flashcards", "flashcards", 40),
  never("area", "Grande área", FORM_OWNER),
  never("topic", "Tema", FORM_OWNER),
  never("subtopic", "Subtema", FORM_OWNER),
  never("priority", "Prioridade", FORM_OWNER),
  never("institution", "Instituição", SOURCE_OWNER),
  never("document_title", "Documento oficial", SOURCE_OWNER),
  never("publication_label", "Data de publicação", SOURCE_OWNER),
  never("source_url", "Endereço do documento oficial", SOURCE_OWNER),
  never("search_terms", "Termos para o treino", FORM_OWNER),
  never("position", "Posição", FORM_OWNER),
  never("practice_questions", "Questão de treino", FORM_OWNER),
  never("review_status", "Conferência médica", "A conferência médica é do revisor da área."),
  never("published", "Publicação", "Só o administrador publica."),
];

function values(form: AssistForm): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of FIELDS) {
    if (f.kind === "timeline") {
      out[f.name] = (Array.isArray(form[f.name]) ? form[f.name] : [])
        .filter((e: unknown) => e && typeof e === "object")
        .map((e: any): TimelineEntry => ({ year: Number(e.year), text: String(e.text ?? "") }));
    } else if (f.kind === "flashcards") {
      // itens existentes ficam como estão, com todas as chaves (decisão A4)
      out[f.name] = (Array.isArray(form[f.name]) ? form[f.name] : []).filter((e: unknown) => e && typeof e === "object") as Flashcard[];
    } else {
      const v = form[f.name];
      out[f.name] = typeof v === "boolean" ? (v ? "sim" : "não") : String(v ?? "");
    }
  }
  return out;
}

export const ATUALIZACOES_SPEC: TabSpec = {
  tab: "atualizacoes",
  medical: true,
  material: "material",
  fields: FIELDS,
  values,
  patch: (_form, field, value) => ({ [field]: value }),
};

