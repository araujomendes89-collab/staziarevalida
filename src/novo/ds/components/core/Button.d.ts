/**
 * Primary action control.
 * @startingPoint section="Core" subtitle="Buttons in every variant" viewport="700x300"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = teal main CTA; strong = navy (Elite / high-emphasis); secondary = outlined; ghost; danger; link */
  variant?: 'primary' | 'strong' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon name before the label */
  icon?: string;
  /** Lucide icon name after the label (usually "arrow-right") */
  iconRight?: string;
  loading?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;