/**
 * Assistente das abas — adaptador de Questões (especificação §5.1 e §6.2).
 * Permissão: equipe (editor ou administrador), como a aba. O gabarito e a situação do contexto vêm da questão gravada
 * (`app_admin_question`, com o token da pessoa): as explicações seguem o gabarito oficial gravado, não o do formulário.
 * Sem gabarito gravado (questão nova ou vazio no banco), as explicações nem vão para a IA (decisão C2).
 */
import { QUESTOES_SPEC } from "../../../src/shared/adminAssistant/questoes";
import { QUESTION_STATUS_LABEL } from "../../../src/shared/questions/status";
import { ASSIST_TEXTS, type AssistForm } from "../../../src/shared/adminAssistant/types";
import { httpError, type ItemContext, type TabAdapter } from "../types";

const LETTERS = ["A", "B", "C", "D"];
const EXPLANATIONS = LETTERS.map((l) => `explanation_${l}`);
/** Campos do item no pedido, nesta ordem (os vazios ficam de fora). */
const ITEM_FIELDS = ["topic", "subtopic", "area", "statement", ...LETTERS.map((l) => `option_${l}`), ...EXPLANATIONS, "expected_conduct", "inep_intent"];
const LABELS = new Map(QUESTOES_SPEC.fields.map((f) => [f.name, f.label]));

const clean = (v: unknown) => String(v ?? "").trim();
const NOT_FOUND = "Questão não encontrada.";
/** `app_admin_question` levanta "Questão não encontrada." (P0002); no Supabase só a mensagem chega. */
const isNotFound = (error: unknown) => (error as { code?: string })?.code === "P0002" || String((error as Error)?.message ?? "").includes(NOT_FOUND);

function context(form: AssistForm, stored: AssistForm | null): ItemContext {
  const values = QUESTOES_SPEC.values(form);
  const item = ITEM_FIELDS.filter((name) => clean(values[name])).map((name) => ({ field: name, label: LABELS.get(name)!, text: String(values[name]) }));
  const storedAnswer = clean(stored?.correct_option);
  const formAnswer = clean(form.correct_option);
  const answer = (stored ? storedAnswer : formAnswer) || "sem gabarito";
  const status = clean(stored ? stored.status : form.status) || "valid";
  const annulled = stored?.status === "annulled" || form.status === "annulled";
  // sem gabarito gravado (questão nova ou vazio no banco) as explicações não vão para a IA: ela nunca escolhe a correta (decisão C2)
  const skipReason = annulled ? ASSIST_TEXTS.annulled : !storedAnswer ? ASSIST_TEXTS.noAnswer : null;
  const readOnly = [`Gabarito oficial gravado: ${answer}`, `Situação: ${QUESTION_STATUS_LABEL[status] ?? status}`];
  if (form.needs_image || stored?.needs_image) readOnly.push(ASSIST_TEXTS.figure);
  const warnings =
    stored && formAnswer && formAnswer !== storedAnswer
      ? [`O gabarito do formulário (${formAnswer}) é diferente do gravado (${storedAnswer || "sem gabarito"}): as explicações seguem o gravado.`]
      : [];
  return {
    item,
    readOnly,
    query: [clean(form.topic), clean(form.subtopic), clean(form.statement).slice(0, 300)].filter(Boolean).join(" "),
    skip: skipReason ? EXPLANATIONS.map((field) => ({ field, reason: skipReason })) : [],
    warnings,
  };
}

export const questoesAdapter: TabAdapter = {
  ...QUESTOES_SPEC,
  rules: [
    'As explicações (explanation_A a explanation_D) seguem o gabarito oficial gravado (linha "Somente leitura: Gabarito oficial gravado"), nunca outro, nem a pedido.',
    "Nunca escolha a alternativa correta: ela é só a do gabarito oficial gravado. Sem gabarito gravado, não escreva explicação das alternativas nem diga qual está certa.",
    "A explicação da alternativa correta diz por que ela é a certa; a de cada uma das outras, por que não é.",
    `Se a fonte diverge do gabarito oficial gravado, não escreva a explicação; o motivo é "${ASSIST_TEXTS.diverge}".`,
    "Enunciado, alternativas e grande área são o texto da prova oficial: só aponte problemas neles, nunca proponha texto.",
    "Tema e subtema são rótulos curtos tirados do próprio item (tema até 200 e subtema até 300 caracteres).",
    "Gabarito, situação, prova, ano, edição, número e a marca de figura nunca mudam pelo assistente.",
  ],
  allowTab: (me) => me.staff,
  async allow(me, form, ctx) {
    if (!me.staff) throw httpError(403, "Acesso restrito à equipe.");
    const id = clean(form.id);
    if (!id) return { stored: null };
    let stored: AssistForm | null;
    try {
      stored = await ctx.asUser<AssistForm | null>("app_admin_question", { p_id: id });
    } catch (error) {
      if (isNotFound(error)) throw httpError(404, NOT_FOUND);
      throw error;
    }
    if (!stored) throw httpError(404, NOT_FOUND);
    return { stored };
  },
  context,
  itemId: (form) => `questoes:${form.id || "novo"}`,
};
