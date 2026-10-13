/**
 * Classificador por IA dos pares DUVIDOSOS de questões parecidas (função "Questões parecidas" = `similaridade` da Central de
 * IAs, que começa DESLIGADA). Só roda em lote pedido na Administração (app_admin_similarity_classify), nunca na abertura da
 * questão. A IA só reclassifica: o par continua "proposta" e quem aprova é a equipe ou o revisor médico da área.
 */
import type { Schema } from "../ai/schema";
import { validate } from "../ai/schema";

export const CLASSIFIER_PROMPT_ID = "similaridade_relacao";
export const CLASSIFIER_PROMPT_VERSION = "1";
/** Pares por chamada. */
export const PAIRS_PER_CALL = 4;

export const RELATIONS = ["duplicada_exata", "duplicada_semantica", "mesmo_raciocinio", "mesmo_subtema", "mesmo_tema", "complementar", "nao_relacionada"] as const;

export const CLASSIFIER_SCHEMA: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["pares"],
  properties: {
    pares: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "relacao", "confianca", "justificativa"],
        properties: {
          id: { type: "string", maxLength: 60 },
          relacao: { type: "string", enum: [...RELATIONS] },
          confianca: { type: "number", minimum: 0, maximum: 1 },
          justificativa: { type: "string", maxLength: 400 },
        },
      },
    },
  },
};

export const CLASSIFIER_SYSTEM = `Você compara PARES de questões de prova de medicina (Revalida e ENAMED) e diz qual é a relação entre as duas questões de cada par.
Tipos (use exatamente um):
- duplicada_exata: o mesmo texto (mesmo caso, mesma pergunta, mesmas alternativas).
- duplicada_semantica: a mesma questão reescrita (mesmo caso clínico, mesma pergunta e mesma resposta, com outras palavras).
- mesmo_raciocinio: casos diferentes que exigem a MESMA decisão clínica a partir de achados equivalentes (mesma competência e mesmo problema central).
- complementar: o mesmo problema ou subtema cobrado em OUTRA etapa (por exemplo, uma pede o diagnóstico e a outra o tratamento ou a complicação).
- mesmo_subtema: o mesmo subtema, mas sem o mesmo raciocínio nem etapas que se completam.
- mesmo_tema: só o mesmo tema amplo.
- nao_relacionada: nada relevante em comum.
Regras: MESMO TEMA NÃO É EQUIVALENTE. Use só o que está escrito nas questões e nos perfis; não invente dado clínico, número, diretriz ou fonte. O gabarito oficial vem só para entender o que a questão cobra: nunca o questione. Se tiver dúvida, use confiança baixa.
Para cada par devolva: id (o mesmo recebido), relacao, confianca (0 a 1) e justificativa (uma ou duas frases curtas em português, sem repetir o enunciado).`;

export interface DoubtfulPair {
  id: string;
  relation: string;
  score: number | string;
  confidence: number | string;
  a: Record<string, unknown>;
  b: Record<string, unknown>;
}

export interface ClassifierItem {
  id: string;
  relacao: (typeof RELATIONS)[number];
  confianca: number;
  justificativa: string;
}

const side = (x: Record<string, unknown>) => ({
  enunciado: x.enunciado,
  alternativas: x.alternativas,
  gabarito_oficial: x.gabarito_oficial,
  perfil: {
    area: x.area, tema: x.tema, subtema: x.subtema, taxonomia: x.taxonomy_node_id, competencia: x.competencia, cenario: x.cenario,
    problema_central: x.problema_central, conceitos: x.conceitos, achados: x.achados, raciocinio: x.raciocinio,
  },
});

/** O texto que vai para a IA (um documento JSON com os pares). */
export function classifierInput(pairs: DoubtfulPair[]): string {
  const doc = { pares: pairs.map((p) => ({ id: p.id, sugestao_do_motor: p.relation, questao_1: side(p.a), questao_2: side(p.b) })) };
  return `<documento>\n${JSON.stringify(doc)}\n</documento>`;
}

/** Confere a resposta: formato, ids recebidos e nada repetido. Devolve só os itens válidos. */
export function checkClassifierOutput(output: unknown, pairs: DoubtfulPair[]): ClassifierItem[] {
  if (validate(CLASSIFIER_SCHEMA, output).length) return [];
  const ids = new Set(pairs.map((p) => p.id));
  const seen = new Set<string>();
  const out: ClassifierItem[] = [];
  for (const it of (output as { pares: ClassifierItem[] }).pares) {
    if (!ids.has(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push({ ...it, justificativa: it.justificativa.trim() });
  }
  return out;
}
