export interface PrintItemProps {
  /** Número do impresso que a pessoa vê na tela (1, 2, 3…) */
  index: number;
  /** Só avaliador: número do impresso no documento oficial. Aparece só se for diferente de `index` */
  sourceNumber?: number | null;
  title: string;
  released?: boolean;
  /** Avaliador: mostra "Liberar"/"Ocultar" */
  canRelease?: boolean;
  onToggleRelease?: () => void;
  /** Conteúdo do impresso; só aparece liberado (ou para quem pode liberar), atrás de "Ver conteúdo" */
  children?: React.ReactNode;
}
export declare function PrintItem(props: PrintItemProps): JSX.Element;
