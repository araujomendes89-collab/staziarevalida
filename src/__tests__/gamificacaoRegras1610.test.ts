// @vitest-environment node
/**
 * Regras novas da Arena de 16/10/2026 (supabase/migrations/20261003013000_gamificacao_regras_1610.sql), num Postgres real em
 * memória com TODAS as migrações. Cada brecha da auditoria (G01, G02, G04, G05, G06 e o "errar de propósito") é reproduzida
 * como o aluno tentaria, e o teste exige que a tentativa NÃO renda nada. Também confere: -20% de XP, erro sem XP, trava de
 * 3 dias, chute com multa, moedas menores, bônus de sessão uma vez por dia e ligas com 10%.
 *
 * As chamadas do aluno passam como a API passaria: com o caminho do PostgREST em request.path ("/rpc/app_..." para função,
 * "/tabela" para gravação direta). O tempo é simulado empurrando o início da sessão e as respostas para trás.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const AREAS = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"];
const ANA = "00000000-0000-4000-8000-0000000000a1";
const BIA = "00000000-0000-4000-8000-0000000000b1";
const CAIO = "00000000-0000-4000-8000-0000000000c1";
const DORA = "00000000-0000-4000-8000-0000000000d1";
const EDU = "00000000-0000-4000-8000-0000000000e1";
const FABI = "00000000-0000-4000-8000-0000000000f1";
const PER_AREA = 40;

let db: PGlite;
const ids: Record<string, string[]> = {};
let qn = 0;
const novas = (area: string, n: number) => {
  // questões ainda não usadas por nenhum teste (cada teste pega as suas)
  const out = ids[area].splice(0, n);
  if (out.length < n) throw new Error("acabaram as questões de teste");
  return out;
};

async function call<T = any>(uid: string, apiPath: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true), set_config('request.path', $2, true)`, [JSON.stringify({ sub: uid }), apiPath]);
    return tx.query<T>(sql, params);
  });
}
async function rpc<T = any>(uid: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const r = await call<{ result: T }>(
    uid,
    `/rpc/${fn}`,
    `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
    keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))
  );
  return r.rows[0].result;
}
const sql = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const stats = async (uid: string) => (await sql(`select * from public.user_gamification_stats where user_id = $1`, [uid]))[0];
const events = async (uid: string, type?: string) =>
  sql(`select * from public.gamification_events where user_id = $1 and ($2::text is null or event_type = $2) order by id`, [uid, type ?? null]);
const ledgerXp = async (uid: string) => (await sql(`select coalesce(sum(xp_awarded), 0)::int as s from public.gamification_events where user_id = $1`, [uid]))[0].s;

/** O tempo passa: empurra para trás o início da sessão, as respostas dela e os salvamentos do simulado. */
async function passa(sessionId: string, ms: number) {
  const iv = `${ms} milliseconds`;
  await sql(
    `update public.practice_sessions set started_at = started_at - $2::interval,
       answers = coalesce((select jsonb_object_agg(k, case when v ? 'at' then jsonb_set(v, '{at}', to_jsonb((v ->> 'at')::timestamptz - $2::interval)) else v end)
                           from jsonb_each(answers) e (k, v)), '{}'::jsonb)
     where id = $1`,
    [sessionId, iv]
  );
  await sql(`update public.question_attempts set answered_at = answered_at - $2::interval where session_id = $1`, [sessionId, iv]);
}

async function sessao(uid: string, kind: "questoes" | "simulado", qids: string[]) {
  const started = await rpc(uid, "app_start_session", { p_kind: kind, p_filters: {}, p_count: qids.length, ...(kind === "simulado" ? { p_time_limit_seconds: 3 * 3600 } : {}) });
  await sql(`update public.practice_sessions set question_ids = $2 where id = $1`, [started.session_id, qids]);
  return started.session_id as string;
}

