// @vitest-environment node
/**
 * Início e Plano de hoje (supabase/migrations/…0800_home_api.sql) num Postgres real em memória:
 * o plano nasce do histórico do aluno, conclui sozinho e respeita o que ele marca à mão.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const AREAS = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"];
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

/** Responde a sessão inteira: `wrong` primeiras erradas (A), o resto certo (B). Devolve a sessão finalizada. */
async function answerAll(uid: string, sessionId: string, wrong: number) {
  const session = await rpc(uid, "app_get_session", { p_session_id: sessionId });
  for (const [i, q] of session.questions.entries()) {
    await rpc(uid, "app_answer_question", { p_session_id: sessionId, p_question_id: q.id, p_option: i < wrong ? "A" : "B" });
  }
  return rpc(uid, "app_finish_session", { p_session_id: sessionId });
}

/** Empurra todo o histórico do aluno um dia para trás (como se hoje fosse amanhã). */
async function nextDay() {
  await db.exec(`
    update public.plan_tasks set day = day - 1;
    update public.question_attempts set answered_at = answered_at - interval '1 day';
    update public.practice_sessions set started_at = started_at - interval '1 day', finished_at = finished_at - interval '1 day';
  `);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev')`, [ANA, BRUNO]);
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count)
                 values ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 30)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })));
  let number = 0;
  for (const [a, area] of AREAS.entries()) {
    for (let n = 1; n <= 6; n++) {
      await db.query(
        `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option)
         values ($1, $2, 'revalida-2024-1', $3, $4, $5, $6, $7, 'B')`,
        [`q-${a}-${n}`, `T-${a}-${n}`, ++number, area, `Tema ${a}.${Math.ceil(n / 2)}`, `Caso clínico ${a}-${n}.`, options]
      );
    }
  }
}, 60_000);

describe("Início — aluno novo", () => {
  it("o plano começa pelo diagnóstico e a tela inicial não inventa números", async () => {
    const plan = await rpc(ANA, "app_today");
    expect(plan).toMatchObject({ done: 0, total: 1 });
    expect(plan.tasks[0]).toMatchObject({
      kind: "praticar",
      title: "Diagnóstico inicial: 10 questões nas 5 grandes áreas",
      minutes: 20,
      done: false,
      progress: 0,
      target: 10,
      ref: { reason: "diagnostic", count: 10 },
    });
    // chamar de novo não duplica tarefas
    expect((await rpc(ANA, "app_today")).tasks.map((t: any) => t.id)).toEqual([plan.tasks[0].id]);

    const home = await rpc(ANA, "app_home");
    expect(home).toMatchObject({ attempts: 0, correct: 0, wrong_pending: 0, priority_topics: [], open_session: null });
    expect(home.week).toEqual({ attempts: 0, correct: 0, days_active: 0 });
    expect(home.areas.map((a: any) => [a.area, a.attempts])).toEqual(AREAS.map((a) => [a, 0]));
    expect(home.trial.days_left).toBe(7);
  });

  it("sem login não há plano", async () => {
    expect(await rpc(null, "app_today")).toBeNull();
    expect((await rpc(null, "app_home")).attempts).toBe(0);
  });
});

