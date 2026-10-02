export interface TaskCardProps {
  /** Overline: "Treino diário", "Prova prática", "Revisão espaçada" */
  kind: string;
  title: string;
  description?: string;
  icon: string;
  cta: string;
  onClick?: () => void;
  tone?: 'brand' | 'info' | 'warning' | 'ai';
  done?: boolean;
}
export declare function TaskCard(props: TaskCardProps): JSX.Element;