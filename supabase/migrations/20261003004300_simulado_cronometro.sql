-- =============================================================================
-- Cronômetro do simulado: o aluno escolhe o tempo, pausa, continua e encerra.
--
-- O tempo escolhido já cabia em app_start_session (de 1 minuto a 12 horas). Aqui entra a pausa:
--  - paused_at: quando a pausa atual começou (nulo = cronômetro correndo);
--  - paused_ms: soma das pausas já encerradas.
-- O prazo do simulado passa a ser início + tempo escolhido + pausas. Pausado, o prazo anda junto com o
-- relógio (o tempo não corre) e o banco não aceita respostas (a tela esconde a questão).
-- Finalizar com o simulado pausado encerra a pausa. O tempo do resultado não conta as pausas.
-- Só o simulado pausa; o treino não tem cronômetro.
-- =============================================================================

alter table public.practice_sessions
  add column paused_at timestamptz,
  add column paused_ms bigint not null default 0 check (paused_ms >= 0),
  add constraint practice_sessions_pause_check check (paused_at is null or (finished_at is null and kind = 'simulado'));

-- Prazo do simulado com as pausas descontadas (nulo = sem cronômetro). Pausado, o prazo anda com o relógio.
create function public.practice_deadline(s public.practice_sessions, p_now timestamptz default now()) returns timestamptz
  language sql stable set search_path = ''
as $$
  select case when s.time_limit_seconds is null then null else
    s.started_at
    + make_interval(secs => (s.time_limit_seconds + s.paused_ms / 1000.0)::double precision)
    + case when s.paused_at is null then interval '0' else greatest(p_now - s.paused_at, interval '0') end
  end
$$;

-- Situação do cronômetro no formato que a tela usa. Pausado, remaining_seconds fica parado.
create function public.practice_timer(s public.practice_sessions, p_now timestamptz default now()) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'time_limit_seconds', s.time_limit_seconds,
    'paused_at', s.paused_at,
    'paused_seconds', floor((s.paused_ms + case when s.paused_at is null then 0
                                                 else greatest(extract(epoch from p_now - s.paused_at) * 1000, 0) end) / 1000)::int,
    'deadline_at', public.practice_deadline(s, p_now),
    'remaining_seconds', case when s.time_limit_seconds is not null
                              then greatest(ceil(extract(epoch from public.practice_deadline(s, p_now) - p_now)), 0)::int end,
    'server_now', p_now
  )
$$;

-- ---------------------------------------------------------------- pausar e continuar
create function public.app_pause_session(p_session_id uuid) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
  v_now constant timestamptz := clock_timestamp();
begin
  select * into s from public.practice_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if s.finished_at is not null then
    raise exception 'Esta sessão já foi finalizada.' using errcode = '22023';
  end if;
  if s.kind <> 'simulado' then
    raise exception 'Só o simulado tem pausa.' using errcode = '22023';
  end if;
  if s.paused_at is null then
    if s.time_limit_seconds is not null and v_now > public.practice_deadline(s, v_now) then
      raise exception 'O tempo do simulado acabou.' using errcode = '22023';
    end if;
    update public.practice_sessions set paused_at = v_now where id = s.id returning * into s;
  end if;
  return public.practice_timer(s, v_now);
end
$$;

create function public.app_resume_session(p_session_id uuid) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
  v_now constant timestamptz := clock_timestamp();
begin
  select * into s from public.practice_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if s.finished_at is not null then
    raise exception 'Esta sessão já foi finalizada.' using errcode = '22023';
  end if;
  if s.paused_at is not null then
    update public.practice_sessions
      set paused_ms = paused_ms + greatest(floor(extract(epoch from v_now - s.paused_at) * 1000), 0)::bigint,
          paused_at = null
      where id = s.id
      returning * into s;
  end if;
  return public.practice_timer(s, v_now);
end
$$;

