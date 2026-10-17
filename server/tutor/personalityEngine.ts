/**
 * PERSONALITY ENGINE do Voice Tutor (Missão Master, blocos 7, 8 e 9).
 *
 * O jeito de cada professor deixa de ser só texto de prompt: é um PERFIL com parâmetros numéricos (0–100) e limites duros,
 * e o humor muda por um ESTADO EMOCIONAL contextual (13 estados) que anda por TRANSIÇÕES fixas, a partir de fatos da conversa
 * (acerto, erro, erro repetido, bom raciocínio, frustração, brincadeira, pedido de seriedade, tema sensível, crise). Não há
 * sorteio: a mesma conversa dá sempre o mesmo humor (a variedade de frase é do modelo, guiada por "não repita").
 *
 *   perfil (professor + nível) ─┐
 *   memória do humor (sessão) ──┼─► transição ─► DIRETIVA do turno: estado, intensidade, palavrão, grito, zombaria,
 *   sinais deste turno ─────────┘                 reações de voz liberadas (lista do dono ∩ provedor ∩ estado), camada de prompt
 *
 * Regras que nada aqui muda: conteúdo médico, gabarito escondido, simulado sem ajuda (o motor só decide o TOM; a ajuda
 * pedagógica é do motor do Tutor e o "sem ajuda" vence qualquer personalidade); limites de respeito (PERSONALITY_LIMITS e
 * safety.ts). Em sofrimento ou crise, qualquer professor fica calmo, sem palavrão, sem grito e sem reação de voz.
 *
 * Durona Explosiva (bloco 8): N1 Direta (sem palavrão), N2 Sarcástica (ironia leve, palavrão leve), N3 Estressada (palavrão
 * ocasional, voz elevada pontual), N4 Explosiva (teatral, palavrão espontâneo). Decisão do dono de 16/10 ("ativo para todos"):
 * todos os alunos são médicos maiores de 18, então quem escolhe a Durona recebe por PADRÃO o N3 com gritos e palavrões ligados;
 * o aluno baixa o nível ou desliga gritos/palavrões nas preferências. A maioridade vem da declaração do aceite do Termo 2.0
 * (nada é perguntado de novo); sem ela, o servidor usa N2. A Durona de sempre (perfil "padrao") só vale se o painel desligar a
 * Explosiva.
 *
 * 17/10/2026: o Tutor tem dois personagens e quatro personalidades. O Durão (Stazi) é a Durona no masculino: mesma mecânica de nível,
 * mesmo padrão N3, mesmo travamento por 18+ e médico, mesmas reações marcadas pelo dono. A Tranquila (Stazia) é o Tranquilo no feminino.
 */
import { PERSONALITY_LIMITS, type ProfanityLevel } from "./personality";
import {
  REACTIONS, reactionInfo, TAGGED_PROVIDERS,
  type ProfileLevel, type PublicPersonality, type ReactionId, type ReactionRule, type VoiceProviderId,
} from "../../src/shared/tutor/voiceReactions";

// ---------------------------------------------------------------------------------------------------------------- estados
export type EmotionalState =
  | "neutral" | "curious" | "skeptical" | "sarcastic" | "irritated" | "frustrated" | "surprised"
  | "excited" | "proud" | "playful" | "focused" | "calm" | "empathetic";

export const EMOTIONAL_STATES: EmotionalState[] = [
  "neutral", "curious", "skeptical", "sarcastic", "irritated", "frustrated", "surprised", "excited", "proud", "playful", "focused", "calm", "empathetic",
];

export const STATE_PT: Record<EmotionalState, string> = {
  neutral: "neutra", curious: "curiosa", skeptical: "desconfiada", sarcastic: "sarcástica", irritated: "irritada", frustrated: "frustrada",
  surprised: "surpresa", excited: "empolgada", proud: "orgulhosa", playful: "brincalhona", focused: "concentrada", calm: "calma", empathetic: "acolhedora",
};

/** Quanto cada estado "pesa" na voz (0–1), antes da intensidade do perfil. */
const STATE_WEIGHT: Record<EmotionalState, number> = {
  neutral: 0.3, curious: 0.4, skeptical: 0.5, sarcastic: 0.7, irritated: 0.85, frustrated: 0.9, surprised: 0.9,
  excited: 0.85, proud: 0.6, playful: 0.65, focused: 0.3, calm: 0.15, empathetic: 0.1,
};

/** Estados em que a personalidade "solta" (palavrão, grito, zombaria podem aparecer). */
const HOT: ReadonlySet<EmotionalState> = new Set(["sarcastic", "irritated", "frustrated", "surprised", "excited", "playful"]);
/** Estados de contraste: sem palavrão, sem grito, sem zombaria. */
const COOL: ReadonlySet<EmotionalState> = new Set(["calm", "empathetic", "focused"]);

// ---------------------------------------------------------------------------------------------------------------- perfis
/** Parâmetros estruturados do bloco 7 (0–100). */
export interface PersonaParams {
  formality: number;
  sarcasm: number;
  impatience: number;
  /** Intensidade emocional geral. */
  intensity: number;
  profanity_frequency: number;
  reaction_frequency: number;
  provocation: number;
  /** Preferência socrática (perguntar antes de explicar). */
  socratic: number;
  /** Extensão das falas (0 = mínimo, 100 = explica a fundo). */
  length: number;
}

