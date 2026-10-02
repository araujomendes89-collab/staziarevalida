export interface BillingOptionProps {
  title: string;
  price: string;
  period?: string;
  note?: string;
  /** Corner tag e.g. "Economize 30%" */
  badge?: string;
  selected?: boolean;
  onClick?: () => void;
}
export declare function BillingOption(props: BillingOptionProps): JSX.Element;