// @vitest-environment node
/**
 * A migração …9560 (Usuários) e a …7710 (Questões) redefinem a mesma função admin_user_row. Em qualquer ordem de colagem
 * a ficha do aluno na Administração NÃO conta questão anulada e MOSTRA reviewer_areas; e a 9560 pode ser colada duas vezes.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const ALUNA = "00000000-0000-4000-8000-0000000000a1";
const sql = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
const F7710 = "20261003007710_correcoes_questoes_ajustes.sql";
const F9560 = "20261003009560_adm_usuarios.sql";
const todas = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

async function montar(ordem: string[]) {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  const meio = todas.filter((f) => f < F7710);
  const resto = todas.filter((f) => f > F7710 && f !== F9560);
  for (const f of meio) await db.exec(sql(f));
  for (const f of ordem) await db.exec(sql(f));
  for (const f of resto) await db.exec(sql(f));
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'master@teste.dev', '{"name":"Master"}'), ($2, 'aluna@teste.dev', '{"name":"Aluna"}')`, [ADMIN, ALUNA]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [ALUNA]);
  await db.exec(`set session_replication_role = replica`);
  await db.exec(`
    insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, status)
    select q, 'COD-' || q, 'exam-x', n, 'PEDIATRIA', 'Tema', 'Enunciado de teste', '[{},{},{},{}]'::jsonb, 'A', st
    from (values ('q-ok', 1, 'valid'), ('q-anulada', 2, 'annulled')) v(q, n, st);
    insert into public.question_attempts (user_id, question_id, is_correct, selected_option, answered_at)
    select '${ALUNA}', q, true, 'A', now() from unnest(array['q-ok', 'q-anulada', 'q-anulada']) q;`);
  await db.exec(`set session_replication_role = origin`);
  return db;
}

async function ficha(db: PGlite) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN })]);
    return (await tx.query<{ r: any }>(`select public.app_admin_user($1) as r`, [ALUNA])).rows[0].r;
  });
}

describe("ordem de colagem das migrações 7710 e 9560", () => {
  it.each([
    ["7710 depois 9560", [F7710, F9560]],
    ["9560 depois 7710", [F9560, F7710]],
    ["9560 colada duas vezes", [F7710, F9560, F9560]],
  ])("%s: ficha sem a anulada e com reviewer_areas", async (_nome, ordem) => {
    const db = await montar(ordem);
    const r = await ficha(db);
    expect(r.answered).toBe(1);
    expect(r.correct).toBe(1);
    expect(r.reviewer_areas).toEqual(["PEDIATRIA"]);
  }, 90_000);
});