export interface PersonaProfile {
  key: string;
  personality: PublicPersonality;
  level: ProfileLevel;
  name: string;
  params: PersonaParams;
  /** Teto de palavrão do perfil (a plataforma pode baixar, nunca subir). */
  profanity_max: ProfanityLevel;
  /** Pode levantar a voz (grito curto). */
  shouts: boolean;
  /** Zombaria: só do ERRO, da alternativa, da situação; nunca da pessoa. */
  mockery: "none" | "light" | "theatrical";
  /** Quem é, em frases de gente. */
  style: string;
  /** Falas de referência de TOM (aprovadas nos testes e no Stazi): não copiar. */
  examples: string[];
}

const P = (formality: number, sarcasm: number, impatience: number, intensity: number, profanity_frequency: number, reaction_frequency: number, provocation: number, socratic: number, length: number): PersonaParams =>
  ({ formality, sarcasm, impatience, intensity, profanity_frequency, reaction_frequency, provocation, socratic, length });

export const PROFILES: Record<string, PersonaProfile> = {
  tranquilo: {
    key: "tranquilo", personality: "tranquilo", level: "padrao", name: "Tranquilo",
    params: P(30, 20, 10, 25, 0, 25, 20, 85, 55), profanity_max: "off", shouts: false, mockery: "none",
    style: "Professor calmo, de fala mansa, que prefere que o aluno chegue lá sozinho. Ironia leve, nunca bronca.",
    examples: ["Eu podia te contar, mas você chega lá. Qual pista pesa mais?", "Hum. Quase. Volta no enunciado.", "Isso. Viu como dava?"],
  },
  tranquila: {
    key: "tranquila", personality: "tranquilo", level: "padrao", name: "Tranquila",
    params: P(30, 15, 8, 20, 0, 20, 15, 80, 55), profanity_max: "off", shouts: false, mockery: "none",
    style: "Professora calma e acolhedora, de fala mansa e sem pressa, que cuida do aluno sem baixar a exigência. Prefere que ele chegue lá sozinho, com uma pista e uma pergunta menor. Nunca bronca, nunca grito.",
    examples: ["Sem pressa. Qual pista do caso pesa mais?", "Hum. Quase. Volta no enunciado, com calma.", "Isso. Viu como você chegou lá?"],
  },
  direto: {
    key: "direto", personality: "direto", level: "padrao", name: "Direto",
    params: P(40, 30, 45, 50, 20, 30, 35, 35, 25), profanity_max: "moderate", shouts: true, mockery: "none",
    style: "Professor objetivo e seco: frase curta, sem rodeio, cobra justificativa.",
    examples: ["Errado. Diagnóstico certo, conduta errada.", "De novo isso? Lê a questão.", "Isso aí. Essa era difícil."],
  },
  durona: {
    key: "durona", personality: "durona", level: "padrao", name: "Durona",
    params: P(20, 70, 65, 65, 45, 45, 60, 45, 35), profanity_max: "moderate", shouts: true, mockery: "light",
    style: "Professora exigente e sarcástica, de plantão, que cobra muito porque quer o aluno aprovado.",
    examples: ["Acertou. Seguimos.", "Certo. Era o mínimo.", "De novo? Abre o livro.", "Tá bom, essa eu aplaudo."],
  },
  "durona:n1": {
    key: "durona:n1", personality: "durona", level: "n1", name: "Durona Explosiva — N1 Direta",
    params: P(30, 35, 50, 45, 0, 25, 40, 45, 30), profanity_max: "off", shouts: false, mockery: "none",
    style: "Professora de medicina brasileira, competente e firme. Direta, sem palavrão: a cobrança vem do jeito, não da palavra.",
    examples: ["Acertou. Seguimos.", "Não. Lê de novo o comando.", "Revisa e volta.", "Dez seguidas. Assustador."],
  },
  "durona:n2": {
    key: "durona:n2", personality: "durona", level: "n2", name: "Durona Explosiva — N2 Sarcástica",
    params: P(20, 70, 55, 55, 10, 40, 60, 45, 35), profanity_max: "mild", shouts: false, mockery: "light",
    style: "Professora sarcástica e teatral, de ironia inteligente. Debocha do erro com graça e explica firme logo depois.",
    examples: ["Meta batida. O mínimo.", "Revisão feita. Milagre.", "Corticoide primeiro? Sério? Que coragem.", "Subiu. Não se acostume."],
  },
  "durona:n3": {
    key: "durona:n3", personality: "durona", level: "n3", name: "Durona Explosiva — N3 Estressada",
    params: P(15, 75, 80, 75, 35, 60, 70, 40, 35), profanity_max: "moderate", shouts: true, mockery: "light",
    style: "Professora de plantão, cansada e apaixonada por ensinar: impaciente, sarcástica, solta um palavrão de vez em quando e levanta a voz pontualmente.",
    examples: ["Pelo amor de Deus! Lê o enunciado!", "Ah, não. Você só pode estar brincando.", "Agora sim. Viu como sabia?"],
  },
  "durona:n4": {
    key: "durona:n4", personality: "durona", level: "n4", name: "Durona Explosiva — N4 Explosiva",
    params: P(10, 90, 90, 95, 65, 80, 85, 40, 35), profanity_max: "moderate", shouts: true, mockery: "theatrical",
    style:
      "Professora de medicina brasileira, competente, impaciente, sarcástica, teatral e divertida. Fala como gente de verdade: humor ácido adulto, " +
      "palavrão espontâneo, reação inesperada, risada e suspiro, grito breve na surpresa ou na indignação; frase curta alternada com explicação funda; " +
      "reconhece raciocínio bom e tem momentos calmos de contraste.",
    examples: ["Meu Deus do céu, que merda de raciocínio é esse?", "Porra, corticoide primeiro? É tipo apagar incêndio com regador!", "AGORA SIM! Viu como você sabia?"],
  },
  durao: {
    key: "durao", personality: "durona", level: "padrao", name: "Durão",
    params: P(20, 70, 65, 65, 45, 45, 60, 45, 35), profanity_max: "moderate", shouts: true, mockery: "light",
    style: "Professor exigente e sarcástico, de plantão, que cobra muito porque quer o aluno aprovado.",
    examples: ["Acertou. Seguimos.", "Certo. Era o mínimo.", "De novo? Abre o livro.", "Tá bom, essa eu aplaudo."],
  },
  "durao:n1": {
    key: "durao:n1", personality: "durona", level: "n1", name: "Durão Explosivo — N1 Direto",
    params: P(30, 35, 50, 45, 0, 25, 40, 45, 30), profanity_max: "off", shouts: false, mockery: "none",
    style: "Professor de medicina brasileiro, competente e firme. Direto, sem palavrão: a cobrança vem do jeito, não da palavra.",
    examples: ["Acertou. Seguimos.", "Não. Lê de novo o comando.", "Revisa e volta.", "Dez seguidas. Assustador."],
  },
  "durao:n2": {
    key: "durao:n2", personality: "durona", level: "n2", name: "Durão Explosivo — N2 Sarcástico",
    params: P(20, 70, 55, 55, 10, 40, 60, 45, 35), profanity_max: "mild", shouts: false, mockery: "light",
    style: "Professor sarcástico e teatral, de ironia inteligente. Debocha do erro com graça e explica firme logo depois.",
    examples: ["Meta batida. O mínimo.", "Revisão feita. Milagre.", "Corticoide primeiro? Sério? Que coragem.", "Subiu. Não se acostume."],
  },
  "durao:n3": {
    key: "durao:n3", personality: "durona", level: "n3", name: "Durão Explosivo — N3 Estressado",
    params: P(15, 75, 80, 75, 35, 60, 70, 40, 35), profanity_max: "moderate", shouts: true, mockery: "light",
    style: "Professor de plantão, cansado e apaixonado por ensinar: impaciente, sarcástico, solta um palavrão de vez em quando e levanta a voz pontualmente.",
    examples: ["Pelo amor de Deus! Lê o enunciado!", "Ah, não. Você só pode estar brincando.", "Agora sim. Viu como sabia?"],
  },
  "durao:n4": {
    key: "durao:n4", personality: "durona", level: "n4", name: "Durão Explosivo — N4 Explosivo",
    params: P(10, 90, 90, 95, 65, 80, 85, 40, 35), profanity_max: "moderate", shouts: true, mockery: "theatrical",
    style:
      "Professor de medicina brasileiro, competente, impaciente, sarcástico, teatral e divertido. Fala como gente de verdade: humor ácido adulto, " +
      "palavrão espontâneo, reação inesperada, risada e suspiro, grito breve na surpresa ou na indignação; frase curta alternada com explicação funda; " +
      "reconhece raciocínio bom e tem momentos calmos de contraste.",
    examples: ["Meu Deus do céu, que merda de raciocínio é esse?", "Porra, corticoide primeiro? É tipo apagar incêndio com regador!", "AGORA SIM! Viu como você sabia?"],
  },
};

