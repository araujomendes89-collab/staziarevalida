-- =============================================================================
-- Aulas: conferência registrada antes de ir ao aluno (A01) e nome de arquivo fora do que o aluno lê (A05) - 11/10/2026.
--
--  * A01: publicar uma aula (ou mudar título, tema, resumo ou pontos-chave de uma publicada) exige dizer o que foi conferido
--    (pelo menos 10 caracteres). Sempre que o campo vem preenchido, o banco grava QUEM conferiu (a conta logada) e QUANDO, mesmo
--    sem mudar o texto: é assim que as aulas antigas ("sem registro de conferência") passam a ter registro.
--  * O registro (nota, quem, quando) e os avisos da IA ficam numa tabela PRÓPRIA (lesson_reviews), com acesso por linha ligado
--    sem política e sem permissão para aluno e visitante: a tabela lessons é lida por qualquer aluno logado, então uma coluna
--    ali sairia em /rest/v1/lessons?select=review_note,ai_notes. Só as funções app_admin_* (dono) leem e gravam.
--  * A05: o título do material guarda o nome do arquivo de quem enviou. O aluno passa a receber só um rótulo neutro
--    ("Material complementar", "Áudio Flashcast", "Material 2") em app_lessons, app_lesson e app_lesson_material; a equipe
--    recebe o nome real em "file_title". A leitura direta da tabela lesson_materials fica só para a equipe (nenhum código do
--    app ou do servidor lê essa tabela direto: tudo passa pelas funções).
--  * Aulas já publicadas continuam no ar; nada é apagado.
--
-- As funções partem das versões de 20261003004000_aulas.sql (a única até aqui). Pode ser colado duas vezes.
-- =============================================================================

create table if not exists public.lesson_reviews (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  ai_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_notes) = 'array')
);
alter table public.lesson_reviews enable row level security;
revoke all on table public.lesson_reviews from public, anon, authenticated;

-- Só para a equipe (as funções app_admin_* abaixo): quem conferiu, quando, o que foi conferido e os avisos da IA.
create or replace function public.lesson_review_view(l public.lessons) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'reviewer', (select coalesce(nullif(p.name, ''), u.email) from auth.users u left join public.profiles p on p.id = u.id where u.id = r.reviewed_by),
    'reviewed_at', r.reviewed_at, 'review_note', r.review_note, 'ai_notes', coalesce(r.ai_notes, '[]'::jsonb))
  from (select 1) one left join public.lesson_reviews r on r.lesson_id = l.id
$$;
revoke execute on function public.lesson_review_view(public.lessons) from public, anon, authenticated;

-- Materiais da aula como o app lê: o aluno só vê aula publicada e recebe um título neutro (nunca o nome do arquivo);
-- a equipe recebe também o nome real em file_title.
create or replace function public.lesson_materials_json(p_lesson uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.j order by x.position, x.created_at), '[]'::jsonb)
  from (
    select m.position, m.created_at,
      jsonb_build_object(
        'id', m.id, 'kind', m.kind,
        'title', case m.kind when 'slides' then 'Material complementar' when 'flashcast' then 'Áudio Flashcast'
                             when 'guideline' then case when m.storage_path is null then m.title else 'Diretriz' end
                             else 'Material ' || row_number() over (partition by m.kind order by m.position, m.created_at) end,
        'has_file', m.storage_path is not null, 'content_type', m.content_type, 'size_bytes', m.size_bytes, 'url', m.url)
      || case when public.is_staff() then jsonb_build_object('file_title', m.title) else '{}'::jsonb end as j
    from public.lesson_materials m
    where m.lesson_id = p_lesson
      and exists (select 1 from public.lessons l where l.id = p_lesson and (l.published or public.is_staff()))
  ) x
$$;
revoke execute on function public.lesson_materials_json(uuid) from public, anon;
grant execute on function public.lesson_materials_json(uuid) to authenticated;

create or replace function public.lesson_view(l public.lessons) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'area', l.area, 'area_label', public.area_label(l.area), 'topic', l.topic, 'title', l.title,
    'duration_minutes', l.duration_minutes, 'instructor', l.instructor, 'specialty', l.specialty, 'video_url', l.video_url,
    'summary', l.summary, 'key_points', to_jsonb(l.key_points), 'guideline_title', l.guideline_title, 'guideline_url', l.guideline_url,
    'published', l.published, 'position', l.position, 'updated_at', l.updated_at,
    'materials', public.lesson_materials_json(l.id),
    'progress', (select jsonb_build_object('seconds_watched', p.seconds_watched, 'completed_at', p.completed_at, 'last_at', p.last_at)
                 from public.lesson_progress p where p.lesson_id = l.id and p.user_id = (select auth.uid())))
