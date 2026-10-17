/**
 * CÉREBRO DO TUTOR — tipos comuns da busca de conhecimento aprovado (migração 20261003013620_tutor_conhecimento.sql).
 * Desenho: /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/DESENHO.md.
 */

export type TipoConhecimento = "fonte" | "aula" | "atualizacao" | "questao" | "flashcard" | "mapa" | "estacao";
export const TIPOS: readonly TipoConhecimento[] = ["fonte", "aula", "atualizacao", "questao", "flashcard", "estacao", "mapa"];

/** Vetor de uma pergunta no formato que o banco recebe. */
export interface VetorConsulta {
  model: string;
  values: number[];
}

/** Um trecho devolvido pela busca (ou pelo material da abertura), com a citação pronta: "Título (ano), seção "X", p. Y". */
export interface TrechoEntregue {
  ref: string;
  id: string;
  tipo: TipoConhecimento;
  titulo: string;
  ano: number | null;
  secao: string | null;
  pagina: number | null;
  citacao: string;
  texto: string;
  nivel?: string;
  /** "palavras", "significado" ou "ambos" */
  por?: string;
  semelhanca?: number | null;
}

export interface ResultadoBusca {
  ok: boolean;
  trechos: TrechoEntregue[];
  /** de onde veio o vetor: recebido (gerado agora), cache (pergunta repetida) ou nenhum (só palavras) */
  vetor: "recebido" | "cache" | "nenhum";
  motivo?: "ia_desligada" | "limite" | "erro";
  retry_after_s?: number | null;
}

/** Um trecho pronto para gravar no índice (o banco reconfere o portão de aprovação). */
export interface TrechoNovo {
  texto: string;
  secao?: string | null;
  pagina?: number | null;
  hash: string;
  /** texto que vira vetor ("Título — Seção" + texto); não é gravado */
  paraVetor: string;
}

export interface MetaOrigem {
  titulo: string;
  ano?: number | null;
  area?: string | null;
  grupo?: string | null;
  tema_ids?: string[];
  nivel?: string;
  plano_minimo?: string | null;
  secao?: string | null;
  pagina?: number | null;
}
