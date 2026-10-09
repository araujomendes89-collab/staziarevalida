-- =============================================================================
-- Assistente de IA nas abas da Administração: a parte do banco (spec docs/superpowers/specs/2026-10-09-assistentes-abas-design.md, §8).
-- A IA não grava nada: quem salva é a pessoa, pelo mesmo salvar de sempre. Esta migração só deixa o rastro mais claro:
--   * app_admin_save_question ganha o motivo (p_reason, opcional). Com motivo, ele vai para a trilha da questão
--     (question_change_log.reason, pela marca sqie.reason desta transação, cortado em 200 caracteres) e para os detalhes
--     do registro de ações (admin_log). O editor manda "assistente de IA" no salvamento seguinte a um "Usar".
--     A lista de parâmetros muda, então a função é apagada e criada de novo; a chamada antiga, sem p_reason, e a trava
--     de equipe continuam iguais.
--   * questions_change_trail passa a registrar também conduta esperada, o que a questão avalia, tema e subtema
--     (expected_conduct, inep_intent, topic, subtopic), no mesmo formato {de, para}. As explicações já entravam, dentro
--     de options.
-- =============================================================================

-- ---------------------------------------------------------------- salvar a questão, agora com o motivo (corpo da …1300)
drop function public.app_admin_save_question(jsonb);
create function public.app_admin_save_question(p_question jsonb, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_problem text;
  v_result text;
  v_id text;
  v_reason constant text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  perform public.assert_staff();
  v_problem := public.admin_question_problem(p_question);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  -- trocar prova/número de uma questão existente não é permitido (mudaria o código e o histórico)
  if nullif(p_question ->> 'id', '') is not null then
    select q.id into v_id from public.questions q
    where q.id = p_question ->> 'id'
      and q.exam_id = public.admin_exam_id(p_question ->> 'kind', (p_question ->> 'year')::int, nullif(p_question ->> 'semester', '')::int)
      and q.number = (p_question ->> 'number')::int;
    if v_id is null then
      raise exception 'Prova e número de uma questão existente não podem ser alterados.' using errcode = '22023';
    end if;
  end if;
  -- o motivo vale só para esta transação: a trilha (questions_change_trail) o lê de sqie.reason
  if v_reason is not null then
    perform set_config('sqie.reason', v_reason, true);
  end if;
  v_result := public.admin_upsert_question(p_question, true);
  perform public.admin_refresh_exam_counts();
  select q.id into v_id from public.questions q
  where q.exam_id = public.admin_exam_id(p_question ->> 'kind', (p_question ->> 'year')::int, nullif(p_question ->> 'semester', '')::int)
    and q.number = (p_question ->> 'number')::int;
  perform public.admin_log('question.' || v_result, v_id,
    jsonb_build_object('status', coalesce(nullif(p_question ->> 'status', ''), 'valid'))
      || case when v_reason is null then '{}'::jsonb else jsonb_build_object('reason', v_reason) end);
  return public.app_admin_question(v_id);
end
$$;
revoke execute on function public.app_admin_save_question(jsonb, text) from public, anon;

-- ---------------------------------------------------------------- trilha da questão com mais 4 campos (corpo da …2200)
create or replace function public.questions_change_trail() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  c jsonb := '{}'::jsonb;
begin
  if new.statement is distinct from old.statement then c := c || jsonb_build_object('statement', jsonb_build_object('de', old.statement, 'para', new.statement)); end if;
  if new.options is distinct from old.options then c := c || jsonb_build_object('options', jsonb_build_object('de', old.options, 'para', new.options)); end if;
  if new.correct_option is distinct from old.correct_option then c := c || jsonb_build_object('correct_option', jsonb_build_object('de', old.correct_option, 'para', new.correct_option)); end if;
  if new.status is distinct from old.status then c := c || jsonb_build_object('status', jsonb_build_object('de', old.status, 'para', new.status)); end if;
  if new.exam_id is distinct from old.exam_id or new.number is distinct from old.number then
    c := c || jsonb_build_object('prova', jsonb_build_object('de', old.exam_id || '#' || old.number, 'para', new.exam_id || '#' || new.number));
  end if;
  if new.expected_conduct is distinct from old.expected_conduct then c := c || jsonb_build_object('expected_conduct', jsonb_build_object('de', old.expected_conduct, 'para', new.expected_conduct)); end if;
  if new.inep_intent is distinct from old.inep_intent then c := c || jsonb_build_object('inep_intent', jsonb_build_object('de', old.inep_intent, 'para', new.inep_intent)); end if;
  if new.topic is distinct from old.topic then c := c || jsonb_build_object('topic', jsonb_build_object('de', old.topic, 'para', new.topic)); end if;
  if new.subtopic is distinct from old.subtopic then c := c || jsonb_build_object('subtopic', jsonb_build_object('de', old.subtopic, 'para', new.subtopic)); end if;
  if c <> '{}'::jsonb then
    insert into public.question_change_log (question_id, changed_by, reason, changes) values (new.id, (select auth.uid()), nullif(current_setting('sqie.reason', true), ''), c);
  end if;
  return new;
end
$$;
-- create or replace mantém os privilégios (…2200 já tirou o execute de todos); repetido aqui para quem ler só esta migração
revoke execute on function public.questions_change_trail() from public, anon, authenticated;

-- Para desfazer: drop function public.app_admin_save_question(jsonb, text) e recriar app_admin_save_question(jsonb) como na
-- migração 1300; recriar questions_change_trail() como na migração 2200.
