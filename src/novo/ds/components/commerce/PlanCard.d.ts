/**
 * Subscription plan column (Trial / PRO / Elite).
 * @startingPoint section="Commerce" subtitle="Pricing plan cards" viewport="700x620"
 */
export interface PlanCardProps {
  name: string;
  tagline?: string;
  icon: string;
  price: string;
  period?: string;
  /** e.g. "ou R$ 897/ano" */
  note?: string;
  /** Small badge next to name ("7 dias grátis", "Premium") */
  tag?: string;
  features?: string[];
  cta: string;
  ctaVariant?: 'primary' | 'strong' | 'secondary';
  footnote?: string;
  /** Highlighted "Mais escolhido" plan */
  featured?: boolean;
  onSelect?: () => void;
}
export declare function PlanCard(props: PlanCardProps): JSX.Element;