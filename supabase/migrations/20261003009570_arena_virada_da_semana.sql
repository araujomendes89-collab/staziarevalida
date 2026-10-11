-- =============================================================================
-- Stazia Arena: virada da semana (correções AR02, AR03 e AR06, 2026-10-11). Cole depois da 20261003008300.
--
--  AR02: a liga só promove quem estudou na semana (XP semanal maior que zero). Antes, os 5 primeiros de cada grupo
--        subiam e ganhavam 50 moedas mesmo com 0 XP (em grupos pequenos, todos subiam toda semana).
--  AR03: o desempate da liga conta a semana pelo horário de Brasília. Antes, o dia começava à meia-noite do horário
--        universal, que é 21h em Brasília.
--  AR06: a rotina diária e o fechamento da semana passam a olhar os interruptores. Arena desligada: nada fecha, nada
--        promove nem rebaixa, nenhuma sequência quebra (a rotina nem registra o dia: roda quando ligar). Só as ligas
--        desligadas: a semana do ranking continua virando (XP semanal zera, foto da semana), mas ninguém sobe, desce,
--        ganha moeda ou medalha de liga e a próxima temporada não inscreve ninguém sozinha.
--
-- Vale daqui para a frente: nada que o aluno já ganhou (XP, moedas, medalhas, subidas de liga) é apagado nem recalculado.
-- Cole quantas vezes quiser: é "create or replace".
-- =============================================================================

-- Fecha a temporada vencida (idempotente): posições, promoções, rebaixamentos, recompensas, nova temporada.
-- Versão de partida: a da 20261003003800 (única até aqui).
create or replace function public.ch_worker_gamification_close_week() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  se public.league_seasons;
  nx public.league_seasons;
  v_size constant int := greatest(public.gam_num('league.group_size', 30)::int, 2);
  v_promote constant int := public.gam_num('league.promote', 5)::int;
  v_relegate constant int := public.gam_num('league.relegate', 5)::int;
  v_min_group constant int := public.gam_num('league.min_group_for_relegation', 10)::int;
  v_active constant int := public.gam_num('league.active_days', 14)::int;
  v_today constant date := public.today_br();
  v_leagues constant boolean := public.gam_flag('flags.leagues_enabled');
  v_closed int := 0; v_promoted int := 0; v_relegated int := 0;
  r record;
