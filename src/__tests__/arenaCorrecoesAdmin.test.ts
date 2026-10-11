// @vitest-environment node
/**
 * Stazia Arena na Administração: correções AR02, AR03, AR04, AR06 e AR09 num Postgres real em memória (PGlite).
 *  AR02: a liga só promove quem estudou na semana (XP semanal maior que zero);
 *  AR03: desempate e "XP de hoje" contam o dia de Brasília;
 *  AR04: o alvo da missão editado na Administração vale de verdade (grava a regra que o motor lê);
 *  AR06: Arena desligada ou ligas desligadas não fecham a semana com promoção e rebaixamento;
 *  AR09: as regras (limites antifraude) só a equipe lê.
 * Regra de ouro: nada que o aluno já ganhou é apagado nem recalculado para baixo.
 * Textos de teste, sem conteúdo clínico.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
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
const setRule = (key: string, value: unknown) => rpc(ADMIN, "app_admin_gamification_save_rule", { p_key: key, p_value: JSON.stringify(value), p_enabled: true });
const ruleValue = async (key: string) => (await sql(`select value from public.gamification_rules where key = $1`, [key]))[0].value;

type Member = { uid: string; xp: number; league?: string; group?: number };
/** Uma temporada vencida (terminou ontem) com os membros dados; o fechamento ainda não rodou. */
async function temporadaVencida(members: Member[]) {
  await sql(`delete from public.gamification_jobs where job = 'close_week'`);
  await sql(`delete from public.league_seasons`);
  await sql(`update public.user_gamification_stats set last_qualified_activity_at = null`);
  const s = (await sql(`insert into public.league_seasons (starts_on, ends_on) values (public.today_br() - 7, public.today_br() - 1) returning id, starts_on`))[0];
  for (const m of members) {
    await sql(`select public.gam_ensure($1)`, [m.uid]);
    await sql(`update public.user_gamification_stats set current_league = $2, weekly_xp = $3, last_qualified_activity_at = now() where user_id = $1`, [m.uid, m.league ?? "bronze", m.xp]);
    await sql(`insert into public.league_memberships (season_id, user_id, league_slug, group_no, weekly_xp) values ($1, $2, $3, $4, $5)`,
      [s.id, m.uid, m.league ?? "bronze", m.group ?? 1, m.xp]);
  }
  return s as { id: number; starts_on: string };
}
const fechar = async () => (await sql(`select public.ch_worker_gamification_close_week() as r`))[0].r;
const outcomes = async (seasonId: number) =>
  Object.fromEntries((await sql(`select user_id, outcome from public.league_memberships where season_id = $1`, [seasonId])).map((r) => [r.user_id, r.outcome]));
const leagueOf = async (uid: string) => (await sql(`select current_league from public.user_gamification_stats where user_id = $1`, [uid]))[0].current_league;
const eventsOf = async (uid: string, type: string) => sql(`select * from public.gamification_events where user_id = $1 and event_type = $2`, [uid, type]);

beforeAll(async () => {
  db = new PGlite();
  // O Supabase roda em horário universal (UTC). O PGlite usaria o fuso do computador de quem testa e esconderia o erro do AR03.
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
}, 300_000);