describe("Plano de hoje — ciclo do dia", () => {
  let diagnostic: any;

  it("abrir a tarefa cria o treino do diagnóstico, que aparece em 'continuar'", async () => {
    diagnostic = (await rpc(ANA, "app_today")).tasks[0];
    const started = await rpc(ANA, "app_start_plan_task", { p_task_id: diagnostic.id });
    expect(started.count).toBe(10);
    expect((await rpc(ANA, "app_home")).open_session).toMatchObject({ id: started.session_id, kind: "questoes", total: 10, answered: 0, area: null });

    const done = await answerAll(ANA, started.session_id, 4);
    expect(done.result).toMatchObject({ total: 10, answered: 10, correct: 6 });
  });

  it("cumprida a meta, a tarefa conclui sozinha e surge a revisão dos erros", async () => {
    const plan = await rpc(ANA, "app_today");
    expect(plan).toMatchObject({ done: 1, total: 2 });
    expect(plan.tasks[0]).toMatchObject({ id: diagnostic.id, done: true, progress: 10, target: 10 });
    expect(plan.tasks[1]).toMatchObject({ kind: "revisar", title: "Rever 4 questões erradas", minutes: 8, done: false, progress: 0, target: 4 });

    const home = await rpc(ANA, "app_home");
    expect(home).toMatchObject({ attempts: 10, correct: 6, wrong_pending: 4, open_session: null });
    expect(home.today).toEqual({ attempts: 10, correct: 6 });
    expect(home.week).toEqual({ attempts: 10, correct: 6, days_active: 1 });
    expect(home.previous_week).toEqual({ attempts: 0, correct: 0 });
    expect(home.areas.reduce((n: number, a: any) => n + a.attempts, 0)).toBe(10);
    expect(home.priority_topics.length).toBeGreaterThan(0);
    expect(home.priority_topics.length).toBeLessThanOrEqual(4);
    expect(home.priority_topics.reduce((n: number, t: any) => n + t.pending, 0)).toBeLessThanOrEqual(4);
    expect(home.priority_topics[0]).toMatchObject({ questions: 2 });
  });

  it("desmarcar à mão vale mais que a conclusão automática", async () => {
    let plan = await rpc(ANA, "app_set_plan_task", { p_task_id: diagnostic.id, p_done: false });
    expect(plan.tasks[0].done).toBe(false);
    expect((await rpc(ANA, "app_today")).tasks[0].done).toBe(false);
    plan = await rpc(ANA, "app_set_plan_task", { p_task_id: diagnostic.id, p_done: true });
    expect(plan).toMatchObject({ done: 1, total: 2 });
    expect(plan.tasks[0].ref).not.toHaveProperty("manual");
  });

  it("a revisão abre só as erradas e o progresso dela não se mistura com o da prática", async () => {
    const review = (await rpc(ANA, "app_today")).tasks[1];
    const started = await rpc(ANA, "app_start_plan_task", { p_task_id: review.id });
    expect(started.count).toBe(4);
    const session = await rpc(ANA, "app_get_session", { p_session_id: started.session_id });
    expect(session.filters).toEqual({ status: "wrong" });
    expect((await rpc(ANA, "app_home")).open_session).toMatchObject({ id: started.session_id, status: "wrong", total: 4, answered: 0 });

    await rpc(ANA, "app_answer_question", { p_session_id: started.session_id, p_question_id: session.questions[0].id, p_option: "B" });
    let plan = await rpc(ANA, "app_today");
    expect(plan.tasks[1]).toMatchObject({ progress: 1, target: 4, done: false });
    expect(plan.tasks[0]).toMatchObject({ progress: 10 });
    // abrir de novo pede só o que falta
    expect((await rpc(ANA, "app_start_plan_task", { p_task_id: review.id })).count).toBe(3);

    for (const q of session.questions.slice(1)) {
      await rpc(ANA, "app_answer_question", { p_session_id: started.session_id, p_question_id: q.id, p_option: "B" });
    }
    plan = await rpc(ANA, "app_today");
    expect(plan).toMatchObject({ done: 2, total: 2 });
    expect((await rpc(ANA, "app_home")).wrong_pending).toBe(0);
  });

  it("outro aluno não mexe nas tarefas alheias", async () => {
    await expect(rpc(BRUNO, "app_set_plan_task", { p_task_id: diagnostic.id, p_done: false })).rejects.toThrow(/não encontrada/);
    await expect(rpc(BRUNO, "app_start_plan_task", { p_task_id: diagnostic.id })).rejects.toThrow(/não encontrada/);
    expect((await rpc(BRUNO, "app_today")).tasks).toHaveLength(1);
  });
});