begin
  -- AR06: Arena desligada, a semana não vira
  if not public.gam_flag('flags.gamification_enabled') then
    return jsonb_build_object('closed', false, 'skipped', 'arena_desligada');
  end if;
  select * into se from public.league_seasons where status = 'open' and ends_on < v_today order by starts_on limit 1 for update;
  if not found then return jsonb_build_object('closed', false); end if;
  if exists (select 1 from public.gamification_jobs j where j.job = 'close_week' and j.period_key = se.id::text) then
    return jsonb_build_object('closed', false, 'already', true);
  end if;

  -- posições e desfechos
  update public.league_memberships m set position = x.pos,
    outcome = case
      -- AR06: com as ligas desligadas ninguém sobe nem desce
      when not v_leagues then 'stayed'
      -- AR02: só sobe quem estudou na semana (XP semanal maior que zero)
      when x.pos <= v_promote and m.weekly_xp > 0 and l.position < (select max(position) from public.leagues) then 'promoted'
      when x.n >= v_min_group and x.pos > x.n - v_relegate and l.position > 1 then 'relegated'
      else 'stayed' end
  from (select o.user_id, row_number() over (partition by o.league_slug, o.group_no order by o.weekly_xp desc,
          (select count(*) from public.gamification_events e where e.user_id = o.user_id and e.event_type = 'QUESTION_CORRECT'
             -- AR03: a semana vai da meia-noite de segunda à meia-noite de domingo em Brasília (e não do horário universal)
             and e.created_at >= (se.starts_on::timestamp at time zone 'America/Sao_Paulo')
             and e.created_at < ((se.ends_on + 1)::timestamp at time zone 'America/Sao_Paulo')) desc,
          o.joined_at, o.user_id) as pos,
        count(*) over (partition by o.league_slug, o.group_no) as n
        from public.league_memberships o where o.season_id = se.id) x,
       public.leagues l
  where m.season_id = se.id and m.user_id = x.user_id and l.slug = m.league_slug;

  for r in select m.user_id, m.league_slug, m.outcome, m.position, m.weekly_xp, l.position as lpos
           from public.league_memberships m join public.leagues l on l.slug = m.league_slug where m.season_id = se.id loop
    v_closed := v_closed + 1;
    if r.outcome = 'promoted' then
      v_promoted := v_promoted + 1;
      update public.user_gamification_stats set current_league = (select slug from public.leagues where position = r.lpos + 1) where user_id = r.user_id;
      perform public.gam_award(r.user_id, 'LEAGUE_PROMOTED', 'season', se.id::text, 0, public.gam_num('coins.league_promoted', 50)::int,
                               jsonb_build_object('from', r.league_slug, 'position', r.position));
    elsif r.outcome = 'relegated' then
      v_relegated := v_relegated + 1;
      update public.user_gamification_stats set current_league = (select slug from public.leagues where position = r.lpos - 1) where user_id = r.user_id;
      perform public.gam_award(r.user_id, 'LEAGUE_RELEGATED', 'season', se.id::text, 0, 0, jsonb_build_object('from', r.league_slug, 'position', r.position));
    end if;
    -- a medalha do top 10 também exige ter estudado na semana
    if v_leagues and r.position <= 10 and r.weekly_xp > 0 and (select count(*) from public.league_memberships o where o.season_id = se.id and o.league_slug = r.league_slug
                             and o.group_no = (select group_no from public.league_memberships where season_id = se.id and user_id = r.user_id)) >= 10 then
      perform public.gam_unlock(r.user_id, 'top_10_semanal');
    end if;
  end loop;

  -- foto da semana (ranking geral) e zera o XP semanal
  insert into public.ranking_snapshots (user_id, period_type, period_start, period_end, rank, total, stazia_score, xp, accuracy)
  select s.user_id, 'week', se.starts_on, se.ends_on, b.rank, b.total, s.stazia_score, s.weekly_xp, s.accuracy
  from public.user_gamification_stats s left join public.gam_board('geral') b on b.user_id = s.user_id
  on conflict do nothing;
  update public.user_gamification_stats set weekly_xp = 0 where weekly_xp <> 0;
  update public.league_seasons set status = 'closed', closed_at = now() where id = se.id;

  -- nova temporada com os ativos, grupos equilibrados por score (determinístico)
  insert into public.league_seasons (starts_on, ends_on) values (greatest(se.ends_on + 1, public.gam_week_start(v_today)), greatest(se.ends_on + 1, public.gam_week_start(v_today)) + 6)
  on conflict (starts_on) do update set status = 'open', closed_at = null returning * into nx;
  if v_leagues then
    insert into public.league_memberships (season_id, user_id, league_slug, group_no)
    select nx.id, x.user_id, x.league, ceil(x.rn::numeric / v_size)::int
    from (select s.user_id, coalesce(s.current_league, 'bronze') as league,
                 row_number() over (partition by coalesce(s.current_league, 'bronze') order by s.stazia_score desc, s.user_id) as rn
          from public.user_gamification_stats s
          where s.last_qualified_activity_at >= now() - make_interval(days => v_active)) x
    on conflict do nothing;
  end if;

  insert into public.gamification_jobs (job, period_key, result) values ('close_week', se.id::text,
    jsonb_build_object('closed', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id, 'leagues', v_leagues));
  return jsonb_build_object('closed', true, 'season', se.id, 'members', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id, 'leagues', v_leagues);
end
$$;

-- Rotina diária (partida: a da 20261003003800, única até aqui), agora olhando o interruptor da Arena.
create or replace function public.ch_worker_gamification_daily() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_key constant text := public.today_br()::text;
  v_users int := 0; v_broken int := 0; v_frozen int := 0;
  r record;
  v_month jsonb := null;
  v_week jsonb;
