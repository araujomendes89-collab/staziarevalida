/**
 * VALIDAÇÃO DE SEGURANÇA do Stazia Tutor (regras de software, sem IA). Roda DEPOIS de a resposta ser gerada e ANTES de o aluno
 * ver ou ouvir. É o que garante que a personalidade não mexe no núcleo científico:
 *
 *   - número com unidade que não está na base            → barrado
 *   - documento, link ou "conduta atual" sem fonte        → barrado
 *   - citação que não é cópia exata do bloco da base      → barrado
 *   - contestar o gabarito oficial                         → barrado
 *   - entregar a resposta antes da hora (questão aberta)   → barrado
 *   - palavrão acima do nível permitido ou ataque pessoal → barrado
 *
 * Barrado duas vezes seguidas, o aluno recebe uma resposta fixa e honesta, nunca o texto inválido.
 */
import { numbers } from "../contentHub/checks";
import { CHALLENGE } from "../contentHub/questionAnalysis";
import type { ProfanityLevel } from "./personality";
import type { TutorOutput } from "./prompts";

export interface Violation {
  code: string;
  detail: string;
}

export interface BaseBlock {
  ref: string;          // Q, A, U, F1, F2…
  kind: "question" | "analysis" | "update" | "source";
  label: string;        // como aparece para o aluno
  text: string;
}

export interface SafetyContext {
  blocks: BaseBlock[];
  /** Textos de onde um número pode vir sem citação: a fala do aluno e a conversa até aqui. */
  conversationTexts: string[];
  question?: { open: boolean; officialLetter: string | null; officialText: string | null } | null;
  hintLevel: number | null;
  hasUpdateCard: boolean;
  profanity: ProfanityLevel;
}

const fold = (t: string) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Documento específico, identificador ou link: só com fonte na base. */
const SPECIFIC_REF =
  /(portaria\s*(?:n[ºo°.]|gm|\d)|resolu[çc][ãa]o\s*(?:n[ºo°.]|cfm|rdc|\d)|nota\s+t[ée]cnica\s*(?:n[ºo°.]|\d)|doi\s*:|10\.\d{4,}\/|https?:\/\/|www\.|(?:diretriz|protocolo|pcdt|guideline|consenso|manual|caderno|parecer)[^.\n]{0,60}\b(?:19|20)\d\d\b)/i;

/** Afirmação de vigência ou de mudança de conduta: só com fonte na base. */
const CURRENCY_CLAIM =
  /((?:diretriz|protocolo|recomenda[çc][ãa]o|conduta|guideline|consenso)\s+(?:atual|vigente|mais\s+recente)|nova\s+diretriz|(?:foi|foram)\s+atualizad[oa]s?|mudou\s+em\s+(?:19|20)\d\d|desde\s+(?:19|20)\d\d|a\s+partir\s+de\s+(?:19|20)\d\d|atualmente\s+(?:se\s+)?recomenda)/i;

const PROFANITY_MILD = ["droga", "caramba", "poxa", "putz", "que saco", "diabo", "raios"];
const PROFANITY_MODERATE = ["porra", "merda", "caralho", "cacete", "foda", "fodeu", "foder", "puta que pariu", "pqp", "bosta", "cagada", "cagou"];
/** Nunca, em nenhuma personalidade: insulto à inteligência e termos discriminatórios (palavras sem uso clínico). */
const FORBIDDEN = ["burro", "burra", "idiota", "imbecil", "estupido", "estupida", "debil mental", "mongoloide", "otario", "otaria", "babaca", "viado", "bicha", "sapatao", "traveco", "aleijado", "crioulo"];
/** Palavras que têm uso clínico legítimo ("esvaziamento retardado", "válvula incompetente"): só são ataque quando dirigidas ao aluno. */
const DIRECTED =
  /(?:voce|vc|tu)\s+(?:e|es|esta|parece|foi|continua)\s+(?:um\s+|uma\s+|muito\s+|bem\s+|tao\s+)?(?:retardad[oa]|incompetente|inutil|lixo|vagabund[oa]|louc[oa]|maluc[oa]|gord[oa]|fei[oa]|doente\s+mental|fracassad[oa])|(?<![a-z])seu\s+(?:lixo|inutil|incompetente|vagabundo|retardado|fracassado)(?![a-z])|(?<![a-z])sua\s+(?:inutil|incompetente|vagabunda|retardada|fracassada)(?![a-z])/;

const hasWord = (text: string, word: string) => new RegExp(`(?<![a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`).test(text);

export interface SafetyResult {
  violations: Violation[];
  /** Base efetivamente usada (pelas citações válidas), que é o que o aluno vê embaixo da resposta. */
  grounding: "source" | "analysis" | "question" | "general" | "insufficient";
  sources: { ref: string; label: string }[];
}

const INSUFFICIENT = fold("Não encontrei confirmação suficiente na base disponível");

