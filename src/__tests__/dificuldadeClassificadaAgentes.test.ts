// @vitest-environment node
/**
 * Migrações 012600/012601 (dificuldade na escala do Inep), num Postgres real em memória:
 *  - integridade: nível = faixa do Inep pelo p (Enade, Relatório Síntese 1.5.1: >=0,86 / 0,61 / 0,41 / 0,16 / <=0,15),
 *    faixa curta coerente, medida x estimada (n, b, bisserial, intervalo), origem e confiança;
 *  - RLS: só equipe lê; aluno vê lista vazia e não grava; resumo só para a equipe;
 *  - question_difficulty_effective: validada da equipe > medida do Inep > estimada pela rubrica; não exposta ao aluno;
 *  - app_question_difficulty (o que o aluno vê) segue só com a validada;
 *  - carga 012601: uma linha por questão existente, idempotente, sem tocar na validação humana; desfazer e reaplicar.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 120_000 });
const ROOT = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MIGRACAO = ler("supabase/migrations/20261003012600_dificuldade_classificada_agentes.sql");
const DESFAZER = ler("supabase/desfazer/20261003012600_dificuldade_classificada_agentes.desfazer.sql");
const DADOS = ler("supabase/migrations/20261003012601_dificuldade_classificada_agentes_dados.sql");
const DESFAZER_DADOS = ler("supabase/desfazer/20261003012601_dificuldade_classificada_agentes_dados.desfazer.sql");
const IDS_DADOS = [...DADOS.matchAll(/^\s+\('([^']+)', \d::smallint/gm)].map((m) => m[1]);
const FAIXA = ["muito_facil", "facil", "medio", "dificil", "muito_dificil"];
const CURTA = (n: number) => (n <= 2 ? "facil" : n === 3 ? "media" : "dificil");

let env: StaziaEnv;
let ids: string[];

/** Grava uma linha "estimada" coerente (ou com os campos trocados por `over`). */
const estimada = (id: string, level: number, p: number, over: Record<string, unknown> = {}) => {
  const v = { level, inep_band: FAIXA[level - 1], band: CURTA(level), p, p_low: Math.max(0, p - 0.1), p_high: Math.min(1, p + 0.1),
              method: "estimada", source: "rubrica de teste", n_respondents: null, irt_model: null, irt_b: null,
              point_biserial: null, confidence: "media", origin: "classificada_agentes", ...over };
  return env.sql(
    `insert into public.question_difficulty_agents (question_id, level, inep_band, band, p, p_low, p_high, method, source,
       n_respondents, irt_model, irt_b, point_biserial, confidence, origin)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     on conflict (question_id) do update set level = excluded.level, inep_band = excluded.inep_band, band = excluded.band,
       p = excluded.p, p_low = excluded.p_low, p_high = excluded.p_high, method = excluded.method, source = excluded.source,
       n_respondents = excluded.n_respondents, irt_model = excluded.irt_model, irt_b = excluded.irt_b,
       point_biserial = excluded.point_biserial, confidence = excluded.confidence, origin = excluded.origin`,
    [id, v.level, v.inep_band, v.band, v.p, v.p_low, v.p_high, v.method, v.source, v.n_respondents, v.irt_model, v.irt_b,
     v.point_biserial, v.confidence, v.origin]
  );
};
const medida = (id: string, level: number, p: number, over: Record<string, unknown> = {}) =>
  estimada(id, level, p, { method: "medida", p_low: null, p_high: null, n_respondents: 39256, irt_model: "rasch", irt_b: 0.1,
                           point_biserial: 0.35, confidence: "alta", source: "microdados de teste", ...over });

beforeAll(async () => {
  env = await openStaziaEnv();
  ids = (await env.sql<{ id: string }>(
    `select id from public.questions where origin = 'official' and status = 'valid' order by id limit 3`
  )).map((r) => r.id);
}, 600_000);

