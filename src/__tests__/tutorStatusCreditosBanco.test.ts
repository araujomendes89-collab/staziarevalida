// @vitest-environment node
/**
 * Defeito no ar (18/10/2026): aluno novo em teste grátis, com a CARTEIRA ligada, conversa com o Tutor e gasta créditos quebrados
 * (1,7 + 0,8 = 2,5). Daí em diante app_tutor_status quebrava com 22P02 ("invalid input syntax for type integer: "2.5"") porque
 * fazia (e #>> '{text,used}')::int, e TODA tela atrás do portão do Tutor (Análise Inteligente, Tutor) mostrava
 * "Algum valor está em formato inválido". A administração não via: equipe segue a regra antiga (mensagens inteiras).
 * Migração 20261003013900_tutor_status_creditos.sql: daily_limit e used_today saem como número (aceitam fração).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOME = "20261003013900_tutor_status_creditos.sql";
const MIGRACAO = fs.readFileSync(path.join(MIGRATIONS, NOME), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013900_tutor_status_creditos.desfazer.sql"), "utf8");
const CONFERIR = fs.readFileSync(path.join(ROOT, "supabase/conferir/tutor-status-creditos.sql"), "utf8");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const ALUNO = id(2); // conta nova, em teste grátis, sem questões respondidas

let db: PGlite;

async function como<T = any>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const one = async (sql: string, params: unknown[] = []) => (await db.query<{ r: any }>(sql, params)).rows[0].r;
const status = async (uid: string) => (await como<{ r: any }>(uid, `select public.app_tutor_status() r`))[0].r;
const conferir = async () => (await db.query<{ resultado: string }>(CONFERIR)).rows[0].resultado;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < NOME).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'adm@teste.dev', '{}'), ($2, 'aluno1@teste.dev', '{}')`, [ADMIN, ALUNO]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() + interval '7 days' where user_id = $1`, [ALUNO]);
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true, voice_enabled = true`);
  await db.query(`update public.direitos_config set cadeados_ligados = true`); // como em produção: a carteira manda
  // o aluno conversa com o Tutor: duas mensagens com custo real que vira crédito quebrado
  for (const [rid, usd] of [["msg-0001", 0.0119], ["msg-0002", 0.0056]] as const) {
    expect((await one(`select public.ch_worker_carteira_reservar($1, 'tutor_texto', $2, null, null) r`, [ALUNO, rid])).ok).toBe(true);
    await one(`select public.ch_worker_carteira_confirmar($1, $2, $3) r`, [ALUNO, rid, usd]);
  }
}, 600_000);

describe("app_tutor_status com créditos quebrados (aluno novo em teste, carteira ligada)", () => {
  it("o uso do dia sai com casa decimal (\"1.0\", \"2.5\"): é o que o banco de produção devolve para a conta do dono", async () => {
    const e = await one(`select public.tutor_entitlement($1) r`, [ALUNO]);
    expect(e.regra).toBe("carteira");
    expect(await one(`select public.tutor_entitlement($1) #>> '{text,used}' r`, [ALUNO])).toMatch(/^\d+\.\d+$/);
  });

  it("ANTES do conserto: 22P02 (a mensagem 'Algum valor está em formato inválido' da tela)", async () => {
    await expect(status(ALUNO)).rejects.toMatchObject({ code: "22P02" });
    expect(await conferir()).toMatch(/^FALTA/);
  });

  it("DEPOIS do conserto: abre, com used_today e daily_limit iguais aos da carteira; a equipe continua igual", async () => {
    const adminAntes = await status(ADMIN);
    await db.exec(MIGRACAO);
    const e = await one(`select public.tutor_entitlement($1) r`, [ALUNO]);
    const s = await status(ALUNO);
    expect(s.available).toBe(true);
    expect(s.used_today).toBe(e.text.used);
    expect(s.daily_limit).toBe(e.text.limit);
    expect(await status(ADMIN)).toEqual(adminAntes);
    expect(await conferir()).toMatch(/^OK/);
  });

  it("aluno sem uso nenhum: 0 de 5, números inteiros como antes", async () => {
    await db.query(`delete from public.carteira_movimentos where user_id = $1`, [ALUNO]);
    const s = await status(ALUNO);
    expect(s.used_today).toBe(0);
    expect(s.daily_limit).toBe(5);
  });

  it("colar de novo não muda nada; desfazer volta à versão anterior; colar outra vez conserta", async () => {
    const def = await one(`select pg_get_functiondef('public.app_tutor_status()'::regprocedure) r`);
    await db.exec(MIGRACAO);
    expect(await one(`select pg_get_functiondef('public.app_tutor_status()'::regprocedure) r`)).toBe(def);
    await db.exec(DESFAZER);
    expect(await one(`select pg_get_functiondef('public.app_tutor_status()'::regprocedure) r`)).toMatch(/\{text,used\}'\)::int\b/);
    await db.exec(DESFAZER); // pode rodar de novo
    await db.exec(MIGRACAO);
    expect(await one(`select pg_get_functiondef('public.app_tutor_status()'::regprocedure) r`)).toBe(def);
    expect(await one(`select has_function_privilege('anon', 'public.app_tutor_status()', 'execute') r`)).toBe(false);
    expect(await one(`select has_function_privilege('authenticated', 'public.app_tutor_status()', 'execute') r`)).toBe(true);
  });
});
