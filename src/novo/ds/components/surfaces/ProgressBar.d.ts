export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  /** Right-aligned value text, e.g. "320 itens" or "35% domínio" */
  valueLabel?: string;
  height?: number;
  /** CSS color — use area tokens for per-area progress */
  color?: string;
}
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;