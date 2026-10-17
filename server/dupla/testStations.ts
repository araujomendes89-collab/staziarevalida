/**
 * Treino em Dupla: as 10 estações do INEP 2020 do pacote de design, SÓ como dado de teste.
 * Ids `teste-inep2020-eNN`; vivem nos testes e no banco local de desenvolvimento. A carga do Supabase
 * (scripts/supabase/seed-builder.ts) recusa o prefixo `teste-`, e a carga real não tem nenhuma delas.
 *
 * O JSON é gerado por scripts/dupla/converter-inep2020.ts a partir do pacote (leitura do critério do PEP por OCR).
 *   TODO(dono): roteiro do ator (actor_script vazio) e imagens dos impressos (image_url nulo) não constam nos documentos.
 */
import { loadStations, toLite } from "../../src/shared/checklistBank/catalog";
import type { Station } from "../../src/shared/checklistBank/types";
import { sqlLiteral, textArray } from "../../scripts/supabase/seed-builder";
import testStationsJson from "./data/teste-inep2020.json";

export const DUPLA_TEST_STATION_PREFIX = "teste-inep2020-e";

/** As 10 estações validadas (soma 10,00 cada) no formato do catálogo. */
export function loadDuplaTestStations(): Station[] {
  return loadStations(testStationsJson);
}

function upsert(table: string, rows: Record<string, unknown>[], conflict: string): string {
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `(${cols.map((c) => sqlLiteral(r[c])).join(", ")})`).join(",\n");
  const updates = cols.filter((c) => c !== conflict).map((c) => `${c} = excluded.${c}`).join(", ");
  return `insert into ${table} (${cols.join(", ")}) values\n${values}\non conflict (${conflict}) do update set ${updates};\n`;
}

/**
 * Comandos SQL da carga local: estações aprovadas em `checklist_stations` e o conteúdo completo em
 * `checklist_station_contents` (`on conflict do update`, então rodar de novo é seguro). Nunca em produção.
 */
export function buildDuplaTestStatements(): string[] {
  if (process.env.NODE_ENV === "production") throw new Error("As estações de teste não existem em produção.");
  const stations = loadDuplaTestStations();
  // o conteúdo guarda também `version`, que o tipo Station não tem (RoomContent.station.version)
  const versions = new Map((testStationsJson as { id: string; version?: string }[]).map((s) => [s.id, s.version]));
  const rows = stations.map((s) => {
    const lite = toLite(s);
    return { ...lite, taxonomy_path: textArray(lite.taxonomy_path), styles: textArray(lite.styles) };
  });
  const contents = stations.map((s) => ({ station_id: s.id, content: { ...s, version: versions.get(s.id) ?? null } }));
  return [upsert("public.checklist_stations", rows, "id"), upsert("public.checklist_station_contents", contents, "station_id")];
}
