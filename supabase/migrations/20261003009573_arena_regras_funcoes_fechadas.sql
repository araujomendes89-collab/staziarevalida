-- =============================================================================
-- Stazia Arena: as funções que leem as regras deixam de ser chamáveis pelo aluno (continuação do AR09, 2026-10-11).
-- Cole depois da 20261003009572.
--
-- A 9572 fechou a TABELA de regras, mas gam_rule, gam_num, gam_flag e gam_text (security definer) continuavam executáveis por
-- qualquer aluno logado pela API (o Postgres dá EXECUTE a PUBLIC por padrão): bastava chamar gam_rule('fraud.rate_limit_per_minute').
-- Agora o EXECUTE sai de public, anon e authenticated. O motor (gatilhos e funções security definer) continua chamando por dentro.
--
-- Duas funções do aluno chamavam essas quatro como security invoker e quebrariam com "permission denied"; ficam assim:
--  * app_bootstrap (abertura do app): o bloco "play" vai para gam_play_boot (security definer, só o próprio aluno). O resto
--    da app_bootstrap é igual ao da 20261003005300.
--  * gam_turn_summary (resumo de XP da resposta): passa a security definer, com a trava de só devolver o resumo do próprio aluno.
-- Nada é apagado nem recalculado. Cole quantas vezes quiser.
-- =============================================================================

-- O bloco "play" da abertura do app (flags, nomes, sequência, score, nível, moedas do próprio aluno). Antes o app_bootstrap
-- (security invoker) chamava gam_flag/gam_text direto; com essas funções fechadas ao aluno (CRÍTICO do revisor), o trecho que lê
-- as regras vira esta função interna (security definer), que devolve só dados do próprio aluno (auth.uid()), como antes.
create or replace function public.gam_play_boot() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when public.gam_flag('flags.gamification_enabled') then jsonb_build_object(
      'enabled', true,
      'flags', jsonb_build_object('leaderboard', public.gam_flag('flags.leaderboard_enabled'), 'leagues', public.gam_flag('flags.leagues_enabled'),
                                  'coins', public.gam_flag('flags.coins_enabled'), 'trail', public.gam_flag('flags.trail_enabled')),
      'names', jsonb_build_object('score', public.gam_text('names.score', 'Stazia Score'), 'coins', public.gam_text('names.coins', 'Stazia Coins')),
      'streak', coalesce((select s.current_streak from public.user_gamification_stats s where s.user_id = (select auth.uid())), 0),
      'score', (select s.stazia_score from public.user_gamification_stats s where s.user_id = (select auth.uid())),
      'provisional', coalesce((select s.provisional from public.user_gamification_stats s where s.user_id = (select auth.uid())), true),
      'level', coalesce((select s.current_level from public.user_gamification_stats s where s.user_id = (select auth.uid())), 'iniciante'),
      'coins', coalesce((select s.coins from public.user_gamification_stats s where s.user_id = (select auth.uid())), 0))
      else jsonb_build_object('enabled', false) end
$$;

-- Abertura do app (partida: a 20261003005300), só trocando o bloco "play" pela função acima. Continua security invoker.
create or replace function public.app_bootstrap() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'onboarding' from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'reviewer_areas', coalesce((select jsonb_agg(r.area_code order by r.area_code) from public.ch_reviewer_areas r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'subscription', (
      select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_ends_at', s.trial_ends_at,
                                'current_period_end', s.current_period_end)
      from public.subscriptions s where s.user_id = (select auth.uid())
    ),
    'has_pro', public.has_pro(),
    'streak_days', public.my_streak_days(),
    'flashcards_due', (
      select count(*)::int from public.flashcard_states f
      where f.user_id = (select auth.uid()) and f.due <= now()
    ),
    'days_to_exam', (
      select case when p.exam_date is null then null else greatest(p.exam_date - public.today_br(), 0) end
      from public.profiles p where p.id = (select auth.uid())
    ),
    'totals', jsonb_build_object(
      'questions', (select count(*)::int from public.questions),
      'answered', (select count(distinct a.question_id)::int from public.question_attempts a
                   where a.user_id = (select auth.uid()))
    ),
    'play', public.gam_play_boot(),
    'legal', public.app_legal_state()
  )
$$;

-- Resumo de XP da resposta (partida: a 20261003008100), agora security definer e só do próprio aluno.
create or replace function public.gam_turn_summary(p_user uuid, p_attempt uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  -- security definer: só devolve o resumo do próprio aluno (antes isso vinha do RLS, que a função não tinha como burlar)
  if p_user is distinct from (select auth.uid()) then return null; end if;
  return (
  select case when not public.gam_flag('flags.gamification_enabled') then null else jsonb_build_object(
    'xp', (select jsonb_build_object('total', e.xp_awarded, 'valid', e.is_valid, 'reason', e.fraud_reason, 'multiplier', e.metadata -> 'multiplier') || coalesce(e.metadata -> 'breakdown', '{}'::jsonb)
           from public.gamification_events e where e.user_id = p_user and e.source_type = 'question_attempt' and e.source_id = p_attempt::text),
    'bonus', coalesce((select jsonb_agg(jsonb_build_object('type', e.event_type, 'xp', e.xp_awarded, 'coins', e.coins_awarded, 'meta', e.metadata))
                       from public.gamification_events e where e.user_id = p_user and e.created_at >= now() and e.xp_awarded > 0
                         and e.event_type in ('SESSION_10', 'SESSION_30', 'MISSION_COMPLETED', 'DAILY_MISSIONS_COMPLETED', 'DAILY_GOAL_COMPLETED')), '[]'::jsonb),
    'coins', (select e.coins_awarded from public.gamification_events e where e.user_id = p_user and e.source_type = 'question_attempt' and e.source_id = p_attempt::text),
    'stats', (select jsonb_build_object('total_xp', s.total_xp, 'weekly_xp', s.weekly_xp, 'coins', s.coins, 'score', s.stazia_score, 'provisional', s.provisional,
                                        'level', s.current_level, 'streak', s.current_streak, 'streak_today', s.last_qualified_date = public.gam_today(p_user))
              from public.user_gamification_stats s where s.user_id = p_user),
    'streak_incremented', exists (select 1 from public.gamification_events e where e.user_id = p_user and e.event_type = 'STREAK_INCREMENTED' and e.created_at >= now()),
    'level_up', (select jsonb_build_object('from', e.metadata ->> 'from', 'to', e.metadata ->> 'to') from public.gamification_events e
                 where e.user_id = p_user and e.event_type = 'LEVEL_UP' and e.created_at >= now() order by e.id desc limit 1),
    'achievements_unlocked', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'description', a.description, 'icon', a.icon, 'rarity', a.rarity, 'xp', a.xp_reward, 'coins', a.coins_reward))
                                       from public.user_achievements u join public.achievements a on a.slug = u.achievement_slug
                                       where u.user_id = p_user and u.unlocked_at >= now()), '[]'::jsonb),
    'missions', (select jsonb_build_object('done', count(*) filter (where u.completed_at is not null), 'total', count(*))
                 from public.user_missions u where u.user_id = p_user and u.period = 'daily' and u.period_start = public.gam_today(p_user))) end
  );
exception when others then
  return null;
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.gam_rule(text) from public, anon, authenticated;
revoke execute on function public.gam_num(text, numeric) from public, anon, authenticated;
revoke execute on function public.gam_flag(text) from public, anon, authenticated;
revoke execute on function public.gam_text(text, text) from public, anon, authenticated;
