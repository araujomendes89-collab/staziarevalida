-- =============================================================================
-- Treino de questões e simulados: o que as telas Questões, Simulados e a sessão
-- de resolução chamam. Regras que valem aqui:
--  - o gabarito e a explicação só saem do banco depois da resposta (no simulado,
--    só depois de finalizar);
--  - o acerto continua sendo calculado pelo banco (trigger grade_question_attempt);
--  - tudo roda com os direitos de quem chama (SECURITY INVOKER): o RLS vale.
-- =============================================================================

-- Questão cujo enunciado remete a uma figura (ECG, radiografia, gráfico…) que ainda
-- não foi vinculada: fica fora dos treinos até ter imagem.
alter table public.questions add column needs_image boolean not null default false;

-- Respostas de um simulado em andamento: {"<question_id>": {"option": "A", "ms": 41000}}.
-- Podem ser trocadas até finalizar; aí viram tentativas (histórico imutável).
alter table public.practice_sessions
  add column answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object');

-- Uma resposta por questão dentro da mesma sessão.
create unique index question_attempts_session_question_idx
  on public.question_attempts (session_id, question_id) where session_id is not null;

-- ---------------------------------------------------------------- questões marcadas
create table public.question_bookmarks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.question_bookmarks enable row level security;
create policy "marcadas: ler as próprias" on public.question_bookmarks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "marcadas: criar as próprias" on public.question_bookmarks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "marcadas: apagar as próprias" on public.question_bookmarks
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- apoio
-- Minúsculas e sem acento, para a busca aceitar "pre-eclampsia" e "pré-eclâmpsia".
create function public.fold_text(p_text text) returns text
  language sql immutable set search_path = ''
as $$
  select translate(lower(coalesce(p_text, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$$;

-- Questões que podem entrar num treino com os filtros dados.
-- Filtros: area, exam_id, search, status ('all' | 'unanswered' | 'wrong' | 'bookmarked').
create function public.practice_pool(p_filters jsonb)
  returns table (question_id text, area public.med_area, exam_id text, topic text)
  language sql stable set search_path = ''
as $$
  select q.id, q.area, q.exam_id, q.topic
  from public.questions q
  where q.status <> 'annulled'
    and not (q.needs_image and jsonb_array_length(q.images) = 0)
    and (nullif(p_filters ->> 'area', '') is null or q.area = (p_filters ->> 'area')::public.med_area)
    and (nullif(p_filters ->> 'exam_id', '') is null or q.exam_id = p_filters ->> 'exam_id')
    and (
      nullif(btrim(coalesce(p_filters ->> 'search', '')), '') is null
      or q.search @@ websearch_to_tsquery('portuguese', p_filters ->> 'search')
      or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, ''))
           like '%' || public.fold_text(btrim(p_filters ->> 'search')) || '%'
    )
    and case coalesce(nullif(p_filters ->> 'status', ''), 'all')
      when 'unanswered' then not exists (
        select 1 from public.question_attempts a
        where a.user_id = (select auth.uid()) and a.question_id = q.id)
      when 'wrong' then exists (
        select 1 from public.my_error_notebook e
        where e.question_id = q.id and e.status = 'para_revisar')
      when 'bookmarked' then exists (
        select 1 from public.question_bookmarks b
        where b.user_id = (select auth.uid()) and b.question_id = q.id)
      else true
    end
$$;

-- Questão como o aluno a vê ANTES de responder: sem gabarito, sem explicação e sem
-- o tema (que entregaria o diagnóstico).
create function public.practice_question(q public.questions) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'code', q.code,
    'number', q.number,
    'area', q.area,
    'exam', (select jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester, 'title', e.title)
             from public.exams e where e.id = q.exam_id),
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id')
                from jsonb_array_elements(q.options) o),
    'images', q.images
  )
$$;

