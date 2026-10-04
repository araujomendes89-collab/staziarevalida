/**
 * Carga do pacote do motor de engenharia reversa (staziamed.revalida.import-package.v1) no banco:
 * imagens das questões, classificação detalhada (DNA) e questões equivalentes entre provas.
 * Só roda no servidor/linha de comando (lê arquivos); o texto das questões vem de seed-builder.ts.
 *
 * Confere o pacote antes de usar: hash dos arquivos e das imagens do manifesto.
 * Provas conhecidas como inválidas ficam de fora, com o motivo registrado (ver EXCLUDED_EXAMS).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { sqlLiteral } from "./seed-builder";

const ROOT = process.cwd();
export const PACKAGE_DIR = path.join(ROOT, "revalida-reverse-engine/data/exports/staziamed_import_ready/v1");
export const ASSETS_PUBLIC_DIR = path.join(ROOT, "public/question-assets");
export const ASSETS_URL = "/question-assets";

/** Provas do pacote que não podem entrar, com o motivo. */
export const EXCLUDED_EXAMS: Record<string, string> = {
  revalida_2020_2:
    "Os 100 enunciados são idênticos aos de revalida_2020_1 (as imagens também): o motor gerou 2020/2 a partir do PDF de 2020/1. Entra quando houver o caderno real de 2020/2.",
};

const EQUIVALENT_THRESHOLD = 0.75;

interface PackageQuestion {
  id: string;
  exam_id: string;
  question_number: number;
  status: string;
  stem: string;
  alternatives: Record<string, string>;
  dna: Record<string, any> | null;
  visual: { assets: { file: string; type: string; source_page?: number; sha256: string }[] };
}

const sha = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ");

