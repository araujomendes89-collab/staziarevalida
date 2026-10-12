-- =============================================================================
-- Stazia Arena: a equipe fora do ranking e das ligas (achado AR05, decisão do dono em 2026-10-11).
-- Cole depois da 20261003009573 (e das demais). Pode colar quantas vezes quiser: é "create or replace" e a limpeza só age se houver o que limpar.
--
-- O que muda: conta da EQUIPE (administrador e editor, a mesma regra de public.user_is_staff que o sistema já usa em acesso,
-- Tutor e Central) deixa de aparecer nas classificações e nas ligas, junto com os alunos.
--  1. Ranking: gam_board (a base de toda classificação: geral, semana, mês, precisão, evolução, questões, sequência, "perto de mim",
--     posição própria, perfil público e foto diária/semanal) não lista a equipe. A posição e o total que o aluno vê contam só alunos.
--  2. Liga: gam_join_league não inscreve a equipe; o fechamento da semana não a inscreve na temporada nova, retira a inscrição de
--     quem virou equipe no meio da semana (só da temporada que fecha) e, por isso, a equipe não ocupa posição, não sobe, não desce
--     e não ganha medalha de top 10. A tela da liga e o cartão da liga no Início contam o grupo só com alunos.
--  3. Administração: o Top 10 e "Por liga" da aba Stazia Play contam só alunos (a tela diz isso). O resto da Administração
--     (auditoria por pessoa, ledger, XP, moedas, quantas pessoas têm dados) continua vendo a equipe: nada é apagado.
--  4. Quem já estava numa liga como equipe: a inscrição na temporada ABERTA é retirada no fim deste arquivo (uma única vez; colar de
--     novo não acha mais nada). Fica registro em public.gamification_jobs (job 'arena_sem_equipe') com a inscrição retirada
--     (liga, grupo e XP da semana), para poder refazer. XP, moedas, eventos, medalhas, histórico de temporadas fechadas e
--     o "current_league" da pessoa NÃO são tocados.
--  5. Quem vira equipe (ou deixa de ser) depois: o ranking acompanha na próxima consulta (a regra é lida na hora); a liga acompanha
--     na próxima consulta (some da tela) e na próxima inscrição/fechamento. Nenhuma rotina nova.
--
-- Revisor médico (ch_reviewer_areas) que não é administrador nem editor NÃO é equipe para este fim: user_has_full_access só dá acesso
-- completo ao conteúdo; a pessoa continua sendo uma conta de estudo e continua no ranking e na liga. Se o dono quiser o contrário,
-- troque public.user_is_staff(x) por public.user_has_full_access(x) nos pontos marcados "AR05" abaixo (e na limpeza do fim).
--
-- Funções redefinidas e a versão usada como base (sempre a mais nova):
--   gam_board                         base: 20261003003800 (única)
--   gam_join_league                   base: 20261003003800 (única)
--   app_league_current                base: 20261003003800 (única)
--   app_gamification_summary          base: 20261003003800 (única)
--   ch_worker_gamification_close_week base: 20261003009570 (AR02, AR03 e AR06 preservados)
--   app_admin_gamification            base: 20261003009571 (AR04 e AR07 preservados; a 20261003009573 não a redefine)
-- Não mexem: gam_award (chama gam_join_league), ch_worker_gamification_daily (as fotos usam gam_board; quem não está nele fica sem posição).
--
-- Para desfazer: recolocar as versões-base acima (cada uma está inteira na sua migração) e, se quiser devolver as inscrições,
-- refazer o insert em league_memberships a partir do campo "memberships" do registro 'arena_sem_equipe' em gamification_jobs.
-- =============================================================================

create or replace function public.gam_board(p_kind text)
  returns table (user_id uuid, value numeric, rank bigint, total bigint)
  language sql stable security definer set search_path = ''