-- Correção de uma questão (p_selected nulo = ficou em branco).
create function public.practice_correction(q public.questions, p_selected text) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'is_correct', case when p_selected is null then null else p_selected = q.correct_option::text end,
    'correct_option', q.correct_option,
    'topic', q.topic,
    'subtopic', q.subtopic,
    'explanation', (select nullif(btrim(o ->> 'explanation'), '')
                    from jsonb_array_elements(q.options) o where o ->> 'id' = q.correct_option::text),
    'option_notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', btrim(o ->> 'explanation')) order by o ->> 'id')
      from jsonb_array_elements(q.options) o
      where o ->> 'id' <> q.correct_option::text and nullif(btrim(o ->> 'explanation'), '') is not null
    ), '[]'::jsonb),
    'expected_conduct', q.expected_conduct,
    'inep_intent', q.inep_intent,
    'sources', q.sources
  )
$$;

-- Placar de uma sessão (por área e no total).
create function public.practice_result(p_session_id uuid) returns jsonb
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
    'elapsed_seconds', (select greatest(extract(epoch from (coalesce(s.finished_at, now()) - s.started_at)), 0)::int from s),
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

-- ---------------------------------------------------------------- API das telas

-- Opções do montador de treino: provas, temas mais cobrados por área e total disponível.
create function public.app_question_filters() returns jsonb
  language sql stable set search_path = ''
as $$
  with pool as (
    select * from public.practice_pool('{}'::jsonb)
  )
  select jsonb_build_object(
    'total', (select count(*)::int from pool),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester,
                                          'title', e.title, 'total', c.total)
                       order by e.year desc, e.semester desc nulls last, e.kind)
      from public.exams e
      join (select exam_id, count(*)::int as total from pool group by exam_id) c on c.exam_id = e.id
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('area', t.area, 'topic', t.topic, 'total', t.total) order by t.total desc, t.topic)
      from (
        select area, topic, count(*)::int as total,
               row_number() over (partition by area order by count(*) desc, topic) as rn
        from pool group by area, topic
      ) t
      where t.rn <= 6
    ), '[]'::jsonb)
  )
$$;

-- Quantas questões existem com os filtros atuais, no total e por área
-- (o filtro de área é ignorado aqui: a tela mostra a contagem de cada área).
create function public.app_count_questions(p_filters jsonb) returns jsonb
  language sql stable set search_path = ''
as $$
  with pool as (
    select * from public.practice_pool(coalesce(p_filters, '{}'::jsonb) - 'area')
  )
  select jsonb_build_object(
    'total', (select count(*)::int from pool),
    'by_area', coalesce((
      select jsonb_object_agg(x.area, x.total)
      from (select area, count(*)::int as total from pool group by area) x
    ), '{}'::jsonb)
  )
$$;

-- Sorteia as questões e abre a sessão. Sem filtro de área, o sorteio é equilibrado
-- entre as cinco grandes áreas (como na prova).
create function public.app_start_session(
  p_kind text,
  p_filters jsonb,
  p_count integer,
  p_time_limit_seconds integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_filters constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_count constant integer := least(greatest(coalesce(p_count, 20), 1), 200);
  v_ids text[];
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para treinar.' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('questoes', 'simulado') then
    raise exception 'Tipo de sessão inválido: %', p_kind using errcode = '22023';
  end if;
  if p_time_limit_seconds is not null and (p_kind <> 'simulado' or p_time_limit_seconds not between 60 and 43200) then
    raise exception 'Tempo limite inválido.' using errcode = '22023';
  end if;

  select array_agg(picked.question_id order by picked.rn, picked.r) into v_ids
  from (
    select p.question_id, p.rn, p.r
    from (
      select pool.question_id,
             row_number() over (partition by pool.area order by random()) as rn,
             random() as r
      from public.practice_pool(v_filters) pool
    ) p
    order by p.rn, p.r
    limit v_count
  ) picked;

  if v_ids is null then
    raise exception 'Nenhuma questão encontrada com esses filtros.' using errcode = 'P0002';
  end if;

  insert into public.practice_sessions (kind, config, question_ids, time_limit_seconds)
  values (p_kind, jsonb_build_object('filters', v_filters, 'requested', v_count), v_ids, p_time_limit_seconds)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'count', cardinality(v_ids));