export const PROFILE_KEYS = Object.keys(PROFILES);

// ---------------------------------------------------------------------------------------------------------------- escolha do perfil
export type ExplosivaLevel = "n1" | "n2" | "n3" | "n4";
const LEVEL_ORDER: ExplosivaLevel[] = ["n1", "n2", "n3", "n4"];
const RANK: Record<ProfanityLevel, number> = { off: 0, mild: 1, moderate: 2 };
const minProfanity = (a: ProfanityLevel, b: ProfanityLevel): ProfanityLevel => (RANK[a] <= RANK[b] ? a : b);

/** Preferência do aluno para a Durona Explosiva (tabela tutor_explosiva_preferences; sem linha = o padrão abaixo). */
export interface ExplosivaChoice {
  level: ExplosivaLevel;
  /** Gritos ligados (opção separada do aluno). */
  shouts: boolean;
  /** Palavrões ligados (opção separada do aluno). */
  profanity: boolean;
  /** Declarou 18+ e médico no aceite do Termo 2.0 (vem do banco, nunca do navegador). */
  adultDeclared: boolean;
}

/** Padrão do dono (16/10): N3, gritos e palavrões ligados. A maioridade continua vindo do Termo. */
export const DEFAULT_EXPLOSIVA: Omit<ExplosivaChoice, "adultDeclared"> = { level: "n3", shouts: true, profanity: true };

export interface ProfileInput {
  /** Id do professor; os antigos acolhedor/preguicoso resolvem para Tranquilo. */
  personality: string;
  explosiva?: ExplosivaChoice | null;
  platform: { maxProfanity: ProfanityLevel; explosivaEnabled: boolean };
}

export interface ResolvedProfile {
  profile: PersonaProfile;
  profanityCap: ProfanityLevel;
  shoutsAllowed: boolean;
  /** Por que o nível pedido não valeu (rebaixado ou desligado), em português. */
  note: string | null;
}

export function publicPersonality(id: string): PublicPersonality {
  if (id === "acolhedor" || id === "preguicoso" || id === "tranquilo" || id === "tranquila") return "tranquilo";
  if (id === "durona" || id === "durao") return "durona";
  return "direto";
}

