// @vitest-environment node
/**
 * PL02 (decisão do dono de 2026-10-11) no banco (supabase/migrations/…9730_teste_vencido_trava_pago.sql):
 * teste grátis VENCIDO conta como "sem acesso pago". Fecha o que é pago de verdade (Tutor, simulados completos, estações Pro) e
 * mantém questões e flashcards abertos. Não afeta equipe, revisor médico nem quem tem plano pago válido.
 * Quem é testado: visitante, aluno em teste válido, aluno em teste vencido, aluno pago (Pro e Elite), editor, administrador e
 * revisor médico.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MIGRATION = path.join(MIGRATIONS, "20261003009730_teste_vencido_trava_pago.sql");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const REVISOR = id(3);
const VALIDO = id(4); // teste grátis dentro do prazo
const VENCIDO = id(5); // teste grátis que já acabou
const PRO = id(6); // Pro ativo
const ELITE = id(7); // Elite ativo
const PRO_VENCIDO = id(8); // Pro cujo "plano pago até" já passou
const TUTOR_COMECADO = id(9); // teste vencido, mas já começou o teste do Tutor há 1 dia

const TESTE_ACABOU = "Seu teste grátis terminou. Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.";
const PLANO_ACABOU = "Seu plano pago terminou. Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.";

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
  db.query(
    `update public.subscriptions set plan = $2, status = $3, trial_ends_at = ${trialEnd ?? "null"}, current_period_end = ${periodEnd ?? "null"} where user_id = $1`,
    [uid, plan, status]
  );
const podeChamar = async (fn: string) =>
  (await db.query<{ anon: boolean; authenticated: boolean }>(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') authenticated`, [fn])).rows[0];

const simulado = (uid: string | null) => rpc(uid, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 3, p_time_limit_seconds: 600 });
const treino = (uid: string | null) => rpc(uid, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 3 });
const tutor = async (uid: string) => (await rpc(uid, "app_tutor_status")).entitlement;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [uid, email] of [
    [ADMIN, "master@teste.dev"], [EDITOR, "editor@teste.dev"], [REVISOR, "revisor@teste.dev"], [VALIDO, "valido@teste.dev"], [VENCIDO, "vencido@teste.dev"],
    [PRO, "pro@teste.dev"], [ELITE, "elite@teste.dev"], [PRO_VENCIDO, "provencido@teste.dev"], [TUTOR_COMECADO, "comecado@teste.dev"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, email]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'clinica_medica')`, [REVISOR]);
  // todos entram em teste grátis de 7 dias pelo cadastro; aqui cada um vai para a situação do teste
  await sub(REVISOR, "trial", "trialing", "now() - interval '2 days'"); // revisor com teste vencido: segue completo
  await sub(VALIDO, "trial", "trialing", "now() + interval '3 days'");
  await sub(VENCIDO, "trial", "trialing", "now() - interval '1 minute'");
  await sub(PRO, "pro", "active", null, "now() + interval '20 days'");
  await sub(ELITE, "elite", "active", null, "now() + interval '20 days'");
  await sub(PRO_VENCIDO, "pro", "active", null, "now() - interval '1 day'");
  await sub(TUTOR_COMECADO, "trial", "trialing", "now() - interval '1 day'");
  await db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '1 day' where user_id = $1`, [TUTOR_COMECADO]);

  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count) values ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 12)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((i) => ({ id: i, text: `alternativa ${i}`, explanation: i === "B" ? "Porque sim." : "" })));
  for (let n = 1; n <= 6; n++) {
    await db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status, needs_image, expected_conduct, inep_intent)
       values ($1, $2, 'revalida-2024-1', $3, 'CLINICA_MEDICA', 'Tema', 'sub', $4, $5, 'B', 'valid', false, 'Conduta.', 'Banca.')`,
      [`q-${n}`, `T-${n}`, n, `Caso ${n}.`, options]
    );
  }
  // Tutor no ar cobrando plano
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true`);
}, 120_000);

describe("PL02 — simulados completos", () => {
  it("teste grátis dentro do prazo começa simulado", async () => {
    expect(await simulado(VALIDO)).toMatchObject({ count: 3 });
  });

  it("teste grátis vencido: recusa com a mensagem em português; questões seguem abertas", async () => {
    await expect(simulado(VENCIDO)).rejects.toThrow(TESTE_ACABOU);
    expect(await treino(VENCIDO)).toMatchObject({ count: 3 });
  });

  it("flashcards seguem abertos para o teste vencido", async () => {
    await expect(rpc(VENCIDO, "app_flashcards")).resolves.toBeTruthy();
  });

  it("plano pago (Pro e Elite) válido começa simulado", async () => {
    expect(await simulado(PRO)).toMatchObject({ count: 3 });
    expect(await simulado(ELITE)).toMatchObject({ count: 3 });
  });

  it("plano pago vencido também fica sem simulado, com mensagem própria", async () => {
    await expect(simulado(PRO_VENCIDO)).rejects.toThrow(PLANO_ACABOU);
    expect(await treino(PRO_VENCIDO)).toMatchObject({ count: 3 });
  });

  it("equipe (administrador e editor) e revisor médico seguem completos, mesmo com teste vencido", async () => {
    await sub(EDITOR, "trial", "trialing", "now() - interval '5 days'");
    await sub(ADMIN, "trial", "expired", null);
    expect(await simulado(ADMIN)).toMatchObject({ count: 3 });
    expect(await simulado(EDITOR)).toMatchObject({ count: 3 });
    expect(await simulado(REVISOR)).toMatchObject({ count: 3 });
  });

  it("visitante não começa nada (entrar na conta)", async () => {
    await expect(simulado(null)).rejects.toThrow("Entre na sua conta para treinar.");
    await expect(treino(null)).rejects.toThrow("Entre na sua conta para treinar.");
  });

  it("virar plano pago ou renovar o teste abre de novo na hora", async () => {
    await sub(VENCIDO, "trial", "trialing", "now() + interval '2 days'");
    expect(await simulado(VENCIDO)).toMatchObject({ count: 3 });
    await sub(VENCIDO, "trial", "trialing", "now() - interval '1 minute'");
    await expect(simulado(VENCIDO)).rejects.toThrow(TESTE_ACABOU);
    await sub(VENCIDO, "elite", "active", null, "now() + interval '30 days'");
    expect(await simulado(VENCIDO)).toMatchObject({ count: 3 });
    await sub(VENCIDO, "trial", "trialing", "now() - interval '1 minute'");
  });
});

describe("PL02 — Tutor", () => {
  it("teste grátis dentro do prazo: o teste do Tutor segue disponível (como antes)", async () => {
    expect(await tutor(VALIDO)).toMatchObject({ mode: "trial", can_use: true, plan_locked: false, trial: { state: "available" } });
  });

  it("teste grátis vencido, sem ter começado o teste do Tutor: Tutor bloqueado e o aviso diz que o teste grátis terminou", async () => {
    const e = await tutor(VENCIDO);
    expect(e).toMatchObject({ mode: "blocked", can_use: false, can_text: false, can_voice: false, is_paid: false, plan_locked: true, block_reason: "trial_expired" });
    expect(e.voice.remaining_s).toBe(0);
  });

  it("o teste do Tutor que já começou segue até o prazo próprio dele (CF03 não muda aqui)", async () => {
    expect(await tutor(TUTOR_COMECADO)).toMatchObject({ mode: "trial", can_use: true, plan_locked: false, trial: { state: "active" } });
  });

  it("plano pago válido, Elite, equipe e revisor médico: Tutor como assinante", async () => {
    for (const uid of [PRO, ELITE, ADMIN, EDITOR, REVISOR]) {
      expect(await tutor(uid), uid).toMatchObject({ mode: "paid", can_use: true, plan_locked: false });
    }
  });

  it("plano pago vencido: sem acesso pago e sem teste do Tutor novo", async () => {
    expect(await tutor(PRO_VENCIDO)).toMatchObject({ mode: "blocked", can_use: false, is_paid: false });
  });

  it("o Tutor aberto para todos (requires_pro desligado) não é tocado pelo teste vencido", async () => {
    await db.exec(`update public.tutor_config set requires_pro = false`);
    try {
      expect(await tutor(VENCIDO)).toMatchObject({ mode: "paid", can_use: true });
    } finally {
      await db.exec(`update public.tutor_config set requires_pro = true`);
    }
  });

  it("não começa o teste do Tutor: tutor_begin_trial não grava nada para o teste vencido", async () => {
    await db.query(`select public.tutor_begin_trial($1)`, [VENCIDO]);
    expect((await db.query<{ t: string | null }>(`select tutor_trial_started_at t from public.subscriptions where user_id = $1`, [VENCIDO])).rows[0].t).toBeNull();
  });
});

describe("PL02 — estações Pro", () => {
  it("has_pro: só plano pago válido e acesso completo; teste (vencido ou dentro do prazo) nunca abriu Pro", async () => {
    const hasPro = async (uid: string) => (await rpc(uid, "app_bootstrap")).has_pro;
    expect(await hasPro(VENCIDO)).toBe(false);
    expect(await hasPro(VALIDO)).toBe(false);
    expect(await hasPro(PRO_VENCIDO)).toBe(false);
    for (const uid of [PRO, ELITE, ADMIN, EDITOR, REVISOR]) expect(await hasPro(uid), uid).toBe(true);
  });
});

describe("PL02 — permissões das funções novas", () => {
  it("as regras internas não ficam expostas; só a trava do simulado é chamável por quem está logado", async () => {
    for (const fn of ["public.subscription_trial_is_valid(public.subscription_status, timestamptz)", "public.user_without_paid_access(uuid)"]) {
      expect(await podeChamar(fn), fn).toEqual({ anon: false, authenticated: false });
    }
    expect(await podeChamar("public.simulado_gate()")).toEqual({ anon: false, authenticated: true });
  });

  it("a trava do simulado só fala da própria pessoa: sem texto para quem tem acesso", async () => {
    expect(await rpc(PRO, "simulado_gate")).toBeNull();
    expect(await rpc(VENCIDO, "simulado_gate")).toBe(TESTE_ACABOU);
  });
});

describe("PL02 — consulta de conferência do cabeçalho", () => {
  it("lista exatamente quem perde os simulados e o Tutor novo (sem equipe, sem revisor médico, sem pago válido, sem teste valendo)", async () => {
    const cabecalho = fs.readFileSync(MIGRATION, "utf8");
    const consulta = /select u\.email as "E-mail"[\s\S]*?order by u\.email;/.exec(cabecalho)![0].replace(/^--\s?/gm, "");
    const lista = await db.query<Record<string, any>>(consulta);
    expect(lista.fields.map((f) => f.name)).toEqual(["E-mail", "Plano", "Situação", "Teste até", "Plano pago até"]);
    const emails = lista.rows.map((r) => r["E-mail"]);
    expect(emails).toEqual(["comecado@teste.dev", "provencido@teste.dev", "vencido@teste.dev"]);
    // a lista bate com o que o banco decide: cada um deles está sem acesso pago e nenhum dos outros está
    for (const uid of [VENCIDO, PRO_VENCIDO, TUTOR_COMECADO]) expect(await rpc(uid, "simulado_gate"), uid).not.toBeNull();
    for (const uid of [ADMIN, EDITOR, REVISOR, VALIDO, PRO, ELITE]) expect(await rpc(uid, "simulado_gate"), uid).toBeNull();
  });
});

describe("PL02 — colar a migração de novo", () => {
  it("colar de novo não dá erro nem muda o resultado", async () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    await db.exec(sql);
    await db.exec(sql);
    await expect(simulado(VENCIDO)).rejects.toThrow(TESTE_ACABOU);
    expect(await simulado(PRO)).toMatchObject({ count: 3 });
  });
});