as $$
  with base as (
    select s.*
    from public.user_gamification_stats s
    join public.gamification_preferences g on g.user_id = s.user_id
    where g.leaderboard_visibility <> 'hidden'
      -- AR05: a equipe (administrador e editor) não entra em nenhum ranking; vale na hora, pela função de equipe do sistema
      and not public.user_is_staff(s.user_id)
      and case p_kind
        when 'geral' then not s.provisional
        when 'semana' then s.weekly_xp > 0
        when 'mes' then s.monthly_xp > 0
        when 'precisao' then s.questions_answered >= public.gam_num('ranking.accuracy_min_questions', 200)
        when 'evolucao' then s.evolution_pts is not null and not s.provisional
        when 'questoes' then s.questions_answered > 0
        when 'streak' then s.current_streak > 0
        else false end
  )
  select b.user_id,
         case p_kind when 'geral' then b.stazia_score when 'semana' then b.weekly_xp when 'mes' then b.monthly_xp
                     when 'precisao' then b.accuracy when 'evolucao' then b.evolution_pts when 'questoes' then b.questions_answered
                     when 'streak' then b.current_streak end::numeric,
         row_number() over (order by
           case p_kind when 'geral' then b.stazia_score when 'semana' then b.weekly_xp when 'mes' then b.monthly_xp
                       when 'precisao' then b.accuracy when 'evolucao' then b.evolution_pts when 'questoes' then b.questions_answered
                       when 'streak' then b.current_streak end desc,
           case p_kind when 'semana' then b.correct_answers when 'mes' then b.correct_answers else b.accuracy end desc,
           b.avg_difficulty desc, b.questions_answered desc, b.score_reached_at asc nulls last, b.user_id),
         count(*) over ()
  from base b
$$;

create or replace function public.gam_join_league(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.league_seasons;
  v_league text;
  v_group integer;
  v_size constant integer := greatest(public.gam_num('league.group_size', 30)::int, 2);
begin
  -- AR05: a equipe não entra em liga
  if public.user_is_staff(p_user) then return; end if;
  s := public.gam_open_season();
  if exists (select 1 from public.league_memberships m where m.season_id = s.id and m.user_id = p_user) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('gam:league:' || s.id::text, 0));
  v_league := coalesce((select st.current_league from public.user_gamification_stats st where st.user_id = p_user), 'bronze');
  select g.group_no into v_group
  from (select m.group_no, count(*) as n from public.league_memberships m
        where m.season_id = s.id and m.league_slug = v_league group by m.group_no) g
  where g.n < v_size order by g.group_no limit 1;
  if v_group is null then
    select coalesce(max(m.group_no), 0) + 1 into v_group from public.league_memberships m where m.season_id = s.id and m.league_slug = v_league;
  end if;
  insert into public.league_memberships (season_id, user_id, league_slug, group_no) values (s.id, p_user, v_league, v_group)
  on conflict do nothing;
  update public.user_gamification_stats set current_league = v_league where user_id = p_user and current_league is null;
end
$$;

create or replace function public.app_league_current() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  se public.league_seasons;
  m public.league_memberships;
  v_size constant int := public.gam_num('league.group_size', 30)::int;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.gam_flag('flags.leagues_enabled') then return jsonb_build_object('enabled', false); end if;
  select * into se from public.league_seasons where status = 'open' order by starts_on desc limit 1;
  if se.id is null then return jsonb_build_object('enabled', true, 'joined', false); end if;
  select * into m from public.league_memberships where season_id = se.id and user_id = v_uid;
  -- AR05: a equipe não participa de liga (mesmo que ainda haja uma inscrição antiga, ela some da tela)
  if not found or public.user_is_staff(v_uid) then
    return jsonb_build_object('enabled', true, 'joined', false, 'ends_on', se.ends_on,
      'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l));
  end if;
  return jsonb_build_object(
    'enabled', true, 'joined', true, 'season', jsonb_build_object('starts_on', se.starts_on, 'ends_on', se.ends_on),
    'league', (select to_jsonb(l) from public.leagues l where l.slug = m.league_slug),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'group_no', m.group_no, 'promote', public.gam_num('league.promote', 5)::int, 'relegate', public.gam_num('league.relegate', 5)::int,
    'min_group_for_relegation', public.gam_num('league.min_group_for_relegation', 10)::int, 'group_size', v_size,
    'rows', coalesce((select jsonb_agg(public.gam_board_row(x.user_id, v_uid) || jsonb_build_object('position', x.pos, 'weekly_xp', x.weekly_xp) order by x.pos)
                      from (select o.user_id, o.weekly_xp, row_number() over (order by o.weekly_xp desc, o.joined_at, o.user_id) as pos
                            from public.league_memberships o where o.season_id = se.id and o.league_slug = m.league_slug and o.group_no = m.group_no
                              and not public.user_is_staff(o.user_id)) x), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('starts_on', s2.starts_on, 'league', h.league_slug, 'position', h.position, 'outcome', h.outcome, 'weekly_xp', h.weekly_xp) order by s2.starts_on desc)
                         from public.league_memberships h join public.league_seasons s2 on s2.id = h.season_id
                         where h.user_id = v_uid and s2.status = 'closed'), '[]'::jsonb));
