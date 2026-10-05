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

/** Palavrão só existe quando o PERSONAGEM xinga, o ALUNO liberou e a PLATAFORMA permite. Vale o menor dos três. */
export function profanityLevel(params: PersonalityParams, userPref: ProfanityLevel, platformMax: ProfanityLevel): ProfanityLevel {
  if (params.profanity < 20) return "off";
  const wanted = params.profanity >= 50 ? 2 : 1;
  return LEVELS[Math.min(wanted, RANK[userPref] ?? 0, RANK[platformMax] ?? 0)];
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

/** Limites que valem para TODA personalidade, em qualquer intensidade. */
export const PERSONALITY_LIMITS =
  "Limites que você não passa, em nenhuma intensidade: a graça, a ironia e a bronca são contra o erro, nunca contra a pessoa. " +
  "Nada de humilhação, insulto à inteligência, ameaça, discriminação ou comentário sobre aparência, raça, religião, gênero, orientação sexual, deficiência ou saúde mental. " +
  "Se a piada atrapalha o entendimento, corta a piada.";

/** Os traços que se destacam, em frases de gente (não em lista de regras: texto de regra gera resposta com cara de regra). */
export function traits(eff: PersonalityParams): string[] {
  const t: string[] = [];
  if (eff.humor >= 60) t.push("faz graça com frequência");
  else if (eff.humor >= 35) t.push("faz uma graça de vez em quando");
  else t.push("não faz piada");
  if (eff.sarcasm >= 60) t.push("usa ironia, sempre apontada para o erro");
  else if (eff.sarcasm >= 30) t.push("solta uma ironia leve de vez em quando");
  if (eff.friendliness >= 70) t.push("é caloroso");
  else if (eff.friendliness <= 35) t.push("é seco, de pouco afeto");
  if (eff.strictness >= 90) t.push("cobra no limite: resposta pela metade não passa e tudo pede o porquê");
  else if (eff.strictness >= 70) t.push("cobra firme e pede o porquê");
  else if (eff.strictness <= 35) t.push("cobra pouco");
  if (eff.patience <= 35) t.push("faz teatro de impaciência com erro básico, e explica mesmo assim");
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

/** Texto da camada de personalidade: quem é o personagem, como ele está agora e como ele soa. */
export function personalityLayer(p: Personality, eff: PersonalityParams, profanity: ProfanityLevel, intensity: number, extra: string | null = null): string {
  const swearing =
    profanity === "off"
      ? "Sem palavrão."
      : profanity === "mild"
        ? "Palavrão leve pode, raro, só como ênfase de bom humor."
        : "Palavrão moderado pode, como ênfase de bom humor, sem exagero e nunca contra o aluno.";
  const examples = (p.examples ?? []).slice(0, 5);
  return [
    `QUEM VOCÊ É NESTA CONVERSA: ${p.name} (intensidade ${intensity} de 5).`,
    p.style_notes,
    `Seu jeito agora: ${traits(eff).join("; ")}.`,
    examples.length ? `Como você soa (é só o tom: não copie e não repita estas falas): ${examples.map((e) => `«${e}»`).join(" · ")}` : "",
    swearing,
    PERSONALITY_LIMITS,
    extra ? `Só nesta resposta: ${extra}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
