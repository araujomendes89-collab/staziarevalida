// @vitest-environment node
/**
 * Questões StaziaMed — banco do aluno (migração 9801), com a decisão do dono de 2026-10-11: a opção "Questões Inéditas" da lista
 * "Prova / edição" abre para equipe, revisor, plano pago válido E teste grátis válido; teste vencido, plano vencido/cancelado e
 * conta sem assinatura ficam fechados, com aviso em português. Depende da leva 3 (…9700 a …9732) no banco de teste.
 * Funções que não são `app_*` (practice_pool, practice_question_view, …) entram por `sql`/`sqlAs`.
 */
import fs from "fs";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertStaziaQuestion, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

// banco PGlite com as 1.200 oficiais: com a máquina cheia (vários testes em paralelo) 5 s não bastam
vi.setConfig({ testTimeout: 120_000 });

const SUPPORT = {
  type: "TABLE",
  title: "Exames da admissão",
  rows: [
    { label: "Hemoglobina", value: "11 g/dL" },
    { label: "Leucócitos", value: "14.000/mm3" },
  ],
};
const ABERTAS = "As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
const AVISO_TESTE = `Seu teste grátis terminou. ${ABERTAS}`;
const AVISO_PLANO = `Seu plano pago terminou. ${ABERTAS}`;
const AVISO_SEM = ABERTAS;
const ABERTOS = [USERS.PRO, USERS.TESTE, USERS.EDITOR, USERS.ADMIN, USERS.REVISOR_PED] as const;
const FECHADOS: [string, string][] = [
  [USERS.TESTE_VENCIDO, AVISO_TESTE],
  [USERS.PRO_VENCIDO, AVISO_PLANO],
  [USERS.SEM_PLANO, AVISO_SEM],
];

let env: StaziaEnv;
let A: string; // PEDIATRIA, gabarito A, com tabela de apoio
let B: string; // CLINICA_MEDICA, gabarito B
let C: string; // PEDIATRIA, gabarito C
let RETIRADA: string; // CIRURGIA_GERAL, recolhida

