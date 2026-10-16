// @vitest-environment node
/**
 * PL06 (decisão do dono de 2026-10-11) no banco (supabase/migrations/…9732_cadastro_sem_teste.sql): a chave "Oferecer teste grátis no
 * cadastro" (Administração > Planos > Teste grátis) vale de verdade. Desligada = cadastro novo SEM teste (acesso gratuito);
 * ligada = como hoje. Quem já está em teste não muda. Passa pelo gatilho de cadastro (auth.users), igual ao e-mail e ao Google.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MIGRATION = path.join(MIGRATIONS, "20261003009732_cadastro_sem_teste.sql");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const ANTIGO = id(3); // já estava em teste antes de desligar a chave

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
let seq = 100;
/** Cadastra uma pessoa nova (o gatilho cria perfil, papel e assinatura) e devolve o id e a assinatura. */
async function cadastrar(meta: Record<string, unknown> = {}) {
  const uid = id(++seq);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `novo${seq}@teste.dev`, meta]);
  const s = (await db.query<any>(`select plan, status, trial_ends_at, current_period_end, tutor_trial_started_at from public.subscriptions where user_id = $1`, [uid])).rows[0];
  return { uid, s };
}
const ofertaDoTeste = (active: boolean) =>
  rpc(ADMIN, "app_admin_save_plan", { p_plan: { code: "trial", name: "Teste grátis", description: "", price_cents: 0, billing_period: "monthly", features: [], active } });
const dias = (iso: Date | string) => Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'master@teste.dev', '{}'), ($2, 'editor@teste.dev', '{}')`, [ADMIN, EDITOR]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'antigo@teste.dev', '{}')`, [ANTIGO]);
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((i) => ({ id: i, text: `alternativa ${i}`, explanation: i === "B" ? "Porque sim." : "" })));
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count) values ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 12)`);
  for (let n = 1; n <= 4; n++) {
    await db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status, needs_image, expected_conduct, inep_intent)
       values ($1, $2, 'revalida-2024-1', $3, 'CLINICA_MEDICA', 'Tema', 'sub', $4, $5, 'B', 'valid', false, 'Conduta.', 'Banca.')`,
      [`q-${n}`, `T-${n}`, n, `Caso ${n}.`, options]
    );
  }
}, 120_000);

describe("PL06 — chave ligada (padrão): como hoje", () => {
  it("a chave nasce ligada e o cadastro novo ganha o teste pelos dias das Configurações", async () => {
    expect((await db.query<{ active: boolean }>(`select active from public.plans where code = 'trial'`)).rows[0].active).toBe(true);
    const { s } = await cadastrar();
    expect(s).toMatchObject({ plan: "trial", status: "trialing", current_period_end: null });
    expect(dias(s.trial_ends_at)).toBe(7);
    await db.exec(`update public.app_settings set value = '3'::jsonb where key = 'trial_days'`);
    expect(dias((await cadastrar()).s.trial_ends_at)).toBe(3);
    await db.exec(`update public.app_settings set value = '7'::jsonb where key = 'trial_days'`);
  });
});