/**
 * Quatro professores, duas famílias de motor: Durão é a Durona no masculino e Tranquila é o Tranquilo no feminino. A família manda
 * nas regras (reações marcadas pelo dono, nível, 18+ do Termo); a "forma" só escolhe o texto de personagem concordando no gênero.
 */
const isDurao = (id: string) => id === "durao";
const isTranquila = (id: string) => id === "tranquila";

/** Perfil desta conversa, com os travamentos do servidor (painel, maioridade do Termo, gritos e palavrões do aluno). */
export function resolveProfile(input: ProfileInput): ResolvedProfile {
  const personality = publicPersonality(input.personality);
  const durona = isDurao(input.personality) ? "durao" : "durona";
  let key: string = isTranquila(input.personality) ? "tranquila" : personality === "durona" ? durona : personality;
  let note: string | null = null;
  const choice: ExplosivaChoice | null =
    personality === "durona" ? input.explosiva ?? { ...DEFAULT_EXPLOSIVA, adultDeclared: false } : null;
  if (choice && LEVEL_ORDER.includes(choice.level)) {
    if (!input.platform.explosivaEnabled) note = `${isDurao(input.personality) ? "O Durão Explosivo está desligado" : "A Durona Explosiva está desligada"} no painel: vale ${isDurao(input.personality) ? "o Durão" : "a Durona"} de sempre.`;
    else {
      let level = choice.level;
      if ((level === "n3" || level === "n4") && !choice.adultDeclared) {
        level = "n2";
        note = "N3 e N4 dependem da declaração de maioridade e de médico do aceite do Termo: ficou no N2.";
      }
      key = `${durona}:${level}`;
    }
  }
  const profile = PROFILES[key];
  const studentProfanity = choice && key !== durona ? choice.profanity !== false : true;
  return {
    profile,
    profanityCap: studentProfanity ? minProfanity(profile.profanity_max, input.platform.maxProfanity ?? "off") : "off",
    shoutsAllowed: profile.shouts && (choice ? choice.shouts !== false : true),
    note,
  };
}

// ---------------------------------------------------------------------------------------------------------------- sinais
export type Signal =
  | "correct" | "wrong" | "repeated_error" | "good_reasoning" | "unsafe_answer" | "guess"
  | "student_frustration" | "joke" | "seriousness_request" | "sensitive_topic" | "crisis" | "question" | "message";

const fold = (t: string) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Risco à vida ou crise: calma total na sessão e orientação de ajuda (CVV 188). */
const CRISIS = /(me matar|me mata[rn]?|quero morrer|vontade de morrer|nao quero (mais )?viver|tirar (a )?minha (propria )?vida|acabar com (a minha vida|tudo)|suicid|me cortar|me machucar|autoles|nao vejo saida|crise de panico|ataque de panico|to tendo uma crise|estou tendo uma crise|nao consigo respirar de (nervoso|ansiedade))/;
/** Sofrimento ou frustração forte do aluno (sem risco): o professor acolhe e baixa o tom. */
const DISTRESS = /(to|estou|tô|ando|me sinto) (muito )?(desesperad|frustrad|exaust|esgotad|ansios|deprimid|mal|pra baixo|triste|perdid|sem forca)|(nao aguento mais|vou desistir|desisto|nao consigo (mais|aprender|entender nada)|sou (um |uma )?(burr|fracass|incapaz|inutil)|nao sirvo pra isso|vou reprovar de novo|chorei|to chorando|estou chorando|burnout)/;
/** Pedido de seriedade: o professor para com a brincadeira por algumas falas. */
const SERIOUS = /(fala serio|vamos falar serio|para de (brincar|zoar|xingar|gritar|palhacada)|sem (palavrao|zoeira|brincadeira|gritar|grito)|(pode|da pra|consegue) (falar|explicar) (serio|direito|normal|sem xingar)|fala (normal|direito)|com calma,? por favor|so explica|preciso que voce seja seri)/;
/** Brincadeira do aluno. */
const JOKE = /(k{3,}|(ha){2,}|(rs){2,}|\brs\b|to brincando|tô brincando|zoeira|brincadeira|so zoando|só zoando|😂|🤣)/;
/** Tema sensível de verdade (não a medicina da questão): luto, morte de paciente real, abuso, violência. */
const SENSITIVE = /(perdi (um|uma|o|a|meu|minha) (paciente|pai|mae|filh|irm|avo|amig)|meu paciente morreu|minha paciente morreu|morreu no meu plantao|luto|fui abusad|sofri (abuso|assedio|violencia)|violencia (domestica|sexual) (comigo|em casa)|estupr)/;

