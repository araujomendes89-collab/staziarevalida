export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Required accessible name */
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md';
  /** Count bubble (e.g. unread alerts) */
  badge?: number | string;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;