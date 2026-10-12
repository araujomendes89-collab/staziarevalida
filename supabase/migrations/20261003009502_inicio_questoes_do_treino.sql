-- =============================================================================
-- Início do aluno: a contagem de questões do tema prioritário só inclui as que entram no treino (Q15, 2026-10-11).
--
-- Antes: "questions" de cada tema prioritário contava as questões do tema que não estão anuladas, inclusive as que citam
-- figura ainda sem imagem vinculada, que ficam fora dos treinos (practice_pool). O aluno via mais questões do que conseguia fazer.
-- Agora: a mesma regra do treino. É a app_home da …4600 (a mais nova), só com essa condição a mais. Pode ser colada duas vezes.
-- =============================================================================

create or replace function public.app_home() returns jsonb
  language sql stable set search_path = ''
as $$
  with my as (
    select a.is_correct, (a.answered_at at time zone 'America/Sao_Paulo')::date as day, q.area
    from public.question_attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = (select auth.uid()) and q.status <> 'annulled'
  ),
  totals as (
    select count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from my
  )
  select jsonb_build_object(
    'attempts', (select attempts from totals),
    'correct', (select correct from totals),
    'today', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int)
      from my where day = public.today_br()),
    'week', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int,
                                'days_active', count(distinct day)::int)
      from my where day > public.today_br() - 7),
    'previous_week', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int)
      from my where day > public.today_br() - 14 and day <= public.today_br() - 7),
    'wrong_pending', (select count(*)::int from public.my_error_notebook e where e.status = 'para_revisar'),
    'areas', (
      select jsonb_agg(jsonb_build_object('area', e.area, 'attempts', coalesce(s.attempts, 0), 'correct', coalesce(s.correct, 0))
                       order by e.area)
      from unnest(enum_range(null::public.med_area)) as e (area)
      left join (
        select area, count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from my group by area
      ) s on s.area = e.area),
    -- Temas com questão errada ainda não superada, dos de pior acurácia para os melhores. "questions" conta só as questões que
    -- entram no treino (sem anulada e sem as que citam figura ainda sem imagem: a mesma regra de practice_pool) (Q15).
    'priority_topics', coalesce((
      select jsonb_agg(jsonb_build_object('area', p.area, 'topic', p.topic, 'pending', p.pending, 'attempts', p.attempts,
                                          'correct', p.correct, 'questions', p.questions)
                       order by p.accuracy, p.pending desc, p.topic)
      from (
        select e.area, e.topic, count(*)::int as pending, st.attempts, st.correct, st.accuracy,
               (select count(*)::int from public.questions q
                where q.area = e.area and q.topic = e.topic and q.status <> 'annulled'
                  and not (q.needs_image and jsonb_array_length(q.images) = 0)) as questions
        from public.my_error_notebook e
        join public.my_topic_stats st on st.area = e.area and st.topic = e.topic
        where e.status = 'para_revisar'
        group by e.area, e.topic, st.attempts, st.correct, st.accuracy
        order by st.accuracy, count(*) desc, e.topic
        limit 4
      ) p
    ), '[]'::jsonb),
    -- Treino ou simulado em aberto (e ainda dentro do tempo, sem contar as pausas) para continuar.
    'open_session', (
      select jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'total', cardinality(s.question_ids),
        'area', s.config -> 'filters' ->> 'area', 'status', s.config -> 'filters' ->> 'status',
        'answered', case when s.kind = 'simulado'
                         then (select count(*)::int from jsonb_object_keys(s.answers))
                         else (select count(*)::int from public.question_attempts a where a.session_id = s.id) end,
        'paused', s.paused_at is not null,
        'remaining_seconds', case when s.time_limit_seconds is not null
                                  then greatest(ceil(extract(epoch from public.practice_deadline(s) - now())), 0)::int end)
      from public.practice_sessions s
      where s.user_id = (select auth.uid()) and s.finished_at is null
        and (s.time_limit_seconds is null or now() <= public.practice_deadline(s))
      order by s.started_at desc
      limit 1),
    -- Equipe não tem período de teste.
    'trial', (
      select case when sub.status = 'trialing' and sub.trial_ends_at is not null and not public.is_staff() then
        jsonb_build_object('ends_at', sub.trial_ends_at,
                           'days_left', greatest(ceil(extract(epoch from (sub.trial_ends_at - now())) / 86400.0)::int, 0))
      end
      from public.subscriptions sub where sub.user_id = (select auth.uid()))
  )
$$;

-- Para desfazer: recriar app_home como na …4600.
