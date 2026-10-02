import type { ChecklistGrade, ChecklistItem } from "./types";

/**
 * Sugere o nível a partir dos subitens marcados (regra "all/half/none"):
 * todos → Correct; pelo menos a metade, arredondada para cima → Partial;
 * menos que isso → Incorrect. Ex.: 5 subitens → 5 adequado, 3–4 parcial, 0–2 inadequado.
 * Retorna null quando o item não tem regra (o avaliador escolhe o nível manualmente).
 */
export function suggestGrade(item: ChecklistItem, checkedSubitemIds: string[]): ChecklistGrade | null {
  if (!item.auto_grade_rule || item.subitems.length === 0) return null;

  const validIds = new Set(item.subitems.map((s) => s.id));
  const checked = new Set(checkedSubitemIds.filter((id) => validIds.has(id))).size;
  const total = item.subitems.length;

  if (checked === total) return "Correct";
  if (item.grades.partial !== null && checked >= Math.ceil(total / 2)) return "Partial";
  return "Incorrect";
}
