// @vitest-environment node
/**
 * Stazia Play (supabase/migrations/…3800_stazia_play.sql) num Postgres real em memória:
 * XP só nasce de fatos no banco, antifraude, sequência por fuso, missões, score, medalhas,
 * ranking sanitizado, ligas idempotentes, trilha, loja e segurança (RLS e funções revogadas).
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
const CARLA = "00000000-0000-4000-8000-00000000000c";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const DIEGO = "00000000-0000-4000-8000-00000000000d";
// AR05: a equipe (ADMIN) não entra no ranking; o 4º participante do ranking é um aluno comum.
const EVA = "00000000-0000-4000-8000-00000000000e";
const TOPICS_PER_AREA = 4;
const PER_TOPIC = 5;

let db: PGlite;
const questionIds: Record<string, string[]> = {}; // por área

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
const asUser = async (uid: string, sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return tx.query<any>(sql, params);
  });
const sql = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const stats = async (uid: string) => (await sql(`select * from public.user_gamification_stats where user_id = $1`, [uid]))[0];
const events = async (uid: string, type?: string) =>
  sql(`select * from public.gamification_events where user_id = $1 and ($2::text is null or event_type = $2) order by id`, [uid, type ?? null]);

/**
 * O tempo passa (regra de 16/10: o servidor mede o tempo de cada resposta desde a anterior ou o início da sessão): empurra para trás
 * o início da sessão, as respostas dela e os salvamentos do simulado.
 */
async function passa(sessionId: string, ms = 30000) {
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

/** Treino com as questões dadas; responde cada uma (certa = B, errada = A), com `readMs` de leitura antes de cada uma. */
async function practice(uid: string, ids: string[], rightMask: (i: number) => boolean, activeMs: number | null = 20000, readMs = 30000) {
  const started = await rpc(uid, "app_start_session", { p_kind: "questoes", p_filters: { ids }, p_count: ids.length });
  // app_start_session sorteia do pool; forçamos as questões pedidas direto na sessão
  await sql(`update public.practice_sessions set question_ids = $2 where id = $1`, [started.session_id, ids]);
  const answers: any[] = [];
  for (const [i, id] of ids.entries()) {
    await passa(started.session_id, readMs);
    answers.push(await rpc(uid, "app_answer_question", { p_session_id: started.session_id, p_question_id: id, p_option: rightMask(i) ? "B" : "A", p_active_ms: activeMs }));
  }
  const finished = await rpc(uid, "app_finish_session", { p_session_id: started.session_id });
  return { session: finished, answers, sessionId: started.session_id as string };
}

/** Empurra todo o histórico um dia para trás (como se hoje fosse amanhã). */
async function nextDay(days = 1) {
  // missões já existentes no dia de destino sairiam duplicadas: ficam as mais novas
  await db.exec(`delete from public.user_missions u where exists (
    select 1 from public.user_missions o where o.user_id = u.user_id and o.mission_slug = u.mission_slug and o.period_start = u.period_start - ${days})`);
  await db.exec(`
    update public.question_attempts set answered_at = answered_at - interval '${days} day';
    update public.practice_sessions set started_at = started_at - interval '${days} day', finished_at = finished_at - interval '${days} day';
    update public.flashcard_reviews set reviewed_at = reviewed_at - interval '${days} day';
    update public.gamification_events set created_at = created_at - interval '${days} day';
    update public.user_gamification_stats set last_qualified_date = last_qualified_date - ${days}, last_qualified_activity_at = last_qualified_activity_at - interval '${days} day';
    update public.user_missions set period_start = period_start - ${days};
    update public.plan_tasks set day = day - ${days};
  `);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev'), ($3, 'carla@teste.dev'), ($4, 'admin@teste.dev'), ($5, 'diego@teste.dev'), ($6, 'eva@teste.dev')`, [ANA, BRUNO, CARLA, ADMIN, DIEGO, EVA]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.profiles set name = 'Ana Maria Souza' where id = $1`, [ANA]);
  await db.query(`update public.profiles set name = 'Bruno Lima' where id = $1`, [BRUNO]);
  await db.query(`update public.profiles set name = 'Carla Dias' where id = $1`, [CARLA]);
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count)
                 values ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 100)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })));
  let number = 0;
  for (const area of AREAS) {
    questionIds[area] = [];
    for (let t = 1; t <= TOPICS_PER_AREA; t++) {
      for (let k = 1; k <= PER_TOPIC; k++) {
        number++;
        const id = `q${String(number).padStart(3, "0")}`;
        questionIds[area].push(id);
        await db.query(
          `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option)
           values ($1, $2, 'revalida-2024-1', $3, $4::public.med_area, $5, $6, $7::jsonb, 'B')`,
          [id, `REV-2024-Q${String(number).padStart(3, "0")}`, number, area, `${area} tema ${t}`, `Enunciado da questão ${number}. Qual a conduta?`, options]
        );
      }
    }
  }
  // uma questão difícil pela classificação do motor
  await db.query(`insert into public.question_dna (question_id, difficulty_estimate, dataset_version) values ('q001', 'HIGH', 'teste')`);
}, 300_000);

