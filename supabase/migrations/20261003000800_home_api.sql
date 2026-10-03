-- =============================================================================
-- Início e Plano de hoje: o que as duas telas chamam.
--
-- O plano do dia é montado a partir do histórico do próprio aluno (nada inventado):
--  - Praticar: enquanto houver menos de 10 respostas, o diagnóstico inicial; depois,
--    a grande área menos treinada ou, com todas treinadas, a de menor acurácia;
--  - Revisar: as questões cuja última resposta foi errada.
-- A etapa "Estudar" entra quando Aulas e Temas forem ligados.
-- Tudo roda com os direitos de quem chama (SECURITY INVOKER): o RLS vale.
-- =============================================================================

create function public.area_label(p_area public.med_area) returns text
  language sql immutable set search_path = ''
as $$
  select case p_area
    when 'CLINICA_MEDICA' then 'Clínica Médica'
    when 'CIRURGIA_GERAL' then 'Cirurgia'
    when 'GINECOLOGIA_OBSTETRICIA' then 'Gineco & Obstetrícia'
    when 'PEDIATRIA' then 'Pediatria'
    when 'MEDICINA_FAMILIA_COMUNIDADE' then 'Preventiva / MFC'
  end
$$;

-- Quanto da tarefa já foi feito hoje: respostas dadas em treinos que batem com ela.
-- (Revisão = treinos montados com o filtro "erradas"; prática = os demais, na área da tarefa.)
create function public.plan_task_progress(t public.plan_tasks) returns integer
  language sql stable set search_path = ''
as $$
  select count(*)::int
  from public.question_attempts a
  join public.questions q on q.id = a.question_id
  left join public.practice_sessions s on s.id = a.session_id
  where a.user_id = t.user_id
    and (a.answered_at at time zone 'America/Sao_Paulo')::date = t.day
    and case t.kind
      when 'revisar' then coalesce(s.config -> 'filters' ->> 'status', '') = 'wrong'
      when 'praticar' then coalesce(s.config -> 'filters' ->> 'status', '') <> 'wrong'
                           and (nullif(t.ref ->> 'area', '') is null or q.area::text = t.ref ->> 'area')
      else false
    end
$$;

-- Plano de hoje. Cria as tarefas que faltam, conclui sozinho as que já foram cumpridas
-- e devolve a lista. p_rebuild refaz as tarefas ainda não concluídas (ex.: depois de
-- mudar o tempo de estudo por dia).
create function public.app_today(p_rebuild boolean default false) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_day constant date := public.today_br();
  v_minutes integer;
  v_count integer;
  v_attempts integer;
  v_wrong integer;
  v_area public.med_area;
  v_area_attempts integer;
  v_area_accuracy numeric;
