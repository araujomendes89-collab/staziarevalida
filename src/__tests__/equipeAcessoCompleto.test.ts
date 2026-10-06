// @vitest-environment node
/**
 * Equipe com acesso completo e sem período de teste (supabase/migrations/…4600_equipe_acesso_completo.sql):
 * administrador e editor abrem o conteúdo Pro, usam o Tutor como assinantes e não veem o teste grátis.
 * Aluno continua igual, e quem sai da equipe volta à própria assinatura.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

async function rpc<T = any>(uid: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
}

const entitlement = async (uid: string) => (await rpc(uid, "app_tutor_status")).entitlement;
const tutorTrialStarted = async (uid: string) =>
  (await db.query<{ t: string | null }>(`select tutor_trial_started_at t from public.subscriptions where user_id = $1`, [uid])).rows[0].t;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [ANA, "ana@teste.dev", "Ana Lima"],
    [BRUNO, "bruno@teste.dev", "Bruno Costa"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  // Tutor cobrando plano: quem não assina cai no teste grátis do Tutor
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true`);
}, 60_000);

describe("Equipe: acesso completo, sem período de teste", () => {
  it("toda conta nasce com o teste grátis, inclusive a da equipe (é o registro de cobrança, que fica como está)", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.subscriptions where plan = 'trial' and status = 'trialing'`);
    expect(r.rows[0].n).toBe(4);
  });

  it("conteúdo Pro: administrador e editor abrem; aluno em teste não", async () => {
    expect((await rpc(ADMIN, "app_bootstrap")).has_pro).toBe(true);
    expect((await rpc(EDITOR, "app_bootstrap")).has_pro).toBe(true);
    expect((await rpc(ANA, "app_bootstrap")).has_pro).toBe(false);
  });

  it("Início: o aviso do teste grátis só aparece para aluno", async () => {
    expect((await rpc(ANA, "app_home")).trial).toMatchObject({ days_left: 7 });
    expect((await rpc(ADMIN, "app_home")).trial).toBeNull();
    expect((await rpc(EDITOR, "app_home")).trial).toBeNull();
  });

  it("Tutor: administrador e editor entram como assinantes; aluno, no teste", async () => {
    for (const uid of [ADMIN, EDITOR]) {
      expect(await entitlement(uid)).toMatchObject({ mode: "paid", is_paid: true, staff: true, trial: { state: "none" }, block_reason: null, can_use: true, questions: { limit: null } });
    }
    expect(await entitlement(ANA)).toMatchObject({ mode: "trial", is_paid: false, staff: false, trial: { state: "available" } });
    expect((await db.query<{ p: boolean }>(`select public.tutor_is_pro($1) p`, [EDITOR])).rows[0].p).toBe(true);
    expect((await db.query<{ p: boolean }>(`select public.tutor_is_pro($1) p`, [ANA])).rows[0].p).toBe(false);
  });

  it("Tutor: usar o Tutor nunca começa o teste para a equipe", async () => {
    await db.query(`select public.tutor_begin_trial($1)`, [EDITOR]);
    await db.query(`select public.tutor_begin_trial($1)`, [ADMIN]);
    expect(await tutorTrialStarted(EDITOR)).toBeNull();
    expect(await tutorTrialStarted(ADMIN)).toBeNull();
  });

  it("Administração: a contagem de planos é só de alunos; a equipe aparece por papel", async () => {
    const o = await rpc(ADMIN, "app_admin_overview");
    expect(o.users.by_plan).toEqual({ "trial:trialing": 2 });
    expect(o.users.by_role).toMatchObject({ admin: 1, editor: 1, student: 2 });
  });

  it("quem entra na equipe ganha acesso na hora (mesmo com o teste vencido); quem sai volta à própria assinatura", async () => {
    await db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '30 days', trial_ends_at = now() - interval '1 day' where user_id = $1`, [BRUNO]);
    expect(await entitlement(BRUNO)).toMatchObject({ mode: "blocked", block_reason: "trial_expired" });

    await rpc(ADMIN, "app_admin_set_role", { p_user_id: BRUNO, p_role: "editor" });
    expect(await entitlement(BRUNO)).toMatchObject({ mode: "paid", staff: true, can_use: true });
    expect((await rpc(BRUNO, "app_bootstrap")).has_pro).toBe(true);

    await rpc(ADMIN, "app_admin_set_role", { p_user_id: BRUNO, p_role: "student" });
    expect(await entitlement(BRUNO)).toMatchObject({ mode: "blocked", staff: false, block_reason: "trial_expired" });
    expect((await rpc(BRUNO, "app_bootstrap")).has_pro).toBe(false);
  });

  it("o que é só do administrador continua só do administrador", async () => {
    await expect(rpc(EDITOR, "app_admin_users")).rejects.toThrow();
    await expect(rpc(EDITOR, "app_admin_set_role", { p_user_id: ANA, p_role: "editor" })).rejects.toThrow();
    expect((await rpc(EDITOR, "app_admin_overview")).users.total).toBe(4);
  });

  it("a verificação por id não fica exposta a quem usa o app", async () => {
    await expect(rpc(ANA, "user_is_staff", { p_user: ADMIN })).rejects.toThrow(/permission|permissão/i);
  });
});
