-- =============================================================================
-- Gabarito fora do alcance direto do aluno.
--
-- Antes: qualquer conta logada podia ler a tabela questions inteira (resposta correta,
-- explicação de cada alternativa, conduta esperada) — por exemplo, durante um simulado.
-- Agora:
--   - o aluno só lê as colunas que não entregam a resposta;
--   - a questão "antes de responder" e a correção saem por funções do banco;
--   - a correção só é devolvida para quem já respondeu aquela questão ou já finalizou uma
--     sessão que a contém (ou para a equipe).
-- O tema da questão continua legível: os filtros e a busca por tema dependem dele.
-- =============================================================================

revoke select on table public.questions from anon, authenticated;
-- O visitante sem login recebe as mesmas colunas, mas nenhuma linha (a política de leitura é só
-- para logados): as telas continuam recebendo "vazio" em vez de erro.
grant select (id, code, exam_id, number, booklet, area, specialty, topic, subtopic, statement,
              status, images, sources, needs_image, search, created_at, updated_at)
  on table public.questions to anon, authenticated;

-- Questão como o aluno a vê ANTES de responder: sem gabarito, sem explicação e sem o tema.
create function public.practice_question_view(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
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
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null
$$;

-- Correção de uma questão (p_selected nulo = ficou em branco). Devolve nulo para quem ainda
-- não pode ver: é esta função, e não a tela, que guarda o gabarito.
create function public.practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
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
  from public.questions q
  where q.id = p_question_id
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;

-- ---------------------------------------------------------------- telas: mesmas regras, sem ler a linha inteira
create or replace function public.app_get_session(p_session_id uuid) returns jsonb
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
  )
  from public.practice_sessions s
  where s.id = p_session_id
$$;

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

  return public.practice_correction_view(p_question_id, v_selected) || jsonb_build_object('selected', v_selected);
end
$$;

create or replace function public.app_error_detail(p_question_id text) returns jsonb
  language sql stable set search_path = ''
as $$
  select public.practice_question_view(e.question_id) || jsonb_build_object(
    'selected', e.last_wrong_option,
    'status', e.status,
    'wrong_count', e.wrong_count,
    'note', e.note,
    'reason', e.reason,
    'correction', public.practice_correction_view(e.question_id, e.last_wrong_option::text)
  )
  from public.my_error_notebook e
  where e.question_id = p_question_id
$$;

-- As versões antigas recebiam a linha inteira da questão (o que exige ler o gabarito).
drop function public.practice_question(public.questions);
drop function public.practice_correction(public.questions, text);