begin
  -- AR06: Arena desligada, a rotina não faz nada (nem quebra sequência) e não registra o dia: roda quando ligar
  if not public.gam_flag('flags.gamification_enabled') then
    return jsonb_build_object('skipped', true, 'reason', 'arena_desligada', 'day', v_key);
  end if;
  insert into public.gamification_jobs (job, period_key) values ('daily', v_key) on conflict do nothing;
  if not found then return jsonb_build_object('skipped', true, 'day', v_key); end if;

  -- dificuldade real das questões
  insert into public.question_difficulty (question_id, attempts, correct, difficulty, updated_at)
  select a.question_id, count(*), count(*) filter (where a.is_correct), round(1 - count(*) filter (where a.is_correct)::numeric / count(*), 3), now()
  from public.question_attempts a group by a.question_id
  on conflict (question_id) do update set attempts = excluded.attempts, correct = excluded.correct, difficulty = excluded.difficulty, updated_at = now();

  -- sequências quebradas (no fuso de cada aluno) e proteções
  for r in select s.user_id, s.current_streak, s.last_qualified_date, s.streak_freezes, public.gam_today(s.user_id) as today
           from public.user_gamification_stats s where s.current_streak > 0 loop
    if r.last_qualified_date < r.today - 1 then
      if r.last_qualified_date = r.today - 2 and r.streak_freezes > 0 then
        update public.user_gamification_stats set streak_freezes = streak_freezes - 1, last_qualified_date = r.today - 1 where user_id = r.user_id;
        perform public.gam_award(r.user_id, 'STREAK_FREEZE_USED', 'day', (r.today - 1)::text, 0, 0, jsonb_build_object('streak', r.current_streak));
        v_frozen := v_frozen + 1;
      else
        update public.user_gamification_stats set current_streak = 0 where user_id = r.user_id;
        perform public.gam_award(r.user_id, 'STREAK_BROKEN', 'day', r.today::text, 0, 0, jsonb_build_object('streak', r.current_streak));
        v_broken := v_broken + 1;
      end if;
    end if;
  end loop;

  -- score de quem estudou nos últimos 30 dias
  for r in select s.user_id from public.user_gamification_stats s where s.last_qualified_activity_at >= now() - interval '30 days' loop
    perform public.gam_refresh_score(r.user_id, true);
    v_users := v_users + 1;
  end loop;

  -- foto do dia (ranking geral)
  insert into public.ranking_snapshots (user_id, period_type, period_start, period_end, rank, total, stazia_score, xp, accuracy)
  select s.user_id, 'day', public.today_br(), public.today_br(), b.rank, b.total, s.stazia_score, s.total_xp, s.accuracy
  from public.user_gamification_stats s left join public.gam_board('geral') b on b.user_id = s.user_id
  where s.questions_answered > 0
  on conflict do nothing;

  -- mês fechado
  if extract(day from public.today_br()) = 1 then
    insert into public.gamification_jobs (job, period_key) values ('close_month', to_char(public.today_br() - 1, 'YYYY-MM')) on conflict do nothing;
    if found then
      insert into public.ranking_snapshots (user_id, period_type, period_start, period_end, rank, total, stazia_score, xp, accuracy)
      select s.user_id, 'month', date_trunc('month', public.today_br() - 1)::date, public.today_br() - 1, b.rank, b.total, s.stazia_score, s.monthly_xp, s.accuracy
      from public.user_gamification_stats s left join public.gam_board('mes') b on b.user_id = s.user_id
      where s.monthly_xp > 0
      on conflict do nothing;
      update public.user_gamification_stats set monthly_xp = 0 where monthly_xp <> 0;
      v_month := jsonb_build_object('closed', to_char(public.today_br() - 1, 'YYYY-MM'));
    end if;
  end if;

  v_week := public.ch_worker_gamification_close_week();
  update public.gamification_jobs set result = jsonb_build_object('scores', v_users, 'streaks_broken', v_broken, 'freezes_used', v_frozen, 'week', v_week, 'month', v_month)
    where job = 'daily' and period_key = v_key;
  return jsonb_build_object('day', v_key, 'scores', v_users, 'streaks_broken', v_broken, 'freezes_used', v_frozen, 'week', v_week, 'month', v_month);
end
$$;

-- Rotina interna: o cliente (aluno ou visitante) não executa.
revoke execute on function public.ch_worker_gamification_close_week() from public, anon, authenticated;
revoke execute on function public.ch_worker_gamification_daily() from public, anon, authenticated;