export function loadEnginePackage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "manifest.json"), "utf8"));
  if (manifest.schema_version !== "staziamed.revalida.import-package.v1") throw new Error(`Pacote do motor com versão inesperada: ${manifest.schema_version}`);
  for (const [file, expected] of Object.entries<string>(manifest.files)) {
    if (sha(fs.readFileSync(path.join(PACKAGE_DIR, file))) !== expected) throw new Error(`Pacote do motor alterado: hash de ${file} não confere com o manifesto.`);
  }
  const all: PackageQuestion[] = fs
    .readFileSync(path.join(PACKAGE_DIR, "questions_all.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  return { manifest, questions: all.filter((q) => !EXCLUDED_EXAMS[q.exam_id]), excluded: all.filter((q) => EXCLUDED_EXAMS[q.exam_id]) };
}

/** Copia as imagens para public/question-assets (conferindo o hash de cada uma). */
export function syncAssets(manifest: { assets: Record<string, string> }, questions: PackageQuestion[]) {
  const used = new Set(questions.flatMap((q) => q.visual.assets.map((a) => a.file)));
  for (const file of used) {
    const expected = manifest.assets[file];
    if (!expected) throw new Error(`Imagem fora do manifesto: ${file}`);
    const source = fs.readFileSync(path.join(PACKAGE_DIR, file));
    if (sha(source) !== expected) throw new Error(`Imagem alterada: hash de ${file} não confere com o manifesto.`);
    const target = path.join(ASSETS_PUBLIC_DIR, file.replace(/^assets\//, ""));
    if (!fs.existsSync(target) || sha(fs.readFileSync(target)) !== expected) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
  }
  return used.size;
}

const shingles = (q: PackageQuestion, n = 5) => {
  const w = fold(`${q.stem} ${Object.values(q.alternatives).join(" ")}`).split(/\s+/).filter(Boolean);
  return new Set(Array.from({ length: Math.max(w.length - n + 1, 1) }, (_, i) => w.slice(i, i + n).join(" ")));
};

/** Pares de questões equivalentes em provas diferentes (similaridade de Jaccard dos 5-gramas). */
export function findEquivalents(questions: PackageQuestion[], threshold = EQUIVALENT_THRESHOLD) {
  const sets = questions.map((q) => shingles(q));
  const parent = questions.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const best = new Map<number, number>();
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      if (questions[i].exam_id === questions[j].exam_id) continue;
      let inter = 0;
      const [small, big] = sets[i].size < sets[j].size ? [sets[i], sets[j]] : [sets[j], sets[i]];
      for (const g of small) if (big.has(g)) inter++;
      const sim = inter / (sets[i].size + sets[j].size - inter);
      if (sim >= threshold) {
        parent[find(i)] = find(j);
        best.set(i, Math.max(best.get(i) ?? 0, sim));
        best.set(j, Math.max(best.get(j) ?? 0, sim));
      }
    }
  }
  return questions
    .map((q, i) => ({ q, i }))
    .filter(({ i }) => best.has(i))
    .map(({ q, i }) => ({ question_id: q.id, group_id: `eq_${questions[find(i)].id}`, similarity: Math.round(best.get(i)! * 1000) / 1000 }));
}

const AREA = { CLINICAL_MEDICINE: "CLINICA_MEDICA", GENERAL_SURGERY: "CIRURGIA_GERAL", OBSTETRICS_GYNECOLOGY: "GINECOLOGIA_OBSTETRICIA", PEDIATRICS: "PEDIATRIA", FAMILY_COMMUNITY_PUBLIC_HEALTH: "MEDICINA_FAMILIA_COMUNIDADE" } as const;
export const areaOf = (code: string | undefined) => (code ? AREA[code as keyof typeof AREA] ?? null : null);

// Caracteres de controle (ex.: \u0000) quebram o Postgres; a classificação do pacote traz alguns.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const scrub = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/\\u00(0[0-8bcBC]|0[eEfF]|1[0-9a-fA-F])/g, ""));
export const scrubText = (s: string) => s.replace(CONTROL, "");

const arr = (values: string[] | undefined) => (values?.length ? `array[${values.map(sqlLiteral).join(",")}]::text[]` : "'{}'::text[]");

export function buildEngineStatements(): string[] {
  const { manifest, questions } = loadEnginePackage();
  syncAssets(manifest, questions);
  const version = manifest.schema_version as string;
  const out: string[] = [];

  // imagens (o texto da questão continua vindo do seed-builder)
  const withImages = questions.filter((q) => q.visual.assets.length);
  for (const q of withImages) {
    const images = q.visual.assets.map((a, i) => ({
      url: `${ASSETS_URL}/${a.file.replace(/^assets\//, "")}`,
      alt: `Figura ${i + 1} da questão ${q.question_number}`,
      source_page: a.source_page ?? null,
      sha256: a.sha256,
    }));
    out.push(`update public.questions set images = ${sqlLiteral(images)} where id = ${sqlLiteral(q.id)};`);
  }

  // classificação detalhada
  const dna = questions.filter((q) => q.dna);
  const known = new Set<string>();
  const rows = dna.map((q) => {
    known.add(q.id);
    const d = scrub(q.dna!);
    const detail = {
      clinical_decision: d.clinical_decision,
      key_concepts: d.key_concepts,
      diagnoses_or_conditions: d.diagnoses_or_conditions,
      diagnostic_tests: d.diagnostic_tests,
      treatments_or_interventions: d.treatments_or_interventions,
      distractor_patterns: d.distractor_patterns,
      correct_answer_concept: d.correct_answer_concept,
      question_intent: d.question_intent,
      protocol_topics: d.protocol_topics,
    };
    return `(${[q.id, d.primary_subarea ?? null, d.primary_competency ?? null].map(sqlLiteral).join(", ")}, ${arr(d.secondary_competencies)}, ${[d.cognitive_task ?? null, d.care_setting ?? null, d.patient_group ?? null, d.urgency_level ?? null, d.question_format ?? null].map(sqlLiteral).join(", ")}, ${arr(d.reasoning_types)}, ${sqlLiteral(d.protocol_or_guideline_dependency == null ? null : String(d.protocol_or_guideline_dependency))}, ${sqlLiteral(d.difficulty_estimate ?? null)}, ${sqlLiteral(typeof d.classification_confidence === "number" ? d.classification_confidence : null)}, ${sqlLiteral(Boolean(d.review_required))}, ${sqlLiteral(d.review_reason ?? null)}, ${sqlLiteral(detail)}, ${sqlLiteral(version)})`;
  });
  const cols = "question_id, subarea, competency, secondary_competencies, cognitive_task, care_setting, patient_group, urgency_level, question_format, reasoning_types, protocol_dependency, difficulty_estimate, classification_confidence, review_required, review_reason, detail, dataset_version";
  const update = cols.split(", ").slice(1).map((c) => `${c} = excluded.${c}`).join(", ");
  for (let i = 0; i < rows.length; i += 100) {
    out.push(`insert into public.question_dna (${cols}) values\n${rows.slice(i, i + 100).join(",\n")}\non conflict (question_id) do update set ${update};`);
  }

  // área da questão vem da classificação do motor quando o banco não tiver a mesma (nunca inventada)
  const eq = findEquivalents(questions);
  out.push("delete from public.question_equivalents;");
  if (eq.length) {
    out.push(`insert into public.question_equivalents (question_id, group_id, similarity) values\n${eq.map((e) => `(${sqlLiteral(e.question_id)}, ${sqlLiteral(e.group_id)}, ${e.similarity})`).join(",\n")};`);
  }
  return out;
}