describe("XP nasce no banco, nunca do cliente", () => {
  it("acerto na primeira tentativa: base + acerto + 1ª tentativa + inédita (+ difícil quando for), com os valores de 16/10 (-20%)", async () => {
    const ids = questionIds.CLINICA_MEDICA.slice(0, 2); // q001 (difícil) e q002
    const { answers } = await practice(ANA, ids, () => true);
    expect(answers[0].is_correct).toBe(true);
    expect(answers[0].play.xp).toMatchObject({ base: 2, correct: 6, difficulty_bonus: 3, first_attempt_bonus: 2, unseen_bonus: 2, total: 15, valid: true });
    expect(answers[1].play.xp).toMatchObject({ base: 2, correct: 6, first_attempt_bonus: 2, unseen_bonus: 2, total: 12 });
    expect(answers[1].play.xp.difficulty_bonus).toBeUndefined();
    // moedas: 1 a cada 10 acertos que pontuam no dia (2 acertos ainda não dão moeda)
    expect(answers[1].play.stats).toMatchObject({ total_xp: 27, coins: 0, provisional: true, streak: 0 });
    const s = await stats(ANA);
    expect(s).toMatchObject({ total_xp: 27, weekly_xp: 27, questions_answered: 2, correct_answers: 2, accuracy: "100.00" });
    expect((await events(ANA, "QUESTION_CORRECT")).length).toBe(2);
  });

  it("erro: 0 XP e 0 moedas (16/10), mas conta como resposta válida", async () => {
    const { answers } = await practice(ANA, [questionIds.CLINICA_MEDICA[2]], () => false);
    expect(answers[0].play.xp).toMatchObject({ total: 0, valid: true });
    expect(answers[0].play.xp.base).toBeUndefined();
    expect(answers[0].play.coins).toBe(0);
    expect((await stats(ANA)).wrong_answers).toBe(1);
  });

  it("repetir a questão rende menos (30%, 10%, depois 0 e marcado como farming); corrigir um erro vale bônus (cada vez depois da trava de 3 dias)", async () => {
    const id = questionIds.CLINICA_MEDICA[2]; // errada antes
    const tresDias = () => sql(`update public.question_attempts set answered_at = answered_at - interval '3 days 1 minute' where user_id = $1 and question_id = $2`, [ANA, id]);
    await tresDias();
    const a2 = (await practice(ANA, [id], () => true)).answers[0];
    // 2ª tentativa: (2 + 6 + 0 + 0 + 0) × 0,3 = 2,4 → 2, + revisão 4 + correção 8
    expect(a2.play.xp).toMatchObject({ multiplier: 0.3, review_bonus: 4, fix_bonus: 8, total: 14, valid: true });
    await tresDias();
    const a3 = (await practice(ANA, [id], () => true)).answers[0];
    expect(a3.play.xp).toMatchObject({ multiplier: 0.1, total: 1 });
    expect(a3.play.xp.review_bonus).toBeUndefined();
    await tresDias();
    const a4 = (await practice(ANA, [id], () => true)).answers[0];
    expect(a4.play.xp).toMatchObject({ total: 0, valid: false, reason: "repeated_question_farming" });
    const s = await stats(ANA);
    expect(s.questions_answered).toBe(5); // a 4ª não conta
  });

  it("a mesma tentativa enviada duas vezes gera uma resposta e um só XP", async () => {
    const id = questionIds.CIRURGIA_GERAL[0];
    const started = await rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: { area: "CIRURGIA_GERAL" }, p_count: 1 });
    await sql(`update public.practice_sessions set question_ids = $2 where id = $1`, [started.session_id, [id]]);
    const before = (await stats(ANA)).total_xp;
    const sumXp = async () => (await sql(`select coalesce(sum(xp_awarded), 0)::int as s from public.gamification_events where user_id = $1`, [ANA]))[0].s;
    const sumBefore = await sumXp();
    await passa(started.session_id);
    const r1 = await rpc(ANA, "app_answer_question", { p_session_id: started.session_id, p_question_id: id, p_option: "B", p_active_ms: 15000 });
    const r2 = await rpc(ANA, "app_answer_question", { p_session_id: started.session_id, p_question_id: id, p_option: "A", p_active_ms: 15000 });
    expect(r1.play.xp.total).toBe(12);
    expect(r2.play).toBeNull();
    expect(r2.selected).toBe("B");
    const earned = (await sumXp()) - sumBefore;
    expect((await stats(ANA)).total_xp).toBe(before + earned); // agregado = livro-razão
    expect(earned).toBeGreaterThanOrEqual(12);
    expect((await sql(`select count(*)::int as n from public.gamification_events where user_id = $1 and source_type = 'question_attempt' and metadata ->> 'question_id' = $2`, [ANA, id]))[0].n).toBe(1);
    expect((await sql(`select count(*)::int as n from public.question_attempts where user_id = $1 and question_id = $2`, [ANA, id]))[0].n).toBe(1);
  });

  it("resposta rápida demais não vale XP, mas fica registrada com o motivo", async () => {
    const { answers } = await practice(BRUNO, [questionIds.PEDIATRIA[0]], () => true, 900);
    expect(answers[0].play.xp).toMatchObject({ total: 0, valid: false, reason: "too_fast" });
    expect((await stats(BRUNO)).questions_answered).toBe(0);
    const ev = (await events(BRUNO))[0];
    expect(ev.is_valid).toBe(false);
    expect(ev.fraud_score).toBeGreaterThan(0);
  });

  it("enxurrada (mais que o limite por minuto) é barrada", async () => {
    await sql(`update public.gamification_rules set value = '3' where key = 'fraud.rate_limit_per_minute'`);
    try {
      const ids = questionIds.PEDIATRIA.slice(1, 6);
      // 6 s de leitura por questão (acima do mínimo de leitura de 5 s): as 5 caem no mesmo minuto
      const { answers } = await practice(BRUNO, ids, () => true, 20000, 6000);
      const reasons = answers.map((a) => a.play.xp.reason ?? null);
      // Bruno já tinha 1 resposta no último minuto: a 3ª chega ao limite de 3
      expect(reasons).toEqual([null, null, "rate_limit", "rate_limit", "rate_limit"]);
    } finally {
      await sql(`update public.gamification_rules set value = '30' where key = 'fraud.rate_limit_per_minute'`);
    }
  });

  it("marco da sessão: 10 questões numa sessão valem bônus", async () => {
    const ids = questionIds.GINECOLOGIA_OBSTETRICIA.slice(0, 10);
    const { answers } = await practice(CARLA, ids, () => true);
    expect(answers[9].play.bonus.some((b: any) => b.type === "SESSION_10" && b.xp === 12)).toBe(true);
    expect((await events(CARLA, "SESSION_10")).length).toBe(1);
  });

  it("simulado completo (30+ questões) vale XP uma só vez", async () => {
    const ids = [...questionIds.MEDICINA_FAMILIA_COMUNIDADE.slice(0, 20), ...questionIds.GINECOLOGIA_OBSTETRICIA.slice(10, 20)];
    const started = await rpc(CARLA, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 30, p_time_limit_seconds: 3 * 3600 });
    await sql(`update public.practice_sessions set question_ids = $2 where id = $1`, [started.session_id, ids]);
    for (const id of ids) {
      await passa(started.session_id);
      await rpc(CARLA, "app_answer_question", { p_session_id: started.session_id, p_question_id: id, p_option: "B", p_active_ms: 30000 });
    }
    await rpc(CARLA, "app_finish_session", { p_session_id: started.session_id });
    await rpc(CARLA, "app_finish_session", { p_session_id: started.session_id });
    expect((await events(CARLA, "SIMULATION_COMPLETED")).length).toBe(1);
    expect((await events(CARLA, "SIMULATION_COMPLETED"))[0].xp_awarded).toBe(80);
  });
});