end
$$;

create or replace function public.app_gamification_summary() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  st public.user_gamification_stats;
  v_today date; v_week date;
  f jsonb;
  se public.league_seasons;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.gam_flag('flags.gamification_enabled') then return jsonb_build_object('enabled', false); end if;
  perform public.gam_ensure(v_uid);
  perform public.gam_generate_missions(v_uid);
  select * into st from public.user_gamification_stats where user_id = v_uid;
  v_today := public.gam_today(v_uid); v_week := public.gam_week_start(v_today);
  f := public.gam_facts(v_uid, v_today, v_today);
  select * into se from public.league_seasons where status = 'open' order by starts_on desc limit 1;
  return jsonb_build_object(
    'enabled', true,
    'flags', jsonb_build_object('leaderboard', public.gam_flag('flags.leaderboard_enabled'), 'leagues', public.gam_flag('flags.leagues_enabled'),
                                'coins', public.gam_flag('flags.coins_enabled'), 'trail', public.gam_flag('flags.trail_enabled')),
    'names', jsonb_build_object('score', public.gam_text('names.score', 'Stazia Score'), 'coins', public.gam_text('names.coins', 'Stazia Coins')),
    'score', st.stazia_score, 'provisional', st.provisional, 'score_min_questions', public.gam_num('score.min_questions', 50)::int,
    'components', st.score_components, 'evolution_pts', st.evolution_pts,
    'level', (select to_jsonb(l) from public.levels l where l.slug = st.current_level),
    'next_level', (select to_jsonb(l) from public.levels l where l.min_score > st.stazia_score order by l.min_score limit 1),
    'xp', jsonb_build_object('total', st.total_xp, 'weekly', st.weekly_xp, 'monthly', st.monthly_xp,
                             'today', (select coalesce(sum(e.xp_awarded), 0)::int from public.gamification_events e
                                       where e.user_id = v_uid and (e.created_at at time zone public.gam_tz(v_uid))::date = v_today)),
    'coins', st.coins,
    'questions', st.questions_answered, 'accuracy', st.accuracy,
    'streak', jsonb_build_object('current', st.current_streak, 'longest', st.longest_streak, 'freezes', st.streak_freezes,
                                 'today_done', st.last_qualified_date = v_today,
                                 'today', jsonb_build_object('questions', f -> 'questions', 'minutes', f -> 'minutes',
                                                             'min_questions', public.gam_num('streak.min_questions', 10)::int,
                                                             'min_minutes', public.gam_num('streak.min_minutes', 20)::int)),
    'rank', public.app_my_rank('geral'),
    'weekly_rank', public.app_my_rank('semana'),
    'league', case when public.gam_flag('flags.leagues_enabled') and se.id is not null and not public.user_is_staff(v_uid) then (
       select jsonb_build_object('slug', m.league_slug, 'name', l.name, 'icon', l.icon, 'color_token', l.color_token, 'group_no', m.group_no, 'weekly_xp', m.weekly_xp,
                                 'ends_on', se.ends_on,
                                 'position', (select count(*) + 1 from public.league_memberships o
                                              where o.season_id = m.season_id and o.league_slug = m.league_slug and o.group_no = m.group_no
                                                and not public.user_is_staff(o.user_id)
                                                and (o.weekly_xp > m.weekly_xp or (o.weekly_xp = m.weekly_xp and o.joined_at < m.joined_at))),
                                 'group_size', (select count(*) from public.league_memberships o
                                                where o.season_id = m.season_id and o.league_slug = m.league_slug and o.group_no = m.group_no
                                                  and not public.user_is_staff(o.user_id)))
       from public.league_memberships m join public.leagues l on l.slug = m.league_slug where m.season_id = se.id and m.user_id = v_uid) end,
    'missions', (select jsonb_build_object('done', count(*) filter (where u.completed_at is not null), 'total', count(*),
                   'items', coalesce(jsonb_agg(jsonb_build_object('slug', u.mission_slug, 'title', format(m.title, u.target), 'icon', m.icon,
                                                                  'progress', u.progress, 'target', u.target, 'done', u.completed_at is not null,
                                                                  'xp', m.xp_reward, 'coins', m.coins_reward) order by m.position), '[]'::jsonb))
                 from public.user_missions u join public.missions m on m.slug = u.mission_slug
                 where u.user_id = v_uid and u.period = 'daily' and u.period_start = v_today),
    'recent_achievements', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'icon', a.icon, 'rarity', a.rarity, 'unlocked_at', u.unlocked_at) order by u.unlocked_at desc)
                                     from (select * from public.user_achievements where user_id = v_uid order by unlocked_at desc limit 3) u
                                     join public.achievements a on a.slug = u.achievement_slug), '[]'::jsonb),
    'achievements_total', (select count(*) from public.user_achievements where user_id = v_uid),
    'unseen_achievements', (select count(*) from public.user_achievements where user_id = v_uid and seen_at is null),
    'hours_studied', (select round(coalesce(sum(a.active_ms), 0) / 3600000.0, 1) from public.question_attempts a where a.user_id = v_uid));