describe("Plano de hoje — a revisão acompanha o caderno de erros", () => {
  const answer = (questionId: string, option: string) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: BRUNO })]);
      await tx.query(`insert into public.question_attempts (question_id, selected_option) values ($1, $2)`, [questionId, option]);
    });
  const review = async () => (await rpc(BRUNO, "app_today")).tasks.find((t: any) => t.kind === "revisar");

  it("a meta cresce com novos erros e some quando eles são superados sem revisão", async () => {
    expect(await review()).toBeUndefined();

    await answer("q-0-1", "A");
    expect(await review()).toMatchObject({ title: "Rever 1 questão errada", target: 1, minutes: 2 });

    await answer("q-0-2", "A");
    await answer("q-0-3", "A");
    const grown = await review();
    expect(grown).toMatchObject({ title: "Rever 3 questões erradas", target: 3, minutes: 6, progress: 0, done: false });

    for (const id of ["q-0-1", "q-0-2", "q-0-3"]) await answer(id, "B");
    expect(await review()).toBeUndefined();
    expect((await rpc(BRUNO, "app_home")).wrong_pending).toBe(0);
  });
});

describe("Plano de hoje — dias seguintes", () => {
  it("com áreas pouco treinadas, puxa a menos treinada; o tempo por dia define a quantidade", async () => {
    await nextDay();
    await db.exec(`update public.practice_sessions set finished_at = now() where finished_at is null`);

    let plan = await rpc(ANA, "app_today");
    const task = plan.tasks.find((t: any) => t.kind === "praticar");
    expect(task.ref).toMatchObject({ reason: "untrained", count: 20 });
    expect(task.ref.attempts).toBeLessThan(5);
    expect(task.title).toMatch(/^20 questões de /);
    expect(task.minutes).toBe(40);
    expect(plan.tasks.some((t: any) => t.kind === "revisar")).toBe(false);

    // opções novas do "Personalizar plano" (17/10/2026): o Plano de hoje usa a mesma regra de daily_question_target
    for (const [minutos, questoes] of [[15, 5], [45, 15], [90, 25], [240, 65], [300, 80]]) {
      await rpc(ANA, "app_update_profile", { p_patch: { daily_minutes: minutos } });
      plan = await rpc(ANA, "app_today", { p_rebuild: true });
      expect(plan.tasks[0]).toMatchObject({ target: questoes, minutes: questoes * 2 });
    }

    await rpc(ANA, "app_update_profile", { p_patch: { daily_minutes: 30 } });
    plan = await rpc(ANA, "app_today", { p_rebuild: true });
    expect(plan.tasks[0]).toMatchObject({ target: 10, minutes: 20 });
    expect(plan.tasks[0].title).toMatch(/^10 questões de /);

    // a tarefa abre um treino só da área, e com as inéditas primeiro
    const started = await rpc(ANA, "app_start_plan_task", { p_task_id: plan.tasks[0].id });
    const session = await rpc(ANA, "app_get_session", { p_session_id: started.session_id });
    expect(new Set(session.questions.map((q: any) => q.area))).toEqual(new Set([plan.tasks[0].ref.area]));
    await rpc(ANA, "app_finish_session", { p_session_id: started.session_id });
  });

  it("com todas as áreas treinadas, puxa a de menor acurácia", async () => {
    // 6 respostas por área; só Pediatria com tudo errado
    await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA })]);
      await tx.exec(`
        insert into public.question_attempts (question_id, selected_option)
        select q.id, case when q.area = 'PEDIATRIA' then 'A' else 'B' end from public.questions q
      `);
    });
    await nextDay();

    const plan = await rpc(ANA, "app_today");
    const task = plan.tasks.find((t: any) => t.kind === "praticar");
    expect(task.ref).toMatchObject({ reason: "lowest_accuracy", area: "PEDIATRIA" });
    expect(task.title).toBe("10 questões de Pediatria");
    expect(plan.tasks.find((t: any) => t.kind === "revisar")).toMatchObject({ title: "Rever 6 questões erradas" });

    const home = await rpc(ANA, "app_home");
    expect(home.previous_week.attempts).toBe(0);
    expect(home.week.days_active).toBeGreaterThanOrEqual(2);
    expect(home.priority_topics.every((t: any) => t.area === "PEDIATRIA")).toBe(true);
  });
});
