-- =============================================================================
-- Aulas: registro de quem conferiu o texto antes de ir ao aluno (correção A01, 11/10/2026).
--
--  * Publicar uma aula (ou mudar título, tema, resumo ou pontos-chave de uma aula publicada) exige dizer o que foi conferido
--    (pelo menos 10 caracteres). O banco grava QUEM conferiu (a pessoa logada, não um nome digitado) e QUANDO.
--  * Os avisos que a IA deu ao gerar o texto (número fora dos trechos citados, "o material não esclarece") ficam guardados
--    na aula (ai_notes) e aparecem para a equipe; o aluno nunca vê nada disso (lesson_view não mudou).
--  * Aulas que já estão publicadas continuam no ar, sem registro de conferência ("sem registro" na tela da equipe):
--    nada é apagado nem tirado do ar por este SQL.
--
-- As funções redefinidas partem da versão de 20261003004000_aulas.sql (a única até aqui). Pode ser colado duas vezes.
-- =============================================================================

alter table public.lessons add column if not exists reviewed_by uuid references auth.users (id) on delete set null;
alter table public.lessons add column if not exists reviewed_at timestamptz;
alter table public.lessons add column if not exists review_note text check (review_note is null or char_length(review_note) <= 1000);
alter table public.lessons add column if not exists ai_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_notes) = 'array');

-- Só para a equipe (as funções app_admin_* abaixo): quem conferiu, quando, o que foi conferido e os avisos da IA.
create or replace function public.lesson_review_view(l public.lessons) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'reviewer', coalesce((select nullif(p.name, '') from public.profiles p where p.id = l.reviewed_by), (select u.email from auth.users u where u.id = l.reviewed_by)),
    'reviewed_at', l.reviewed_at, 'review_note', l.review_note, 'ai_notes', l.ai_notes)
$$;
revoke execute on function public.lesson_review_view(public.lessons) from public, anon, authenticated;

create or replace function public.app_admin_lessons() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'lessons', coalesce((select jsonb_agg(public.lesson_view(l) || public.lesson_review_view(l) || jsonb_build_object(
        'completed_by', (select count(*)::int from public.lesson_progress p where p.lesson_id = l.id and p.completed_at is not null),
        'started_by', (select count(*)::int from public.lesson_progress p where p.lesson_id = l.id)) order by l.area, l.position, l.created_at)
      from public.lessons l), '[]'::jsonb));
end
$$;

