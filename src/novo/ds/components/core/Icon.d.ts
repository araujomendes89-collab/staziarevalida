export interface IconProps {
  /** Lucide icon name, kebab-case (e.g. "book-open", "flame", "sparkles") */
  name: string;
  /** Pixel size. Default 20 */
  size?: number;
  /** Accessible label. Omit for decorative icons (aria-hidden) */
  label?: string;
  style?: React.CSSProperties;
  className?: string;
}
export declare function Icon(props: IconProps): JSX.Element;