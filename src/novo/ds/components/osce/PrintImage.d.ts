export interface PrintImageProps {
  src: string;
  /** Texto alternativo da imagem; também é o nome da tela cheia */
  alt: string;
  /** Mostra "Ocultar"/"Mostrar imagem" (só desta tela; não muda a liberação do impresso) */
  canHide?: boolean;
  /** Largura (px) a 100% na tela cheia; padrão 900. A folha inteira da estação usa 1100 */
  baseWidth?: number;
  /** Nome do botão que amplia; padrão "Ampliar impresso" */
  label?: string;
}
export declare function PrintImage(props: PrintImageProps): JSX.Element;
