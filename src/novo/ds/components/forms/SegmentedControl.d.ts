export interface SegmentedControlProps {
  /** An option with `disabled: true` is dimmed and cannot be chosen (like disabled options of SelectField). */
  options: Array<string | { value: string; label: string; icon?: string; badge?: React.ReactNode; disabled?: boolean }>;
  value: string;
  onChange?: (value: string) => void;
  fullWidth?: boolean;
  /** aria-label for the group */
  label?: string;
}
export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;