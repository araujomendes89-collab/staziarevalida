// @vitest-environment node
/** Conta (supabase/migrations/…1200_account_api.sql): exportar e excluir os próprios dados. */
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

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ana@teste.dev', '{"name":"Ana"}'), ($2, 'bruno@teste.dev', '{"name":"Bruno"}')`, [ANA, BRUNO]);
  await db.exec(`insert into public.exams (id, kind, year, title) values ('revalida-2021', 'REVALIDA', 2021, 'Revalida INEP 2021')`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: id, explanation: "" })));
  for (let n = 1; n <= 6; n++) {
    await db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option)
       values ($1, $2, 'revalida-2021', $3, 'PEDIATRIA', 'Tema', 'Caso.', $4, 'B')`,
      [`q${n}`, `REV-2021-Q${n}`, n, options]
    );
  }
  // histórico dos dois alunos
  for (const uid of [ANA, BRUNO]) {
    const s = await rpc(uid, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 3 });
    const session = await rpc(uid, "app_get_session", { p_session_id: s.session_id });
    await rpc(uid, "app_answer_question", { p_session_id: s.session_id, p_question_id: session.questions[0].id, p_option: "A" });
    await rpc(uid, "app_set_bookmark", { p_question_id: session.questions[1].id, p_on: true });
    await rpc(uid, "app_create_flashcard", { p_area: "PEDIATRIA", p_topic: "T", p_front: "F", p_back: "V" });
    await rpc(uid, "app_save_error_note", { p_question_id: session.questions[0].id, p_note: `nota de ${uid}`, p_reason: null });
    await rpc(uid, "app_today");
  }
  await db.query(`insert into public.billing_events (user_id, provider, event_id, event_type, payload) values ($1, 'teste', 'evt-1', 'invoice.paid', '{}')`, [ANA]);
}, 60_000);

describe("Conta — exportar dados", () => {
  it("o arquivo traz tudo o que o aluno gerou, e só dele", async () => {
    const data = await rpc(ANA, "app_export_my_data");
    expect(data.account.id).toBe(ANA);
    expect(data.profile.name).toBe("Ana");
    expect(data.subscription).toMatchObject({ plan: "trial" });
    expect(data.subscription).not.toHaveProperty("provider_customer_id");
    expect(data.practice_sessions).toHaveLength(1);
    expect(data.question_attempts).toHaveLength(1);
    expect(data.question_attempts[0]).not.toHaveProperty("seq");
    expect(data.question_bookmarks).toHaveLength(1);
    expect(data.flashcards).toHaveLength(1);
    expect(data.error_notes.map((n: any) => n.note)).toEqual([`nota de ${ANA}`]);
    expect(data.plan_tasks.length).toBeGreaterThan(0);
    const all = JSON.stringify(data);
    expect(all).not.toContain(BRUNO);
    expect(all).not.toContain("bruno@teste.dev");
  });

  it("sem login não exporta nada", async () => {
    expect(await rpc(null, "app_export_my_data")).toBeNull();
  });
});

describe("Conta — excluir", () => {
  it("pede confirmação escrita e não roda sem login", async () => {
    await expect(rpc(ANA, "app_delete_my_account", { p_confirm: "excluir" })).rejects.toThrow(/Digite EXCLUIR/);
    await expect(rpc(null, "app_delete_my_account", { p_confirm: "EXCLUIR" })).rejects.toThrow(/permission denied|Entre na sua conta/);
  });

  it("apaga a conta e os dados do aluno, sem tocar nos de outro", async () => {
    const count = async (uid: string) =>
      (
        await db.query<any>(
          `select (select count(*) from public.profiles where id = $1)::int as profiles,
                  (select count(*) from public.question_attempts where user_id = $1)::int as attempts,
                  (select count(*) from public.practice_sessions where user_id = $1)::int as sessions,
                  (select count(*) from public.flashcards where owner_id = $1)::int as cards,
                  (select count(*) from public.error_notes where user_id = $1)::int as notes,
                  (select count(*) from public.plan_tasks where user_id = $1)::int as tasks`,
          [uid]
        )
      ).rows[0];
    expect(Object.values(await count(ANA)).every((n) => (n as number) > 0)).toBe(true);

    expect(await rpc(ANA, "app_delete_my_account", { p_confirm: "EXCLUIR" })).toBe(true);
    expect(Object.values(await count(ANA)).every((n) => n === 0)).toBe(true);
    expect((await db.query(`select 1 from auth.users where id = $1`, [ANA])).rows).toHaveLength(0);
    expect(Object.values(await count(BRUNO)).every((n) => (n as number) > 0)).toBe(true);
    // o registro de pagamento fica, sem o vínculo com a pessoa
    expect((await db.query<any>(`select user_id from public.billing_events where event_id = 'evt-1'`)).rows).toEqual([{ user_id: null }]);
  });
});
