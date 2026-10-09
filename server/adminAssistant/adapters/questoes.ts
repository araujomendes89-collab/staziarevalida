/**
 * Assistente das abas — adaptador de Questões (especificação §5.1 e §6.2).
 * Permissão: equipe (editor ou administrador), como a aba. O gabarito e a situação do contexto vêm da questão gravada
 * (`app_admin_question`, com o token da pessoa): as explicações seguem o gabarito oficial gravado, não o do formulário.
 * Sem gabarito gravado (questão nova ou vazio no banco), as explicações, a conduta esperada e "o que a questão avalia" nem vão
 * para a IA (decisões C2 e D3c). Explicação sugerida que começa dizendo o contrário do gabarito gravado é recusada (decisão D6).
 */
import { QUESTOES_SPEC } from "../../../src/shared/adminAssistant/questoes";
import { QUESTION_STATUS_LABEL } from "../../../src/shared/questions/status";
import { ASSIST_TEXTS, type AssistForm, type FieldValue } from "../../../src/shared/adminAssistant/types";
import { httpError, type ItemContext, type TabAdapter } from "../types";

const LETTERS = ["A", "B", "C", "D"];
const EXPLANATIONS = LETTERS.map((l) => `explanation_${l}`);
/** Comentário que também depende do gabarito gravado (decisão D3c). */
const ANSWER_BOUND = ["expected_conduct", "inep_intent"];
/** Campos do item no pedido, nesta ordem (os vazios ficam de fora). */
const ITEM_FIELDS = ["topic", "subtopic", "area", "statement", ...LETTERS.map((l) => `option_${l}`), ...EXPLANATIONS, "expected_conduct", "inep_intent"];
const LABELS = new Map(QUESTOES_SPEC.fields.map((f) => [f.name, f.label]));

const clean = (v: unknown) => String(v ?? "").trim();

// ------------------------------------------------------------------ veredito da explicação (decisão D6)

/**
 * Texto para ler o veredito: sem caracteres invisíveis, minúsculo e sem acento. O "é" sozinho (verbo) vira "eh" antes de tirar
 * os acentos, para não se confundir com o "e" (conjunção): "A correta é a B" não é veredito; "Correta e completa" é.
 */
const plain = (text: string) =>
  String(text ?? "")
    .replace(/[\p{Cf}\u00AD]/gu, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/(^|[^\p{L}])é(?![\p{L}])/gu, "$1eh")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

/** "Alternativa B", "A alternativa", "Esta alternativa", "Letra D", "Opção (C)": a letra, quando há. */
const NAMED = /^(?:(?:a|esta|essa)\s+)?(?:alternativa|letra|opcao)(?:\s*\(?([a-d])\)?(?![\p{L}\p{N}]))?/u;
/** Só a letra, com sinal depois: "B)", "(C)", "D:", "A.", "C -". */
const LETTER = /^\(?([a-d])\s*[).:\-–—]/u;
/**
 * O veredito logo depois (pontuação, "não", "é"/"está" — também "esta é" —, "a" e "alternativa" opcionais): "Correta.",
 * ": incorreta", "é a correta", "está errada", "não é a correta", "Esta é a alternativa incorreta". A palavra inteira:
 * "Corretamente" não conta.
 */
const VERDICT =
  /^((?:\s|[:;,.)\-–—])*)(nao\s+)?((?:(?:esta|essa)\s+)?(?:eh|e|esta)\s+)?(a\s+)?(?:alternativa\s+)?(correta|certa|verdadeira|incorreta|errada|falsa)(?![\p{L}\p{N}])/u;
const NEGATIVE = new Set(["incorreta", "errada", "falsa"]);
/** "A correta é a B", "A alternativa correta seria a C": a palavra nomeia a correta, não julga esta alternativa. */
const NAMES_THE_ANSWER = /^\s+(?:eh|seria|era|sera)(?![\p{L}\p{N}])/u;

/**
 * Veredito no começo da explicação (decisão D6), sem diferença de maiúsculas e acentos, também depois de "Alternativa X" / "A
 * alternativa" / "Letra X" / "X)": `correct` diz se o texto chama a alternativa de correta (correta, certa, verdadeira; "não é
 * a correta" conta como incorreta) e `letter` é a letra citada antes do veredito (null sem letra). Sem veredito no começo: null.
 */
