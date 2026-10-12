/**
 * Assistente das abas — adaptador de Atualizações (especificação §5.2 e §6.2).
 * Permissão: equipe, ou revisor de alguma área. O revisor só vale na área GRAVADA da Atualização (a lista de
 * `app_admin_guideline_updates`, com o token dele, diz `can_review`), nunca na área que veio no formulário; item novo vale
 * se a área do formulário está entre as dele.
 */
import { ATUALIZACOES_SPEC } from "../../../src/shared/adminAssistant/atualizacoes";
import { valueText, isEmptyValue, type AssistForm } from "../../../src/shared/adminAssistant/types";
import { httpError, type ItemContext, type TabAdapter } from "../types";

const OTHER_AREA = "Você revisa outra área: o assistente vale só para as Atualizações da sua área.";
const NOT_FOUND = "Atualização não encontrada.";
const clean = (v: unknown) => String(v ?? "").trim();
const LABELS = new Map(ATUALIZACOES_SPEC.fields.map((f) => [f.name, f.label]));

/** Campos do item no pedido, nesta ordem (os vazios ficam de fora). */
const HEAD: [string, string][] = [
  ["topic", "Tema"],
  ["subtopic", "Subtema"],
  ["area", "Grande área"],
  ["institution", "Instituição"],
  ["document_title", "Documento oficial"],
  ["publication_label", "Data de publicação"],
  ["source_url", "Endereço do documento oficial"],
];
const EDITABLE = ATUALIZACOES_SPEC.fields.filter((f) => f.ai === "editar").map((f) => f.name);

function context(form: AssistForm): ItemContext {
  const values = ATUALIZACOES_SPEC.values(form);
  const item = [
    ...HEAD.map(([field, label]) => ({ field, label, text: clean(form[field]) })),
    ...EDITABLE.map((field) => ({ field, label: LABELS.get(field)!, text: isEmptyValue(values[field]) ? "" : valueText(values[field]) })),
  ].filter((i) => i.text);
  return {
    item,
    readOnly: [],
    query: [form.topic, form.subtopic, form.document_title].map(clean).filter(Boolean).join(" "),
    skip: [],
    warnings: [],
  };
}

export const atualizacoesAdapter: TabAdapter = {
  ...ATUALIZACOES_SPEC,
  rules: [
    "A linha do tempo só tem o ano que aparece no trecho citado; cada item traz o ano e o que mudou.",
    "Cada flashcard tem a pergunta na frente e uma resposta curta no verso, tiradas do trecho citado.",
    "Não mude área, tema, fonte (instituição, documento, endereço), datas nem publicação.",
  ],
  allowTab: (me) => me.staff || me.reviewer_areas.length > 0,
  async allow(me, form, ctx) {
    if (me.staff) return { stored: null };
    if (!me.reviewer_areas.length) throw httpError(403, "Acesso restrito à equipe de conteúdo.");
    const data = await ctx.asUser<{ items?: AssistForm[]; review_areas?: string[] }>("app_admin_guideline_updates");
    const id = clean(form.id);
    if (id) {
      const stored = (Array.isArray(data?.items) ? data.items : []).find((i) => i?.id === id);
      if (!stored) throw httpError(404, NOT_FOUND);
      if (!stored.can_review) throw httpError(403, OTHER_AREA);
      return { stored };
    }
    if (!(data?.review_areas ?? []).includes(clean(form.area))) throw httpError(403, OTHER_AREA);
    return { stored: null };
  },
  context,
  itemId: (form) => `atualizacoes:${form.id || "novo"}`,
};
