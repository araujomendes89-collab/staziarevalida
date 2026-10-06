/**
 * Simulação do Tutor para desenvolvimento local (sem chave de IA). Não é IA e se identifica em toda resposta.
 * Só existe com o banco de desenvolvimento: nunca roda em produção nem grava no projeto real.
 */
import type { StructuredRequest } from "../contentHub/ai/provider";
import { NO_EVALUATION, type TutorEvaluation, type TutorOutput } from "./prompts";

export function tutorMockRespond(req: StructuredRequest): TutorOutput | TutorEvaluation {
  if (req.schemaName === "staziamed_tutor_eval") return { ...NO_EVALUATION, error_type: "unknown", reasoning_quality: "na", recommended_action: "socratic_question" };
  const task = req.input.split("<tarefa>")[1] ?? "";
  const hint = task.match(/\(ajuda (\d) de 5\)/);
  const reveals = hint?.[1] === "5";
  const reply = hint
    ? `[Simulação: não é IA] Esta seria a ajuda ${hint[1]} de 5.${reveals ? " Aqui o tutor de verdade explicaria a resposta." : " Releia o enunciado e separe o dado que mais pesa."}`
    : /ERROU/.test(task)
      ? "[Simulação: não é IA] Você errou esta. Um tutor de verdade mostraria onde o raciocínio desviou e qual pista faltou."
      : /ACERTOU/.test(task)
        ? "[Simulação: não é IA] Correto. Um tutor de verdade apontaria o que foi decisivo no seu raciocínio."
        : "[Simulação: não é IA] O tutor de verdade responderia aqui, com base na questão oficial e nas fontes conferidas. O que você já sabe sobre o tema?";
  const evaluation = { ...NO_EVALUATION, ...(/ERROU/.test(task) ? { error_type: "unknown" as const, knowledge_gap: "simulação", reasoning_quality: "na" as const, recommended_action: "socratic_question" as const } : {}) };
  return { reply, grounding: "GENERAL", citations: [], evaluation, justification: /A explicação mostra que sabia/.test(task) ? "INSUFFICIENT" : "NONE", reveals_answer: reveals, suggested_replies: hint ? [] : ["Não sei por onde começar", "Me dá uma dica"] };
}
