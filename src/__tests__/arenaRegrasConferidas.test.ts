// @vitest-environment node
/**
 * Stazia Arena — regras conferidas (AR01) num Postgres real em memória (PGlite):
 *  1. o banco confere o tipo de cada regra ao salvar (número, lista, ligar/desligar, nome) e recusa com mensagem em português;
 *  2. o cálculo de XP nunca cancela a gravação do que o aluno fez: com uma regra ruim, a resposta é gravada,
 *     o XP daquela resposta fica de fora e a falha fica registrada (gamification_failures), visível na Administração.
 * Textos de teste, sem conteúdo clínico.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";
const CARLA = "00000000-0000-4000-8000-00000000000c";
const DIEGO = "00000000-0000-4000-8000-00000000000d";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const CARD = "10000000-0000-4000-8000-000000000001";

let db: PGlite;
const qs: string[] = [];

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))
    );
    return r.rows[0].result;
  });
}
const sql = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const ruleValue = async (key: string) => (await sql(`select value from public.gamification_rules where key = $1`, [key]))[0].value;
const failures = async (uid: string) => sql(`select * from public.gamification_failures where user_id = $1 order by id`, [uid]);

/** Simula um valor ruim que já estava gravado antes da conferência (passa por cima dos gatilhos da tabela). */
async function forceRule(key: string, valueJson: string) {
  await db.exec(`alter table public.gamification_rules disable trigger user`);
  try {
    await sql(`update public.gamification_rules set value = $2::jsonb where key = $1`, [key, valueJson]);
  } finally {
    await db.exec(`alter table public.gamification_rules enable trigger user`);
  }
}

/** Treino com as questões dadas, todas certas (B). */
async function practice(uid: string, ids: string[]) {
  const started = await rpc(uid, "app_start_session", { p_kind: "questoes", p_filters: { ids }, p_count: ids.length });
  await sql(`update public.practice_sessions set question_ids = $2 where id = $1`, [started.session_id, ids]);
  const answers: any[] = [];
  for (const id of ids) {
    answers.push(await rpc(uid, "app_answer_question", { p_session_id: started.session_id, p_question_id: id, p_option: "B", p_active_ms: 20000 }));
  }
  return { answers, sessionId: started.session_id as string };
}
const attemptOf = async (uid: string, questionId: string) =>
  (await sql(`select * from public.question_attempts where user_id = $1 and question_id = $2`, [uid, questionId]))[0];
