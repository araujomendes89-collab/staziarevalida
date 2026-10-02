import stationsSeed from "./data/stations.seed.json";
import eventsSeed from "./data/events.seed.json";
import { loadEvents, loadStations } from "../../src/shared/checklistBank/catalog";
import type { ChecklistEvent, Station } from "../../src/shared/checklistBank/types";

export interface ChecklistCatalog {
  stations: Station[];
  events: ChecklistEvent[];
}

let cached: ChecklistCatalog | null = null;

/**
 * Catálogo versionado no repositório (estações e simulados). Validado na primeira
 * leitura: se alguma estação não somar 10,0 o servidor falha ao subir, em vez de
 * servir um checklist errado.
 */
export function getChecklistCatalog(): ChecklistCatalog {
  if (!cached) {
    const stations = loadStations(stationsSeed);
    cached = { stations, events: loadEvents(eventsSeed, stations) };
  }
  return cached;
}
