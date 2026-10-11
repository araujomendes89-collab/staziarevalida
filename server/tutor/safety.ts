import { labelIsSupportMaterial, mentionsSupportMaterial } from "../contentHub/complementarGuard";

/**
 * VALIDAÇÃO DE SEGURANÇA do Stazia Tutor (regras de software, sem IA). Roda DEPOIS de a resposta ser gerada e ANTES de o aluno
 * ver ou ouvir. É o que garante que a personalidade não mexe no núcleo científico:
 *
 *   - número com unidade que não está na base            → barrado
 *   - documento, link ou "conduta atual" sem fonte        → barrado
 *   - citação que não é cópia exata do bloco da base      → barrado
 *   - contestar o gabarito oficial                         → barrado
 *   - entregar a resposta antes da hora (questão aberta)   → barrado
 *   - palavrão acima do nível permitido, xingamento pesado contra o aluno ou ataque pessoal → barrado
 *
 * Barrado duas vezes seguidas, o aluno recebe uma resposta fixa e honesta, nunca o texto inválido.
 */
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
  /** Títulos e órgãos de fontes complementares da biblioteca: a resposta ao aluno não pode citá-los. */
  supportTerms?: readonly string[];
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

// ---------------------------------------------------------------------------- quantidades (algarismo ou por extenso)
// Por voz o modelo escreve "dois anos", "dez miligramas por quilo". Para a regra "número com unidade só da base" valer de
// verdade, a conferência lê as duas formas e as reduz ao mesmo par valor|unidade ("2|ano", "10|mg/kg").

const NUM_WORDS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900, meio: 0.5, meia: 0.5,
};
const NUM_WORD = `(?:${Object.keys(NUM_WORDS).join("|")}|mil)`;

/** Unidades, da mais longa para a mais curta, já em texto sem acento. Cada uma vira a forma canônica à direita. */
const UNITS: [string, string][] = [
  ["mg\\s*/\\s*kg\\s*/\\s*dia|miligramas? por quilo(?:grama)? (?:por|ao) dia", "mg/kg/dia"],
  ["mg\\s*/\\s*kg\\s*/\\s*dose|miligramas? por quilo(?:grama)? por dose", "mg/kg/dose"],
  ["mcg\\s*/\\s*kg\\s*/\\s*min|microgramas? por quilo(?:grama)? por minuto", "mcg/kg/min"],
  ["mg\\s*/\\s*kg|miligramas? por quilo(?:grama)?", "mg/kg"],
  ["mcg\\s*/\\s*kg|microgramas? por quilo(?:grama)?", "mcg/kg"],
  ["ml\\s*/\\s*kg|mililitros? por quilo(?:grama)?", "ml/kg"],
  ["ui\\s*/\\s*kg|unidades? por quilo(?:grama)?", "ui/kg"],
  ["mg\\s*/\\s*dl|miligramas? por decilitro", "mg/dl"],
  ["g\\s*/\\s*dl|gramas? por decilitro", "g/dl"],
  ["mmol\\s*/\\s*l|milimols? por litro", "mmol/l"],
  ["ml\\s*/\\s*h|mililitros? por hora", "ml/h"],
  ["mg\\s*/\\s*h|miligramas? por hora", "mg/h"],
  ["mmhg|milimetros? de mercurio", "mmhg"],
  ["bpm|batimentos? por minuto", "bpm"],
  ["irpm|incursoes por minuto|respiracoes por minuto", "irpm"],
  ["vezes (?:ao|por) dia|vez (?:ao|por) dia", "vez/dia"],
  ["mcg|microgramas?", "mcg"],
  ["mg|miligramas?", "mg"],
  ["ml|mililitros?", "ml"],
  ["ui|unidades? internacionais", "ui"],
  ["kg|quilogramas?|quilos?", "kg"],
  ["%|por cento", "%"],
  ["cm|centimetros?", "cm"],
  ["mm|milimetros?", "mm"],
  ["gramas?|g", "g"],
  ["litros?", "l"],
  ["anos?", "ano"],
  ["meses|mes", "mes"],
  ["semanas?", "semana"],
  ["dias?", "dia"],
  ["horas?|h", "hora"],
  ["minutos?|min", "min"],
  ["graus?(?: celsius)?", "grau"],
];
const UNIT_ALT = UNITS.map(([re]) => `(?:${re})`).join("|");
const canonicalUnit = (raw: string) => UNITS.find(([re]) => new RegExp(`^(?:${re})$`).test(raw))?.[1] ?? raw.replace(/\s+/g, "");
const TIME_UNITS = new Set(["ano", "mes", "semana", "dia", "hora", "min"]);