describe("Sequência diária (no fuso do aluno)", () => {
  it("só conta o dia com o mínimo de questões válidas; dias seguidos somam", async () => {
    expect((await stats(CARLA)).current_streak).toBe(1); // 40 questões hoje
    await nextDay();
    await practice(CARLA, questionIds.CIRURGIA_GERAL.slice(0, 10), () => true);
    expect((await stats(CARLA)).current_streak).toBe(2);
    expect((await events(CARLA, "STREAK_INCREMENTED")).length).toBeGreaterThanOrEqual(1);
  });

  it("dia perdido sem proteção zera na rotina diária; com proteção, a sequência sobrevive e a proteção é consumida", async () => {
    await nextDay(2); // pulou um dia inteiro
    await sql(`delete from public.gamification_jobs where job = 'daily'`);
    let r = await rpc(null, "ch_worker_gamification_daily").catch(() => null); // anon não pode
    expect(r).toBeNull();
    r = (await sql(`select public.ch_worker_gamification_daily() as r`))[0].r;
    expect(r.streaks_broken).toBeGreaterThanOrEqual(1);
    expect((await stats(CARLA)).current_streak).toBe(0);
    expect((await stats(CARLA)).longest_streak).toBe(2);
    // de novo, com proteção
    await practice(CARLA, questionIds.CIRURGIA_GERAL.slice(10, 20), () => true);
    await sql(`update public.user_gamification_stats set streak_freezes = 1 where user_id = $1`, [CARLA]);
    await nextDay(2);
    await sql(`delete from public.gamification_jobs where job = 'daily'`);
    r = (await sql(`select public.ch_worker_gamification_daily() as r`))[0].r;
    expect(r.freezes_used).toBeGreaterThanOrEqual(1);
    const s = await stats(CARLA);
    expect(s.current_streak).toBe(1);
    expect(s.streak_freezes).toBe(0);
    expect((await events(CARLA, "STREAK_FREEZE_USED")).length).toBe(1);
    // rodar a rotina de novo no mesmo dia não faz nada
    expect((await sql(`select public.ch_worker_gamification_daily() as r`))[0].r.skipped).toBe(true);
  });

  it("o dia é o do fuso do aluno, não o UTC", async () => {
    await rpc(BRUNO, "app_update_profile", { p_patch: { timezone: "Pacific/Kiritimati" } }); // UTC+14
    const kiri = (await sql(`select public.gam_today($1)::text as d`, [BRUNO]))[0].d;
    await rpc(BRUNO, "app_update_profile", { p_patch: { timezone: "Etc/GMT+12" } }); // UTC-12
    const west = (await sql(`select public.gam_today($1)::text as d`, [BRUNO]))[0].d;
    expect(kiri > west).toBe(true); // 26 horas de diferença: nunca é o mesmo dia
    expect((await rpc(BRUNO, "app_bootstrap")).profile.timezone).toBe("Etc/GMT+12");
    await expect(rpc(BRUNO, "app_update_profile", { p_patch: { timezone: "Marte/Olimpo" } })).rejects.toThrow(/Fuso horário inválido/);
    await rpc(BRUNO, "app_update_profile", { p_patch: { timezone: "America/Sao_Paulo" } });
  });
});

