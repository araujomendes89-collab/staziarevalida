export interface SectionHeaderProps {
  /** Lucide icon in a soft teal tile */
  icon?: string;
  title: string;
  subtitle?: string;
  /** Right-aligned control (link button, segmented control) */
  action?: React.ReactNode;
  level?: 2 | 3 | 4;
}
export declare function SectionHeader(props: SectionHeaderProps): JSX.Element;