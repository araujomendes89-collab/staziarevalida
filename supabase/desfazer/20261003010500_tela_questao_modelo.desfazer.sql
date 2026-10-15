-- DESFAZER da 20261003010500_tela_questao_modelo.sql: volta o corpo de ch_raw_practice_correction_view ao da …10300 e apaga o que a 10500 criou.
-- (A tabela question_difficulty_review perde as dificuldades já validadas: exporte antes se houver.)
drop function if exists public.app_question_hint_context(text);
drop function if exists public.app_question_difficulty(text);
drop function if exists public.app_admin_set_question_difficulty(text, integer, text);
drop table if exists public.question_difficulty_review;

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
    'sources', public.ch_student_sources(q.sources),
    'origin', q.origin,
    'support', q.support,
    'official_sources', case when q.origin = 'staziamed' then q.source_quotes end
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
