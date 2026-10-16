// @vitest-environment node
/**
 * PL04 (decisão do dono de 2026-10-11) no banco (supabase/migrations/…9731_elite_beneficios.sql): o plano Elite pode ter algo que o
 * Pro não tem, SÓ A ESTRUTURA. Os valores (minutos de voz por dia do Elite e "correção de estação com devolutiva: só Elite") começam
 * IGUAIS ao Pro e desligados: nada muda para ninguém até o dono preencher em Administração > Configurações.
 * Pessoas testadas: visitante, aluno em teste vencido, aluno em teste válido, aluno Pro, aluno Elite, editor, revisor médico e administrador.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MIGRATION = path.join(MIGRATIONS, "20261003009731_elite_beneficios.sql");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const REVISOR = id(3);
const VALIDO = id(4);
const VENCIDO = id(5);
const PRO = id(6);
const ELITE = id(7);
const ELITE_VENCIDO = id(8);
const TODOS = { ADMIN, EDITOR, REVISOR, VALIDO, VENCIDO, PRO, ELITE, ELITE_VENCIDO };

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
const salvar = (uid: string | null, b: Record<string, unknown>) => rpc(uid, "app_admin_save_plan_benefits", { p_benefits: b });
const voz = async (uid: string) => (await rpc(uid, "app_tutor_status")).entitlement.voice.limit_today_s;

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
  await sub(VALIDO, "trial", "trialing", "now() + interval '3 days'");
  await sub(VENCIDO, "trial", "trialing", "now() - interval '1 day'");
  await sub(PRO, "pro", "active", null, "now() + interval '20 days'");
  await sub(ELITE, "elite", "active", null, "now() + interval '20 days'");
  await sub(ELITE_VENCIDO, "elite", "active", null, "now() - interval '1 day'");
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true, voice_enabled = true, paid_voice_daily_seconds = 3600`);
}, 120_000);

describe("PL04 — padrão: nada muda para ninguém", () => {
  it("os valores nascem vazios e desligados; o Elite tem os mesmos minutos de voz do Pro", async () => {
    expect(await rpc(ADMIN, "app_admin_plan_benefits")).toEqual({ elite_voice_daily_minutes: null, elite_station_feedback: false, pro_voice_daily_minutes: 60, voice_enabled: true });
    expect(await voz(PRO)).toBe(3600);
    expect(await voz(ELITE)).toBe(3600);
  });

  it("o aluno Elite não vê benefício nenhum enquanto o dono não preencher", async () => {
    expect(await rpc(ELITE, "app_my_benefits")).toEqual({ elite: true, voice_daily_minutes: null, station_feedback: false });
    expect(await rpc(PRO, "app_my_benefits")).toEqual({ elite: false, voice_daily_minutes: null, station_feedback: false });
  });

  it("a correção de estação com devolutiva nasce desligada para todos os alunos; a equipe e o revisor passam", async () => {
    for (const uid of [VALIDO, VENCIDO, PRO, ELITE, ELITE_VENCIDO]) expect(await rpc(uid, "station_feedback_allowed"), uid).toBe(false);
    for (const uid of [ADMIN, EDITOR, REVISOR]) expect(await rpc(uid, "station_feedback_allowed"), uid).toBe(true);
  });
});

describe("PL04 — permissões", () => {
  it("só o administrador vê e salva os valores; visitante, aluno, editor e revisor são recusados", async () => {
    await expect(rpc(null, "app_admin_plan_benefits")).rejects.toThrow(/permission denied/);
    await expect(salvar(null, {})).rejects.toThrow(/permission denied/);
    for (const uid of [VENCIDO, VALIDO, PRO, ELITE, EDITOR, REVISOR]) {
      await expect(rpc(uid, "app_admin_plan_benefits"), uid).rejects.toThrow("Acesso restrito a administradores.");
      await expect(salvar(uid, { elite_voice_daily_minutes: 90 }), uid).rejects.toThrow("Acesso restrito a administradores.");
    }
    expect(await rpc(ADMIN, "app_admin_plan_benefits")).toMatchObject({ elite_voice_daily_minutes: null });
  });

  it("a tabela não tem acesso direto e as funções internas não ficam expostas", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`set local role authenticated`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN })]);
        await tx.query(`select * from public.plan_benefits`);
      })
    ).rejects.toThrow(/permission denied/);
    expect(await podeChamar("public.user_is_paid_elite(uuid)")).toEqual({ anon: false, authenticated: false });
    expect(await podeChamar("public.app_admin_plan_benefits()")).toEqual({ anon: false, authenticated: true });
    expect(await podeChamar("public.app_admin_save_plan_benefits(jsonb)")).toEqual({ anon: false, authenticated: true });
    expect(await podeChamar("public.app_my_benefits()")).toEqual({ anon: false, authenticated: true });
    expect(await podeChamar("public.station_feedback_allowed()")).toEqual({ anon: false, authenticated: true });
  });

  it("visitante não lê benefícios nem a trava da estação", async () => {
    await expect(rpc(null, "app_my_benefits")).rejects.toThrow(/permission denied/);
    await expect(rpc(null, "station_feedback_allowed")).rejects.toThrow(/permission denied/);
  });
});

describe("PL04 — o dono preenche", () => {
  it("valida os minutos: 1 a 1440, vazio = igual ao Pro, nunca abaixo do Pro", async () => {
    for (const ruim of ["abc", "0", "1441", "-5", "12.5"]) {
      await expect(salvar(ADMIN, { elite_voice_daily_minutes: ruim }), ruim).rejects.toThrow("Minutos de voz do Elite: de 1 a 1440, ou deixe vazio para ficar igual ao Pro.");
    }
    await expect(salvar(ADMIN, { elite_voice_daily_minutes: "30" })).rejects.toThrow("Os minutos de voz do Elite não podem ser menores que os do Pro (60 min por dia).");
    await expect(salvar(ADMIN, { elite_station_feedback: "talvez" })).rejects.toThrow("Correção de estação com devolutiva: ligado ou desligado.");
    await expect(salvar(ADMIN, null as any)).rejects.toThrow(/Benefícios inválidos|null/);
    // nada foi gravado pelas tentativas
    expect(await rpc(ADMIN, "app_admin_plan_benefits")).toMatchObject({ elite_voice_daily_minutes: null, elite_station_feedback: false });
  });

  it("minutos de voz do Elite: valem só para o Elite com plano pago válido; Pro, equipe e Elite vencido ficam como estavam", async () => {
    expect(await salvar(ADMIN, { elite_voice_daily_minutes: 120, elite_station_feedback: false })).toMatchObject({ elite_voice_daily_minutes: 120 });
    expect(await voz(ELITE)).toBe(7200);
    expect(await voz(PRO)).toBe(3600);
    expect(await voz(ADMIN)).toBe(3600);
    expect(await voz(EDITOR)).toBe(3600);
    expect(await voz(REVISOR)).toBe(3600);
    // Elite com plano vencido: sem acesso pago, sem voz
    expect(await voz(ELITE_VENCIDO)).toBe(0);
    expect(await voz(VENCIDO)).toBe(0);
    // aluno em teste válido: teste do Tutor, com o limite do teste
    expect(await voz(VALIDO)).toBe(600);
    expect(await rpc(ELITE, "app_my_benefits")).toEqual({ elite: true, voice_daily_minutes: 120, station_feedback: false });
    expect(await rpc(PRO, "app_my_benefits")).toEqual({ elite: false, voice_daily_minutes: null, station_feedback: false });
    expect(await rpc(ELITE_VENCIDO, "app_my_benefits")).toEqual({ elite: false, voice_daily_minutes: null, station_feedback: false });
  });

  it("o Elite não fica abaixo do Pro mesmo se o Pro for aumentado depois no painel do Tutor", async () => {
    await db.exec(`update public.tutor_config set paid_voice_daily_seconds = 10800`); // 180 min
    expect(await voz(ELITE)).toBe(10800);
    expect((await rpc(ELITE, "app_my_benefits")).voice_daily_minutes).toBe(180);
    await db.exec(`update public.tutor_config set paid_voice_daily_seconds = 3600`);
  });

  it("correção de estação com devolutiva: ligada, só o Elite com plano pago válido (e a equipe) passam", async () => {
    await salvar(ADMIN, { elite_voice_daily_minutes: 120, elite_station_feedback: true });
    const quem = {} as Record<string, boolean>;
    for (const [nome, uid] of Object.entries(TODOS)) quem[nome] = await rpc(uid, "station_feedback_allowed");
    expect(quem).toEqual({ ADMIN: true, EDITOR: true, REVISOR: true, VALIDO: false, VENCIDO: false, PRO: false, ELITE: true, ELITE_VENCIDO: false });
    expect(await rpc(ELITE, "app_my_benefits")).toEqual({ elite: true, voice_daily_minutes: 120, station_feedback: true });
    expect(await rpc(PRO, "app_my_benefits")).toMatchObject({ station_feedback: false });
  });

  it("voltar ao padrão: vazio e desligado — tudo igual ao Pro de novo", async () => {
    await salvar(ADMIN, { elite_voice_daily_minutes: "", elite_station_feedback: false });
    expect(await voz(ELITE)).toBe(3600);
    expect(await rpc(ELITE, "app_my_benefits")).toEqual({ elite: true, voice_daily_minutes: null, station_feedback: false });
    expect(await rpc(ELITE, "station_feedback_allowed")).toBe(false);
  });

  it("cada mudança vai para o Registro com o antes e o depois", async () => {
    await salvar(ADMIN, { elite_voice_daily_minutes: 90, elite_station_feedback: true });
    const linha = (await db.query<{ action: string; target: string; details: any }>(`select action, target, details from public.admin_audit_log where action = 'plan.benefits' order by id desc limit 1`)).rows[0];
    expect(linha.target).toBe("elite");
    expect(linha.details.from).toEqual({ elite_voice_daily_minutes: null, elite_station_feedback: false });
    expect(linha.details.to).toEqual({ elite_voice_daily_minutes: 90, elite_station_feedback: true, pro_voice_daily_minutes: 60 });
    await salvar(ADMIN, { elite_voice_daily_minutes: null, elite_station_feedback: false });
  });
});

describe("PL04 — colar a migração de novo", () => {
  it("colar de novo não dá erro e não apaga o que o dono preencheu", async () => {
    await salvar(ADMIN, { elite_voice_daily_minutes: 75, elite_station_feedback: true });
    const sql = fs.readFileSync(MIGRATION, "utf8");
    await db.exec(sql);
    await db.exec(sql);
    expect(await rpc(ADMIN, "app_admin_plan_benefits")).toMatchObject({ elite_voice_daily_minutes: 75, elite_station_feedback: true });
    expect(await voz(ELITE)).toBe(4500);
    expect((await db.query(`select count(*)::int n from public.plan_benefits`)).rows[0]).toEqual({ n: 1 });
  });
});