afterAll(async () => {
  await env?.close();
}, 60_000);

describe("integridade: nível = faixa do Inep pelo p", () => {
  it("cortes do Enade (p arredondado a 2 casas) e faixa curta do nivelamento", async () => {
    const casos: Array<[number, number]> = [[0.86, 1], [0.855, 1], [0.85, 2], [0.61, 2], [0.605, 2], [0.6, 3], [0.41, 3],
      [0.4, 4], [0.16, 4], [0.155, 4], [0.15, 5], [0.02, 5]];
    for (const [p, nivel] of casos) {
      await estimada(ids[0], nivel, p, { p_low: 0, p_high: 1 });
      const [r] = await env.sql<any>(`select level, inep_band, band from public.question_difficulty_agents where question_id = $1`, [ids[0]]);
      expect([p, r.level, r.inep_band, r.band]).toEqual([p, nivel, FAIXA[nivel - 1], CURTA(nivel)]);
    }
  });

  it("recusa nível que não bate com o p, faixa trocada e faixa curta trocada", async () => {
    await expect(estimada(ids[1], 3, 0.9)).rejects.toThrow();
    await expect(estimada(ids[1], 2, 0.7, { inep_band: "medio" })).rejects.toThrow();
    await expect(estimada(ids[1], 2, 0.7, { band: "media" })).rejects.toThrow();
    await expect(estimada(ids[1], 6, 0.01)).rejects.toThrow();
    await expect(estimada(ids[1], 1, 1.2)).rejects.toThrow();
  });

  it("medida exige n de respondentes e não leva intervalo; estimada exige intervalo e não leva n, b nem bisserial", async () => {
    await expect(medida(ids[1], 3, 0.5, { n_respondents: null })).rejects.toThrow();
    await expect(medida(ids[1], 3, 0.5, { p_low: 0.4, p_high: 0.6 })).rejects.toThrow();
    await expect(estimada(ids[1], 3, 0.5, { p_low: null })).rejects.toThrow();
    await expect(estimada(ids[1], 3, 0.5, { p_low: 0.55, p_high: 0.6 })).rejects.toThrow();
    await expect(estimada(ids[1], 3, 0.5, { irt_model: "rasch", irt_b: 0.2 })).rejects.toThrow();
    await expect(estimada(ids[1], 3, 0.5, { n_respondents: 10 })).rejects.toThrow();
    await expect(medida(ids[1], 3, 0.5, { irt_model: null })).rejects.toThrow(); // b sem modelo
    await expect(medida(ids[1], 3, 0.5, { irt_model: "3pl" })).rejects.toThrow(); // o Inep usa Rasch
  });

  it("origem diferente de 'classificada_agentes' e confiança inválida são recusadas", async () => {
    await expect(estimada(ids[1], 3, 0.5, { origin: "validada" })).rejects.toThrow();
    await expect(estimada(ids[1], 3, 0.5, { confidence: "total" })).rejects.toThrow();
    await medida(ids[1], 3, 0.5);
    const [r] = await env.sql<any>(`select method, irt_model, n_respondents from public.question_difficulty_agents where question_id = $1`, [ids[1]]);
    expect(r).toEqual({ method: "medida", irt_model: "rasch", n_respondents: 39256 });
  });
});

