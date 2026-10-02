export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  /** Error message — turns border red and sets aria-invalid */
  error?: string;
  /** Leading Lucide icon (e.g. "search", "mail") */
  icon?: string;
  /** password type gets a show/hide toggle */
  type?: string;
  size?: 'md' | 'lg';
}
export declare function TextField(props: TextFieldProps): JSX.Element;