end
$$;

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
  v_closed int := 0; v_promoted int := 0; v_relegated int := 0; v_staff_out int := 0;
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

  -- AR05: quem virou equipe depois de entrar na liga sai da temporada que fecha (só a inscrição; XP, moedas e histórico ficam).
  -- Assim a equipe nunca ocupa posição, sobe, desce nem ganha medalha de top 10, e os alunos contam só entre alunos.
  with fora as (
    delete from public.league_memberships m where m.season_id = se.id and public.user_is_staff(m.user_id) returning m.*
  ), reg as (
    insert into public.gamification_jobs (job, period_key, result)
    select 'arena_sem_equipe', 'semana-' || se.id::text, jsonb_build_object('season', se.id, 'removed', count(*), 'memberships', jsonb_agg(to_jsonb(f)))
    from fora f having count(*) > 0
    on conflict (job, period_key) do nothing
  )
  select count(*) into v_staff_out from fora;

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
          -- AR05: a equipe não é inscrita na temporada nova
          where not public.user_is_staff(s.user_id)
            and s.last_qualified_activity_at >= now() - make_interval(days => v_active)) x
    on conflict do nothing;
  end if;

  insert into public.gamification_jobs (job, period_key, result) values ('close_week', se.id::text,
    jsonb_build_object('closed', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id, 'leagues', v_leagues, 'staff_removed', v_staff_out));
  return jsonb_build_object('closed', true, 'season', se.id, 'members', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id, 'leagues', v_leagues, 'staff_removed', v_staff_out);
end
$$;

