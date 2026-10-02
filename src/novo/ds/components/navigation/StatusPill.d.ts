export interface StatusPillProps {
  icon: string;
  iconColor?: string;
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
}
export declare function StatusPill(props: StatusPillProps): JSX.Element;