describe("Missões, medalhas e nível", () => {
  it("missões do dia nascem determinísticas e o progresso vem dos fatos", async () => {
    const m = await rpc(ANA, "app_gamification_missions");
    expect(m.daily.map((x: any) => x.slug)).toEqual(["daily_correct", "daily_areas", "daily_questions"]);
    expect(m.weekly.length).toBe(5);
    await practice(ANA, [...questionIds.PEDIATRIA.slice(6, 11), ...questionIds.CIRURGIA_GERAL.slice(1, 6)], () => true);
    const after = await rpc(ANA, "app_gamification_missions");
    const areas = after.daily.find((x: any) => x.slug === "daily_areas");
    expect(areas.done).toBe(true);
    const q = after.daily.find((x: any) => x.slug === "daily_questions");
    expect(q).toMatchObject({ progress: 10, target: 10, done: true });
    expect((await events(ANA, "MISSION_COMPLETED")).length).toBeGreaterThanOrEqual(2);
  });

  it("todas as missões do dia: bônus único", async () => {
    await sql(`update public.gamification_rules set value = '5' where key = 'missions.daily_correct'`);
    await sql(`update public.user_missions set target = 5 where user_id = $1 and mission_slug = 'daily_correct' and completed_at is null`, [ANA]);
    await practice(ANA, questionIds.PEDIATRIA.slice(11, 13), () => true);
    expect((await events(ANA, "DAILY_MISSIONS_COMPLETED")).length).toBe(1);
    const m = await rpc(ANA, "app_gamification_missions");
    expect(m.daily_bonus.done).toBe(true);
    await sql(`update public.gamification_rules set value = '15' where key = 'missions.daily_correct'`);
  });

  it("medalha desbloqueia uma vez, com XP; secreta fica escondida até sair", async () => {
    const un = (await events(ANA, "ACHIEVEMENT_UNLOCKED")).map((e) => e.source_id);
    expect(un).toContain("primeiros_passos");
    expect(un.filter((s) => s === "primeiros_passos").length).toBe(1);
    const a = await rpc(ANA, "app_gamification_achievements");
    const secret = a.items.find((x: any) => x.slug === "corujao");
    expect(secret.name).toBe("Conquista secreta");
    expect(secret.unlocked_at).toBeNull();
    expect(a.items.find((x: any) => x.slug === "primeiros_passos").unlocked_at).toBeTruthy();
    // ver a lista marca como vistas
    expect((await rpc(ANA, "app_gamification_summary")).unseen_achievements).toBe(0);
  });

  it("Stazia Score fica em calibração até 50 questões e nunca sai de 0–1000", async () => {
    const s = await rpc(ANA, "app_gamification_summary");
    expect(s.provisional).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(1000);
    expect(s.components).toHaveProperty("performance");
    expect(s.level.slug).toBeTruthy();
  });
});

