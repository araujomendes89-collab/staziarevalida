/**
 * Monta a carga do banco com o conteúdo real do produto (usado pelo script
 * scripts/supabase/build-seed.ts e pelo banco local de desenvolvimento):
 *  - 12 provas e 1.200 questões oficiais (Revalida INEP 2020–2026/1 + ENAMED 2025)
 *  - 10 estações do Banco de Checklists (pendentes de revisão médica) e 1 simulado
 *
 * Deixa de fora os rótulos fabricados apontados na auditoria (estatísticas iguais em
 * todas as questões, "extractionConfidence", "difficultySource") e corrige os códigos
 * duplicados (o código passa a incluir a edição: REV-2025.1-Q001).
 */
import { ALL_CANONICAL_QUESTIONS } from "../../src/data/allOfficialQuestions";
import { loadEvents, loadStations, toLite } from "../../src/shared/checklistBank/catalog";
import { citesFigure } from "../../src/shared/questions/figure";
import { cleanQuestionText } from "../../src/shared/questions/footer";
import stationsSeed from "../../server/checklistBank/data/stations.seed.json";
import eventsSeed from "../../server/checklistBank/data/events.seed.json";

type Row = Record<string, unknown>;

/** Literal SQL seguro (strings com aspas duplicadas; objetos como jsonb; arrays de texto). */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) && (value as any).__textArray) {
    return `array[${(value as string[]).map(sqlLiteral).join(",")}]::text[]`;
  }
  if (typeof value === "object") return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Marca um array de strings para virar text[] (em vez de jsonb). */
const textArray = (values: string[]) => Object.assign([...values], { __textArray: true });

function insert(table: string, rows: Row[], conflict: string): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `(${cols.map((c) => sqlLiteral(r[c])).join(", ")})`).join(",\n");
  const updates = cols.filter((c) => !conflict.split(",").map((s) => s.trim()).includes(c));
  // tabela só de chave: nada a atualizar
  const action = updates.length ? `do update set ${updates.map((c) => `${c} = excluded.${c}`).join(", ")}` : "do nothing";
  return `insert into ${table} (${cols.join(", ")}) values\n${values}\non conflict (${conflict}) ${action};\n`;
}

/** Prova de origem: revalida-2025-1, revalida-2021, enamed-2025 */
export function examOf(q: any): { id: string; kind: "REVALIDA" | "ENAMED"; year: number; semester: number | null; title: string } {
  const kind = q.origin === "ENAMED_OFICIAL" ? "ENAMED" : "REVALIDA";
  const year = Number(q.examYear);
  const sem = String(q.examEdition ?? "").match(/\b\d{4}\/([12])\b/)?.[1];
  const semester = sem ? Number(sem) : null;
  const id = `${kind.toLowerCase()}-${year}${semester ? `-${semester}` : ""}`;
  const title = String(q.examEdition ?? `${kind} ${year}`);
  return { id, kind, year, semester, title };
}

export function questionCode(q: any): string {
  const { kind, year, semester } = examOf(q);
  const prefix = kind === "ENAMED" ? "ENAMED" : "REV";
  return `${prefix}-${year}${semester ? `.${semester}` : ""}-Q${String(q.originalNumber).padStart(3, "0")}`;
}

// Caracteres de controle (exceto \t \n \r) quebram o protocolo do Postgres e indicam texto corrompido.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

