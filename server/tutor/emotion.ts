/**
 * EMOTION ENGINE do Stazia Tutor: o estado interno da sessão (0–100). Não é uma personalidade nova: é o humor do MESMO professor
 * naquela conversa, e ele se manifesta do jeito de cada um (o Acolhedor nunca xinga; a Durona sobe o tom). O aluno não vê números.
 *
 * Eventos vêm de fatos (o banco corrigiu a resposta; o mesmo tipo de erro se repetiu) e da avaliação silenciosa do raciocínio.
 */
export interface Emotion {
  frustration: number;
  engagement: number;
  patience: number;
  enthusiasm: number;
}

export type EmotionLabel = "CALMO" | "ENGAJADO" | "IMPACIENTE" | "IRRITADO" | "ORGULHOSO";

export type EmotionEvent =
  | "serious_attempt"     // o aluno tentou de verdade
  | "correct"             // acertou
  | "correct_hard"        // acertou conceito difícil
  | "wrong"               // errou
  | "repeated_error"      // repetiu o mesmo tipo de erro
  | "random_answers"      // está chutando de novo e de novo
  | "self_correction"     // reconheceu e corrigiu o próprio erro
  | "asked_for_help";     // pediu ajuda

export const BASELINE: Emotion = { frustration: 15, engagement: 50, patience: 75, enthusiasm: 40 };

const DELTAS: Record<EmotionEvent, Partial<Emotion>> = {
  serious_attempt: { frustration: -5, engagement: 5 },
  correct: { enthusiasm: 5, frustration: -5, engagement: 5 },
  correct_hard: { enthusiasm: 15, frustration: -10, engagement: 5 },
  wrong: { frustration: 5, patience: -3 },
  repeated_error: { frustration: 15, patience: -10 },
  random_answers: { frustration: 20, patience: -15, engagement: -5 },
  self_correction: { enthusiasm: 20, frustration: -10, patience: 5 },
  asked_for_help: { engagement: 3 },
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function normalize(e: Partial<Emotion> | null | undefined): Emotion {
  return {
    frustration: clamp(e?.frustration ?? BASELINE.frustration),
    engagement: clamp(e?.engagement ?? BASELINE.engagement),
    patience: clamp(e?.patience ?? BASELINE.patience),
    enthusiasm: clamp(e?.enthusiasm ?? BASELINE.enthusiasm),
  };
}

/** Aplica os eventos e, a cada turno, puxa tudo um pouco de volta para o normal (o humor passa). */
export function applyEvents(current: Partial<Emotion> | null | undefined, events: EmotionEvent[]): Emotion {
  const e = normalize(current);
  for (const key of Object.keys(e) as (keyof Emotion)[]) e[key] = e[key] + (BASELINE[key] - e[key]) * 0.1;
  for (const ev of events) for (const [k, d] of Object.entries(DELTAS[ev])) e[k as keyof Emotion] += d as number;
  return normalize(e);
}

export function emotionLabel(e: Emotion): EmotionLabel {
  if (e.frustration >= 70 || e.patience <= 20) return "IRRITADO";
  if (e.frustration >= 45 || e.patience <= 40) return "IMPACIENTE";
  if (e.enthusiasm >= 70) return "ORGULHOSO";
  if (e.engagement >= 60 || e.enthusiasm >= 55) return "ENGAJADO";
  return "CALMO";
}

/** Como o estado aparece em cada professor. Só tom: nunca muda conteúdo, gabarito ou fonte. */
const MANIFEST: Record<string, Record<EmotionLabel, string>> = {
  acolhedor: {
    CALMO: "Você está tranquilo.",
    ENGAJADO: "Você está animado com o andamento: mostre isso com calor, sem exagero.",
    IMPACIENTE: "O aluno está tropeçando no mesmo ponto. Continue gentil, mas seja claro: isole exatamente onde está a confusão.",
    IRRITADO: "O aluno está caindo de novo no mesmo detalhe. Sem perder a gentileza, diga isso com franqueza e proponha um caminho menor, passo a passo.",
    ORGULHOSO: "O aluno acabou de fazer algo bom. Reconheça com sinceridade, dizendo o quê.",
  },
  direto: {
    CALMO: "Você está neutro e focado.",
    ENGAJADO: "O ritmo está bom: mantenha a pressão e suba a dificuldade.",
    IMPACIENTE: "O aluno está repetindo o erro. Aponte isso em uma frase seca e mande refazer.",
    IRRITADO: "É o mesmo erro de novo. Diga sem rodeio qual é o erro e o que ele está ignorando (o comando, a prioridade, o dado).",
    ORGULHOSO: "Bom trabalho. Reconheça em poucas palavras e siga.",
  },
  durona: {
    CALMO: "Você está de boa: provoca de leve, ironia fina, sem gritar e sem palavrão.",
    ENGAJADO: "Você está curtindo o ritmo: pode provocar mais e soltar uma graça.",
    IMPACIENTE: "O aluno está vacilando: suba o tom, cobre, faça ironia com a resposta. Um palavrão aqui e ali, se encaixar.",
    IRRITADO: "O aluno repetiu o erro ou está chutando: bronca de verdade na resposta e na conduta, escrachada. Palavrão liberado, sem exagero e nunca contra a pessoa.",
    ORGULHOSO: "O aluno mandou bem: comemore do seu jeito escrachado, pode ser com palavrão de alegria.",
  },
};

export function emotionLayer(personaId: string, e: Emotion): string {
  const label = emotionLabel(e);
  const table = MANIFEST[personaId] ?? MANIFEST.direto;
  return `ESTADO NESTA SESSÃO: ${label}. ${table[label]}`;
}

/** Quantas vezes, no máximo, o palavrão aparece agora (a Durona não começa xingando; sobe com o contexto). */
export function swearingByEmotion(e: Emotion): string {
  switch (emotionLabel(e)) {
    case "IRRITADO":
      return "à vontade, como ênfase da bronca";
    case "IMPACIENTE":
      return "de vez em quando, se encaixar";
    case "ORGULHOSO":
      return "só pra comemorar, se encaixar";
    default:
      return "quase nunca: no máximo um, e só se encaixar muito bem";
  }
}