end
$$;

-- A sessão inteira, na ordem sorteada. A correção de cada questão só aparece se ela já
-- foi respondida num treino, ou se a sessão foi finalizada.
create function public.app_get_session(p_session_id uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'kind', s.kind,
    'filters', s.config -> 'filters',
    'time_limit_seconds', s.time_limit_seconds,
    'started_at', s.started_at,
    'finished_at', s.finished_at,
    'server_now', now(),
    'questions', (
      select jsonb_agg(
        public.practice_question(q) || jsonb_build_object(
          'bookmarked', b.question_id is not null,
          'selected', coalesce(a.selected_option::text, s.answers -> q.id ->> 'option'),
          'active_ms', coalesce(a.active_ms, (s.answers -> q.id ->> 'ms')::integer, 0),
          'correction', case
            when s.finished_at is not null or (s.kind <> 'simulado' and a.id is not null)
            then public.practice_correction(q, a.selected_option::text)
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
  )
  from public.practice_sessions s
  where s.id = p_session_id
$$;

-- Registra a resposta de uma questão.
--  - treino: grava a tentativa e devolve a correção (repetir a chamada devolve a mesma);
--  - simulado: guarda a resposta, que pode ser trocada até finalizar, sem revelar o gabarito.
create function public.app_answer_question(
  p_session_id uuid,
  p_question_id text,
  p_option text,
  p_active_ms integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
  q public.questions;
  v_selected text;
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
  -- 15 s de tolerância para a resposta que saiu do navegador no último segundo.
  if s.time_limit_seconds is not null
     and clock_timestamp() > s.started_at + make_interval(secs => s.time_limit_seconds + 15) then
    raise exception 'O tempo do simulado acabou.' using errcode = '22023';
  end if;

  if s.kind = 'simulado' then
    update public.practice_sessions
      set answers = answers || jsonb_build_object(p_question_id, jsonb_build_object('option', p_option, 'ms', v_ms))
      where id = s.id;
    return jsonb_build_object('saved', true);
  end if;

  select a.selected_option::text into v_selected
  from public.question_attempts a
  where a.session_id = s.id and a.question_id = p_question_id;
  if not found then
    insert into public.question_attempts (question_id, session_id, selected_option, active_ms)
    values (p_question_id, s.id, p_option, v_ms);
    v_selected := p_option;
  end if;

  select * into q from public.questions where id = p_question_id;
  return public.practice_correction(q, v_selected) || jsonb_build_object('selected', v_selected);
end
$$;

-- Encerra a sessão. No simulado, as respostas guardadas viram tentativas (corrigidas
-- pelo banco). Devolve a sessão completa, já com a correção e o placar.
create function public.app_finish_session(p_session_id uuid) returns jsonb
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
    update public.practice_sessions set finished_at = clock_timestamp() where id = s.id;
  end if;

  return public.app_get_session(p_session_id);
end
$$;

-- Marca ou desmarca uma questão para rever depois.
create function public.app_set_bookmark(p_question_id text, p_on boolean) returns boolean
  language plpgsql set search_path = ''
as $$
begin
  if coalesce(p_on, false) then
    insert into public.question_bookmarks (question_id) values (p_question_id) on conflict do nothing;
    return true;
  end if;
  delete from public.question_bookmarks
    where user_id = (select auth.uid()) and question_id = p_question_id;
  return false;
end
$$;

-- Sessões recentes do aluno (para continuar de onde parou ou rever o resultado).
-- Sessões encerradas sem nenhuma resposta não entram.
create function public.app_recent_sessions(p_kind text default null, p_limit integer default 5) returns jsonb
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
             'expired', s.finished_at is null and s.time_limit_seconds is not null
                        and now() > s.started_at + make_interval(secs => s.time_limit_seconds),
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
