/**
 * REAÇÕES DE VOZ do Tutor (riso, suspiro, grito…): catálogo único, usado pelo servidor (filtro) e pelo painel da Administração.
 *
 * Regra do dono (2026-10-15): "EU ESCOLHO". Quem decide quais reações cada professor (e cada nível da Durona Explosiva) pode usar,
 * e com que frequência máxima, é o dono, no painel. O servidor só deixa passar o que está marcado E o que o provedor de voz ativo
 * de fato entende; o resto é tirado do texto antes de virar voz. A IA nunca escolhe fora da lista.
 *
 * Só entram reações que a documentação oficial do provedor cita (pesquisa de 15/10/2026, docs/voice-tutor/01-diagnostico.md §12):
 *  - ElevenLabs (eleven_v3 / v4, também nos agentes): lista de "audio tags" da página de boas práticas de TTS + [shouts] e
 *    [clears throat] da central de ajuda + [slow] da página do Expressive Mode. Qualidade em português do Brasil: NÃO CONFIRMADA
 *    (nenhuma página trata) — por isso tudo nasce desmarcado e o dono ouve antes de marcar.
 *  - Gemini TTS: só <laugh> e <sigh> (colchetes angulares) entre as reações desta lista.
 *  - Gemini ao vivo (áudio nativo) e OpenAI Realtime/GPT-Live: NÃO aceitam marcações; a voz fala direto do modelo. Ali a reação
 *    não passa por filtro de texto (o modelo fala antes): a lista do dono vira só orientação no prompt. Limitação registrada.
 */

export type ReactionId =
  | "laughs" | "laughs_harder" | "starts_laughing" | "wheezing" | "snorts" | "sighs" | "exhales" | "whispers" | "shouts"
  | "excited" | "sarcastic" | "mischievously" | "curious" | "slow" | "clears_throat" | "crying";

export type VoiceProviderId = "elevenlabs" | "gemini_tts" | "gemini_live" | "openai_realtime";

export interface ReactionInfo {
  id: ReactionId;
  /** Nome em português para o painel. */
  label: string;
  /** O que a reação faz, em português simples. */
  hint: string;
  /** Marcação neutra que a IA escreve no texto (o filtro troca pela do provedor). */
  tag: string;
  /** É grito: obedece também ao "desligar gritos" do aluno. */
  shout?: boolean;
  /** Marcação de cada provedor; null = o provedor não entende essa reação. */
  support: Record<VoiceProviderId, string | null>;
  /** De onde vem a confirmação de que o provedor entende. */
  source: string;
}

const EL_BEST = "ElevenLabs — boas práticas de TTS (lista de audio tags v3/v4)";
const EL_HELP = "ElevenLabs — central de ajuda (audio tags no v3 e no v4)";
const EL_EXPR = "ElevenLabs — Expressive Mode dos agentes";
const el = (tag: string, gemini: string | null = null) => ({ elevenlabs: tag, gemini_tts: gemini, gemini_live: null, openai_realtime: null });

export const REACTIONS: ReactionInfo[] = [
  { id: "laughs", label: "Risada", hint: "ri de verdade, curto", tag: "[laughs]", support: el("[laughs]", "<laugh>"), source: `${EL_BEST}; Gemini TTS <laugh>` },
  { id: "laughs_harder", label: "Gargalhada", hint: "ri mais alto, de deboche ou de alegria", tag: "[laughs harder]", support: el("[laughs harder]"), source: EL_BEST },
  { id: "starts_laughing", label: "Começa a rir", hint: "a risada escapa no meio da frase", tag: "[starts laughing]", support: el("[starts laughing]"), source: EL_BEST },
  { id: "wheezing", label: "Riso sem ar", hint: "ri até perder o fôlego (teatral)", tag: "[wheezing]", support: el("[wheezing]"), source: EL_BEST },
  { id: "snorts", label: "Bufada de riso", hint: "riso pelo nariz, de deboche", tag: "[snorts]", support: el("[snorts]"), source: EL_BEST },
  { id: "sighs", label: "Suspiro", hint: "suspiro de impaciência ou de alívio", tag: "[sighs]", support: el("[sighs]", "<sigh>"), source: `${EL_BEST}; Gemini TTS <sigh>` },
  { id: "exhales", label: "Solta o ar", hint: "expira forte, cansaço teatral", tag: "[exhales]", support: el("[exhales]"), source: EL_BEST },
  { id: "whispers", label: "Sussurro", hint: "baixa a voz, tom de segredo ou de suspense", tag: "[whispers]", support: el("[whispers]"), source: `${EL_BEST}; ${EL_EXPR}` },
  { id: "shouts", label: "Grito", hint: "grito curto de surpresa ou indignação", tag: "[shouts]", shout: true, support: el("[shouts]"), source: EL_HELP },
  { id: "excited", label: "Empolgada", hint: "comemora com energia", tag: "[excited]", support: el("[excited]"), source: `${EL_BEST}; ${EL_EXPR}` },
  { id: "sarcastic", label: "Sarcástica", hint: "ironia na voz", tag: "[sarcastic]", support: el("[sarcastic]"), source: EL_BEST },
  { id: "mischievously", label: "Marota", hint: "provocação brincalhona", tag: "[mischievously]", support: el("[mischievously]"), source: EL_BEST },
  { id: "curious", label: "Curiosa", hint: "tom de quem quer entender o raciocínio", tag: "[curious]", support: el("[curious]"), source: EL_BEST },
  { id: "slow", label: "Devagar", hint: "fala mais devagar para frisar", tag: "[slow]", support: el("[slow]"), source: EL_EXPR },
  { id: "clears_throat", label: "Pigarro", hint: "limpa a garganta antes de corrigir", tag: "[clears throat]", support: el("[clears throat]"), source: EL_HELP },
  { id: "crying", label: "Choro fingido", hint: "choro teatral de desgosto com o erro", tag: "[crying]", support: el("[crying]"), source: EL_BEST },
];

