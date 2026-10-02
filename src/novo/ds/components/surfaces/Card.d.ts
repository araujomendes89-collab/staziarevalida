export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** default = white + border; subtle = tinted; brand = soft teal; inverse = navy */
  variant?: 'default' | 'subtle' | 'brand' | 'inverse';
  padding?: number | string;
  interactive?: boolean;
  as?: any;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;