/** Treino: lê cada questão por `readMs` (tempo real que passa) e manda `clientMs` como o navegador mandaria. */
async function treino(uid: string, qids: string[], right: (i: number) => boolean, opts: { readMs?: number; clientMs?: number | null } = {}) {
  const sid = await sessao(uid, "questoes", qids);
  const answers: any[] = [];
  for (const [i, id] of qids.entries()) {
    await passa(sid, opts.readMs ?? 30_000);
    answers.push(await rpc(uid, "app_answer_question", { p_session_id: sid, p_question_id: id, p_option: right(i) ? "B" : "A", p_active_ms: opts.clientMs === undefined ? 20_000 : opts.clientMs }));
  }
  await rpc(uid, "app_finish_session", { p_session_id: sid });
  return { sid, answers };
}

/** Todo o histórico de um aluno vai N dias para trás (como se tivessem passado N dias). */
async function diasDepois(uid: string, days: number) {
  const iv = `${days} days`;
  await sql(`update public.question_attempts set answered_at = answered_at - $2::interval where user_id = $1`, [uid, iv]);
  await sql(`update public.practice_sessions set started_at = started_at - $2::interval, finished_at = finished_at - $2::interval where user_id = $1`, [uid, iv]);
  await sql(`update public.gamification_events set created_at = created_at - $2::interval where user_id = $1`, [uid, iv]);
  await sql(`delete from public.user_missions where user_id = $1`, [uid]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(
    `insert into auth.users (id, email) values ($1, 'ana@t.dev'), ($2, 'bia@t.dev'), ($3, 'caio@t.dev'), ($4, 'dora@t.dev'), ($5, 'edu@t.dev'), ($6, 'fabi@t.dev')`,
    [ANA, BIA, CAIO, DORA, EDU, FABI]
  );
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count) values ('rev-2024-1', 'REVALIDA', 2024, 1, 'Revalida 2024/1', 100)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })));
  for (const area of AREAS) {
    ids[area] = [];
    for (let k = 1; k <= PER_AREA; k++) {
      qn++;
      const id = `q${String(qn).padStart(3, "0")}`;
      ids[area].push(id);
      await db.query(
        `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option)
         values ($1, $2, 'rev-2024-1', $3, $4::public.med_area, $5, $6, $7::jsonb, 'B')`,
        [id, `REV-${qn}`, qn, area, `${area} tema ${k % 4}`, `Enunciado da questão ${qn}. Qual a conduta?`, options]
      );
    }
  }
  await db.query(`insert into public.question_dna (question_id, difficulty_estimate, dataset_version) values ('q001', 'HIGH', 'teste')`);
}, 300_000);

describe("valores novos (-20%) e registro do que mudou", () => {
  it("regras, missões e medalhas com -20% de XP e moedas menores; o antes fica guardado", async () => {
    const r = Object.fromEntries((await sql(`select key, value, enabled from public.gamification_rules`)).map((x: any) => [x.key, x]));
    expect(r["xp.question_correct"].value).toBe(6);
    expect(r["xp.simulation_completed"].value).toBe(80);
    expect(r["xp.daily_goal"].value).toBe(20);
    expect(r["repeat.lock_days"].value).toBe(3);
    expect(r["coins.correct_every"].value).toBe(10);
    expect(r["league.promote_pct"].value).toBe(10);
    expect(r["league.promote"].enabled).toBe(false);
    const m = Object.fromEntries((await sql(`select slug, xp_reward, coins_reward from public.missions`)).map((x: any) => [x.slug, x]));
    expect(m.daily_correct).toMatchObject({ xp_reward: 12, coins_reward: 1 });
    expect(m.weekly_questions).toMatchObject({ xp_reward: 48, coins_reward: 5 });
    const a = Object.fromEntries((await sql(`select slug, xp_reward, coins_reward from public.achievements`)).map((x: any) => [x.slug, x]));
    expect(a.streak_365).toMatchObject({ xp_reward: 800, coins_reward: 250 });
    expect(a.primeiros_passos).toMatchObject({ xp_reward: 8, coins_reward: 3 });
    const job = (await sql(`select result from public.gamification_jobs where job = 'regras_1610'`))[0].result;
    expect(job.regras_antes["xp.question_correct"].value).toBe(8);
    expect(job.missoes_antes.daily_correct).toEqual({ xp: 15, coins: 5 });
  });

  it("acerto de primeira vale 12 (difícil 15); erro vale 0 XP e 0 moedas, mas conta na precisão", async () => {
    const [q1, q2, q3] = ["q001", "q002", "q003"];
    ids.CLINICA_MEDICA = ids.CLINICA_MEDICA.filter((x) => ![q1, q2, q3].includes(x));
    const { answers } = await treino(ANA, [q1, q2, q3], (i) => i < 2);
    expect(answers[0].play.xp).toMatchObject({ base: 2, correct: 6, difficulty_bonus: 3, first_attempt_bonus: 2, unseen_bonus: 2, total: 15, valid: true });
    expect(answers[1].play.xp).toMatchObject({ total: 12, valid: true });
    expect(answers[2].play.xp).toMatchObject({ total: 0, valid: true });
    expect(answers[2].play.correct).toBe(false);
    expect(answers[2].play.coins).toBe(0);
    const s = await stats(ANA);
    expect(s).toMatchObject({ total_xp: 27, questions_answered: 3, correct_answers: 2, wrong_answers: 1 });
    expect(s.total_xp).toBe(await ledgerXp(ANA)); // agregado = livro-razão
  });
});

