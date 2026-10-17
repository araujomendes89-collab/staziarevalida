-- Desfaz supabase/migrations/20261003013630_mini_tutor.sql (regras do mini tutor no servidor).
-- Volta ao desenho de antes: a trava do simulado em andamento e o limite de pistas por questão ficam só na tela.
-- NÃO desfaz: conversas que herdaram o nível de pista de outra conversa continuam com esse nível.

-- sorteio de questão: volta a não pular o simulado em andamento (antes de apagar a função que ele chama)
do $undo$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_start(text, text, text, jsonb, text)'::regprocedure) into v_def;
  v_new := replace(v_def, $$public.tutor_pick_question(v_user, p_mode, 3::smallint, public.tutor_simulado_aberto_ids(v_user), v_area)$$,
                          $$public.tutor_pick_question(v_user, p_mode, 3::smallint, '{}', v_area)$$);
  if v_new <> v_def then execute v_new; end if;

  select pg_get_functiondef('public.tutor_next_for(uuid, uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, $$coalesce(array[s.question_id], '{}') || public.tutor_simulado_aberto_ids(v_user), s.settings ->> 'area')$$,
                          $$coalesce(array[s.question_id], '{}'), s.settings ->> 'area')$$);
  if v_new <> v_def then execute v_new; end if;
end
$undo$;

drop trigger if exists tutor_sessions_mini_tutor_guard on public.tutor_sessions;
drop function if exists public.tutor_sessions_mini_tutor_guard();
drop function if exists public.tutor_simulado_aberto_ids(uuid);
