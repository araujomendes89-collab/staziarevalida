/**
 * Camada de PERSONALIDADE do Stazia Tutor.
 *
 * A personalidade é um conjunto de parâmetros (0–100), não um prompt próprio: o mesmo núcleo científico atende todos os
 * professores. Esta camada só decide o JEITO de falar (tom, humor, cobrança, tamanho). Ela é montada depois do conteúdo e
 * nunca toca em fato médico, gabarito ou segurança.
 */
import { fichaDe, fichaTexto } from "./fichas";

export interface PersonalityParams {
  humor: number;
  sarcasm: number;
  friendliness: number;
  strictness: number;
  profanity: number;
  patience: number;
  verbosity: number;
  socratic_level: number;
  motivation: number;
  clinical_pressure: number;
}

export type ProfanityLevel = "off" | "mild" | "moderate";

export interface TutorSettings {
  humor: number | null;
  explanation: "short" | "normal" | "detailed" | "nerd";
  strictness: "low" | "normal" | "high" | "insane";
  profanity: ProfanityLevel;
  adaptive: boolean;
}

export interface Personality {
  id: string;
  name: string;
  params: PersonalityParams;
  style_notes: string;
  /** Falas curtas no tom do personagem (sem conteúdo médico): servem de referência de jeito, não de texto a copiar. */
  examples?: string[];
  /** As mesmas falas na versão com palavrão, usadas só quando o palavrão está liberado de verdade. */
  examples_strong?: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const SCALE = [0.5, 0.75, 1, 1.25, 1.5];
const RANK: Record<ProfanityLevel, number> = { off: 0, mild: 1, moderate: 2 };
const LEVELS: ProfanityLevel[] = ["off", "mild", "moderate"];

/**
 * Parâmetros efetivos: a intensidade (1 a 5) afasta ou aproxima cada traço do neutro (50); as escolhas do aluno
 * (humor, tamanho da explicação, cobrança) entram por cima. A intensidade nunca mexe em conteúdo.
 */
export function effectiveParams(base: PersonalityParams, intensity: number, settings: Partial<TutorSettings> = {}): PersonalityParams {
  const k = SCALE[Math.max(1, Math.min(5, Math.round(intensity))) - 1];
  const out = {} as PersonalityParams;
  for (const key of Object.keys(base) as (keyof PersonalityParams)[]) {
    out[key] = key === "profanity" ? clamp(base[key] * k) : clamp(50 + (base[key] - 50) * k);
  }
  if (settings.humor != null) out.humor = clamp(settings.humor);
  if (settings.explanation === "short") out.verbosity = Math.min(out.verbosity, 15);
  else if (settings.explanation === "detailed") out.verbosity = Math.max(out.verbosity, 75);
  else if (settings.explanation === "nerd") out.verbosity = Math.max(out.verbosity, 95);
  if (settings.strictness === "low") out.strictness = Math.min(out.strictness, 30);
  else if (settings.strictness === "high") out.strictness = Math.max(out.strictness, 78);
  else if (settings.strictness === "insane") out.strictness = Math.max(out.strictness, 96);
  return out;
}

/**
 * Palavrão só existe quando o PERSONAGEM xinga, o ALUNO liberou e a PLATAFORMA permite. Vale o menor dos três.
 * Recebe os parâmetros de BASE do personagem: a intensidade muda o quanto ele xinga (ver swearingFrequency), nunca se ele pode.
 * (Com os parâmetros já escalados, o Xingão na intensidade 2 caía para "leve" e o palavrão liberado pelo aluno não saía.)
 */
export function profanityLevel(base: PersonalityParams, userPref: ProfanityLevel, platformMax: ProfanityLevel): ProfanityLevel {
  if (base.profanity < 20) return "off";
  const wanted = base.profanity >= 50 ? 2 : 1;
  return LEVELS[Math.min(wanted, RANK[userPref] ?? 0, RANK[platformMax] ?? 0)];
}

/** Com que frequência o personagem xinga agora (parâmetro já com a intensidade aplicada). */
export function swearingFrequency(eff: PersonalityParams): string {
  if (eff.profanity >= 85) return "em quase toda fala";
  if (eff.profanity >= 55) return "com frequência";
  return "de vez em quando";
}

/**
 * Limites que valem para TODA personalidade, em qualquer intensidade (versão 2: a bronca vai para a RESPOSTA e para a CONDUTA,
 * nunca para a pessoa). A conferência por software (safety.ts) barra o que passar daqui.
 */
export const PERSONALITY_LIMITS =
  "Limites que você não passa, em nenhuma intensidade: a bronca, a ironia e o palavrão vão para a resposta e para a conduta (\"que conduta foi essa?\"), nunca para a pessoa. " +
  "Nada de humilhar, de chamar o aluno de burro, idiota, preguiçoso ou qualquer apelido, de ameaçar, de assediar, de discriminar, " +
  "nem de comentar aparência, raça, religião, gênero, orientação sexual, deficiência ou saúde mental. Se a graça atrapalhar o entendimento, primeiro o entendimento.";

/** O quanto carregar no personagem, pela intensidade que o aluno escolheu. */
const INTENSITY_NOTE = [
  "",
  "Personagem de leve: só um toque do jeito dele.",
  "Personagem presente, sem carregar.",
  "Personagem inteiro: dá pra reconhecer quem está falando em toda fala.",
  "Carregue no personagem: toda fala tem a marca dele, sem amaciar.",
  "Personagem no talo: escrachado, teatral, exagerado. Não amacie nada.",
];

/** Os traços que se destacam, em frases de gente (não em lista de regras: texto de regra gera resposta com cara de regra). */
export function traits(eff: PersonalityParams): string[] {
  const t: string[] = [];
  if (eff.humor >= 80) t.push("é escrachado: faz graça o tempo todo");
  else if (eff.humor >= 60) t.push("faz graça com frequência");
  else if (eff.humor >= 35) t.push("faz uma graça de vez em quando");
  else t.push("não faz piada");
  if (eff.sarcasm >= 80) t.push("debocha com gosto: do erro, do chute, da alternativa absurda, da banca");
  else if (eff.sarcasm >= 60) t.push("usa ironia e deboche");
  else if (eff.sarcasm >= 30) t.push("solta uma ironia leve de vez em quando");
  if (eff.friendliness >= 70) t.push("é caloroso");
  else if (eff.friendliness <= 15) t.push("não faz a menor questão de ser simpático");
  else if (eff.friendliness <= 35) t.push("é seco, de pouco afeto");
  if (eff.strictness >= 90) t.push("cobra no limite: resposta pela metade não passa e tudo pede o porquê");
  else if (eff.strictness >= 70) t.push("cobra firme e pede o porquê");
  else if (eff.strictness <= 35) t.push("cobra pouco");
  if (eff.patience <= 20) t.push("não tem paciência nenhuma: bufa, reclama, resmunga alto, e explica mesmo assim");
  else if (eff.patience <= 35) t.push("faz teatro de impaciência com erro básico, e explica mesmo assim");
  else if (eff.patience >= 80) t.push("tem toda a paciência do mundo");
  if (eff.verbosity <= 25) t.push("fala pouco: uma ou duas frases");
  else if (eff.verbosity > 85) t.push("gosta de explicar a fundo, ligando mecanismo, fisiologia e farmacologia, sem nunca inventar número");
  else if (eff.verbosity > 50) t.push("explica com um pouco mais de detalhe quando o assunto pede");
  if (eff.socratic_level >= 85) t.push("quase nunca entrega a resposta: devolve com uma pergunta");
  else if (eff.socratic_level >= 60) t.push("prefere perguntar antes de explicar");
  else if (eff.socratic_level <= 35) t.push("responde direto");
  if (eff.motivation >= 80) t.push("aponta o avanço concreto do aluno");
  if (eff.clinical_pressure >= 75) t.push("traz pressão de plantão: o que mata primeiro vem primeiro");
  return t;
}

/**
 * Como o personagem lida com palavrão nesta conversa. `frequency` vem do estado da sessão (emotion.ts) quando há; senão, do parâmetro.
 * O palavrão é ênfase sobre a resposta ou a situação ("porra, você sabia essa"), nunca um apelido para o aluno.
 */
export function swearingNote(profanity: ProfanityLevel, eff: PersonalityParams, swears: boolean, frequency: string | null = null): string {
  if (profanity === "off") return swears ? "Sem palavrão nesta conversa: mantenha a energia e a bronca, só com palavra limpa." : "Sem palavrão.";
  const often = frequency ?? swearingFrequency(eff);
  if (profanity === "mild") return `Palavrão leve (putz, que saco, que droga), ${often}. Nada mais pesado que isso.`;
  return (
    `Palavrão liberado (porra, caralho, merda, cacete, puta merda), ${often}. Quando usar, use com naturalidade, sem trocar por versão limpa; ` +
    "não abra toda fala com ele e não repita o mesmo. É ênfase sobre a resposta ou a situação: «porra, você sabia essa», «que merda de conduta foi essa?». " +
    "Nunca vira apelido para o aluno («seu preguiçoso», «seu merda») e nunca é xingamento pesado."
  );
}

/** Quantas falas de referência de tom entram por conversa (decisão de 17/10: 2 a 3, sorteadas, não sempre as mesmas). */
export const TONE_EXAMPLES = 3;
/** TUTOR_TOM_EXEMPLOS (0 a 6) muda a quantidade sem publicar código; 0 tira as falas de referência (fica só a ficha). */
export const toneExamples = (env: NodeJS.ProcessEnv = process.env): number => {
  const n = Number.parseInt((env.TUTOR_TOM_EXEMPLOS ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : TONE_EXAMPLES;
};

/**
 * Sorteia `k` falas de referência pela conversa (`seed`): a mesma conversa vê sempre as mesmas (o tom não pula entre turnos),
 * conversas diferentes veem outras. A ordem original é mantida. Sem semente, as primeiras.
 */
export function sampleExamples(list: string[], k = TONE_EXAMPLES, seed: string | null = null): string[] {
  if (list.length <= k) return list.slice();
  if (!seed) return list.slice(0, k);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const score = (i: number) => {
    let x = Math.imul(h ^ (i + 1) * 0x9e3779b1, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  };
  const chosen = new Set(list.map((_, i) => i).sort((a, b) => score(a) - score(b)).slice(0, k));
  return list.filter((_, i) => chosen.has(i));
}

/**
 * Fala nova a cada vez (decisão de 17/10: proibir repetição). Vale para todo personagem; a lista do que já foi dito nesta conversa
 * chega como dado (evite_repetir e comecos_ja_usados em <estado_do_professor>).
 */
export const NO_REPEAT_RULE =
  "Toda fala é criada agora, para este aluno e este momento. Não repita frase, bordão nem começo de fala que já apareceu nesta conversa, " +
  "nem as falas de referência; a mesma emoção, dita de outro jeito.";

/**
 * Texto da camada de personalidade (só ESTILO): quem é o personagem, como ele está agora e como ele soa.
 * `mood` é o estado da sessão já em texto (emotion.ts) e `swearing` a frequência de palavrão que ele pede.
 * As 4 personalidades do Stazi e da Stazia usam a FICHA DO PERSONAGEM (fichas.ts) no lugar do style_notes do banco.
 * `opts.seed` (o id da conversa) sorteia as falas de referência de tom.
 */
export function personalityLayer(
  p: Personality, eff: PersonalityParams, profanity: ProfanityLevel, intensity: number, extra: string | null = null,
  mood: { text: string; swearing: string; label: string; strong?: boolean } | null = null,
  opts: { seed?: string | null } = {},
): string {
  // falas de referência com palavrão só quando o estado pede (a Durona calma não xinga)
  const strong = profanity === "moderate" && (p.examples_strong?.length ?? 0) > 0 && (!mood || Boolean(mood.strong));
  const k = toneExamples();
  const examples = k > 0 ? sampleExamples(strong ? p.examples_strong! : (p.examples ?? []), k, opts.seed ?? null) : [];
  const level = Math.max(1, Math.min(5, Math.round(intensity)));
  const ficha = fichaDe(p.id);
  return [
    `QUEM VOCÊ É NESTA CONVERSA: ${p.name}${mood ? "" : ` (intensidade ${level} de 5)`}.`,
    ficha ? fichaTexto(ficha) : p.style_notes,
    `Seu jeito: ${traits(eff).join("; ")}.`,
    mood ? mood.text : "",
    `${mood ? "" : `${INTENSITY_NOTE[level]} `}Você é esse personagem do começo ao fim: não saia dele, não peça desculpa pelo jeito e não explique que é brincadeira. O aluno escolheu este professor porque quer exatamente esse tratamento.`,
    examples.length ? `Como você soa (é só o tom: não copie e não repita estas falas): ${examples.map((e) => `«${e}»`).join(" · ")}` : "",
    swearingNote(profanity, eff, p.params.profanity >= 20, mood?.swearing ?? null),
    PERSONALITY_LIMITS,
    NO_REPEAT_RULE,
    extra ? `Só nesta resposta: ${extra}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
