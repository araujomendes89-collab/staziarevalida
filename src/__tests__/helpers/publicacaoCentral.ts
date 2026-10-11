/**
 * Apoio dos testes da publicação da Central para o aluno: banco PGlite com todas as migrações, os cinco usuários
 * (administrador, editor, revisor médico e dois alunos) e, a partir da Task 2, uma unidade aprovada pronta para publicar.
 */
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

export const ADMIN = "00000000-0000-4000-8000-0000000083ad";
export const EDITOR = "00000000-0000-4000-8000-0000000083ed";
export const REVISOR = "00000000-0000-4000-8000-0000000083c1";
export const ALUNO = "00000000-0000-4000-8000-0000000083a1";
export const ALUNO2 = "00000000-0000-4000-8000-0000000083a2";

export type Sql = (q: string, p?: unknown[]) => Promise<any[]>;
export type Rpc = <T = any>(uid: string | null, fn: string, args?: Record<string, unknown>) => Promise<T>;
export type AsUser = (uid: string, q: string, p?: unknown[]) => Promise<any[]>;
type Db = Pick<PGlite, "query" | "transaction">;

const ROOT = path.resolve(__dirname, "../../..");
const arg = (v: unknown) => (v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);

export const sqlFor = (db: Db): Sql => async (q, p = []) => (await db.query<any>(q, p)).rows;
export const rpcFor = (db: Db): Rpc =>
  ((uid: string | null, fn: string, args: Record<string, unknown> = {}) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
      const keys = Object.keys(args);
      const r = await tx.query<{ result: any }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => arg(args[k])));
      return r.rows[0].result;
    })) as Rpc;
export const asUserFor = (db: Db): AsUser => (uid, q, p = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(q, p)).rows;
  });

export async function criarUsuarios(sql: Sql) {
  for (const [id, email] of [[ADMIN, "adm83@t.dev"], [EDITOR, "ed83@t.dev"], [REVISOR, "rev83@t.dev"], [ALUNO, "al83@t.dev"], [ALUNO2, "al83b@t.dev"]])
    await sql(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [id, email]);
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}

export async function abrirBanco() {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  const sql = sqlFor(db);
  await criarUsuarios(sql);
  return { db, sql, rpc: rpcFor(db), asUser: asUserFor(db) };
}
