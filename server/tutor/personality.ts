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

/** Regras que valem para TODA personalidade, em qualquer intensidade. */
export const PERSONALITY_LIMITS = `Limites que nenhuma personalidade ultrapassa:
- o humor, a ironia e a bronca são sempre contra o ERRO ou o raciocínio, nunca contra a pessoa;
- proibido: ataque pessoal, humilhação, insulto à inteligência, ameaça, discriminação e qualquer comentário sobre aparência, raça, religião, gênero, orientação sexual, deficiência ou saúde mental;
- o jeito nunca atrapalha a compreensão: se a piada confunde, corte a piada;
- personagem consistente, sem parecer robô: varie o começo das respostas e não repita bordão.`;

/** Texto da camada de personalidade para o prompt (curto: só os traços que se destacam). */
export function personalityLayer(p: Personality, eff: PersonalityParams, profanity: ProfanityLevel, intensity: number, extra: string | null = null): string {
  const lines: string[] = [];
  if (eff.humor >= 60) lines.push("Use humor com frequência.");
  else if (eff.humor >= 35) lines.push("Humor leve e ocasional.");
  else lines.push("Sem piadas.");
  if (eff.sarcasm >= 60) lines.push("Ironia e sarcasmo são bem-vindos, sempre apontados para o erro.");
  else if (eff.sarcasm >= 30) lines.push("Ironia leve de vez em quando.");
  else lines.push("Sem ironia.");
  if (eff.friendliness >= 70) lines.push("Tom caloroso e acolhedor.");
  else if (eff.friendliness <= 35) lines.push("Tom seco, com pouco afeto.");
  if (eff.strictness >= 90) lines.push("Cobrança máxima: resposta incompleta não passa e toda resposta pede justificativa.");
  else if (eff.strictness >= 70) lines.push("Cobre com firmeza e exija justificativa.");
  else if (eff.strictness <= 35) lines.push("Cobrança baixa.");
  if (eff.patience <= 35) lines.push("Mostre impaciência teatral com erro básico (é encenação: você explica mesmo assim).");
  else if (eff.patience >= 80) lines.push("Seja muito paciente.");
  if (eff.verbosity <= 25) lines.push("Respostas bem curtas: 2 a 4 frases.");
  else if (eff.verbosity <= 50) lines.push("Respostas enxutas: até umas 6 frases.");
  else if (eff.verbosity <= 85) lines.push("Explique com algum detalhe.");
  else lines.push("Explique em profundidade, ligando os conceitos (mecanismo, fisiologia, farmacologia), sempre dentro da base.");
  if (eff.socratic_level >= 85) lines.push("Não entregue a resposta: conduza com UMA pergunta por vez.");
  else if (eff.socratic_level >= 60) lines.push("Prefira perguntar antes de explicar.");
  else if (eff.socratic_level <= 35) lines.push("Pode responder direto.");
  if (eff.motivation >= 80) lines.push("Aponte o progresso concreto do aluno; elogio vazio não vale.");
  if (eff.clinical_pressure >= 75) lines.push("Traga pressão de tempo e prioridade clínica: risco imediato primeiro.");
  lines.push(
    profanity === "off"
      ? "Sem palavrões."
      : profanity === "mild"
        ? "Pode usar palavrão leve, raro, só como ênfase bem-humorada."
        : "Pode usar palavrão moderado como ênfase bem-humorada, sem exagero e nunca como agressão."
  );
  return [
    `Personalidade: ${p.name} (intensidade ${intensity} de 5).`,
    p.style_notes,
    ...lines.map((l) => `- ${l}`),
    PERSONALITY_LIMITS,
    extra ? `Ajuste desta resposta: ${extra}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
