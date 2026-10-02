export interface BannerProps {
  tone?: 'brand' | 'info' | 'warning' | 'danger' | 'success';
  /** Override default tone icon */
  icon?: string;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}
export declare function Banner(props: BannerProps): JSX.Element;