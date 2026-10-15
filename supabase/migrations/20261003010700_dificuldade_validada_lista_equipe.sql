-- Dificuldade validada (1 a 5): LEITURA em lote para a equipe, na Administração › Questões › Dificuldade validada.
-- Aditiva: só cria uma função de leitura. Não grava nada, não calcula nem estima dificuldade (só mostra o que a equipe cadastrou
-- por app_admin_set_question_difficulty, da 20261003010500). O aluno não chama esta função (assert_staff).
create or replace function public.app_admin_question_difficulties(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_search constant text := nullif(btrim(coalesce(f ->> 'search', '')), '');
  -- 'none' = sem dificuldade validada; '1'..'5' = esse nível; vazio = todas
  v_level constant text := nullif(btrim(coalesce(f ->> 'level', '')), '');
begin
  perform public.assert_staff();
  if v_level is not null and v_level not in ('none', '1', '2', '3', '4', '5') then
    raise exception 'Filtro de dificuldade inválido.' using errcode = '22023';
  end if;
  return (
    with matched as (
      select q.id, q.code, q.area, q.topic, q.subtopic, q.origin, q.exam_id, q.number, q.status, left(q.statement, 160) as excerpt,
             d.level, d.note, d.validated_at, d.validated_by
      from public.questions q
      left join public.question_difficulty_review d on d.question_id = q.id
      where (v_search is null
             or q.code ilike '%' || v_search || '%'
             or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, '')) like '%' || public.fold_text(v_search) || '%')
        and (nullif(f ->> 'area', '') is null or q.area::text = f ->> 'area')
        and (nullif(f ->> 'origin', '') is null or q.origin = f ->> 'origin')
        and (v_level is null
             or (v_level = 'none' and d.level is null)
             or (v_level <> 'none' and d.level = v_level::int))
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matched),
      'validated_total', (select count(*)::int from public.question_difficulty_review),
      'questions_total', (select count(*)::int from public.questions),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'code', m.code, 'area', m.area, 'topic', m.topic, 'subtopic', m.subtopic, 'origin', m.origin,
          'status', m.status, 'excerpt', m.excerpt, 'level', m.level, 'note', m.note, 'validated_at', m.validated_at,
          'validated_by', case when m.validated_by is null then null else public.question_person_name(m.validated_by) end)
          order by m.exam_id desc, m.number)
        from (select * from matched order by exam_id desc, number
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) m
      ), '[]'::jsonb)
    )
  );
end
$$;
revoke execute on function public.app_admin_question_difficulties(jsonb, integer, integer) from public, anon;
grant execute on function public.app_admin_question_difficulties(jsonb, integer, integer) to authenticated;