export function safetyCheck(out: TutorOutput, ctx: SafetyContext): SafetyResult {
  const v: Violation[] = [];
  const add = (code: string, detail: string) => v.push({ code, detail });
  const reply = out.reply;
  const folded = fold(reply);
  const byRef = new Map(ctx.blocks.map((b) => [b.ref, b]));

  // 1. citações: bloco existente e cópia exata
  const valid: BaseBlock[] = [];
  for (const c of out.citations) {
    const block = byRef.get(c.ref);
    if (!block) add("citation_unknown_ref", `A citação aponta o bloco "${c.ref}", que não está na base.`);
    else if (!fold(block.text).includes(fold(c.quote))) add("citation_not_exact", `A citação do bloco ${c.ref} não é cópia exata do texto da base.`);
    else if (!valid.includes(block)) valid.push(block);
  }
  const officialCited = valid.some((b) => b.kind === "source" || b.kind === "analysis" || b.kind === "update");

  // 2. números com unidade: precisam existir na base ou na conversa
  const allowed = new Set([...ctx.blocks.map((b) => b.text), ...ctx.conversationTexts].flatMap(numbers));
  const stray = numbers(reply).filter((n) => !allowed.has(n));
  if (stray.length) add("ungrounded_number", `Valor(es) que não estão na base nem na conversa: ${stray.join(", ")}.`);

  // 3. documento, link, vigência
  const ref = reply.match(SPECIFIC_REF);
  if (ref && !officialCited) add("invented_reference", `Cita documento ou endereço sem fonte na base: "${ref[0].trim().slice(0, 80)}".`);
  const url = reply.match(/https?:\/\/\S+|www\.\S+/i);
  if (url && !ctx.blocks.some((b) => b.text.includes(url[0].replace(/[).,;]+$/, "")))) add("invented_reference", `Endereço que não está na base: ${url[0].slice(0, 80)}.`);
  const cur = reply.match(CURRENCY_CLAIM);
  if (cur && !officialCited && !ctx.hasUpdateCard) add("currency_claim", `Afirma vigência ou mudança de conduta sem fonte na base: "${cur[0].trim()}".`);

  // 4. gabarito oficial é histórico
  if (CHALLENGE.test(reply)) add("challenges_official_answer", "Contesta o gabarito oficial da prova.");

  // 5. resposta antes da hora
  const q = ctx.question;
  if (q?.open && (ctx.hintLevel ?? 0) < 5) {
    if (out.reveals_answer) add("answer_leak", "Marcou que revela a resposta com a questão ainda aberta.");
    if (q.officialLetter) {
      const L = q.officialLetter.toUpperCase();
      const K = "(?:[Aa]lternativa|[Ll]etra|[Oo]p[cç][aã]o|[Rr]esposta|[Gg]abarito|[Ii]tem)";
      // a letra só conta em MAIÚSCULA: "a alternativa a seguir" não é a alternativa A
      const leak = new RegExp(
        `${K}\\s+(?:(?:correta|certa)\\s+)?(?:(?:e|é|seria)\\s+)?(?:(?:a|o)\\s+)?(?:(?:letra|alternativa)\\s+)?["“'(]?${L}["”')]?(?![A-Za-zÀ-ú])` +
          `|(?<![A-Za-zÀ-ú])${L}\\)?\\s+(?:é|está)\\s+(?:a\\s+)?(?:alternativa\\s+)?(?:correta|certa)` +
          `|[Mm]arque\\s+(?:a\\s+)?(?:letra\\s+|alternativa\\s+)?${L}(?![A-Za-zÀ-ú])`
      );
      if (leak.test(reply.normalize("NFC"))) add("answer_leak", "Indica a letra da alternativa correta com a questão ainda aberta.");
    }
    if (q.officialText && fold(q.officialText).length >= 15 && folded.includes(fold(q.officialText))) add("answer_leak", "Repete o texto da alternativa correta com a questão ainda aberta.");
  }

  // 6. linguagem
  for (const w of FORBIDDEN) if (hasWord(folded, w)) add("personal_attack", `Termo proibido em qualquer personalidade: "${w}".`);
  const directed = folded.match(DIRECTED);
  if (directed) add("personal_attack", `Ataque dirigido ao aluno: "${directed[0]}".`);
  if (ctx.profanity !== "moderate") for (const w of PROFANITY_MODERATE) if (hasWord(folded, w)) add("profanity", `Palavrão acima do nível liberado: "${w}".`);
  if (ctx.profanity === "off") for (const w of PROFANITY_MILD) if (hasWord(folded, w)) add("profanity", `Palavrão com palavrões desligados: "${w}".`);

  const grounding: SafetyResult["grounding"] = valid.some((b) => b.kind === "source")
    ? "source"
    : valid.some((b) => b.kind === "analysis" || b.kind === "update")
      ? "analysis"
      : valid.some((b) => b.kind === "question") || (out.grounding === "QUESTION" && byRef.has("Q"))
        ? "question"
        : folded.includes(INSUFFICIENT) || out.grounding === "INSUFFICIENT"
          ? "insufficient"
          : "general";
  return { violations: v, grounding, sources: valid.filter((b) => b.kind !== "question").map((b) => ({ ref: b.ref, label: b.label })) };
}

/** Resposta fixa quando a IA insiste em algo que a validação barra. Honesta e sem personalidade. */
export function fallbackReply(violations: Violation[]): string {
  if (violations.some((x) => x.code === "answer_leak")) {
    return "Ainda não vou entregar a resposta. Me conte o que você está pensando sobre a questão, ou peça a próxima dica.";
  }
  if (violations.length > 0 && violations.every((x) => x.code === "invalid_format")) {
    return "Não consegui montar a resposta agora. Tente perguntar de outro jeito.";
  }
  if (violations.some((x) => x.code === "personal_attack" || x.code === "profanity")) {
    return "Vamos direto ao ponto: me diga o que você entendeu até aqui e seguimos pelo raciocínio.";
  }
  return "Não encontrei confirmação suficiente na base disponível para afirmar valores, doses ou diretrizes sobre isso. Posso seguir com você pelo raciocínio clínico: o que você já sabe sobre o caso?";
}

/** Texto para falar em voz alta: sem marcação, sem símbolos soltos, em frases. */
export function spokenText(text: string): string {
  return text
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•·]\s+/gm, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}
