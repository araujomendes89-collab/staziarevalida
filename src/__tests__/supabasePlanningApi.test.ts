// @vitest-environment node
/** Planejamento (supabase/migrations/…1100_planning_api.sql) num Postgres real em memória. */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
}

const answer = (uid: string, questionId: string, option: string, daysAgo = 0) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    await tx.query(`insert into public.question_attempts (question_id, selected_option) values ($1, $2)`, [questionId, option]);
    if (daysAgo) {
      await tx.exec(`reset role`);
      await tx.query(
        `update public.question_attempts set answered_at = answered_at - make_interval(days => $2)
         where seq = (select max(seq) from public.question_attempts where user_id = $1)`,
        [uid, daysAgo]
      );
    }
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev')`, [ANA, BRUNO]);
  await db.exec(`insert into public.exams (id, kind, year, title) values ('revalida-2021', 'REVALIDA', 2021, 'Revalida INEP 2021')`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: id, explanation: "" })));
  for (let n = 1; n <= 12; n++) {
    await db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option)
       values ($1, $2, 'revalida-2021', $3, 'CLINICA_MEDICA', 'Tema', 'Caso.', $4, 'B')`,
      [`q${n}`, `REV-2021-Q${n}`, n, options]
    );
  }
}, 60_000);

describe("Planejamento", () => {
  it("aluno novo: semana de segunda a domingo zerada, meta padrão e sem data de prova", async () => {
    const p = await rpc(ANA, "app_planning");
    const today = (await db.query<any>(`select public.today_br()::text as d, extract(isodow from public.today_br())::int as dow`)).rows[0];
    expect(p).toMatchObject({ today: today.d, exam_date: null, days_to_exam: null, daily_target: 20, month_active_days: [], last_7_days: 0, unanswered: 12, pool: 12 });
    expect(p.week).toHaveLength(7);
    expect(p.week.every((d: any) => d.questions === 0 && d.flashcards === 0)).toBe(true);
    expect(p.week[today.dow - 1].day).toBe(today.d);
    const monday = (await db.query<any>(`select extract(isodow from $1::date)::int as dow`, [p.week[0].day])).rows[0].dow;
    expect(monday).toBe(1);
  });

  it("usa o perfil e o histórico: meta pelo tempo diário, dias estudados e ritmo dos últimos 7 dias", async () => {
    await rpc(ANA, "app_update_profile", { p_patch: { exam_date: "2099-03-14", daily_minutes: 120, target_edition: "2027/1" } });
    await answer(ANA, "q1", "B");
    await answer(ANA, "q2", "A");
    await answer(ANA, "q3", "B", 3);
    await answer(ANA, "q4", "B", 10);

    const p = await rpc(ANA, "app_planning");
    expect(p).toMatchObject({ exam_date: "2099-03-14", target_edition: "2027/1", exam_type: "REVALIDA", daily_target: 30, last_7_days: 3, unanswered: 8 });
    expect(p.days_to_exam).toBeGreaterThan(20000);
    expect(p.week.find((d: any) => d.day === p.today)).toMatchObject({ questions: 2, correct: 1 });
    const todayNumber = Number(p.today.slice(8));
    expect(p.month_active_days).toContain(todayNumber);
    expect(p.week.reduce((n: number, d: any) => n + d.questions, 0)).toBeLessThanOrEqual(3);
  });

  it("cada aluno vê só o próprio; sem login não há planejamento", async () => {
    expect(await rpc(BRUNO, "app_planning")).toMatchObject({ last_7_days: 0, unanswered: 12, daily_target: 20 });
    expect(await rpc(null, "app_planning")).toBeNull();
  });

  it("a meta diária segue as faixas de tempo de estudo", async () => {
    const r = await db.query<any>(`select array[public.daily_question_target(null), public.daily_question_target(30), public.daily_question_target(60),
                                                public.daily_question_target(120), public.daily_question_target(180)] as t`);
    expect(r.rows[0].t).toEqual([20, 10, 20, 30, 50]);
  });
});