beforeAll(async () => {
  env = await openStaziaEnv();
  A = await insertStaziaQuestion(env, { area: "PEDIATRIA", correct: "A", support: SUPPORT });
  B = await insertStaziaQuestion(env, { area: "CLINICA_MEDICA", correct: "B", topic: "Pneumonia adquirida na comunidade" });
  C = await insertStaziaQuestion(env, { area: "PEDIATRIA", correct: "C" });
  RETIRADA = await insertStaziaQuestion(env, { area: "CIRURGIA_GERAL", correct: "D", retired: true });
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

const publishedNow = async () =>
  (await env.sql<{ id: string }>(`select id from public.questions where origin = 'staziamed' and retired_at is null order by id`)).map((r) => r.id);
const poolAs = async (uid: string, filters: object) =>
  (await env.sqlAs<{ question_id: string }>(uid, `select question_id from public.practice_pool($1::jsonb) order by question_id`, [JSON.stringify(filters)])).map((r) => r.question_id);
const sessionIds = async (sessionId: string) =>
  (await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [sessionId]))[0].question_ids;
const startAs = (uid: string, filters: object, count = 200) => env.rpc<{ session_id: string; count: number }>(uid, "app_start_session", { p_kind: "questoes", p_filters: filters, p_count: count });
const INEDITAS = { exam_id: "staziamed" };
const expire = (uid: string) => env.sql(`update public.subscriptions set status = 'canceled' where user_id = $1`, [uid]);
const renew = (uid: string) => env.sql(`update public.subscriptions set status = 'active' where user_id = $1`, [uid]);
const gateAs = async (uid: string) => (await env.sqlAs<{ g: string | null }>(uid, `select public.ineditas_gate() as g`))[0].g;

describe("Origem, prova STAZIAMED e leitura protegida", () => {
  it("o banco guarda a origem, a prova STAZIAMED e recusa StaziaMed fora das regras", async () => {
    const [exam] = await env.sql(`select kind, year, semester, title from public.exams where id = 'staziamed'`);
    expect(exam).toEqual({ kind: "STAZIAMED", year: 2026, semester: null, title: "Questões StaziaMed" });
    expect((await env.sql(`select origin, retired_at, support from public.questions where id = $1`, [A]))[0]).toEqual({ origin: "staziamed", retired_at: null, support: SUPPORT });
    const [official] = await env.sql(`select count(*)::int as n, count(*) filter (where support is not null or retired_at is not null)::int as extras from public.questions where origin = 'official'`);
    expect(official).toEqual({ n: 1200, extras: 0 });
    expect((await env.sql(`select indexname from pg_indexes where schemaname = 'public' and tablename = 'questions' and indexdef ~ '\\(origin\\)'`)).length).toBe(1);

    const [{ id: officialExam }] = await env.sql<{ id: string }>(`select id from public.exams where kind = 'REVALIDA' limit 1`);
    const clone = (id: string, number: number, exam: string, origin: string, over: { inep_intent?: string; sources?: string } = {}) =>
      env.sql(
        `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, origin, inep_intent, sources)
         select $1::text, 'X-' || $1::text, $3::text, $2::int, area, topic, statement, options, correct_option, $4::text, $6::text, coalesce($7::jsonb, sources)
         from public.questions where id = $5`,
        [id, number, exam, origin, A, over.inep_intent ?? null, over.sources ?? null]
      );
    await expect(clone("x_oficial_na_prova_stazia", 900, "staziamed", "official")).rejects.toThrow(/questions_origin_exam_check/);
    await expect(clone("x_stazia_em_prova_oficial", 901, officialExam, "staziamed")).rejects.toThrow(/questions_origin_exam_check/);
    await expect(clone("x_stazia_com_inep", 902, "staziamed", "staziamed", { inep_intent: "Avaliar a conduta" })).rejects.toThrow(/questions_staziamed_no_inep_intent/);
    await expect(clone("x_stazia_com_trecho", 903, "staziamed", "staziamed", { sources: '[{"title":"PCDT","supports":"decisão clínica"}]' })).rejects.toThrow(/questions_staziamed_sources_check/);
    await expect(clone("x_stazia_com_citacao", 904, "staziamed", "staziamed", { sources: '[{"title":"PCDT","quote":"trecho literal"}]' })).rejects.toThrow(/questions_staziamed_sources_check/);
    expect(await env.sql(`select id from public.questions where id like 'x\\_%'`)).toEqual([]);
  });

  it("acesso: equipe, revisor, plano pago válido e TESTE GRÁTIS VÁLIDO leem; teste vencido, plano vencido e sem assinatura não (leitura direta)", async () => {
    const todas = [A, B, C, RETIRADA].sort();
    const direct = async (uid: string) => (await env.sqlAs<{ id: string }>(uid, `select id from public.questions where origin = 'staziamed' order by id`)).map((r) => r.id);
    for (const uid of ABERTOS) expect(await direct(uid), uid).toEqual(todas);
    for (const [uid] of FECHADOS) {
      expect(await direct(uid), uid).toEqual([]);
      expect(await env.sqlAs(uid, `select id from public.questions where id = $1`, [A])).toEqual([]);
      expect(await env.sqlAs(uid, `select id from public.questions where origin = 'staziamed' and search @@ websearch_to_tsquery('portuguese', 'lactente')`)).toEqual([]);
      expect(await env.sqlAs(uid, `select id from public.questions where exam_id = 'staziamed'`)).toEqual([]);
      // as oficiais seguem abertas para qualquer conta logada
      expect((await env.sqlAs(uid, `select count(*)::int as n from public.questions`))[0].n, uid).toBe(1200);
    }
    // as colunas novas são legíveis; o gabarito continua fora do alcance direto
    expect(await env.sqlAs(USERS.TESTE, `select origin, retired_at is not null as retired, support from public.questions where id = $1`, [A])).toEqual([{ origin: "staziamed", retired: false, support: SUPPORT }]);
    for (const column of ["correct_option", "options", "expected_conduct", "inep_intent", "key_finding", "sources", "explanations_review", "comment_review"]) {
      await expect(env.sqlAs(USERS.TESTE, `select ${column} from public.questions where id = $1`, [A]), column).rejects.toThrow(/permission denied/);
    }
  });

  it("has_ineditas e ineditas_gate: uma regra só (a do Planos); has_pro continua sem o teste", async () => {
    const has = async (uid: string) => (await env.sqlAs<{ i: boolean; p: boolean }>(uid, `select public.has_ineditas() as i, public.has_pro() as p`))[0];
    expect(await has(USERS.TESTE)).toEqual({ i: true, p: false }); // teste válido abre as inéditas, mas não as estações Pro
    expect(await has(USERS.PRO)).toEqual({ i: true, p: true });
    expect(await has(USERS.EDITOR)).toEqual({ i: true, p: true });
    expect(await has(USERS.REVISOR_PED)).toEqual({ i: true, p: true });
    for (const [uid, aviso] of FECHADOS) {
      expect((await has(uid)).i, uid).toBe(false);
      expect(await gateAs(uid), uid).toBe(aviso);
    }
    for (const uid of ABERTOS) expect(await gateAs(uid), uid).toBeNull();
    // as funções internas e o gatilho não são chamáveis pelo app
    const open = await env.sql(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('ineditas_user_access', 'ineditas_gate_for', 'question_attempts_ineditas_gate')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
    expect(open).toEqual([]);
    // sem login dá falso/nulo (as telas do aluno montam o plano com estas funções, mesmo sem login)
    expect((await env.sql(`select has_function_privilege('anon', 'public.has_ineditas()', 'execute') as a`))[0].a).toBe(true);
    await env.dev.db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      expect((await tx.query<any>(`select public.has_ineditas() as i, public.ineditas_gate() as g`)).rows[0]).toEqual({ i: false, g: null });
    });
  });

  it("o aluno lendo a tabela de uma StaziaMed não vê trecho de fonte nem a decisão clínica", async () => {
    await expect(env.sqlAs(USERS.PRO, `select sources from public.questions where id = $1`, [A])).rejects.toThrow(/permission denied/);
    await expect(env.sqlAs(USERS.PRO, `select expected_conduct from public.questions where id = $1`, [A])).rejects.toThrow(/permission denied/);
  });

  it("antes de responder: origem, tabela de apoio e a prova STAZIAMED; fechado recebe nulo", async () => {
    const view = async (uid: string, id: string) => (await env.sqlAs(uid, `select public.practice_question_view($1) as v`, [id]))[0].v;
    for (const uid of [USERS.PRO, USERS.TESTE, USERS.EDITOR]) {
      const v = await view(uid, A);
      expect(v, uid).toMatchObject({
        id: A, code: "STZ-0001", area: "PEDIATRIA", origin: "staziamed", support: SUPPORT,
        exam: { id: "staziamed", kind: "STAZIAMED", year: 2026, title: "Questões StaziaMed" },
      });
      expect(v.options).toEqual(["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id} da questão 0001.` })));
      expect(JSON.stringify(v)).not.toMatch(/correct|explanation|Conduta esperada/);
    }
    for (const [uid] of FECHADOS) expect(await view(uid, A), uid).toBeNull();
    expect(await view(USERS.PRO, RETIRADA)).toMatchObject({ origin: "staziamed", support: null }); // recolhida abre (sessão antiga)
    const [{ id: officialId }] = await env.sql<{ id: string }>(`select id from public.questions where origin = 'official' limit 1`);
    for (const [uid] of FECHADOS) expect(await view(uid, officialId), uid).toMatchObject({ origin: "official", support: null });
  });

  it("a correção traz origem e tabela de apoio, só depois de responder e só com acesso", async () => {
    const correction = async (uid: string, id: string, option: string | null) => (await env.sqlAs(uid, `select public.practice_correction_view($1, $2) as v`, [id, option]))[0].v;
    expect(await correction(USERS.PRO, A, "A")).toBeNull();
    expect(await correction(USERS.EDITOR, A, "A")).toMatchObject({ is_correct: true, correct_option: "A", origin: "staziamed", support: SUPPORT });

    const { session_id } = await startAs(USERS.TESTE, { ...INEDITAS, area: "PEDIATRIA" }); // teste grátis válido treina
    const answered = await env.rpc(USERS.TESTE, "app_answer_question", { p_session_id: session_id, p_question_id: A, p_option: "B" });
    expect(answered).toMatchObject({ selected: "B", is_correct: false, correct_option: "A", origin: "staziamed", support: SUPPORT, expected_conduct: "Conduta esperada da questão 0001." });
    expect(await correction(USERS.TESTE, A, "B")).toMatchObject({ origin: "staziamed", support: SUPPORT });
    // o teste vence: a correção fecha, mesmo para quem respondeu
    await env.sql(`update public.subscriptions set trial_ends_at = now() - interval '1 hour' where user_id = $1`, [USERS.TESTE]);
    try {
      expect(await correction(USERS.TESTE, A, "B")).toBeNull();
      expect(await env.sqlAs(USERS.TESTE, `select public.practice_question_view($1) as v`, [A])).toEqual([{ v: null }]);
    } finally {
      await env.sql(`update public.subscriptions set trial_ends_at = now() + interval '5 days' where user_id = $1`, [USERS.TESTE]);
    }
  });
});

describe("Opção Questões Inéditas na lista de provas e no sorteio", () => {
  it("a lista de provas traz 'Questões Inéditas' aberta para quem tem acesso e com locked para quem está fechado", async () => {
    const opcao = async (uid: string) => ((await env.rpc(uid, "app_question_filters", {})).exams as any[]).find((e) => e.id === "staziamed");
    const publicadas = (await publishedNow()).length;
    for (const uid of [USERS.PRO, USERS.TESTE]) {
      expect(await opcao(uid), uid).toEqual({ id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas", total: publicadas, locked: false, lock_message: null });
    }
    for (const [uid, aviso] of FECHADOS) {
      expect(await opcao(uid), uid).toMatchObject({ title: "Questões Inéditas", locked: true, lock_message: aviso });
    }
    // as provas oficiais seguem na lista, na mesma ordem, e o total do filtro é só de oficiais
    const f = await env.rpc(USERS.PRO, "app_question_filters", {});
    expect(f.exams.length).toBeGreaterThan(2);
    expect(f.exams[f.exams.length - 1].id).toBe("staziamed");
    expect(f.total).toBe(1200 - Number((await env.sql(`select count(*)::int as n from public.questions where origin = 'official' and (status = 'annulled' or (needs_image and jsonb_array_length(images) = 0))`))[0].n));
  });

  it("sem inéditas publicadas a opção não aparece", async () => {
    const other = await openStaziaEnv();
    try {
      const f = await other.rpc(USERS.PRO, "app_question_filters", {});
      expect(f.exams.find((e: any) => e.id === "staziamed")).toBeUndefined();
    } finally {
      await other.close();
    }
  }, 600_000);

  it("sorteio: sem prova só oficiais; prova 'staziamed' só com acesso (teste válido inclusive), sem recolhidas; a sessão não mistura", async () => {
    const naoRecolhidas = await publishedNow();
    expect(naoRecolhidas).toEqual(expect.arrayContaining([A, B, C]));
    expect(naoRecolhidas).not.toContain(RETIRADA);

    for (const filters of [{}, { collection: "staziamed" }, { exam_id: "" }]) {
      const pool = await poolAs(USERS.PRO, filters);
      expect(pool.length, JSON.stringify(filters)).toBeGreaterThan(1000);
      expect(pool.filter((id) => id.startsWith("staziamed_q")), JSON.stringify(filters)).toEqual([]);
    }
    for (const uid of [USERS.PRO, USERS.TESTE, USERS.EDITOR, USERS.ADMIN]) expect(await poolAs(uid, INEDITAS), uid).toEqual(naoRecolhidas);
    for (const [uid] of FECHADOS) expect(await poolAs(uid, INEDITAS), uid).toEqual([]);
    expect(await poolAs(USERS.TESTE, { ...INEDITAS, area: "PEDIATRIA" })).toEqual(expect.arrayContaining([A, C]));
    expect(await poolAs(USERS.TESTE, { ...INEDITAS, area: "PEDIATRIA" })).not.toContain(B);
    expect(await poolAs(USERS.PRO, { ...INEDITAS, topic: "Pneumonia adquirida na comunidade" })).toEqual([B]);
    expect(await poolAs(USERS.PRO, { ...INEDITAS, search: "lactente" })).toEqual(expect.arrayContaining([A, B, C]));
    // outra prova oficial nunca traz inédita
    const [{ id: officialExam }] = await env.sql<{ id: string }>(`select id from public.exams where kind = 'REVALIDA' limit 1`);
    expect((await poolAs(USERS.PRO, { exam_id: officialExam })).filter((id) => id.startsWith("staziamed_q"))).toEqual([]);

    for (const uid of [USERS.PRO, USERS.TESTE]) {
      const s = await startAs(uid, INEDITAS, 10);
      expect([...(await sessionIds(s.session_id))].sort(), uid).toEqual(naoRecolhidas);
      const open = await env.rpc(uid, "app_get_session", { p_session_id: s.session_id });
      expect(open).toMatchObject({ collection: "staziamed", locked: false, lock_message: null });
      expect(open.questions.every((q: any) => q.origin === "staziamed" && q.exam.kind === "STAZIAMED")).toBe(true);
      expect(open.questions.find((q: any) => q.id === A).support).toEqual(SUPPORT);
    }
    const comum = await startAs(USERS.TESTE, {}, 30);
    expect((await sessionIds(comum.session_id)).filter((id) => id.startsWith("staziamed_q"))).toEqual([]);
    expect(await env.rpc(USERS.TESTE, "app_get_session", { p_session_id: comum.session_id })).toMatchObject({ collection: "oficiais", locked: false });

    // fechado: recusado com o aviso de cada caso, sem abrir sessão
    for (const [uid, aviso] of FECHADOS) {
      const before = Number((await env.sql(`select count(*)::int as n from public.practice_sessions where user_id = $1`, [uid]))[0].n);
      await expect(startAs(uid, INEDITAS, 10), uid).rejects.toThrow(aviso);
      await expect(env.rpc(uid, "app_start_session", { p_kind: "questoes", p_filters: { ...INEDITAS, area: "PEDIATRIA" }, p_count: 3 }), uid).rejects.toThrow(aviso);
      expect(Number((await env.sql(`select count(*)::int as n from public.practice_sessions where user_id = $1`, [uid]))[0].n)).toBe(before);
      // as questões oficiais seguem abertas
      expect((await startAs(uid, {}, 5)).count, uid).toBe(5);
    }
  });

  it("simulado: as regras da 9730 seguem (teste vencido recusa o simulado; teste válido abre)", async () => {
    await expect(env.rpc(USERS.TESTE_VENCIDO, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 5, p_time_limit_seconds: 600 })).rejects.toThrow(/Seu teste grátis terminou/);
    expect((await env.rpc(USERS.TESTE, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 5, p_time_limit_seconds: 600 })).count).toBe(5);
  });

  it("app_count_questions conta a prova pedida", async () => {
    const count = (uid: string, filters: object) => env.rpc<{ total: number; by_area: Record<string, number> }>(uid, "app_count_questions", { p_filters: filters });
    const naoRecolhidas = await publishedNow();
    const porArea = (await env.sql<{ area: string; n: number }>(`select area::text, count(*)::int as n from public.questions where origin = 'staziamed' and retired_at is null group by area`)).reduce(
      (acc, r) => ({ ...acc, [r.area]: r.n }), {} as Record<string, number>);
    const r = await count(USERS.TESTE, INEDITAS);
    expect(r.total).toBe(naoRecolhidas.length);
    expect(r.by_area).toEqual(porArea);
    const oficiais = Number((await env.sqlAs(USERS.PRO, `select count(*)::int as n from public.practice_pool('{}'::jsonb)`))[0].n);
    expect((await count(USERS.PRO, {})).total).toBe(oficiais);
    expect(await count(USERS.TESTE_VENCIDO, INEDITAS)).toEqual({ total: 0, by_area: {} });
  });

  it("recolhida sai do sorteio, mas continua na sessão antiga de quem respondeu", async () => {
    const R = await insertStaziaQuestion(env, { area: "GINECOLOGIA_OBSTETRICIA", correct: "D", topic: "Pré-eclâmpsia" });
    const { session_id } = await startAs(USERS.PRO, { ...INEDITAS, area: "GINECOLOGIA_OBSTETRICIA" });
    expect(await sessionIds(session_id)).toEqual([R]);
    await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: session_id, p_question_id: R, p_option: "D" });
    await env.sql(`update public.questions set retired_at = now() where id = $1`, [R]);
    expect(await poolAs(USERS.PRO, INEDITAS)).not.toContain(R);
    await expect(startAs(USERS.PRO, { ...INEDITAS, area: "GINECOLOGIA_OBSTETRICIA" })).rejects.toThrow("Nenhuma questão encontrada com esses filtros.");
    const old = await env.rpc(USERS.PRO, "app_get_session", { p_session_id: session_id });
    expect(old).toMatchObject({ collection: "staziamed", locked: false });
    expect(old.questions[0]).toMatchObject({ id: R, origin: "staziamed", selected: "D" });
    expect(old.questions[0].correction).toMatchObject({ is_correct: true, correct_option: "D", origin: "staziamed" });
    expect((await env.sqlAs(USERS.PRO, `select attempts from public.my_topic_stats where topic = 'Pré-eclâmpsia'`))[0].attempts).toBe(1);
  });
});