create or replace function public.app_admin_save_lesson(p_lesson jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb := coalesce(p_lesson, '{}'::jsonb);
  v_id uuid;
  v_points text[];
  v_old public.lessons;
  v_note text := btrim(coalesce(a ->> 'review_note', ''));
  v_publica boolean;
  v_confere boolean := false;
  v_ai jsonb;
begin
  perform public.assert_staff();
  if nullif(btrim(coalesce(a ->> 'title', '')), '') is null then raise exception 'Informe o título da aula.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(a ->> 'topic', '')), '') is null then raise exception 'Informe o tema da aula.' using errcode = '22023'; end if;
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  if a ? 'key_points' and jsonb_typeof(a -> 'key_points') = 'array' then
    select array_agg(btrim(x) order by o) into v_points from jsonb_array_elements_text(a -> 'key_points') with ordinality as t (x, o) where btrim(x) <> '';
  end if;
  -- avisos da IA (até 30, 300 caracteres cada)
  if a ? 'ai_notes' and jsonb_typeof(a -> 'ai_notes') = 'array' then
    select coalesce(jsonb_agg(to_jsonb(left(btrim(x), 300)) order by o), '[]'::jsonb) into v_ai
      from jsonb_array_elements_text(a -> 'ai_notes') with ordinality as t (x, o) where btrim(x) <> '' and o <= 30;
  end if;
  if nullif(a ->> 'id', '') is not null then
    select * into v_old from public.lessons where id = (a ->> 'id')::uuid for update;
    if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  end if;
  -- vai ficar publicada? Então precisa de conferência registrada quando acabou de ser publicada ou quando o texto do aluno mudou.
  v_publica := coalesce((a ->> 'published')::boolean, coalesce(v_old.published, false));
  if v_publica then
    v_confere := v_old.id is null or not v_old.published
      or btrim(a ->> 'title') is distinct from v_old.title
      or btrim(a ->> 'topic') is distinct from v_old.topic
      or (a ? 'summary' and nullif(btrim(coalesce(a ->> 'summary', '')), '') is distinct from v_old.summary)
      or (a ? 'key_points' and coalesce(v_points, '{}') is distinct from v_old.key_points);
    if v_confere and char_length(v_note) < 10 then
      raise exception 'Antes de publicar, registre o que foi conferido no texto da aula (pelo menos 10 caracteres).' using errcode = '22023';
    end if;
  end if;
  begin
    if v_old.id is null then
      insert into public.lessons (area, topic, title, duration_minutes, instructor, specialty, video_url, summary, key_points, guideline_title, guideline_url, published, position, created_by,
                                  reviewed_by, reviewed_at, review_note, ai_notes)
      values ((a ->> 'area')::public.med_area, btrim(a ->> 'topic'), btrim(a ->> 'title'), (a ->> 'duration_minutes')::int, nullif(btrim(coalesce(a ->> 'instructor', '')), ''),
              nullif(btrim(coalesce(a ->> 'specialty', '')), ''), nullif(btrim(coalesce(a ->> 'video_url', '')), ''), nullif(btrim(coalesce(a ->> 'summary', '')), ''),
              coalesce(v_points, '{}'), nullif(btrim(coalesce(a ->> 'guideline_title', '')), ''), nullif(btrim(coalesce(a ->> 'guideline_url', '')), ''),
              v_publica, coalesce((a ->> 'position')::int, 0), (select auth.uid()),
              case when v_confere then (select auth.uid()) end, case when v_confere then now() end, case when v_confere then v_note end, coalesce(v_ai, '[]'::jsonb))
      returning id into v_id;
    else
      v_id := v_old.id;
      update public.lessons set
        area = (a ->> 'area')::public.med_area, topic = btrim(a ->> 'topic'), title = btrim(a ->> 'title'),
        duration_minutes = case when a ? 'duration_minutes' then (a ->> 'duration_minutes')::int else duration_minutes end,
        instructor = case when a ? 'instructor' then nullif(btrim(a ->> 'instructor'), '') else instructor end,
        specialty = case when a ? 'specialty' then nullif(btrim(a ->> 'specialty'), '') else specialty end,
        video_url = case when a ? 'video_url' then nullif(btrim(a ->> 'video_url'), '') else video_url end,
        summary = case when a ? 'summary' then nullif(btrim(a ->> 'summary'), '') else summary end,
        key_points = case when a ? 'key_points' then coalesce(v_points, '{}') else key_points end,
        guideline_title = case when a ? 'guideline_title' then nullif(btrim(a ->> 'guideline_title'), '') else guideline_title end,
        guideline_url = case when a ? 'guideline_url' then nullif(btrim(a ->> 'guideline_url'), '') else guideline_url end,
        published = v_publica,
        position = coalesce((a ->> 'position')::int, position),
        reviewed_by = case when v_confere then (select auth.uid()) else reviewed_by end,
        reviewed_at = case when v_confere then now() else reviewed_at end,
        review_note = case when v_confere then v_note else review_note end,
        ai_notes = coalesce(v_ai, ai_notes)
        where id = v_id;
    end if;
  exception when check_violation then
    raise exception 'Dados da aula inválidos: confira duração (1 a 600 min), endereços (https) e tamanhos dos textos.' using errcode = '22023';
  end;
  perform public.admin_log('lesson.save', v_id::text, a - 'summary');
  if v_confere then
    perform public.admin_log('lesson.review', v_id::text, jsonb_build_object('title', btrim(a ->> 'title'), 'note', v_note));
  end if;
  return public.app_lesson(v_id) || (select public.lesson_review_view(l) from public.lessons l where l.id = v_id);
end
$$;

-- Sem login ninguém chama estas funções (a equipe logada continua chamando).
revoke execute on function public.app_admin_lessons() from public, anon;
revoke execute on function public.app_admin_save_lesson(jsonb) from public, anon;
grant execute on function public.app_admin_lessons() to authenticated;
grant execute on function public.app_admin_save_lesson(jsonb) to authenticated;
