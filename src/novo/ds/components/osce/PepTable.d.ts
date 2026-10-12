export type Grade = "correct" | "partial" | "incorrect";
export interface PepItem {
  id: string;
  /** Número mostrado na folha, ex.: "1" */
  number: string;
  text: string;
  /** Faixa de seção acima do item (repetida em itens seguidos só aparece uma vez) */
  section?: string;
  /** Dica em itálico, com ícone de informação */
  tip?: string;
  /** Linhas "{rótulo}: {texto}" sob o item */
  criteria?: Array<{ label: string; text: string }>;
  /** Subitens com caixa de seleção */
  subitems?: Array<{ id: string; text: string }>;
  /** Pontos de cada nível; `partial: null` = o item não tem parcial (célula hachurada) */
  levels: { incorrect: number; partial: number | null; correct: number };
}
export interface PepTableProps {
  stationNumber?: number | null;
  area: string;
  items: PepItem[];
  marks: Record<string, { grade: Grade | null; subitems: string[] }>;
  /** Sem `onMark` a folha é só leitura. Marcar o nível já marcado limpa (grade null). */
  onMark?: (itemId: string, grade: Grade | null) => void;
  onToggleSubitem?: (itemId: string, subitemId: string) => void;
  /** Padrão 10 */
  maxScore?: number;
}
/**
 * Cada item é um radiogroup (aria-label "Item {number}"); ← → andam entre os níveis que existem,
 * Espaço/Enter marcam. A folha é branca nos dois temas.
 */
export declare function PepTable(props: PepTableProps): JSX.Element;
