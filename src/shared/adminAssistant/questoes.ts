/**
 * Assistente das abas — campos de Questões (especificação §5.1).
 * Explicações, conduta esperada e "o que a questão avalia" exigem fonte; tema e subtema podem sair do item;
 * enunciado, alternativas e grande área só se conferem; gabarito, situação, prova, ano, edição, número e
 * "cita figura" nunca viram sugestão.
 */
import { ASSIST_TEXTS, type AdapterField, type AssistForm, type FieldValue, type TabSpec } from "./types";

const LETTERS = ["A", "B", "C", "D"] as const;
const OFFICIAL_TEXT = "Enunciado e alternativas são o texto da prova oficial: o assistente só aponta.";
const EXAM_OWNER = "Prova, ano, edição e número não mudam depois de criada a questão.";

const text = (name: string, label: string, ai: AdapterField["ai"], base: AdapterField["base"], max: number, owner?: string): AdapterField =>
  owner ? { name, label, kind: "text", ai, base, max, owner } : { name, label, kind: "text", ai, base, max };

const FIELDS: AdapterField[] = [
  ...LETTERS.map((l) => text(`explanation_${l}`, `Explicação da ${l}`, "editar", "fonte", 4000)),
  text("expected_conduct", "Conduta esperada", "editar", "fonte", 4000),
  text("inep_intent", "O que a questão avalia", "editar", "fonte", 4000),
  text("topic", "Tema", "editar", "item", 200),
  text("subtopic", "Subtema", "editar", "item", 300),
  text("statement", "Enunciado", "conferir", "item", 20000, OFFICIAL_TEXT),
  ...LETTERS.map((l) => text(`option_${l}`, `Alternativa ${l}`, "conferir", "item", 4000, OFFICIAL_TEXT)),
  text("area", "Grande área", "conferir", "item", 60, "A grande área fica com a equipe, no formulário."),
  text("correct_option", "Gabarito", "nunca", "item", 1, ASSIST_TEXTS.gabaritoOwner),
  text("status", "Situação", "nunca", "item", 40, "A situação só muda pelo registro do gabarito oficial (administrador)."),
  text("kind", "Prova", "nunca", "item", 20, EXAM_OWNER),
  text("year", "Ano", "nunca", "item", 20, EXAM_OWNER),
  text("semester", "Edição", "nunca", "item", 20, EXAM_OWNER),
  text("number", "Número", "nunca", "item", 20, EXAM_OWNER),
  text("needs_image", "Cita figura", "nunca", "item", 3, 'A marca "cita figura" fica com a equipe, no formulário.'),
];

/** Campo que mora dentro de `options`: explicação ou texto da alternativa de uma letra. */
const OPTION_FIELD = /^(explanation|option)_([A-D])$/;

interface OptionRow {
  id: string;
  text?: string;
  explanation?: string;
  [key: string]: unknown;
}

const optionsOf = (form: AssistForm): OptionRow[] => (Array.isArray(form.options) ? form.options : []);

function values(form: AssistForm): Record<string, FieldValue> {
  const options = optionsOf(form);
  const out: Record<string, FieldValue> = {};
  for (const f of FIELDS) {
    const opt = OPTION_FIELD.exec(f.name);
    if (opt) {
      const row = options.find((o) => o?.id === opt[2]);
      out[f.name] = String((opt[1] === "explanation" ? row?.explanation : row?.text) ?? "");
    } else if (f.name === "needs_image") {
      out[f.name] = form.needs_image ? "sim" : "não";
    } else {
      out[f.name] = String(form[f.name] ?? "");
    }
  }
  return out;
}

function patch(form: AssistForm, field: string, value: FieldValue): AssistForm {
  const opt = OPTION_FIELD.exec(field);
  if (!opt) return { [field]: value };
  const key = opt[1] === "explanation" ? "explanation" : "text";
  return { options: optionsOf(form).map((o) => (o?.id === opt[2] ? { ...o, [key]: value } : o)) };
}

export const QUESTOES_SPEC: TabSpec = {
  tab: "questoes",
  medical: true,
  material: "material",
  fields: FIELDS,
  values,
  patch,
};
