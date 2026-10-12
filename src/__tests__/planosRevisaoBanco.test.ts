// @vitest-environment node
/**
 * Rodada de correções da revisão independente da leva 3 (Planos): casos que a revisão apontou, reproduzidos no banco.
 *  1. Tutor com a chave "requires_pro" desligada de propósito: aberto a todos; o aviso não pode contradizer (app_my_access / simulado_gate).
 *  2. A consulta de conferência do cabeçalho da 9730 precisa listar também quem NÃO tem linha de assinatura.
 *  3. app_start_session continua com a mesma segurança da base (executa como a pessoa logada).
 *  4. Recolar a 9730 depois da 9731 não pode tirar os minutos de voz do Elite.
 *  6. As telas descobrem se a regra nova existe no banco (app_my_access, app_admin_signup_trial_rule).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const M9730 = path.join(MIGRATIONS, "20261003009730_teste_vencido_trava_pago.sql");
const M9731 = path.join(MIGRATIONS, "20261003009731_elite_beneficios.sql");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const REVISOR = id(3);
const VALIDO = id(4);
const VENCIDO = id(5);
const PRO = id(6);
const ELITE = id(7);
const PRO_VENCIDO = id(8);
const TUTOR_COMECADO = id(9);
const SEM_ASSINATURA = id(10); // conta sem nenhuma linha em subscriptions
const SEM_TESTE = id(11); // cadastro sem teste (PL06): trial/expired sem data
const CANCELADO = id(12); // Pro cancelado
const TODOS = { ADMIN, EDITOR, REVISOR, VALIDO, VENCIDO, PRO, ELITE, PRO_VENCIDO, TUTOR_COMECADO, SEM_ASSINATURA, SEM_TESTE, CANCELADO };

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
const sub = (uid: string, plan: string, status: string, trialEnd: string | null, periodEnd: string | null = null) =>
  db.query(`update public.subscriptions set plan = $2, status = $3, trial_ends_at = ${trialEnd ?? "null"}, current_period_end = ${periodEnd ?? "null"} where user_id = $1`, [uid, plan, status]);
const podeChamar = async (fn: string) =>
  (await db.query<{ anon: boolean; authenticated: boolean }>(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') authenticated`, [fn])).rows[0];
const tutor = async (uid: string) => (await rpc(uid, "app_tutor_status")).entitlement;
const acesso = (uid: string | null) => rpc(uid, "app_my_access");
const consultaDoCabecalho = () => {
  const cabecalho = fs.readFileSync(M9730, "utf8");
  return /select u\.email as "E-mail"[\s\S]*?order by u\.email;/.exec(cabecalho)![0].replace(/^--\s?/gm, "");
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [name, uid] of Object.entries(TODOS)) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${name.toLowerCase()}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'clinica_medica')`, [REVISOR]);
  await sub(REVISOR, "trial", "trialing", "now() - interval '2 days'");
  await sub(VALIDO, "trial", "trialing", "now() + interval '3 days'");
  await sub(VENCIDO, "trial", "trialing", "now() - interval '1 minute'");
  await sub(PRO, "pro", "active", null, "now() + interval '20 days'");
  await sub(ELITE, "elite", "active", null, "now() + interval '20 days'");
  await sub(PRO_VENCIDO, "pro", "active", null, "now() - interval '1 day'");
  await sub(TUTOR_COMECADO, "trial", "trialing", "now() - interval '1 day'");
  await db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '1 day' where user_id = $1`, [TUTOR_COMECADO]);
  await sub(SEM_TESTE, "trial", "expired", null);
  await sub(CANCELADO, "pro", "canceled", null, "now() + interval '20 days'");
  await db.query(`delete from public.subscriptions where user_id = $1`, [SEM_ASSINATURA]);
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true, voice_enabled = true`);
}, 120_000);

describe("Achado 1 — Tutor com a chave requires_pro: o aviso não contradiz o que o Tutor faz de verdade", () => {
  const SEM_ACESSO = [VENCIDO, PRO_VENCIDO, SEM_ASSINATURA, SEM_TESTE, CANCELADO];

  it("chave LIGADA (Tutor só para plano pago/teste): quem não tem acesso pago fica sem Tutor e o aviso fala do Tutor", async () => {
    for (const uid of SEM_ACESSO) {
      expect(await tutor(uid), uid).toMatchObject({ mode: "blocked", can_use: false, plan_locked: true });
      expect(await acesso(uid), uid).toMatchObject({ locked: true, tutor_closed: true });
      expect(await rpc(uid, "simulado_gate"), uid).toMatch(/Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos/);
    }
  });

  it("chave DESLIGADA de propósito (Tutor aberto a todos): o Tutor abre para todos, e o aviso NÃO diz que o Tutor é pago", async () => {
    await db.exec(`update public.tutor_config set requires_pro = false`);
    try {
      for (const uid of SEM_ACESSO) {
        expect(await tutor(uid), uid).toMatchObject({ mode: "paid", can_use: true, plan_locked: false, is_paid: false });
        expect(await acesso(uid), uid).toMatchObject({ locked: true, tutor_closed: false });
        const aviso = await rpc(uid, "simulado_gate");
        expect(aviso, uid).toMatch(/Os simulados completos e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos\./);
        expect(aviso, uid).not.toMatch(/o Tutor e as estações Pro/);
      }
      // os simulados seguem fechados mesmo com o Tutor aberto
      await expect(rpc(VENCIDO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 3, p_time_limit_seconds: 600 })).rejects.toThrow(/planos pagos/);
    } finally {
      await db.exec(`update public.tutor_config set requires_pro = true`);
    }
  });

  it("teste do Tutor já começado e ainda valendo: o Tutor segue aberto e o aviso não diz que ele está fechado", async () => {
    expect(await tutor(TUTOR_COMECADO)).toMatchObject({ mode: "trial", can_use: true });
    expect(await acesso(TUTOR_COMECADO)).toMatchObject({ locked: true, tutor_closed: false });
    expect(await rpc(TUTOR_COMECADO, "simulado_gate")).not.toMatch(/o Tutor e as estações Pro/);
  });

  it("alcance real do caso: pelo painel o dono NÃO consegue deixar o Tutor ligado e aberto a todos (trava CF01 da 9550); só ajuste direto no SQL", async () => {
    const salvar = (config: Record<string, unknown>) => rpc(ADMIN, "app_admin_tutor_save_config", { p_config: config, p_reason: "Teste da revisão (Planos)." });
    const MENSAGEM = "Para ligar o Tutor, ligue também “Planos pagos + teste grátis”.";
    // com o Tutor ligado, desligar os planos pagos é recusado pelo painel
    await expect(salvar({ enabled: true, requires_pro: false })).rejects.toThrow(MENSAGEM);
    // com os planos pagos desligados e o Tutor DESLIGADO (único jeito de salvar pelo painel), ninguém usa o Tutor: o aviso não o chama de pago
    await db.exec(`update public.tutor_config set enabled = false, requires_pro = false`);
    try {
      for (const uid of [VENCIDO, SEM_ASSINATURA, SEM_TESTE]) {
        expect(await tutor(uid), uid).toMatchObject({ can_use: false, can_text: false, can_voice: false, block_reason: "disabled" });
        expect(await acesso(uid), uid).toMatchObject({ locked: true, tutor_closed: false });
      }
    } finally {
      await db.exec(`update public.tutor_config set enabled = true, requires_pro = true`);
    }
  });

  it("quem tem acesso (equipe, revisor, pago, teste valendo) não recebe aviso; título certo para cada caso", async () => {
    for (const uid of [ADMIN, EDITOR, REVISOR, VALIDO, PRO, ELITE]) expect(await acesso(uid), uid).toEqual({ locked: false, state: null, tutor_closed: false });
    expect(await acesso(VENCIDO)).toMatchObject({ state: "teste_acabou" });
    expect(await acesso(PRO_VENCIDO)).toMatchObject({ state: "plano_acabou" });
    expect(await acesso(CANCELADO)).toMatchObject({ state: "plano_acabou" });
    expect(await acesso(SEM_TESTE)).toMatchObject({ state: "sem_teste" });
    expect(await acesso(SEM_ASSINATURA)).toMatchObject({ state: "sem_teste" });
  });

  it("permissões: só quem está logado pergunta pelo próprio acesso; visitante e a regra interna ficam fechados", async () => {
    expect(await podeChamar("public.app_my_access()")).toEqual({ anon: false, authenticated: true });
    expect(await podeChamar("public.user_plan_lock(uuid)")).toEqual({ anon: false, authenticated: false });
    await expect(acesso(null)).rejects.toThrow();
  });
});

describe("Achado 2 — consulta de conferência do cabeçalho da 9730", () => {
  it("lista também a conta SEM linha de assinatura e bate exatamente com a regra do banco para todo mundo", async () => {
    const lista = await db.query<Record<string, any>>(consultaDoCabecalho());
    const emails = lista.rows.map((r) => r["E-mail"]);
    expect(emails).toContain("sem_assinatura@teste.dev");
    const doBanco = (await db.query<{ email: string }>(`select u.email from auth.users u where public.user_without_paid_access(u.id) order by u.email`)).rows.map((r) => r.email);
    expect([...emails].sort()).toEqual(doBanco);
    expect(doBanco).toEqual(["cancelado@teste.dev", "pro_vencido@teste.dev", "sem_assinatura@teste.dev", "sem_teste@teste.dev", "tutor_comecado@teste.dev", "vencido@teste.dev"]);
  });

  it("diz o que acontece com o Tutor de cada um (perde, segue pelo teste do Tutor, ou aberto a todos)", async () => {
    const col = (rows: Record<string, any>[], email: string) => rows.find((r) => r["E-mail"] === email)!["Tutor"];
    let lista = await db.query<Record<string, any>>(consultaDoCabecalho());
    expect(lista.fields.map((f) => f.name)).toEqual(["E-mail", "Plano", "Situação", "Teste até", "Plano pago até", "Tutor"]);
    expect(col(lista.rows, "vencido@teste.dev")).toMatch(/^Perde/);
    expect(col(lista.rows, "sem_assinatura@teste.dev")).toMatch(/^Perde/);
    expect(col(lista.rows, "tutor_comecado@teste.dev")).toMatch(/^Segue/);
    await db.exec(`update public.tutor_config set requires_pro = false`);
    try {
      lista = await db.query<Record<string, any>>(consultaDoCabecalho());
      for (const r of lista.rows) expect(r["Tutor"], r["E-mail"]).toMatch(/^Aberto a todos/);
    } finally {
      await db.exec(`update public.tutor_config set requires_pro = true`);
    }
  });
});

describe("Achado 3 — app_start_session mantém a segurança da base", () => {
  it("continua executando como a pessoa logada (como em …0700 e …1700), sem search_path aberto", async () => {
    const f = (await db.query<{ prosecdef: boolean; cfg: string[] }>(`select prosecdef, proconfig cfg from pg_proc where oid = 'public.app_start_session(text,jsonb,integer,integer)'::regprocedure`)).rows[0];
    expect(f.prosecdef).toBe(false);
    expect(f.cfg).toContain('search_path=""');
    // a sessão aberta é da própria pessoa e a outra não enxerga
    const aberta = await rpc(VALIDO, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 3 }).catch(() => null);
    if (aberta) {
      const outras = (await db.transaction(async (tx) => {
        await tx.exec(`set local role authenticated`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: PRO })]);
        return (await tx.query<{ n: number }>(`select count(*)::int n from public.practice_sessions where id = $1`, [aberta.session_id])).rows[0].n;
      })) as number;
      expect(outras).toBe(0);
    }
  });
});

describe("Achado 4 — recolar a 9730 depois da 9731 não tira a voz do Elite", () => {
  it("com o Elite em 60 min e o Pro em 20, recolar só a 9730 mantém 60 min para o Elite (e 20 para o Pro)", async () => {
    await db.exec(`update public.tutor_config set paid_voice_daily_seconds = 1200`);
    await rpc(ADMIN, "app_admin_save_plan_benefits", { p_benefits: { elite_voice_daily_minutes: "60", elite_station_feedback: true } });
    const voz = async (uid: string) => (await tutor(uid)).voice.limit_today_s;
    expect(await voz(ELITE)).toBe(3600);
    expect(await voz(PRO)).toBe(1200);
    const sql9730 = fs.readFileSync(M9730, "utf8");
    await db.exec(sql9730);
    expect(await voz(ELITE)).toBe(3600);
    expect(await voz(PRO)).toBe(1200);
    // e a 9731 recolada depois também
    await db.exec(fs.readFileSync(M9731, "utf8"));
    await db.exec(sql9730);
    expect(await voz(ELITE)).toBe(3600);
    expect((await rpc(ADMIN, "app_admin_plan_benefits")).elite_voice_daily_minutes).toBe(60);
  });
});

describe("Achado 6 — as telas descobrem se a regra nova está no banco", () => {
  it("app_admin_signup_trial_rule: só o administrador pergunta; diz que a chave do cadastro vale de verdade", async () => {
    expect(await rpc(ADMIN, "app_admin_signup_trial_rule")).toEqual({ applies: true });
    await expect(rpc(PRO, "app_admin_signup_trial_rule")).rejects.toThrow(/Acesso restrito/);
    expect(await podeChamar("public.app_admin_signup_trial_rule()")).toEqual({ anon: false, authenticated: true });
  });
});