export const REACTION_IDS = REACTIONS.map((r) => r.id);
export const reactionInfo = (id: string) => REACTIONS.find((r) => r.id === id) ?? null;

export const VOICE_PROVIDERS: { id: VoiceProviderId; label: string; note: string }[] = [
  { id: "elevenlabs", label: "ElevenLabs", note: "voz do professor e agentes de voz: entende as marcações" },
  { id: "gemini_tts", label: "Gemini (voz gerada)", note: "entende só risada e suspiro" },
  { id: "gemini_live", label: "Gemini ao vivo", note: "não usa marcações: a lista vira só orientação de tom" },
  { id: "openai_realtime", label: "OpenAI ao vivo", note: "não usa marcações: a lista vira só orientação de tom" },
];

/** Provedores que leem marcação no texto (os outros falam direto do modelo, sem filtro possível antes da fala). */
export const TAGGED_PROVIDERS: VoiceProviderId[] = ["elevenlabs", "gemini_tts"];

export type ProfileLevel = "padrao" | "n1" | "n2" | "n3" | "n4";
export type PublicPersonality = "tranquilo" | "direto" | "durona";

/**
 * Os perfis que o dono configura: Tranquilo/Tranquila, a Durona/o Durão e os 4 níveis da Explosiva. Cada regra vale para o par
 * (Durão e Durona usam as mesmas; Tranquilo e Tranquila também). O Direto saiu em 17/10/2026 e não aparece mais aqui.
 */
export const REACTION_PROFILES: { key: string; personality: PublicPersonality; level: ProfileLevel; label: string; note: string }[] = [
  { key: "tranquilo", personality: "tranquilo", level: "padrao", label: "Tranquilo / Tranquila", note: "calmos e socráticos" },
  { key: "durona", personality: "durona", level: "padrao", label: "Durona / Durão (como está hoje)", note: "a Durona e o Durão atuais, sem o modo Explosiva" },
  { key: "durona:n1", personality: "durona", level: "n1", label: "Explosiva · N1 Direta", note: "sem palavrão" },
  { key: "durona:n2", personality: "durona", level: "n2", label: "Explosiva · N2 Sarcástica", note: "ironia leve" },
  { key: "durona:n3", personality: "durona", level: "n3", label: "Explosiva · N3 Estressada", note: "palavrão ocasional; PADRÃO de quem escolhe a Durona ou o Durão (precisa da declaração de 18+ do Termo)" },
  { key: "durona:n4", personality: "durona", level: "n4", label: "Explosiva · N4 Explosiva", note: "teatral e ácida; o aluno escolhe (precisa da declaração de 18+ do Termo)" },
];
export const profileKey = (personality: string, level: string) => (level === "padrao" ? personality : `${personality}:${level}`);

/** Regra que o dono grava no painel (tabela tutor_voice_reaction_rules). Sem regra = não pode. */
export interface ReactionRule {
  personality: PublicPersonality;
  level: ProfileLevel;
  reaction: ReactionId;
  allowed: boolean;
  /** No máximo quantas vezes numa mesma fala (1 a 3). */
  max_per_reply: number;
  /** No máximo quantas vezes a cada 10 falas do professor (1 a 10). */
  max_per_10: number;
}

export const FREQUENCY_LIMITS = { per_reply: [1, 3], per_10: [1, 10] } as const;
export const DEFAULT_FREQUENCY = { max_per_reply: 1, max_per_10: 2 } as const;
