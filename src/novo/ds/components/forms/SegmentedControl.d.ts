export interface SegmentedControlProps {
  options: Array<string | { value: string; label: string; icon?: string; badge?: React.ReactNode }>;
  value: string;
  onChange?: (value: string) => void;
  fullWidth?: boolean;
  /** aria-label for the group */
  label?: string;
}
export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;