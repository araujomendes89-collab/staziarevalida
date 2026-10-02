export interface FlashcardProps {
  front: React.ReactNode;
  back: React.ReactNode;
  /** Grande área shown as overline */
  area?: string;
  height?: number;
  /** Controlled flip state */
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
}
export declare function Flashcard(props: FlashcardProps): JSX.Element;