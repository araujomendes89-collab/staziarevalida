// @vitest-environment node
/**
 * Auditoria de segurança (17/10/2026), migração 013780: duas travas em vez de uma.
 * Mesmo que o RLS de uma tabela seja desligado por engano, visitante e aluno não têm permissão
 * de gravar papel, saldo, gabarito ou configurações; ninguém de fora tem TRUNCATE (que ignora o RLS).
 * E o app continua funcionando: o aluno começa sessão, responde e a correção sai normalmente.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { buildSeedStatements } from "../../scripts/supabase/seed-builder";

const ROOT = path.resolve(__dirname, "../..");
const ANA = "00000000-0000-4000-8000-00000000000a";
let db: PGlite;

type Q = (sql: string, p?: unknown[]) => Promise<any[]>;
async function as<T>(uid: string | null, fn: (q: Q) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return fn(async (sql, p = []) => (await tx.query<any>(sql, p)).rows);
  });
}
const priv = async (role: string, table: string, p: string) =>
  (await db.query<any>(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${table}`, p])).rows[0].ok as boolean;

const SENSIVEIS = ["user_roles", "user_gamification_stats", "coin_transactions", "questions", "question_official_answers", "app_settings", "ai_settings", "admin_audit_log"];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  }
  for (const statement of buildSeedStatements()) await db.exec(statement);
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev')`, [ANA]);
}, 240_000);

describe("Segurança 013780 — permissões do banco", () => {
  it("ninguém de fora tem TRUNCATE, TRIGGER ou REFERENCES em tabela do public", async () => {
    const r = await db.query<any>(`
      select c.relname, r.role, p.priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege(r.role, c.oid, p.priv)`);
    expect(r.rows).toEqual([]);
  });

  it("visitante não tem permissão de gravar em nenhuma tabela sem regra de gravação", async () => {
    const r = await db.query<any>(`
      select c.relname, p.priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, p.priv)
        and not exists (select 1 from pg_policies x where x.schemaname = 'public' and x.tablename = c.relname
                          and x.cmd in (p.priv, 'ALL') and x.roles && array['anon', 'public']::name[])`);
    expect(r.rows).toEqual([]);
  });

  it("aluno não tem permissão de gravar papel, saldo, gabarito, configurações nem auditoria", async () => {
    for (const t of SENSIVEIS) {
      for (const p of ["INSERT", "UPDATE", "DELETE"]) expect(await priv("authenticated", t, p), `${t} ${p}`).toBe(false);
    }
  });

  it("mesmo com o RLS desligado, o aluno não vira administrador nem mexe no próprio saldo", async () => {
    await db.exec(`alter table public.user_roles disable row level security; alter table public.user_gamification_stats disable row level security`);
    try {
      await expect(as(ANA, (q) => q(`update public.user_roles set role = 'admin' where user_id = $1`, [ANA]))).rejects.toThrow(/permission denied/);
      await expect(as(ANA, (q) => q(`update public.user_gamification_stats set coins = 999999 where user_id = $1`, [ANA]))).rejects.toThrow(/permission denied/);
      await expect(as(ANA, (q) => q(`insert into public.user_gamification_stats (user_id, coins) values ($1, 999999)`, [ANA]))).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec(`alter table public.user_roles enable row level security; alter table public.user_gamification_stats enable row level security`);
    }
    expect((await db.query<any>(`select role from public.user_roles where user_id = $1`, [ANA])).rows[0].role).toBe("student");
  });

  it("o aluno continua lendo o que é dele e estudando: começa sessão, responde e recebe a correção", async () => {
    expect(await as(ANA, (q) => q(`select role from public.user_roles where user_id = $1`, [ANA]))).toEqual([{ role: "student" }]);
    const started = (await as(ANA, (q) => q(`select public.app_start_session('questoes', '{}'::jsonb, 3) as r`)))[0].r;
    const session = (await as(ANA, (q) => q(`select public.app_get_session($1) as r`, [started.session_id])))[0].r;
    const first = session.questions[0].id;
    const answered = (await as(ANA, (q) => q(`select public.app_answer_question($1, $2, 'A') as r`, [started.session_id, first])))[0].r;
    const truth = (await db.query<any>(`select correct_option from public.questions where id = $1`, [first])).rows[0].correct_option;
    expect(answered).toMatchObject({ selected: "A", correct_option: truth, is_correct: truth === "A" });
    expect((await db.query<any>(`select count(*)::int n from public.question_attempts where user_id = $1`, [ANA])).rows[0].n).toBe(1);
  });

  it("tabelas novas do mesmo dono já nascem sem TRUNCATE para visitante e aluno", async () => {
    await db.exec(`create table public.zz_teste_permissoes (id int)`);
    try {
      expect(await priv("authenticated", "zz_teste_permissoes", "TRUNCATE")).toBe(false);
      expect(await priv("anon", "zz_teste_permissoes", "TRUNCATE")).toBe(false);
    } finally {
      await db.exec(`drop table public.zz_teste_permissoes`);
    }
  });
});
