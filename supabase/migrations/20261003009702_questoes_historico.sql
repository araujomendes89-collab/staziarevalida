-- =============================================================================
-- Aba Questões, Q12 (decisão do dono, 11/10/2026): histórico de mudanças da questão no editor, visível a toda a equipe.
--
--   * O banco já guarda cada mudança em question_change_log (gatilho questions_change_trail): enunciado, alternativas (com as
--     explicações), gabarito, situação, prova/número, conduta esperada, "o que avalia", tema e subtema. Faltava a leitura pela tela:
--     app_admin_question_history, para a equipe toda (editor e administrador), da mais nova para a mais antiga, em páginas, com o
--     nome de quem mudou (ou o e-mail; vazio quando a mudança foi feita direto no banco, sem pessoa logada), o motivo e o antes e o
--     depois de cada campo.
--   * "Voltar para este texto" é só da tela: copia o texto antigo para o formulário, sem salvar. Nada aqui desfaz nada.
--   * O gatilho passa a registrar também a figura da questão (campo "figura": o texto alternativo de antes e de depois, nulo quando
--     não há figura) e a marca "Cita figura" (campo "needs_image"), que a Q07 passou a mudar pela tela. O histórico que já existe
--     não é mexido.
--   * O histórico de uma questão apagada não fica na tabela (apaga junto, por cascata); a cópia da questão fica no Registro de ações
--     (question.delete), como já era.
--
-- Funções: questions_change_trail redefinida (corpo da …6100, a versão mais nova); nova app_admin_question_history (equipe).
-- Exige a …9701 (usa question_person_name). Pode ser colada duas vezes. Para desfazer: apagar app_admin_question_history e recriar
-- questions_change_trail como na …6100.
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.question_person_name(uuid)') is null then
    raise exception 'Cole primeiro o arquivo da …9701 (comentário em revisão) e depois este.';
  end if;
end
$guard$;

create or replace function public.questions_change_trail() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  c jsonb := '{}'::jsonb;
  v_old_alt text;
  v_new_alt text;
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
  -- Q07/Q12: a figura (o texto alternativo de cada uma; nulo sem figura) e a marca "Cita figura"
  if new.needs_image is distinct from old.needs_image then c := c || jsonb_build_object('needs_image', jsonb_build_object('de', old.needs_image, 'para', new.needs_image)); end if;
  if new.images is distinct from old.images then
    select string_agg(i ->> 'alt', ' | ') into v_old_alt from jsonb_array_elements(old.images) i;
    select string_agg(i ->> 'alt', ' | ') into v_new_alt from jsonb_array_elements(new.images) i;
    c := c || jsonb_build_object('figura', jsonb_build_object('de', v_old_alt, 'para', v_new_alt));
  end if;
  if c <> '{}'::jsonb then
    insert into public.question_change_log (question_id, changed_by, reason, changes) values (new.id, (select auth.uid()), nullif(current_setting('sqie.reason', true), ''), c);
  end if;
  return new;
end
$$;
-- create or replace mantém os privilégios (…2200 já tirou o execute de todos); repetido aqui para quem ler só esta migração
revoke execute on function public.questions_change_trail() from public, anon, authenticated;

-- ---------------------------------------------------------------- a leitura da equipe
-- { total, items: [{ id, at, by, reason, changes }] }, da mais nova para a mais antiga. changes: { campo: { de, para } }.
create or replace function public.app_admin_question_history(p_question_id text, p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if not exists (select 1 from public.questions q where q.id = p_question_id) then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'total', (select count(*)::int from public.question_change_log l where l.question_id = p_question_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.changed_at, 'by', public.question_person_name(x.changed_by), 'reason', x.reason, 'changes', x.changes) order by x.changed_at desc, x.id desc)
      from (select * from public.question_change_log l where l.question_id = p_question_id
            order by l.changed_at desc, l.id desc
            limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) x
    ), '[]'::jsonb));
end
$$;
revoke execute on function public.app_admin_question_history(text, integer, integer) from public, anon;
