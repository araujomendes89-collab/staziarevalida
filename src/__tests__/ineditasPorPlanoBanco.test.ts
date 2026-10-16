// @vitest-environment node
/**
 * Questões Inéditas por plano (migração …010300). Teste grátis = 20 (padrão do dono), pagos = todas, o administrador troca os números.
 * Banco PGlite com todas as migrações; as inéditas de teste são criadas aqui (74, como em produção: lotes 24 + 25 + 25).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertStaziaQuestion, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 180_000 });

const id = (n: number) => `00000000-0000-4000-8000-00000000a${String(n).padStart(3, "0")}`;
const ELITE = id(1);
const TESTE2 = id(2);
const INEDITAS = { exam_id: "staziamed" };
const N = 74;

let env: StaziaEnv;
let ids: string[] = [];
let retirada: string;

const poolAs = async (uid: string, filters: object = INEDITAS) =>
  (await env.sqlAs<{ question_id: string }>(uid, `select question_id from public.practice_pool($1::jsonb) order by question_id`, [JSON.stringify(filters)])).map((r) => r.question_id);
const readable = async (uid: string) => (await env.sqlAs<{ id: string }>(uid, `select id from public.questions where origin = 'staziamed' order by id`)).map((r) => r.id);
const mine = (uid: string) => env.rpc<any>(uid, "app_my_ineditas");
const setLimit = (uid: string, limits: Record<string, number | null>) => env.rpc<any>(uid, "app_admin_save_ineditas_limits", { p_limits: limits });
const answer = (uid: string, q: string) =>
  env.sql(`insert into public.question_attempts (user_id, question_id, selected_option, is_correct, active_ms) values ($1, $2, 'A', true, 1000)`, [uid, q]);

beforeAll(async () => {
  env = await openStaziaEnv();
  const areas = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"];
  for (let i = 0; i < N; i++) ids.push(await insertStaziaQuestion(env, { area: areas[i % 5] as any, correct: "A" }));
  retirada = await insertStaziaQuestion(env, { area: "PEDIATRIA", correct: "B", retired: true });
  for (const [uid, email] of [[ELITE, "elite@staziamed.teste"], [TESTE2, "teste2@staziamed.teste"]]) await env.sql(`insert into auth.users (id, email) values ($1, $2)`, [uid, email]);
  await env.sql(`update public.subscriptions set plan = 'elite', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ELITE]);
  await env.sql(`update public.subscriptions set trial_ends_at = now() + interval '5 days' where user_id = $1`, [TESTE2]);
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("padrão do dono", () => {
  it("a tabela nasce com teste = 20, Pro e Elite = todas", async () => {
    expect(await env.sql(`select plan, max_ineditas from public.ineditas_plan_limits order by plan`)).toEqual([
      { plan: "trial", max_ineditas: 20 }, { plan: "pro", max_ineditas: null }, { plan: "elite", max_ineditas: null },
    ]);
  });
});

describe("aluno em teste grátis", () => {
  it("vê o total (74) e 20 liberadas; só resolve 20", async () => {
    const m = await mine(USERS.TESTE);
    expect(m).toMatchObject({ total: N, released: 20, answered: 0, limit: 20, limited: true, locked: false });
    expect((await poolAs(USERS.TESTE)).length).toBe(20);
    expect((await readable(USERS.TESTE)).length).toBe(20);
  });

  it("é estável: o mesmo conjunto a cada acesso e pelas três portas (sorteio, leitura, contador)", async () => {
    const a = await poolAs(USERS.TESTE);
    const b = await poolAs(USERS.TESTE);
    expect(a).toEqual(b);
    expect(await readable(USERS.TESTE)).toEqual(a);
    // sessões novas sorteiam só dentro das 20
    for (let i = 0; i < 3; i++) {
      const s = await env.rpc<{ session_id: string; count: number }>(USERS.TESTE, "app_start_session", { p_kind: "questoes", p_filters: INEDITAS, p_count: 200 });
      expect(s.count).toBe(20);
      const [{ question_ids }] = await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [s.session_id]);
      expect([...question_ids].sort()).toEqual(a);
    }
  });

  it("outro aluno de teste recebe outro conjunto de 20 (espalha as 74)", async () => {
    const a = await poolAs(USERS.TESTE);
    const b = await poolAs(TESTE2);
    expect(b.length).toBe(20);
    expect(b).not.toEqual(a);
  });

  it("não burla: ler direto, buscar texto e abrir uma não liberada não devolve nada; responder uma não liberada é recusado", async () => {
    const liberadas = new Set(await poolAs(USERS.TESTE));
    const fora = ids.find((q) => !liberadas.has(q))!;
    expect(await env.sqlAs(USERS.TESTE, `select id from public.questions where id = $1`, [fora])).toEqual([]);
    expect(await env.sqlAs(USERS.TESTE, `select id from public.questions where exam_id = 'staziamed' and id = $1`, [fora])).toEqual([]);
    expect((await env.sqlAs(USERS.TESTE, `select public.practice_question_view($1) as v`, [fora]))[0].v).toBeNull();
    expect((await env.sqlAs(USERS.TESTE, `select public.ch_raw_practice_correction_view($1, 'A') as v`, [fora]).catch(() => [{ v: null }]))[0].v).toBeNull();
    await expect(answer(USERS.TESTE, fora)).rejects.toThrow(/não está liberada no seu plano/);
    await expect(env.rpc(USERS.TESTE, "app_start_related_question", { p_question_id: fora })).rejects.toThrow(/não está liberada no seu plano/);
    const dentro = [...liberadas][0];
    await answer(USERS.TESTE, dentro); // as liberadas respondem normalmente
  });

  it("responder não gasta outra: continua com 20 liberadas, 1 respondida; o mesmo conjunto", async () => {
    const m = await mine(USERS.TESTE);
    expect(m).toMatchObject({ released: 20, answered: 1 });
    expect((await poolAs(USERS.TESTE)).length).toBe(20);
  });

  it("retirada fora; a lista de provas mostra 'X de Y' (total, released, limited) e nada de conteúdo", async () => {
    const f = await env.rpc<any>(USERS.TESTE, "app_question_filters");
    const op = f.exams.find((e: any) => e.id === "staziamed");
    expect(op).toMatchObject({ total: N, released: 20, answered: 1, limited: true, locked: false });
    expect(Object.keys(op).sort()).toEqual(["answered", "id", "kind", "limited", "lock_message", "locked", "released", "semester", "title", "total", "year"]);
    expect((await readable(USERS.TESTE))).not.toContain(retirada);
  });

  it("antes de responder o aluno não vê gabarito, explicação, fontes nem códigos", async () => {
    const q = (await poolAs(USERS.TESTE))[1];
    const v = (await env.sqlAs(USERS.TESTE, `select public.practice_question_view($1) as v`, [q]))[0].v;
    expect(Object.keys(v).sort()).toEqual(["exam", "id", "images", "number", "options", "origin", "area", "code", "preliminary", "statement", "support"].sort());
    for (const o of v.options) expect(Object.keys(o).sort()).toEqual(["id", "text"]);
    expect(await env.sqlAs(USERS.TESTE, `select public.ch_raw_practice_correction_view($1, 'A') as v`, [q]).catch(() => [{ v: null }])).toBeTruthy();
    for (const column of ["correct_option", "options", "sources", "source_quotes", "expected_conduct", "explanations_review"]) {
      await expect(env.sqlAs(USERS.TESTE, `select ${column} from public.questions where id = $1`, [q]), column).rejects.toThrow(/permission denied/);
    }
  });
});

describe("planos pagos, equipe, sem acesso e oficiais", () => {
  it("Pro, Elite, equipe e revisor veem todas; o contador diz limited=false", async () => {
    for (const uid of [USERS.PRO, ELITE, USERS.EDITOR, USERS.ADMIN, USERS.REVISOR_PED]) {
      expect((await poolAs(uid)).length, uid).toBe(N);
      expect(await mine(uid)).toMatchObject({ total: N, released: N, limit: null, limited: false, locked: false });
    }
  });

  it("sem acesso (teste vencido, plano vencido, sem assinatura) recebe zero e o aviso; o total aparece mas fechado", async () => {
    for (const uid of [USERS.TESTE_VENCIDO, USERS.PRO_VENCIDO, USERS.SEM_PLANO]) {
      expect(await poolAs(uid), uid).toEqual([]);
      expect(await readable(uid), uid).toEqual([]);
      expect(await mine(uid), uid).toMatchObject({ total: N, released: 0, locked: true, limit: 0 });
      await expect(env.rpc(uid, "app_start_session", { p_kind: "questoes", p_filters: INEDITAS, p_count: 20 })).rejects.toThrow(/As Questões Inéditas são abertas/);
    }
  });

  it("as oficiais do Inep seguem iguais para todos (1.200 legíveis, sorteio sem inéditas)", async () => {
    for (const uid of [USERS.TESTE, USERS.PRO, USERS.TESTE_VENCIDO, USERS.SEM_PLANO]) {
      expect((await env.sqlAs(uid, `select count(*)::int as n from public.questions where origin = 'official'`))[0].n, uid).toBe(1200);
      const pool = await env.sqlAs<{ n: number }>(uid, `select count(*)::int as n from public.practice_pool('{}'::jsonb) p join public.questions q on q.id = p.question_id where q.origin = 'staziamed'`);
      expect(pool[0].n).toBe(0);
    }
  });
});

describe("administrador define o limite por plano", () => {
  it("só o administrador lê e grava (aluno, editor e visitante barrados)", async () => {
    for (const uid of [USERS.TESTE, USERS.PRO, USERS.EDITOR, USERS.REVISOR_PED]) {
      await expect(env.rpc(uid, "app_admin_ineditas_limits"), uid).rejects.toThrow();
      await expect(setLimit(uid, { trial: 74 }), uid).rejects.toThrow();
    }
    expect((await env.sql(`select max_ineditas from public.ineditas_plan_limits where plan = 'trial'`))[0].max_ineditas).toBe(20);
    // acesso direto à tabela de limites também é fechado
    await expect(env.sqlAs(USERS.TESTE, `select * from public.ineditas_plan_limits`)).rejects.toThrow(/permission denied/);
    await expect(env.sqlAs(USERS.ADMIN, `update public.ineditas_plan_limits set max_ineditas = 999`)).rejects.toThrow(/permission denied/);
  });

  it("lê os três planos; grava com registro de ações; valida os valores", async () => {
    const r = await env.rpc<any>(USERS.ADMIN, "app_admin_ineditas_limits");
    expect(r.published).toBe(N);
    expect(r.plans.map((p: any) => [p.plan, p.limit, p.all])).toEqual([["trial", 20, false], ["pro", null, true], ["elite", null, true]]);
    await expect(setLimit(USERS.ADMIN, {})).rejects.toThrow(/pelo menos um plano/);
    await expect(setLimit(USERS.ADMIN, { basico: 5 })).rejects.toThrow(/Plano desconhecido/);
    await expect(setLimit(USERS.ADMIN, { trial: -1 })).rejects.toThrow(/inteiro de 0 a 100000/);
    await expect(setLimit(USERS.ADMIN, { trial: 1.5 })).rejects.toThrow(/inteiro/);
    await expect(setLimit(USERS.ADMIN, { trial: "vinte" } as any)).rejects.toThrow(/número inteiro ou vazio/);
    await setLimit(USERS.ADMIN, { trial: 30, pro: 40 });
    const log = await env.sql(`select action, details from public.admin_audit_log where action = 'plan.ineditas_limits' order by created_at desc limit 1`);
    expect(log[0].details.from.trial).toBe(20);
    expect(log[0].details.to).toMatchObject({ trial: 30, pro: 40 });
  });

  it("o novo limite vale na hora: teste 30 (sobe: só acrescenta e mantém a respondida), Pro 40, Elite todas", async () => {
    const antes = new Set<string>();
    expect((await poolAs(USERS.TESTE)).length).toBe(30);
    expect((await poolAs(USERS.PRO)).length).toBe(40);
    expect((await poolAs(ELITE)).length).toBe(N);
    expect(await mine(USERS.TESTE)).toMatchObject({ released: 30, answered: 1, limit: 30 });
    void antes;
  });

  it("subir só acrescenta; baixar nunca tira o que já foi respondido", async () => {
    await setLimit(USERS.ADMIN, { trial: 20 });
    const vinte = await poolAs(USERS.TESTE);
    await setLimit(USERS.ADMIN, { trial: 25 });
    const vinteCinco = await poolAs(USERS.TESTE);
    expect(vinte.every((q) => vinteCinco.includes(q))).toBe(true);
    // baixar para 0: só a respondida continua legível; sorteio zerado
    await setLimit(USERS.ADMIN, { trial: 0 });
    expect((await mine(USERS.TESTE))).toMatchObject({ released: 1, answered: 1, limit: 0 });
    expect((await readable(USERS.TESTE)).length).toBe(1);
    // sem nenhuma nova liberada: só a já respondida pode ser revista; "não respondidas" não acha nada
    expect((await env.rpc<any>(USERS.TESTE, "app_start_session", { p_kind: "questoes", p_filters: INEDITAS, p_count: 5 })).count).toBe(1);
    await expect(env.rpc(USERS.TESTE, "app_start_session", { p_kind: "questoes", p_filters: { ...INEDITAS, status: "unanswered" }, p_count: 5 })).rejects.toThrow(/Nenhuma questão encontrada/);
    // todas (nulo) para o teste
    await setLimit(USERS.ADMIN, { trial: null });
    expect((await poolAs(USERS.TESTE)).length).toBe(N);
    await setLimit(USERS.ADMIN, { trial: 20, pro: null });
  });

  it("colar a migração de novo não desfaz o que o administrador configurou", async () => {
    await setLimit(USERS.ADMIN, { trial: 12 });
    const fs = await import("fs");
    const path = await import("path");
    const sql = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003010300_ineditas_por_plano.sql"), "utf8");
    await env.dev.db.exec(sql);
    expect((await env.sql(`select max_ineditas from public.ineditas_plan_limits where plan = 'trial'`))[0].max_ineditas).toBe(12);
    await setLimit(USERS.ADMIN, { trial: 20 });
  });
});
