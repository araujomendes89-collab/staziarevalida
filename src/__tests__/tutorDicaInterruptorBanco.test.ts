// @vitest-environment node
/**
 * Interruptor da dica do Tutor no banco (supabase/migrations/…10600_dica_tutor_interruptor.sql): nasce desligado, só o administrador
 * altera (aluno, editor e visitante são recusados), o servidor lê o valor em ch_worker_tutor_settings e o painel em app_admin_tutor_config.
 * (Que simulado nunca recebe contexto de dica é testado em telaQuestaoModeloBanco.test.ts.)
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const ALUNO = id(3);
const MOTIVO = "Teste da dica do Tutor";
let db: PGlite;

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
const salvar = (config: Record<string, unknown>, uid: string | null = ADMIN) => rpc(uid, "app_admin_tutor_save_config", { p_config: config, p_reason: MOTIVO });
const coluna = async () => (await db.query<any>(`select question_hint_enabled from public.tutor_config`)).rows[0].question_hint_enabled;
const settings = async () => (await db.query<{ s: any }>(`select public.ch_worker_tutor_settings() as s`)).rows[0].s;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  for (const [name, uid] of [["admin", ADMIN], ["editor", EDITOR], ["aluno", ALUNO]]) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${name}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 120_000);

describe("dica do Tutor — interruptor no banco", () => {
  it("nasce desligado, para o servidor e para o painel", async () => {
    expect(await coluna()).toBe(false);
    expect((await settings()).question_hint_enabled).toBe(false);
    expect((await rpc(ADMIN, "app_admin_tutor_config")).question_hint_enabled).toBe(false);
  });

  it("aluno, editor e visitante não conseguem alterar", async () => {
    await expect(salvar({ question_hint_enabled: true }, null)).rejects.toThrow(/permission denied/);
    for (const uid of [ALUNO, EDITOR]) await expect(salvar({ question_hint_enabled: true }, uid)).rejects.toThrow("Acesso restrito a administradores.");
    expect(await coluna()).toBe(false);
  });

  it("valor que não é ligado/desligado é recusado", async () => {
    await expect(salvar({ question_hint_enabled: "talvez" })).rejects.toThrow();
    expect(await coluna()).toBe(false);
  });

  it("o administrador liga e desliga; o servidor e o painel enxergam; salvar outra coisa não mexe nele", async () => {
    await salvar({ question_hint_enabled: true });
    expect(await coluna()).toBe(true);
    expect((await settings()).question_hint_enabled).toBe(true);
    expect((await rpc(ADMIN, "app_admin_tutor_config")).question_hint_enabled).toBe(true);
    await salvar({ inside_jokes: false });
    expect(await coluna()).toBe(true);
    await salvar({ question_hint_enabled: false });
    expect(await coluna()).toBe(false);
  });

  it("o servidor (ch_worker_tutor_settings) não fica aberto a aluno nem a visitante", async () => {
    const r = await db.query<any>(`select has_function_privilege('anon','public.ch_worker_tutor_settings()','execute') a, has_function_privilege('authenticated','public.ch_worker_tutor_settings()','execute') b`);
    expect(r.rows[0]).toEqual({ a: false, b: false });
  });
});
