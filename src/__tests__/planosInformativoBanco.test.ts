// @vitest-environment node
/**
 * PL01 (Fase 1 objetiva, 2026-10-12) no banco (supabase/migrations/…9890_planos_informativo_aluno.sql): a tela de planos do aluno é SÓ
 * INFORMATIVA. A função app_plans_info entrega nome, descrição e recursos de cada plano (como o administrador escreveu) e, quando
 * existem, os minutos de voz do Tutor; NUNCA entrega preço, periodicidade, "marcado para venda" nem nada de pagamento.
 * Pessoas testadas: visitante, aluno em teste, aluno Pro, aluno Elite, editor e administrador.
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
const TESTE = id(3);
const PRO = id(4);
const ELITE = id(5);
const TODOS = { ADMIN, EDITOR, TESTE, PRO, ELITE };

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
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
const podeChamar = async (fn: string) =>
  (await db.query<{ anon: boolean; authenticated: boolean }>(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') authenticated`, [fn])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [name, uid] of Object.entries(TODOS)) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${name.toLowerCase()}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() + interval '3 days' where user_id = $1`, [TESTE]);
  await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where user_id = $1`, [PRO]);
  await db.query(`update public.subscriptions set plan = 'elite', status = 'active', current_period_end = now() + interval '20 days' where user_id = $1`, [ELITE]);
}, 120_000);

describe("PL01 — o que o aluno vê dos planos", () => {
  it("só quem está logado chama; visitante e papel público não", async () => {
    await expect(rpc(null, "app_plans_info")).rejects.toThrow(/permission denied/);
    expect(await podeChamar("public.app_plans_info()")).toEqual({ anon: false, authenticated: true });
  });

  it("devolve os três planos com nome, descrição e recursos, e nada de preço", async () => {
    await rpc(ADMIN, "app_admin_save_plan", { p_plan: { code: "pro", name: "Pro", description: "Para quem estuda todo dia", price_cents: 12990, billing_period: "monthly", features: ["Simulados completos", "Tutor"], active: true } });
    await rpc(ADMIN, "app_admin_save_plan", { p_plan: { code: "elite", name: "Elite", description: null, price_cents: 18990, billing_period: "yearly", features: [], active: true } });
    for (const uid of [TESTE, PRO, ELITE, EDITOR, ADMIN]) {
      const info = await rpc(uid, "app_plans_info");
      expect(info.plans.map((p: any) => p.code), uid).toEqual(["trial", "pro", "elite"]);
      const pro = info.plans.find((p: any) => p.code === "pro");
      expect(pro).toEqual({ code: "pro", name: "Pro", description: "Para quem estuda todo dia", features: ["Simulados completos", "Tutor"], offered_at_signup: null });
      for (const p of info.plans) expect(Object.keys(p).sort(), uid).toEqual(["code", "description", "features", "name", "offered_at_signup"]);
      // nenhum preço, periodicidade ou "à venda" em lugar nenhum da resposta
      const text = JSON.stringify(info);
      expect(text).not.toMatch(/12990|18990|price|billing|monthly|yearly|"active"/);
    }
  });

  it("o Teste grátis diz se é oferecido no cadastro; Pro e Elite nunca dizem se estão à venda", async () => {
    const info = await rpc(PRO, "app_plans_info");
    expect(info.plans.find((p: any) => p.code === "trial").offered_at_signup).toBe(true);
    await rpc(ADMIN, "app_admin_save_plan", { p_plan: { code: "trial", name: "Teste grátis", description: "", price_cents: 0, billing_period: "monthly", features: [], active: false } });
    expect((await rpc(PRO, "app_plans_info")).plans.find((p: any) => p.code === "trial").offered_at_signup).toBe(false);
    for (const code of ["pro", "elite"]) expect((await rpc(PRO, "app_plans_info")).plans.find((p: any) => p.code === code).offered_at_signup).toBeNull();
  });

  it("recurso editado pelo administrador aparece para o aluno", async () => {
    await rpc(ADMIN, "app_admin_save_plan", { p_plan: { code: "pro", name: "Pro Médico", description: "Texto novo", price_cents: 12990, billing_period: "monthly", features: ["Um", "Dois"], active: false } });
    const pro = (await rpc(TESTE, "app_plans_info")).plans.find((p: any) => p.code === "pro");
    expect(pro).toMatchObject({ name: "Pro Médico", description: "Texto novo", features: ["Um", "Dois"] });
  });
});

describe("PL01 — voz do Tutor nos planos (só o que o painel já tem)", () => {
  it("com o Tutor desligado ou sem planos pagos, nenhum minuto aparece", async () => {
    await db.exec(`update public.tutor_config set enabled = false`);
    expect(await rpc(PRO, "app_plans_info")).toMatchObject({ tutor_paid: false, pro_voice_daily_minutes: null, elite_voice_daily_minutes: null, elite_station_feedback: false });
  });

  it("Tutor no ar com planos pagos: mostra os minutos do Pro; o Elite só depois que o dono preencher", async () => {
    await db.exec(`update public.tutor_config set requires_pro = true, enabled = true, voice_enabled = true, paid_voice_daily_seconds = 1200`);
    expect(await rpc(ELITE, "app_plans_info")).toMatchObject({ tutor_paid: true, pro_voice_daily_minutes: 20, elite_voice_daily_minutes: null, elite_station_feedback: false });
    await rpc(ADMIN, "app_admin_save_plan_benefits", { p_benefits: { elite_voice_daily_minutes: 45, elite_station_feedback: true } });
    expect(await rpc(TESTE, "app_plans_info")).toMatchObject({ tutor_paid: true, pro_voice_daily_minutes: 20, elite_voice_daily_minutes: 45, elite_station_feedback: true });
  });

  it("voz do Tutor desligada: nenhum minuto aparece", async () => {
    await db.exec(`update public.tutor_config set voice_enabled = false`);
    expect(await rpc(PRO, "app_plans_info")).toMatchObject({ tutor_paid: true, pro_voice_daily_minutes: null, elite_voice_daily_minutes: null });
  });
});
