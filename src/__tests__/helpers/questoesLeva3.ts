/**
 * Apoio dos testes de banco da leva 3 da aba Questões (Q07 figura, Q09 comentário em revisão, Q12 histórico): sobe um Postgres real
 * em memória (PGlite) com todas as migrações e dá as pessoas de sempre (administrador, editor, revisora de Pediatria, revisor de
 * outra área, duas alunas), além de chamadas "como essa pessoa" (rpc) e SQL direto.
 */
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

export const ROOT = path.resolve(__dirname, "../../..");
export const MIGRATIONS = path.join(ROOT, "supabase/migrations");
export const ADMIN = "00000000-0000-4000-8000-0000000000ad";
export const EDITOR = "00000000-0000-4000-8000-0000000000ed";
export const REV_PED = "00000000-0000-4000-8000-0000000000e1"; // revisora médica de Pediatria (sem papel de equipe)
export const REV_CIR = "00000000-0000-4000-8000-0000000000e2"; // revisor médico de Cirurgia (sem papel de equipe)
export const ANA = "00000000-0000-4000-8000-00000000000a";
export const BIA = "00000000-0000-4000-8000-00000000000b";

export type Db = {
  db: PGlite;
  /** Chama uma função public.* como essa pessoa (null = visitante, sem login). */
  rpc: <T = any>(uid: string | null, fn: string, args?: Record<string, unknown>) => Promise<T>;
  /** SQL direto como dono do banco (montagem e conferência). */
  sql: <T = any>(text: string, params?: unknown[]) => Promise<T[]>;
  /** SQL como essa pessoa (papel authenticated, ou anon para null). */
  asUser: <T = any>(uid: string | null, text: string, params?: unknown[]) => Promise<T[]>;
};

export async function startDb(extra: { migrationsUpTo?: string } = {}): Promise<Db> {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    if (extra.migrationsUpTo && file > extra.migrationsUpTo) break;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [REV_PED, "revisora@teste.dev", "Dra. Revisora"],
    [REV_CIR, "cirurgiao@teste.dev", "Dr. Cirurgião"],
    [ANA, "ana@teste.dev", "Ana"],
    [BIA, "bia@teste.dev", "Bia"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA'), ($2, 'CIRURGIA')`, [REV_PED, REV_CIR]);

  const asUser = async <T = any>(uid: string | null, text: string, params: unknown[] = []) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
      return (await tx.query<T>(text, params)).rows;
    });
  const rpc = async <T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const keys = Object.keys(args);
    const rows = await asUser<{ result: T }>(uid, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return rows[0].result;
  };
  const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
  return { db, rpc, sql, asUser };
}

export const options = (map: Record<string, string> = {}) => ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: map[id] ?? "" }));
/** Uma questão de Pediatria (Revalida 2024/1) pronta para salvar. */
export const question = (number: number, extra: Record<string, unknown> = {}) => ({
  kind: "REVALIDA", year: 2024, semester: 1, number, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo",
  statement: `Lactente de 4 meses com sibilância e coriza há 2 dias (questão ${number}). Qual a conduta?`,
  options: options(), correct_option: "B", status: "valid", expected_conduct: "", inep_intent: "", needs_image: false, ...extra,
});
export const idOf = (number: number) => `revalida_2024_1_q${String(number).padStart(3, "0")}`;
