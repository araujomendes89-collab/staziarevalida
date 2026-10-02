export interface IconTileProps {
  /** Lucide icon name */
  name: string;
  /** Gradient tone — semantic or grande área */
  tone?: 'brand' | 'ai' | 'info' | 'warning' | 'pro' | 'streak' | 'success' | 'danger' | 'neutral' | 'navy' | 'clinica' | 'cirurgia' | 'go' | 'pediatria' | 'preventiva';
  size?: number;
  radius?: number;
}
export declare function IconTile(props: IconTileProps): JSX.Element;