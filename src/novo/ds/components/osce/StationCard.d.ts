export type StationDifficulty = 'facil' | 'medio' | 'dificil';
export interface StationCardProps {
  areaCode: 'CM' | 'CR' | 'GO' | 'PED' | 'MFC';
  /** Nome da estação */
  title: string;
  /** Grau definido pela revisão médica; sem grau: omitir ou null (nenhum selo) */
  difficulty?: StationDifficulty | null;
  /** Origem: "Revalida 2020 · INEP" ou "Estação inédita" */
  source?: string | null;
  /**
   * Selo "Aguardando conteúdo" (cartão do catálogo sem conteúdo). Quem chama liga só para a equipe. O cartão fica com
   * aria-disabled (continua no foco e no leitor de tela), não chama onClick e, ao tocar, mostra "Conteúdo em preparação".
   */
  awaitingContent?: boolean;
  /** Última nota da pessoa, em % (0 a 100); sem nota: omitir ou null ("—") */
  myScorePct?: number | null;
  /** Média geral da estação, em %; sem dado: omitir ou null ("—") */
  averagePct?: number | null;
  onClick?: () => void;
}
export declare function StationCard(props: StationCardProps): JSX.Element;
/** Selo do grau de dificuldade ("Fácil", "Médio", "Difícil"); sem grau conhecido não desenha nada. */
export declare function StationLevel(props: { level?: StationDifficulty | null }): JSX.Element | null;
/** Texto da dica do cartão sem conteúdo. */
export declare const WAIT_HINT: string;
/** Dica passageira do cartão sem conteúdo: [visível, mostrar]. */
export declare function useWaitHint(ms?: number): [boolean, () => void];
