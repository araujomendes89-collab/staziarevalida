export interface LockedFeatureProps {
  title: string;
  description: string;
  /** Plan required: "PRO" or "Elite" */
  plan?: string;
  cta?: string;
  onUpgrade?: () => void;
}
export declare function LockedFeature(props: LockedFeatureProps): JSX.Element;