create or replace function public.app_admin_gamification() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    -- AR07: o feed social (fase futura) existe no banco, mas nada o usa: não aparece para editar
    'rules', (select jsonb_agg(to_jsonb(r) order by r.key) from public.gamification_rules r where r.key <> 'flags.social_feed_enabled'),
    'rule_problems', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'problem', public.gam_rule_problem(r.key, r.value)) order by r.key)
                               from public.gamification_rules r where public.gam_rule_problem(r.key, r.value) is not null), '[]'::jsonb),
    'levels', (select jsonb_agg(to_jsonb(l) order by l.position) from public.levels l),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'achievements', (select jsonb_agg(to_jsonb(a) order by a.category, a.position) from public.achievements a),
    -- AR04: o alvo mostrado é o que o motor usa de verdade (a regra, se estiver ligada e válida; senão o valor da própria missão)
    'missions', (select jsonb_agg(to_jsonb(m) || jsonb_build_object('target_default', coalesce(
                   (select (r.value #>> '{}')::numeric::int from public.gamification_rules r
                    where r.key = m.target_rule and r.enabled and public.gam_rule_problem(r.key, r.value) is null), m.target_default))
                 order by m.period, m.position) from public.missions m),
    'rewards', (select jsonb_agg(to_jsonb(x) order by x.position) from public.rewards x),
    'metrics', jsonb_build_object(
      'users_active', (select count(*) from public.user_gamification_stats where last_qualified_activity_at > now() - interval '7 days'),
      'users_total', (select count(*) from public.user_gamification_stats),
      'xp_today', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at >= (public.today_br()::timestamp at time zone 'America/Sao_Paulo')),
      'xp_7d', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at > now() - interval '7 days'),
      'coins_issued', (select coalesce(sum(amount), 0) from public.coin_transactions where amount > 0),
      'missions_completed_7d', (select count(*) from public.user_missions where completed_at > now() - interval '7 days'),
      'achievements_7d', (select count(*) from public.user_achievements where unlocked_at > now() - interval '7 days'),
      'avg_streak', (select round(avg(current_streak), 1) from public.user_gamification_stats where current_streak > 0),
      'suspicious_7d', (select count(*) from public.gamification_events where not is_valid and created_at > now() - interval '7 days'),
      'suspicious_by_reason', (select coalesce(jsonb_object_agg(x.r, x.n), '{}'::jsonb) from (select fraud_reason as r, count(*) as n from public.gamification_events where not is_valid group by 1) x),
      'by_league', (select coalesce(jsonb_object_agg(x.l, x.n), '{}'::jsonb) from (select coalesce(current_league, 'sem liga') as l, count(*) as n from public.user_gamification_stats where not public.user_is_staff(user_id) group by 1) x),
      'top10', coalesce((select jsonb_agg(public.gam_board_row(b.user_id, null) || jsonb_build_object('rank', b.rank, 'user_id', b.user_id) order by b.rank)
                         from public.gam_board('geral') b where b.rank <= 10), '[]'::jsonb),
      'events_24h', (select count(*) from public.gamification_events where created_at > now() - interval '24 hours'),
      'season', (select to_jsonb(s) from public.league_seasons s where s.status = 'open' order by s.starts_on desc limit 1),
      'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.ran_at desc) from (select * from public.gamification_jobs order by ran_at desc limit 10) j), '[]'::jsonb),
      'xp_failures_7d', (select count(*) from public.gamification_failures where created_at > now() - interval '7 days'),
      'xp_failures_recent', coalesce((select jsonb_agg(jsonb_build_object('created_at', f.created_at, 'step', f.step, 'bad_rules', f.bad_rules, 'detail', f.detail) order by f.id desc)
                                      from (select * from public.gamification_failures order by id desc limit 5) f), '[]'::jsonb)));
end
$$;

-- Funções internas: o cliente não executa. As do aluno e da Administração: só logado (a da Administração ainda confere assert_admin()).
revoke execute on function public.gam_board(text) from public, anon, authenticated;
revoke execute on function public.gam_join_league(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_gamification_close_week() from public, anon, authenticated;
revoke execute on function public.app_league_current() from public, anon;
revoke execute on function public.app_gamification_summary() from public, anon;
revoke execute on function public.app_admin_gamification() from public, anon;
grant execute on function public.app_league_current() to authenticated;
grant execute on function public.app_gamification_summary() to authenticated;
grant execute on function public.app_admin_gamification() to authenticated;

-- ---------------------------------------------------------------- limpeza de quem já estava numa liga como equipe
-- Só a temporada aberta, só a inscrição; guarda o que foi retirado no registro das rotinas. Sem nada a retirar, não faz nada.
with fora as (
  delete from public.league_memberships m
  using public.league_seasons se
  where se.id = m.season_id and se.status = 'open' and public.user_is_staff(m.user_id)
  returning m.*
)
insert into public.gamification_jobs (job, period_key, result)
select 'arena_sem_equipe', 'migracao-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'),
       jsonb_build_object('removed', count(*), 'memberships', jsonb_agg(to_jsonb(f)))
from fora f
having count(*) > 0;