describe("AR02: a liga só promove quem estudou na semana", () => {
  it("quem fechou a semana com 0 XP fica na liga, sem moedas; quem estudou sobe", async () => {
    const s = await temporadaVencida([
      { uid: ANA, xp: 40 },
      { uid: BRUNO, xp: 0 },
      { uid: CARLA, xp: 0 },
    ]);
    const coinsBefore = (await sql(`select coalesce(sum(coins), 0)::int as n from public.user_gamification_stats where user_id in ($1, $2)`, [BRUNO, CARLA]))[0].n;
    const r = await fechar();
    expect(r).toMatchObject({ closed: true, promoted: 1 });
    expect(await outcomes(s.id)).toEqual({ [ANA]: "promoted", [BRUNO]: "stayed", [CARLA]: "stayed" });
    expect(await leagueOf(ANA)).toBe("prata");
    expect(await leagueOf(BRUNO)).toBe("bronze");
    expect(await leagueOf(CARLA)).toBe("bronze");
    expect((await eventsOf(ANA, "LEAGUE_PROMOTED")).length).toBe(1);
    expect((await eventsOf(BRUNO, "LEAGUE_PROMOTED")).length).toBe(0);
    expect((await eventsOf(CARLA, "LEAGUE_PROMOTED")).length).toBe(0);
    expect((await sql(`select coalesce(sum(coins), 0)::int as n from public.user_gamification_stats where user_id in ($1, $2)`, [BRUNO, CARLA]))[0].n).toBe(coinsBefore);
  });

  it("grupo inteiro sem estudo: ninguém sobe", async () => {
    const s = await temporadaVencida([
      { uid: ANA, xp: 0, league: "prata" },
      { uid: BRUNO, xp: 0, league: "prata" },
    ]);
    const r = await fechar();
    expect(r).toMatchObject({ closed: true, promoted: 0 });
    expect(Object.values(await outcomes(s.id))).toEqual(["stayed", "stayed"]);
    expect(await leagueOf(ANA)).toBe("prata");
  });

  it("o que já foi concedido antes (subida e moedas) continua no livro-razão", async () => {
    expect((await eventsOf(ANA, "LEAGUE_PROMOTED")).length).toBe(1);
  });
});

describe("AR03: o dia e a semana contam pelo horário de Brasília", () => {
  it("desempate da liga: respostas certas de antes do início da semana (em Brasília) não contam", async () => {
    await setRule("league.promote", 1);
    try {
      const s = await temporadaVencida([
        { uid: CARLA, xp: 10 },
        { uid: DIEGO, xp: 10 },
      ]);
      // Carla: 2 acertos na noite de domingo (22h em Brasília = já segunda no horário universal): são da semana anterior.
      // Diego: 1 acerto na segunda, 12h em Brasília: é da semana.
      for (const n of [1, 2]) {
        await sql(`insert into public.gamification_events (user_id, event_type, source_type, source_id, created_at)
                   values ($1, 'QUESTION_CORRECT', 'question_attempt', $2, (((select starts_on from public.league_seasons where id = $3)::timestamp - interval '2 hours') at time zone 'America/Sao_Paulo'))`, [CARLA, `ar03-c${n}`, s.id]);
      }
      await sql(`insert into public.gamification_events (user_id, event_type, source_type, source_id, created_at)
                 values ($1, 'QUESTION_CORRECT', 'question_attempt', 'ar03-d1', (((select starts_on from public.league_seasons where id = $2)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'))`, [DIEGO, s.id]);
      await fechar();
      expect(await outcomes(s.id)).toEqual({ [DIEGO]: "promoted", [CARLA]: "stayed" });
    } finally {
      await setRule("league.promote", 5);
    }
  });

  it("XP de hoje na Administração: conta desde a meia-noite de Brasília, não desde as 21h do dia anterior", async () => {
    const base = Number((await rpc(ADMIN, "app_admin_gamification")).metrics.xp_today);
    const quando = (sql_: string) => `((${sql_}) at time zone 'America/Sao_Paulo')`;
    await sql(`insert into public.gamification_events (user_id, event_type, source_type, source_id, xp_awarded, created_at)
               values ($1, 'QUESTION_CORRECT', 'question_attempt', 'ar03-hoje', 7, ${quando("public.today_br()::timestamp")}),
                      ($1, 'QUESTION_CORRECT', 'question_attempt', 'ar03-ontem', 5, ${quando("public.today_br()::timestamp - interval '1 hour'")})`, [EVA]);
    const depois = Number((await rpc(ADMIN, "app_admin_gamification")).metrics.xp_today);
    expect(depois - base).toBe(7);
  });
});