describe("errar de propósito e refazer não rende mais (trava de 3 dias)", () => {
  it("errou e refez certo na hora: não vale (repeat_lock); 3 dias depois vale como revisão", async () => {
    const [id] = novas("CIRURGIA_GERAL", 1);
    const a1 = (await treino(BIA, [id], () => false)).answers[0];
    expect(a1.play.xp).toMatchObject({ total: 0, valid: true });
    const a2 = (await treino(BIA, [id], () => true)).answers[0];
    expect(a2.play.xp).toMatchObject({ total: 0, valid: false, reason: "repeat_lock" });
    expect(a2.play.lock_days).toBe(3);
    // a trava conta da ÚLTIMA resposta (a de agora): só 3 dias depois dela
    await diasDepois(BIA, 2);
    const a3 = (await treino(BIA, [id], () => true)).answers[0];
    expect(a3.play.xp.reason).toBe("repeat_lock");
    await diasDepois(BIA, 3);
    const a4 = (await treino(BIA, [id], () => true)).answers[0];
    // 4ª tentativa: multiplicador 0 → nada (já não era "corrigir erro": a anterior foi certa)
    expect(a4.play.xp).toMatchObject({ total: 0, valid: false, reason: "repeated_question_farming" });
  });

  it("errou, esperou 3 dias e acertou: 2 + 4 (revisão) + 8 (correção) = 14, menos que errar não rendeu nada", async () => {
    const [id] = novas("CIRURGIA_GERAL", 1);
    await treino(CAIO, [id], () => false);
    await diasDepois(CAIO, 3);
    const a2 = (await treino(CAIO, [id], () => true)).answers[0];
    // (2 + 6) × 0,3 = 2,4 → 2; + 4 + 8
    expect(a2.play.xp).toMatchObject({ multiplier: 0.3, review_bonus: 4, fix_bonus: 8, total: 14, valid: true });
  });
});

