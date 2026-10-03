-- =============================================================================
-- Planejamento: semana do aluno, dias estudados no mês e o ritmo até a prova.
-- Tudo sai do perfil e do histórico do próprio aluno (SECURITY INVOKER: o RLS vale).
-- =============================================================================

-- Questões por dia conforme o tempo de estudo (mesma regra do Plano de hoje, app_today).
create function public.daily_question_target(p_minutes integer) returns integer
  language sql immutable set search_path = ''
as $$
  select case
    when p_minutes is null then 20
    when p_minutes <= 30 then 10
    when p_minutes <= 60 then 20
    when p_minutes <= 120 then 30
    else 50
  end
$$;

create function public.app_planning() returns jsonb
  language sql stable set search_path = ''
as $$
  with week as (
    -- semana de segunda a domingo, no fuso do aluno
    select public.today_br() - (extract(isodow from public.today_br())::int - 1) + g as day
    from generate_series(0, 6) as g
  )
  select jsonb_build_object(
    'today', public.today_br(),
    'exam_type', p.exam_type,
    'target_edition', p.target_edition,
    'exam_date', p.exam_date,
    'days_to_exam', case when p.exam_date is null then null else greatest(p.exam_date - public.today_br(), 0) end,
    'daily_minutes', p.daily_minutes,
    'daily_target', public.daily_question_target(p.daily_minutes),
    'week', (
      select jsonb_agg(jsonb_build_object('day', w.day, 'questions', coalesce(a.questions, 0),
                                          'correct', coalesce(a.correct, 0), 'flashcards', coalesce(a.flashcards, 0))
                       order by w.day)
      from week w
      left join public.my_daily_activity a on a.day = w.day),
    'month_active_days', coalesce((
      select jsonb_agg(extract(day from a.day)::int order by a.day)
      from public.my_daily_activity a
      where date_trunc('month', a.day) = date_trunc('month', public.today_br())
    ), '[]'::jsonb),
    'last_7_days', (
      select coalesce(sum(a.questions), 0)::int from public.my_daily_activity a
      where a.day > public.today_br() - 7 and a.day <= public.today_br()),
    'unanswered', (select count(*)::int from public.practice_pool('{"status": "unanswered"}'::jsonb)),
    'pool', (select count(*)::int from public.practice_pool('{}'::jsonb))
  )
  from public.profiles p
  where p.id = (select auth.uid())
$$;
