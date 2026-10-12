export interface DialogProps {
  open?: boolean;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  /** Botões do rodapé, alinhados à direita */
  actions?: React.ReactNode;
  /** Esc e clique no fundo */
  onClose?: () => void;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