describe("Ranking sanitizado e posição própria", () => {
  beforeAll(async () => {
    // Carla sai da calibração: 50 questões válidas
    await sql(`select public.ch_worker_gamification_recalculate($1, false)`, [CARLA]);
    for (const [uid, score, q] of [[ANA, 700, 70], [BRUNO, 650, 65], [CARLA, 820, 80]] as const) {
      await sql(`update public.user_gamification_stats set stazia_score = $2, provisional = false, questions_answered = $3 where user_id = $1`, [uid, score, q]);
    }
    await sql(`insert into public.user_gamification_stats (user_id, stazia_score, provisional, questions_answered, accuracy) values ($1, 700, false, 60, 50) on conflict (user_id) do update set stazia_score = 700, provisional = false, questions_answered = 60, accuracy = 50`, [EVA]);
    await sql(`insert into public.gamification_preferences (user_id) values ($1) on conflict do nothing`, [EVA]);
  });

  it("top da classificação, sem e-mail nem UUID, nome abreviado; empate desempata pela precisão", async () => {
    const b = await rpc(BRUNO, "app_leaderboard", { p_kind: "geral", p_offset: 0, p_limit: 50 });
    expect(b.total).toBe(4);
    expect(b.rows.map((r: any) => [r.rank, r.name])).toEqual([[1, "Carla D."], [2, "Ana M."], [3, "Aluno"], [4, "Bruno L."]]);
    for (const r of b.rows) {
      expect(JSON.stringify(r)).not.toMatch(/@teste\.dev|0000-4000-8000/);
      expect(r.public_id).toHaveLength(10);
    }
    expect(b.me).toMatchObject({ rank: 4, total: 4, percentile: 100 });
    expect(b.me.next.map((n: any) => n.rank)).toEqual([3]);
    expect(b.rows[3].is_me).toBe(true);
  });

  it("paginação e 'perto de mim'", async () => {
    const page = await rpc(BRUNO, "app_leaderboard", { p_kind: "geral", p_offset: 2, p_limit: 1 });
    expect(page.rows.length).toBe(1);
    expect(page.rows[0].rank).toBe(3);
    const near = await rpc(ANA, "app_leaderboard_near_me", { p_kind: "geral", p_radius: 1 });
    expect(near.rows.map((r: any) => r.rank)).toEqual([1, 2, 3]);
  });

  it("privacidade: anônimo, oculto e campos desligados", async () => {
    await rpc(BRUNO, "app_gamification_save_preferences", { p_prefs: { leaderboard_visibility: "anonymous", show_accuracy: false, show_streak: false } });
    let b = await rpc(ANA, "app_leaderboard", { p_kind: "geral" });
    const bruno = b.rows.find((r: any) => r.rank === 4);
    expect(bruno).toMatchObject({ name: "Aluno anônimo", accuracy: null, streak: null, avatar: null });
    await rpc(BRUNO, "app_gamification_save_preferences", { p_prefs: { leaderboard_visibility: "hidden" } });
    b = await rpc(ANA, "app_leaderboard", { p_kind: "geral" });
    expect(b.total).toBe(3);
    expect(await rpc(ANA, "app_public_profile", { p_public_id: bruno.public_id })).toBeNull();
    await rpc(BRUNO, "app_gamification_save_preferences", { p_prefs: { leaderboard_visibility: "username", username: "bruno_l" } });
    b = await rpc(ANA, "app_leaderboard", { p_kind: "geral" });
    expect(b.rows.find((r: any) => r.rank === 4).name).toBe("@bruno_l");
    await expect(rpc(ANA, "app_gamification_save_preferences", { p_prefs: { username: "bruno_l" } })).rejects.toThrow(/já está em uso/);
    await expect(rpc(ANA, "app_gamification_save_preferences", { p_prefs: { email: "x" } })).rejects.toThrow(/não permitida/);
    const pub = await rpc(ANA, "app_public_profile", { p_public_id: bruno.public_id });
    expect(pub).toMatchObject({ name: "@bruno_l", rank: 4 });
    expect(JSON.stringify(pub)).not.toMatch(/@teste\.dev|0000-4000-8000/);
  });

  it("rankings secundários: precisão exige amostra mínima; semana e questões", async () => {
    const p = await rpc(ANA, "app_leaderboard", { p_kind: "precisao" });
    expect(p.total).toBe(0); // ninguém tem 200
    const q = await rpc(ANA, "app_leaderboard", { p_kind: "questoes" });
    expect(q.rows[0].name).toBe("Carla D.");
    const w = await rpc(ANA, "app_leaderboard", { p_kind: "semana" });
    expect(w.rows.length).toBeGreaterThan(0);
    await expect(rpc(ANA, "app_leaderboard", { p_kind: "xp_total" })).rejects.toThrow(/Ranking inválido/);
  });
});

