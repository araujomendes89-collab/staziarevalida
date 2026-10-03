// @vitest-environment node
/**
 * Caderno de erros e Desempenho (supabase/migrations/…0900_review_api.sql) num Postgres
 * real em memória, agindo como aluno.
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

/** Resposta avulsa do aluno (gabarito de todas as questões do teste: B). */
const answer = (uid: string, questionId: string, option: string, ms: number | null = null) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    await tx.query(`insert into public.question_attempts (question_id, selected_option, active_ms) values ($1, $2, $3)`, [questionId, option, ms]);
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev')`, [ANA, BRUNO]);
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count)
                 values ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 11)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: id === "B" ? "Explicação." : "" })));
  let number = 0;
  const insert = (id: string, area: string, status = "valid") =>
    db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, status)
       values ($1, $2, 'revalida-2024-1', $3, $4, $5, $6, $7, 'B', $8)`,
      [id, `T-${id}`, ++number, area, `Tema de ${id}`, `Enunciado de ${id}.`, options, status]
    );
  for (const [a, area] of AREAS.entries()) for (let n = 1; n <= 2; n++) await insert(`q-${a}-${n}`, area);
  await insert("q-anulada", "PEDIATRIA", "annulled");
}, 60_000);

describe("Caderno de erros", () => {
  it("começa vazio", async () => {
    expect(await rpc(ANA, "app_error_notebook")).toEqual({ counts: { pending: 0, overcome: 0, recurrent: 0 }, items: [] });
  });

  it("lista o que foi errado, separa o que já foi superado e conta as recorrentes", async () => {
    await answer(ANA, "q-0-1", "A"); // errada
    await answer(ANA, "q-0-2", "A"); // errada duas vezes
    await answer(ANA, "q-0-2", "C");
    await answer(ANA, "q-1-1", "D"); // errada e depois acertada
    await answer(ANA, "q-1-1", "B");
    await answer(ANA, "q-2-1", "B"); // nunca errada: não entra
    await answer(ANA, "q-anulada", "A"); // anulada: não entra

    const book = await rpc(ANA, "app_error_notebook");
    expect(book.counts).toEqual({ pending: 2, overcome: 1, recurrent: 1 });
    expect(book.items.map((i: any) => [i.question_id, i.status, i.wrong_count])).toEqual([
      ["q-1-1", "superada", 1],
      ["q-0-2", "para_revisar", 2],
      ["q-0-1", "para_revisar", 1],
    ]);
    expect(book.items[1]).toMatchObject({ area: "CLINICA_MEDICA", topic: "Tema de q-0-2", excerpt: "Enunciado de q-0-2.", has_note: false, exam: { kind: "REVALIDA", year: 2024, semester: 1 } });
    // a lista não carrega gabarito nem a alternativa marcada
    expect(JSON.stringify(book)).not.toMatch(/correct_option|last_wrong_option|explanation/);
  });

  it("o detalhe traz a correção só de questão que o aluno já errou", async () => {
    const detail = await rpc(ANA, "app_error_detail", { p_question_id: "q-0-2" });
    expect(detail).toMatchObject({
      id: "q-0-2",
      selected: "C",
      status: "para_revisar",
      wrong_count: 2,
      correction: { is_correct: false, correct_option: "B", explanation: "Explicação.", topic: "Tema de q-0-2" },
    });
    expect(detail.options).toHaveLength(4);

    expect(await rpc(ANA, "app_error_detail", { p_question_id: "q-2-1" })).toBeNull(); // acertou de primeira
    expect(await rpc(ANA, "app_error_detail", { p_question_id: "q-3-1" })).toBeNull(); // nunca respondeu
    expect(await rpc(BRUNO, "app_error_detail", { p_question_id: "q-0-2" })).toBeNull(); // erro de outro aluno
  });

  it("anotação e motivo ficam com o aluno e podem ser apagados", async () => {
    expect(await rpc(ANA, "app_save_error_note", { p_question_id: "q-0-2", p_note: "  Confundi com DPOC.  ", p_reason: "conhecimento" })).toEqual({
      note: "Confundi com DPOC.",
      reason: "conhecimento",
    });
    expect(await rpc(ANA, "app_error_detail", { p_question_id: "q-0-2" })).toMatchObject({ note: "Confundi com DPOC.", reason: "conhecimento" });
    expect((await rpc(ANA, "app_error_notebook")).items.find((i: any) => i.question_id === "q-0-2").has_note).toBe(true);

    await rpc(ANA, "app_save_error_note", { p_question_id: "q-0-2", p_note: "Atenção ao enunciado.", p_reason: null });
    expect(await rpc(ANA, "app_error_detail", { p_question_id: "q-0-2" })).toMatchObject({ note: "Atenção ao enunciado.", reason: null });

    await rpc(ANA, "app_save_error_note", { p_question_id: "q-0-2", p_note: " ", p_reason: "" });
    expect((await db.query(`select 1 from public.error_notes`)).rows).toHaveLength(0);

    const base = { p_question_id: "q-0-2", p_note: "x" };
    await expect(rpc(ANA, "app_save_error_note", { ...base, p_reason: "preguica" })).rejects.toThrow(/Motivo inválido/);
    await expect(rpc(ANA, "app_save_error_note", { ...base, p_note: "x".repeat(2001), p_reason: null })).rejects.toThrow(/2\.000/);
    await expect(rpc(ANA, "app_save_error_note", { ...base, p_question_id: "q-3-1", p_reason: null })).rejects.toThrow(/fora do seu caderno/);
    await expect(rpc(BRUNO, "app_save_error_note", { ...base, p_reason: null })).rejects.toThrow(/fora do seu caderno/);
  });
});

describe("Desempenho", () => {
  it("sem respostas, tudo zerado e sem médias inventadas", async () => {
    const p = await rpc(BRUNO, "app_performance");
    expect(p).toMatchObject({ days: 30, attempts: 0, correct: 0, questions: 0, avg_seconds: null, streak_days: 0, daily: [] });
    expect(p.simulados).toEqual({ count: 0, accuracy: null });
    expect(p.areas.map((a: any) => [a.area, a.attempts])).toEqual(AREAS.map((a) => [a, 0]));
  });

  it("totais, áreas e série por dia vêm das respostas (sem a anulada)", async () => {
    await answer(ANA, "q-3-1", "B", 30_000);
    await answer(ANA, "q-3-2", "B", 90_000);

    const p = await rpc(ANA, "app_performance", { p_days: 7 });
    // 6 respostas válidas do bloco anterior + 2 agora = 8 (4 certas), em 6 questões diferentes
    expect(p).toMatchObject({ days: 7, attempts: 8, correct: 4, questions: 6, avg_seconds: 60, streak_days: 1 });
    expect(p.period).toEqual({ attempts: 8, correct: 4 });
    expect(p.previous).toEqual({ attempts: 0, correct: 0 });
    expect(p.daily).toHaveLength(1);
    expect(p.daily[0]).toMatchObject({ attempts: 8, correct: 4 });
    expect(p.areas.map((a: any) => [a.attempts, a.correct])).toEqual([[3, 0], [2, 1], [1, 1], [2, 2], [0, 0]]);
  });

  it("compara o período com o anterior e limita o intervalo pedido", async () => {
    // empurra tudo 10 dias para trás e responde mais uma hoje
    await db.exec(`update public.question_attempts set answered_at = answered_at - interval '10 days'`);
    await answer(ANA, "q-4-1", "B");

    const week = await rpc(ANA, "app_performance", { p_days: 7 });
    expect(week.period).toEqual({ attempts: 1, correct: 1 });
    expect(week.previous).toEqual({ attempts: 8, correct: 4 });
    expect(week.daily).toHaveLength(1);

    const month = await rpc(ANA, "app_performance", { p_days: 30 });
    expect(month.period).toEqual({ attempts: 9, correct: 5 });
    expect(month.daily.map((d: any) => d.attempts)).toEqual([8, 1]);

    expect((await rpc(ANA, "app_performance", { p_days: 1 })).days).toBe(7);
    expect((await rpc(ANA, "app_performance", { p_days: 9999 })).days).toBe(365);
  });

  it("simulados finalizados entram com a média de acerto sobre o total de questões", async () => {
    const started = await rpc(ANA, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 10 });
    const session = await rpc(ANA, "app_get_session", { p_session_id: started.session_id });
    for (const q of session.questions.slice(0, 4)) {
      await rpc(ANA, "app_answer_question", { p_session_id: started.session_id, p_question_id: q.id, p_option: "B" });
    }
    expect((await rpc(ANA, "app_performance")).simulados).toEqual({ count: 0, accuracy: null });
    await rpc(ANA, "app_finish_session", { p_session_id: started.session_id });
    expect((await rpc(ANA, "app_performance")).simulados).toEqual({ count: 1, accuracy: 40 });
    expect((await rpc(BRUNO, "app_performance")).simulados.count).toBe(0);
  });
});
