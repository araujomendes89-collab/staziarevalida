// @vitest-environment node
/**
 * Stazia Arena: a equipe fora do ranking e das ligas (AR05), num Postgres real em memória (PGlite).
 * Migração 20261003009630_arena_sem_equipe.sql. Equipe = administrador e editor (public.user_is_staff).
 *  - aluno entra no ranking e na liga; equipe fica de fora, sem mexer na posição de ninguém;
 *  - a Administração continua vendo a equipe (auditoria, estatísticas); nada é apagado;
 *  - colar a migração duas vezes deixa o mesmo banco;
 *  - quem já estava inscrito como equipe sai da temporada aberta, com registro, sem perder XP, moedas nem histórico;
 *  - virar equipe (ou deixar de ser) vale na próxima consulta.
 * Textos de teste, sem conteúdo clínico.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ARQUIVO = "20261003009630_arena_sem_equipe.sql";
const U = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ANA = U(1), BRUNO = U(2), CARLA = U(3), DIEGO = U(4), EVA = U(5), FRED = U(6), ADMIN = U(90), EDITOR = U(91);

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))
    );
    return r.rows[0].result;
  });
}
const sql = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const publicId = async (uid: string) => (await sql(`select public_id from public.gamification_preferences where user_id = $1`, [uid]))[0].public_id as string;
const colarMigracao = () => db.exec(fs.readFileSync(path.join(MIGRATIONS, ARQUIVO), "utf8"));

/** Deixa só estes participantes com nota, XP semanal e nível; o resto da Arena zera. */
async function placar(linhas: { uid: string; score: number; weekly?: number; streak?: number }[]) {
  await sql(`update public.user_gamification_stats set provisional = true, weekly_xp = 0, current_streak = 0, stazia_score = 0`);
  for (const l of linhas) {
    await sql(`select public.gam_ensure($1)`, [l.uid]);
    await sql(
      `update public.user_gamification_stats set provisional = false, stazia_score = $2, weekly_xp = $3, current_streak = $4,
              questions_answered = 300, accuracy = 0.8, score_reached_at = now() where user_id = $1`,
      [l.uid, l.score, l.weekly ?? 0, l.streak ?? 0]
    );
  }
}
const linhasDe = async (kind: string, uid: string | null) => (await rpc(uid, "app_leaderboard", { p_kind: kind })) as any;
const idsDe = (r: any) => (r.rows as any[]).map((x) => x.public_id as string);

const estadoDasFuncoes = async () =>
  (await sql(
    `select p.proname, md5(pg_get_functiondef(p.oid)) as h, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('gam_board','gam_join_league','app_league_current','app_gamification_summary',
        'ch_worker_gamification_close_week','app_admin_gamification') order by 1`
  )).map((r) => `${r.proname}:${r.h}:${r.acl}`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec("set timezone = 'UTC'");
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(
    `insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev'), ($3, 'carla@teste.dev'), ($4, 'diego@teste.dev'), ($5, 'eva@teste.dev'), ($6, 'fred@teste.dev'), ($7, 'admin@teste.dev'), ($8, 'editor@teste.dev')`,
    [ANA, BRUNO, CARLA, DIEGO, EVA, FRED, ADMIN, EDITOR]
  );
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  for (const u of [ANA, BRUNO, CARLA, DIEGO, EVA, FRED, ADMIN, EDITOR]) await db.query(`select public.gam_ensure($1)`, [u]);
}, 300_000);

