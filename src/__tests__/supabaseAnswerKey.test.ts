// @vitest-environment node
/**
 * O gabarito não pode ser lido direto pelo aluno (nem pela tabela, nem pelas funções auxiliares):
 * a correção só sai depois de responder a questão ou de finalizar a sessão.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { buildSeedStatements } from "../../scripts/supabase/seed-builder";

const ROOT = path.resolve(__dirname, "../..");
const ANA = "00000000-0000-4000-8000-00000000000a";
const BIA = "00000000-0000-4000-8000-00000000000b";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
let db: PGlite;

type Q = (sql: string, p?: unknown[]) => Promise<any[]>;
async function as<T>(uid: string | null, fn: (q: Q) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return fn(async (sql, p = []) => (await tx.query<any>(sql, p)).rows);
  });
}
const KEY_FIELDS = ["correct_option", "explanation", "option_notes", "expected_conduct", "inep_intent"];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  }
  for (const statement of buildSeedStatements()) await db.exec(statement);
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bia@teste.dev'), ($3, 'editor@teste.dev')`, [ANA, BIA, EDITOR]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 180_000);

describe("Gabarito — leitura direta da tabela", () => {
  it("o aluno lê o enunciado, mas não as colunas que entregam a resposta", async () => {
    const rows = await as(ANA, (q) => q(`select id, statement, area, topic, images from public.questions limit 3`));
    expect(rows).toHaveLength(3);
    for (const column of ["correct_option", "options", "expected_conduct", "inep_intent", "key_finding"]) {
      await expect(as(ANA, (q) => q(`select ${column} from public.questions limit 1`)), column).rejects.toThrow(/permission denied/);
    }
    await expect(as(ANA, (q) => q(`select * from public.questions limit 1`))).rejects.toThrow(/permission denied/);
    await expect(as(ANA, (q) => q(`select to_jsonb(x) from public.questions x limit 1`))).rejects.toThrow(/permission denied/);
    // filtrar pela resposta também é ler a resposta
    await expect(as(ANA, (q) => q(`select id from public.questions where correct_option = 'A' limit 1`))).rejects.toThrow(/permission denied/);
  });

  it("o aluno não altera questão nem o próprio acerto", async () => {
    await expect(as(ANA, (q) => q(`update public.questions set statement = 'x' where id = (select id from public.questions limit 1) returning id`))).resolves.toEqual([]);
    await expect(as(ANA, (q) => q(`insert into public.question_attempts (question_id, selected_option, is_correct) select id, 'A', true from public.questions where status = 'valid' limit 1 returning is_correct`))).resolves.toBeDefined();
    // o banco corrige: marcar "acertei" na inserção não vale
    const forged = (await db.query<any>(`select a.is_correct, a.selected_option = q.correct_option as truth from public.question_attempts a join public.questions q on q.id = a.question_id where a.user_id = $1`, [ANA])).rows[0];
    expect(forged.is_correct).toBe(forged.truth);
    await db.query(`delete from public.question_attempts where user_id = $1`, [ANA]);
  });

  it("visitante sem login não vê questão nem correção", async () => {
    expect(await as(null, (q) => q(`select id from public.questions limit 1`))).toEqual([]);
    const id = (await db.query<any>(`select id from public.questions limit 1`)).rows[0].id;
    expect((await as(null, (q) => q(`select public.practice_question_view($1) as r`, [id])))[0].r).toBeNull();
    expect((await as(null, (q) => q(`select public.practice_correction_view($1, 'A') as r`, [id])))[0].r).toBeNull();
  });

  it("as funções antigas, que recebiam a linha inteira, não existem mais", async () => {
    const r = await db.query<any>(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('practice_question', 'practice_correction')`);
    expect(r.rows).toEqual([]);
  });
});

describe("Gabarito — correção só depois de responder", () => {
  it("treino: sem resposta não há correção (nem chamando a função direto); depois de responder, há", async () => {
    const started = (await as(ANA, (q) => q(`select public.app_start_session('questoes', '{}'::jsonb, 5) as r`)))[0].r;
    const session = (await as(ANA, (q) => q(`select public.app_get_session($1) as r`, [started.session_id])))[0].r;
    expect(session.questions).toHaveLength(5);
    for (const question of session.questions) {
      expect(question.correction).toBeNull();
      for (const field of KEY_FIELDS) expect(question).not.toHaveProperty(field);
      expect(Object.keys(question.options[0]).sort()).toEqual(["id", "text"]);
    }
    const first = session.questions[0].id;
    expect((await as(ANA, (q) => q(`select public.practice_correction_view($1, 'A') as r`, [first])))[0].r).toBeNull();

    const answered = (await as(ANA, (q) => q(`select public.app_answer_question($1, $2, 'A') as r`, [started.session_id, first])))[0].r;
    const truth = (await db.query<any>(`select correct_option from public.questions where id = $1`, [first])).rows[0].correct_option;
    expect(answered).toMatchObject({ selected: "A", correct_option: truth, is_correct: truth === "A" });

    // a mesma questão, para outra aluna que não respondeu, continua fechada
    expect((await as(BIA, (q) => q(`select public.practice_correction_view($1, 'A') as r`, [first])))[0].r).toBeNull();
    // as outras questões da sessão continuam fechadas para a própria Ana
    const second = session.questions[1].id;
    expect((await as(ANA, (q) => q(`select public.practice_correction_view($1, 'A') as r`, [second])))[0].r).toBeNull();
    const again = (await as(ANA, (q) => q(`select public.app_get_session($1) as r`, [started.session_id])))[0].r;
    expect(again.questions.map((x: any) => x.correction !== null)).toEqual([true, false, false, false, false]);
  });

  it("simulado: guardar a resposta não revela nada; finalizar revela tudo, inclusive as em branco", async () => {
    const started = (await as(BIA, (q) => q(`select public.app_start_session('simulado', '{}'::jsonb, 4, 3600) as r`)))[0].r;
    const session = (await as(BIA, (q) => q(`select public.app_get_session($1) as r`, [started.session_id])))[0].r;
    const [q1, q2] = session.questions.map((x: any) => x.id);
    expect((await as(BIA, (q) => q(`select public.app_answer_question($1, $2, 'B') as r`, [started.session_id, q1])))[0].r).toEqual({ saved: true });
    expect((await as(BIA, (q) => q(`select public.practice_correction_view($1, 'B') as r`, [q1])))[0].r).toBeNull();
    const during = (await as(BIA, (q) => q(`select public.app_get_session($1) as r`, [started.session_id])))[0].r;
    expect(during.questions.every((x: any) => x.correction === null)).toBe(true);

    const finished = (await as(BIA, (q) => q(`select public.app_finish_session($1) as r`, [started.session_id])))[0].r;
    expect(finished.questions.every((x: any) => x.correction && x.correction.correct_option)).toBe(true);
    expect(finished.questions.find((x: any) => x.id === q2).selected).toBeNull();
    // a sessão finalizada é dela: outra aluna não ganha a correção por tabela
    expect((await as(ANA, (q) => q(`select public.practice_correction_view($1, null) as r`, [q2])))[0].r).toBeNull();
  });

  it("caderno de erros: só questão que a aluna errou, com a correção", async () => {
    const wrong = (await db.query<any>(`select a.question_id from public.question_attempts a where a.user_id = $1 and not a.is_correct limit 1`, [BIA])).rows[0];
    if (wrong) {
      const detail = (await as(BIA, (q) => q(`select public.app_error_detail($1) as r`, [wrong.question_id])))[0].r;
      expect(detail.correction.correct_option).toMatch(/^[A-D]$/);
    }
    const never = (await db.query<any>(`select id from public.questions q where status = 'valid' and not exists (select 1 from public.question_attempts a where a.question_id = q.id) limit 1`)).rows[0].id;
    expect((await as(BIA, (q) => q(`select public.app_error_detail($1) as r`, [never])))[0]?.r ?? null).toBeNull();
  });

  it("a equipe vê a correção para revisar o banco", async () => {
    const id = (await db.query<any>(`select id from public.questions where status = 'valid' limit 1`)).rows[0].id;
    const r = (await as(EDITOR, (q) => q(`select public.practice_correction_view($1, null) as r`, [id])))[0].r;
    expect(r.correct_option).toMatch(/^[A-D]$/);
  });
});
