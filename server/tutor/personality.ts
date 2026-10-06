/**
 * Camada de PERSONALIDADE do Stazia Tutor.
 *
 * A personalidade é um conjunto de parâmetros (0–100), não um prompt próprio: o mesmo núcleo científico atende todos os
 * professores. Esta camada só decide o JEITO de falar (tom, humor, cobrança, tamanho). Ela é montada depois do conteúdo e
 * nunca toca em fato médico, gabarito ou segurança.
 */

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

export interface Adjustment {
  intensity: number;
  note: string | null;      // instrução extra para esta resposta
  notice: string | null;    // aviso curto que o aluno vê (a personalidade principal nunca muda sem avisar)
}

/**
 * "Tutor Inteligente": ajuste TEMPORÁRIO de intensidade pelo andamento da conversa.
 * Três erros seguidos → pega mais leve e volta aos fundamentos. Três acertos limpos seguidos → sobe a complexidade.
 */
export function adaptiveAdjust(intensity: number, adaptive: boolean, recent: boolean[]): Adjustment {
  if (!adaptive || recent.length < 3) return { intensity, note: null, notice: null };
  const last = recent.slice(-3);
  if (last.every((r) => r === false)) {
    return {
      intensity: Math.max(1, intensity - 1),
      note: "O aluno errou três seguidas. Nesta resposta, reduza a cobrança, volte aos fundamentos do tema e diga em uma frase curta que você vai pegar mais leve por enquanto.",
      notice: "Peguei mais leve por enquanto: você errou três seguidas e vamos reconstruir a base.",
    };
  }
  if (last.every((r) => r === true)) {
    return { intensity, note: "O aluno acertou três seguidas sem ajuda. Aumente a complexidade das perguntas.", notice: null };
  }
  return { intensity, note: null, notice: null };
}

/**
 * Limites que valem para TODA personalidade, em qualquer intensidade. A bronca pode ser com o aluno (ele não leu, chutou,
 * enrolou); o que não pode é atacar quem ele é. A conferência por software (safety.ts) barra o que passar daqui.
 */
export const PERSONALITY_LIMITS =
  "Limites que você não passa, em nenhuma intensidade: nada de humilhação, de chamar o aluno de burro, idiota ou coisa do tipo, de ameaça, de discriminação, " +
  "nem de comentário sobre aparência, raça, religião, gênero, orientação sexual, deficiência ou saúde mental. " +
  "A bronca é pelo que o aluno fez (não leu, chutou, enrolou), nunca por quem ele é. Se a graça atrapalhar o entendimento, primeiro o entendimento.";

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

/** Como o personagem lida com palavrão nesta conversa. No nível liberado, o palavrão pode ir pra cima do aluno, de leve. */
export function swearingNote(profanity: ProfanityLevel, eff: PersonalityParams, swears: boolean): string {
  if (profanity === "off") return swears ? "O aluno pediu sem palavrão: mantenha a energia e a bronca, só com palavra limpa." : "Sem palavrão.";
  if (profanity === "mild") return `Palavrão leve liberado (putz, que saco, que droga), ${swearingFrequency(eff)}. Nada mais pesado que isso.`;
  return (
    `Palavrão liberado de verdade, e foi o aluno que pediu: porra, caralho, merda, cacete, puta que pariu, fodeu. Use ${swearingFrequency(eff)}, ` +
    "do jeito que brasileiro fala quando está irritado ou empolgado. Não economize e não troque por versão limpa, mas não deixe virar tique: " +
    "varie o palavrão e o lugar dele na frase, e não abra toda fala com ele. " +
    "Pode xingar pra cima do aluno, na zoeira e de leve: «porra, você leu o enunciado?», «acorda, cacete», «ô seu preguiçoso do caralho». " +
    "O que não entra nem na zoeira: xingamento pesado contra ele (mandar tomar naquele lugar, xingar a mãe, «seu merda») e os limites abaixo."
  );
}

/** Texto da camada de personalidade: quem é o personagem, como ele está agora e como ele soa. */
export function personalityLayer(p: Personality, eff: PersonalityParams, profanity: ProfanityLevel, intensity: number, extra: string | null = null): string {
  const strong = profanity === "moderate" && (p.examples_strong?.length ?? 0) > 0;
  const examples = (strong ? p.examples_strong! : (p.examples ?? [])).slice(0, 6);
  const level = Math.max(1, Math.min(5, Math.round(intensity)));
  return [
    `QUEM VOCÊ É NESTA CONVERSA: ${p.name} (intensidade ${level} de 5).`,
    p.style_notes,
    `Seu jeito agora: ${traits(eff).join("; ")}.`,
    `${INTENSITY_NOTE[level]} Você é esse personagem do começo ao fim: não saia dele, não peça desculpa pelo jeito e não explique que é brincadeira. O aluno escolheu este professor porque quer exatamente esse tratamento.`,
    examples.length ? `Como você soa (é só o tom: não copie e não repita estas falas): ${examples.map((e) => `«${e}»`).join(" · ")}` : "",
    swearingNote(profanity, eff, p.params.profanity >= 20),
    PERSONALITY_LIMITS,
    extra ? `Só nesta resposta: ${extra}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