describe("chute: zera e, do 3º no dia, multa de 5 XP", () => {
  it("resposta abaixo do tempo mínimo de leitura é chute (0 XP); do 3º chute em diante tira 5 XP, sem deixar negativo", async () => {
    const base = novas("PEDIATRIA", 3);
    await treino(DORA, base, () => true); // 36 XP honestos
    expect((await stats(DORA)).total_xp).toBe(36);
    const chutes = novas("PEDIATRIA", 4);
    // 4 s no navegador e 4 s de verdade: acima do "rápido demais" (3 s), abaixo da leitura mínima (5 s)
    const { answers } = await treino(DORA, chutes, () => true, { readMs: 4_000, clientMs: 4_000 });
    expect(answers.map((a) => a.play.xp.reason)).toEqual(["guess", "guess", "guess", "guess"]);
    expect(answers.map((a) => a.play.penalty)).toEqual([0, 0, 5, 5]);
    expect(answers.every((a) => a.play.xp.total === 0 && a.play.coins === 0)).toBe(true);
    const s = await stats(DORA);
    expect(s.total_xp).toBe(26);
    expect(s.weekly_xp).toBe(26);
    expect(s.total_xp).toBe(await ledgerXp(DORA));
    expect(s.questions_answered).toBe(3); // chute não conta nas estatísticas
    const pen = await events(DORA, "GUESS_PENALTY");
    expect(pen.map((e: any) => e.xp_awarded)).toEqual([-5, -5]);
  });

  it("multa nunca deixa o XP abaixo de zero", async () => {
    const chutes = novas("PEDIATRIA", 3);
    const { answers } = await treino(EDU, chutes, () => true, { readMs: 4_000, clientMs: 4_000 });
    expect(answers[2].play.penalty).toBe(0);
    expect((await stats(EDU)).total_xp).toBe(0);
    expect((await events(EDU, "GUESS_PENALTY"))[0].metadata).toMatchObject({ multa: 5, aplicada: 0 });
  });
});

describe("o tempo vem do servidor (brecha G04)", () => {
  it("30 minutos forjados pelo navegador viram o tempo que o servidor viu passar", async () => {
    const [id] = novas("GINECOLOGIA_OBSTETRICIA", 1);
    const { answers } = await treino(FABI, [id], () => true, { readMs: 40_000, clientMs: 1_800_000 });
    expect(answers[0].play.xp.valid).toBe(true);
    const ms = (await sql(`select active_ms from public.question_attempts where user_id = $1 and question_id = $2`, [FABI, id]))[0].active_ms;
    expect(ms).toBeGreaterThanOrEqual(40_000);
    expect(ms).toBeLessThan(60_000);
  });

  it("navegador dizendo 20 s quando passaram 2 s: vale o do servidor (rápido demais)", async () => {
    const [id] = novas("GINECOLOGIA_OBSTETRICIA", 1);
    const { answers } = await treino(FABI, [id], () => true, { readMs: 2_000, clientMs: 20_000 });
    expect(answers[0].play.xp).toMatchObject({ total: 0, valid: false, reason: "too_fast" });
  });
});

describe("gravação direta pela API é recusada (brecha G05)", () => {
  const recusa = (uid: string, apiPath: string, q: string, p: unknown[] = []) => expect(call(uid, apiPath, q, p)).rejects.toThrow(/Gravação direta não é permitida/);

  it("resposta, sessão, plano, flashcard e GraphQL direto na tabela: tudo recusado", async () => {
    const [id] = novas("GINECOLOGIA_OBSTETRICIA", 1);
    await recusa(FABI, "/question_attempts", `insert into public.question_attempts (question_id, selected_option, active_ms) values ($1, 'B', 60000)`, [id]);
    await recusa(FABI, "/practice_sessions", `insert into public.practice_sessions (kind, question_ids) values ('simulado', $1)`, [[id]]);
    await recusa(FABI, "/plan_tasks", `insert into public.plan_tasks (day, kind, title) values (current_date - 30, 'estudar', 'x')`);
    await recusa(FABI, "/rpc/resolve", `insert into public.question_attempts (question_id, selected_option, active_ms) values ($1, 'B', 60000)`, [id]);
    const card = (await sql(`select id from public.flashcards limit 1`))[0];
    if (card) await recusa(FABI, "/flashcard_reviews", `insert into public.flashcard_reviews (card_id, rating) values ($1, 3)`, [card.id]);
    expect((await sql(`select count(*)::int as n from public.question_attempts where user_id = $1 and question_id = $2`, [FABI, id]))[0].n).toBe(0);
  });

  it("e a sessão aberta não pode ser mexida direto (ex.: respostas do simulado)", async () => {
    const qs = novas("GINECOLOGIA_OBSTETRICIA", 1);
    const sid = await sessao(FABI, "questoes", qs);
    await recusa(FABI, "/practice_sessions", `update public.practice_sessions set answers = '{}'::jsonb where id = $1`, [sid]);
  });
});

