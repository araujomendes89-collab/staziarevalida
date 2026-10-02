export interface TopbarProps {
  title: string;
  subtitle?: string;
  /** Right-side actions (streak pill, IA quota, theme, alerts, avatar) */
  children?: React.ReactNode;
  /** Leading slot (mobile menu button) */
  leading?: React.ReactNode;
}
export declare function Topbar(props: TopbarProps): JSX.Element;