-- ---------------------------------------------------------------- funções que já existiam, agora com a pausa
-- Sessão para a tela: igual à anterior (…1900_answer_key_lockdown), mais a situação do cronômetro.
create or replace function public.app_get_session(p_session_id uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'kind', s.kind,
    'filters', s.config -> 'filters',
    'started_at', s.started_at,
    'finished_at', s.finished_at,
    'questions', (
      select jsonb_agg(
        public.practice_question_view(q.id) || jsonb_build_object(
          'bookmarked', b.question_id is not null,
          'selected', coalesce(a.selected_option::text, s.answers -> q.id ->> 'option'),
          'active_ms', coalesce(a.active_ms, (s.answers -> q.id ->> 'ms')::integer, 0),
          'correction', case
            when s.finished_at is not null or (s.kind <> 'simulado' and a.id is not null)
            then public.practice_correction_view(q.id, a.selected_option::text)
          end
        )
        order by u.ord
      )
      from unnest(s.question_ids) with ordinality as u (question_id, ord)
      join public.questions q on q.id = u.question_id
      left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
      left join public.question_bookmarks b on b.user_id = (select auth.uid()) and b.question_id = q.id
    ),
    'result', case when s.finished_at is not null then public.practice_result(s.id) end
  ) || public.practice_timer(s, now())
  from public.practice_sessions s
  where s.id = p_session_id
$$;

