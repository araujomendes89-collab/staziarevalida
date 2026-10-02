export interface StepProgressProps {
  current: number;
  total: number;
  /** segments = full-width bars (onboarding header); dots = compact pager */
  variant?: 'segments' | 'dots';
}
export declare function StepProgress(props: StepProgressProps): JSX.Element;