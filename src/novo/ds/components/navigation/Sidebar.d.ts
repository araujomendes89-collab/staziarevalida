/**
 * Student-area left navigation with collapsible sections.
 * @startingPoint section="Navigation" subtitle="App sidebar with sections" viewport="700x520"
 */
export interface SidebarProps {
  items: Array<{ id: string; label: string; icon: string; children?: Array<{ id: string; label: string; pro?: boolean }> }>;
  activeId: string;
  onSelect?: (id: string) => void;
  /** Logo slot */
  brand?: React.ReactNode;
  /** Bottom slot (trial card, user) */
  footer?: React.ReactNode;
}
export declare function Sidebar(props: SidebarProps): JSX.Element;