-- Resposta: igual à do Stazia Play (…3800), mais a pausa (pausado não responde) e o prazo com as pausas.
create or replace function public.app_answer_question(
  p_session_id uuid,
  p_question_id text,
  p_option text,
  p_active_ms integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
  v_selected text;
  v_attempt uuid;
  v_ms constant integer := least(greatest(coalesce(p_active_ms, 0), 0), 86400000);
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if s.finished_at is not null then
    raise exception 'Esta sessão já foi finalizada.' using errcode = '22023';
  end if;
  if p_question_id is null or not (p_question_id = any (s.question_ids)) then
    raise exception 'Questão fora desta sessão.' using errcode = '22023';
  end if;
  if p_option is null or p_option not in ('A', 'B', 'C', 'D') then
    raise exception 'Alternativa inválida.' using errcode = '22023';
  end if;
  if s.paused_at is not null then
    raise exception 'O simulado está pausado. Continue para responder.' using errcode = '22023';
  end if;
  -- 15 s de tolerância para a resposta que saiu do navegador no último segundo; as pausas não contam.
  if s.time_limit_seconds is not null
     and clock_timestamp() > public.practice_deadline(s, clock_timestamp()) + interval '15 seconds' then
    raise exception 'O tempo do simulado acabou.' using errcode = '22023';
  end if;

  if s.kind = 'simulado' then
    update public.practice_sessions
      set answers = answers || jsonb_build_object(p_question_id, jsonb_build_object('option', p_option, 'ms', v_ms))
      where id = s.id;
    return jsonb_build_object('saved', true);
  end if;

  select a.selected_option::text, a.id into v_selected, v_attempt
  from public.question_attempts a
  where a.session_id = s.id and a.question_id = p_question_id;
  if not found then
    insert into public.question_attempts (question_id, session_id, selected_option, active_ms)
    values (p_question_id, s.id, p_option, v_ms)
    returning id into v_attempt;
    v_selected := p_option;
  else
    v_attempt := null;   -- resposta repetida: devolve a correção, sem "play" (nada foi concedido agora)
  end if;

  return public.practice_correction_view(p_question_id, v_selected)
    || jsonb_build_object('selected', v_selected, 'play', case when v_attempt is null then null else public.gam_turn_summary((select auth.uid()), v_attempt) end);
end
$$;

-- Finalizar: igual à anterior (…0700), e finalizar pausado encerra a pausa.
create or replace function public.app_finish_session(p_session_id uuid) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if s.finished_at is null then
    if s.kind = 'simulado' then
      insert into public.question_attempts (question_id, session_id, selected_option, active_ms)
      select d.key, s.id, d.value ->> 'option', (d.value ->> 'ms')::integer
      from jsonb_each(s.answers) d
      where d.key = any (s.question_ids) and d.value ->> 'option' in ('A', 'B', 'C', 'D')
      on conflict (session_id, question_id) where session_id is not null do nothing;
    end if;
    update public.practice_sessions
      set finished_at = clock_timestamp(),
          paused_ms = paused_ms + case when paused_at is null then 0
                                       else greatest(floor(extract(epoch from clock_timestamp() - paused_at) * 1000), 0)::bigint end,
          paused_at = null
      where id = s.id;
  end if;

  return public.app_get_session(p_session_id);
end
$$;

-- Placar: igual ao anterior (…0700); o tempo "do início ao fim" desconta as pausas, que vêm à parte.
create or replace function public.practice_result(p_session_id uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  with s as (
    select * from public.practice_sessions where id = p_session_id
  ),
  answered as (
    select q.area, a.id is not null as answered, coalesce(a.is_correct, false) as correct, coalesce(a.active_ms, 0) as ms
    from s
    cross join lateral unnest(s.question_ids) as u (question_id)
    join public.questions q on q.id = u.question_id
    left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
  )
  select jsonb_build_object(
    'total', (select count(*)::int from answered),
    'answered', (select count(*)::int from answered where answered),
    'correct', (select count(*)::int from answered where correct),
    'active_seconds', (select (coalesce(sum(ms), 0) / 1000)::int from answered),
    'elapsed_seconds', (select greatest(extract(epoch from (coalesce(s.finished_at, now()) - s.started_at))
                                        - s.paused_ms / 1000.0
                                        - case when s.paused_at is null then 0
                                               else extract(epoch from (coalesce(s.finished_at, now()) - s.paused_at)) end, 0)::int
                        from s),
    'paused_seconds', (select (s.paused_ms / 1000)::int from s),
    'by_area', coalesce((
      select jsonb_agg(jsonb_build_object('area', x.area, 'total', x.total, 'answered', x.answered, 'correct', x.correct) order by x.area)
      from (
        select area, count(*)::int as total, count(*) filter (where answered)::int as answered,
               count(*) filter (where correct)::int as correct
        from answered group by area
      ) x
    ), '[]'::jsonb)
  )
$$;

-- Histórico: igual ao anterior (…0700), mais "pausado" e o tempo que resta; pausado não expira.
create or replace function public.app_recent_sessions(p_kind text default null, p_limit integer default 5) returns jsonb
  language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.started_at desc), '[]'::jsonb)
  from (
    select s.started_at,
           jsonb_build_object(
             'id', s.id,
             'kind', s.kind,
             'started_at', s.started_at,
             'finished_at', s.finished_at,
             'time_limit_seconds', s.time_limit_seconds,
             'paused', s.finished_at is null and s.paused_at is not null,
             'expired', s.finished_at is null and s.time_limit_seconds is not null and s.paused_at is null
                        and now() > public.practice_deadline(s),
             'remaining_seconds', case when s.finished_at is null and s.time_limit_seconds is not null
                                       then greatest(ceil(extract(epoch from public.practice_deadline(s) - now())), 0)::int end,
             'total', cardinality(s.question_ids),
             'answered', n.answered,
             'correct', case when s.finished_at is null and s.kind = 'simulado' then null else n.correct end,
             'filters', s.config -> 'filters'
           ) as item
    from public.practice_sessions s
    cross join lateral (
      select case when s.finished_at is null and s.kind = 'simulado'
                  then (select count(*)::int from jsonb_object_keys(s.answers))
                  else (select count(*)::int from public.question_attempts a where a.session_id = s.id) end as answered,
             (select count(*)::int from public.question_attempts a where a.session_id = s.id and a.is_correct) as correct
    ) n
    where s.user_id = (select auth.uid())
      and (p_kind is null or s.kind = p_kind)
      and (s.finished_at is null or n.answered > 0)
    order by s.started_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 50)
  ) x
$$;

-- Início: igual ao anterior (…0800); a sessão em aberto respeita as pausas e diz se está pausada.
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
    -- Temas com questão errada ainda não superada, dos de pior acurácia para os melhores.
    'priority_topics', coalesce((
      select jsonb_agg(jsonb_build_object('area', p.area, 'topic', p.topic, 'pending', p.pending, 'attempts', p.attempts,
                                          'correct', p.correct, 'questions', p.questions)
                       order by p.accuracy, p.pending desc, p.topic)
      from (
        select e.area, e.topic, count(*)::int as pending, st.attempts, st.correct, st.accuracy,
               (select count(*)::int from public.questions q
                where q.area = e.area and q.topic = e.topic and q.status <> 'annulled') as questions
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
    'trial', (
      select case when sub.status = 'trialing' and sub.trial_ends_at is not null then
        jsonb_build_object('ends_at', sub.trial_ends_at,
                           'days_left', greatest(ceil(extract(epoch from (sub.trial_ends_at - now())) / 86400.0)::int, 0))
      end
      from public.subscriptions sub where sub.user_id = (select auth.uid()))
  )
$$;
