export interface TopicRowProps {
  status?: 'pendente' | 'iniciado' | 'concluido';
  /** Grande área */
  area: string;
  title: string;
  questions: number;
  cards: number;
  /** 0–100 */
  mastery?: number;
  onClick?: () => void;
}
export declare function TopicRow(props: TopicRowProps): JSX.Element;