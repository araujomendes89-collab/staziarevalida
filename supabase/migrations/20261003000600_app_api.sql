-- =============================================================================
-- API do app: funções que as telas chamam (supabase.rpc). Todas rodam com os
-- direitos de quem chama (SECURITY INVOKER), então o RLS continua valendo, e
-- devolvem jsonb para o cliente não depender do formato das tabelas.
-- =============================================================================

-- Dia corrente no fuso do aluno brasileiro.
create function public.today_br() returns date
  language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Sequência de dias seguidos com estudo (questões ou flashcards), contando hoje
-- ou, se hoje ainda não estudou, até ontem.
create function public.my_streak_days() returns integer
  language sql stable set search_path = ''
as $$
  with days as (
    select day from public.my_daily_activity where day <= public.today_br()
  ),
  anchor as (
    select case
      when exists (select 1 from days where day = public.today_br()) then public.today_br()
      when exists (select 1 from days where day = public.today_br() - 1) then public.today_br() - 1
    end as d
  ),
  numbered as (
    select day, (select d from anchor) - day as gap, row_number() over (order by day desc) - 1 as rn
    from days where day <= (select d from anchor)
  )
  select coalesce((select count(*)::int from numbered where gap = rn), 0)
$$;

-- Tudo o que a estrutura do app precisa ao abrir.
create function public.app_bootstrap() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'onboarding' from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
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
    )
  )
$$;

-- Atualiza só os campos do perfil que o aluno pode mudar.
create function public.app_update_profile(p_patch jsonb) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  allowed constant text[] := array['name', 'avatar_seed', 'phase', 'exam_type', 'target_edition', 'exam_date',
                                   'daily_minutes', 'study_days_per_week', 'graduation_country',
                                   'graduation_university', 'graduation_year', 'theme'];
  k text;
begin
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (allowed)) then
      raise exception 'Campo de perfil não permitido: %', k using errcode = '22023';
    end if;
  end loop;

  update public.profiles p set
    name = coalesce(p_patch ->> 'name', p.name),
    avatar_seed = case when p_patch ? 'avatar_seed' then p_patch ->> 'avatar_seed' else p.avatar_seed end,
    phase = coalesce((p_patch ->> 'phase')::smallint, p.phase),
    exam_type = coalesce(p_patch ->> 'exam_type', p.exam_type),
    target_edition = case when p_patch ? 'target_edition' then p_patch ->> 'target_edition' else p.target_edition end,
    exam_date = case when p_patch ? 'exam_date' then (p_patch ->> 'exam_date')::date else p.exam_date end,
    daily_minutes = case when p_patch ? 'daily_minutes' then (p_patch ->> 'daily_minutes')::int else p.daily_minutes end,
    study_days_per_week = case when p_patch ? 'study_days_per_week' then (p_patch ->> 'study_days_per_week')::smallint else p.study_days_per_week end,
    graduation_country = case when p_patch ? 'graduation_country' then p_patch ->> 'graduation_country' else p.graduation_country end,
    graduation_university = case when p_patch ? 'graduation_university' then p_patch ->> 'graduation_university' else p.graduation_university end,
    graduation_year = case when p_patch ? 'graduation_year' then (p_patch ->> 'graduation_year')::smallint else p.graduation_year end,
    theme = coalesce(p_patch ->> 'theme', p.theme)
  where p.id = (select auth.uid());

  return public.app_bootstrap();
end
$$;
