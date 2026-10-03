-- =============================================================================
-- Flashcards: o que a tela de Flashcards e o "Criar flashcard" da correção chamam.
--
-- Cartões que o aluno estuda: os oficiais publicados (depois de revisão médica) e os
-- que ele mesmo criou. O agendamento (FSRS) é calculado no navegador com a mesma
-- configuração do app (src/config/spacedRepetition.ts) e gravado aqui: é a agenda do
-- próprio aluno, então não há o que proteger dele além de validar os valores.
-- Tudo roda com os direitos de quem chama (SECURITY INVOKER): o RLS vale.
-- =============================================================================

-- ts-fsrs 5 guarda os passos de aprendizado no cartão.
alter table public.flashcard_states add column learning_steps integer not null default 0 check (learning_steps >= 0);

-- Intervalo a partir do qual o cartão conta como consolidado.
create function public.flashcard_consolidated_days() returns integer
  language sql immutable set search_path = ''
as $$ select 21 $$;

-- Cartões visíveis para o aluno, com o estado de revisão dele (nulo = nunca revisado).
create function public.my_flashcards(p_area text)
  returns table (
    id uuid, area public.med_area, topic text, front text, back text, mine boolean,
    source_question_id text, created_at timestamptz,
    due timestamptz, stability double precision, difficulty double precision, elapsed_days integer,
    scheduled_days integer, learning_steps integer, reps integer, lapses integer, state smallint,
    last_review timestamptz
  )
  language sql stable set search_path = ''
as $$
  select c.id, c.area, c.topic, c.front, c.back, c.owner_id is not null, c.source_question_id, c.created_at,
         s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days, s.learning_steps, s.reps, s.lapses,
         s.state, s.last_review
  from public.flashcards c
  left join public.flashcard_states s on s.card_id = c.id and s.user_id = (select auth.uid())
  where ((c.owner_id is null and c.published) or c.owner_id = (select auth.uid()))
    and (nullif(p_area, '') is null or c.area::text = p_area)
$$;

create function public.flashcard_counts(p_area text) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*)::int,
    'new', count(*) filter (where f.state is null or f.state = 0)::int,
    'learning', count(*) filter (where f.state > 0 and f.scheduled_days < public.flashcard_consolidated_days())::int,
    'consolidated', count(*) filter (where f.state > 0 and f.scheduled_days >= public.flashcard_consolidated_days())::int,
    'due', count(*) filter (where f.state > 0 and f.due <= now())::int,
    'mine', count(*) filter (where f.mine)::int,
    'next_due', min(f.due) filter (where f.state > 0 and f.due > now())
  )
  from public.my_flashcards(p_area) f
$$;

-- Contagens e a fila de hoje: primeiro as revisões vencidas, depois até p_new_limit cartões novos.
create function public.app_flashcards(p_area text default null, p_new_limit integer default 20) returns jsonb
  language sql stable set search_path = ''
as $$
  with queue as (
    (select f.*, 0 as bucket from public.my_flashcards(p_area) f
     where f.state > 0 and f.due <= now()
     order by f.due
     limit 200)
    union all
    (select f.*, 1 as bucket from public.my_flashcards(p_area) f
     where f.state is null or f.state = 0
     order by f.created_at
     limit least(greatest(coalesce(p_new_limit, 20), 0), 100))
  )
  select jsonb_build_object(
    'counts', public.flashcard_counts(p_area),
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'area', q.area, 'topic', q.topic, 'front', q.front, 'back', q.back, 'mine', q.mine,
        'source_question_id', q.source_question_id,
        'schedule', case when q.state is null then null else jsonb_build_object(
          'due', q.due, 'stability', q.stability, 'difficulty', q.difficulty, 'elapsed_days', q.elapsed_days,
          'scheduled_days', q.scheduled_days, 'learning_steps', q.learning_steps, 'reps', q.reps,
          'lapses', q.lapses, 'state', q.state, 'last_review', q.last_review) end
      ) order by q.bucket, q.due nulls last, q.created_at)
      from queue q
    ), '[]'::jsonb)
  )
$$;

