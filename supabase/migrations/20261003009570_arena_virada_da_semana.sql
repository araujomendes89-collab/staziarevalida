-- =============================================================================
-- Stazia Arena: virada da semana (correções AR02, AR03 e AR06, 2026-10-11). Cole depois da 20261003008300.
--
--  AR02: a liga só promove quem estudou na semana (XP semanal maior que zero). Antes, os 5 primeiros de cada grupo
--        subiam e ganhavam 50 moedas mesmo com 0 XP (em grupos pequenos, todos subiam toda semana).
--  AR03: o desempate da liga conta a semana pelo horário de Brasília. Antes, o dia começava à meia-noite do horário
--        universal, que é 21h em Brasília.
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
  v_closed int := 0; v_promoted int := 0; v_relegated int := 0;
  r record;
begin
  select * into se from public.league_seasons where status = 'open' and ends_on < v_today order by starts_on limit 1 for update;
  if not found then return jsonb_build_object('closed', false); end if;
  if exists (select 1 from public.gamification_jobs j where j.job = 'close_week' and j.period_key = se.id::text) then
    return jsonb_build_object('closed', false, 'already', true);
  end if;

  -- posições e desfechos
  update public.league_memberships m set position = x.pos,
    outcome = case
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
    if r.position <= 10 and r.weekly_xp > 0 and (select count(*) from public.league_memberships o where o.season_id = se.id and o.league_slug = r.league_slug
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
  insert into public.league_memberships (season_id, user_id, league_slug, group_no)
  select nx.id, x.user_id, x.league, ceil(x.rn::numeric / v_size)::int
  from (select s.user_id, coalesce(s.current_league, 'bronze') as league,
               row_number() over (partition by coalesce(s.current_league, 'bronze') order by s.stazia_score desc, s.user_id) as rn
        from public.user_gamification_stats s
        where s.last_qualified_activity_at >= now() - make_interval(days => v_active)) x
  on conflict do nothing;

  insert into public.gamification_jobs (job, period_key, result) values ('close_week', se.id::text,
    jsonb_build_object('closed', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id));
  return jsonb_build_object('closed', true, 'season', se.id, 'members', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id);
end
$$;

-- Rotina interna: o cliente (aluno ou visitante) não executa.
revoke execute on function public.ch_worker_gamification_close_week() from public, anon, authenticated;
