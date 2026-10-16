// @vitest-environment node
/**
 * API de treino (supabase/migrations/…0700_practice_api.sql) num Postgres real em memória:
 * montar o treino, sortear, responder, corrigir pelo banco e finalizar, agindo como aluno.
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

/** Chama uma função app_* como o app faz: papel + claims do JWT, com o RLS valendo. */
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

const options = (explained: string) =>
  JSON.stringify(
    ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: id === explained ? "Porque é a conduta indicada." : "" }))
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev')`, [ANA, BRUNO]);
  await db.exec(`
    insert into public.exams (id, kind, year, semester, title, question_count) values
      ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 12),
      ('revalida-2023-2', 'REVALIDA', 2023, 2, 'Revalida INEP 2023/2', 10);
  `);

  // 5 áreas × 4 questões válidas (gabarito sempre B) + 1 anulada + 1 que cita figura.
  let number = 0;
  const insert = (id: string, exam: string, area: string, topic: string, statement: string, extra: Record<string, unknown> = {}) =>
    db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option,
                                     status, needs_image, expected_conduct, inep_intent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'B', $10, $11, 'Conduta esperada.', 'O que a banca avalia.')`,
      [id, `T-${id}`, exam, ++number, area, topic, "subtema", statement, options("B"), extra.status ?? "valid", extra.needs_image ?? false]
    );
  for (const [a, area] of AREAS.entries()) {
    for (let n = 1; n <= 4; n++) {
      const special = area === "GINECOLOGIA_OBSTETRICIA" && n === 1;
      await insert(
        `q-${a}-${n}`,
        n % 2 ? "revalida-2024-1" : "revalida-2023-2",
        area,
        special ? "Pré-eclâmpsia" : `Tema ${a}`,
        special ? "Gestante com pressão alta e proteinúria." : `Caso clínico ${a}-${n}.`
      );
    }
  }
  await insert("q-anulada", "revalida-2024-1", "PEDIATRIA", "Anulada", "Questão anulada.", { status: "annulled" });
  await insert("q-figura", "revalida-2024-1", "CLINICA_MEDICA", "ECG", "O ECG abaixo mostra:", { needs_image: true });
}, 60_000);

describe("Treino — montar", () => {
  it("as opções do montador vêm do banco, sem anuladas nem questões que dependem de figura", async () => {
    const f = await rpc(ANA, "app_question_filters");
    expect(f.total).toBe(20);
    expect(f.exams.map((e: any) => [e.id, e.total])).toEqual([
      ["revalida-2024-1", 10],
      ["revalida-2023-2", 10],
    ]);
    expect(f.topics).toContainEqual({ area: "GINECOLOGIA_OBSTETRICIA", topic: "Pré-eclâmpsia", total: 1 });
    expect(f.topics.some((t: any) => t.topic === "Anulada" || t.topic === "ECG")).toBe(false);
  });

  it("conta por área com os filtros atuais; a busca aceita texto sem acento", async () => {
    const all = await rpc(ANA, "app_count_questions", { p_filters: {} });
    expect(all.total).toBe(20);
    expect(Object.values(all.by_area)).toEqual([4, 4, 4, 4, 4]);

    const exam = await rpc(ANA, "app_count_questions", { p_filters: { exam_id: "revalida-2023-2", area: "PEDIATRIA" } });
    expect(exam).toMatchObject({ total: 10, by_area: { PEDIATRIA: 2 } });

    for (const search of ["pré-eclâmpsia", "pre-eclampsia", "proteinúria"]) {
      expect((await rpc(ANA, "app_count_questions", { p_filters: { search } })).total, search).toBe(1);
    }
  });

  it("sem login não monta treino nem enxerga questões", async () => {
    expect((await rpc(null, "app_question_filters")).total).toBe(0);
    // 010800: o visitante (anon) nem tem permissão de chamar app_start_session; antes a própria função recusava com "Entre na sua conta"
    await expect(rpc(null, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 5 })).rejects.toThrow(/Entre na sua conta|permission denied for function app_start_session/);
  });
});

describe("Treino — sessão de questões", () => {
  let sessionId: string;
  let first: any;

  it("sorteia equilibrado entre as áreas e não entrega gabarito, explicação nem tema", async () => {
    const started = await rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 10 });
    expect(started.count).toBe(10);
    sessionId = started.session_id;

    const session = await rpc(ANA, "app_get_session", { p_session_id: sessionId });
    expect(session).toMatchObject({ kind: "questoes", finished_at: null, result: null, time_limit_seconds: null });
    expect(session.questions).toHaveLength(10);
    expect(new Set(session.questions.map((q: any) => q.id)).size).toBe(10);

    const perArea = session.questions.reduce((acc: any, q: any) => ({ ...acc, [q.area]: (acc[q.area] ?? 0) + 1 }), {});
    expect(Object.values(perArea)).toEqual([2, 2, 2, 2, 2]);

    first = session.questions[0];
    expect(Object.keys(first).sort()).toEqual(
      ["active_ms", "area", "bookmarked", "code", "correction", "exam", "id", "images", "number", "options", "origin", "preliminary", "selected", "statement", "support"].sort()
    );
    expect(first.options[0]).toEqual({ id: "A", text: "alternativa A" });
    const sent = JSON.stringify(session.questions);
    for (const secret of ["correct_option", "explanation", "topic", "expected_conduct"]) expect(sent).not.toContain(secret);
  });

  it("filtro de área e pedido maior que o disponível", async () => {
    const started = await rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: { area: "PEDIATRIA" }, p_count: 50 });
    expect(started.count).toBe(4);
    const session = await rpc(ANA, "app_get_session", { p_session_id: started.session_id });
    expect(session.questions.every((q: any) => q.area === "PEDIATRIA" && q.id !== "q-anulada")).toBe(true);

    await expect(
      rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: { search: "inexistente-xyz" }, p_count: 10 })
    ).rejects.toThrow(/Nenhuma questão/);
    await expect(rpc(ANA, "app_start_session", { p_kind: "prova", p_filters: {}, p_count: 10 })).rejects.toThrow(/inválido/);
    await expect(
      rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 10, p_time_limit_seconds: 600 })
    ).rejects.toThrow(/Tempo limite/);
  });

  it("a resposta é corrigida pelo banco e não pode ser trocada depois", async () => {
    // 16/10: o tempo que vale é o do navegador limitado ao que o servidor viu passar desde o início da sessão (aqui, 60 s)
    await db.query(`update public.practice_sessions set started_at = started_at - interval '60 seconds' where id = $1`, [sessionId]);
    const wrong = await rpc(ANA, "app_answer_question", {
      p_session_id: sessionId,
      p_question_id: first.id,
      p_option: "A",
      p_active_ms: 41_000,
    });
    expect(wrong).toMatchObject({
      selected: "A",
      is_correct: false,
      correct_option: "B",
      explanation: "Porque é a conduta indicada.",
      option_notes: [],
      expected_conduct: "Conduta esperada.",
    });

    const again = await rpc(ANA, "app_answer_question", { p_session_id: sessionId, p_question_id: first.id, p_option: "B" });
    expect(again).toMatchObject({ selected: "A", is_correct: false });
    const attempts = await db.query<any>(`select selected_option, is_correct, active_ms from public.question_attempts where session_id = $1`, [sessionId]);
    expect(attempts.rows).toEqual([{ selected_option: "A", is_correct: false, active_ms: 41_000 }]);

    const session = await rpc(ANA, "app_get_session", { p_session_id: sessionId });
    expect(session.questions[0]).toMatchObject({ selected: "A", correction: { is_correct: false, correct_option: "B" } });
    expect(session.questions[1]).toMatchObject({ selected: null, correction: null });
  });

  it("recusa alternativa inválida e questão de fora da sessão", async () => {
    const base = { p_session_id: sessionId, p_question_id: first.id };
    await expect(rpc(ANA, "app_answer_question", { ...base, p_option: "E" })).rejects.toThrow(/Alternativa inválida/);
    await expect(rpc(ANA, "app_answer_question", { ...base, p_question_id: "q-anulada", p_option: "A" })).rejects.toThrow(/fora desta sessão/);
  });

  it("outro aluno não lê nem responde a sessão", async () => {
    expect(await rpc(BRUNO, "app_get_session", { p_session_id: sessionId })).toBeNull();
    await expect(
      rpc(BRUNO, "app_answer_question", { p_session_id: sessionId, p_question_id: first.id, p_option: "B" })
    ).rejects.toThrow(/não encontrada/);
    await expect(rpc(BRUNO, "app_finish_session", { p_session_id: sessionId })).rejects.toThrow(/não encontrada/);
    expect(await rpc(BRUNO, "app_recent_sessions")).toEqual([]);
  });

  it("filtros 'erradas', 'não resolvidas' e 'marcadas' usam o histórico do próprio aluno", async () => {
    const count = async (status: string, uid = ANA) => (await rpc(uid, "app_count_questions", { p_filters: { status } })).total;
    expect(await count("wrong")).toBe(1);
    expect(await count("unanswered")).toBe(19);
    expect(await count("unanswered", BRUNO)).toBe(20);

    expect(await count("bookmarked")).toBe(0);
    expect(await rpc(ANA, "app_set_bookmark", { p_question_id: first.id, p_on: true })).toBe(true);
    await rpc(ANA, "app_set_bookmark", { p_question_id: first.id, p_on: true });
    expect(await count("bookmarked")).toBe(1);
    expect(await count("bookmarked", BRUNO)).toBe(0);
    expect((await rpc(ANA, "app_get_session", { p_session_id: sessionId })).questions[0].bookmarked).toBe(true);
    expect(await rpc(ANA, "app_set_bookmark", { p_question_id: first.id, p_on: false })).toBe(false);
    expect(await count("bookmarked")).toBe(0);
  });

  it("finalizar devolve o placar e a correção de todas, e fecha a sessão para novas respostas", async () => {
    const before = await rpc(ANA, "app_get_session", { p_session_id: sessionId });
    // 30 s se passaram desde a resposta anterior (o servidor mede; o navegador manda 19 s)
    await db.query(`update public.question_attempts set answered_at = answered_at - interval '30 seconds' where session_id = $1`, [sessionId]);
    await rpc(ANA, "app_answer_question", { p_session_id: sessionId, p_question_id: before.questions[1].id, p_option: "B", p_active_ms: 19_000 });

    const done = await rpc(ANA, "app_finish_session", { p_session_id: sessionId });
    expect(done.finished_at).not.toBeNull();
    expect(done.result).toMatchObject({ total: 10, answered: 2, correct: 1, active_seconds: 60 });
    expect(done.result.by_area.reduce((n: number, a: any) => n + a.total, 0)).toBe(10);
    expect(done.questions[2]).toMatchObject({ selected: null, correction: { is_correct: null, correct_option: "B" } });

    await expect(
      rpc(ANA, "app_answer_question", { p_session_id: sessionId, p_question_id: before.questions[2].id, p_option: "B" })
    ).rejects.toThrow(/já foi finalizada/);
    expect((await rpc(ANA, "app_finish_session", { p_session_id: sessionId })).finished_at).toBe(done.finished_at);
  });
});

describe("Treino — simulado", () => {
  let sessionId: string;
  let questions: any[];

  it("guarda as respostas sem revelar o gabarito e deixa trocar até finalizar", async () => {
    const started = await rpc(ANA, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 5, p_time_limit_seconds: 900 });
    sessionId = started.session_id;
    questions = (await rpc(ANA, "app_get_session", { p_session_id: sessionId })).questions;

    const answer = (index: number, option: string) =>
      rpc(ANA, "app_answer_question", { p_session_id: sessionId, p_question_id: questions[index].id, p_option: option, p_active_ms: 30_000 });
    expect(await answer(0, "A")).toEqual({ saved: true });
    expect(await answer(0, "B")).toEqual({ saved: true });
    expect(await answer(1, "C")).toEqual({ saved: true });

    const session = await rpc(ANA, "app_get_session", { p_session_id: sessionId });
    expect(session.time_limit_seconds).toBe(900);
    expect(session.questions.map((q: any) => q.selected)).toEqual(["B", "C", null, null, null]);
    expect(session.questions.every((q: any) => q.correction === null)).toBe(true);
    expect((await db.query(`select 1 from public.question_attempts where session_id = $1`, [sessionId])).rows).toHaveLength(0);

    const [recent] = await rpc(ANA, "app_recent_sessions", { p_kind: "simulado" });
    expect(recent).toMatchObject({ id: sessionId, total: 5, answered: 2, correct: null, expired: false, finished_at: null });
  });

  it("depois do tempo não aceita mais respostas, mas finaliza com o que foi guardado", async () => {
    await db.query(`update public.practice_sessions set started_at = now() - interval '20 minutes' where id = $1`, [sessionId]);
    await expect(
      rpc(ANA, "app_answer_question", { p_session_id: sessionId, p_question_id: questions[2].id, p_option: "B" })
    ).rejects.toThrow(/tempo do simulado acabou/);
    expect((await rpc(ANA, "app_recent_sessions", { p_kind: "simulado" }))[0].expired).toBe(true);

    const done = await rpc(ANA, "app_finish_session", { p_session_id: sessionId });
    expect(done.result).toMatchObject({ total: 5, answered: 2, correct: 1 });
    expect(done.questions.map((q: any) => q.correction.is_correct)).toEqual([true, false, null, null, null]);
    expect(done.questions[0].correction.explanation).toBe("Porque é a conduta indicada.");

    await rpc(ANA, "app_finish_session", { p_session_id: sessionId });
    expect((await db.query(`select 1 from public.question_attempts where session_id = $1`, [sessionId])).rows).toHaveLength(2);
  });

  it("o histórico traz só as sessões do aluno, sem as encerradas em branco", async () => {
    const empty = await rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 5 });
    expect((await rpc(ANA, "app_recent_sessions", { p_kind: "questoes" })).some((s: any) => s.id === empty.session_id)).toBe(true);
    await rpc(ANA, "app_finish_session", { p_session_id: empty.session_id });

    const recent = await rpc(ANA, "app_recent_sessions", { p_limit: 50 });
    expect(recent.some((s: any) => s.id === empty.session_id)).toBe(false);
    expect(recent.find((s: any) => s.id === sessionId)).toMatchObject({ kind: "simulado", answered: 2, correct: 1 });
    expect(recent.map((s: any) => s.started_at)).toEqual([...recent.map((s: any) => s.started_at)].sort().reverse());
  });
});

describe("Simulado — cronômetro: tempo escolhido, pausar, continuar e encerrar (…4300_simulado_cronometro.sql)", () => {
  const CAIO = "00000000-0000-4000-8000-00000000000c";
  let sessionId: string;
  let questions: any[];
  const answer = (index: number, option = "B") =>
    rpc(CAIO, "app_answer_question", { p_session_id: sessionId, p_question_id: questions[index].id, p_option: option, p_active_ms: 20_000 });
  const near = (value: number, expected: number, tolerance = 3) => expect(Math.abs(value - expected), `${value} ≈ ${expected}`).toBeLessThanOrEqual(tolerance);
  /** Volta o relógio da sessão: simula tempo passado sem esperar de verdade. */
  const shift = (sql: string) => db.query(`update public.practice_sessions set ${sql} where id = $1`, [sessionId]);

  beforeAll(async () => {
    await db.query(`insert into auth.users (id, email) values ($1, 'caio@teste.dev')`, [CAIO]);
  });

  it("o tempo escolhido pelo aluno vira o prazo e a sessão diz quanto falta", async () => {
    const started = await rpc(CAIO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 5, p_time_limit_seconds: 45 * 60 });
    sessionId = started.session_id;
    const s = await rpc(CAIO, "app_get_session", { p_session_id: sessionId });
    questions = s.questions;
    expect(s).toMatchObject({ time_limit_seconds: 2700, paused_at: null, paused_seconds: 0 });
    near(s.remaining_seconds, 2700);
    expect(Date.parse(s.deadline_at) - Date.parse(s.started_at)).toBe(2_700_000);
    // de 1 minuto a 12 horas
    for (const seconds of [59, 43_201]) {
      await expect(rpc(CAIO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 5, p_time_limit_seconds: seconds })).rejects.toThrow(/Tempo limite inválido/);
    }
  });

  it("pausado: o tempo para, a resposta é recusada e o simulado não expira", async () => {
    expect(await answer(0)).toEqual({ saved: true });
    const paused = await rpc(CAIO, "app_pause_session", { p_session_id: sessionId });
    expect(paused.paused_at).not.toBeNull();
    near(paused.remaining_seconds, 2700);
    expect((await rpc(CAIO, "app_pause_session", { p_session_id: sessionId })).paused_at).toBe(paused.paused_at); // pausar de novo não muda nada
    await expect(answer(1)).rejects.toThrow(/está pausado/);

    // correu 10 minutos e está pausado há 2 horas: o prazo original já passou, mas pausado não conta
    await shift(`started_at = started_at - interval '2 hours 10 minutes', paused_at = paused_at - interval '2 hours'`);
    const s = await rpc(CAIO, "app_get_session", { p_session_id: sessionId });
    near(s.remaining_seconds, 35 * 60);
    near(s.paused_seconds, 7200);
    const [recent] = await rpc(CAIO, "app_recent_sessions", { p_kind: "simulado" });
    expect(recent).toMatchObject({ id: sessionId, paused: true, expired: false, answered: 1 });
    near(recent.remaining_seconds, 35 * 60);
    const open = (await rpc(CAIO, "app_home")).open_session;
    expect(open).toMatchObject({ id: sessionId, kind: "simulado", paused: true, answered: 1 });
    near(open.remaining_seconds, 35 * 60);
    await new Promise((r) => setTimeout(r, 1100));
    near((await rpc(CAIO, "app_get_session", { p_session_id: sessionId })).remaining_seconds, 35 * 60, 1); // parado continua parado
  });

  it("continuar: o tempo volta a correr de onde parou e as respostas voltam a valer", async () => {
    const resumed = await rpc(CAIO, "app_resume_session", { p_session_id: sessionId });
    expect(resumed.paused_at).toBeNull();
    near(resumed.remaining_seconds, 35 * 60);
    near(resumed.paused_seconds, 7200);
    near((Date.parse(resumed.deadline_at) - Date.parse(resumed.server_now)) / 1000, 35 * 60);
    expect(await answer(1)).toEqual({ saved: true });
    near((await rpc(CAIO, "app_resume_session", { p_session_id: sessionId })).paused_seconds, 7200); // continuar sem pausa não muda nada
    expect((await rpc(CAIO, "app_recent_sessions", { p_kind: "simulado" }))[0]).toMatchObject({ paused: false, expired: false });
  });

  it("o prazo conta só o tempo correndo: passado o tempo escolhido, não responde nem pausa", async () => {
    await shift(`started_at = started_at - interval '36 minutes'`); // 10 + 36 min de prova correndo > 45 min
    await expect(answer(2)).rejects.toThrow(/tempo do simulado acabou/);
    await expect(rpc(CAIO, "app_pause_session", { p_session_id: sessionId })).rejects.toThrow(/tempo do simulado acabou/);
    expect((await rpc(CAIO, "app_recent_sessions", { p_kind: "simulado" }))[0]).toMatchObject({ expired: true, paused: false, remaining_seconds: 0 });
    expect((await rpc(CAIO, "app_home")).open_session).toBeNull();
    await shift(`started_at = started_at + interval '36 minutes'`); // de volta para dentro do tempo
  });

  it("encerrar pausado: finaliza, fecha a pausa e o tempo do resultado não conta as pausas", async () => {
    await rpc(CAIO, "app_pause_session", { p_session_id: sessionId });
    await shift(`started_at = started_at - interval '30 minutes', paused_at = paused_at - interval '30 minutes'`); // pausado há 30 min
    const done = await rpc(CAIO, "app_finish_session", { p_session_id: sessionId });
    expect(done).toMatchObject({ paused_at: null, result: { total: 5, answered: 2, correct: 2 } });
    expect(done.finished_at).not.toBeNull();
    near(done.result.paused_seconds, 2 * 3600 + 30 * 60);
    near(done.result.elapsed_seconds, 10 * 60); // 10 min de prova; o resto foi pausa
    const row = (await db.query<any>(`select paused_at, paused_ms from public.practice_sessions where id = $1`, [sessionId])).rows[0];
    expect(row.paused_at).toBeNull();
    near(Number(row.paused_ms) / 1000, 9000);
    await expect(rpc(CAIO, "app_pause_session", { p_session_id: sessionId })).rejects.toThrow(/já foi finalizada/);
    await expect(rpc(CAIO, "app_resume_session", { p_session_id: sessionId })).rejects.toThrow(/já foi finalizada/);
  });

  it("treino não pausa; ninguém pausa a sessão de outro aluno; simulado sem cronômetro também pausa", async () => {
    const treino = await rpc(CAIO, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 5 });
    await expect(rpc(CAIO, "app_pause_session", { p_session_id: treino.session_id })).rejects.toThrow(/Só o simulado tem pausa/);
    const sim = await rpc(CAIO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 5, p_time_limit_seconds: 600 });
    await expect(rpc(ANA, "app_pause_session", { p_session_id: sim.session_id })).rejects.toThrow(/não encontrada/);
    await expect(rpc(ANA, "app_resume_session", { p_session_id: sim.session_id })).rejects.toThrow(/não encontrada/);
    await expect(rpc(null, "app_pause_session", { p_session_id: sim.session_id })).rejects.toThrow(/não encontrada/);
    const free = await rpc(CAIO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 5 });
    const p = await rpc(CAIO, "app_pause_session", { p_session_id: free.session_id });
    expect(p).toMatchObject({ time_limit_seconds: null, deadline_at: null, remaining_seconds: null });
    expect(p.paused_at).not.toBeNull();
    // a pausa não pode ficar presa num treino nem numa sessão finalizada
    await expect(db.query(`update public.practice_sessions set paused_at = now() where id = $1`, [treino.session_id])).rejects.toThrow(/practice_sessions_pause_check/);
  });
});