describe("Acesso que termina", () => {
  it("o acesso termina depois de treinar: a sessão antiga abre com locked, aviso e sem questões; sessão nova recusada", async () => {
    const { session_id } = await startAs(USERS.PRO, INEDITAS);
    const first = (await sessionIds(session_id))[0];
    await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: session_id, p_question_id: first, p_option: "A" });
    await expire(USERS.PRO);
    try {
      const locked = await env.rpc(USERS.PRO, "app_get_session", { p_session_id: session_id });
      expect(locked).toMatchObject({ id: session_id, collection: "staziamed", locked: true, questions: [], lock_message: expect.stringContaining("Seu plano pago terminou.") });
      expect(locked.filters).toEqual(INEDITAS);
      expect(locked.started_at).toBeTruthy();
      await expect(startAs(USERS.PRO, INEDITAS, 10)).rejects.toThrow("Seu plano pago terminou.");
      expect(await poolAs(USERS.PRO, INEDITAS)).toEqual([]);
      expect((await startAs(USERS.PRO, {}, 5)).count).toBe(5);
    } finally {
      await renew(USERS.PRO);
    }
    const back = await env.rpc(USERS.PRO, "app_get_session", { p_session_id: session_id });
    expect(back).toMatchObject({ locked: false });
    expect(back.questions.length).toBeGreaterThan(0);
  });

  it("teste grátis que vence depois de treinar: mesma regra, com o aviso do teste", async () => {
    const { session_id } = await startAs(USERS.TESTE, INEDITAS);
    await env.sql(`update public.subscriptions set trial_ends_at = now() - interval '1 minute' where user_id = $1`, [USERS.TESTE]);
    try {
      expect(await env.rpc(USERS.TESTE, "app_get_session", { p_session_id: session_id })).toMatchObject({ locked: true, questions: [], lock_message: AVISO_TESTE });
      await expect(startAs(USERS.TESTE, INEDITAS, 5)).rejects.toThrow("Seu teste grátis terminou.");
    } finally {
      await env.sql(`update public.subscriptions set trial_ends_at = now() + interval '5 days' where user_id = $1`, [USERS.TESTE]);
    }
  });

  it("acesso vencido: os números do aluno são os mesmos em toda tela, sem mostrar questões novas", async () => {
    await insertStaziaQuestion(env, { area: "PEDIATRIA", correct: "D" });
    const stazia = await startAs(USERS.PRO, { ...INEDITAS, area: "PEDIATRIA" });
    const [x, y, branco] = await sessionIds(stazia.session_id);
    expect(branco).toBeTruthy();
    const certa = (await env.sql<{ correct_option: string }>(`select correct_option from public.questions where id = $1`, [x]))[0].correct_option;
    const errada = (await env.sql<{ correct_option: string }>(`select correct_option from public.questions where id = $1`, [y]))[0].correct_option === "A" ? "B" : "A";
    await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: stazia.session_id, p_question_id: x, p_option: certa });
    await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: stazia.session_id, p_question_id: y, p_option: errada });
    await env.rpc(USERS.PRO, "app_finish_session", { p_session_id: stazia.session_id });
    const nova = await insertStaziaQuestion(env, { area: "PEDIATRIA", correct: "B" });

    const telas = async () => ({
      desempenho: await env.rpc(USERS.PRO, "app_performance", {}),
      caderno: await env.rpc(USERS.PRO, "app_error_notebook", {}),
      porArea: await env.sqlAs(USERS.PRO, `select * from public.my_area_stats order by area`),
      porTema: await env.sqlAs(USERS.PRO, `select area, topic, attempts, correct, accuracy from public.my_topic_stats order by area, topic`),
      cadernoVisao: await env.sqlAs(USERS.PRO, `select question_id, status, wrong_count from public.my_error_notebook order by question_id`),
      placar: (await env.sqlAs(USERS.PRO, `select public.practice_result($1) as r`, [stazia.session_id]))[0].r,
      historico: await env.rpc(USERS.PRO, "app_recent_sessions", { p_kind: "questoes", p_limit: 50 }),
    });
    const antes = await telas();
    expect(antes.desempenho.attempts).toBeGreaterThanOrEqual(2);
    expect(antes.placar).toMatchObject({ total: 3, answered: 2, correct: 1 });
    expect(antes.cadernoVisao.map((r: any) => r.question_id)).toContain(y);

    await expire(USERS.PRO);
    try {
      expect(await telas()).toEqual(antes);
      expect(await env.sqlAs(USERS.PRO, `select id from public.questions where id = $1`, [nova])).toEqual([]);
      expect((await env.sqlAs(USERS.PRO, `select id from public.questions where id = $1`, [x])).length).toBe(1);
      expect(await env.sqlAs(USERS.PRO, `select public.practice_question_view($1) as v`, [x])).toEqual([{ v: null }]);
      await expect(env.sqlAs(USERS.PRO, `insert into public.question_attempts (question_id, selected_option) values ($1, 'A')`, [nova])).rejects.toThrow("Seu plano pago terminou.");
    } finally {
      await renew(USERS.PRO);
    }
    expect(await telas()).toEqual(antes);
  });

  it("quem está fechado não abre a exceção do histórico gravando uma resposta à mão; o teste válido responde", async () => {
    for (const [uid, aviso] of FECHADOS) {
      await expect(env.sqlAs(uid, `insert into public.question_attempts (question_id, selected_option) values ($1, 'A')`, [B]), uid).rejects.toThrow(aviso);
      expect(await env.sqlAs(uid, `select id from public.questions where id = $1`, [B])).toEqual([]);
      expect(await env.sql(`select 1 from public.question_attempts where user_id = $1 and question_id = $2`, [uid, B])).toEqual([]);
    }
    await env.sqlAs(USERS.TESTE, `insert into public.question_attempts (question_id, selected_option) values ($1, 'A')`, [B]);
    const [{ id: officialId }] = await env.sql<{ id: string }>(`select id from public.questions where origin = 'official' limit 1`);
    await env.sqlAs(USERS.TESTE_VENCIDO, `insert into public.question_attempts (question_id, selected_option) values ($1, 'A')`, [officialId]);
    expect(Number((await env.sql(`select count(*)::int as n from public.question_attempts where user_id = $1`, [USERS.TESTE_VENCIDO]))[0].n)).toBe(1);
  });
});