describe("PL06 — chave desligada: cadastro novo sem teste", () => {
  let semTeste: { uid: string; s: any };

  it("desligar a chave pela Administração; quem já estava em teste não muda", async () => {
    const antes = (await db.query<any>(`select plan, status, trial_ends_at from public.subscriptions where user_id = $1`, [ANTIGO])).rows[0];
    await ofertaDoTeste(false);
    expect((await db.query<{ active: boolean }>(`select active from public.plans where code = 'trial'`)).rows[0].active).toBe(false);
    expect((await db.query<any>(`select plan, status, trial_ends_at from public.subscriptions where user_id = $1`, [ANTIGO])).rows[0]).toEqual(antes);
    expect(antes).toMatchObject({ plan: "trial", status: "trialing" });
  });

  it("cadastro novo nasce no acesso gratuito: teste grátis expirado, sem data, sem plano pago", async () => {
    semTeste = await cadastrar({ name: "Nova Aluna" });
    expect(semTeste.s).toMatchObject({ plan: "trial", status: "expired", trial_ends_at: null, current_period_end: null, tutor_trial_started_at: null });
    // o resto do cadastro continua igual: perfil e papel de aluno
    expect((await db.query<any>(`select name from public.profiles where id = $1`, [semTeste.uid])).rows[0].name).toBe("Nova Aluna");
    expect((await db.query<any>(`select role from public.user_roles where user_id = $1`, [semTeste.uid])).rows[0].role).toBe("student");
  });

  it("o aceite do termo e o WhatsApp do cadastro continuam sendo gravados", async () => {
    const versao = (await db.query<{ version: string }>(`select version from public.legal_versions where document = 'termo_uso'`)).rows[0].version;
    // Termo 2.0: o aceite do cadastro vai com as declarações de maioridade e de médico
    const { uid } = await cadastrar({ phone: "+5511987654321", terms_version: versao, declares_adult: "true", declares_physician: "true" });
    expect((await db.query<any>(`select phone from public.profiles where id = $1`, [uid])).rows[0].phone).toBe("+5511987654321");
    expect((await db.query<any>(`select origin from public.legal_acceptances where user_id = $1 and document = 'termo_uso'`, [uid])).rows).toEqual([{ origin: "cadastro" }]);
  });

  it("sem teste: questões e flashcards abertos; simulado completo e Tutor fechados, com aviso em português", async () => {
    expect(await rpc(semTeste.uid, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 3 })).toMatchObject({ count: 3 });
    await expect(rpc(semTeste.uid, "app_flashcards")).resolves.toBeTruthy();
    await expect(rpc(semTeste.uid, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 3, p_time_limit_seconds: 600 })).rejects.toThrow(
      "Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível."
    );
    const e = (await rpc(semTeste.uid, "app_tutor_status")).entitlement;
    expect(e).toMatchObject({ mode: "blocked", can_use: false, plan_locked: true });
    expect((await rpc(semTeste.uid, "app_bootstrap")).has_pro).toBe(false);
  });

  it("quem estava em teste antes segue com o teste (simulado e Tutor abertos)", async () => {
    expect(await rpc(ANTIGO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 3, p_time_limit_seconds: 600 })).toMatchObject({ count: 3 });
    expect((await rpc(ANTIGO, "app_tutor_status")).entitlement).toMatchObject({ mode: "trial", can_use: true });
  });

  it("a equipe pode dar um plano ou um teste à pessoa sem teste, e ela passa a ter acesso", async () => {
    const ate = new Date(Date.now() + 5 * 86_400_000).toISOString();
    await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: semTeste.uid, p_plan: "trial", p_status: "trialing", p_trial_ends_at: ate });
    expect(await rpc(semTeste.uid, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 3, p_time_limit_seconds: 600 })).toMatchObject({ count: 3 });
  });

  it("o resumo da Administração conta a pessoa sem teste como 'Expirado', não como 'Em teste'", async () => {
    const outra = await cadastrar();
    const visao = await rpc(ADMIN, "app_admin_overview");
    expect(JSON.stringify(visao)).toContain("trial:expired");
    expect(outra.s.status).toBe("expired");
  });

  it("ligar de novo: o cadastro volta a ganhar teste", async () => {
    await ofertaDoTeste(true);
    const { s } = await cadastrar();
    expect(s).toMatchObject({ plan: "trial", status: "trialing" });
    expect(dias(s.trial_ends_at)).toBe(7);
  });
});

describe("PL06 — permissões", () => {
  it("só o administrador liga ou desliga a chave; visitante e editor são recusados", async () => {
    const tentar = (uid: string | null) =>
      rpc(uid, "app_admin_save_plan", { p_plan: { code: "trial", name: "Teste grátis", price_cents: 0, billing_period: "monthly", features: [], active: false } });
    // o visitante até chega na função (como as demais da Administração desde a …1300), mas ela o recusa
    await expect(tentar(null)).rejects.toThrow("Acesso restrito a administradores.");
    await expect(tentar(EDITOR)).rejects.toThrow("Acesso restrito a administradores.");
    await expect(tentar(ANTIGO)).rejects.toThrow("Acesso restrito a administradores.");
    expect((await db.query<{ active: boolean }>(`select active from public.plans where code = 'trial'`)).rows[0].active).toBe(true);
  });
});

describe("PL06 — colar a migração de novo", () => {
  it("colar de novo não dá erro e a chave continua mandando", async () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    await db.exec(sql);
    await db.exec(sql);
    await ofertaDoTeste(false);
    expect((await cadastrar()).s).toMatchObject({ status: "expired", trial_ends_at: null });
    await ofertaDoTeste(true);
    expect((await cadastrar()).s).toMatchObject({ status: "trialing" });
  });
});
