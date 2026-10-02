export interface AvatarProps {
  /** Full name — initials derived from first two words */
  name?: string;
  src?: string;
  size?: number;
  style?: React.CSSProperties;
}
export declare function Avatar(props: AvatarProps): JSX.Element;