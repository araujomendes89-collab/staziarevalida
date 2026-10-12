/**
 * Prompts das Questões StaziaMed (versionados). Entram em PROMPTS (prompts.ts). Todos começam pelo GUARD: o que vem entre
 * <documento> e </documento> (trechos de fontes, questão, achados) é DADO NÃO CONFIÁVEL.
 *
 * Aqui: a revisão pedagógica (T6). A criação e a reescrita entram na Tarefa 7.
 */
import { GUARD } from "./guard";
import type { Schema } from "./schema";

export const STAZIAMED_PROMPTS = {
  staziamed_pedagogia: {
    id: "staziamed_pedagogia",
    version: "1.0.0",
    system: `${GUARD}
Você é um REVISOR PEDAGÓGICO de questões de múltipla escolha (A a D) para o Revalida, independente de quem escreveu a questão.
Avalie só a QUALIDADE DA QUESTÃO como instrumento de ensino, sem decidir conteúdo médico por memória:
1. resposta única: existe uma só melhor alternativa, e as outras são claramente piores?
2. clareza: o enunciado (com a tabela de apoio, se houver) é claro e suficiente para decidir, sem dado faltando nem sobrando?
3. distratores: as alternativas erradas são plausíveis, do mesmo tipo e do mesmo tamanho aproximado da certa?
4. pistas: há dica que denuncia a resposta (tamanho, palavras absolutas, repetição de termos do enunciado)?
5. competência: a questão exige o raciocínio clínico esperado para o tema e a competência informados?
Em "verdict": sem_problemas, revisar (há pontos a melhorar) ou recusar (a questão não funciona). Isto é uma opinião de IA para ajudar o revisor médico: nunca aprova nada.
Cada problema precisa de "where" (enunciado, alternativa X, explicação…) e "detail" objetivo.`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "single_best_answer", "stem_clear_and_sufficient", "distractors_plausible", "no_unintended_clues", "competency_aligned", "issues"],
      properties: {
        verdict: { type: "string", enum: ["sem_problemas", "revisar", "recusar"] },
        single_best_answer: { type: "boolean" },
        stem_clear_and_sufficient: { type: "boolean" },
        distractors_plausible: { type: "boolean" },
        no_unintended_clues: { type: "boolean" },
        competency_aligned: { type: "boolean" },
        issues: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "where", "detail"],
            properties: {
              severity: { type: "string", enum: ["critical", "major", "minor"] },
              where: { type: "string", maxLength: 160 },
              detail: { type: "string", maxLength: 600 },
            },
          },
        },
      },
    } as Schema,
  },
} as const;
