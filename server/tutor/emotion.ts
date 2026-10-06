/**
 * MOTOR DE PERSONALIDADE HUMANA do Stazia Tutor: o estado interno do professor numa sessão.
 *
 * Não é uma personalidade nova: é o MESMO professor (Acolhedor, Direto, Durona) mudando de humor com o que acontece. O motor
 * só decide COMO falar (tom, intensidade de linguagem, pressão, avatar); o que ensinar vem do Truth Engine e da pedagogia.
 *
 *   resposta = conhecimento médico + estratégia pedagógica + estado do aluno + ESTADO EMOCIONAL + personalidade + memória + variação
 *
 * O aluno não vê números. Eventos vêm de fatos (o banco corrigiu, o tempo de resposta, a troca de alternativa) e da avaliação
 * silenciosa do raciocínio (tipo e gravidade do erro).
 */

export type Mood = "neutral" | "pleased" | "encouraged" | "impatient" | "irritated" | "angry" | "impressed" | "disappointed";
export type SessionMood = "good" | "neutral" | "impatient";

/** Motor de cada professor (vem do banco: tutor_personalities.engine; estes são os padrões do pedido). */
export interface PersonaEngine {
  frustration_multiplier: number;
  sarcasm_max: number;
  aggression_max: number;
  patience_base: number;
  warmth_base: number;
  /** Teto da intensidade de linguagem (0 limpa … 5 muito forte). */
  language_max: number;
}

export const PERSONA_ENGINE: Record<string, PersonaEngine> = {
  acolhedor: { frustration_multiplier: 0.25, sarcasm_max: 10, aggression_max: 5, patience_base: 90, warmth_base: 95, language_max: 1 },
  direto: { frustration_multiplier: 0.7, sarcasm_max: 35, aggression_max: 25, patience_base: 60, warmth_base: 40, language_max: 3 },
  durona: { frustration_multiplier: 1.25, sarcasm_max: 85, aggression_max: 75, patience_base: 35, warmth_base: 25, language_max: 5 },
};

export const engineFor = (personaId: string, fromDb?: Partial<PersonaEngine> | null): PersonaEngine => ({
  ...(PERSONA_ENGINE[personaId] ?? PERSONA_ENGINE.direto),
  ...Object.fromEntries(Object.entries(fromDb ?? {}).filter(([, v]) => typeof v === "number")),
});

export interface TutorState {
  patience: number;
  irritation: number;
  warmth: number;
  enthusiasm: number;
  strictness: number;
  sarcasm: number;
  confidence: number;          // confiança no aluno
  frustration: number;         // 0–100: o que comanda a escalada

  consecutiveErrors: number;
  consecutiveCorrect: number;
  repeatedErrors: number;
  carelessErrors: number;
  reasoningErrors: number;
  knowledgeErrors: number;
  sessionQuestions: number;