describe("Migração", () => {
  it("pode ser colada de novo (duas vezes) sem estragar nada; sem a leva 3 ela recusa com aviso", async () => {
    const text = fs.readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261003009801_questoes_staziamed_aluno.sql", import.meta.url)), "utf8");
    const snapshot = async () =>
      (await env.sql(`
        select
          (select md5(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text))
             from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('has_ineditas', 'ineditas_gate', 'ineditas_gate_for', 'ineditas_option', 'ineditas_user_access', 'practice_pool', 'practice_question_view',
                                'ch_raw_practice_correction_view', 'practice_result', 'app_start_session', 'app_get_session', 'app_question_filters', 'question_attempts_ineditas_gate')) as functions,
          (select md5(string_agg(polname || pg_get_expr(polqual, polrelid), E'\n' order by polname)) from pg_policy where polrelid = 'public.questions'::regclass) as policies,
          (select md5(string_agg(conname || pg_get_constraintdef(oid), E'\n' order by conname)) from pg_constraint where conrelid in ('public.questions'::regclass, 'public.exams'::regclass)) as constraints,
          (select count(*)::int from pg_trigger where tgrelid = 'public.question_attempts'::regclass and not tgisinternal) as triggers,
          (select count(*)::int from public.exams) as exams,
          (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'questions') as columns`))[0];
    const before = await snapshot();
    await env.dev.db.exec(text);
    await env.dev.db.exec(text);
    // a 9930 (carga das provas) redefine practice_question_view por cima desta: depois de colar a 9801 de novo, cola-se a 9930
    await env.dev.db.exec(fs.readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261003009930_gabarito_preliminar_aviso.sql", import.meta.url)), "utf8"));
    expect(await snapshot()).toEqual(before);
    // as funções de serviço continuam fechadas e o app só chama as três que devem ser chamadas
    expect(text).toContain("Cole antes as migrações da leva 3");
  });
});
