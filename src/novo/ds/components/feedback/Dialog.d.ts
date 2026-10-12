export interface DialogProps {
  open?: boolean;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  /** Botões do rodapé, alinhados à direita */
  actions?: React.ReactNode;
  /** Esc e clique no fundo */
  onClose?: () => void;
  /** Classe extra na caixa (ex.: ajustar o visual de uma janela especial) */
  className?: string;
  /** Nome da janela para leitor de tela quando não há `title` */
  label?: string;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
