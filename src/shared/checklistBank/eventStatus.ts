import type { ChecklistEvent, EventStatus } from "./types";

/** Status do simulado pelas datas: antes do início → próximo; até o fim → em andamento; depois → expirado. */
export function getEventStatus(event: Pick<ChecklistEvent, "starts_at" | "ends_at">, now: Date): EventStatus {
  const t = now.getTime();
  if (t < Date.parse(event.starts_at)) return "upcoming";
  if (t <= Date.parse(event.ends_at)) return "ongoing";
  return "expired";
}

export function isWithinEventWindow(event: Pick<ChecklistEvent, "starts_at" | "ends_at">, now: Date): boolean {
  return getEventStatus(event, now) === "ongoing";
}
