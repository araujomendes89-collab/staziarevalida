export interface MiniCalendarProps {
  year?: number;
  /** 0-indexed month */
  month?: number;
  today?: number;
  /** Days with study activity (dot) */
  marked?: number[];
  selected?: number;
  onSelect?: (day: number) => void;
}
export declare function MiniCalendar(props: MiniCalendarProps): JSX.Element;