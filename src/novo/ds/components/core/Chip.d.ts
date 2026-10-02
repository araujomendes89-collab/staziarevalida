export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Toggled filter state (navy fill when true) */
  selected?: boolean;
  icon?: string;
  /** Mono count suffix (e.g. questions in area) */
  count?: number | string;
  children?: React.ReactNode;
}
export declare function Chip(props: ChipProps): JSX.Element;