$$;

-- Material de uma aula visível (o servidor usa para servir o arquivo). Aluno: título neutro e só aula publicada.
create or replace function public.app_lesson_material(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'kind', m.kind,
           'title', case when public.is_staff() then m.title else case m.kind when 'slides' then 'Material complementar' when 'flashcast' then 'Áudio Flashcast' else 'Material' end end,
           'storage_path', m.storage_path, 'content_type', m.content_type, 'url', m.url)
  from public.lesson_materials m join public.lessons l on l.id = m.lesson_id
  where m.id = p_id and (select auth.uid()) is not null and (l.published or public.is_staff())
$$;
revoke execute on function public.app_lesson_material(uuid) from public, anon;
grant execute on function public.app_lesson_material(uuid) to authenticated;

-- Leitura direta da tabela de materiais: só a equipe (o aluno passa pelas funções acima).
drop policy if exists "materiais: da aula visível" on public.lesson_materials;
drop policy if exists "materiais: só a equipe" on public.lesson_materials;
create policy "materiais: só a equipe" on public.lesson_materials for select to authenticated using (public.is_staff());

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
  v_exige boolean := false;
  v_confere boolean := v_note <> '';
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
    v_exige := v_old.id is null or not v_old.published
      or btrim(a ->> 'title') is distinct from v_old.title
      or btrim(a ->> 'topic') is distinct from v_old.topic
      or (a ? 'summary' and nullif(btrim(coalesce(a ->> 'summary', '')), '') is distinct from v_old.summary)
      or (a ? 'key_points' and coalesce(v_points, '{}') is distinct from v_old.key_points);
    if v_exige and char_length(v_note) < 10 then
      raise exception 'Antes de publicar, registre o que foi conferido no texto da aula (pelo menos 10 caracteres).' using errcode = '22023';
    end if;
  end if;
  -- nota preenchida vale sempre (inclusive em aula antiga sem registro), mas precisa dizer algo
  if v_confere and char_length(v_note) < 10 then
    raise exception 'Registre o que foi conferido no texto da aula (pelo menos 10 caracteres).' using errcode = '22023';
  end if;
  begin
    if v_old.id is null then
      insert into public.lessons (area, topic, title, duration_minutes, instructor, specialty, video_url, summary, key_points, guideline_title, guideline_url, published, position, created_by)
      values ((a ->> 'area')::public.med_area, btrim(a ->> 'topic'), btrim(a ->> 'title'), (a ->> 'duration_minutes')::int, nullif(btrim(coalesce(a ->> 'instructor', '')), ''),
              nullif(btrim(coalesce(a ->> 'specialty', '')), ''), nullif(btrim(coalesce(a ->> 'video_url', '')), ''), nullif(btrim(coalesce(a ->> 'summary', '')), ''),
              coalesce(v_points, '{}'), nullif(btrim(coalesce(a ->> 'guideline_title', '')), ''), nullif(btrim(coalesce(a ->> 'guideline_url', '')), ''),
              v_publica, coalesce((a ->> 'position')::int, 0), (select auth.uid()))
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
        position = coalesce((a ->> 'position')::int, position)
        where id = v_id;
    end if;
  exception when check_violation then
    raise exception 'Dados da aula inválidos: confira duração (1 a 600 min), endereços (https) e tamanhos dos textos.' using errcode = '22023';
  end;
  if v_confere or v_ai is not null then
    insert into public.lesson_reviews as r (lesson_id, reviewed_by, reviewed_at, review_note, ai_notes)
    values (v_id, case when v_confere then (select auth.uid()) end, case when v_confere then now() end, case when v_confere then v_note end, coalesce(v_ai, '[]'::jsonb))
    on conflict (lesson_id) do update set
      reviewed_by = case when v_confere then (select auth.uid()) else r.reviewed_by end,
      reviewed_at = case when v_confere then now() else r.reviewed_at end,
      review_note = case when v_confere then v_note else r.review_note end,
      ai_notes = coalesce(v_ai, r.ai_notes);
  end if;
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