/** Falha com o caminho exato do campo se algum texto vier corrompido da extração. */
function assertCleanText(value: unknown, where: string): void {
  if (typeof value === "string") {
    if (CONTROL_CHARS.test(value)) throw new Error(`Texto corrompido (caractere de controle) em ${where}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertCleanText(v, `${where}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertCleanText(v, `${where}.${k}`);
  }
}

// Texto-padrão das alternativas erradas na base atual: não explica nada, então não é carregado.
const PLACEHOLDER_EXPLANATION = "Alternativa incorreta.";

export function buildSeedRows() {
  const questions = ALL_CANONICAL_QUESTIONS as any[];
  for (const q of questions) assertCleanText(q, q.id);

  const exams = new Map<string, Row>();
  for (const q of questions) {
    const e = examOf(q);
    const current = exams.get(e.id);
    exams.set(e.id, {
      id: e.id,
      kind: e.kind,
      year: e.year,
      semester: e.semester,
      title: e.title,
      question_count: ((current?.question_count as number) ?? 0) + 1,
    });
  }

  // Sobras de rodapé da extração saem do texto, mas cada trecho removido fica registrado.
  const cleanups: Row[] = [];
  const clean = (questionId: string, field: string, text: string) => {
    const r = cleanQuestionText(text);
    for (const x of r.removed) cleanups.push({ question_id: questionId, field, rule: x.rule, removed_text: x.text });
    return r.text;
  };

  const questionRows: Row[] = questions.map((q) => ({
    id: q.id,
    code: questionCode(q),
    exam_id: examOf(q).id,
    number: q.originalNumber,
    booklet: q.originalBooklet ?? null,
    area: q.area,
    specialty: q.specialty ?? null,
    topic: q.topic,
    subtopic: q.subtopic ?? null,
    statement: clean(q.id, "statement", q.clinicalCase),
    options: (q.options ?? []).map((o: any) => ({
      id: o.id,
      text: clean(q.id, `option_${o.id}`, o.text),
      explanation: !o.explanation || o.explanation.trim() === PLACEHOLDER_EXPLANATION ? "" : o.explanation,
    })),
    correct_option: q.correctAnswer,
    status: q.officialStatus === "annulled" ? "annulled" : q.officialStatus === "changed_after_appeal" ? "changed_after_appeal" : "valid",
    key_finding: q.keyFinding ?? null,
    expected_conduct: q.expectedConduct ?? null,
    inep_intent: q.inepIntent ?? null,
    images: q.images ?? [],
    sources: q.sources ?? [],
    needs_image: citesFigure(q.clinicalCase),
  }));

  const stations = loadStations(stationsSeed);
  const events = loadEvents(eventsSeed, stations);

  const stationRows: Row[] = stations.map((s) => {
    const lite = toLite(s);
    return {
      id: lite.id,
      name: lite.name,
      topic: lite.topic,
      area: lite.area,
      setting: lite.setting,
      taxonomy_path: textArray(lite.taxonomy_path),
      goal: lite.goal,
      institution: lite.institution,
      year: lite.year,
      styles: textArray(lite.styles),
      is_pro_only: lite.is_pro_only,
      medical_review: lite.medical_review,
      max_score: lite.max_score,
      duration_ms: lite.duration_ms,
      created_at: lite.created_at,
    };
  });
  const contentRows: Row[] = stations.map((s) => ({ station_id: s.id, content: s }));
  const eventRows: Row[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    station_ids: textArray(e.station_ids),
    cover_url: e.cover_url,
    is_pro_only: e.is_pro_only,
    type: e.type,
  }));

  return { exams: [...exams.values()], questions: questionRows, cleanups, stations: stationRows, contents: contentRows, events: eventRows };
}

/** Comandos da carga, um por tabela e lotes de 100 questões (cada um cabe numa mensagem). */
export function buildSeedStatements(): string[] {
  const r = buildSeedRows();
  return [
    insert("public.exams", r.exams, "id"),
    ...Array.from({ length: Math.ceil(r.questions.length / 100) }, (_, i) =>
      insert("public.questions", r.questions.slice(i * 100, i * 100 + 100), "id")
    ),
    `delete from public.question_cleanups;\n${insert("public.question_cleanups", r.cleanups, "question_id, field, rule, removed_text")}`,
    insert("public.checklist_stations", r.stations, "id"),
    insert("public.checklist_station_contents", r.contents, "station_id"),
    insert("public.checklist_events", r.events, "id"),
  ].filter(Boolean);
}

export function buildSeedSql(): string {
  return ["-- Gerado por scripts/supabase/build-seed.ts. Não editar à mão.", "begin;", ...buildSeedStatements(), "commit;", ""].join("\n");
}