describe("AR04: o alvo da missão editado na Administração vale de verdade", () => {
  it("salvar o alvo grava a regra que o motor lê; missões novas usam o valor; as já geradas não mudam", async () => {
    await rpc(ADMIN, "app_gamification_missions").catch(() => null);
    await sql(`select public.gam_generate_missions($1)`, [FRED]);
    const antes = (await sql(`select target from public.user_missions where user_id = $1 and mission_slug = 'daily_correct'`, [FRED]))[0].target;
    expect(antes).toBe(15);

    const r = await rpc(ADMIN, "app_admin_gamification_save_mission", { p_mission: { slug: "daily_correct", target_default: 20 } });
    expect(await ruleValue("missions.daily_correct")).toBe(20);
    expect(r.missions.find((m: any) => m.slug === "daily_correct").target_default).toBe(20);

    await sql(`select public.gam_generate_missions($1)`, [EVA]);
    expect((await sql(`select target from public.user_missions where user_id = $1 and mission_slug = 'daily_correct'`, [EVA]))[0].target).toBe(20);
    expect((await sql(`select target from public.user_missions where user_id = $1 and mission_slug = 'daily_correct'`, [FRED]))[0].target).toBe(15);
  });

  it("a Administração mostra o alvo que o motor usa de fato, também quando a regra é editada na aba Regras", async () => {
    await setRule("missions.daily_correct", 12);
    const m = (await rpc(ADMIN, "app_admin_gamification")).missions.find((x: any) => x.slug === "daily_correct");
    expect(m.target_default).toBe(12);
    await setRule("missions.daily_correct", 15);
  });

  it("alvo zero, negativo, quebrado ou acima de 100% na precisão é recusado em português (zero completaria a missão de graça)", async () => {
    for (const value of [0, -3, 1.5, "dez"]) {
      await expect(rpc(ADMIN, "app_admin_gamification_save_mission", { p_mission: { slug: "daily_correct", target_default: value } }))
        .rejects.toThrow("O alvo da missão precisa ser um número inteiro maior que zero.");
    }
    await expect(rpc(ADMIN, "app_admin_gamification_save_mission", { p_mission: { slug: "weekly_accuracy", target_default: 150 } }))
      .rejects.toThrow("O alvo da precisão precisa ficar entre 1 e 100.");
    expect(await ruleValue("missions.daily_correct")).toBe(15);
  });

  it("salvar só o título ou o XP não mexe no alvo nem na regra", async () => {
    await rpc(ADMIN, "app_admin_gamification_save_mission", { p_mission: { slug: "daily_areas", xp_reward: 11 } });
    expect(await ruleValue("missions.daily_areas")).toBe(2);
    await rpc(ADMIN, "app_admin_gamification_save_mission", { p_mission: { slug: "daily_areas", xp_reward: 10 } });
  });
});