const attemptEvents = async (uid: string, attemptId: string) =>
  sql(`select * from public.gamification_events where user_id = $1 and source_type = 'question_attempt' and source_id = $2`, [uid, attemptId]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev'), ($3, 'carla@teste.dev'), ($4, 'diego@teste.dev'), ($5, 'admin@teste.dev')`,
    [ANA, BRUNO, CARLA, DIEGO, ADMIN]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count)
                 values ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 100)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })));
  for (let n = 1; n <= 12; n++) {
    const id = `q${String(n).padStart(3, "0")}`;
    qs.push(id);
    await db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option)
       values ($1, $2, 'revalida-2024-1', $3, 'CLINICA_MEDICA'::public.med_area, 'tema de teste', $4, $5::jsonb, 'B')`,
      [id, `REV-2024-Q${String(n).padStart(3, "0")}`, n, `Enunciado de teste ${n}.`, options]
    );
  }
}, 300_000);

describe("O banco confere o tipo de cada regra ao salvar", () => {
  it("todas as regras de fábrica passam na conferência", async () => {
    const bad = await sql(`select key from public.gamification_rules where public.gam_rule_problem(key, value) is not null`);
    expect(bad).toEqual([]);
  });

  it("regra de número recusa texto, lista, verdadeiro/falso, negativo e número grande demais", async () => {
    for (const value of ["dez", "8", [8], true, null]) {
      await expect(rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: JSON.stringify(value), p_enabled: true }))
        .rejects.toThrow("A regra xp.question_correct precisa ser um número, sem aspas (por exemplo: 8).");
    }
    for (const value of [-1, 2_000_000]) {
      await expect(rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: value, p_enabled: true }))
        .rejects.toThrow("A regra xp.question_correct precisa ser um número entre 0 e 1.000.000.");
    }
    expect(await ruleValue("xp.question_correct")).toBe(8);
    const saved = await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: 9, p_enabled: true });
    expect(saved.rules.find((r: any) => r.key === "xp.question_correct").value).toBe(9);
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: 8, p_enabled: true });
  });

  it("interruptor só aceita ligado ou desligado (true/false)", async () => {
    for (const value of ["sim", "true", 1]) {
      await expect(rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "flags.coins_enabled", p_value: JSON.stringify(value), p_enabled: true }))
        .rejects.toThrow("A regra flags.coins_enabled é de ligar e desligar: use true (ligado) ou false (desligado).");
    }
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "flags.coins_enabled", p_value: false, p_enabled: true });
    expect(await ruleValue("flags.coins_enabled")).toBe(false);
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "flags.coins_enabled", p_value: true, p_enabled: true });
  });

  it("lista só aceita lista de números entre 0 e 1", async () => {
    for (const value of [1, [], ["a"], [1, 2], "1, 0.3"]) {
      await expect(rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "repeat.multipliers", p_value: JSON.stringify(value), p_enabled: true }))
        .rejects.toThrow("A regra repeat.multipliers precisa ser uma lista de números entre 0 e 1, por exemplo [1, 0.3, 0.1, 0].");
    }
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "repeat.multipliers", p_value: [1, 0.5, 0], p_enabled: true });
    expect(await ruleValue("repeat.multipliers")).toEqual([1, 0.5, 0]);
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "repeat.multipliers", p_value: [1, 0.3, 0.1, 0], p_enabled: true });
  });

  it("nome só aceita texto entre aspas, não vazio", async () => {
    for (const value of [5, "  ", ["Moedas"]]) {
      await expect(rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "names.coins", p_value: JSON.stringify(value), p_enabled: true }))
        .rejects.toThrow('A regra names.coins é um nome: escreva o texto entre aspas, por exemplo "Stazia Score".');
    }
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "names.coins", p_value: JSON.stringify("Moedas da Arena"), p_enabled: true });
    expect(await ruleValue("names.coins")).toBe("Moedas da Arena");
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "names.coins", p_value: JSON.stringify("Stazia Coins"), p_enabled: true });
  });

  it("a conferência vale também para gravação direta no banco, fora da tela", async () => {
    await expect(sql(`update public.gamification_rules set value = '"dez"' where key = 'xp.question_correct'`))
      .rejects.toThrow("A regra xp.question_correct precisa ser um número, sem aspas (por exemplo: 8).");
    await expect(sql(`insert into public.gamification_rules (key, value) values ('xp.nova_regra', '"cinco"')`))
      .rejects.toThrow("A regra xp.nova_regra precisa ser um número, sem aspas (por exemplo: 8).");
    expect(await ruleValue("xp.question_correct")).toBe(8);
  });
});

describe("O cálculo de XP nunca cancela o que o aluno fez", () => {
  it("regra de XP da resposta com valor ruim: a resposta é gravada, fica sem XP e a falha é registrada", async () => {
    await forceRule("xp.question_correct", '"dez"');
    try {
      const { answers } = await practice(ANA, [qs[0]]);
      expect(answers[0].is_correct).toBe(true);
      expect(answers[0].play.xp).toBeNull();
      const attempt = await attemptOf(ANA, qs[0]);
      expect(attempt).toBeTruthy();
      expect(await attemptEvents(ANA, attempt.id)).toEqual([]);
      const f = (await failures(ANA)).filter((x) => x.step === "question_attempt");
      expect(f.length).toBe(1);
      expect(f[0]).toMatchObject({ source_id: attempt.id, sqlstate: "22P02" });
      expect(f[0].bad_rules).toEqual(["xp.question_correct"]);
      expect((await sql(`select total_xp from public.user_gamification_stats where user_id = $1`, [ANA]))[0]?.total_xp ?? 0).toBe(0);
    } finally {
      await forceRule("xp.question_correct", "8");
    }
    // regra corrigida: a próxima resposta volta a render XP normalmente
    const { answers } = await practice(ANA, [qs[1]]);
    expect(answers[0].play.xp).toMatchObject({ correct: 8, valid: true });
  });

  it("regra usada depois da resposta (score) com valor ruim: a resposta e o XP dela ficam; a falha é registrada", async () => {
    await forceRule("score.max_step", '"quarenta"');
    try {
      const { answers } = await practice(BRUNO, [qs[2]]);
      expect(answers[0].play.xp).toMatchObject({ correct: 8, valid: true });
      const attempt = await attemptOf(BRUNO, qs[2]);
      expect((await attemptEvents(BRUNO, attempt.id)).length).toBe(1);
      const f = (await failures(BRUNO)).filter((x) => x.step === "after_activity");
      expect(f.length).toBe(1);
      expect(f[0].bad_rules).toEqual(["score.max_step"]);
    } finally {
      await forceRule("score.max_step", "40");
    }
  });

  it("interruptor geral com valor ruim: a resposta continua gravada", async () => {
    await forceRule("flags.gamification_enabled", '"sim"');
    try {
      const { answers } = await practice(BRUNO, [qs[3]]);
      expect(answers[0].is_correct).toBe(true);
      expect(answers[0].play).toBeNull();
      expect(await attemptOf(BRUNO, qs[3])).toBeTruthy();
      expect((await failures(BRUNO)).some((x) => x.step === "question_attempt")).toBe(true);
    } finally {
      await forceRule("flags.gamification_enabled", "true");
    }
  });

  it("simulado: finalizar grava todas as respostas mesmo com a regra de XP do simulado ruim", async () => {
    await forceRule("xp.simulation_completed", '"cem"');
    try {
      const ids = qs.slice(4, 7);
      const started = await rpc(CARLA, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 3, p_time_limit_seconds: 3600 });
      await sql(`update public.practice_sessions set question_ids = $2 where id = $1`, [started.session_id, ids]);
      for (const id of ids) await rpc(CARLA, "app_answer_question", { p_session_id: started.session_id, p_question_id: id, p_option: "B", p_active_ms: 30000 });
      const finished = await rpc(CARLA, "app_finish_session", { p_session_id: started.session_id });
      expect(finished).toBeTruthy();
      expect((await sql(`select count(*)::int as n from public.question_attempts where session_id = $1`, [started.session_id]))[0].n).toBe(3);
      expect((await sql(`select finished_at from public.practice_sessions where id = $1`, [started.session_id]))[0].finished_at).not.toBeNull();
      expect((await sql(`select count(*)::int as n from public.gamification_events where user_id = $1 and event_type = 'SIMULATION_COMPLETED'`, [CARLA]))[0].n).toBe(0);
      expect((await sql(`select count(*)::int as n from public.gamification_events where user_id = $1 and source_type = 'question_attempt'`, [CARLA]))[0].n).toBe(3);
      expect((await failures(CARLA)).map((x) => x.step)).toEqual(["session_finish"]);
    } finally {
      await forceRule("xp.simulation_completed", "100");
    }
  });

  it("flashcard, tarefa do plano e aula: a ação do aluno é gravada mesmo com a regra de XP ruim", async () => {
    await forceRule("xp.flashcard_reviewed", "[2]");
    await forceRule("xp.daily_goal", '"vinte"');
    await forceRule("xp.lesson_completed", "{}");
    try {
      await sql(`insert into public.flashcards (id, area, topic, front, back, published, review_status) values ($1, 'PEDIATRIA', 'tema', 'frente', 'verso', true, 'approved')`, [CARD]);
      const next = { due: new Date(Date.now() + 86_400_000).toISOString(), state: 1, stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduled_days: 1, elapsed_days: 0, learning_steps: 0 };
      await rpc(DIEGO, "app_review_flashcard", { p_card_id: CARD, p_rating: 3, p_next: next });
      expect((await sql(`select count(*)::int as n from public.flashcard_reviews where user_id = $1`, [DIEGO]))[0].n).toBe(1);

      const task = (await sql(`insert into public.plan_tasks (user_id, day, kind, title) values ($1, public.gam_today($1), 'praticar', 'tarefa de teste') returning id`, [DIEGO]))[0];
      await sql(`update public.plan_tasks set done_at = now() where id = $1`, [task.id]);
      expect((await sql(`select done_at from public.plan_tasks where id = $1`, [task.id]))[0].done_at).not.toBeNull();

      const lesson = (await sql(`insert into public.lessons (area, topic, title, published) values ('PEDIATRIA', 'tema', 'aula de teste', true) returning id`))[0];
      await sql(`insert into public.lesson_progress (user_id, lesson_id, completed_at, watched_to_end_at) values ($1, $2, now(), now())`, [DIEGO, lesson.id]);
      expect((await sql(`select completed_at from public.lesson_progress where user_id = $1`, [DIEGO]))[0].completed_at).not.toBeNull();

      expect((await failures(DIEGO)).map((x) => x.step).sort()).toEqual(["flashcard_review", "lesson", "plan_task"]);
      expect((await sql(`select count(*)::int as n from public.gamification_events where user_id = $1 and event_type in ('FLASHCARD_REVIEWED', 'DAILY_GOAL_COMPLETED', 'LESSON_COMPLETED')`, [DIEGO]))[0].n).toBe(0);
    } finally {
      await forceRule("xp.flashcard_reviewed", "2");
      await forceRule("xp.daily_goal", "25");
      await forceRule("xp.lesson_completed", "20");
    }
  });

  it("a Administração vê as falhas e as regras com problema; o aluno não lê o registro", async () => {
    await forceRule("xp.unseen_bonus", '"dois"');
    try {
      const a = await rpc(ADMIN, "app_admin_gamification");
      expect(a.metrics.xp_failures_7d).toBeGreaterThanOrEqual(7);
      expect(a.metrics.xp_failures_recent[0]).toMatchObject({ step: expect.any(String), created_at: expect.any(String) });
      expect(a.rule_problems).toEqual([{ key: "xp.unseen_bonus", problem: "A regra xp.unseen_bonus precisa ser um número, sem aspas (por exemplo: 8)." }]);
    } finally {
      await forceRule("xp.unseen_bonus", "2");
    }
    expect((await rpc(ADMIN, "app_admin_gamification")).rule_problems).toEqual([]);
    const seen = await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA })]);
      return (await tx.query(`select * from public.gamification_failures`)).rows;
    });
    expect(seen).toEqual([]);
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA })]);
      return tx.query(`select public.gam_log_failure($1, 'x', null, null, 'y')`, [ANA]);
    })).rejects.toThrow(/permission denied/);
  });
});
