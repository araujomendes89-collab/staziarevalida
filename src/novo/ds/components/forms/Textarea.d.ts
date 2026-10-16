export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  /** Mostra "{n}/{maxLength}" em fonte mono (só "{n}" sem maxLength) */
  showCount?: boolean;
}
export declare function Textarea(props: TextareaProps): JSX.Element;
