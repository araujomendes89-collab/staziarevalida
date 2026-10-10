// @vitest-environment node
/**
 * Correções da Administração no banco (supabase/migrations/…7900_correcoes_acesso.sql):
 * US01 — plano pago (Pro/Elite) só dá acesso com "Plano pago até" no futuro; com pagamento pendente, até 3 dias depois do fim.
 *        Vale para o conteúdo Pro (has_pro) e para o Tutor (tutor_is_pro e tutor_entitlement). A administração não salva plano
 *        pago ativo ou pendente sem a data de fim.
 * CF01 — o banco recusa salvar "Tutor ligado" com "Planos pagos + teste grátis" desligado, com mensagem clara; a migração
 *        corrige o banco que já estiver assim.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MIGRATION = path.join(MIGRATIONS, "20261003007900_correcoes_acesso.sql");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
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
      keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      })
    );
    return r.rows[0].result;
  });
}

/** Plano do aluno direto no banco; `end` é uma expressão SQL (ou null = sem data de fim). */
const plano = (uid: string, plan: string, status: string, end: string | null) =>
  db.query(`update public.subscriptions set plan = $2, status = $3, current_period_end = ${end ?? "null"} where user_id = $1`, [uid, plan, status]);

/** O que o aluno tem: conteúdo Pro, "é assinante" do Tutor e o modo do Tutor. */
async function acesso(uid: string) {
  const hasPro = (await rpc(uid, "app_bootstrap")).has_pro;
  const tutorPro = (await db.query<{ p: boolean }>(`select public.tutor_is_pro($1) p`, [uid])).rows[0].p;
  const ent = (await rpc(uid, "app_tutor_status")).entitlement;
  return { hasPro, tutorPro, isPaid: ent.is_paid, mode: ent.mode };
}
const PAGO = { hasPro: true, tutorPro: true, isPaid: true, mode: "paid" };
const SEM_PAGO = { hasPro: false, tutorPro: false, isPaid: false, mode: "trial" };

/** Quem usa o app (visitante e logado) pode chamar a função? */
const podeChamar = async (fn: string) =>
  (
    await db.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') authenticated`,
      [fn]
    )
  ).rows[0];

const salvarTutor = (config: Record<string, unknown>) =>
  rpc(ADMIN, "app_admin_tutor_save_config", { p_config: config, p_reason: "Ajuste do Tutor nos testes das correções." });