-- Cria um cartão pessoal (opcionalmente a partir de uma questão).
create function public.app_create_flashcard(
  p_area text,
  p_topic text,
  p_front text,
  p_back text,
  p_source_question_id text default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_front constant text := btrim(coalesce(p_front, ''));
  v_back constant text := btrim(coalesce(p_back, ''));
  v_topic constant text := coalesce(nullif(btrim(coalesce(p_topic, '')), ''), 'Meus cartões');
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para criar flashcards.' using errcode = '28000';
  end if;
  if p_area is null or not (p_area = any (enum_range(null::public.med_area)::text[])) then
    raise exception 'Escolha a grande área.' using errcode = '22023';
  end if;
  if char_length(v_front) = 0 or char_length(v_back) = 0 then
    raise exception 'Preencha a pergunta e a resposta.' using errcode = '22023';
  end if;
  if char_length(v_front) > 2000 or char_length(v_back) > 4000 or char_length(v_topic) > 200 then
    raise exception 'Texto longo demais para um flashcard.' using errcode = '22023';
  end if;
  if p_source_question_id is not null then
    if not exists (select 1 from public.questions q where q.id = p_source_question_id) then
      raise exception 'Questão não encontrada.' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.flashcards c
               where c.owner_id = (select auth.uid()) and c.source_question_id = p_source_question_id) then
      raise exception 'Você já criou um flashcard desta questão.' using errcode = '23505';
    end if;
  end if;

  insert into public.flashcards (owner_id, area, topic, front, back, source_question_id)
  values ((select auth.uid()), p_area::public.med_area, v_topic, v_front, v_back, p_source_question_id)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end
$$;

-- Registra uma revisão: p_next é o estado calculado pelo FSRS no navegador.
create function public.app_review_flashcard(p_card_id uuid, p_rating integer, p_next jsonb) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_before smallint;
  v_due timestamptz;
  v_state smallint;
begin
  if not exists (select 1 from public.my_flashcards(null) f where f.id = p_card_id) then
    raise exception 'Flashcard não encontrado.' using errcode = 'P0002';
  end if;
  if p_rating is null or p_rating not between 1 and 4 then
    raise exception 'Avaliação inválida.' using errcode = '22023';
  end if;
  begin
    v_due := (p_next ->> 'due')::timestamptz;
    v_state := (p_next ->> 'state')::smallint;
  exception when others then
    raise exception 'Agenda inválida.' using errcode = '22023';
  end;
  if v_due is null or v_due < now() - interval '1 day' or v_due > now() + interval '101 years'
     or v_state is null or v_state not between 0 and 3
     or coalesce((p_next ->> 'stability')::double precision, -1) < 0
     or coalesce((p_next ->> 'difficulty')::double precision, -1) not between 0 and 10
     or coalesce((p_next ->> 'reps')::integer, -1) < 1
     or coalesce((p_next ->> 'lapses')::integer, -1) < 0
     or coalesce((p_next ->> 'scheduled_days')::integer, -1) < 0
     or coalesce((p_next ->> 'elapsed_days')::integer, -1) < 0
     or coalesce((p_next ->> 'learning_steps')::integer, 0) < 0 then
    raise exception 'Agenda inválida.' using errcode = '22023';
  end if;

  select s.state into v_before from public.flashcard_states s
  where s.user_id = (select auth.uid()) and s.card_id = p_card_id;

  insert into public.flashcard_states (card_id, due, stability, difficulty, elapsed_days, scheduled_days,
                                       learning_steps, reps, lapses, state, last_review)
  values (p_card_id, v_due, (p_next ->> 'stability')::double precision, (p_next ->> 'difficulty')::double precision,
          (p_next ->> 'elapsed_days')::integer, (p_next ->> 'scheduled_days')::integer,
          coalesce((p_next ->> 'learning_steps')::integer, 0), (p_next ->> 'reps')::integer,
          (p_next ->> 'lapses')::integer, v_state, now())
  on conflict (user_id, card_id) do update set
    due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
    elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
    learning_steps = excluded.learning_steps, reps = excluded.reps, lapses = excluded.lapses,
    state = excluded.state, last_review = excluded.last_review;

  insert into public.flashcard_reviews (card_id, rating, state_before) values (p_card_id, p_rating, coalesce(v_before, 0));
  return jsonb_build_object('due', v_due);
end
$$;

-- Apaga um cartão pessoal (oficiais não podem ser apagados pelo aluno).
create function public.app_delete_flashcard(p_card_id uuid) returns boolean
  language plpgsql set search_path = ''
as $$
begin
  delete from public.flashcards c where c.id = p_card_id and c.owner_id = (select auth.uid());
  if not found then
    raise exception 'Flashcard não encontrado.' using errcode = 'P0002';
  end if;
  return true;
end
$$;
