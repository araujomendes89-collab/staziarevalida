export interface BadgeProps {
  /** pro = PRO lock tag; ai = IA features; streak = ofensiva */
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'pro' | 'ai' | 'streak' | 'solid';
  size?: 'sm' | 'md';
  /** Uppercase + tracking — for status tags (PENDENTE, CONCLUÍDO) */
  caps?: boolean;
  icon?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;