describe("AR06: Arena ou ligas desligadas não viram a semana", () => {
  it("Arena desligada: a semana não fecha, ninguém sobe nem desce, o XP semanal fica", async () => {
    const s = await temporadaVencida([
      { uid: ANA, xp: 40 },
      { uid: BRUNO, xp: 10 },
    ]);
    await setRule("flags.gamification_enabled", false);
    try {
      const r = await fechar();
      expect(r).toMatchObject({ closed: false });
      expect((await sql(`select status from public.league_seasons where id = $1`, [s.id]))[0].status).toBe("open");
      expect(Object.values(await outcomes(s.id))).toEqual([null, null]);
      expect(await leagueOf(ANA)).toBe("bronze");
      expect((await sql(`select weekly_xp from public.user_gamification_stats where user_id = $1`, [ANA]))[0].weekly_xp).toBe(40);
      expect((await sql(`select count(*)::int as n from public.gamification_jobs where job = 'close_week'`))[0].n).toBe(0);
    } finally {
      await setRule("flags.gamification_enabled", true);
    }
  });

  it("rotina diária com a Arena desligada: pula tudo, não quebra sequência e não registra o dia (roda quando ligar)", async () => {
    await sql(`select public.gam_ensure($1)`, [CARLA]);
    await sql(`update public.user_gamification_stats set current_streak = 5, last_qualified_date = public.today_br() - 5 where user_id = $1`, [CARLA]);
    await sql(`delete from public.gamification_jobs where job = 'daily'`);
    await setRule("flags.gamification_enabled", false);
    try {
      const r = (await sql(`select public.ch_worker_gamification_daily() as r`))[0].r;
      expect(r).toMatchObject({ skipped: true });
      expect((await sql(`select current_streak from public.user_gamification_stats where user_id = $1`, [CARLA]))[0].current_streak).toBe(5);
      expect((await sql(`select count(*)::int as n from public.gamification_jobs where job = 'daily'`))[0].n).toBe(0);
    } finally {
      await setRule("flags.gamification_enabled", true);
    }
    const ligado = (await sql(`select public.ch_worker_gamification_daily() as r`))[0].r;
    expect(ligado.skipped).toBeUndefined();
    expect((await sql(`select count(*)::int as n from public.gamification_jobs where job = 'daily'`))[0].n).toBe(1);
  });

  it("ligas desligadas: a semana do ranking vira (XP semanal zera), mas ninguém sobe, desce, ganha moeda ou medalha", async () => {
    const s = await temporadaVencida([
      { uid: ANA, xp: 40 },
      { uid: BRUNO, xp: 10 },
      { uid: CARLA, xp: 0 },
    ]);
    const coinsBefore = (await sql(`select coins from public.user_gamification_stats where user_id = $1`, [ANA]))[0].coins;
    const subidasBefore = (await eventsOf(ANA, "LEAGUE_PROMOTED")).length;
    await setRule("flags.leagues_enabled", false);
    try {
      const r = await fechar();
      expect(r).toMatchObject({ closed: true, promoted: 0, relegated: 0 });
      expect(Object.values(await outcomes(s.id))).toEqual(["stayed", "stayed", "stayed"]);
      expect(await leagueOf(ANA)).toBe("bronze");
      expect((await eventsOf(ANA, "LEAGUE_PROMOTED")).length).toBe(subidasBefore); // nenhuma nova; as antigas ficam
      expect((await sql(`select coins from public.user_gamification_stats where user_id = $1`, [ANA]))[0].coins).toBe(coinsBefore);
      expect((await sql(`select weekly_xp from public.user_gamification_stats where user_id = $1`, [ANA]))[0].weekly_xp).toBe(0);
      expect((await sql(`select status from public.league_seasons where id = $1`, [s.id]))[0].status).toBe("closed");
      // sem ligas, a nova temporada não inscreve ninguém sozinha
      expect((await sql(`select count(*)::int as n from public.league_memberships where season_id <> $1`, [s.id]))[0].n).toBe(0);
    } finally {
      await setRule("flags.leagues_enabled", true);
    }
  });

  it("tudo ligado: o fechamento promove e inscreve a próxima temporada como antes", async () => {
    const s = await temporadaVencida([{ uid: DIEGO, xp: 30 }, { uid: EVA, xp: 0 }]);
    const r = await fechar();
    expect(r).toMatchObject({ closed: true, promoted: 1 });
    expect(await outcomes(s.id)).toEqual({ [DIEGO]: "promoted", [EVA]: "stayed" });
    expect((await sql(`select count(*)::int as n from public.league_memberships where season_id <> $1`, [s.id]))[0].n).toBe(2);
  });
});

describe("AR09: as regras só a equipe lê", () => {
  const lerRegras = (uid: string) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
      return (await tx.query<{ key: string }>(`select key from public.gamification_rules`)).rows;
    });

  it("aluno logado não lê nenhuma regra direto na tabela; administrador e editor leem", async () => {
    expect(await lerRegras(ANA)).toEqual([]);
    expect((await lerRegras(ADMIN)).length).toBeGreaterThan(40);
    expect((await lerRegras(EDITOR)).length).toBeGreaterThan(40);
  });

  it("o motor continua lendo as regras para o aluno (XP, antifraude, missões)", async () => {
    const lido = await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA })]);
      return (await tx.query<{ n: number }>(`select public.gam_num('xp.question_correct', 0) as n`)).rows[0].n;
    });
    expect(Number(lido)).toBe(8);
  });

  it("a migração pode ser colada duas vezes sem erro", async () => {
    const file = fs.readdirSync(MIGRATIONS).filter((f) => /^202610030095[78]\d_/.test(f));
    expect(file.length).toBeGreaterThan(0);
    for (const f of file) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    expect(await lerRegras(ANA)).toEqual([]);
  });
});