  mood: Mood;
  sessionMood: SessionMood;
  /** "explain": o professor não segue para a próxima questão até o aluno explicar o raciocínio. */
  gate: "explain" | null;
  /** Últimos eventos, do mais antigo para o mais novo (no máximo 8). */
  events: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Estado inicial (ou o que já estava salvo, completado). Aceita o formato antigo da sessão (frustração/engajamento…). */
export function normalize(raw: Partial<TutorState> & Record<string, unknown> | null | undefined, engine: PersonaEngine): TutorState {
  const r = (raw ?? {}) as Partial<TutorState> & Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const sessionMood: SessionMood = r.sessionMood === "good" || r.sessionMood === "impatient" || r.sessionMood === "neutral"
    ? r.sessionMood
    : r.session_mood === "good" || r.session_mood === "impatient" ? (r.session_mood as SessionMood) : "neutral";
  const frustration = clamp(num(r.frustration, sessionMood === "impatient" ? 12 : sessionMood === "good" ? 0 : 5));
  const base: TutorState = {
    patience: clamp(num(r.patience, engine.patience_base - frustration * 0.6)),
    irritation: clamp(num(r.irritation, frustration)),
    warmth: clamp(num(r.warmth, engine.warmth_base)),
    enthusiasm: clamp(num(r.enthusiasm, sessionMood === "good" ? 55 : 40)),
    strictness: clamp(num(r.strictness, 50 + engine.aggression_max * 0.4)),
    sarcasm: clamp(num(r.sarcasm, engine.sarcasm_max * 0.4)),
    confidence: clamp(num(r.confidence, 50)),
    frustration,
    consecutiveErrors: num(r.consecutiveErrors, 0),
    consecutiveCorrect: num(r.consecutiveCorrect, 0),
    repeatedErrors: num(r.repeatedErrors, 0),
    carelessErrors: num(r.carelessErrors, 0),
    reasoningErrors: num(r.reasoningErrors, 0),
    knowledgeErrors: num(r.knowledgeErrors, 0),
    sessionQuestions: num(r.sessionQuestions, 0),
    mood: (typeof r.mood === "string" ? r.mood : "neutral") as Mood,
    sessionMood,
    gate: r.gate === "explain" ? "explain" : null,
    events: Array.isArray(r.events) ? (r.events as string[]).slice(-8) : [],
  };
  return base;
}

/** O que aconteceu nesta fala (fatos do banco + avaliação silenciosa). */
export interface Happening {
  kind: "answer" | "message" | "hint" | "reveal";
  correct?: boolean | null;
  severity?: number | null;            // 1 pequeno … 5 conduta potencialmente perigosa
  errorType?: string | null;           // tipos da avaliação (knowledge_gap, attention_error, …)
  repeated?: boolean;                  // o mesmo erro já aconteceu (nesta sessão ou na memória)
  forgotExplanation?: boolean;         // o professor explicou isso nesta sessão e o aluno errou de novo
  unsafe?: boolean;                    // conduta perigosa para o paciente
  guess?: boolean;                     // chute (confiança mínima, rápido demais)
  excellent?: boolean;                 // raciocínio excelente
  seriousAttempt?: boolean;
  selfCorrected?: boolean;
  changed?: "correct_to_wrong" | "wrong_to_correct" | "wrong_to_wrong" | null;
  responseMs?: number | null;
  explained?: boolean;                 // o aluno explicou o raciocínio pedido (destrava a próxima questão)
  /** Ajuste depois de uma resposta já contada (a voz registra a resposta e só depois avalia o raciocínio). */
  adjust?: { severity?: number; repeated?: boolean; forgotExplanation?: boolean; careless?: boolean; unsafe?: boolean } | null;
}

const CARELESS = new Set(["attention_error", "command_word_error"]);
const KNOWLEDGE = new Set(["knowledge_gap", "memory_failure", "outdated_guideline"]);
const REASONING = new Set(["diagnostic_reasoning", "therapeutic_reasoning", "priority_of_management", "interpretation_error", "distractor_trap", "calculation_error"]);

/**
 * Um passo do motor: atualiza contadores, frustração (com o multiplicador do professor e uma pequena variação humana),
 * as outras dimensões, o humor e os eventos. `rand` devolve 0–1 (injetável para teste).
 */
export function step(prev: TutorState, engine: PersonaEngine, h: Happening, rand: () => number = Math.random): { state: TutorState; events: string[]; frustrationDelta: number } {
  const s: TutorState = { ...prev, events: [...prev.events] };
  const ev: string[] = [];
  const m = engine.frustration_multiplier;
  let up = 0;
  let down = 0;

  if (h.kind === "answer") {
    s.sessionQuestions++;
    if (s.sessionQuestions === 1) ev.push("first_question");
    if (h.changed === "correct_to_wrong") ev.push("changed_correct_to_wrong");
    if (h.changed === "wrong_to_correct") ev.push("changed_wrong_to_correct");
    if (h.responseMs != null && h.responseMs < 12_000) ev.push("very_fast_answer");
    if (h.responseMs != null && h.responseMs > 6 * 60_000) ev.push("very_slow_answer");
  }

  if (h.correct === false) {
    s.consecutiveErrors++;
    s.consecutiveCorrect = 0;
    const sev = Math.max(1, Math.min(5, Math.round(h.severity ?? 3)));
    up += sev * 3 * m;
    if (h.repeated) {
      up += 12 * m;
      s.repeatedErrors++;
      ev.push("repeated_error");
    }
    if (h.forgotExplanation) up += 15 * m;
    if (h.errorType && CARELESS.has(h.errorType)) {
      up += 8 * m;
      s.carelessErrors++;
    } else if (h.errorType && KNOWLEDGE.has(h.errorType)) s.knowledgeErrors++;
    else if (h.errorType && REASONING.has(h.errorType)) s.reasoningErrors++;
    if (h.unsafe || sev >= 5) {
      up += 18 * m;
      ev.push("unsafe_answer");
    }
    if (h.guess) up += 6 * m;
    if (h.changed === "correct_to_wrong") up += 6 * m;
    s.confidence -= 4 + sev;
    if (s.consecutiveErrors === 1 && !s.events.includes("first_error")) ev.push("first_error");
    if (s.consecutiveErrors === 3) ev.push("three_errors");
    if (s.consecutiveErrors === 5) ev.push("five_errors");
  } else if (h.correct === true) {
    const recovering = s.consecutiveErrors >= 2;
    s.consecutiveCorrect++;
    s.consecutiveErrors = 0;
    down += 7;
    s.confidence += 5;
    s.enthusiasm += 6;
    if (h.excellent) {
      down += 12;
      s.confidence += 10;
      s.enthusiasm += 12;
      ev.push("perfect_reasoning");
    }
    if (recovering) s.enthusiasm += 8;
    if (s.consecutiveCorrect === 3) {
      down += 15;
      ev.push("three_correct");
    }
    if (s.consecutiveCorrect === 5) ev.push("five_correct");
    if (s.consecutiveCorrect === 10) ev.push("ten_correct");
  }

  if (h.adjust && h.correct == null) {
    const a = h.adjust;
    up += Math.max(0, (Math.round(a.severity ?? 3) - 3)) * 3 * m;
    if (a.repeated) {
      up += 12 * m;
      s.repeatedErrors++;
      ev.push("repeated_error");
    }
    if (a.forgotExplanation) up += 15 * m;
    if (a.careless) {
      up += 8 * m;
      s.carelessErrors++;
    }
    if (a.unsafe) {
      up += 18 * m;
      ev.push("unsafe_answer");
    }
  }
  if (h.seriousAttempt) down += 5;
  if (h.selfCorrected) {
    down += 10;
    s.enthusiasm += 15;
  }
  if (h.explained) s.gate = null;

  // variação humana: o mesmo erro não dá sempre a mesma reação (±8 no que sobe)
  const noise = up > 0 ? Math.round((rand() * 16 - 8)) : 0;
  const delta = Math.round(up + noise - down);
  s.frustration = clamp(s.frustration + delta);
  s.confidence = clamp(s.confidence);
  s.enthusiasm = clamp(s.enthusiasm - (h.correct === false ? 4 : 0));
  // as outras dimensões acompanham a frustração, dentro dos limites do professor
  s.irritation = clamp(s.frustration);
  s.patience = clamp(engine.patience_base - s.frustration * 0.6);
  s.warmth = clamp(engine.warmth_base - s.frustration * 0.3 + (s.enthusiasm - 40) * 0.2);
  s.strictness = clamp(50 + engine.aggression_max * 0.4 + s.frustration * 0.3);
  s.sarcasm = clamp(Math.min(engine.sarcasm_max, engine.sarcasm_max * (0.4 + (s.frustration / 100) * 0.6)));

  // a Durona irritada (e qualquer professor no limite) para a sequência até o aluno explicar
  const gateAt = engine.frustration_multiplier >= 1 ? 61 : 81;
  if (h.correct === false && s.frustration >= gateAt && (h.repeated || h.forgotExplanation || s.consecutiveErrors >= 3)) s.gate = "explain";

  s.mood = moodOf(s, h);
  s.events = [...s.events, ...ev].slice(-8);
  return { state: s, events: ev, frustrationDelta: delta };
}

function moodOf(s: TutorState, h: Happening): Mood {
  if (s.frustration >= 81) return "angry";
  if (s.frustration >= 61) return "irritated";
  if (s.frustration >= 41) return "impatient";
  if (h.correct === true && (h.excellent || s.consecutiveCorrect >= 5)) return "impressed";
  if (h.correct === true && s.consecutiveCorrect >= 3) return "pleased";
  if (h.correct === true && s.consecutiveErrors === 0 && s.frustration >= 15) return "encouraged";
  if (h.correct === false && s.confidence < 30) return "disappointed";
  if (h.correct === true || h.selfCorrected) return "pleased";
  return "neutral";
}

/** Faixa de frustração 0–4 (0–20, 21–40, 41–60, 61–80, 81–100). */
export const band = (f: number) => (f <= 20 ? 0 : f <= 40 ? 1 : f <= 60 ? 2 : f <= 80 ? 3 : 4);

/** Intensidade de linguagem 0–5 desta resposta: sobe com a frustração, até o teto do professor. */
export function languageIntensity(s: TutorState, engine: PersonaEngine): number {
  const byFrustration = [1, 2, 3, 4, 5][band(s.frustration)];
  const happy = s.mood === "impressed" ? 3 : 0; // comemoração escrachada também pode
  return Math.max(0, Math.min(engine.language_max, Math.max(byFrustration, Math.min(happy, engine.language_max))));
}

/** Palavrão permitido pela intensidade (a conferência por software usa este nível). */
export function profanityForIntensity(li: number): "off" | "mild" | "moderate" {
  return li >= 3 ? "moderate" : li === 2 ? "mild" : "off";
}

const LANGUAGE_TEXT = [
  "0, linguagem limpa",
  "1, informal",
  "2, provocação (no máximo um \"pô\", \"putz\")",
  "3, palavrões ocasionais",
  "4, linguagem forte",
  "5, linguagem muito forte e emocional",
];

/** Como cada professor escala (referência de tom, não frase para copiar). */
const ESCALATION: Record<string, string[]> = {
  durona: [
    "Faixa 0–20: tom exigente, sem palavrão (\"Errado. Releia a pergunta.\", \"Não era difícil. Você ignorou a informação principal.\").",
    "Faixa 21–40: começa a impaciência (\"Pô, presta atenção no enunciado.\", \"Não inventa moda: o caso está entregando a resposta.\").",
    "Faixa 41–60: irritada de verdade (\"Porra, de novo?\", \"Eu acabei de explicar isso.\", \"Você está chutando e eu estou percebendo.\").",
    "Faixa 61–80: raiva evidente (\"Caralho. É a terceira vez que você cai nisso.\", \"Você sabe essa merda. Para de responder correndo.\"). Pode parar a sequência.",
    "Faixa 81–100: irritação pedagógica máxima. Não aumente os palavrões: aumente a cobrança. Pare as questões e exija o raciocínio (\"Agora chega. Me diga diagnóstico, gravidade e primeira conduta.\").",
  ],
  direto: [
    "Faixa baixa: \"Errado. O diagnóstico está certo; a conduta, não.\"",
    "Repetiu: \"De novo o mesmo erro.\" / \"Você ainda não corrigiu esse conceito.\"",
    "Impaciente: \"Você está respondendo rápido demais e errando coisa que sabe.\"",
    "Irritado: \"Para de chutar. Leia a questão.\" Um palavrão ocasional só se encaixar.",
    "No limite: frases ainda mais curtas e cobrança de justificativa antes de seguir.",
  ],
  acolhedor: [
    "Calmo: \"Vamos por partes. Seu raciocínio começou certo, mas você se perdeu na conduta.\"",
    "Segundo erro parecido: \"Tem um padrão aparecendo aqui.\"",
    "Terceiro: \"Agora preciso insistir, porque já é a terceira vez que esse ponto aparece.\"",
    "Irritado: \"Não responde correndo. Você sabe isso; parece pressa.\"",
    "No limite: \"Eu vou te cobrar agora: acabamos de ver esse conceito. Vamos resolver antes de continuar.\" Nunca humilhação.",
  ],
};

const MOOD_PT: Record<Mood, string> = {
  neutral: "neutro", pleased: "satisfeito", encouraged: "animado com a melhora", impatient: "impaciente", irritated: "irritado",
  angry: "muito irritado", impressed: "impressionado", disappointed: "decepcionado",
};
const EVENT_PT: Record<string, string> = {
  first_question: "primeira questão", first_error: "primeiro erro", three_errors: "três erros seguidos", five_errors: "cinco erros seguidos",
  repeated_error: "repetiu um erro", three_correct: "três acertos seguidos", five_correct: "cinco acertos seguidos", ten_correct: "dez acertos seguidos",
  perfect_reasoning: "raciocínio perfeito", unsafe_answer: "conduta perigosa para o paciente", changed_correct_to_wrong: "marcou a certa e trocou pela errada",
  changed_wrong_to_correct: "trocou a errada pela certa", very_fast_answer: "respondeu rápido demais", very_slow_answer: "demorou muito para responder",
};

/** Bloco de ESTADO do professor para o prompt (sistema). */
export function stateLayer(personaId: string, s: TutorState, engine: PersonaEngine): string {
  const li = languageIntensity(s, engine);
  const scale = ESCALATION[personaId] ?? ESCALATION.direto;
  const lines = [
    `ESTADO NESTA SESSÃO (interno, nunca diga números): humor ${MOOD_PT[s.mood]}; frustração ${s.frustration}/100 (faixa ${band(s.frustration) + 1} de 5); paciência ${s.patience}; calor ${s.warmth}; sarcasmo ${s.sarcasm}; confiança no aluno ${s.confidence}. Humor do dia: ${s.sessionMood === "good" ? "bom" : s.sessionMood === "impatient" ? "impaciente" : "neutro"}.`,
    `Na sessão: ${s.sessionQuestions} questão(ões); ${s.consecutiveErrors} erro(s) seguido(s); ${s.consecutiveCorrect} acerto(s) seguido(s); erros repetidos ${s.repeatedErrors}; por desatenção ${s.carelessErrors}; de raciocínio ${s.reasoningErrors}; de conhecimento ${s.knowledgeErrors}.`,
    s.events.length ? `Acontecimentos recentes: ${s.events.map((e) => EVENT_PT[e] ?? e).join("; ")}.` : "",
    `INTENSIDADE DE LINGUAGEM AGORA: ${LANGUAGE_TEXT[li]}. Palavrão só se combinar com o professor e com esta intensidade, espontâneo, nunca obrigatório e nunca como muleta.`,
    `Como você escala (referência de tom, não copie): ${scale.join(" ")}`,
    s.gate === "explain" ? "VOCÊ TRAVOU A SEQUÊNCIA: não ofereça a próxima questão. Exija que o aluno explique, com as palavras dele, o raciocínio (diagnóstico, gravidade, primeira conduta) antes de seguir." : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Para o avatar (mascote) e a voz: o front mostra só a mensagem; isto anima e dá a prosódia. */
export function avatarOf(personaId: string, s: TutorState) {
  const intensity = s.mood === "impressed" || s.mood === "pleased" ? clamp(s.enthusiasm) : clamp(s.frustration);
  const animation: Record<Mood, string> = {
    neutral: "neutral", pleased: "happy", encouraged: "proud", impatient: personaId === "durona" ? "eye_roll" : "skeptical",
    irritated: personaId === "durona" ? "arms_crossed" : "annoyed", angry: personaId === "durona" ? "facepalm" : "angry",
    impressed: "celebrating", disappointed: "confused",
  };
  const face: Record<Mood, string> = {
    neutral: "neutral", pleased: "smile", encouraged: "smile", impatient: "skeptical", irritated: "annoyed", angry: "angry", impressed: "surprised", disappointed: "sad",
  };
  const base = personaId === "acolhedor" ? 0.96 : personaId === "durona" ? 1.04 : 1.02;
  const speechRate = Math.round((base + (s.mood === "irritated" || s.mood === "angry" ? 0.06 : s.mood === "impatient" ? 0.03 : 0)) * 100) / 100;
  const voiceStyle = s.mood === "angry" ? "angry_firm" : s.mood === "irritated" ? "firm" : s.mood === "impatient" ? "impatient" : s.mood === "impressed" || s.mood === "pleased" ? "warm" : personaId === "acolhedor" ? "calm" : "neutral";
  return { emotion: s.mood, intensity, animation: animation[s.mood], facialExpression: face[s.mood], voiceStyle, speechRate };
}

/**
 * Expressões recentes do professor, para ele não repetir ("Porra, de novo?" a cada erro): o começo de cada fala e as interjeições
 * e palavrões usados nas últimas falas.
 */
export function recentExpressions(tutorTexts: string[], max = 10): string[] {
  const out: string[] = [];
  const push = (x: string) => {
    const t = x.trim().replace(/\s+/g, " ");
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  for (const text of tutorTexts.slice(-6).reverse()) {
    const first = text.split(/(?<=[.!?…])\s+/)[0] ?? "";
    if (first && first.split(/\s+/).length <= 7) push(first);
    else push(text.split(/\s+/).slice(0, 4).join(" "));
    for (const m of text.matchAll(/\b(porra|caralho|merda|cacete|puta merda|pô|putz|de novo\??|presta atenção|eu acabei de explicar|finalmente|até que enfim|agora sim|olha só)\b/gi)) push(m[0]);
  }
  return out.slice(0, max);
}
