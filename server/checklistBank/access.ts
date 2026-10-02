import type { ServerPrincipal } from "../auth/types";
import type { ChecklistEvent, Station, StationLite } from "../../src/shared/checklistBank/types";

/** Planos com acesso a estações e simulados marcados como Pro. */
const PRO_TIERS = new Set(["PRO", "PRO_PLUS", "ADMIN"]);

export function canAccessPro(principal: ServerPrincipal): boolean {
  return principal.role === "ADMIN" || PRO_TIERS.has(principal.tier);
}

/** Quem pode ver conteúdo que ainda aguarda revisão médica. */
export function canSeeUnreviewed(principal: ServerPrincipal): boolean {
  return principal.role === "ADMIN" || principal.role === "EDITOR";
}

/** Estação aparece no catálogo? (estações Pro aparecem bloqueadas, não somem) */
export function isStationVisible(principal: ServerPrincipal, station: StationLite): boolean {
  return station.medical_review === "approved" || canSeeUnreviewed(principal);
}

/** Pode abrir o conteúdo completo (roteiro, impressos, checklist)? */
export function canOpenStation(principal: ServerPrincipal, station: StationLite): boolean {
  return isStationVisible(principal, station) && (!station.is_pro_only || canAccessPro(principal));
}

export function canOpenEvent(principal: ServerPrincipal, event: ChecklistEvent, stations: Station[]): boolean {
  if (event.is_pro_only && !canAccessPro(principal)) return false;
  return event.station_ids.every((id) => {
    const station = stations.find((s) => s.id === id);
    return station !== undefined && canOpenStation(principal, station);
  });
}