describe("RLS e permissões", () => {
  it("aluno lê lista vazia; ADMIN e EDITOR leem", async () => {
    await medida(ids[0], 4, 0.3);
    expect(await env.sqlAs(USERS.PRO, `select * from public.question_difficulty_agents where question_id = $1`, [ids[0]])).toEqual([]);
    for (const u of [USERS.ADMIN, USERS.EDITOR]) {
      const r = await env.sqlAs<any>(u, `select level, method from public.question_difficulty_agents where question_id = $1`, [ids[0]]);
      expect(r).toEqual([{ level: 4, method: "medida" }]);
    }
  });

  it("aluno não grava na tabela", async () => {
    await expect(env.sqlAs(USERS.PRO,
      `insert into public.question_difficulty_agents (question_id, level, inep_band, band, p, p_low, p_high, method, source)
       values ($1, 3, 'medio', 'media', 0.5, 0.4, 0.6, 'estimada', 'aluno')`, [ids[2]])).rejects.toThrow();
  });

  it("resumo só para a equipe, com origem medida/estimada e faixa do Inep", async () => {
    await expect(env.rpc(USERS.PRO, "app_admin_difficulty_agents_summary")).rejects.toThrow();
    await expect(env.sqlAs("00000000-0000-4000-8000-000000000000", `select public.app_admin_difficulty_agents_summary()`)).rejects.toThrow();
    const s = await env.rpc<{ total: number; rows: any[] }>(USERS.ADMIN, "app_admin_difficulty_agents_summary");
    expect(s.total).toBeGreaterThanOrEqual(1);
    expect(s.rows.some((r) => r.source === "medida_inep" && r.inep_band === "dificil")).toBe(true);
    for (const r of s.rows) expect(["validada_equipe", "medida_inep", "estimada_rubrica", "sem_dificuldade"]).toContain(r.source);
  });
});

describe("question_difficulty_effective: validada > medida > estimada", () => {
  const ef = (id: string) => env.sql<any>(`select level, band, source, source_order, p::float8 as p, method from public.question_difficulty_effective($1)`, [id]);

  it("sem nada, zero linhas; estimada vem com ordem 3; medida com ordem 2", async () => {
    await env.sql(`delete from public.question_difficulty_agents where question_id = $1`, [ids[2]]);
    await env.sql(`delete from public.question_difficulty_review where question_id = $1`, [ids[2]]);
    expect(await ef(ids[2])).toEqual([]);
    await estimada(ids[2], 2, 0.7);
    expect(await ef(ids[2])).toEqual([{ level: 2, band: "facil", source: "estimada_rubrica", source_order: 3, p: 0.7, method: "estimada" }]);
    await medida(ids[2], 4, 0.25);
    expect(await ef(ids[2])).toEqual([{ level: 4, band: "dificil", source: "medida_inep", source_order: 2, p: 0.25, method: "medida" }]);
  });

  it("com a validada da equipe, só ela aparece, e a tabela dos agentes nunca altera a validação", async () => {
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: ids[2], p_level: 1 });
    const antes = await env.sql(`select * from public.question_difficulty_review where question_id = $1`, [ids[2]]);
    expect(await ef(ids[2])).toEqual([{ level: 1, band: "facil", source: "validada_equipe", source_order: 1, p: null, method: null }]);
    await medida(ids[2], 5, 0.1);
    expect(await env.sql(`select * from public.question_difficulty_review where question_id = $1`, [ids[2]])).toEqual(antes);
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: ids[2], p_level: null });
  });

  it("aluno não executa a função interna", async () => {
    await expect(env.sqlAs(USERS.PRO, `select * from public.question_difficulty_effective($1)`, [ids[0]])).rejects.toThrow();
  });
});

describe("app_question_difficulty (visão do aluno)", () => {
  it("após responder em treino, o aluno não vê a dificuldade do Inep/rubrica; só a validada", async () => {
    const difficulty = (uid: string, id: string) =>
      env.sqlAs<{ d: any }>(uid, `select public.app_question_difficulty($1) as d`, [id]).then((r) => r[0].d);
    const treino = await env.rpc<{ session_id: string }>(USERS.TESTE, "app_start_session", {
      p_kind: "questoes", p_filters: {}, p_count: 1, p_time_limit_seconds: null,
    });
    const tq = (await env.rpc<any>(USERS.TESTE, "app_get_session", { p_session_id: treino.session_id })).questions[0].id;
    await env.sql(`delete from public.question_difficulty_review where question_id = $1`, [tq]);
    await medida(tq, 4, 0.3);
    await env.rpc(USERS.TESTE, "app_answer_question", { p_session_id: treino.session_id, p_question_id: tq, p_option: "A", p_active_ms: 1000 });
    expect(await difficulty(USERS.TESTE, tq)).toBeNull();
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: tq, p_level: 2 });
    expect(await difficulty(USERS.TESTE, tq)).toEqual({ level: 2 });
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: tq, p_level: null });
  });
});

