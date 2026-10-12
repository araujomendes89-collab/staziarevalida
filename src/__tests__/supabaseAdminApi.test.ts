// @vitest-environment node
/**
 * Administração (supabase/migrations/…1300_admin.sql) num Postgres real em memória:
 * cada função confere o papel de quem chama e registra o que mudou.
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

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
}

const question = (number: number, extra: Record<string, unknown> = {}) => ({
  kind: "REVALIDA",
  year: 2026,
  semester: 2,
  number,
  area: "PEDIATRIA",
  topic: "Bronquiolite",
  subtopic: "Manejo ambulatorial",
  statement: `Lactente de 4 meses com coriza e sibilância há 2 dias, questão ${number}. Qual a conduta?`,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: id === "C" ? "Suporte clínico." : "" })),
  correct_option: "C",
  status: "valid",
  ...extra,
});

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
  await db.exec(`
    insert into public.checklist_stations (id, name, topic, area, medical_review) values
      ('st-1', 'Cetoacidose', 'DM1', 'Clínica Médica', 'pending');
  `);
}, 60_000);

describe("Administração — acesso", () => {
  it("aluno e visitante são barrados em todas as funções de administração", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["app_admin_overview", {}],
      ["app_admin_users", {}],
      ["app_admin_user", { p_user_id: ANA }],
      ["app_admin_set_role", { p_user_id: ANA, p_role: "admin" }],
      ["app_admin_set_subscription", { p_user_id: ANA, p_plan: "elite", p_status: "active" }],
      ["app_admin_delete_user", { p_user_id: BRUNO, p_confirm_email: "bruno@teste.dev" }],
      ["app_admin_questions", {}],
      ["app_admin_import_questions", { p_questions: [question(1)] }],
      ["app_admin_save_question", { p_question: question(1) }],
      ["app_admin_import_preview", { p_questions: [question(1)] }],
      ["app_admin_question_review_done", { p_question_id: "revalida_2026_2_q001" }],
      ["app_admin_set_official_answer", { p_question_id: "revalida_2026_2_q001", p_answer: "A", p_status: "FINAL", p_source: "x", p_reason: "y" }],
      ["app_admin_stations", {}],
      ["app_admin_set_station_review", { p_station_id: "st-1", p_status: "approved", p_note: "Conferi roteiro e checklist." }],
      ["app_admin_plans", {}],
      ["app_admin_save_plan", { p_plan: { code: "pro", name: "Pro" } }],
      ["app_admin_settings", {}],
      ["app_admin_save_settings", { p_settings: { trial_days: 30 } }],
      ["app_admin_audit", {}],
    ];
    for (const [fn, args] of calls) {
      await expect(rpc(ANA, fn, args), fn).rejects.toThrow(/Acesso restrito/);
      await expect(rpc(null, fn, args), fn).rejects.toThrow(/Acesso restrito|permission denied/);
    }
    expect((await db.query<any>(`select role from public.user_roles where user_id = $1`, [ANA])).rows[0].role).toBe("student");
  });

  it("funções internas não podem ser chamadas por ninguém de fora", async () => {
    for (const sql of [
      `select public.admin_upsert_question('{}'::jsonb, true)`,
      `select public.admin_user_row('${ANA}')`,
      `select public.admin_log('x', 'y', '{}')`,
      `select public.admin_import_merge_question('x', '{}'::jsonb)`,
      `select public.admin_import_merge_options('[]'::jsonb, '[]'::jsonb)`,
      `select public.admin_import_answer_label('B', 'valid')`,
      `select public.question_analysis_fits('x', 'B')`,
      `select public.tutor_truth('x', 'full')`,
    ]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec("set local role authenticated");
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN })]);
          await tx.query(sql);
        })
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("editor cuida do conteúdo, mas não de usuários, planos e configurações", async () => {
    expect((await rpc(EDITOR, "app_admin_questions")).total).toBe(0);
    expect(await rpc(EDITOR, "app_admin_stations")).toHaveLength(1);
    for (const fn of ["app_admin_users", "app_admin_plans", "app_admin_settings", "app_admin_audit"]) {
      await expect(rpc(EDITOR, fn), fn).rejects.toThrow(/restrito a administradores/);
    }
  });
});

describe("Administração — usuários", () => {
  it("lista com e-mail, papel, plano e atividade; busca sem acento e filtros", async () => {
    const all = await rpc(ADMIN, "app_admin_users");
    expect(all.total).toBe(4);
    const ana = all.items.find((u: any) => u.id === ANA);
    expect(ana).toMatchObject({ email: "ana@teste.dev", name: "Ana Lima", role: "student", plan: "trial", status: "trialing", answered: 0, last_activity: null });

    expect((await rpc(ADMIN, "app_admin_users", { p_search: "LIMA" })).items.map((u: any) => u.email)).toEqual(["ana@teste.dev"]);
    expect((await rpc(ADMIN, "app_admin_users", { p_search: "bruno@" })).total).toBe(1);
    expect((await rpc(ADMIN, "app_admin_users", { p_role: "editor" })).items.map((u: any) => u.name)).toEqual(["Editora"]);
    expect((await rpc(ADMIN, "app_admin_users", { p_limit: 2 })).items).toHaveLength(2);
  });

  it("muda papel e plano, e não deixa o admin tirar o próprio acesso", async () => {
    const promoted = await rpc(ADMIN, "app_admin_set_role", { p_user_id: ANA, p_role: "editor" });
    expect(promoted.role).toBe("editor");
    await expect(rpc(ADMIN, "app_admin_set_role", { p_user_id: ANA, p_role: "dono" })).rejects.toThrow(/Papel inválido/);
    await expect(rpc(ADMIN, "app_admin_set_role", { p_user_id: ADMIN, p_role: "student" })).rejects.toThrow(/próprio acesso/);

    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const elite = await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: ANA, p_plan: "elite", p_status: "active", p_current_period_end: until });
    expect(elite).toMatchObject({ plan: "elite", status: "active", trial_ends_at: null });
    expect((await rpc(ANA, "app_bootstrap")).has_pro).toBe(true);
    await expect(rpc(ADMIN, "app_admin_set_subscription", { p_user_id: ANA, p_plan: "trial", p_status: "trialing" })).rejects.toThrow(/até quando vai o teste/);

    const detail = await rpc(ADMIN, "app_admin_user", { p_user_id: ANA });
    expect(detail).toMatchObject({ email: "ana@teste.dev", sessions: 0, flashcards: 0, pending_errors: 0 });
  });

  it("exclui outro usuário só com o e-mail dele como confirmação; nunca a si mesmo", async () => {
    await expect(rpc(ADMIN, "app_admin_delete_user", { p_user_id: BRUNO, p_confirm_email: "ana@teste.dev" })).rejects.toThrow(/e-mail do usuário/);
    await expect(rpc(ADMIN, "app_admin_delete_user", { p_user_id: ADMIN, p_confirm_email: "master@teste.dev" })).rejects.toThrow(/própria conta/);
    expect(await rpc(ADMIN, "app_admin_delete_user", { p_user_id: BRUNO, p_confirm_email: " Bruno@Teste.dev " })).toBe(true);
    expect((await db.query(`select 1 from auth.users where id = $1`, [BRUNO])).rows).toHaveLength(0);
  });

  it("tudo fica no registro de ações, com quem fez", async () => {
    const log = await rpc(ADMIN, "app_admin_audit");
    expect(log.map((l: any) => l.action)).toEqual(["user.delete", "user.subscription", "user.role"]);
    expect(log.every((l: any) => l.actor === "master@teste.dev")).toBe(true);
    expect(log[2].details).toEqual({ from: "student", to: "editor" });
  });
});

describe("Administração — questões", () => {
  it("importação valida tudo antes e não grava nada se houver erro", async () => {
    const result = await rpc(ADMIN, "app_admin_import_questions", {
      p_questions: [
        question(1),
        question(2, { correct_option: "E" }),
        question(3, { options: [{ id: "A", text: "só uma" }] }),
        question(4, { area: "ODONTO" }),
        question(5, { statement: "curto" }),
        question(1),
        question(6, { year: null }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e: any) => [e.index, e.message])).toEqual([
      [2, "Informe o gabarito (A, B, C ou D)."],
      [3, "São necessárias 4 alternativas (A a D)."],
      [4, "Grande área inválida."],
      [5, "Enunciado vazio ou curto demais."],
      [7, "Ano da prova inválido."],
      [1, "Questão repetida no arquivo."],
    ]);
    expect((await db.query(`select 1 from public.questions`)).rows).toHaveLength(0);
  });

  it("importa, cria a prova, gera código e id, e aceita anulada sem gabarito", async () => {
    const result = await rpc(EDITOR, "app_admin_import_questions", {
      p_questions: [question(1), question(2, { status: "annulled", correct_option: null }), question(3, { kind: "ENAMED", year: 2025, semester: null })],
    });
    expect(result).toEqual({ ok: true, inserted: 3, updated: 0, skipped: 0, answer_differs: 0 });
    const rows = (await db.query<any>(`select id, code, exam_id, status, correct_option from public.questions order by code`)).rows;
    expect(rows).toEqual([
      { id: "enamed_2025_q003", code: "ENAMED-2025-Q003", exam_id: "enamed-2025", status: "valid", correct_option: "C" },
      { id: "revalida_2026_2_q001", code: "REV-2026.2-Q001", exam_id: "revalida-2026-2", status: "valid", correct_option: "C" },
      { id: "revalida_2026_2_q002", code: "REV-2026.2-Q002", exam_id: "revalida-2026-2", status: "annulled", correct_option: null },
    ]);
    const exams = (await db.query<any>(`select id, title, question_count from public.exams where kind <> 'STAZIAMED' order by id`)).rows;
    expect(exams).toEqual([
      { id: "enamed-2025", title: "ENAMED 2025", question_count: 1 },
      { id: "revalida-2026-2", title: "Revalida INEP 2026/2", question_count: 2 },
    ]);
    // a anulada não entra no treino; a válida entra
    expect((await rpc(ANA, "app_question_filters")).total).toBe(2);
  });

  it("reimportar pula as existentes, ou atualiza se pedido", async () => {
    const changed = question(1, { topic: "Bronquiolite viral aguda" });
    expect(await rpc(ADMIN, "app_admin_import_questions", { p_questions: [changed, question(4)] })).toEqual({ ok: true, inserted: 1, updated: 0, skipped: 1, answer_differs: 0 });
    expect(await rpc(ADMIN, "app_admin_import_questions", { p_questions: [changed], p_update_existing: true })).toEqual({ ok: true, inserted: 0, updated: 1, skipped: 0, answer_differs: 0 });
    expect((await rpc(ADMIN, "app_admin_question", { p_id: "revalida_2026_2_q001" })).topic).toBe("Bronquiolite viral aguda");
  });

  it("lista com busca e filtros, e o editor salva uma questão (sem mudar prova e número)", async () => {
    expect((await rpc(ADMIN, "app_admin_questions", { p_filters: { search: "viral" } })).items.map((q: any) => q.code)).toEqual(["REV-2026.2-Q001"]);
    expect((await rpc(ADMIN, "app_admin_questions", { p_filters: { status: "annulled" } })).total).toBe(1);
    expect((await rpc(ADMIN, "app_admin_questions", { p_filters: { exam_id: "enamed-2025" } })).total).toBe(1);
    const list = await rpc(ADMIN, "app_admin_questions");
    expect(list.exams.map((e: any) => e.id)).toEqual(["revalida-2026-2", "enamed-2025"]);

    const saved = await rpc(EDITOR, "app_admin_save_question", {
      p_question: { ...question(1), id: "revalida_2026_2_q001", needs_image: true },
    });
    expect(saved).toMatchObject({ id: "revalida_2026_2_q001", status: "valid", needs_image: true, attempts: 0 });
    // situação e gabarito de questão já gravada não mudam pelo editor (…7700, Q02): só pelo registro do gabarito oficial
    await expect(rpc(EDITOR, "app_admin_save_question", { p_question: { ...question(1), id: "revalida_2026_2_q001", status: "annulled" } })).rejects.toThrow(/registro do gabarito oficial/);
    await expect(rpc(EDITOR, "app_admin_set_official_answer", { p_question_id: "revalida_2026_2_q001", p_answer: null, p_status: "ANNULLED", p_source: "Gabarito definitivo (teste)", p_reason: "Banca anulou." })).rejects.toThrow(/restrito a administradores/);
    expect(await rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: "revalida_2026_2_q001", p_answer: null, p_status: "ANNULLED", p_source: "Gabarito definitivo (teste)", p_reason: "Banca anulou." })).toMatchObject({ version: 1, recorrected: 0 });
    expect((await rpc(EDITOR, "app_admin_question", { p_id: "revalida_2026_2_q001" })).status).toBe("annulled");
    await expect(rpc(EDITOR, "app_admin_save_question", { p_question: { ...question(9), id: "revalida_2026_2_q001" } })).rejects.toThrow(/não podem ser alterados/);
    await expect(rpc(EDITOR, "app_admin_save_question", { p_question: question(9, { topic: " " }) })).rejects.toThrow(/Informe o tema/);
    // questão nova pelo editor
    expect((await rpc(EDITOR, "app_admin_save_question", { p_question: question(9) })).code).toBe("REV-2026.2-Q009");
  });
});

describe("Administração — estações, planos e configurações", () => {
  it("aprovar a estação (administrador, com o que foi conferido) libera para os alunos; editor comum não aprova", async () => {
    const asStudent = () =>
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA })]);
        await tx.exec("set local role authenticated");
        return (await tx.query(`select id from public.checklist_stations`)).rows;
      });
    await rpc(ADMIN, "app_admin_set_role", { p_user_id: ANA, p_role: "student" });
    expect(await asStudent()).toHaveLength(0);
    await expect(rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-1", p_status: "approved", p_note: "Conferi roteiro e checklist." })).rejects.toThrow(/revisor médico/);
    expect(await asStudent()).toHaveLength(0);
    const stations = await rpc(ADMIN, "app_admin_set_station_review", { p_station_id: "st-1", p_status: "approved", p_note: "Conferi roteiro e checklist." });
    expect(stations[0]).toMatchObject({ id: "st-1", medical_review: "approved", reports: 0 });
    expect(await asStudent()).toHaveLength(1);
  });

  it("planos: preço obrigatório para pôr à venda; o aluno vê só os ativos", async () => {
    expect((await rpc(ANA, "app_plans")).map((p: any) => p.code)).toEqual(["trial"]);
    await expect(rpc(ADMIN, "app_admin_save_plan", { p_plan: { code: "pro", name: "Pro", active: true } })).rejects.toThrow(/Defina o preço/);
    await expect(rpc(ADMIN, "app_admin_save_plan", { p_plan: { code: "pro", name: "Pro", features: ["x".repeat(121)] } })).rejects.toThrow(/Recursos/);
    const plans = await rpc(ADMIN, "app_admin_save_plan", {
      p_plan: { code: "pro", name: "Pro", price_cents: "4990", billing_period: "monthly", active: true, features: ["Questões comentadas", " ", "Simulados"] },
    });
    expect(plans.find((p: any) => p.code === "pro")).toMatchObject({ price_cents: 4990, active: true, features: ["Questões comentadas", "Simulados"] });
    expect((await rpc(ANA, "app_plans")).map((p: any) => p.code)).toEqual(["trial", "pro"]);
  });

  it("dias de teste valem para os próximos cadastros; o aviso aparece para os alunos", async () => {
    await expect(rpc(ADMIN, "app_admin_save_settings", { p_settings: { trial_days: 120 } })).rejects.toThrow(/de 0 a 90/);
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { trial_days: 14 } });
    await db.query(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000cc', 'carla@teste.dev')`);
    const days = (await db.query<any>(`select round(extract(epoch from (trial_ends_at - now())) / 86400)::int as d from public.subscriptions where user_id = '00000000-0000-4000-8000-0000000000cc'`)).rows[0].d;
    expect(days).toBe(14);

    expect(await rpc(ANA, "app_announcement")).toBeNull();
    await expect(rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: "", text: "x" } } })).rejects.toThrow(/escreva o título/);
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "warning", title: "Manutenção sábado", text: "Das 8h às 10h." } } });
    expect(await rpc(ANA, "app_announcement")).toEqual({ tone: "warning", title: "Manutenção sábado", text: "Das 8h às 10h." });
    expect((await rpc(ADMIN, "app_admin_settings")).trial_days).toBe(14);
  });

  it("visão geral com números do banco", async () => {
    const o = await rpc(ADMIN, "app_admin_overview");
    expect(o.users).toMatchObject({ total: 4, by_role: { admin: 1, editor: 1, student: 2 } });
    expect(o.questions).toMatchObject({ total: 5, annulled: 2, exams: 2 });
    expect(o.stations).toMatchObject({ pending: 0, approved: 1 });
  });
});
