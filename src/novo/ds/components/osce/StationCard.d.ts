export interface StationCardProps {
  areaCode: 'CM' | 'CR' | 'GO' | 'PED' | 'MFC';
  number?: number | null;
  title: string;
  /** Queixas / temas */
  tags?: string[];
  source?: string | null;
  /** Última nota da pessoa, em % (0 a 100); sem nota: omitir ou null ("—") */
  myScorePct?: number | null;
  /** Média geral da estação, em %; sem dado: omitir ou null ("—") */
  averagePct?: number | null;
  onClick?: () => void;
}
export declare function StationCard(props: StationCardProps): JSX.Element;