describe("carga de dados 012601", () => {
  const snapshotReview = () => env.sql(`select question_id, level, validated_by::text as v from public.question_difficulty_review order by question_id`);
  const contar = async () => Number((await env.sql<{ n: number }>(`select count(*)::int as n from public.question_difficulty_agents`))[0].n);

  it("uma linha por questão, sem repetição; grava só as que existem; medidas com n, b Rasch e bisserial", async () => {
    expect(IDS_DADOS.length).toBeGreaterThan(1000);
    expect(new Set(IDS_DADOS).size).toBe(IDS_DADOS.length);
    expect(DADOS).not.toMatch(/question_difficulty_review/);
    const antes = await snapshotReview();
    await env.dev.db.exec(DADOS);
    const existentes = Number((await env.sql<{ n: number }>(`select count(*)::int as n from public.questions where id = any($1::text[])`, [IDS_DADOS]))[0].n);
    expect(existentes).toBeGreaterThan(0);
    const daCarga = await env.sql<{ method: string; n: number; sem_b: number }>(
      `select method, count(*)::int as n, count(*) filter (where irt_b is null)::int as sem_b
       from public.question_difficulty_agents where question_id = any($1::text[]) group by method order by method`, [IDS_DADOS]);
    expect(daCarga.reduce((s, r) => s + r.n, 0)).toBe(existentes);
    const med = daCarga.find((r) => r.method === "medida");
    if (med) expect(med.sem_b).toBe(0);
    expect(await snapshotReview()).toEqual(antes);
  });

  it("rodar a carga de novo não muda nada (idempotente)", async () => {
    const q = `select question_id, level, p::text, method, source, reason from public.question_difficulty_agents order by question_id`;
    const antes = await env.sql(q);
    await env.dev.db.exec(DADOS);
    expect(await env.sql(q)).toEqual(antes);
  });

  it("desfazer da carga apaga só as linhas (a tabela fica) e reaplicar restaura", async () => {
    const total = await contar();
    const antes = await snapshotReview();
    await env.dev.db.exec(DESFAZER_DADOS);
    expect(await contar()).toBe(0);
    expect((await env.sql(`select to_regclass('public.question_difficulty_agents') as t`))[0].t).not.toBeNull();
    expect(await snapshotReview()).toEqual(antes);
    await env.dev.db.exec(DADOS);
    expect(await contar()).toBeGreaterThan(0);
    expect(await contar()).toBeLessThanOrEqual(total);
  });
});

describe("ensaio de desfazer da 012600 (reaplica no fim)", () => {
  it("apaga a tabela e as 2 funções, preserva a validação humana, e reaplicar funciona", async () => {
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: ids[0], p_level: 3 });
    const antes = await env.sql(`select * from public.question_difficulty_review order by question_id`);
    await env.dev.db.exec(DESFAZER);
    expect((await env.sql(`select to_regclass('public.question_difficulty_agents') as t`))[0].t).toBeNull();
    const fns = await env.sql(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('question_difficulty_effective', 'app_admin_difficulty_agents_summary')`);
    expect(fns).toEqual([]);
    expect(await env.sql(`select * from public.question_difficulty_review order by question_id`)).toEqual(antes);
    await env.dev.db.exec(MIGRACAO);
    await env.dev.db.exec(DADOS);
    expect((await env.sql(`select to_regclass('public.question_difficulty_agents') as t`))[0].t).not.toBeNull();
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: ids[0], p_level: null });
  });
});