describe("simulado (brecha G01) e plano do dia (brecha G02)", () => {
  async function simulado(uid: string, qids: string[], right: (i: number) => boolean, readMs = 30_000) {
    const sid = await sessao(uid, "simulado", qids);
    for (const [i, id] of qids.entries()) {
      await passa(sid, readMs);
      await rpc(uid, "app_answer_question", { p_session_id: sid, p_question_id: id, p_option: right(i) ? "B" : "A", p_active_ms: readMs });
    }
    await rpc(uid, "app_finish_session", { p_session_id: sid });
    return sid;
  }

  it("simulado com ida e volta: a questão lida antes e respondida depois não vira chute (segunda opinião do Gemini)", async () => {
    const qs = novas("GINECOLOGIA_OBSTETRICIA", 30);
    const sid = await sessao(DORA, "simulado", qs);
    await passa(sid, 30_000);
    await rpc(DORA, "app_answer_question", { p_session_id: sid, p_question_id: qs[0], p_option: "B", p_active_ms: 30_000 });
    await passa(sid, 60_000); // lê a 2ª por 60 s, não responde, vai para a 3ª
    await passa(sid, 10_000);
    await rpc(DORA, "app_answer_question", { p_session_id: sid, p_question_id: qs[2], p_option: "B", p_active_ms: 10_000 });
    // volta e responde a 2ª na hora: o navegador soma 62 s nela
    await rpc(DORA, "app_answer_question", { p_session_id: sid, p_question_id: qs[1], p_option: "B", p_active_ms: 62_000 });
    for (const id of qs.slice(3)) {
      await passa(sid, 30_000);
      await rpc(DORA, "app_answer_question", { p_session_id: sid, p_question_id: id, p_option: "B", p_active_ms: 30_000 });
    }
    // e quem tenta somar mais tempo do que a sessão ficou aberta: limitado ao que sobra
    await rpc(DORA, "app_finish_session", { p_session_id: sid });
    const a2 = (await sql(`select active_ms from public.question_attempts where session_id = $1 and question_id = $2`, [sid, qs[1]]))[0];
    expect(a2.active_ms).toBeGreaterThanOrEqual(55_000);
    expect(a2.active_ms).toBeLessThanOrEqual(62_000);
    const total = (await sql(`select sum(active_ms)::int as t from public.question_attempts where session_id = $1`, [sid]))[0].t;
    expect(total).toBeLessThanOrEqual(30_000 + 70_000 + 27 * 30_000 + 2_000);
    const reasons = await sql(`select e.fraud_reason from public.gamification_events e join public.question_attempts a on a.id::text = e.source_id
                               where a.session_id = $1 and e.source_type = 'question_attempt' and not e.is_valid`, [sid]);
    expect(reasons).toHaveLength(0);
    expect((await events(DORA, "SIMULATION_COMPLETED")).length).toBe(1);
  });

  it("simulado de 1 questão não vale XP de simulado", async () => {
    await simulado(ANA, novas("MEDICINA_FAMILIA_COMUNIDADE", 1), () => true);
    expect((await events(ANA, "SIMULATION_COMPLETED")).length).toBe(0);
  });

  it("simulado de 30 vale 80 XP uma vez por dia; o 2º do dia não paga de novo; erros não valem XP", async () => {
    const qs = [...novas("MEDICINA_FAMILIA_COMUNIDADE", 15), ...novas("CLINICA_MEDICA", 15)];
    await simulado(ANA, qs, (i) => i % 2 === 0);
    const ev = await events(ANA, "SIMULATION_COMPLETED");
    expect(ev.length).toBe(1);
    expect(ev[0].xp_awarded).toBe(80);
    const wrong = await sql(`select xp_awarded, coins_awarded from public.gamification_events e join public.question_attempts a on a.id::text = e.source_id
                             where e.user_id = $1 and e.event_type = 'QUESTION_WRONG' and a.question_id = any($2)`, [ANA, qs]);
    expect(wrong.length).toBe(15);
    expect(wrong.every((w: any) => w.xp_awarded === 0 && w.coins_awarded === 0)).toBe(true);
    await simulado(ANA, [...novas("MEDICINA_FAMILIA_COMUNIDADE", 15), ...novas("CLINICA_MEDICA", 15)], () => true);
    expect((await events(ANA, "SIMULATION_COMPLETED")).length).toBe(1);
  });

  it("simulado respondido no chute (80% abaixo da leitura mínima) não vale XP de simulado", async () => {
    const qs = [...novas("CIRURGIA_GERAL", 30)];
    await simulado(CAIO, qs, () => true, 4_000);
    expect((await events(CAIO, "SIMULATION_COMPLETED")).length).toBe(0);
  });

  it("tarefa do plano de outro dia marcada como feita não vale XP; a de hoje vale 20", async () => {
    const [old] = await sql(`insert into public.plan_tasks (user_id, day, kind, title) values ($1, current_date - 30, 'estudar', 'antiga') returning id`, [BIA]);
    await rpc(BIA, "app_set_plan_task", { p_task_id: old.id, p_done: true });
    expect((await events(BIA, "DAILY_GOAL_COMPLETED")).length).toBe(0);
    const hoje = (await sql(`select public.gam_today($1) as d`, [BIA]))[0].d;
    const [t] = await sql(`insert into public.plan_tasks (user_id, day, kind, title) values ($1, $2, 'estudar', 'hoje') returning id`, [BIA, hoje]);
    await sql(`delete from public.plan_tasks where user_id = $1 and day = $2 and id <> $3`, [BIA, hoje, t.id]);
    await rpc(BIA, "app_set_plan_task", { p_task_id: t.id, p_done: true });
    const ev = await events(BIA, "DAILY_GOAL_COMPLETED");
    expect(ev.length).toBe(1);
    expect(ev[0].xp_awarded).toBe(20);
  });
});