export function explanationVerdict(text: string): { letter: string | null; correct: boolean } | null {
  let s = plain(text).replace(/^[^\p{L}(]+/u, "");
  let letter: string | null = null;
  const lettered = LETTER.exec(s);
  if (lettered) {
    letter = lettered[1];
    s = s.slice(lettered[0].length);
  } else {
    s = s.replace(/^\(+/u, "");
    const named = NAMED.exec(s);
    if (named) {
      letter = named[1] ?? null;
      s = s.slice(named[0].length);
    }
  }
  const m = VERDICT.exec(s);
  if (!m) return null;
  const [all, gap, negated, verb, , word] = m;
  if (!letter && !negated && !verb && !gap.trim() && NAMES_THE_ANSWER.test(s.slice(all.length))) return null;
  const negative = NEGATIVE.has(word);
  // "não é incorreta" fica sem veredito
  if (negated && negative) return null;
  return { letter: letter ? letter.toUpperCase() : null, correct: !negative && !negated };
}

/** A explicação da alternativa `letter` contradiz o gabarito gravado `answer` (a correta dita errada, ou outra dita correta). */
function contradictsAnswer(letter: string, answer: string, text: string): boolean {
  const verdict = explanationVerdict(text);
  if (!verdict) return false;
  return verdict.correct !== ((verdict.letter ?? letter) === answer);
}

const NOT_FOUND = "Questão não encontrada.";
/** `app_admin_question` levanta "Questão não encontrada." (P0002); no Supabase só a mensagem chega. */
const isNotFound = (error: unknown) => (error as { code?: string })?.code === "P0002" || String((error as Error)?.message ?? "").includes(NOT_FOUND);

function context(form: AssistForm, stored: AssistForm | null): ItemContext {
  const values = QUESTOES_SPEC.values(form);
  const item = ITEM_FIELDS.filter((name) => clean(values[name])).map((name) => ({ field: name, label: LABELS.get(name)!, text: String(values[name]) }));
  const storedAnswer = clean(stored?.correct_option).toUpperCase();
  const formAnswer = clean(form.correct_option);
  const answer = (stored ? storedAnswer : formAnswer) || "sem gabarito";
  const status = clean(stored ? stored.status : form.status) || "valid";
  const annulled = stored?.status === "annulled" || form.status === "annulled";
  // sem gabarito gravado (questão nova ou vazio no banco) as explicações, a conduta esperada e "o que a questão avalia" não vão
  // para a IA: ela nunca escolhe a correta (decisões C2 e D3c). Questão anulada: sem explicação de gabarito.
  const skipReason = annulled ? ASSIST_TEXTS.annulled : !storedAnswer ? ASSIST_TEXTS.noAnswer : null;
  const skip = [
    ...(skipReason ? EXPLANATIONS.map((field) => ({ field, reason: skipReason })) : []),
    ...(!storedAnswer ? ANSWER_BOUND.map((field) => ({ field, reason: ASSIST_TEXTS.noAnswer })) : []),
  ];
  const readOnly = [`Gabarito oficial gravado: ${answer}`, `Situação: ${QUESTION_STATUS_LABEL[status] ?? status}`];
  if (form.needs_image || stored?.needs_image) readOnly.push(ASSIST_TEXTS.figure);
  const warnings =
    stored && formAnswer && formAnswer !== storedAnswer
      ? [`O gabarito do formulário (${formAnswer}) é diferente do gravado (${storedAnswer || "sem gabarito"}): as explicações seguem o gravado.`]
      : [];
  // explicação que começa dizendo o contrário do gabarito gravado: recusada, com ou sem fonte (decisão D6)
  const refuse = (field: string, value: FieldValue): string | null => {
    const letter = /^explanation_([A-D])$/.exec(field)?.[1];
    if (!letter || !storedAnswer || typeof value !== "string") return null;
    return contradictsAnswer(letter, storedAnswer, value) ? ASSIST_TEXTS.contradicts : null;
  };
  return {
    item,
    readOnly,
    query: [clean(form.topic), clean(form.subtopic), clean(form.statement).slice(0, 300)].filter(Boolean).join(" "),
    skip,
    warnings,
    refuse,
  };
}

export const questoesAdapter: TabAdapter = {
  ...QUESTOES_SPEC,
  rules: [
    'As explicações (explanation_A a explanation_D) seguem o gabarito oficial gravado (linha "Somente leitura: Gabarito oficial gravado"), nunca outro, nem a pedido.',
    "Nunca escolha a alternativa correta: ela é só a do gabarito oficial gravado. Sem gabarito gravado, não escreva explicação das alternativas, conduta esperada nem o que a questão avalia, nem diga qual está certa.",
    "A explicação da alternativa correta diz por que ela é a certa; a de cada uma das outras, por que não é. Explicação que diz o contrário do gabarito oficial gravado é recusada.",
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
