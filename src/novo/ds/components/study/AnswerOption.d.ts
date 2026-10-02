/**
 * Multiple-choice alternative row for questions and onboarding quizzes.
 * @startingPoint section="Study" subtitle="Question alternatives in every state" viewport="700x420"
 */
export interface AnswerOptionProps {
  /** A, B, C, D */
  letter: string;
  children?: React.ReactNode;
  /** idle → selected → (after submit) correct / incorrect / dimmed */
  state?: 'idle' | 'selected' | 'correct' | 'incorrect' | 'dimmed';
  onClick?: () => void;
  /** Use checkbox semantics (personalization multi-select) */
  multi?: boolean;
}
export declare function AnswerOption(props: AnswerOptionProps): JSX.Element;