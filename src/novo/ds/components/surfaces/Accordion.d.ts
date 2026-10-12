export interface AccordionProps {
  title: React.ReactNode;
  /** Ícone Lucide à esquerda do título */
  icon?: string;
  /** Nó logo depois do título (ex.: Badge "2/6") */
  meta?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children?: React.ReactNode;
}
export declare function Accordion(props: AccordionProps): JSX.Element;
