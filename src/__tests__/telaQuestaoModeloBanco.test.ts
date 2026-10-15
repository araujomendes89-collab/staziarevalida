// @vitest-environment node
/**
 * Migração 10500 (tela de questão no modelo do dono), num Postgres real em memória:
 *  1) o aluno não recebe as fontes das Questões Inéditas na correção;
 *  2) dificuldade 1 a 5 só de cadastro validado pela equipe, só depois de responder num TREINO (nunca em simulado);
 *  3) contexto da dica do Tutor: só enunciado e alternativas, só de questão ainda sem resposta num treino aberto;
 *  4) ENSAIO DE DESFAZER: o arquivo de desfazer devolve o corpo antigo e a migração pode ser aplicada de novo.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertStaziaQuestion, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 120_000 });
const ROOT = path.resolve(__dirname, "../..");
const MIGRACAO = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003010500_tela_questao_modelo.sql"), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003010500_tela_questao_modelo.desfazer.sql"), "utf8");

let env: StaziaEnv;
let INEDITA: string;
let OFICIAL: string;
const QUOTES = [{ passage_id: "p1", source: "FONTE-INTERNA", organ: "ORGAO-INTERNO", version: "2026", page: 3, quote: "trecho interno" }];

beforeAll(async () => {
  env = await openStaziaEnv();
  INEDITA = await insertStaziaQuestion(env, { area: "PEDIATRIA", correct: "C" });
  await env.sql(`update public.questions set source_quotes = $2::jsonb where id = $1`, [INEDITA, JSON.stringify(QUOTES)]);
  OFICIAL = (await env.sql<{ id: string }>(`select id from public.questions where origin = 'official' and status <> 'annulled' order by id limit 1`))[0].id;
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

const start = (uid: string, kind: "questoes" | "simulado", examId: string | null, count = 1) =>
  env.rpc<{ session_id: string }>(uid, "app_start_session", { p_kind: kind, p_filters: examId ? { exam_id: examId } : {}, p_count: count, p_time_limit_seconds: kind === "simulado" ? 3600 : null });
const hint = (uid: string, id: string) => env.sqlAs<{ c: any }>(uid, `select public.app_question_hint_context($1) as c`, [id]).then((r) => r[0].c);
/** A função interna (sem permissão para o app) lida como a equipe: sem trocar de papel, só com a identidade. */
const raw = (id: string) =>
  env.dev.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: USERS.ADMIN })]);
    return (await tx.query<any>(`select public.ch_raw_practice_correction_view($1, 'A') as v`, [id])).rows[0].v;
  });
const difficulty = (uid: string, id: string) => env.sqlAs<{ d: any }>(uid, `select public.app_question_difficulty($1) as d`, [id]).then((r) => r[0].d);

describe("1) fontes das inéditas não saem para o aluno", () => {
  it("a correção da inédita vem sem official_sources e sem sources; a oficial segue com as suas", async () => {
    const { session_id } = await start(USERS.PRO, "questoes", "staziamed");
    const c = await env.rpc<any>(USERS.PRO, "app_answer_question", { p_session_id: session_id, p_question_id: INEDITA, p_option: "A" });
    expect(c.correct_option).toBe("C");
    expect(c.official_sources ?? null).toBeNull();
    expect(c.sources ?? []).toEqual([]);
    expect(JSON.stringify(c)).not.toContain("FONTE-INTERNA");
    expect(JSON.stringify(c)).not.toContain("trecho interno");
    // a equipe segue lendo a tabela direto (a coluna interna continua lá)
    expect((await env.sql(`select source_quotes from public.questions where id = $1`, [INEDITA]))[0].source_quotes).toEqual(QUOTES);
    const oficial = await start(USERS.PRO, "questoes", null);
    const q = (await env.rpc<any>(USERS.PRO, "app_get_session", { p_session_id: oficial.session_id })).questions[0];
    const o = await env.rpc<any>(USERS.PRO, "app_answer_question", { p_session_id: oficial.session_id, p_question_id: q.id, p_option: "A" });
    expect(Array.isArray(o.sources)).toBe(true);
    expect(o.correct_option).toBeTruthy();
  });
});

