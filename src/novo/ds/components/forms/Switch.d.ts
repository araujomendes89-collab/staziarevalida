export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}
export declare function Switch(props: SwitchProps): JSX.Element;