describe("Ligas semanais", () => {
  it("quem ganha XP entra na temporada aberta, no Bronze", async () => {
    const l = await rpc(ANA, "app_league_current");
    expect(l.joined).toBe(true);
    expect(l.league.slug).toBe("bronze");
    expect(l.rows.length).toBeGreaterThanOrEqual(3);
    expect(l.rows.every((r: any) => !("user_id" in r))).toBe(true);
  });

  it("fechar a semana duas vezes não duplica promoção, recompensa nem temporada", async () => {
    await sql(`update public.league_seasons set ends_on = current_date - 1, starts_on = current_date - 7 where status = 'open'`);
    const first = (await sql(`select public.ch_worker_gamification_close_week() as r`))[0].r;
    expect(first.closed).toBe(true);
    expect(first.promoted).toBeGreaterThanOrEqual(1);
    const second = (await sql(`select public.ch_worker_gamification_close_week() as r`))[0].r;
    expect(second.closed).toBe(false);
    expect((await sql(`select count(*)::int as n from public.league_seasons`))[0].n).toBe(2);
    expect((await sql(`select count(*)::int as n from public.gamification_events where event_type = 'LEAGUE_PROMOTED'`))[0].n).toBe(first.promoted);
    const carla = await stats(CARLA);
    expect(carla.current_league).toBe("prata"); // mais XP na semana
    expect(carla.weekly_xp).toBe(0);
    const l = await rpc(CARLA, "app_league_current");
    expect(l.league.slug).toBe("prata");
    expect(l.history[0]).toMatchObject({ outcome: "promoted", position: 1 });
  });
});

describe("Trilha de aprendizado", () => {
  it("etapas com estado, simulado bloqueado até a trilha avançar; abrir etapa cria treino do tema", async () => {
    const t = await rpc(ANA, "app_trail", { p_area: "PEDIATRIA" });
    const area = t.areas[0];
    expect(area.nodes.length).toBe(TOPICS_PER_AREA);
    const states = area.nodes.map((n: any) => n.state);
    expect(states[0]).toBe("available"); // Ana nunca respondeu o tema 1: primeira etapa sempre aberta
    expect(area.nodes[1].answered).toBeGreaterThan(0);
    expect(["in_progress", "completed", "mastered"]).toContain(states[1]);
    expect(states).toContain("locked");
    expect(area.simulado.state).toBe("locked");
    expect(area.nodes.every((n: any) => n.goal === Math.min(PER_TOPIC, t.goal))).toBe(true);
    const started = await rpc(ANA, "app_start_trail_node", { p_area: "PEDIATRIA", p_topic: "PEDIATRIA tema 4" });
    const s = await rpc(ANA, "app_get_session", { p_session_id: started.session_id });
    expect(s.questions.every((q: any) => q.area === "PEDIATRIA")).toBe(true);
    expect(s.questions.length).toBe(5);
    await expect(rpc(ANA, "app_start_trail_node", { p_area: "PEDIATRIA", p_topic: "não existe" })).rejects.toThrow(/Tema não encontrado/);
  });
});

