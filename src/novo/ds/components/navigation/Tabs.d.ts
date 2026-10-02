export interface TabsProps {
  tabs: Array<{ value: string; label: string; icon?: string; count?: number; pro?: boolean }>;
  value: string;
  onChange?: (value: string) => void;
  label?: string;
}
export declare function Tabs(props: TabsProps): JSX.Element;