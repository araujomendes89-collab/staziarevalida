-- =============================================================================
-- Caderno de erros e Desempenho: o que as duas telas chamam.
-- Tudo sai do histórico de respostas do próprio aluno (visões my_* da migração
-- …0300, com security_invoker): SECURITY INVOKER aqui também, o RLS vale.
-- =============================================================================

-- Caderno de erros: contagens e a lista, da resposta mais recente para a mais antiga.
create function public.app_error_notebook() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'pending', count(*) filter (where e.status = 'para_revisar')::int,
      'overcome', count(*) filter (where e.status = 'superada')::int,
      'recurrent', count(*) filter (where e.wrong_count >= 2)::int
    ),
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'question_id', e.question_id, 'area', e.area, 'topic', e.topic, 'status', e.status,
        'wrong_count', e.wrong_count, 'last_attempt_at', e.last_attempt_at,
        'has_note', e.note is not null or e.reason is not null,
        'excerpt', left(q.statement, 200), 'number', q.number,
        'exam', (select jsonb_build_object('kind', x.kind, 'year', x.year, 'semester', x.semester)
                 from public.exams x where x.id = q.exam_id)
      ) order by e.last_attempt_at desc), '[]'::jsonb)
  )
  from public.my_error_notebook e
  join public.questions q on q.id = e.question_id
$$;

-- Uma questão do caderno, com a correção. Só responde para questão que o aluno
-- já errou (ou seja, já viu o gabarito).
create function public.app_error_detail(p_question_id text) returns jsonb
  language sql stable set search_path = ''
as $$
  select public.practice_question(q) || jsonb_build_object(
    'selected', e.last_wrong_option,
    'status', e.status,
    'wrong_count', e.wrong_count,
    'note', e.note,
    'reason', e.reason,
    'correction', public.practice_correction(q, e.last_wrong_option::text)
  )
  from public.my_error_notebook e
  join public.questions q on q.id = e.question_id
  where e.question_id = p_question_id
$$;

-- Anotação e motivo do erro (os dois vazios apagam a anotação).
create function public.app_save_error_note(p_question_id text, p_note text, p_reason text) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_note constant text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason constant text := nullif(p_reason, '');
begin
  if not exists (select 1 from public.my_error_notebook e where e.question_id = p_question_id) then
    raise exception 'Questão fora do seu caderno de erros.' using errcode = 'P0002';
  end if;
  if v_reason is not null and v_reason not in ('conhecimento', 'interpretacao', 'atencao', 'chute', 'outro') then
    raise exception 'Motivo inválido.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 2000 then
    raise exception 'A anotação passa de 2.000 caracteres.' using errcode = '22023';
  end if;

  if v_note is null and v_reason is null then
    delete from public.error_notes where user_id = (select auth.uid()) and question_id = p_question_id;
  else
    insert into public.error_notes (question_id, note, reason) values (p_question_id, v_note, v_reason)
    on conflict (user_id, question_id) do update set note = excluded.note, reason = excluded.reason;
  end if;
  return jsonb_build_object('note', v_note, 'reason', v_reason);
end
$$;

-- Desempenho: totais, o período escolhido comparado com o anterior, a série por dia,
-- as cinco grandes áreas e os simulados finalizados. Anuladas ficam fora.
create function public.app_performance(p_days integer default 30) returns jsonb
  language sql stable set search_path = ''
as $$
  with span as (
    select least(greatest(coalesce(p_days, 30), 7), 365) as days
  ),
  my as (
    select a.question_id, a.is_correct, a.active_ms, q.area,
           (a.answered_at at time zone 'America/Sao_Paulo')::date as day
    from public.question_attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = (select auth.uid()) and q.status <> 'annulled'
  ),
  recent as (
    select my.* from my, span where my.day > public.today_br() - span.days
  )
  select jsonb_build_object(
    'days', (select days from span),
    'attempts', (select count(*)::int from my),
    'correct', (select count(*) filter (where is_correct)::int from my),
    'questions', (select count(distinct question_id)::int from my),
    'avg_seconds', (select round(avg(active_ms) / 1000.0)::int from my where active_ms > 0),
    'streak_days', public.my_streak_days(),
    'period', (select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int) from recent),
    'previous', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int)
      from my, span
      where my.day > public.today_br() - 2 * span.days and my.day <= public.today_br() - span.days),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'attempts', d.attempts, 'correct', d.correct) order by d.day)
      from (select day, count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from recent group by day) d
    ), '[]'::jsonb),
    'areas', (
      select jsonb_agg(jsonb_build_object('area', e.area, 'attempts', coalesce(s.attempts, 0), 'correct', coalesce(s.correct, 0))
                       order by e.area)
      from unnest(enum_range(null::public.med_area)) as e (area)
      left join (
        select area, count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from my group by area
      ) s on s.area = e.area),
    'simulados', (
      select jsonb_build_object('count', count(*)::int, 'accuracy', round(avg(100.0 * r.correct / r.total))::int)
      from (
        select cardinality(s.question_ids) as total,
               (select count(*) from public.question_attempts a where a.session_id = s.id and a.is_correct) as correct
        from public.practice_sessions s
        where s.user_id = (select auth.uid()) and s.kind = 'simulado' and s.finished_at is not null
      ) r)
  )
$$;