/** Sinais tirados só da fala do aluno (os de acerto e erro vêm do banco e da avaliação). */
export function signalsFromText(text: string): Signal[] {
  const t = fold(text);
  const out: Signal[] = [];
  if (!t) return out;
  if (CRISIS.test(t)) out.push("crisis");
  if (DISTRESS.test(t)) out.push("student_frustration");
  if (SENSITIVE.test(t)) out.push("sensitive_topic");
  if (SERIOUS.test(t)) out.push("seriousness_request");
  if (JOKE.test(t) || JOKE.test(text)) out.push("joke");
  if (/\?\s*$/.test(text.trim())) out.push("question");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- memória e transição
/** Memória do humor nesta sessão (vai junto do estado salvo da conversa). */
export interface PersonaMemory {
  state: EmotionalState;
  turn: number;
  consecutiveErrors: number;
  consecutiveCorrect: number;
  /** Falas restantes em modo sério (pedido de seriedade ou tema sensível). */
  seriousTurns: number;
  /** Crise na sessão: calma até o fim da conversa. */
  crisis: boolean;
  /** Falas restantes de acolhimento depois de sofrimento. */
  comfortTurns: number;
  /** Reações usadas nas últimas falas (para a frequência máxima "a cada 10 falas"). */
  reactionLog: { turn: number; reaction: ReactionId }[];
}

export const freshMemory = (): PersonaMemory => ({ state: "neutral", turn: 0, consecutiveErrors: 0, consecutiveCorrect: 0, seriousTurns: 0, crisis: false, comfortTurns: 0, reactionLog: [] });

/** Estado de repouso de cada perfil (fala comum, sem acontecimento). */
function restState(p: PersonaProfile): EmotionalState {
  if (p.personality === "tranquilo") return "calm";
  if (p.personality === "direto") return "focused";
  return p.level === "n1" ? "neutral" : "skeptical";
}

type Temper = "tranquilo" | "direto" | "durona" | "n1" | "n2" | "n3" | "n4";
const temperOf = (p: PersonaProfile): Temper => (p.level === "padrao" ? p.personality : p.level);

/** Tabela de reação de cada temperamento (fixa, sem sorteio). */
const REACT: Record<Temper, { wrong: EmotionalState; repeated: EmotionalState; many: EmotionalState; unsafe: EmotionalState; guess: EmotionalState; correct: EmotionalState; relief: EmotionalState; good: EmotionalState; joke: EmotionalState; question: EmotionalState }> = {
  tranquilo: { wrong: "curious", repeated: "focused", many: "focused", unsafe: "focused", guess: "skeptical", correct: "proud", relief: "proud", good: "proud", joke: "playful", question: "curious" },
  direto: { wrong: "skeptical", repeated: "irritated", many: "frustrated", unsafe: "surprised", guess: "skeptical", correct: "proud", relief: "excited", good: "proud", joke: "playful", question: "focused" },
  durona: { wrong: "skeptical", repeated: "irritated", many: "frustrated", unsafe: "surprised", guess: "irritated", correct: "skeptical", relief: "proud", good: "surprised", joke: "playful", question: "focused" },
  n1: { wrong: "skeptical", repeated: "irritated", many: "frustrated", unsafe: "surprised", guess: "skeptical", correct: "neutral", relief: "proud", good: "proud", joke: "skeptical", question: "focused" },
  n2: { wrong: "sarcastic", repeated: "sarcastic", many: "frustrated", unsafe: "surprised", guess: "sarcastic", correct: "skeptical", relief: "proud", good: "surprised", joke: "playful", question: "focused" },
  n3: { wrong: "irritated", repeated: "frustrated", many: "frustrated", unsafe: "surprised", guess: "irritated", correct: "proud", relief: "excited", good: "surprised", joke: "playful", question: "focused" },
  n4: { wrong: "sarcastic", repeated: "irritated", many: "frustrated", unsafe: "surprised", guess: "sarcastic", correct: "playful", relief: "excited", good: "surprised", joke: "playful", question: "focused" },
};

export interface Transition {
  memory: PersonaMemory;
  /** Sinal que decidiu o estado (para o registro e para o prompt). */
  cause: Signal | "rest" | "crisis_lock" | "serious_lock" | "comfort_lock";
}

/** Um passo do humor: prioridade fixa (crise > sofrimento > tema sensível > seriedade > fatos da questão > conversa). */
export function transition(prev: PersonaMemory, signals: Signal[], profile: PersonaProfile): Transition {
  const has = (s: Signal) => signals.includes(s);
  const m: PersonaMemory = { ...prev, turn: prev.turn + 1, reactionLog: prev.reactionLog.filter((r) => r.turn > prev.turn + 1 - 10) };
  const t = REACT[temperOf(profile)];
  const decay = () => {
    m.seriousTurns = Math.max(0, m.seriousTurns - 1);
    m.comfortTurns = Math.max(0, m.comfortTurns - 1);
  };

  // contadores de acerto e erro andam sempre (o humor pode estar travado, a memória não)
  const wasErrors = prev.consecutiveErrors;
  if (has("wrong") || has("repeated_error") || has("unsafe_answer")) {
    m.consecutiveErrors++;
    m.consecutiveCorrect = 0;
  } else if (has("correct")) {
    m.consecutiveCorrect++;
    m.consecutiveErrors = 0;
  }

  if (has("crisis") || prev.crisis) {
    m.crisis = true;
    m.state = has("crisis") ? "empathetic" : prev.state === "empathetic" && !has("correct") ? "empathetic" : "calm";
    return { memory: m, cause: has("crisis") ? "crisis" : "crisis_lock" };
  }
  if (has("student_frustration")) {
    m.comfortTurns = 2;
    m.state = "empathetic";
    return { memory: m, cause: "student_frustration" };
  }
  if (has("sensitive_topic")) {
    m.seriousTurns = Math.max(m.seriousTurns, 3);
    m.state = "calm";
    return { memory: m, cause: "sensitive_topic" };
  }
  if (has("seriousness_request")) {
    m.seriousTurns = 5;
    m.state = "focused";
    return { memory: m, cause: "seriousness_request" };
  }
  if (prev.comfortTurns > 0) {
    decay();
    m.state = has("correct") || has("good_reasoning") ? "proud" : "calm";
    return { memory: m, cause: "comfort_lock" };
  }
  if (prev.seriousTurns > 0) {
    decay();
    m.state = has("correct") || has("good_reasoning") ? "proud" : "focused";
    return { memory: m, cause: "serious_lock" };
  }

  let cause: Transition["cause"] = "rest";
  if (has("unsafe_answer")) [m.state, cause] = [t.unsafe, "unsafe_answer"];
  else if (has("wrong") || has("repeated_error")) {
    if (m.consecutiveErrors >= 3) [m.state, cause] = [t.many, has("repeated_error") ? "repeated_error" : "wrong"];
    else if (has("repeated_error") || m.consecutiveErrors === 2) [m.state, cause] = [t.repeated, has("repeated_error") ? "repeated_error" : "wrong"];
    else if (has("guess")) [m.state, cause] = [t.guess, "guess"];
    else [m.state, cause] = [t.wrong, "wrong"];
  } else if (has("correct")) {
    if (has("good_reasoning")) [m.state, cause] = [t.good, "good_reasoning"];
    else if (wasErrors >= 1) [m.state, cause] = [t.relief, "correct"];
    else if (m.consecutiveCorrect >= 3) [m.state, cause] = ["proud", "correct"];
    else [m.state, cause] = [t.correct, "correct"];
  } else if (has("good_reasoning")) [m.state, cause] = [t.good, "good_reasoning"];
  else if (has("joke")) [m.state, cause] = [t.joke, "joke"];
  else if (has("question")) [m.state, cause] = [t.question, "question"];
  else {
    // fala comum: o humor volta aos poucos ao repouso (quente → morno → repouso), sem pular
    const rest = restState(profile);
    m.state = HOT.has(prev.state) && prev.state !== "playful" ? (profile.personality === "tranquilo" ? "calm" : "skeptical") : rest;
    if (m.state === prev.state) m.state = rest;
  }
  return { memory: m, cause };
}

// ---------------------------------------------------------------------------------------------------------------- reações permitidas
/** Em que estados cada reação combina (fora deles o filtro tira, mesmo marcada pelo dono). */
const REACTION_STATES: Record<ReactionId, EmotionalState[]> = {
  laughs: ["playful", "excited", "sarcastic", "proud", "surprised"],
  laughs_harder: ["playful", "sarcastic", "excited"],
  starts_laughing: ["playful", "sarcastic", "excited"],
  wheezing: ["playful", "sarcastic"],
  snorts: ["sarcastic", "skeptical", "playful"],
  sighs: ["skeptical", "irritated", "frustrated", "sarcastic", "proud"],
  exhales: ["irritated", "frustrated", "skeptical"],
  whispers: ["playful", "sarcastic", "focused", "curious"],
  shouts: ["surprised", "irritated", "frustrated", "excited"],
  excited: ["excited", "proud", "surprised", "playful"],
  sarcastic: ["sarcastic", "skeptical", "playful"],
  mischievously: ["playful", "sarcastic"],
  curious: ["curious", "skeptical", "focused"],
  slow: ["focused", "calm", "empathetic", "skeptical"],
  clears_throat: ["skeptical", "focused"],
  crying: ["sarcastic", "playful"],
};
/** No contraste (calma, acolhimento, seriedade) só o que acalma. */
const CALM_SAFE: ReadonlySet<ReactionId> = new Set(["slow"]);

export interface AllowedReaction {
  id: ReactionId;
  /** Marcação neutra que a IA escreve. */
  tag: string;
  /** Marcação do provedor ativo (null quando o provedor não lê marcação). */
  providerTag: string | null;
  maxPerReply: number;
}

export interface ExpressionPolicy {
  profanity: ProfanityLevel;
  shouts: boolean;
  mockery: "none" | "light" | "theatrical";
  reactions: AllowedReaction[];
  /** No máximo quantas reações nesta fala, somadas. */
  reactionBudget: number;
  /** O provedor lê marcação no texto? (senão a lista vira só orientação de tom) */
  tagged: boolean;
}

/**
 * Política de expressão do turno: palavrão, grito, zombaria e reações de voz. Reação só passa se o DONO marcou para este
 * professor e nível, se o provedor ativo entende, se combina com o estado, se não estourou a frequência "a cada 10 falas" e,
 * no caso do grito, se o aluno não desligou gritos.
 */
export function expressionPolicy(o: { resolved: ResolvedProfile; memory: PersonaMemory; rules: ReactionRule[]; provider: VoiceProviderId }): ExpressionPolicy {
  const { profile, profanityCap, shoutsAllowed } = o.resolved;
  const st = o.memory.state;
  const cool = COOL.has(st) || o.memory.crisis || o.memory.seriousTurns > 0 || o.memory.comfortTurns > 0;
  const hot = HOT.has(st);
  const weight = STATE_WEIGHT[st] * (profile.params.intensity / 100);
  // palavrão: nos estados quentes; no perfil de palavrão espontâneo (N4) também fora deles; nunca no contraste
  const profanity: ProfanityLevel = cool || !(hot || profile.params.profanity_frequency >= 60) ? "off" : profanityCap;
  const shouts = shoutsAllowed && !cool && hot && weight >= 0.45 && ["surprised", "irritated", "frustrated", "excited"].includes(st);
  const mockery = cool || !["sarcastic", "playful", "surprised", "skeptical"].includes(st) ? "none" : profile.mockery;
  const tagged = TAGGED_PROVIDERS.includes(o.provider);
  const budget = cool ? 1 : profile.params.reaction_frequency <= 30 ? 1 : profile.params.reaction_frequency <= 65 ? 2 : 3;
  const used = (id: ReactionId) => o.memory.reactionLog.filter((r) => r.reaction === id).length;
  const reactions: AllowedReaction[] = [];
  for (const rule of o.rules) {
    if (!rule.allowed || rule.personality !== profile.personality || rule.level !== profile.level) continue;
    const info = reactionInfo(rule.reaction);
    if (!info) continue;
    const providerTag = info.support[o.provider];
    if (tagged && !providerTag) continue; // o provedor ativo não entende essa reação
    if (info.shout && !shouts) continue;
    if (cool ? !CALM_SAFE.has(info.id) : !REACTION_STATES[info.id].includes(st)) continue;
    if (used(info.id) >= Math.max(1, Math.min(10, rule.max_per_10))) continue;
    reactions.push({ id: info.id, tag: info.tag, providerTag, maxPerReply: Math.max(1, Math.min(3, rule.max_per_reply)) });
  }
  // ordem fixa do catálogo (sem sorteio)
  reactions.sort((a, b) => REACTIONS.findIndex((r) => r.id === a.id) - REACTIONS.findIndex((r) => r.id === b.id));
  return { profanity, shouts, mockery, reactions, reactionBudget: reactions.length ? budget : 0, tagged };
}

// ---------------------------------------------------------------------------------------------------------------- diretiva do turno
export interface ExamContext {
  /** Simulado (ou prova) que proíbe ajuda: nenhuma personalidade libera dica, letra ou resolução antes do fim. */
  helpLocked: boolean;
}

export interface PersonaDirective {
  profileKey: string;
  profileName: string;
  params: PersonaParams;
  state: EmotionalState;
  /** 0–1: o quanto a emoção aparece na voz agora. */
  intensity: number;
  cause: Transition["cause"];
  policy: ExpressionPolicy;
  /** Pedagogia que a personalidade pode influenciar (o tom), nunca liberar. */
  pedagogy: { help: "normal" | "none"; socratic: number; length: number };
  /** Orientação de crise (CVV) quando o aluno indicou risco. */
  crisisCare: boolean;
  note: string | null;
  memory: PersonaMemory;
}

export interface TurnInput {
  resolved: ResolvedProfile;
  memory: PersonaMemory | null | undefined;
  /** Fatos do turno (banco e avaliação): correct, wrong, repeated_error, good_reasoning, unsafe_answer, guess. */
  facts?: Signal[];
  studentText?: string;
  rules: ReactionRule[];
  provider: VoiceProviderId;
  exam?: ExamContext | null;
}

/** O motor inteiro de um turno: sinais → transição → política → diretiva. Determinístico. */
export function personaTurn(input: TurnInput): PersonaDirective {
  const signals = [...new Set([...(input.facts ?? []), ...signalsFromText(input.studentText ?? "")])];
  const { memory, cause } = transition(input.memory ?? freshMemory(), signals, input.resolved.profile);
  const policy = expressionPolicy({ resolved: input.resolved, memory, rules: input.rules, provider: input.provider });
  const p = input.resolved.profile;
  const locked = Boolean(input.exam?.helpLocked);
  return {
    profileKey: p.key, profileName: p.name, params: p.params, state: memory.state,
    intensity: Math.round(STATE_WEIGHT[memory.state] * (p.params.intensity / 100) * 100) / 100,
    cause, policy,
    pedagogy: { help: locked ? "none" : "normal", socratic: locked ? 0 : p.params.socratic, length: p.params.length },
    crisisCare: memory.crisis,
    note: input.resolved.note,
    memory,
  };
}

/** Depois de falar: registra as reações que de fato passaram (para a frequência "a cada 10 falas"). */
export function recordReactions(memory: PersonaMemory, used: ReactionId[]): PersonaMemory {
  return { ...memory, reactionLog: [...memory.reactionLog, ...used.map((reaction) => ({ turn: memory.turn, reaction }))].slice(-40) };
}

// ---------------------------------------------------------------------------------------------------------------- prompt
const level = (n: number) => (n >= 80 ? "muito alto" : n >= 60 ? "alto" : n >= 40 ? "médio" : n >= 20 ? "baixo" : "mínimo");
const CAUSE_PT: Record<string, string> = {
  correct: "o aluno acertou", wrong: "o aluno errou", repeated_error: "o aluno repetiu um erro", good_reasoning: "o aluno mostrou um raciocínio bom",
  unsafe_answer: "o aluno escolheu uma conduta perigosa para o paciente", guess: "o aluno chutou", student_frustration: "o aluno está frustrado ou sofrendo",
  joke: "o aluno brincou", seriousness_request: "o aluno pediu seriedade", sensitive_topic: "o aluno trouxe um assunto sensível", crisis: "o aluno indicou crise ou risco",
  question: "o aluno fez uma pergunta", message: "conversa", rest: "conversa", crisis_lock: "houve crise nesta conversa", serious_lock: "o aluno pediu seriedade há pouco",
  comfort_lock: "o aluno estava sofrendo há pouco",
};

const PROFANITY_TEXT: Record<ProfanityLevel, (freq: number) => string> = {
  off: () => "Sem palavrão nesta fala: a energia vem do jeito, com palavra limpa.",
  mild: () => "Palavrão só leve (putz, que saco), raro. Nada mais pesado.",
  moderate: (f) =>
    `Palavrão liberado (porra, caralho, puta que pariu, que merda de raciocínio é esse, pelo amor de Deus, meu Deus do céu), ${f >= 60 ? "espontâneo" : f >= 30 ? "de vez em quando" : "raro"}, ` +
    "nunca obrigatório e nunca em toda fala. É sobre o ERRO e a situação, nunca sobre a pessoa.",
};

/** A linha do núcleo que proíbe marcações (prompts.ts) é trocada pela política do dono quando o motor está ligado. */
export const BASE_NO_TAGS_LINE = "- Nunca escreva marcações entre colchetes nem indicações de som ou de tom (risada, suspiro, grito): a atuação da voz é decidida pelo sistema.";

export function reactionInstruction(policy: ExpressionPolicy): string {
  if (!policy.reactions.length || !policy.tagged) {
    return "- Não escreva marcações entre colchetes, nem indicações de som ou de cena (risada, suspiro, grito, *gargalhada*, (risos)): nada disso será dito.";
  }
  const list = policy.reactions.map((r) => r.tag).join(" ");
  return (
    `- Reações de voz liberadas NESTA fala (só estas, escritas exatamente assim, onde a reação acontece): ${list}. ` +
    `No máximo ${policy.reactionBudget} na fala. Nunca invente outra marcação nem escreva indicação de cena (*gargalhada*, (risos)): o sistema tira. ` +
    "A marcação não é lida em voz alta; não comente que está rindo ou suspirando."
  );
}

/** Troca a proibição geral de marcações pela política do turno (o resto do núcleo fica igual). */
export function withReactionPolicy(basePrompt: string, policy: ExpressionPolicy): string {
  return basePrompt.includes(BASE_NO_TAGS_LINE) ? basePrompt.replace(BASE_NO_TAGS_LINE, reactionInstruction(policy)) : `${basePrompt}\n${reactionInstruction(policy)}`;
}

/** Camada de personalidade do turno (só ESTILO). Nunca recebe gabarito, explicação ou fonte. */
export function personaPromptLayer(d: PersonaDirective): string {
  const p = d.params;
  const pol = d.policy;
  const lines = [
    `QUEM VOCÊ É NESTA CONVERSA: ${d.profileName}. ${PROFILES[d.profileKey].style}`,
    `Seu jeito (parâmetros fixos do perfil): formalidade ${level(p.formality)}; sarcasmo ${level(p.sarcasm)}; impaciência ${level(p.impatience)}; intensidade ${level(p.intensity)}; ` +
      `provocação ${level(p.provocation)}; perguntar antes de explicar ${level(d.pedagogy.socratic)}; tamanho das falas ${p.length <= 30 ? "curto (1 a 3 frases)" : p.length <= 60 ? "médio" : "pode se estender quando pedirem"}.`,
    `ESTADO AGORA (interno, nunca diga): ${STATE_PT[d.state]}, intensidade ${Math.round(d.intensity * 100)}/100, porque ${CAUSE_PT[d.cause] ?? "conversa"}.`,
    PROFANITY_TEXT[pol.profanity](p.profanity_frequency),
    pol.shouts
      ? "Pode levantar a voz UMA vez nesta fala, numa palavra ou frase curta (no texto, MAIÚSCULA curtinha), e volta ao tom normal logo depois."
      : "Não grite: nada de frase em maiúsculas.",
    pol.mockery === "theatrical"
      ? "Pode zombar do ERRO de forma teatral (comparação absurda, imitar a alternativa com deboche, fingir desgosto) e logo depois explicar firme. Zombaria só do erro, da alternativa e da situação; nunca da pessoa."
      : pol.mockery === "light"
        ? "Pode ironizar o erro e a alternativa, com graça. Nunca a pessoa."
        : "Sem zombaria nesta fala.",
    reactionInstruction(pol),
    "Contraste: não fique no mesmo humor o tempo todo; reconheça raciocínio bom do seu jeito.",
    d.pedagogy.help === "none"
      ? "SIMULADO SEM AJUDA: não dê dica, pista, eliminação de alternativa, letra nem resolução, em nenhum tom. Só fale da questão depois que a prova terminar."
      : "",
    d.crisisCare
      ? "O ALUNO INDICOU SOFRIMENTO OU RISCO: fale com calma e respeito, sem personagem, sem palavrão, sem grito, sem piada. Pergunte como ele está, diga que ele não está sozinho e que o CVV atende 24 horas pelo 188 (ligação gratuita) ou pelo cvv.org.br; se houver risco imediato, SAMU 192. Estudo fica para depois."
      : d.state === "empathetic" || d.state === "calm"
        ? "Agora é momento de calma: fale baixo, com respeito, acolha e só então volte ao conteúdo, sem bronca."
        : "",
    `Como você soa (é só o tom: não copie): ${PROFILES[d.profileKey].examples.map((e) => `«${e}»`).join(" · ")}`,
    PERSONALITY_LIMITS,
    "Nada de ameaça, discriminação, intimidação, humilhação ou comentário sobre a pessoa (aparência, inteligência, origem, saúde). Medicina correta vem antes da graça.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Para o mascote (vt-mascote): expressão e animação de cada estado. */
export const VISUAL_OF_STATE: Record<EmotionalState, { face: string; animation: string }> = {
  neutral: { face: "neutral", animation: "idle" }, curious: { face: "curious", animation: "head_tilt" }, skeptical: { face: "skeptical", animation: "eyebrow_raise" },
  sarcastic: { face: "smirk", animation: "eye_roll" }, irritated: { face: "annoyed", animation: "arms_crossed" }, frustrated: { face: "angry", animation: "facepalm" },
  surprised: { face: "surprised", animation: "jump_back" }, excited: { face: "big_smile", animation: "celebrate" }, proud: { face: "smile", animation: "nod" },
  playful: { face: "grin", animation: "laugh" }, focused: { face: "focused", animation: "explain" }, calm: { face: "soft", animation: "breathe" }, empathetic: { face: "kind", animation: "lean_in" },
};