describe("2) dificuldade validada", () => {
  it("só a equipe grava; valor fora de 1 a 5 e aluno comum são recusados", async () => {
    await expect(env.rpc(USERS.PRO, "app_admin_set_question_difficulty", { p_question_id: OFICIAL, p_level: 3 })).rejects.toThrow(/Só a equipe/);
    await expect(env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: OFICIAL, p_level: 6 })).rejects.toThrow(/1 a 5/);
    await expect(env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: "nao-existe", p_level: 2 })).rejects.toThrow(/não encontrada/);
    expect(await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: OFICIAL, p_level: 4, p_note: "validada na revisão" })).toEqual({ question_id: OFICIAL, level: 4 });
    // o aluno não lê a tabela
    await expect(env.sqlAs(USERS.PRO, `select * from public.question_difficulty_review`)).resolves.toEqual([]);
  });

  it("o aluno só recebe depois de responder num TREINO; simulado não conta; sem validação, nulo", async () => {
    expect(await difficulty(USERS.PRO, OFICIAL)).toBeNull(); // ainda não respondeu
    // simulado: responde a mesma questão e continua sem dificuldade
    const sim = await start(USERS.PRO, "simulado", null, 5);
    const simQs = (await env.rpc<any>(USERS.PRO, "app_get_session", { p_session_id: sim.session_id })).questions.map((q: any) => q.id);
    const target = simQs.includes(OFICIAL) ? OFICIAL : simQs[0];
    await env.sql(`insert into public.question_difficulty_review (question_id, level, validated_by) values ($1, 2, $2) on conflict (question_id) do nothing`, [target, USERS.ADMIN]);
    await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: sim.session_id, p_question_id: target, p_option: "A", p_active_ms: 1000 });
    expect(await difficulty(USERS.PRO, target)).toBeNull();
    // treino com a questão validada: só depois de responder
    await env.sql(`update public.practice_sessions set finished_at = now() where id = $1`, [sim.session_id]);
    const treino = await env.rpc<{ session_id: string }>(USERS.TESTE, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 1, p_time_limit_seconds: null });
    const tq = (await env.rpc<any>(USERS.TESTE, "app_get_session", { p_session_id: treino.session_id })).questions[0].id;
    await env.sql(`insert into public.question_difficulty_review (question_id, level, validated_by) values ($1, 5, $2) on conflict (question_id) do update set level = 5`, [tq, USERS.ADMIN]);
    expect(await difficulty(USERS.TESTE, tq)).toBeNull();
    await env.rpc(USERS.TESTE, "app_answer_question", { p_session_id: treino.session_id, p_question_id: tq, p_option: "A", p_active_ms: 1000 });
    expect(await difficulty(USERS.TESTE, tq)).toEqual({ level: 5 });
    // outra questão sem validação: nulo
    await env.sql(`delete from public.question_difficulty_review where question_id = $1`, [tq]);
    expect(await difficulty(USERS.TESTE, tq)).toBeNull();
    expect(await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: tq, p_level: null })).toEqual({ question_id: tq, level: null });
  });
});

describe("3) contexto da dica do Tutor", () => {
  it("só enunciado e alternativas (nunca gabarito, explicação ou fontes), só de questão sem resposta num treino aberto do aluno", async () => {
    expect(await hint(USERS.PRO, INEDITA)).toBeNull(); // nenhum treino aberto com ela
    const s = await start(USERS.PRO, "questoes", "staziamed", 1);
    const c = await hint(USERS.PRO, INEDITA);
    expect(Object.keys(c).sort()).toEqual(["consent_pending", "entitlement", "options", "statement"]);
    expect(c.options.map((o: any) => Object.keys(o).sort().join())).toEqual(["id,text", "id,text", "id,text", "id,text"]);
    const texto = JSON.stringify(c);
    for (const proibido of ["correct_option", "explanation", "Correta.", "FONTE-INTERNA", "expected_conduct"]) expect(texto).not.toContain(proibido);
    expect(await hint(USERS.TESTE, INEDITA)).toBeNull(); // outro aluno, sem treino com ela
    await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: s.session_id, p_question_id: INEDITA, p_option: "A" });
    expect(await hint(USERS.PRO, INEDITA)).toBeNull(); // depois de responder, nunca
  });

  it("simulado: nenhuma dica; visitante sem login não chama", async () => {
    const sim = await start(USERS.TESTE, "simulado", null, 3);
    const id = (await env.rpc<any>(USERS.TESTE, "app_get_session", { p_session_id: sim.session_id })).questions[0].id;
    expect(await hint(USERS.TESTE, id)).toBeNull();
    await expect(env.sqlAs("anon" as any, `select public.app_question_hint_context($1)`, [id])).rejects.toThrow();
  });
});

describe("4) ensaio de desfazer (com a migração aplicada de novo no fim)", () => {
  it("desfazer devolve o corpo antigo (fontes das inéditas voltam) e apaga o que a 10500 criou; reaplicar funciona", async () => {
    await env.sql(`select 1`);
    await env.dev.db.exec(DESFAZER);
    const gone = await env.sql<{ n: string }>(`select p.proname as n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('app_question_hint_context','app_question_difficulty','app_admin_set_question_difficulty')`);
    expect(gone).toEqual([]);
    expect((await env.sql(`select to_regclass('public.question_difficulty_review') as t`))[0].t).toBeNull();
    const antigo = await raw(INEDITA);
    expect(antigo.official_sources).toEqual(QUOTES);
    await env.dev.db.exec(MIGRACAO);
    const novo = await raw(INEDITA);
    expect(novo.official_sources ?? null).toBeNull();
    expect((await env.sql(`select to_regclass('public.question_difficulty_review') as t`))[0].t).not.toBeNull();
  });
});