begin
  if v_uid is null then
    return null;
  end if;

  if coalesce(p_rebuild, false) then
    delete from public.plan_tasks where user_id = v_uid and day = v_day and done_at is null;
  end if;

  if not exists (select 1 from public.plan_tasks where user_id = v_uid and day = v_day and kind = 'praticar') then
    select p.daily_minutes into v_minutes from public.profiles p where p.id = v_uid;
    v_count := case
      when v_minutes is null then 20
      when v_minutes <= 30 then 10
      when v_minutes <= 60 then 20
      when v_minutes <= 120 then 30
      else 50
    end;
    select count(*)::int into v_attempts from public.question_attempts a where a.user_id = v_uid;

    if v_attempts < 10 then
      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', 'Diagnóstico inicial: 10 questões nas 5 grandes áreas',
              jsonb_build_object('count', 10, 'reason', 'diagnostic'), 20);
    else
      select x.area, x.attempts, x.accuracy into v_area, v_area_attempts, v_area_accuracy
      from (
        select e.area, coalesce(st.attempts, 0) as attempts, st.accuracy
        from unnest(enum_range(null::public.med_area)) as e (area)
        left join public.my_area_stats st on st.area = e.area
      ) x
      order by (x.attempts < 5) desc, case when x.attempts < 5 then x.attempts end, x.accuracy nulls first, x.area
      limit 1;

      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', format('%s questões de %s', v_count, public.area_label(v_area)),
              jsonb_build_object('count', v_count, 'area', v_area,
                                 'reason', case when v_area_attempts < 5 then 'untrained' else 'lowest_accuracy' end,
                                 'attempts', v_area_attempts, 'accuracy', v_area_accuracy),
              v_count * 2);
    end if;
  end if;

  -- Revisão: enquanto não for concluída, a meta acompanha o caderno de erros
  -- (o que já foi revisto hoje + o que ainda está pendente, até 10 por dia).
  select count(*)::int into v_wrong from public.my_error_notebook e where e.status = 'para_revisar';

  update public.plan_tasks t
    set ref = t.ref || jsonb_build_object('count', n.target),
        title = case when n.target = 1 then 'Rever 1 questão errada' else format('Rever %s questões erradas', n.target) end,
        minutes = n.target * 2
    from (
      select t2.id, least(public.plan_task_progress(t2) + v_wrong, 10) as target
      from public.plan_tasks t2
      where t2.user_id = v_uid and t2.day = v_day and t2.kind = 'revisar' and t2.done_at is null
    ) n
    where t.id = n.id and n.target > 0;

  -- Os erros foram superados por outro caminho: não sobra nada para rever.
  delete from public.plan_tasks t
    where t.user_id = v_uid and t.day = v_day and t.kind = 'revisar' and t.done_at is null
      and v_wrong = 0 and public.plan_task_progress(t) = 0;

  if v_wrong > 0
     and not exists (select 1 from public.plan_tasks where user_id = v_uid and day = v_day and kind = 'revisar') then
    v_wrong := least(v_wrong, 10);
    insert into public.plan_tasks (day, position, kind, title, ref, minutes)
    values (v_day, 2, 'revisar',
            case when v_wrong = 1 then 'Rever 1 questão errada' else format('Rever %s questões erradas', v_wrong) end,
            jsonb_build_object('count', v_wrong, 'reason', 'errors'), v_wrong * 2);
  end if;

  -- Cumpriu a meta do dia: conclui sozinho (a não ser que o aluno tenha desmarcado à mão).
  update public.plan_tasks t
    set done_at = now()
    where t.user_id = v_uid and t.day = v_day and t.done_at is null and not (t.ref ? 'manual')
      and public.plan_task_progress(t) >= coalesce((t.ref ->> 'count')::integer, 1);

  return (
    select jsonb_build_object(
      'day', v_day,
      'done', count(*) filter (where t.done_at is not null)::int,
      'total', count(*)::int,
      'tasks', coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'kind', t.kind, 'title', t.title, 'minutes', t.minutes,
          'done', t.done_at is not null,
          'progress', least(public.plan_task_progress(t), coalesce((t.ref ->> 'count')::integer, 1)),
          'target', coalesce((t.ref ->> 'count')::integer, 1),
          'ref', t.ref - 'manual'
        ) order by t.position, t.created_at), '[]'::jsonb)
    )
    from public.plan_tasks t
    where t.user_id = v_uid and t.day = v_day
  );
end
$$;

-- Marca ou desmarca uma tarefa à mão. Desmarcar impede a conclusão automática de novo.
create function public.app_set_plan_task(p_task_id uuid, p_done boolean) returns jsonb
  language plpgsql set search_path = ''
as $$
begin
  update public.plan_tasks t
    set done_at = case when coalesce(p_done, false) then coalesce(t.done_at, now()) end,
        ref = case when coalesce(p_done, false) then t.ref else t.ref || '{"manual": true}'::jsonb end
    where t.id = p_task_id and t.user_id = (select auth.uid());
  if not found then
    raise exception 'Tarefa não encontrada.' using errcode = 'P0002';
  end if;
  return public.app_today();
end
$$;

-- Abre o treino de uma tarefa do plano, só com o que falta dela.
create function public.app_start_plan_task(p_task_id uuid) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  t public.plan_tasks;
  v_filters jsonb;
  v_left integer;
begin
  select * into t from public.plan_tasks where id = p_task_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Tarefa não encontrada.' using errcode = 'P0002';
  end if;
  if t.kind not in ('praticar', 'revisar') then
    raise exception 'Esta tarefa não abre um treino.' using errcode = '22023';
  end if;

  v_left := greatest(coalesce((t.ref ->> 'count')::integer, 10) - public.plan_task_progress(t), 1);
  if t.kind = 'revisar' then
    v_filters := jsonb_build_object('status', 'wrong');
  else
    v_filters := jsonb_strip_nulls(jsonb_build_object('area', t.ref ->> 'area', 'status', 'unanswered'));
    -- Já resolveu tudo o que havia de inédito: libera as já resolvidas.
    if (select count(*) from public.practice_pool(v_filters)) < v_left then
      v_filters := v_filters - 'status';
    end if;
  end if;

  return public.app_start_session('questoes', v_filters, v_left);
end
$$;

-- Tudo o que a tela Início mostra.
create function public.app_home() returns jsonb
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
    -- Treino ou simulado em aberto (e ainda dentro do tempo) para continuar.
    'open_session', (
      select jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'total', cardinality(s.question_ids),
        'area', s.config -> 'filters' ->> 'area', 'status', s.config -> 'filters' ->> 'status',
        'answered', case when s.kind = 'simulado'
                         then (select count(*)::int from jsonb_object_keys(s.answers))
                         else (select count(*)::int from public.question_attempts a where a.session_id = s.id) end)
      from public.practice_sessions s
      where s.user_id = (select auth.uid()) and s.finished_at is null
        and (s.time_limit_seconds is null or now() <= s.started_at + make_interval(secs => s.time_limit_seconds))
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
