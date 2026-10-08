export interface TabsProps {
  tabs: Array<{ value: string; label: string; icon?: string; count?: number; pro?: boolean }>;
  value: string;
  onChange?: (value: string) => void;
  label?: string;
  /** Quebra linha em vez de rolar para o lado (para muitas abas, ex.: Administração). */
  wrap?: boolean;
}
export declare function Tabs(props: TabsProps): JSX.Element;