const tutorConfig = async () =>
  (await db.query<{ enabled: boolean; requires_pro: boolean }>(`select enabled, requires_pro from public.tutor_config`)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [ANA, "ana@teste.dev", "Ana Lima"],
    [BRUNO, "bruno@teste.dev", "Bruno Costa"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  // Tutor no ar cobrando plano: quem não assina cai no teste grátis do Tutor
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true`);
}, 120_000);

describe("US01 — 'Plano pago até' corta o acesso", () => {
  it("Pro ativo com a data de fim no futuro: conteúdo Pro e Tutor como assinante", async () => {
    await plano(ANA, "pro", "active", "now() + interval '10 days'");
    expect(await acesso(ANA)).toEqual(PAGO);
  });

  it("Pro ativo depois da data de fim: perde o conteúdo Pro e o Tutor de assinante", async () => {
    await plano(ANA, "pro", "active", "now() - interval '1 minute'");
    expect(await acesso(ANA)).toEqual(SEM_PAGO);
  });

  it("Pro ativo sem data de fim não vale como pago", async () => {
    await plano(ANA, "pro", "active", null);
    expect(await acesso(ANA)).toEqual(SEM_PAGO);
  });

  it("pagamento pendente vale só até 3 dias depois do fim", async () => {
    await plano(ANA, "elite", "past_due", "now() - interval '2 days'");
    expect(await acesso(ANA)).toEqual(PAGO);
    await plano(ANA, "elite", "past_due", "now() - interval '3 days 1 minute'");
    expect(await acesso(ANA)).toEqual(SEM_PAGO);
    await plano(ANA, "elite", "past_due", null);
    expect(await acesso(ANA)).toEqual(SEM_PAGO);
  });

  it("cancelado ou expirado continua sem acesso, mesmo com a data no futuro", async () => {
    await plano(ANA, "pro", "canceled", "now() + interval '10 days'");
    expect(await acesso(ANA)).toEqual(SEM_PAGO);
    await plano(ANA, "pro", "expired", "now() + interval '10 days'");
    expect(await acesso(ANA)).toEqual(SEM_PAGO);
  });

  it("equipe segue com acesso completo, sem depender do plano", async () => {
    expect(await acesso(ADMIN)).toEqual(PAGO);
  });

  it("administração: plano pago ativo ou pendente exige a data de fim; com ela, o acesso vem na hora", async () => {
    for (const status of ["active", "past_due"]) {
      await expect(rpc(ADMIN, "app_admin_set_subscription", { p_user_id: BRUNO, p_plan: "pro", p_status: status })).rejects.toThrow(
        "Informe até quando vai o plano pago (campo “Plano pago até”). Sem essa data, o aluno fica sem o acesso pago."
      );
    }
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect(await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: BRUNO, p_plan: "pro", p_status: "active", p_current_period_end: until })).toMatchObject({
      plan: "pro",
      status: "active",
    });
    expect(await acesso(BRUNO)).toEqual(PAGO);
    // encerrar o plano continua sem pedir data
    expect(await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: BRUNO, p_plan: "pro", p_status: "canceled" })).toMatchObject({ status: "canceled" });
    expect(await acesso(BRUNO)).toEqual(SEM_PAGO);
  });

  it("a regra do plano pago não fica exposta a quem usa o app", async () => {
    expect(await podeChamar("public.subscription_is_paid(public.plan_code, public.subscription_status, timestamptz)")).toEqual({ anon: false, authenticated: false });
  });
});

describe("CF01 — Tutor ligado só com 'Planos pagos + teste grátis'", () => {
  const MENSAGEM = "Para ligar o Tutor, ligue também “Planos pagos + teste grátis”. Sem isso, todo aluno usaria o Tutor de graça, com os limites do plano pago.";

  it("o banco recusa ligar o Tutor com os planos pagos desligados, e nada muda", async () => {
    await db.exec(`update public.tutor_config set enabled = false, requires_pro = false`);
    await expect(salvarTutor({ enabled: true, requires_pro: false })).rejects.toThrow(MENSAGEM);
    expect(await tutorConfig()).toEqual({ enabled: false, requires_pro: false });
  });

  it("com o Tutor ligado, desligar só os planos pagos também é recusado", async () => {
    await salvarTutor({ enabled: true, requires_pro: true });
    expect(await tutorConfig()).toEqual({ enabled: true, requires_pro: true });
    await expect(salvarTutor({ requires_pro: false })).rejects.toThrow(MENSAGEM);
    expect(await tutorConfig()).toEqual({ enabled: true, requires_pro: true });
  });

  it("Tutor desligado pode ficar com os planos pagos desligados", async () => {
    await salvarTutor({ enabled: false, requires_pro: false });
    expect(await tutorConfig()).toEqual({ enabled: false, requires_pro: false });
  });

  it("'Planos pagos + teste grátis' nasce ligado", async () => {
    const r = await db.query<{ d: string }>(
      `select column_default d from information_schema.columns where table_schema = 'public' and table_name = 'tutor_config' and column_name = 'requires_pro'`
    );
    expect(r.rows[0].d).toBe("true");
  });

  it("a migração corrige o banco que já estava com o Tutor ligado sem os planos pagos, e deixa registrado", async () => {
    // ajuste direto no banco, sem ninguém logado (como no editor SQL do Supabase)
    await db.exec(`update public.tutor_config set enabled = true, requires_pro = false`);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    expect(await tutorConfig()).toEqual({ enabled: true, requires_pro: true });
    const log = await db.query<{ action: string; details: any }>(`select action, details from public.admin_audit_log order by id desc limit 1`);
    expect(log.rows[0]).toMatchObject({ action: "tutor.config", details: { from: { requires_pro: false }, to: { requires_pro: true } } });
    // rodar de novo não muda nada nem registra de novo
    const before = (await db.query<{ n: number }>(`select count(*)::int n from public.admin_audit_log`)).rows[0].n;
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.admin_audit_log`)).rows[0].n).toBe(before);
  });

  it("a trava não fica exposta a quem usa o app", async () => {
    expect(await podeChamar("public.tutor_config_guard()")).toEqual({ anon: false, authenticated: false });
  });
});