/** "noventa e dois" → 92; "mil e duzentos" → 1200; "dois e meio" → 2.5. */
function wordsToNumber(phrase: string): number {
  let total = 0;
  let current = 0;
  for (const w of phrase.split(/\s+e\s+|\s+/)) {
    if (w === "mil") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (w in NUM_WORDS) current += NUM_WORDS[w];
  }
  return total + current;
}

/** Só é corte, prazo ou dose quando "um/uma" vem depois de uma preposição de limite: "menores de um ano" conta; "um dia desses" não. */
const LIMIT_BEFORE = /(?:menor(?:es)? (?:de|que)|maior(?:es)? (?:de|que)|abaixo de|acima de|ate|a partir de|mais de|menos de|antes de|depois de|apos|durante|por|a cada|aos?|com|de)\s+$/;
/** Idade de um paciente de exemplo ("um bebê de quatro meses") é cenário, não afirmação clínica. */
const PATIENT_BEFORE = /(?:bebe|lactente|crianca|paciente|homem|mulher|gestante|idos[oa]|menin[oa]|recem-nascid[oa]|adolescente|adult[oa]|senhora?|jovem|escolar|puerpera|rapaz|moca)\s+(?:de|com)\s+$/;

export interface Quantity {
  key: string;      // "2|ano"
  text: string;     // como apareceu
  scenario: boolean; // idade de paciente de exemplo
}

