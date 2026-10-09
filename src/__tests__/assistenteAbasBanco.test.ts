// @vitest-environment node
/**
 * Assistente das abas, parte do banco (supabase/migrations/…6100_assistente_abas.sql) num Postgres real em memória:
 * o salvar da questão aceita o motivo (p_reason), que vai para a trilha e para o registro de ações, e a trilha passa
 * a registrar conduta esperada, o que a questão avalia, tema e subtema.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const STUDENT = "00000000-0000-4000-8000-00000000000a";

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

const q = (extra: Record<string, unknown> = {}) => ({
  kind: "REVALIDA", year: 2024, semester: 1, number: 7, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo",
  statement: "Lactente de 4 meses com sibilância e coriza há 2 dias. Qual a conduta?",
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false, ...extra,
});
const trail = async (id: string) =>
  (await db.query<any>(`select reason, changes from public.question_change_log where question_id = $1 order by id`, [id])).rows;
const lastLog = async (id: string) =>
  (await db.query<any>(`select action, actor_id, details from public.admin_audit_log where target = $1 order by id desc limit 1`, [id])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [STUDENT, "aluna@teste.dev", "Aluna"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 60_000);

describe("Assistente das abas — motivo ao salvar a questão (migração 6100)", () => {
  it("p_reason chega à trilha e ao registro de ações", async () => {
    const saved = await rpc(EDITOR, "app_admin_save_question", { p_question: q() });
    expect(saved.code).toBe("REV-2024.1-Q007");
    const again = await rpc(EDITOR, "app_admin_save_question", {
      p_question: { ...q({ expected_conduct: "Oxigênio se saturação baixa." }), id: saved.id },
      p_reason: "  assistente de IA  ",
    });
    // mesmo retorno de antes: a questão como app_admin_question a devolve
    expect(again.id).toBe(saved.id);
    expect(again.expected_conduct).toBe("Oxigênio se saturação baixa.");
    const last = (await trail(saved.id)).at(-1);
    expect(last.reason).toBe("assistente de IA");
    expect(last.changes).toEqual({ expected_conduct: { de: "Suporte.", para: "Oxigênio se saturação baixa." } });
    const log = await lastLog(saved.id);
    expect(log).toMatchObject({ action: "question.updated", actor_id: EDITOR });
    expect(log.details).toEqual({ status: "valid", reason: "assistente de IA" });
  });

  it("a trilha registra conduta esperada, o que a questão avalia, tema e subtema", async () => {
    const saved = await rpc(EDITOR, "app_admin_save_question", { p_question: q({ number: 8 }) });
    await rpc(EDITOR, "app_admin_save_question", {
      p_question: {
        ...q({ number: 8, expected_conduct: "Oxigênio se saturação baixa.", inep_intent: "Manejo inicial.", topic: "Bronquiolite viral aguda", subtopic: "Manejo ambulatorial" }),
        id: saved.id,
      },
    });
    const last = (await trail(saved.id)).at(-1);
    expect(last.changes).toEqual({
      expected_conduct: { de: "Suporte.", para: "Oxigênio se saturação baixa." },
      inep_intent: { de: null, para: "Manejo inicial." },
      topic: { de: "Bronquiolite", para: "Bronquiolite viral aguda" },
      subtopic: { de: "Manejo", para: "Manejo ambulatorial" },
    });
  });

  it("chamada antiga sem p_reason funciona e a trilha fica sem motivo", async () => {
    const saved = await rpc(EDITOR, "app_admin_save_question", { p_question: q({ number: 10 }) });
    await rpc(EDITOR, "app_admin_save_question", { p_question: { ...q({ number: 10, topic: "Asma" }), id: saved.id } });
    const rows = await trail(saved.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBeNull();
    expect(rows[0].changes).toEqual({ topic: { de: "Bronquiolite", para: "Asma" } });
    expect((await lastLog(saved.id)).details).toEqual({ status: "valid" });
  });

  it("motivo em branco vira nulo; motivo longo é cortado em 200", async () => {
    const saved = await rpc(EDITOR, "app_admin_save_question", { p_question: q({ number: 11 }) });
    await rpc(EDITOR, "app_admin_save_question", { p_question: { ...q({ number: 11, subtopic: "Alta" }), id: saved.id }, p_reason: "   " });
    expect((await trail(saved.id)).at(-1).reason).toBeNull();
    expect((await lastLog(saved.id)).details).toEqual({ status: "valid" });

    await rpc(EDITOR, "app_admin_save_question", { p_question: { ...q({ number: 11, subtopic: "Internação" }), id: saved.id }, p_reason: "x".repeat(300) });
    expect((await trail(saved.id)).at(-1).reason).toBe("x".repeat(200));
    expect((await lastLog(saved.id)).details.reason).toBe("x".repeat(200));
  });

  it("o motivo vale só para aquele salvamento", async () => {
    const saved = await rpc(ADMIN, "app_admin_save_question", { p_question: q({ number: 12 }) });
    await rpc(ADMIN, "app_admin_save_question", { p_question: { ...q({ number: 12, topic: "Asma" }), id: saved.id }, p_reason: "assistente de IA" });
    await rpc(ADMIN, "app_admin_save_question", { p_question: { ...q({ number: 12, topic: "Pneumonia" }), id: saved.id } });
    expect((await trail(saved.id)).map((r: any) => r.reason)).toEqual(["assistente de IA", null]);
  });

  it("a trava de equipe continua", async () => {
    await expect(rpc(STUDENT, "app_admin_save_question", { p_question: q({ number: 9 }), p_reason: "assistente de IA" })).rejects.toThrow("Acesso restrito à equipe.");
    await expect(rpc(STUDENT, "app_admin_save_question", { p_question: q({ number: 9 }) })).rejects.toThrow("Acesso restrito à equipe.");
    await expect(rpc(null, "app_admin_save_question", { p_question: q({ number: 9 }), p_reason: "assistente de IA" })).rejects.toThrow(/permission denied/);
    expect((await db.query<any>(`select count(*)::int n from public.questions where id = 'revalida_2024_1_q009'`)).rows[0].n).toBe(0);
  });

  it("só existe a versão nova da função (com p_reason)", async () => {
    const sigs = (await db.query<any>(
      `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'app_admin_save_question'`
    )).rows.map((r: any) => r.sig);
    expect(sigs).toEqual(["app_admin_save_question(jsonb,text)"]);
  });
});
