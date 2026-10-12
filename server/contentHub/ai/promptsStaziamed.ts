/**
 * Prompts das Questões StaziaMed (versionados). Entram em PROMPTS (prompts.ts). Todos começam pelo GUARD: o que vem entre
 * <documento> e </documento> (trechos de fontes, questão, achados) é DADO NÃO CONFIÁVEL.
 *
 * Aqui: a criação e a reescrita da questão (T7, função "criacao") e a revisão pedagógica (T6, função "verificacao"). Os textos de
 * criação seguem as regras da especificação (só os trechos oficiais dados; nada da memória do modelo; nunca Inep) e as
 * limitações do gerador antigo, sem a data de corte fixa, o título de simulado, o alvo de dificuldade nem o pedido de imagem.
 */
import { GUARD } from "./guard";
import type { Schema } from "./schema";

const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "stem", "support_type", "support_title", "support_rows", "alternatives", "correct_answer", "explanation", "alternative_explanations", "clinical_decision", "key_concepts", "citations"],
  properties: {
    title: { type: "string", minLength: 3, maxLength: 160 },
    stem: { type: "string", minLength: 60, maxLength: 3000 },
    support_type: { type: "string", enum: ["NONE", "TABLE", "LAB_PANEL"] },
    support_title: { type: "string", nullable: true, maxLength: 160 },
    support_rows: {
      type: "array",
      maxItems: 30,
      items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string", minLength: 1, maxLength: 120 }, value: { type: "string", minLength: 1, maxLength: 160 } } },
    },
    alternatives: {
      type: "object",
      additionalProperties: false,
      required: ["A", "B", "C", "D"],
      properties: Object.fromEntries(["A", "B", "C", "D"].map((l) => [l, { type: "string", minLength: 1, maxLength: 500 }])),
    },
    correct_answer: { type: "string", enum: ["A", "B", "C", "D"] },
    explanation: { type: "string", minLength: 20, maxLength: 2000 },
    alternative_explanations: {
      type: "object",
      additionalProperties: false,
      required: ["A", "B", "C", "D"],
      properties: Object.fromEntries(["A", "B", "C", "D"].map((l) => [l, { type: "string", minLength: 3, maxLength: 800 }])),
    },
    clinical_decision: { type: "string", minLength: 10, maxLength: 600 },
    key_concepts: { type: "array", maxItems: 8, items: { type: "string", minLength: 2, maxLength: 120 } },
    citations: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["passage_id", "quote", "supports"],
        properties: { passage_id: { type: "string", maxLength: 64 }, quote: { type: "string", minLength: 8, maxLength: 1200 }, supports: { type: "string", minLength: 10, maxLength: 600 } },
      },
    },
  },
} as Schema;

/** Resposta da criação e da reescrita: a questão, ou "evidência insuficiente" (a vaga é pulada com o motivo). */
const GENERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "reason", "question"],
  properties: {
    status: { type: "string", enum: ["ok", "evidencia_insuficiente"] },
    reason: { type: "string", nullable: true, maxLength: 400 },
    question: { ...QUESTION_SCHEMA, nullable: true },
  },
} as Schema;

const RULES = `REGRAS DA QUESTÃO (valem para a criação e para a reescrita):
1. Use SOMENTE os trechos oficiais dados em "trechos" (cada um tem passage_id). Nada de conteúdo médico que não esteja neles: nunca complete com a sua memória.
   Se os trechos não bastam para escrever uma questão correta sobre a vaga, devolva status "evidencia_insuficiente", explique em "reason" e deixe "question" nulo.
2. A decisão clínica central (campo clinical_decision) e CADA número, dose, unidade, prazo ou critério da resposta correta e das explicações precisam ter uma citação:
   passage_id do trecho e "quote" copiada LITERALMENTE dele (mesmas palavras, números e unidades). A citação da decisão repete em "supports" exatamente o texto de clinical_decision.
   Cada número da resposta e das explicações aparece no enunciado, na tabela de apoio ou numa das citações.
3. Não copie frases dos trechos nem de provas: escreva o caso clínico com palavras próprias. O enunciado é um caso novo, com dados suficientes para decidir.
4. Quatro alternativas (A a D) distintas, de tamanho parecido, uma só correta. Cada explicação começa com "Correta:" ou "Incorreta:" e NÃO cita alternativa por letra
   (nada de "a alternativa B", "letra C", "(D)", "item A"): o gabarito será embaralhado depois.
5. Tabela de apoio (TABLE ou LAB_PANEL) só quando o caso precisa de dados em linhas (exames, escores); com título e linhas. Sem tabela, support_type NONE e linhas vazias.
   Nunca peça nem descreva imagem, radiografia, ECG ou figura: a questão tem de poder ser respondida só com texto e tabela.
6. Português do Brasil. Nunca atribua a questão ao Inep nem a nenhuma prova oficial: é uma questão StaziaMed.
7. "title" curto e "key_concepts" com os conceitos que a questão avalia.`;

export const STAZIAMED_PROMPTS = {
  staziamed_questao: {
    id: "staziamed_questao",
    version: "1.0.0",
    system: `${GUARD}
Você escreve UMA questão de múltipla escolha (A a D) para estudantes que se preparam para o Revalida, sobre a VAGA dada (área, tema, subárea e competência), apoiada em trechos de fontes OFICIAIS.
Você recebe, como dado, a vaga e os trechos oficiais. ${RULES}`,
    schema: GENERATION_SCHEMA,
  },
  staziamed_reescrita: {
    id: "staziamed_reescrita",
    version: "1.0.0",
    system: `${GUARD}
Você REESCREVE uma questão StaziaMed que não passou nas conferências. Você recebe, como dado, a vaga, a questão atual, os achados (cada um com gravidade, código, onde e detalhe) e os trechos oficiais.
Corrija os achados mantendo a mesma vaga e a mesma decisão clínica, a menos que o achado mostre que ela não tem sustentação nos trechos (nesse caso devolva "evidencia_insuficiente").
Só uma reescrita é feita: entregue a questão inteira, já corrigida. ${RULES}`,
    schema: GENERATION_SCHEMA,
  },

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