describe("AR05: ranking sem a equipe", () => {
  it("a equipe tem a maior nota, mas não aparece em nenhuma classificação; os alunos aparecem na ordem de sempre", async () => {
    await placar([
      { uid: ADMIN, score: 950, weekly: 900, streak: 99 },
      { uid: EDITOR, score: 900, weekly: 800, streak: 50 },
      { uid: ANA, score: 700, weekly: 100, streak: 5 },
      { uid: BRUNO, score: 600, weekly: 60, streak: 3 },
      { uid: CARLA, score: 500, weekly: 30, streak: 1 },
    ]);
    await sql(`update public.user_gamification_stats set monthly_xp = weekly_xp, evolution_pts = 5`);
    const equipe = [await publicId(ADMIN), await publicId(EDITOR)];
    const alunos = [await publicId(ANA), await publicId(BRUNO), await publicId(CARLA)];
    for (const kind of ["geral", "semana", "mes", "precisao", "evolucao", "questoes", "streak"]) {
      const r = await linhasDe(kind, ANA);
      expect(r.total, kind).toBe(3);
      const ids = idsDe(r);
      expect(ids.filter((i) => equipe.includes(i)), kind).toEqual([]);
      expect(ids.sort(), kind).toEqual([...alunos].sort());
    }
    // a ordem do geral e da semana é a dos alunos
    expect(idsDe(await linhasDe("geral", ANA))).toEqual(alunos);
    expect(idsDe(await linhasDe("semana", ANA))).toEqual(alunos);
  });

  it("o aluno não perde posição por causa da equipe: Ana é 1ª de 3, Bruno 2º, Carla 3ª, e as distâncias contam só alunos", async () => {
    const ana = (await rpc(ANA, "app_my_rank", { p_kind: "geral" })) as any;
    expect(ana).toMatchObject({ rank: 1, total: 3, value: 700 });
    const bruno = (await rpc(BRUNO, "app_my_rank", { p_kind: "geral" })) as any;
    expect(bruno).toMatchObject({ rank: 2, total: 3 });
    expect(bruno.next).toEqual([{ rank: 1, gap: 100 }]);
    const carla = (await rpc(CARLA, "app_my_rank", { p_kind: "semana" })) as any;
    expect(carla).toMatchObject({ rank: 3, total: 3, value: 30 });
    // o bloco "me" da própria lista bate com a consulta separada
    expect(((await linhasDe("geral", BRUNO)) as any).me).toMatchObject({ rank: 2, total: 3 });
  });

  it("a equipe não tem posição (a tela mostra como quem ainda não está na lista); 'perto de mim' e perfil público também respeitam", async () => {
    expect(await rpc(ADMIN, "app_my_rank", { p_kind: "geral" })).toBeNull();
    expect(await rpc(EDITOR, "app_my_rank", { p_kind: "semana" })).toBeNull();
    const perto = (await rpc(CARLA, "app_leaderboard_near_me", { p_kind: "geral", p_radius: 5 })) as any;
    expect(perto.rows.map((x: any) => x.public_id)).toEqual([await publicId(ANA), await publicId(BRUNO), await publicId(CARLA)]);
    const perfil = (await rpc(ANA, "app_public_profile", { p_public_id: await publicId(ADMIN) })) as any;
    expect(perfil.rank).toBeNull();
    const perfilAna = (await rpc(BRUNO, "app_public_profile", { p_public_id: await publicId(ANA) })) as any;
    expect(perfilAna).toMatchObject({ rank: 1, total: 3 });
  });

  it("a Administração continua vendo a equipe: auditoria por pessoa, contagem de pessoas com dados e o XP somado", async () => {
    const pessoa = (await rpc(ADMIN, "app_admin_gamification_user", { p_user_id: EDITOR })) as any;
    expect(pessoa.stats).toMatchObject({ user_id: EDITOR, stazia_score: 900, weekly_xp: 800 });
    const m = ((await rpc(ADMIN, "app_admin_gamification")) as any).metrics;
    expect(m.users_total).toBeGreaterThanOrEqual(8); // inclui administrador e editor
    // Top 10 e "Por liga" são só de alunos
    const nomes = m.top10.map((r: any) => r.user_id);
    expect(nomes).toEqual([ANA, BRUNO, CARLA]);
    expect(nomes).not.toContain(ADMIN);
    expect(nomes).not.toContain(EDITOR);
  });

  it("virar equipe vale na próxima consulta, e deixar de ser também (nada é apagado)", async () => {
    await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [BRUNO]);
    expect(idsDe(await linhasDe("geral", ANA))).toEqual([await publicId(ANA), await publicId(CARLA)]);
    expect(await rpc(BRUNO, "app_my_rank", { p_kind: "geral" })).toBeNull();
    expect(((await rpc(CARLA, "app_my_rank", { p_kind: "geral" })) as any)).toMatchObject({ rank: 2, total: 2 });
    await sql(`update public.user_roles set role = 'student' where user_id = $1`, [BRUNO]);
    expect(((await rpc(BRUNO, "app_my_rank", { p_kind: "geral" })) as any)).toMatchObject({ rank: 2, total: 3, value: 600 });
    expect((await sql(`select stazia_score from public.user_gamification_stats where user_id = $1`, [BRUNO]))[0].stazia_score).toBe(600);
  });

  it("revisor médico que não é administrador nem editor continua no ranking (não é equipe para este fim)", async () => {
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`, [CARLA]);
    expect(idsDe(await linhasDe("geral", ANA))).toContain(await publicId(CARLA));
    expect(((await rpc(CARLA, "app_my_rank", { p_kind: "geral" })) as any).rank).toBe(3);
    await sql(`delete from public.ch_reviewer_areas where user_id = $1`, [CARLA]);
  });

  it("o aluno continua sem ver e-mail nem código interno de ninguém", async () => {
    const r = (await linhasDe("geral", ANA)) as any;
    expect(JSON.stringify(r)).not.toMatch(/@teste\.dev|user_id/);
  });
});

describe("AR05: ligas sem a equipe", () => {
  const abrirTemporada = async () => {
    await sql(`delete from public.gamification_jobs where job = 'close_week'`);
    await sql(`delete from public.league_seasons`);
    return (await sql(`select * from public.gam_open_season()`))[0] as { id: number; starts_on: string; ends_on: string };
  };
  const membros = async (seasonId: number) =>
    (await sql<{ user_id: string }>(`select user_id from public.league_memberships where season_id = $1`, [seasonId])).map((r) => r.user_id).sort();

  it("ganhar XP inscreve o aluno na liga; a equipe ganha o XP, mas não é inscrita", async () => {
    const s = await abrirTemporada();
    await sql(`select public.gam_award($1, 'QUESTION_CORRECT', 'question_attempt', 'ar05-ana', 10, 0)`, [ANA]);
    await sql(`select public.gam_award($1, 'QUESTION_CORRECT', 'question_attempt', 'ar05-adm', 10, 0)`, [ADMIN]);
    await sql(`select public.gam_award($1, 'QUESTION_CORRECT', 'question_attempt', 'ar05-edi', 10, 0)`, [EDITOR]);
    expect(await membros(s.id)).toEqual([ANA]);
    // o XP da equipe continua registrado (a auditoria enxerga)
    expect((await sql(`select count(*)::int as n from public.gamification_events where user_id in ($1, $2) and source_id like 'ar05-%'`, [ADMIN, EDITOR]))[0].n).toBe(2);
    expect((await sql(`select current_league from public.user_gamification_stats where user_id = $1`, [ADMIN]))[0].current_league).toBeNull();
  });

  it("a tela da liga: o aluno vê o grupo só com alunos; a equipe vê 'ainda não entrou' e nenhum grupo", async () => {
    const s = await abrirTemporada();
    for (const [uid, k] of [[ANA, "a"], [BRUNO, "b"], [ADMIN, "x"]] as const) {
      await sql(`select public.gam_award($1, 'QUESTION_CORRECT', 'question_attempt', $2, 10, 0)`, [uid, `ar05-liga-${k}`]);
    }
    // inscrição antiga da equipe no mesmo grupo (conta que virou equipe depois de entrar)
    await sql(`insert into public.league_memberships (season_id, user_id, league_slug, group_no, weekly_xp) values ($1, $2, 'bronze', 1, 500) on conflict do nothing`, [s.id, ADMIN]);
    const ana = (await rpc(ANA, "app_league_current")) as any;
    expect(ana.joined).toBe(true);
    expect(ana.rows.map((r: any) => r.public_id).sort()).toEqual([await publicId(ANA), await publicId(BRUNO)].sort());
    expect(ana.rows.map((r: any) => r.position)).toEqual([1, 2]);
    const admin = (await rpc(ADMIN, "app_league_current")) as any;
    expect(admin).toMatchObject({ enabled: true, joined: false });
    expect(admin.rows).toBeUndefined();
    // cartão da liga no Início: posição e tamanho do grupo contam só alunos
    const resumo = (await rpc(ANA, "app_gamification_summary")) as any;
    expect(resumo.league).toMatchObject({ position: 1, group_size: 2 });
    expect(((await rpc(ADMIN, "app_gamification_summary")) as any).league).toBeNull();
    await sql(`delete from public.league_memberships where season_id = $1 and user_id = $2`, [s.id, ADMIN]);
  });

  it("fechar a semana: quem virou equipe sai da temporada, não sobe, não ganha moeda nem medalha; os alunos contam só entre alunos; a temporada nova não inscreve a equipe", async () => {
    await sql(`delete from public.gamification_jobs where job in ('close_week', 'arena_sem_equipe')`);
    await sql(`delete from public.league_seasons`);
    await sql(`delete from public.user_achievements where achievement_slug = 'top_10_semanal'`);
    const s = (await sql(`insert into public.league_seasons (starts_on, ends_on) values (public.today_br() - 7, public.today_br() - 1) returning id`))[0];
    await sql(`update public.user_gamification_stats set last_qualified_activity_at = null`);
    // 6 alunos + equipe com o maior XP da semana, para provar que a equipe não ocupa vaga nem posição
    const xp: Record<string, number> = { [ADMIN]: 900, [EDITOR]: 800, [ANA]: 50, [BRUNO]: 40, [CARLA]: 30, [DIEGO]: 20, [EVA]: 10, [FRED]: 5 };
    for (const [uid, v] of Object.entries(xp)) {
      await sql(`update public.user_gamification_stats set current_league = 'bronze', weekly_xp = $2, last_qualified_activity_at = now() where user_id = $1`, [uid, v]);
      await sql(`insert into public.league_memberships (season_id, user_id, league_slug, group_no, weekly_xp) values ($1, $2, 'bronze', 1, $3)`, [s.id, uid, v]);
    }
    const moedasEquipe = (await sql(`select coalesce(sum(coins),0)::int as n from public.user_gamification_stats where user_id in ($1, $2)`, [ADMIN, EDITOR]))[0].n;
    const r = (await sql(`select public.ch_worker_gamification_close_week() as r`))[0].r;
    // 16/10: sobem 10% do grupo, para baixo, no mínimo 1 (6 alunos → 1)
    expect(r).toMatchObject({ closed: true, promoted: 1, staff_removed: 2 });
    const desfechos = Object.fromEntries((await sql(`select user_id, outcome, position from public.league_memberships where season_id = $1`, [s.id])).map((x) => [x.user_id, `${x.position}:${x.outcome}`]));
    expect(desfechos).toEqual({ [ANA]: "1:promoted", [BRUNO]: "2:stayed", [CARLA]: "3:stayed", [DIEGO]: "4:stayed", [EVA]: "5:stayed", [FRED]: "6:stayed" });
    // equipe: nenhum evento de liga, nenhuma medalha, nenhuma moeda nova; liga atual e XP intactos
    for (const uid of [ADMIN, EDITOR]) {
      expect((await sql(`select count(*)::int as n from public.gamification_events where user_id = $1 and event_type in ('LEAGUE_PROMOTED','LEAGUE_RELEGATED')`, [uid]))[0].n).toBe(0);
      expect((await sql(`select count(*)::int as n from public.user_achievements where user_id = $1 and achievement_slug = 'top_10_semanal'`, [uid]))[0].n).toBe(0);
    }
    expect((await sql(`select coalesce(sum(coins),0)::int as n from public.user_gamification_stats where user_id in ($1, $2)`, [ADMIN, EDITOR]))[0].n).toBe(moedasEquipe);
    expect((await sql(`select current_league from public.user_gamification_stats where user_id = $1`, [ADMIN]))[0].current_league).toBe("bronze");
    // registro da retirada
    const reg = (await sql(`select result from public.gamification_jobs where job = 'arena_sem_equipe' and period_key = $1`, [`semana-${s.id}`]))[0].result;
    expect(reg.removed).toBe(2);
    expect(reg.memberships.map((m: any) => m.user_id).sort()).toEqual([ADMIN, EDITOR].sort());
    // temporada nova: só alunos
    const nova = (await sql(`select id from public.league_seasons where status = 'open'`))[0];
    const novos = await membros(nova.id);
    expect(novos).not.toContain(ADMIN);
    expect(novos).not.toContain(EDITOR);
    expect(novos.sort()).toEqual([ANA, BRUNO, CARLA, DIEGO, EVA, FRED].sort());
    // rodar de novo não duplica nada
    expect((await sql(`select public.ch_worker_gamification_close_week() as r`))[0].r).toMatchObject({ closed: false });
  });

  it("a medalha de top 10 da semana só conta alunos: grupo de 9 alunos + 1 da equipe não chega a 10 e não dá medalha; com 10 alunos, dá", async () => {
    const fakes = Array.from({ length: 10 }, (_, i) => U(60 + i));
    await db.query(`insert into auth.users (id, email) select x, 'fake' || x || '@teste.dev' from unnest($1::uuid[]) x on conflict do nothing`, [fakes]);
    const rodar = async (participantes: string[]) => {
      await sql(`delete from public.gamification_jobs where job in ('close_week', 'arena_sem_equipe')`);
      await sql(`delete from public.league_seasons`);
      await sql(`delete from public.user_achievements where achievement_slug = 'top_10_semanal'`);
      const s = (await sql(`insert into public.league_seasons (starts_on, ends_on) values (public.today_br() - 7, public.today_br() - 1) returning id`))[0];
      for (const [i, uid] of participantes.entries()) {
        await sql(`select public.gam_ensure($1)`, [uid]);
        await sql(`update public.user_gamification_stats set current_league = 'bronze', weekly_xp = $2 where user_id = $1`, [uid, 100 - i]);
        await sql(`insert into public.league_memberships (season_id, user_id, league_slug, group_no, weekly_xp) values ($1, $2, 'bronze', 1, $3)`, [s.id, uid, 100 - i]);
      }
      await sql(`select public.ch_worker_gamification_close_week()`);
      return (await sql(`select user_id from public.user_achievements where achievement_slug = 'top_10_semanal'`)).map((r) => r.user_id as string);
    };
    // equipe com o maior XP + 9 alunos = 10 inscritos, mas só 9 alunos: sem medalha para ninguém
    expect(await rodar([ADMIN, ...fakes.slice(0, 9)])).toEqual([]);
    // controle: 10 alunos, sem equipe: os 10 ganham a medalha
    expect((await rodar(fakes)).sort()).toEqual([...fakes].sort());
    // 10 alunos + equipe no topo: a equipe não ganha a medalha, os alunos ganham
    const comEquipe = await rodar([ADMIN, ...fakes]);
    expect(comEquipe).not.toContain(ADMIN);
    expect(comEquipe.sort()).toEqual([...fakes].sort());
  });
});

describe("AR05: quem já estava inscrito como equipe, e a migração colada duas vezes", () => {
  it("a limpeza tira só a inscrição da temporada aberta, registra o que tirou e preserva XP, moedas, eventos e temporadas fechadas", async () => {
    await sql(`delete from public.gamification_jobs where job in ('close_week', 'arena_sem_equipe')`);
    await sql(`delete from public.league_seasons`);
    const fechada = (await sql(`insert into public.league_seasons (starts_on, ends_on, status, closed_at) values (public.today_br() - 14, public.today_br() - 8, 'closed', now()) returning id`))[0];
    const aberta = (await sql(`select * from public.gam_open_season()`))[0];
    await sql(`insert into public.league_memberships (season_id, user_id, league_slug, group_no, weekly_xp, outcome) values ($1, $2, 'prata', 2, 70, 'stayed')`, [fechada.id, ADMIN]);
    await sql(`insert into public.league_memberships (season_id, user_id, league_slug, group_no, weekly_xp) values ($1, $2, 'prata', 2, 70), ($1, $3, 'prata', 2, 20), ($1, $4, 'prata', 2, 15)`, [aberta.id, ADMIN, EDITOR, DIEGO]);
    await sql(`select public.gam_award($1, 'QUESTION_CORRECT', 'question_attempt', 'ar05-hist', 10, 5)`, [ADMIN]);
    const antes = (await sql(`select total_xp, coins, weekly_xp, current_league from public.user_gamification_stats where user_id = $1`, [ADMIN]))[0];
    const eventosAntes = (await sql(`select count(*)::int as n from public.gamification_events where user_id = $1`, [ADMIN]))[0].n;
    const moedasAntes = (await sql(`select count(*)::int as n from public.coin_transactions where user_id = $1`, [ADMIN]))[0].n;

    await colarMigracao();

    expect(await sql<{ user_id: string }>(`select user_id from public.league_memberships where season_id = $1 order by 1`, [aberta.id])).toEqual([{ user_id: DIEGO }]);
    expect((await sql(`select count(*)::int as n from public.league_memberships where season_id = $1 and user_id = $2`, [fechada.id, ADMIN]))[0].n).toBe(1);
    expect((await sql(`select total_xp, coins, weekly_xp, current_league from public.user_gamification_stats where user_id = $1`, [ADMIN]))[0]).toEqual(antes);
    expect((await sql(`select count(*)::int as n from public.gamification_events where user_id = $1`, [ADMIN]))[0].n).toBe(eventosAntes);
    expect((await sql(`select count(*)::int as n from public.coin_transactions where user_id = $1`, [ADMIN]))[0].n).toBe(moedasAntes);
    const log = await sql(`select result from public.gamification_jobs where job = 'arena_sem_equipe' and period_key like 'migracao-%'`);
    expect(log.length).toBe(1);
    expect(log[0].result.removed).toBe(2);
    expect(log[0].result.memberships.map((m: any) => `${m.user_id}:${m.league_slug}:${m.group_no}:${m.weekly_xp}`).sort())
      .toEqual([`${ADMIN}:prata:2:80`, `${EDITOR}:prata:2:20`].sort());
    // a Administração mostra o registro como rotina com texto em português
    const jobs = (((await rpc(ADMIN, "app_admin_gamification")) as any).metrics.jobs as any[]).filter((j) => j.job === "arena_sem_equipe");
    expect(jobs.length).toBe(1);
  });

  it("colar a migração de novo: mesmas funções e permissões, nada novo no registro, mesmos dados", async () => {
    await sql(`select public.gam_award($1, 'QUESTION_CORRECT', 'question_attempt', 'ar05-idem', 10, 0)`, [ANA]);
    const instantaneo = async () => ({
      funcoes: await estadoDasFuncoes(),
      jobs: (await sql(`select job, period_key, result from public.gamification_jobs order by id`)).map((j) => JSON.stringify(j)),
      inscricoes: (await sql(`select season_id, user_id, league_slug, group_no, weekly_xp from public.league_memberships order by 1, 2`)).map((j) => JSON.stringify(j)),
      stats: (await sql(`select user_id, total_xp, weekly_xp, coins, current_league, stazia_score from public.user_gamification_stats order by 1`)).map((j) => JSON.stringify(j)),
      eventos: (await sql(`select count(*)::int as n from public.gamification_events`))[0].n,
      ranking: JSON.stringify(await linhasDe("geral", ANA)),
    });
    const a = await instantaneo();
    await colarMigracao();
    await colarMigracao();
    const b = await instantaneo();
    expect(b).toEqual(a);
    expect(a.funcoes.length).toBe(6);
  });

  it("segurança: o cliente não executa as funções internas; só logado executa as do aluno; visitante é barrado", async () => {
    for (const fn of ["gam_board('geral')", `gam_join_league('${ANA}')`, "ch_worker_gamification_close_week()"]) {
      await expect(rpcCru(ANA, fn)).rejects.toThrow(/permission denied/);
      await expect(rpcCru(null, fn)).rejects.toThrow(/permission denied/);
    }
    for (const fn of ["app_league_current()", "app_gamification_summary()", "app_admin_gamification()", "app_leaderboard('geral')"]) {
      await expect(rpcCru(null, fn)).rejects.toThrow(); // visitante: sem permissão ou "Entre na sua conta."
    }
    // aluno comum não abre a Administração
    await expect(rpc(ANA, "app_admin_gamification")).rejects.toThrow();
    // as funções novas fixam o caminho de busca vazio
    const sem = await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('gam_board','gam_join_league','app_league_current','app_gamification_summary','ch_worker_gamification_close_week','app_admin_gamification')
        and not (p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=""%')`);
    expect(sem).toEqual([]);
  });
});

async function rpcCru(uid: string | null, call: string) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query(`select public.${call}`)).rows;
  });
}
