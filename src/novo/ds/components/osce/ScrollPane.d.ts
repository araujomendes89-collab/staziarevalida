export interface ScrollPaneProps {
  children?: React.ReactNode;
  className?: string;
  /** Nome da região para leitores de tela (ex.: "Cenário e impressos") */
  label: string;
}
export declare function ScrollPane(props: ScrollPaneProps): JSX.Element;
