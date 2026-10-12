/**
 * Questões StaziaMed: tipos compartilhados pelas validações sem IA, pela geração, pela conferência e pela busca de fonte.
 * Sem código: só formas de dado (nada aqui chama banco nem IA).
 */
export type Letter = "A" | "B" | "C" | "D";
export const LETTERS: Letter[] = ["A", "B", "C", "D"];

/** A questão como a IA de criação devolve (esquema `staziamed_questao`, Tarefa 7). */
export interface GeneratedQuestion {
  title: string;
  stem: string;
  support_type: "NONE" | "TABLE" | "LAB_PANEL";
  support_title: string | null;
  support_rows: { label: string; value: string }[];
  alternatives: Record<Letter, string>;
  correct_answer: Letter;
  explanation: string;
  alternative_explanations: Record<Letter, string>;
  clinical_decision: string;
  key_concepts: string[];
  citations: { passage_id: string; quote: string; supports: string }[];
}

/** Citação no formato novo de `draft_questions.source_citations` (completada com os dados do trecho oficial oferecido). */
export interface StaziaCitation {
  passage_id: string;
  source_id: string;
  source: string;
  organ: string;
  version: string | null;
  page: number | null;
  quote: string;
  supports: string;
}

/** Trecho de fonte oficial (nível A a D, final, vigente) oferecido ao gerador. */
export interface OfficialPassage {
  passage_id: string;
  source_id: string;
  source: string;
  organ: string;
  version: string | null;
  authority_level: string;
  published_on: string | null;
  valid_until: string | null;
  section: string | null;
  page: number | null;
  text: string;
}

export interface CorpusItem {
  id: string;
  text: string;
}
export interface SimilarityCorpus {
  official: CorpusItem[];
  staziamed: CorpusItem[];
}
export interface SimilarityHit {
  score: number;
  id: string | null;
}
