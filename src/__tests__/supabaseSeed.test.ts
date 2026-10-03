// @vitest-environment node
/**
 * A carga real (scripts/supabase/build-seed.ts) entra no esquema sem violar nenhuma
 * restrição, e os dados ficam consultáveis como o app novo vai precisar.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { buildSeedRows, buildSeedStatements } from "../../scripts/supabase/build-seed";

const ROOT = path.resolve(__dirname, "../..");
const ANA = "00000000-0000-4000-8000-00000000000a";
let db: PGlite;

async function asStudent<T>(fn: (q: (sql: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA })]);
    return fn(async (sql, p = []) => (await tx.query<any>(sql, p)).rows);
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  }
  for (const statement of buildSeedStatements()) await db.exec(statement);
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev')`, [ANA]);
}, 120_000);

describe("Carga real no Supabase", () => {
  it("entram 12 provas, 1.200 questões, 10 estações e 1 simulado", async () => {
    const r = await db.query<any>(`
      select (select count(*) from public.exams)::int as exams,
             (select count(*) from public.questions)::int as questions,
             (select count(distinct code) from public.questions)::int as codes,
             (select count(*) from public.questions where status = 'annulled')::int as annulled,
             (select count(*) from public.checklist_stations)::int as stations,
             (select count(*) from public.checklist_events)::int as events`);
    expect(r.rows[0]).toEqual({ exams: 12, questions: 1200, codes: 1200, annulled: 83, stations: 10, events: 1 });
  });

  it("cada prova tem 100 questões e os códigos incluem a edição", async () => {
    const r = await db.query<any>(`select id, question_count from public.exams order by id`);
    expect(r.rows.every((e: any) => e.question_count === 100)).toBe(true);
    const codes = buildSeedRows().questions.filter((q) => String(q.code).startsWith("REV-2025")).map((q) => q.code);
    expect(codes).toContain("REV-2025.1-Q001");
    expect(codes).toContain("REV-2025.2-Q001");
  });

  it("não carrega os rótulos fabricados nem o gabarito dentro das alternativas", () => {
    const q = buildSeedRows().questions[0] as any;
    for (const field of ["stats", "extractionConfidence", "difficultySource", "difficulty"]) {
      expect(q).not.toHaveProperty(field);
    }
    expect(Object.keys(q.options[0]).sort()).toEqual(["explanation", "id", "text"]);
  });

  it("busca em português encontra questões por tema e por palavras do enunciado", async () => {
    const r = await asStudent((q) =>
      q(`select count(*)::int as n from public.questions where search @@ websearch_to_tsquery('portuguese', 'pré-eclâmpsia')`)
    );
    expect(r[0].n).toBeGreaterThan(5);
  });

  it("estações do seed ficam ocultas para alunos até a revisão médica", async () => {
    expect(await asStudent((q) => q(`select id from public.checklist_stations`))).toEqual([]);
  });

  it("correção de uma questão real usa o gabarito do banco", async () => {
    const { id, correct_option } = (await db.query<any>(`select id, correct_option from public.questions where status = 'valid' limit 1`)).rows[0];
    const wrong = ["A", "B", "C", "D"].find((o) => o !== correct_option);
    const r = await asStudent((q) =>
      q(
        `insert into public.question_attempts (question_id, selected_option) values ($1, $2), ($1, $3)
         returning selected_option, is_correct`,
        [id, correct_option, wrong]
      )
    );
    expect(r).toEqual([
      { selected_option: correct_option, is_correct: true },
      { selected_option: wrong, is_correct: false },
    ]);
  });
});