describe("flashcards (brecha G06)", () => {
  const next = () => ({ due: new Date(Date.now() + 864e5).toISOString(), state: 2, stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduled_days: 9999, elapsed_days: 0, learning_steps: 0 });

  it("cartão pessoal não vale XP, nem com agenda forjada; oficial vale 2; 'não lembrei' vale 0", async () => {
    const before = (await stats(EDU)).total_xp;
    for (let i = 0; i < 5; i++) {
      const c = await rpc(EDU, "app_create_flashcard", { p_area: "CLINICA_MEDICA", p_topic: "t", p_front: `frente ${i}`, p_back: `verso ${i}` });
      await rpc(EDU, "app_review_flashcard", { p_card_id: c.id, p_rating: 3, p_next: next() });
    }
    expect(await events(EDU, "FLASHCARD_REVIEWED")).toHaveLength(0);
    expect(await events(EDU, "FLASHCARD_MASTERED")).toHaveLength(0);
    // segunda opinião (Gemini): 5 cartões pessoais não zeram a "fila do dia" nem contam na missão de flashcards
    expect(await events(EDU, "SPACED_REVIEW_DONE")).toHaveLength(0);
    const hojeEdu = (await sql(`select public.gam_today($1) as d`, [EDU]))[0].d;
    expect((await sql(`select (public.gam_facts($1, $2, $2) ->> 'flashcards')::int as n`, [EDU, hojeEdu]))[0].n).toBe(0);
    const [o1] = await sql(`insert into public.flashcards (area, topic, front, back, published) values ('PEDIATRIA', 't', 'oficial 1', 'v', true) returning id`);
    const [o2] = await sql(`insert into public.flashcards (area, topic, front, back, published) values ('PEDIATRIA', 't', 'oficial 2', 'v', true) returning id`);
    await rpc(EDU, "app_review_flashcard", { p_card_id: o1.id, p_rating: 3, p_next: next() });
    await rpc(EDU, "app_review_flashcard", { p_card_id: o2.id, p_rating: 1, p_next: next() });
    const ev = await events(EDU, "FLASHCARD_REVIEWED");
    expect(ev.map((e: any) => e.xp_awarded)).toEqual([2]);
    // agenda forjada (9999 dias) não consolida: a 1ª revisão foi hoje
    expect(await events(EDU, "FLASHCARD_MASTERED")).toHaveLength(0);
    expect((await stats(EDU)).total_xp).toBeGreaterThanOrEqual(before + 2);
  });
});

