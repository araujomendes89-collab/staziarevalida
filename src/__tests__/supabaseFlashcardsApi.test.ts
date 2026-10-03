// @vitest-environment node
/**
 * Flashcards (supabase/migrations/…1000_flashcards_api.sql) num Postgres real em memória,
 * com o agendamento calculado pelo mesmo FSRS do app.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { Rating } from "ts-fsrs";
import { nextSchedule } from "../novo/app/review/fsrs.js";

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

const create = (uid: string, extra: Record<string, unknown> = {}) =>
  rpc(uid, "app_create_flashcard", { p_area: "PEDIATRIA", p_topic: "Bronquiolite", p_front: "Agente mais comum?", p_back: "Vírus sincicial respiratório.", ...extra });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev')`, [ANA, BRUNO]);
  await db.exec(`
    insert into public.exams (id, kind, year, title) values ('revalida-2021', 'REVALIDA', 2021, 'Revalida INEP 2021');
    insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option) values
      ('q1', 'REV-2021-Q001', 'revalida-2021', 1, 'CLINICA_MEDICA', 'Hipertireoidismo', 'Caso.',
       '[{"id":"A","text":"a"},{"id":"B","text":"b"},{"id":"C","text":"c"},{"id":"D","text":"d"}]', 'C');
    insert into public.flashcards (area, topic, front, back, review_status, published) values
      ('CLINICA_MEDICA', 'Oficial', 'Cartão oficial publicado', 'Verso', 'approved', true),
      ('CLINICA_MEDICA', 'Oficial', 'Cartão oficial em revisão', 'Verso', 'unreviewed', false);
  `);
}, 60_000);

describe("Flashcards — criar", () => {
  it("o aluno vê os oficiais publicados e os próprios; nunca os em revisão nem os dos outros", async () => {
    const before = await rpc(ANA, "app_flashcards");
    expect(before.counts).toMatchObject({ total: 1, new: 1, learning: 0, consolidated: 0, due: 0, mine: 0 });
    expect(before.queue.map((c: any) => c.front)).toEqual(["Cartão oficial publicado"]);

    const { id } = await create(ANA);
    expect(id).toBeTruthy();
    const after = await rpc(ANA, "app_flashcards");
    expect(after.counts).toMatchObject({ total: 2, new: 2, mine: 1 });
    expect(after.queue.find((c: any) => c.id === id)).toMatchObject({ area: "PEDIATRIA", topic: "Bronquiolite", mine: true, schedule: null });

    expect((await rpc(BRUNO, "app_flashcards")).counts.total).toBe(1);
    expect((await rpc(ANA, "app_flashcards", { p_area: "PEDIATRIA" })).queue.map((c: any) => c.id)).toEqual([id]);
  });

  it("valida os campos e não duplica o cartão da mesma questão", async () => {
    await expect(create(ANA, { p_area: "ODONTO" })).rejects.toThrow(/grande área/);
    await expect(create(ANA, { p_front: "  " })).rejects.toThrow(/pergunta e a resposta/);
    await expect(create(ANA, { p_back: "x".repeat(4001) })).rejects.toThrow(/longo demais/);
    await expect(create(ANA, { p_source_question_id: "nao-existe" })).rejects.toThrow(/Questão não encontrada/);
    await expect(create(null as any)).rejects.toThrow(/Entre na sua conta/);

    const fromQuestion = await create(ANA, { p_area: "CLINICA_MEDICA", p_topic: "", p_source_question_id: "q1" });
    const card = (await rpc(ANA, "app_flashcards")).queue.find((c: any) => c.id === fromQuestion.id);
    expect(card).toMatchObject({ topic: "Meus cartões", source_question_id: "q1" });
    await expect(create(ANA, { p_source_question_id: "q1" })).rejects.toThrow(/já criou um flashcard desta questão/);
    // outro aluno pode criar o dele da mesma questão
    expect((await create(BRUNO, { p_source_question_id: "q1" })).id).toBeTruthy();
  });
});

describe("Flashcards — revisar", () => {
  it("a revisão grava o estado do FSRS, tira o cartão da fila e conta na sequência de estudo", async () => {
    const card = (await rpc(ANA, "app_flashcards", { p_area: "PEDIATRIA" })).queue[0];
    const next = nextSchedule(card.schedule, Rating.Good, new Date());
    expect(next.state).toBeGreaterThan(0);
    expect(new Date(next.due).getTime()).toBeGreaterThan(Date.now());

    const saved = await rpc(ANA, "app_review_flashcard", { p_card_id: card.id, p_rating: Rating.Good, p_next: next });
    expect(new Date(saved.due).getTime()).toBe(new Date(next.due).getTime());

    const after = await rpc(ANA, "app_flashcards", { p_area: "PEDIATRIA" });
    expect(after.queue).toEqual([]);
    expect(after.counts).toMatchObject({ total: 1, new: 0, learning: 1, due: 0 });
    expect(new Date(after.counts.next_due).getTime()).toBe(new Date(next.due).getTime());

    const review = (await db.query<any>(`select rating, state_before from public.flashcard_reviews where card_id = $1`, [card.id])).rows;
    expect(review).toEqual([{ rating: 3, state_before: 0 }]);
    expect((await rpc(ANA, "app_bootstrap")).streak_days).toBe(1);
  });

  it("vencido o prazo, o cartão volta para a fila antes dos novos e entra na contagem do menu", async () => {
    await db.exec(`update public.flashcard_states set due = now() - interval '1 hour'`);
    const data = await rpc(ANA, "app_flashcards");
    expect(data.queue[0]).toMatchObject({ topic: "Bronquiolite" });
    expect(data.queue[0].schedule.reps).toBe(1);
    expect(data.counts.due).toBe(1);
    expect((await rpc(ANA, "app_bootstrap")).flashcards_due).toBe(1);

    // intervalo longo → consolidado
    const next = nextSchedule(data.queue[0].schedule, Rating.Easy, new Date());
    await rpc(ANA, "app_review_flashcard", { p_card_id: data.queue[0].id, p_rating: Rating.Easy, p_next: { ...next, scheduled_days: 30 } });
    expect((await rpc(ANA, "app_flashcards", { p_area: "PEDIATRIA" })).counts).toMatchObject({ learning: 0, consolidated: 1 });
    expect((await db.query<any>(`select state_before from public.flashcard_reviews order by id desc limit 1`)).rows[0].state_before).toBeGreaterThan(0);
  });

  it("recusa avaliação e agenda inválidas, e cartão que o aluno não vê", async () => {
    const card = (await rpc(ANA, "app_flashcards")).queue.find((c: any) => c.front === "Cartão oficial publicado");
    const next = nextSchedule(null, Rating.Good, new Date());
    const review = (extra: Record<string, unknown>, uid = ANA) => rpc(uid, "app_review_flashcard", { p_card_id: card.id, p_rating: 3, p_next: next, ...extra });
    await expect(review({ p_rating: 5 })).rejects.toThrow(/Avaliação inválida/);
    await expect(review({ p_next: { ...next, due: "ontem" } })).rejects.toThrow(/Agenda inválida/);
    await expect(review({ p_next: { ...next, difficulty: 42 } })).rejects.toThrow(/Agenda inválida/);
    await expect(review({ p_next: { ...next, due: "2300-01-01T00:00:00Z" } })).rejects.toThrow(/Agenda inválida/);

    const hidden = (await db.query<any>(`select id from public.flashcards where not published and owner_id is null`)).rows[0].id;
    await expect(review({ p_card_id: hidden })).rejects.toThrow(/não encontrado/);
    const brunos = (await db.query<any>(`select id from public.flashcards where owner_id = $1`, [BRUNO])).rows[0].id;
    await expect(review({ p_card_id: brunos })).rejects.toThrow(/não encontrado/);
  });
});

describe("Flashcards — apagar", () => {
  it("só o dono apaga o cartão pessoal; oficiais não são apagados", async () => {
    const mine = (await db.query<any>(`select id from public.flashcards where owner_id = $1 and source_question_id = 'q1'`, [ANA])).rows[0].id;
    const official = (await db.query<any>(`select id from public.flashcards where published`)).rows[0].id;
    await expect(rpc(BRUNO, "app_delete_flashcard", { p_card_id: mine })).rejects.toThrow(/não encontrado/);
    await expect(rpc(ANA, "app_delete_flashcard", { p_card_id: official })).rejects.toThrow(/não encontrado/);
    expect(await rpc(ANA, "app_delete_flashcard", { p_card_id: mine })).toBe(true);
    expect((await rpc(ANA, "app_flashcards")).counts.mine).toBe(1);
    // depois de apagado, dá para criar de novo a partir da questão
    expect((await create(ANA, { p_source_question_id: "q1" })).id).toBeTruthy();
  });
});
