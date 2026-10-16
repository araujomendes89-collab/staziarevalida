-- StaziaMed · TELA DE QUESTÃO NO MODELO DO DONO (15/10/2026). ADITIVA: só cria funções e uma tabela nova e troca o corpo de
-- ch_raw_practice_correction_view para o aluno não receber as fontes das Questões Inéditas. Desfazer: supabase/desfazer/20261003010500_tela_questao_modelo.desfazer.sql
--
--  1) ch_raw_practice_correction_view: 'official_sources' e 'sources' das Questões Inéditas saem vazios para o aluno (o resto igual à …10300).
--  2) question_difficulty_review + app_admin_set_question_difficulty + app_question_difficulty: dificuldade de 1 a 5 SÓ de cadastro
--     validado pela equipe (nada calculado nem estimado). O aluno só a recebe depois de responder a questão num treino (nunca em simulado).
--  3) app_question_hint_context: o que o servidor precisa para a "dica do Tutor" (enunciado e alternativas, nunca gabarito, explicação
--     ou fontes), só de questão ainda sem resposta num treino aberto do próprio aluno.

create or replace function public.ch_raw_practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'is_correct', case when p_selected is null or q.status = 'annulled' then null else p_selected = q.correct_option::text end,
    'correct_option', q.correct_option,
    'annulled', q.status = 'annulled',
    'in_review', cardinality(h.campos) > 0,
    'topic', q.topic,
    'subtopic', q.subtopic,
    'explanation', (select nullif(btrim(o ->> 'explanation'), '')
                    from jsonb_array_elements(q.options) o
                    where q.status <> 'annulled'
                      and o ->> 'id' = q.correct_option::text and not ('explanation_' || (o ->> 'id')) = any (h.campos)),
    'option_notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', btrim(o ->> 'explanation')) order by o ->> 'id')
      from jsonb_array_elements(q.options) o
      where q.status <> 'annulled'
        and o ->> 'id' <> q.correct_option::text and nullif(btrim(o ->> 'explanation'), '') is not null
        and not ('explanation_' || (o ->> 'id')) = any (h.campos)
    ), '[]'::jsonb),
    'annulled_notes', public.question_annulled_study_notes(q.status, q.options, h.campos),
    'expected_conduct', case when 'expected_conduct' = any (h.campos) then null else q.expected_conduct end,
    'inep_intent', case when 'inep_intent' = any (h.campos) then null else q.inep_intent end,
    'update_note', public.question_update_note_visible(q.id),
    -- as fontes das Questões Inéditas ficam na tabela interna: o aluno não as recebe (decisão do dono, 15/10/2026)
    'sources', case when q.origin = 'staziamed' then '[]'::jsonb else public.ch_student_sources(q.sources) end,
    'origin', q.origin,
    'support', q.support,
    'official_sources', null
  )
  from public.questions q
  cross join lateral (
    select public.question_hidden_fields(q.explanations_review, q.comment_review) as campos
  ) h
  where q.id = p_question_id
    and (q.origin = 'official' or public.ineditas_can_open(q.id))
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;
revoke execute on function public.ch_raw_practice_correction_view(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- dificuldade validada (1 a 5)
create table if not exists public.question_difficulty_review (
  question_id text primary key references public.questions (id) on delete cascade,
  level smallint not null check (level between 1 and 5),
  validated_by uuid not null references auth.users (id),
  validated_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500)
);
alter table public.question_difficulty_review enable row level security;
revoke all on table public.question_difficulty_review from public, anon, authenticated;
grant select on table public.question_difficulty_review to authenticated;
drop policy if exists "dificuldade validada: só a equipe lê" on public.question_difficulty_review;
create policy "dificuldade validada: só a equipe lê" on public.question_difficulty_review
  for select to authenticated using ((select public.is_staff()));

-- Equipe grava (ou tira, com p_level nulo) a dificuldade validada de uma questão.
create or replace function public.app_admin_set_question_difficulty(p_question_id text, p_level integer, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Só a equipe pode validar a dificuldade de uma questão.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.questions where id = p_question_id) then
    raise exception 'Questão não encontrada.' using errcode = '22023';
  end if;
  if p_level is null then
    delete from public.question_difficulty_review where question_id = p_question_id;
    return jsonb_build_object('question_id', p_question_id, 'level', null);
  end if;
  if p_level < 1 or p_level > 5 then
    raise exception 'A dificuldade vai de 1 a 5.' using errcode = '22023';
  end if;
  insert into public.question_difficulty_review (question_id, level, validated_by, validated_at, note)
  values (p_question_id, p_level, v_uid, now(), nullif(btrim(p_note), ''))
  on conflict (question_id) do update set level = excluded.level, validated_by = excluded.validated_by, validated_at = now(), note = excluded.note;
  return jsonb_build_object('question_id', p_question_id, 'level', p_level);
end
$$;
revoke execute on function public.app_admin_set_question_difficulty(text, integer, text) from public, anon;
grant execute on function public.app_admin_set_question_difficulty(text, integer, text) to authenticated;

-- Aluno: a dificuldade validada, só depois de responder a questão num TREINO (nunca em simulado). Sem validação, nulo.
create or replace function public.app_question_difficulty(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('level', d.level)
  from public.question_difficulty_review d
  join public.questions q on q.id = d.question_id
  where d.question_id = p_question_id and (select auth.uid()) is not null
    and (q.origin = 'official' or public.ineditas_can_open(q.id))
    and exists (select 1 from public.question_attempts a
                join public.practice_sessions s on s.id = a.session_id
                where a.user_id = (select auth.uid()) and a.question_id = d.question_id and s.kind <> 'simulado')
$$;
revoke execute on function public.app_question_difficulty(text) from public, anon;
grant execute on function public.app_question_difficulty(text) to authenticated;

-- ---------------------------------------------------------------- dica do Tutor (contexto para o servidor)
create or replace function public.app_question_hint_context(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'consent_pending', public.tutor_consent_pending((select auth.uid())),
    'entitlement', public.tutor_entitlement((select auth.uid()))
  )
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null
    and q.status <> 'annulled'
    and (q.origin = 'official' or public.ineditas_can_open(q.id))
    and exists (select 1 from public.practice_sessions s
                where s.user_id = (select auth.uid()) and s.kind <> 'simulado' and s.finished_at is null and q.id = any (s.question_ids)
                  and not exists (select 1 from public.question_attempts a where a.session_id = s.id and a.question_id = q.id))
$$;
revoke execute on function public.app_question_hint_context(text) from public, anon;
grant execute on function public.app_question_hint_context(text) to authenticated;