describe("moedas, bônus de sessão e missões: uma vez por dia", () => {
  it("1 moeda a cada 10 acertos que pontuam; o bônus de 10 respostas vale 1 vez no dia, mesmo em 2 sessões", async () => {
    const fabi0 = (await events(FABI)).length;
    await treino(FABI, novas("PEDIATRIA", 10), () => true);
    await treino(FABI, novas("PEDIATRIA", 10), () => true);
    const ev = (await events(FABI)).slice(fabi0);
    const fromAnswers = ev.filter((e: any) => e.event_type === "QUESTION_CORRECT").reduce((n: number, e: any) => n + e.coins_awarded, 0);
    expect(fromAnswers).toBe(2); // 20 acertos (mais o de antes: 1 válido) → 2 moedas
    expect(ev.filter((e: any) => e.event_type === "SESSION_10")).toHaveLength(1);
    expect((await events(FABI, "SESSION_10"))[0].xp_awarded).toBe(12);
    // missão: cada uma paga no máximo uma vez no período
    const dup = await sql(`select metadata ->> 'mission' as m, count(*)::int as n from public.gamification_events where user_id = $1 and event_type = 'MISSION_COMPLETED' group by 1 having count(*) > 1`, [FABI]);
    expect(dup).toHaveLength(0);
  });
});

describe("ligas: 10% sobem, 10% descem", () => {
  it("grupo de 30 na Prata: 3 sobem e 3 descem; grupo de 6 no Bronze: 1 sobe e ninguém desce", async () => {
    await sql(`update public.league_seasons set status = 'closed' where status = 'open'`);
    const [se] = await sql(`insert into public.league_seasons (starts_on, ends_on) values (current_date - 8, current_date - 2) returning id`);
    const users: string[] = [];
    for (let i = 0; i < 36; i++) {
      const u = `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`;
      users.push(u);
      await sql(`insert into auth.users (id, email) values ($1, $2)`, [u, `liga${i}@t.dev`]);
      await sql(`insert into public.user_gamification_stats (user_id, current_league) values ($1, $2) on conflict (user_id) do update set current_league = excluded.current_league`, [u, i < 30 ? "prata" : "bronze"]);
      await sql(`insert into public.league_memberships (season_id, user_id, league_slug, group_no, weekly_xp) values ($1, $2, $3, 1, $4)`, [se.id, u, i < 30 ? "prata" : "bronze", 1000 - i]);
    }
    const r = await sql(`select public.ch_worker_gamification_close_week() as r`);
    expect(r[0].r.closed).toBe(true);
    const out = await sql(`select user_id, league_slug, outcome from public.league_memberships where season_id = $1 order by weekly_xp desc`, [se.id]);
    const prata = out.filter((m: any) => m.league_slug === "prata");
    const bronze = out.filter((m: any) => m.league_slug === "bronze");
    expect(prata.filter((m: any) => m.outcome === "promoted")).toHaveLength(3);
    expect(prata.filter((m: any) => m.outcome === "relegated")).toHaveLength(3);
    expect(bronze.filter((m: any) => m.outcome === "promoted")).toHaveLength(1);
    expect(bronze.filter((m: any) => m.outcome === "relegated")).toHaveLength(0);
    const promo = await sql(`select coins_awarded from public.gamification_events where event_type = 'LEAGUE_PROMOTED' and source_id = $1::text`, [se.id]);
    expect(promo.every((p: any) => p.coins_awarded === 25)).toBe(true);
    // a tela da liga mostra a conta nova (10% do grupo, no mínimo 1), não mais "5 sobem"
    const lc = await rpc(ANA, "app_league_current");
    const n = lc.joined ? lc.rows.length : lc.group_size;
    expect(lc.promote).toBe(Math.max(1, Math.floor(n * 0.1)));
    expect(lc.relegate).toBe(Math.max(1, Math.floor(n * 0.1)));
    expect(lc.promote_pct).toBe(10);
  });
});
