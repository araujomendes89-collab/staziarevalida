export interface PrintImageProps {
  src: string;
  /** Texto alternativo da imagem; também é o nome da tela cheia */
  alt: string;
  /** Mostra "Ocultar"/"Mostrar imagem" (só desta tela; não muda a liberação do impresso) */
  canHide?: boolean;
}
export declare function PrintImage(props: PrintImageProps): JSX.Element;
