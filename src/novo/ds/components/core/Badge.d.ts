export interface BadgeProps {
  /** pro = PRO lock tag; ai = IA features; streak = ofensiva; candidate / actor = papel na sala do Treinamento em Dupla */
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'pro' | 'ai' | 'streak' | 'solid' | 'candidate' | 'actor';
  size?: 'sm' | 'md';
  /** Uppercase + tracking — for status tags (PENDENTE, CONCLUÍDO) */
  caps?: boolean;
  icon?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;