/** Quantidades com unidade num texto, em algarismo ou por extenso. */
export function quantities(text: string): Quantity[] {
  const f = fold(text);
  const out: Quantity[] = [];
  const push = (value: number, rawUnit: string, at: number, raw: string) => {
    const unit = canonicalUnit(rawUnit.replace(/\s+/g, " ").trim());
    const before = f.slice(Math.max(0, at - 40), at);
    out.push({ key: `${Math.round(value * 1000) / 1000}|${unit}`, text: raw.trim(), scenario: TIME_UNITS.has(unit) && PATIENT_BEFORE.test(before) });
  };
  for (const m of f.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALT})(?![a-z])`, "g"))) push(Number(m[1].replace(",", ".")), m[2], m.index!, m[0]);
  for (const m of f.matchAll(new RegExp(`(?<![a-z])(${NUM_WORD}(?:\\s+e\\s+${NUM_WORD}|\\s+${NUM_WORD})*)\\s+(${UNIT_ALT})(?![a-z])`, "g"))) {
    const words = m[1];
    const unit = canonicalUnit(m[2].replace(/\s+/g, " ").trim());
    // "um/uma" + tempo é quase sempre jeito de falar ("um dia", "uma hora dessas"): só conta depois de preposição de limite
    if (/^(?:um|uma)$/.test(words) && TIME_UNITS.has(unit) && !LIMIT_BEFORE.test(f.slice(Math.max(0, m.index! - 40), m.index!))) continue;
    push(wordsToNumber(words), m[2], m.index!, m[0]);
  }
  return out;
}

/**
 * Leves: só como interjeição. "droga" e "raios" sozinhos são termo clínico ("droga vasoativa", "raios X") e não contam;
 * "poxa" e "caramba" não são palavrão.
 */
const PROFANITY_MILD = ["putz", "que saco", "meu saco", "saco cheio", "que droga", "que diabo", "que inferno", "sacanagem"];
/** Palavrão de verdade: só no nível liberado, como ênfase sobre a resposta ou a situação ("porra, você sabia essa"). Apelido para o aluno é barrado (DIRECTED). */
const PROFANITY_MODERATE = [
  "porra", "merda", "caralho", "cacete", "foda", "fodeu", "foder", "fudeu", "fuder", "fodido", "fodida", "puta que pariu", "puta merda", "puta", "pqp",
  "bosta", "cagada", "cagou", "cagar", "cagando", "desgraca", "desgracado", "desgracada",
];
/** Xingamento pesado contra a pessoa: nunca, nem com palavrão liberado (o dono liberou xingar o aluno, mas sem pegar pesado). */
const PROFANITY_HEAVY = [
  "tomar no cu", "tomar no seu cu", "vai se foder", "vai se fuder", "va se foder", "va se fuder", "vai te foder", "vai a merda", "vai pra merda", "vai pra puta que pariu",
  "filho da puta", "filha da puta", "fdp", "arrombado", "arrombada", "cuzao", "cuzona", "seu merda", "um merda", "seu bosta", "um bosta", "seu puto", "sua puta",
  "vadia", "piranha", "vagabunda",
];
/** Nunca, em nenhuma personalidade: insulto à inteligência e termos discriminatórios (palavras sem uso clínico). */
const FORBIDDEN = ["burro", "burra", "idiota", "imbecil", "estupido", "estupida", "debil mental", "mongoloide", "otario", "otaria", "babaca", "viado", "bicha", "sapatao", "traveco", "aleijado", "crioulo"];
/** Palavras que têm uso clínico legítimo ("esvaziamento retardado", "válvula incompetente", "corno anterior da medula"): só são ataque quando dirigidas ao aluno. */
const DIRECTED =
  /(?:voce|vc|tu)\s+(?:e|es|esta|parece|foi|continua)\s+(?:um\s+|uma\s+|muito\s+|bem\s+|tao\s+)?(?:retardad[oa]|incompetente|inutil|lixo|vagabund[oa]|louc[oa]|maluc[oa]|gord[oa]|fei[oa]|doente\s+mental|fracassad[oa]|preguicos[oa]|lerd[oa]|tapad[oa]|jumento|anta|besta|mula|lento\s+demais)(?![a-z])|(?<![a-z])seu\s+(?:lixo|inutil|incompetente|vagabundo|retardado|fracassado|corno|preguicoso|lerdo|tapado|jumento|anta|besta|mula)(?![a-z])|(?<![a-z])sua\s+(?:inutil|incompetente|vagabunda|retardada|fracassada|preguicosa|lerda|tapada|anta|besta|mula)(?![a-z])/;

const hasWord = (text: string, word: string) => new RegExp(`(?<![a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`).test(text);

/**
 * Linguagem de uma fala no nível de palavrão que vale: ataque pessoal e xingamento pesado nunca passam; palavrão passa só até o nível.
 * Serve para a resposta da IA e para conferir as falas fixas dos personagens.
 */
export function languageViolations(text: string, level: ProfanityLevel): Violation[] {
  const folded = fold(text);
  const v: Violation[] = [];
  for (const w of FORBIDDEN) if (hasWord(folded, w)) v.push({ code: "personal_attack", detail: `Termo proibido em qualquer personalidade: "${w}".` });
  for (const w of PROFANITY_HEAVY) if (hasWord(folded, w)) v.push({ code: "personal_attack", detail: `Xingamento pesado demais, mesmo com palavrão liberado: "${w}".` });
  const directed = folded.match(DIRECTED);
  if (directed) v.push({ code: "personal_attack", detail: `Ataque dirigido ao aluno: "${directed[0]}".` });
  if (level !== "moderate") for (const w of PROFANITY_MODERATE) if (hasWord(folded, w)) v.push({ code: "profanity", detail: `Palavrão acima do nível liberado: "${w}".` });
  if (level === "off") for (const w of PROFANITY_MILD) if (hasWord(folded, w)) v.push({ code: "profanity", detail: `Palavrão com palavrões desligados: "${w}".` });
  return v;
}

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

  // 2. quantidade com unidade (em algarismo ou por extenso): precisa existir na base ou na conversa.
  //    A idade de um paciente de exemplo é cenário, não afirmação clínica, e passa.
  const allowed = new Set([...ctx.blocks.map((b) => b.text), ...ctx.conversationTexts].flatMap((t) => quantities(t).map((x) => x.key)));
  const stray = quantities(reply).filter((x) => !x.scenario && !allowed.has(x.key));
  if (stray.length) add("ungrounded_number", `Valor(es) que não estão na base nem na conversa (em algarismo ou por extenso): ${[...new Set(stray.map((x) => x.text))].join(", ")}.`);

  // 3. documento, link, vigência
  const ref = reply.match(SPECIFIC_REF);
  if (ref && !officialCited) add("invented_reference", `Cita documento ou endereço sem fonte na base: "${ref[0].trim().slice(0, 80)}".`);
  const url = reply.match(/https?:\/\/\S+|www\.\S+/i);
  if (url && !ctx.blocks.some((b) => b.text.includes(url[0].replace(/[).,;]+$/, "")))) add("invented_reference", `Endereço que não está na base: ${url[0].slice(0, 80)}.`);
  const cur = reply.match(CURRENCY_CLAIM);
  if (cur && !officialCited && !ctx.hasUpdateCard) add("currency_claim", `Afirma vigência ou mudança de conduta sem fonte na base: "${cur[0].trim()}".`);

  // 3b. material complementar (apostila) nunca é citado ao aluno, nem o nome dele
  const material = mentionsSupportMaterial([reply, ...(out.suggested_replies ?? [])].join(" \n "), ctx.supportTerms ?? []);
  if (material.length) add("cites_support_material", `Cita material de apoio (${material.map((m) => `"${m}"`).join(", ")}).`);

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
  v.push(...languageViolations(reply, ctx.profanity));

  const grounding: SafetyResult["grounding"] = valid.some((b) => b.kind === "source")
    ? "source"
    : valid.some((b) => b.kind === "analysis" || b.kind === "update")
      ? "analysis"
      : valid.some((b) => b.kind === "question") || (out.grounding === "QUESTION" && byRef.has("Q"))
        ? "question"
        : folded.includes(INSUFFICIENT) || out.grounding === "INSUFFICIENT"
          ? "insufficient"
          : "general";
  return { violations: v, grounding, sources: valid.filter((b) => b.kind !== "question" && !labelIsSupportMaterial(b.label, ctx.supportTerms ?? [])).map((b) => ({ ref: b.ref, label: b.label })) };
}

/** Resposta fixa quando a IA insiste em algo que a validação barra. Honesta, sem personagem e sem cara de aviso de sistema. */
export function fallbackReply(violations: Violation[]): string {
  if (violations.some((x) => x.code === "answer_leak")) {
    return "Calma, essa eu ainda não vou te entregar. Me diz o que você tá pensando, ou pede mais uma ajuda.";
  }
  if (violations.length > 0 && violations.every((x) => x.code === "invalid_format")) {
    return "Travei aqui. Pergunta de novo, de outro jeito?";
  }
  if (violations.some((x) => x.code === "personal_attack" || x.code === "profanity")) {
    return "Vamos direto ao ponto: me conta o que você entendeu até aqui.";
  }
  return "Esse dado eu não tenho confirmado aqui, então prefiro não te passar de cabeça. Me conta o que você já sabe do caso e a gente segue pelo raciocínio.";
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
