export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  caption?: string;
  icon?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}
export declare function StatCard(props: StatCardProps): JSX.Element;