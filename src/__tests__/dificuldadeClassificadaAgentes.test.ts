// @vitest-environment node
/**
 * Migração 012600 (dificuldade classificada por agentes), num Postgres real em memória:
 *  - a tabela começa vazia (ou >= 0 se houver carga de dados);
 *  - integridade e restrições: nível 1 a 5, coerência nível x faixa, origem e confiança;
 *  - RLS: só equipe lê; aluno vê lista vazia e não consegue gravar;
 *  - app_admin_difficulty_agents_summary: só equipe executa;
 *  - question_difficulty_effective: resolução de precedência (equipe > agentes > vazia),
 *    não exposta para alunos, sem alterar a validação humana;
 *  - app_question_difficulty: aluno após responder em treino segue sem ver a classificação de agentes;
 *  - ensaio de desfazer: apaga tabela e funções, preserva question_difficulty_review e reaplica com sucesso.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 120_000 });
const ROOT = path.resolve(__dirname, "../..");
const MIGRACAO = fs.readFileSync(
  path.join(ROOT, "supabase/migrations/20261003012600_dificuldade_classificada_agentes.sql"),
  "utf8"
);
const DESFAZER = fs.readFileSync(
  path.join(ROOT, "supabase/desfazer/20261003012600_dificuldade_classificada_agentes.desfazer.sql"),
  "utf8"
);

const DADOS = fs.readFileSync(
  path.join(ROOT, "supabase/migrations/20261003012601_dificuldade_classificada_agentes_dados.sql"),
  "utf8"
);
const DESFAZER_DADOS = fs.readFileSync(
  path.join(ROOT, "supabase/desfazer/20261003012601_dificuldade_classificada_agentes_dados.desfazer.sql"),
  "utf8"
);
const IDS_DADOS = [...DADOS.matchAll(/^\s+\('([^']+)', \d::smallint/gm)].map((m) => m[1]);

let env: StaziaEnv;
let ids: string[];

beforeAll(async () => {
  env = await openStaziaEnv();
  ids = (
    await env.sql<{ id: string }>(
      `select id from public.questions where origin = 'official' and status = 'valid' order by id limit 3`
    )
  ).map((r) => r.id);
}, 600_000);

afterAll(async () => {
  await env?.close();
}, 60_000);

describe("tabela question_difficulty_agents e integridade de dados", () => {
  it("a tabela question_difficulty_agents começa disponível com contagem maior ou igual a zero", async () => {
    const rows = await env.sql<{ count: number }>(
      `select count(*)::int as count from public.question_difficulty_agents`
    );
    expect(rows[0].count).toBeGreaterThanOrEqual(0);
  });

  it("insert pelo dono do banco com nível 4 e faixa dificil funciona", async () => {
    await env.sql(`delete from public.question_difficulty_agents where question_id = $1`, [ids[0]]);
    await env.sql(
      `insert into public.question_difficulty_agents (question_id, level, band, reason, confidence)
       values ($1, 4, 'dificil', 'caso clínico complexo', 'alta')`,
      [ids[0]]
    );

    const inserted = await env.sql<any>(
      `select * from public.question_difficulty_agents where question_id = $1`,
      [ids[0]]
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0].level).toBe(4);
    expect(inserted[0].band).toBe("dificil");
    expect(inserted[0].reason).toBe("caso clínico complexo");
    expect(inserted[0].confidence).toBe("alta");
    expect(inserted[0].origin).toBe("classificada_agentes");
  });

  it("nível 4 com faixa facil é recusado pelo check de coerência", async () => {
    await expect(
      env.sql(
        `insert into public.question_difficulty_agents (question_id, level, band) values ($1, 4, 'facil')`,
        [ids[1]]
      )
    ).rejects.toThrow();
  });

  it("nível 6 e nível 0 são recusados pelo check de nível", async () => {
    await expect(
      env.sql(
        `insert into public.question_difficulty_agents (question_id, level, band) values ($1, 6, 'dificil')`,
        [ids[1]]
      )
    ).rejects.toThrow();

    await expect(
      env.sql(
        `insert into public.question_difficulty_agents (question_id, level, band) values ($1, 0, 'facil')`,
        [ids[1]]
      )
    ).rejects.toThrow();
  });

  it("origem diferente de 'classificada_agentes' é recusada", async () => {
    await expect(
      env.sql(
        `insert into public.question_difficulty_agents (question_id, level, band, origin)
         values ($1, 3, 'media', 'outra_origem')`,
        [ids[1]]
      )
    ).rejects.toThrow();
  });

  it("confiança inválida é recusada", async () => {
    await expect(
      env.sql(
        `insert into public.question_difficulty_agents (question_id, level, band, confidence)
         values ($1, 3, 'media', 'invalida')`,
        [ids[1]]
      )
    ).rejects.toThrow();
  });
});

describe("RLS e permissões da tabela e resumo de agentes", () => {
  it("aluno lendo pela sqlAs recebe lista vazia; ADMIN e EDITOR conseguem ler", async () => {
    await env.sql(`delete from public.question_difficulty_agents where question_id = $1`, [ids[0]]);
    await env.sql(
      `insert into public.question_difficulty_agents (question_id, level, band) values ($1, 4, 'dificil')`,
      [ids[0]]
    );

    // Aluno recebe lista vazia por RLS
    const alunoRows = await env.sqlAs(
      USERS.PRO,
      `select * from public.question_difficulty_agents where question_id = $1`,
      [ids[0]]
    );
    expect(alunoRows).toEqual([]);

    // ADMIN lê os dados
    const adminRows = await env.sqlAs<any>(
      USERS.ADMIN,
      `select * from public.question_difficulty_agents where question_id = $1`,
      [ids[0]]
    );
    expect(adminRows).toHaveLength(1);
    expect(adminRows[0].question_id).toBe(ids[0]);
    expect(adminRows[0].level).toBe(4);

    // EDITOR lê os dados
    const editorRows = await env.sqlAs<any>(
      USERS.EDITOR,
      `select * from public.question_difficulty_agents where question_id = $1`,
      [ids[0]]
    );
    expect(editorRows).toHaveLength(1);
    expect(editorRows[0].question_id).toBe(ids[0]);
  });

  it("aluno não consegue gravar na tabela", async () => {
    await expect(
      env.sqlAs(
        USERS.PRO,
        `insert into public.question_difficulty_agents (question_id, level, band) values ($1, 3, 'media')`,
        [ids[1]]
      )
    ).rejects.toThrow();
  });

  it("aluno e anônimo não executam app_admin_difficulty_agents_summary; ADMIN executa e recebe total e rows", async () => {
    // Aluno é barrado por assert_staff
    await expect(
      env.sqlAs(USERS.PRO, `select public.app_admin_difficulty_agents_summary()`)
    ).rejects.toThrow();
    await expect(
      env.rpc(USERS.PRO, "app_admin_difficulty_agents_summary")
    ).rejects.toThrow();

    // Anônimo é barrado por permissão revogada
    await expect(
      env.sqlAs(
        "00000000-0000-4000-8000-000000000000",
        `select public.app_admin_difficulty_agents_summary()`
      )
    ).rejects.toThrow();

    // ADMIN executa e recebe total numérico e lista de linhas
    const summary = await env.rpc<{ total: number; rows: any[] }>(
      USERS.ADMIN,
      "app_admin_difficulty_agents_summary"
    );
    expect(typeof summary.total).toBe("number");
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(summary.rows)).toBe(true);
  });
});

describe("question_difficulty_effective", () => {
  it("sem cadastro, devolve zero linhas", async () => {
    await env.sql(`delete from public.question_difficulty_agents where question_id = $1`, [ids[1]]);
    await env.sql(`delete from public.question_difficulty_review where question_id = $1`, [ids[1]]);

    const rows = await env.sql(
      `select * from public.question_difficulty_effective($1)`,
      [ids[1]]
    );
    expect(rows).toHaveLength(0);
  });

  it("só com agentes, devolve source 'classificada_agentes' e source_order 2", async () => {
    await env.sql(`delete from public.question_difficulty_agents where question_id = $1`, [ids[1]]);
    await env.sql(`delete from public.question_difficulty_review where question_id = $1`, [ids[1]]);

    await env.sql(
      `insert into public.question_difficulty_agents (question_id, level, band) values ($1, 2, 'facil')`,
      [ids[1]]
    );

    const rows = await env.sql<any>(
      `select * from public.question_difficulty_effective($1)`,
      [ids[1]]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      level: 2,
      band: "facil",
      source: "classificada_agentes",
      source_order: 2,
    });
  });

  it("com validação da equipe, devolve source 'validada_equipe' e a linha dos agentes não aparece", async () => {
    // Garante que question_difficulty_agents tem registro
    await env.sql(
      `insert into public.question_difficulty_agents (question_id, level, band)
       values ($1, 2, 'facil')
       on conflict (question_id) do update set level = 2, band = 'facil'`,
      [ids[1]]
    );

    // Equipe valida com nível 5 (faixa dificil)
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", {
      p_question_id: ids[1],
      p_level: 5,
      p_note: "validada pelo administrador",
    });

    const rows = await env.sql<any>(
      `select * from public.question_difficulty_effective($1)`,
      [ids[1]]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      level: 5,
      band: "dificil",
      source: "validada_equipe",
      source_order: 1,
    });
  });

  it("a tabela question_difficulty_review nunca é alterada por modificações na tabela de agentes", async () => {
    const reviewBefore = await env.sql<any>(
      `select question_id, level, note, validated_by from public.question_difficulty_review where question_id = $1`,
      [ids[1]]
    );
    expect(reviewBefore).toHaveLength(1);
    expect(reviewBefore[0].level).toBe(5);

    // Atualiza a tabela de agentes
    await env.sql(
      `update public.question_difficulty_agents set level = 1, band = 'facil' where question_id = $1`,
      [ids[1]]
    );

    const reviewAfter = await env.sql<any>(
      `select question_id, level, note, validated_by from public.question_difficulty_review where question_id = $1`,
      [ids[1]]
    );
    expect(reviewAfter).toEqual(reviewBefore);
  });

  it("aluno não tem permissão para executar question_difficulty_effective", async () => {
    await expect(
      env.sqlAs(USERS.PRO, `select * from public.question_difficulty_effective($1)`, [ids[1]])
    ).rejects.toThrow();
  });
});

describe("app_question_difficulty (visão do aluno)", () => {
  it("aluno que respondeu em treino não recebe nível quando só há linha dos agentes; recebe quando validada", async () => {
    const difficulty = (uid: string, id: string) =>
      env.sqlAs<{ d: any }>(uid, `select public.app_question_difficulty($1) as d`, [id]).then((r) => r[0].d);
    // treino real (mesmo fluxo da tela): abre a sessão, pega a questão, responde
    const treino = await env.rpc<{ session_id: string }>(USERS.TESTE, "app_start_session", {
      p_kind: "questoes", p_filters: {}, p_count: 1, p_time_limit_seconds: null,
    });
    const tq = (await env.rpc<any>(USERS.TESTE, "app_get_session", { p_session_id: treino.session_id })).questions[0].id;
    await env.sql(`delete from public.question_difficulty_review where question_id = $1`, [tq]);
    await env.sql(
      `insert into public.question_difficulty_agents (question_id, level, band, reason)
       values ($1, 4, 'dificil', 'análise por agentes')
       on conflict (question_id) do update set level = 4, band = 'dificil'`,
      [tq]
    );
    await env.rpc(USERS.TESTE, "app_answer_question", {
      p_session_id: treino.session_id, p_question_id: tq, p_option: "A", p_active_ms: 1000,
    });
    // só a classificação por agentes: o aluno continua sem ver nível
    expect(await difficulty(USERS.TESTE, tq)).toBeNull();
    // com a validação da equipe, passa a ver o nível validado (e não o dos agentes)
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: tq, p_level: 2 });
    expect(await difficulty(USERS.TESTE, tq)).toEqual({ level: 2 });
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: tq, p_level: null });
  });
});

describe("carga de dados 012601 (classificação de todas as questões)", () => {
  const snapshotReview = () =>
    env.sql(`select question_id, level, validated_by::text as v from public.question_difficulty_review order by question_id`);
  const contar = async () =>
    Number((await env.sql<{ n: string }>(`select count(*)::int as n from public.question_difficulty_agents`))[0].n);

  it("o arquivo traz uma linha por questão, sem repetição, e só grava questões que existem no banco", async () => {
    expect(IDS_DADOS.length).toBeGreaterThan(1000);
    expect(new Set(IDS_DADOS).size).toBe(IDS_DADOS.length);
    expect(DADOS).not.toMatch(/question_difficulty_review/);
    const antes = await snapshotReview();
    await env.dev.db.exec(DADOS);
    const existentes = Number(
      (await env.sql<{ n: string }>(`select count(*)::int as n from public.questions where id = any($1::text[])`, [IDS_DADOS]))[0].n
    );
    expect(existentes).toBeGreaterThan(0);
    const daCarga = Number(
      (await env.sql<{ n: string }>(`select count(*)::int as n from public.question_difficulty_agents where question_id = any($1::text[])`, [IDS_DADOS]))[0].n
    );
    expect(daCarga).toBe(existentes);
    // validação humana intacta
    expect(await snapshotReview()).toEqual(antes);
    // faixa coerente com o nível e origem única
    const ruins = await env.sql(
      `select question_id from public.question_difficulty_agents
       where origin <> 'classificada_agentes'
          or not ((level in (1,2) and band = 'facil') or (level = 3 and band = 'media') or (level in (4,5) and band = 'dificil'))`
    );
    expect(ruins).toEqual([]);
  });

  it("rodar a carga de novo não duplica nem muda nada (idempotente)", async () => {
    const antes = await env.sql(`select question_id, level, band, reason, confidence from public.question_difficulty_agents order by question_id`);
    await env.dev.db.exec(DADOS);
    const depois = await env.sql(`select question_id, level, band, reason, confidence from public.question_difficulty_agents order by question_id`);
    expect(depois).toEqual(antes);
  });

  it("com a carga, a dificuldade validada pela equipe continua mandando", async () => {
    const [{ id }] = await env.sql<{ id: string }>(
      `select a.question_id as id from public.question_difficulty_agents a where a.question_id = any($1::text[]) order by 1 limit 1`,
      [IDS_DADOS]
    );
    const nivelAgentes = (await env.sql<{ level: number }>(`select level from public.question_difficulty_agents where question_id = $1`, [id]))[0].level;
    const outro = nivelAgentes === 5 ? 1 : 5;
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: id, p_level: outro });
    const ef = await env.sql<any>(`select * from public.question_difficulty_effective($1)`, [id]);
    expect(ef).toHaveLength(1);
    expect(ef[0]).toMatchObject({ level: outro, source: "validada_equipe" });
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: id, p_level: null });
    const ef2 = await env.sql<any>(`select * from public.question_difficulty_effective($1)`, [id]);
    expect(ef2[0]).toMatchObject({ level: nivelAgentes, source: "classificada_agentes" });
  });

  it("desfazer da carga apaga só as linhas (tabela fica) e reaplicar restaura", async () => {
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

describe("ensaio de desfazer (reaplica no fim)", () => {
  it("desfazer apaga a tabela e as 2 funções, question_difficulty_review segue intacta, e reaplicar funciona", async () => {
    // Garante registros em ambas as tabelas
    await env.sql(
      `insert into public.question_difficulty_agents (question_id, level, band)
       values ($1, 4, 'dificil')
       on conflict (question_id) do nothing`,
      [ids[0]]
    );
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", {
      p_question_id: ids[0],
      p_level: 4,
    });

    // Executa desfazer
    await env.dev.db.exec(DESFAZER);

    // Verifica que a tabela e as duas funções deixaram de existir
    const tables = await env.sql(
      `select 1 from pg_tables where schemaname = 'public' and tablename = 'question_difficulty_agents'`
    );
    expect(tables).toHaveLength(0);

    const procs = await env.sql(
      `select proname from pg_proc where proname in ('question_difficulty_effective', 'app_admin_difficulty_agents_summary')`
    );
    expect(procs).toHaveLength(0);

    // question_difficulty_review e seus dados seguem intactos
    const reviewRows = await env.sql<any>(
      `select level from public.question_difficulty_review where question_id = $1`,
      [ids[0]]
    );
    expect(reviewRows).toHaveLength(1);
    expect(reviewRows[0].level).toBe(4);

    // Reaplicar migração funciona perfeitamente
    await env.dev.db.exec(MIGRACAO);

    const tablesReapplied = await env.sql(
      `select 1 from pg_tables where schemaname = 'public' and tablename = 'question_difficulty_agents'`
    );
    expect(tablesReapplied).toHaveLength(1);

    const procsReapplied = await env.sql(
      `select proname from pg_proc where proname in ('question_difficulty_effective', 'app_admin_difficulty_agents_summary')`
    );
    expect(procsReapplied).toHaveLength(2);
  });
});