describe("Loja, moedas e histórico", () => {
  it("compra proteção com moedas (ledger), respeita o máximo e o intervalo entre resgates", async () => {
    await sql(`update public.user_gamification_stats set coins = 100, streak_freezes = 0 where user_id = $1`, [ANA]);
    const r = await rpc(ANA, "app_claim_reward", { p_slug: "streak_freeze" });
    expect(r.coins).toBe(40);
    expect(r.freezes).toBe(1);
    expect(r.transactions[0]).toMatchObject({ amount: -60, type: "spend" });
    await expect(rpc(ANA, "app_claim_reward", { p_slug: "streak_freeze" })).rejects.toThrow(/Aguarde/);
    await sql(`update public.user_rewards set claimed_at = claimed_at - interval '1 minute' where user_id = $1`, [ANA]);
    await expect(rpc(ANA, "app_claim_reward", { p_slug: "frame_gold" })).rejects.toThrow(/insuficientes/);
    const spent = (await sql(`select coalesce(sum(amount), 0)::int as s from public.coin_transactions where user_id = $1 and type = 'spend'`, [ANA]))[0].s;
    expect(spent).toBe(-60);
    expect((await events(ANA, "REWARD_CLAIMED")).length).toBe(1);
  });

  it("histórico diário para o gráfico", async () => {
    await sql(`delete from public.gamification_jobs where job = 'daily'`);
    await sql(`select public.ch_worker_gamification_daily()`);
    const h = await rpc(ANA, "app_gamification_history", { p_days: 30 });
    expect(h.points.length).toBeGreaterThanOrEqual(1);
    expect(h.points[h.points.length - 1]).toHaveProperty("score");
  });
});

