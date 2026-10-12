import {
  STATION_AREAS,
  type ChecklistEvent,
  type ChecklistItem,
  type Pressing,
  type Station,
  type StationArea,
  type StationLite,
} from "./types";

/** Toda estação no padrão Revalida soma 10,0 pontos. */
export const STATION_MAX_SCORE = 10;
export const DEFAULT_STATION_DURATION_MS = 10 * 60 * 1000;
const SEED_CREATED_AT = "2026-10-01T00:00:00.000Z";
const EPSILON = 1e-6;

export class CatalogValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Catálogo de estações inválido:\n- ${problems.join("\n- ")}`);
    this.name = "CatalogValidationError";
  }
}

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

/**
 * Converte uma estação do seed (checklists-pack/seed/estacoes_modelo_seed.json) no
 * modelo `Station`, preenchendo o que o seed não traz: id de cada item, metadados
 * de catálogo e o status de revisão médica (padrão "pending").
 */
export function normalizeStation(raw: any): Station {
  const id = asString(raw?.id);
  const area = asString(raw?.area) as StationArea;
  const topic = asString(raw?.topic);

  const checklist_items: ChecklistItem[] = (Array.isArray(raw?.checklist_items) ? raw.checklist_items : []).map(
    (item: any, index: number): ChecklistItem => {
      const order = typeof item?.order === "number" ? item.order : index + 1;
      return {
        id: asString(item?.id) || `${id}-i${order}`,
        order,
        phase: asString(item?.phase, "Geral"),
        content: asString(item?.content),
        tip: asString(item?.tip),
        grades: {
          correct: Number(item?.grades?.correct ?? 0),
          partial: item?.grades?.partial === null || item?.grades?.partial === undefined ? null : Number(item.grades.partial),
          incorrect: Number(item?.grades?.incorrect ?? 0),
        },
        criteria: {
          correct: asString(item?.criteria?.correct),
          ...(item?.criteria?.partial ? { partial: asString(item.criteria.partial) } : {}),
          incorrect: asString(item?.criteria?.incorrect),
        },
        subitems: (Array.isArray(item?.subitems) ? item.subitems : []).map((s: any) => ({
          id: asString(s?.id),
          text: asString(s?.text),
        })),
        auto_grade_rule: item?.auto_grade_rule === "all/half/none" ? "all/half/none" : null,
      };
    }
  );

  return {
    id,
    name: asString(raw?.name),
    topic,
    area,
    setting: asString(raw?.setting) || null,
    taxonomy_path: Array.isArray(raw?.taxonomy_path) ? raw.taxonomy_path.map(String) : [area, topic].filter(Boolean),
    goal: asString(raw?.goal, "Revalida"),
    institution: asString(raw?.institution) || null,
    year: asString(raw?.year) || null,
    styles: Array.isArray(raw?.styles) ? raw.styles.map(String) : [],
    is_pro_only: raw?.is_pro_only === true,
    medical_review: raw?.medical_review === "approved" ? "approved" : "pending",
    max_score: typeof raw?.max_score === "number" ? raw.max_score : STATION_MAX_SCORE,
    duration_ms: typeof raw?.duration_ms === "number" ? raw.duration_ms : DEFAULT_STATION_DURATION_MS,
    created_at: asString(raw?.created_at, SEED_CREATED_AT),
    actor_script: asString(raw?.actor_script),
    doctor_scene: asString(raw?.doctor_scene),
    doctor_tasks: asString(raw?.doctor_tasks),
    pressings: (Array.isArray(raw?.pressings) ? raw.pressings : []).map((p: any): Pressing => {
      const pressing: Pressing = {
        id: asString(p?.id),
        name: asString(p?.name),
        content: asString(p?.content),
        image_url: asString(p?.image_url) || null,
      };
      // Treino em Dupla: os três campos só são gravados quando existem (o que já foi publicado não ganha chave nova).
      // Número que não é número fica de fora aqui; o valor inválido (0, negativo, fracionado) é mantido e recusado em validateStation.
      if (typeof p?.source_number === "number") pressing.source_number = p.source_number;
      if (typeof p?.display_number === "number") pressing.display_number = p.display_number;
      if (typeof p?.initially_visible === "boolean") pressing.initially_visible = p.initially_visible;
      return pressing;
    }),
    checklist_items,
    summary: (Array.isArray(raw?.summary) ? raw.summary : []).map((s: any) => ({
      topic: asString(s?.topic),
      summary: asString(s?.summary),
    })),
  };
}

/**
 * Números do impresso para o Treino em Dupla, com o padrão de quem não tem os campos: origem = tela = posição (1, 2, 3…)
 * e não é inicial. `index` é a posição de 0 em diante na lista de impressos da estação.
 */
export function pressingNumbers(
  pressing: Pick<Pressing, "source_number" | "display_number" | "initially_visible">,
  index: number
): { source_number: number; display_number: number; initially_visible: boolean } {
  return {
    source_number: typeof pressing.source_number === "number" ? pressing.source_number : index + 1,
    display_number: typeof pressing.display_number === "number" ? pressing.display_number : index + 1,
    initially_visible: pressing.initially_visible === true,
  };
}

const duplicates = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i);

/** Lista os problemas de uma estação; vazio = válida. */
export function validateStation(station: Station): string[] {
  const where = station.id || "(sem id)";
  const problems: string[] = [];

  if (!station.id) problems.push(`${where}: estação sem id`);
  if (!station.name) problems.push(`${where}: estação sem nome`);
  if (!STATION_AREAS.includes(station.area)) problems.push(`${where}: área desconhecida "${station.area}"`);
  if (station.checklist_items.length === 0) problems.push(`${where}: checklist vazio`);

  const total = station.checklist_items.reduce((sum, item) => sum + item.grades.correct, 0);
  if (Math.abs(total - STATION_MAX_SCORE) > EPSILON) {
    problems.push(`${where}: checklist soma ${total.toFixed(3)} (esperado ${STATION_MAX_SCORE.toFixed(1)})`);
  }
  if (Math.abs(station.max_score - STATION_MAX_SCORE) > EPSILON) {
    problems.push(`${where}: max_score ${station.max_score} (esperado ${STATION_MAX_SCORE})`);
  }

  for (const id of duplicates(station.checklist_items.map((i) => i.id))) {
    problems.push(`${where}: item duplicado "${id}"`);
  }
  for (const id of duplicates(station.pressings.map((p) => p.id))) {
    problems.push(`${where}: impresso duplicado "${id}"`);
  }
  const isPositiveInteger = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 1;
  station.pressings.forEach((p, i) => {
    if (p.display_number !== undefined && p.display_number !== null && !isPositiveInteger(p.display_number)) {
      problems.push(`${where}: impresso ${i + 1}: display_number inválido (${p.display_number})`);
    }
    if (p.source_number !== undefined && p.source_number !== null && !isPositiveInteger(p.source_number)) {
      problems.push(`${where}: impresso ${i + 1}: source_number inválido (${p.source_number})`);
    }
  });
  {
    const numbers = station.pressings.map((p, i) => pressingNumbers(p, i));
    // o número da tela vale dentro do grupo (iniciais de um lado, liberáveis do outro): o relato inicial não entra na lista numerada
    for (const key of duplicates(numbers.map((n) => `${n.initially_visible ? "inicial" : "liberável"}:${n.display_number}`))) {
      problems.push(`${where}: número na tela repetido (${key.replace(":", " ")})`);
    }
    for (const n of duplicates(numbers.map((x) => String(x.source_number)))) {
      problems.push(`${where}: número de origem repetido (${n})`);
    }
  }

  for (const item of station.checklist_items) {
    const label = `${where} item ${item.order}`;
    const { correct, partial, incorrect } = item.grades;
    if (!(correct > 0)) problems.push(`${label}: valor "correto" deve ser positivo`);
    if (incorrect < 0 || incorrect >= correct) problems.push(`${label}: valor "incorreto" fora do intervalo`);
    if (partial !== null && !(partial > incorrect && partial < correct)) {
      problems.push(`${label}: valor "parcial" deve ficar entre incorreto e correto`);
    }
    for (const id of duplicates(item.subitems.map((s) => s.id))) {
      problems.push(`${label}: subitem duplicado "${id}"`);
    }
    if (item.auto_grade_rule && item.subitems.length === 0) {
      problems.push(`${label}: regra automática sem subitens`);
    }
  }

  return problems;
}

/** Normaliza e valida o seed inteiro; lança `CatalogValidationError` se algo estiver errado. */
export function loadStations(rawStations: unknown): Station[] {
  if (!Array.isArray(rawStations)) throw new CatalogValidationError(["seed de estações não é uma lista"]);
  const stations = rawStations.map(normalizeStation);
  const problems = stations.flatMap(validateStation);
  for (const id of duplicates(stations.map((s) => s.id))) problems.push(`estação duplicada "${id}"`);
  if (problems.length > 0) throw new CatalogValidationError(problems);
  return stations;
}

/** Valida os simulados contra o catálogo (5 estações existentes, janela coerente). */
export function loadEvents(rawEvents: unknown, stations: Station[]): ChecklistEvent[] {
  if (!Array.isArray(rawEvents)) throw new CatalogValidationError(["seed de simulados não é uma lista"]);
  const stationIds = new Set(stations.map((s) => s.id));
  const problems: string[] = [];

  const events = rawEvents.map((raw: any): ChecklistEvent => ({
    id: asString(raw?.id),
    title: asString(raw?.title),
    description: asString(raw?.description),
    starts_at: asString(raw?.starts_at),
    ends_at: asString(raw?.ends_at),
    station_ids: Array.isArray(raw?.station_ids) ? raw.station_ids.map(String) : [],
    cover_url: asString(raw?.cover_url) || null,
    is_pro_only: raw?.is_pro_only === true,
    type: "Public",
  }));

  for (const event of events) {
    const where = event.id || "(simulado sem id)";
    if (!event.id || !event.title) problems.push(`${where}: id e título são obrigatórios`);
    const starts = Date.parse(event.starts_at);
    const ends = Date.parse(event.ends_at);
    if (Number.isNaN(starts) || Number.isNaN(ends) || ends <= starts) {
      problems.push(`${where}: janela de datas inválida`);
    }
    if (event.station_ids.length !== 5) problems.push(`${where}: precisa de 5 estações (tem ${event.station_ids.length})`);
    for (const stationId of event.station_ids) {
      if (!stationIds.has(stationId)) problems.push(`${where}: estação inexistente "${stationId}"`);
    }
  }
  for (const id of duplicates(events.map((e) => e.id))) problems.push(`simulado duplicado "${id}"`);
  if (problems.length > 0) throw new CatalogValidationError(problems);
  return events;
}

export function toLite(station: Station): StationLite {
  const {
    actor_script: _actor,
    doctor_scene: _scene,
    doctor_tasks: _tasks,
    pressings: _pressings,
    checklist_items: _items,
    summary: _summary,
    ...lite
  } = station;
  return lite;
}
