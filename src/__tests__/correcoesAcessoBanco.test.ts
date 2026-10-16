// @vitest-environment node
/**
 * Correções da Administração no banco (supabase/migrations/…9550_correcoes_acesso.sql):
 * US01 — plano pago (Pro/Elite) só dá acesso com "Plano pago até" no futuro; com pagamento pendente, até 3 dias depois do fim.
 *        Vale para o conteúdo Pro (has_pro) e para o Tutor (tutor_is_pro e tutor_entitlement). A administração não salva plano
 *        pago ativo ou pendente sem a data de fim.
 * CF01 — o banco recusa salvar "Tutor ligado" com "Planos pagos + teste grátis" desligado, com mensagem clara; a migração
 *        não muda sozinha o banco que já estiver assim (o dono decide pelo painel).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MIGRATION = path.join(MIGRATIONS, "20261003009550_correcoes_acesso.sql");
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
// Sem plano pago válido e sem teste grátis valendo (plano pago vencido, cancelado ou expirado): desde a …9730 (PL02) o Tutor fica
// bloqueado para quem nunca começou o teste do Tutor (antes caía no teste do Tutor, mode "trial").
const SEM_PAGO = { hasPro: false, tutorPro: false, isPaid: false, mode: "blocked" };

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

  it("sem login, ninguém chama a função que muda o plano (revoke da correção 9550)", async () => {
    expect(await podeChamar("public.app_admin_set_subscription(uuid, text, text, timestamptz, timestamptz)")).toEqual({ anon: false, authenticated: true });
  });
});

describe("Revisão (ACREV) — tentando quebrar a regra do plano pago", () => {
  it("administração: plano pago ATIVO com data de fim que já passou é recusado (data errada deixaria o aluno sem acesso, marcado como Ativo)", async () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    await expect(rpc(ADMIN, "app_admin_set_subscription", { p_user_id: BRUNO, p_plan: "elite", p_status: "active", p_current_period_end: ontem })).rejects.toThrow(
      "A data de “Plano pago até” já passou. Escolha uma data futura."
    );
    // pagamento pendente com o fim dentro da tolerância de 3 dias continua permitido (é o caso real de cartão recusado)
    const antes = new Date(Date.now() - 86_400_000).toISOString();
    expect(await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: BRUNO, p_plan: "elite", p_status: "past_due", p_current_period_end: antes })).toMatchObject({ status: "past_due" });
    expect(await acesso(BRUNO)).toEqual(PAGO);
  });

  it("visitante sem login não consegue nem chamar a função que muda o plano, e as de acesso não ficam abertas a ninguém", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`set local role anon`);
        await tx.query(`select public.app_admin_set_subscription($1::uuid, 'pro', 'active', null, now() + interval '30 days')`, [BRUNO]);
      })
    ).rejects.toThrow(/permission denied/);
    expect(await podeChamar("public.tutor_is_pro(uuid)")).toEqual({ anon: false, authenticated: false });
    expect(await podeChamar("public.tutor_entitlement(uuid)")).toEqual({ anon: false, authenticated: false });
  });

  it("colar a migração de novo não reabre nenhuma função para o visitante", async () => {
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    expect(await podeChamar("public.app_admin_set_subscription(uuid, text, text, timestamptz, timestamptz)")).toEqual({ anon: false, authenticated: true });
    expect(await podeChamar("public.subscription_is_paid(public.plan_code, public.subscription_status, timestamptz)")).toEqual({ anon: false, authenticated: false });
    expect(await podeChamar("public.tutor_config_guard()")).toEqual({ anon: false, authenticated: false });
  });

  it("teste grátis vencido não vira acesso pago, e o Tutor conta o prazo pelo começo do teste do Tutor (tutor_trial_started_at), não por trial_ends_at", async () => {
    const teste = (iniciouHaDias: number | null) =>
      db.query(
        `update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() - interval '5 days', current_period_end = now() + interval '30 days',
                tutor_trial_started_at = ${iniciouHaDias === null ? "null" : `now() - interval '${iniciouHaDias} days'`} where user_id = $1`,
        [ANA]
      );
    // o teste do Tutor começou há 10 dias (o teste dura 7): vencido de verdade, o Tutor bloqueia
    await teste(10);
    expect(await acesso(ANA)).toEqual({ ...SEM_PAGO, mode: "blocked" });
    // começou há 1 dia: ainda dentro do prazo do Tutor, mesmo com trial_ends_at vencido (o Tutor não olha essa data)
    await teste(1);
    expect(await acesso(ANA)).toEqual({ ...SEM_PAGO, mode: "trial" });
    // ainda não usou o Tutor: o teste dele está disponível
    await teste(null);
    expect(await acesso(ANA)).toEqual({ ...SEM_PAGO, mode: "trial" });
  });

  it("revisor médico (qualquer área em ch_reviewer_areas) tem acesso completo como a equipe, sem plano nem data; aluno comum perde como antes", async () => {
    const REV = "00000000-0000-4000-8000-0000000000e1";
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'revisor@teste.dev', '{"name":"Revisora"}')`, [REV]);
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'clinica_medica')`, [REV]);
    // Pro vencido
    await plano(REV, "pro", "active", "now() - interval '1 day'");
    await plano(ANA, "pro", "active", "now() - interval '1 day'");
    expect(await acesso(REV)).toEqual(PAGO);
    // ANA já começou o teste do Tutor em testes anteriores: ele segue até o prazo próprio (mode "trial"), sem acesso pago
    expect(await acesso(ANA)).toEqual({ ...SEM_PAGO, mode: "trial" });
    // plano nenhum (cancelado, sem data)
    await plano(REV, "pro", "canceled", null);
    await plano(ANA, "pro", "canceled", null);
    expect(await acesso(REV)).toEqual(PAGO);
    expect(await acesso(ANA)).toEqual({ ...SEM_PAGO, mode: "trial" });
    // teste grátis vencido, inclusive o teste do Tutor
    const teste = (uid: string) =>
      db.query(
        `update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() - interval '5 days', current_period_end = null,
                tutor_trial_started_at = now() - interval '10 days' where user_id = $1`,
        [uid]
      );
    await teste(REV);
    await teste(ANA);
    expect(await acesso(REV)).toEqual(PAGO);
    expect(await acesso(ANA)).toEqual({ ...SEM_PAGO, mode: "blocked" });
    // a função de apoio não fica aberta a ninguém
    expect(await podeChamar("public.user_has_full_access(uuid)")).toEqual({ anon: false, authenticated: false });
    // quando deixa de ser revisor, volta a valer o plano
    await db.query(`delete from public.ch_reviewer_areas where user_id = $1`, [REV]);
    expect(await acesso(REV)).toEqual({ ...SEM_PAGO, mode: "blocked" });
  });

  it("administração: as regras de data do plano pago não se aplicam ao revisor médico", async () => {
    const REV2 = "00000000-0000-4000-8000-0000000000e2";
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'revisor2@teste.dev', '{}')`, [REV2]);
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'pediatria')`, [REV2]);
    expect(await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: REV2, p_plan: "pro", p_status: "active" })).toMatchObject({ plan: "pro", status: "active" });
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    expect(await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: REV2, p_plan: "elite", p_status: "active", p_current_period_end: ontem })).toMatchObject({ plan: "elite" });
    expect(await acesso(REV2)).toEqual(PAGO);
  });

  it("consulta de conferência do cabeçalho: lista exatamente quem perde o acesso pago (sem equipe, sem revisor médico, sem quem está na tolerância)", async () => {
    const header = fs.readFileSync(MIGRATION, "utf8").split("\n").filter((l) => l.startsWith("--"));
    const ini = header.findIndex((l) => l.includes('select u.email as "E-mail"'));
    const fim = header.findIndex((l, i) => i >= ini && l.trimEnd().endsWith(";"));
    expect(ini).toBeGreaterThan(-1);
    const consulta = header.slice(ini, fim + 1).map((l) => l.replace(/^--\s*/, "")).join("\n");

    const pessoas: Record<string, [string, string, string | null]> = {
      "carla@teste.dev": ["pro", "active", null], // perde: sem data
      "duda@teste.dev": ["elite", "active", "now() - interval '1 minute'"], // perde: vencido
      "eva@teste.dev": ["pro", "past_due", "now() - interval '2 days'"], // fica: dentro dos 3 dias
      "fabio@teste.dev": ["pro", "past_due", "now() - interval '4 days'"], // perde: fora da tolerância
      "gina@teste.dev": ["elite", "active", "now() + interval '10 days'"], // fica
      "hugo@teste.dev": ["pro", "active", null], // editor: fica (acesso pelo papel)
      "iris@teste.dev": ["pro", "canceled", null], // cancelado: não tinha acesso antes
      "jose@teste.dev": ["pro", "past_due", null], // perde: pendente sem data
      "lia@teste.dev": ["pro", "active", null], // revisora médica: fica (acesso pelo papel)
    };
    const ids: Record<string, string> = {};
    let n = 0x10;
    for (const [email, [plan, status, end]] of Object.entries(pessoas)) {
      const id = `00000000-0000-4000-8000-0000000000${(n++).toString(16)}`;
      ids[email] = id;
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [id, email]);
      await plano(id, plan, status, end);
    }
    await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [ids["hugo@teste.dev"]]);
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'cirurgia')`, [ids["lia@teste.dev"]]);

    const lista = await db.query<Record<string, any>>(consulta);
    expect(lista.fields.map((f) => f.name)).toEqual(["E-mail", "Plano", "Situação", "Plano pago até"]);
    expect(lista.rows.map((r) => r["E-mail"])).toEqual(["carla@teste.dev", "duda@teste.dev", "fabio@teste.dev", "jose@teste.dev"]);
    expect(lista.rows[0]).toMatchObject({ Plano: "pro", Situação: "active", "Plano pago até": null });

    // a lista bate com o que o banco decide: quem aparece fica sem o acesso pago; quem não aparece (e tinha acesso) continua
    for (const [email, [plan, status]] of Object.entries(pessoas)) {
      const temAcessoAntes = ["pro", "elite"].includes(plan) && ["active", "past_due"].includes(status);
      const listado = lista.rows.some((r) => r["E-mail"] === email);
      const depois = (await acesso(ids[email])).isPaid;
      expect(depois, email).toBe(temAcessoAntes && !listado);
    }
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

  it("a migração não liga sozinha os planos pagos do Tutor: com o Tutor ligado sem eles, a decisão fica com o dono pelo painel", async () => {
    // como pode estar em produção: ajuste direto no banco, sem ninguém logado (como no editor SQL do Supabase)
    await db.exec(`update public.tutor_config set enabled = true, requires_pro = false`);
    const registros = async () => (await db.query<{ n: number }>(`select count(*)::int n from public.admin_audit_log`)).rows[0].n;
    const antes = await registros();
    // colar a migração (duas vezes) não muda a configuração nem registra nada
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    expect(await tutorConfig()).toEqual({ enabled: true, requires_pro: false });
    expect(await registros()).toBe(antes);
    // o painel não salva nada do Tutor enquanto ficar assim
    await expect(salvarTutor({ daily_message_limit: 50 })).rejects.toThrow(MENSAGEM);
    expect(await tutorConfig()).toEqual({ enabled: true, requires_pro: false });
    // o dono decide: desligar o Tutor passa...
    await salvarTutor({ enabled: false });
    expect(await tutorConfig()).toEqual({ enabled: false, requires_pro: false });
    // ...e ligar o Tutor com os planos pagos também
    await salvarTutor({ enabled: true, requires_pro: true });
    expect(await tutorConfig()).toEqual({ enabled: true, requires_pro: true });
  });

  it("a trava não fica exposta a quem usa o app", async () => {
    expect(await podeChamar("public.tutor_config_guard()")).toEqual({ anon: false, authenticated: false });
  });
});