describe("Segurança", () => {
  it("aluno não altera XP, score, moedas nem liga; não grava evento; não chama o motor", async () => {
    const before = await stats(ANA);
    // desde a 013780 (auditoria de segurança) o aluno nem tem permissão de gravar: além do RLS, o banco recusa
    await expect(asUser(ANA, `update public.user_gamification_stats set total_xp = 999999, stazia_score = 1000, coins = 99999 where user_id = $1`, [ANA])).rejects.toThrow(/permission denied/);
    expect(await stats(ANA)).toMatchObject({ total_xp: before.total_xp, stazia_score: before.stazia_score, coins: before.coins });
    await expect(asUser(ANA, `insert into public.gamification_events (user_id, event_type, source_type, source_id, xp_awarded) values ($1, 'QUESTION_CORRECT', 'x', 'y', 5000)`, [ANA])).rejects.toThrow();
    await expect(asUser(ANA, `insert into public.user_achievements (user_id, achievement_slug) values ($1, 'insano')`, [ANA])).rejects.toThrow();
    await expect(asUser(ANA, `insert into public.coin_transactions (user_id, amount, type, source_type) values ($1, 500, 'earn', 'x')`, [ANA])).rejects.toThrow();
    await expect(asUser(ANA, `update public.league_memberships set league_slug = 'revalida_master'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ANA, `select public.gam_award($1, 'QUESTION_CORRECT', 'x', 'z', 5000, 0)`, [ANA])).rejects.toThrow(/permission denied/);
    await expect(asUser(ANA, `select public.ch_worker_gamification_daily()`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ANA, `select public.ch_worker_gamification_close_week()`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ANA, `select * from public.question_difficulty`)).resolves.toMatchObject({ rows: [] });
  });

  it("aluno A não lê estatísticas, eventos nem preferências de B", async () => {
    expect((await asUser(ANA, `select * from public.user_gamification_stats`)).rows.map((r: any) => r.user_id)).toEqual([ANA]);
    expect((await asUser(ANA, `select * from public.gamification_events where user_id = $1`, [CARLA])).rows).toEqual([]);
    expect((await asUser(ANA, `select * from public.gamification_preferences where user_id = $1`, [CARLA])).rows).toEqual([]);
  });

  it("administração: regras, recálculo e auditoria só para admin", async () => {
    await expect(rpc(ANA, "app_admin_gamification")).rejects.toThrow(/administradores/);
    const a = await rpc(ADMIN, "app_admin_gamification");
    expect(a.rules.some((r: any) => r.key === "xp.question_correct")).toBe(true);
    expect(a.metrics.suspicious_by_reason).toHaveProperty("too_fast");
    const saved = await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: 9, p_enabled: true });
    expect(saved.rules.find((r: any) => r.key === "xp.question_correct").value).toBe(9);
    const { answers } = await practice(ANA, [questionIds.CIRURGIA_GERAL[7]], () => true);
    expect(answers[0].play.xp.correct).toBe(9);
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: 6, p_enabled: true });
    const audit = await rpc(ADMIN, "app_admin_gamification_user", { p_user_id: ANA });
    expect(audit.events.some((e: any) => e.event_type === "QUESTION_CORRECT" && e.xp_awarded > 0)).toBe(true);
    expect(audit.stats.user_id).toBe(ANA);
    const rec = await rpc(ADMIN, "app_admin_gamification_recalculate", { p_user_id: ANA });
    expect(rec.total_xp).toBe((await sql(`select sum(xp_awarded)::int as s from public.gamification_events where user_id = $1`, [ANA]))[0].s);
    const log = await rpc(ADMIN, "app_admin_audit", { p_limit: 5 });
    expect(JSON.stringify(log)).toMatch(/gamification\.rule/);
  });

  it("desligar o Play para de gerar XP sem apagar nada", async () => {
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "flags.gamification_enabled", p_value: false, p_enabled: true });
    const before = await stats(ANA);
    const { answers } = await practice(ANA, [questionIds.CIRURGIA_GERAL[8]], () => true);
    expect(answers[0].play).toBeNull();
    expect((await stats(ANA)).total_xp).toBe(before.total_xp);
    expect((await rpc(ANA, "app_bootstrap")).play.enabled).toBe(false);
    await rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: "flags.gamification_enabled", p_value: true, p_enabled: true });
    expect((await rpc(ANA, "app_bootstrap")).play).toMatchObject({ enabled: true, streak: expect.any(Number) });
  });
});

describe("Flashcards e Tutor", () => {
  it("revisar flashcard vale XP uma vez por cartão por dia", async () => {
    await sql(`insert into public.flashcards (id, area, topic, front, back, published, review_status) values ('10000000-0000-4000-8000-000000000001', 'PEDIATRIA', 'tema', 'frente', 'verso', true, 'approved')`);
    const next = { due: new Date(Date.now() + 86_400_000).toISOString(), state: 1, stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduled_days: 1, elapsed_days: 0, learning_steps: 0 };
    await rpc(ANA, "app_review_flashcard", { p_card_id: "10000000-0000-4000-8000-000000000001", p_rating: 3, p_next: next });
    await rpc(ANA, "app_review_flashcard", { p_card_id: "10000000-0000-4000-8000-000000000001", p_rating: 3, p_next: next });
    expect((await events(ANA, "FLASHCARD_REVIEWED")).length).toBe(1);
  });

  it("o Tutor recebe só números agregados do Play", async () => {
    const c = (await sql(`select public.ch_worker_tutor_play_context($1) as r`, [ANA]))[0].r;
    expect(c).toMatchObject({ league: expect.any(String), streak: expect.any(Number), questions: expect.any(Number) });
    expect(Object.keys(c).sort()).toEqual(["accuracy", "league", "missions_pending", "percentile", "questions", "rank", "stazia_score", "streak", "weakest_area", "weekly_xp"]);
  });
});

describe("Simulado finalizado de uma vez", () => {
  it("40 respostas gravadas juntas valem todas (não é enxurrada) e o treino logo depois também vale", async () => {
    const ids = [...questionIds.CLINICA_MEDICA, ...questionIds.CIRURGIA_GERAL].slice(0, 40);
    const started = await rpc(DIEGO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 40, p_time_limit_seconds: 7200 });
    await sql(`update public.practice_sessions set question_ids = $2 where id = $1`, [started.session_id, ids]);
    for (const id of ids) {
      await passa(started.session_id);
      await rpc(DIEGO, "app_answer_question", { p_session_id: started.session_id, p_question_id: id, p_option: "B", p_active_ms: 30000 });
    }
    const t0 = Date.now();
    await rpc(DIEGO, "app_finish_session", { p_session_id: started.session_id });
    const ms = Date.now() - t0;
    const ev = await events(DIEGO);
    const answers = ev.filter((e) => e.source_type === "question_attempt");
    expect(answers.length).toBe(40);
    expect(answers.every((e) => e.is_valid)).toBe(true);
    expect(answers[0].metadata.session_kind).toBe("simulado");
    expect((await stats(DIEGO)).questions_answered).toBe(40);
    expect(ev.filter((e) => e.event_type === "SIMULATION_COMPLETED").length).toBe(1);
    // treino logo em seguida: as 40 do simulado não entram na conta de enxurrada
    const { answers: next } = await practice(DIEGO, [questionIds.PEDIATRIA[19]], () => true);
    expect(next[0].play.xp).toMatchObject({ valid: true });
    console.log(`[play] simulado de 40 questões finalizado em ${ms} ms`);
  });
});
