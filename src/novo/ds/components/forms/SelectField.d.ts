export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options?: Array<string | { value: string; label: string; disabled?: boolean }>;
}
export declare function SelectField(props: SelectFieldProps): JSX.Element;