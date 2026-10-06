-- =============================================================================
-- Aulas teórico-práticas (Módulo Audiovisual StaziaMed).
--
-- Estrutura de cada aula: área, tema, título, duração, professor/convidado, especialidade, vídeo,
-- materiais complementares (slides PDF, áudio Flashcast MP3, diretriz SUS/PCDT), resumo e
-- racionalidade clínica, pontos-chave para o Revalida, e o botão "Treinar questões deste tema".
--
-- Regras:
--  * conteúdo é da equipe (admin/editor): o aluno só lê aulas publicadas;
--  * arquivos ficam no depósito privado "lessons" e chegam ao navegador pelas rotas /api/lessons,
--    que conferem o acesso; o vídeo é um endereço externo (YouTube, Vimeo ou MP4);
--  * concluir uma aula vale XP no Stazia Play (evento LESSON_COMPLETED, uma vez por aula).
-- =============================================================================

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  area public.med_area not null,
  topic text not null check (char_length(topic) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  duration_minutes integer check (duration_minutes between 1 and 600),
  instructor text check (char_length(instructor) <= 160),
  specialty text check (char_length(specialty) <= 120),
  video_url text check (video_url is null or video_url ~ '^https://'),
  summary text check (char_length(summary) <= 8000),
  key_points text[] not null default '{}' check (cardinality(key_points) <= 30),
  guideline_title text check (char_length(guideline_title) <= 200),
  guideline_url text check (guideline_url is null or guideline_url ~ '^https://'),
  published boolean not null default false,
  position integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_area_idx on public.lessons (area, published, position);
alter table public.lessons enable row level security;
create policy "aulas: publicadas para logados, todas para a equipe" on public.lessons
  for select to authenticated using (published or public.is_staff());
create trigger lessons_touch before update on public.lessons for each row execute function public.touch_updated_at();

create table public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  kind text not null check (kind in ('slides', 'flashcast', 'guideline', 'other')),
  title text not null check (char_length(title) between 1 and 200),
  storage_path text,
  content_type text,
  size_bytes bigint check (size_bytes >= 0),
  url text check (url is null or url ~ '^https://'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check (storage_path is not null or url is not null)
);
create index lesson_materials_lesson_idx on public.lesson_materials (lesson_id, position);
alter table public.lesson_materials enable row level security;
create policy "materiais: da aula visível" on public.lesson_materials
  for select to authenticated using (exists (select 1 from public.lessons l where l.id = lesson_id and (l.published or public.is_staff())));

create table public.lesson_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  seconds_watched integer not null default 0 check (seconds_watched between 0 and 86400),
  completed_at timestamptz,
  last_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table public.lesson_progress enable row level security;
create policy "progresso da aula: ler o próprio" on public.lesson_progress
  for select to authenticated using (user_id = (select auth.uid()));
-- Escrita só por app_lesson_progress (confere que a aula está publicada).

-- Depósito privado dos materiais (slides PDF e áudios). No PGlite não há schema storage.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('lessons', 'lessons', false, 209715200, array['application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a'])
    on conflict (id) do update set public = false;
  end if;
end
$$;

-- Concluir a aula vale XP (uma vez por aula; a regra xp.lesson_completed é do administrador).
create function public.gam_process_lesson() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.completed_at is null or (tg_op = 'UPDATE' and old.completed_at is not null) then return null; end if;
  if not public.gam_flag('flags.gamification_enabled') then return null; end if;
  perform public.gam_ensure(new.user_id);
  perform public.gam_award(new.user_id, 'LESSON_COMPLETED', 'lesson', new.lesson_id::text, public.gam_num('xp.lesson_completed', 20)::int, 0,
                           (select jsonb_build_object('area', l.area, 'topic', l.topic, 'title', l.title) from public.lessons l where l.id = new.lesson_id));
  update public.user_gamification_stats set last_qualified_activity_at = clock_timestamp() where user_id = new.user_id;
  perform public.gam_after_activity(new.user_id);
  return null;
end
$$;
create trigger lesson_progress_play after insert or update of completed_at on public.lesson_progress
  for each row execute function public.gam_process_lesson();
revoke execute on function public.gam_process_lesson() from public, anon, authenticated;

-- ---------------------------------------------------------------- visões
create function public.lesson_view(l public.lessons) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'area', l.area, 'area_label', public.area_label(l.area), 'topic', l.topic, 'title', l.title,
    'duration_minutes', l.duration_minutes, 'instructor', l.instructor, 'specialty', l.specialty, 'video_url', l.video_url,
    'summary', l.summary, 'key_points', to_jsonb(l.key_points), 'guideline_title', l.guideline_title, 'guideline_url', l.guideline_url,
    'published', l.published, 'position', l.position, 'updated_at', l.updated_at,
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'has_file', m.storage_path is not null,
                                                               'content_type', m.content_type, 'size_bytes', m.size_bytes, 'url', m.url) order by m.position, m.created_at)
                           from public.lesson_materials m where m.lesson_id = l.id), '[]'::jsonb),
    'progress', (select jsonb_build_object('seconds_watched', p.seconds_watched, 'completed_at', p.completed_at, 'last_at', p.last_at)
                 from public.lesson_progress p where p.lesson_id = l.id and p.user_id = (select auth.uid())))
$$;

-- Catálogo do aluno: só publicadas, com contagem por área e o progresso dele.
create function public.app_lessons(p_area text default null, p_search text default null) returns jsonb
  language sql stable set search_path = ''
as $$
  with mine as (
    select * from public.lessons l
    where l.published
      and (nullif(p_area, '') is null or l.area::text = p_area)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
           or public.fold_text(l.title || ' ' || l.topic || ' ' || coalesce(l.instructor, '') || ' ' || coalesce(l.summary, '')) like '%' || public.fold_text(btrim(p_search)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*)::int from public.lessons where published),
    'by_area', (select coalesce(jsonb_object_agg(x.area, x.n), '{}'::jsonb) from (select area, count(*)::int n from public.lessons where published group by area) x),
    'completed', (select count(*)::int from public.lesson_progress p join public.lessons l on l.id = p.lesson_id where p.user_id = (select auth.uid()) and p.completed_at is not null and l.published),
    'lessons', coalesce((select jsonb_agg(public.lesson_view(m) order by m.position, m.created_at) from mine m), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

create function public.app_lesson(p_id uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  select public.lesson_view(l) || jsonb_build_object(
    'questions_topic', (select count(*)::int from public.practice_pool(jsonb_build_object('area', l.area, 'topic', l.topic))),
    'questions_area', (select count(*)::int from public.practice_pool(jsonb_build_object('area', l.area))))
  from public.lessons l where l.id = p_id
$$;

-- Material de uma aula visível (o servidor usa para servir o arquivo; o RLS decide quem vê).
create function public.app_lesson_material(p_id uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'storage_path', m.storage_path, 'content_type', m.content_type, 'url', m.url)
  from public.lesson_materials m where m.id = p_id
$$;

-- Progresso: segundos assistidos (só cresce) e conclusão. Só em aula publicada.
create function public.app_lesson_progress(p_id uuid, p_seconds integer default null, p_completed boolean default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  l public.lessons;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into l from public.lessons where id = p_id and published;
  if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  insert into public.lesson_progress (user_id, lesson_id, seconds_watched, completed_at)
  values (v_uid, l.id, least(greatest(coalesce(p_seconds, 0), 0), 86400), case when coalesce(p_completed, false) then now() end)
  on conflict (user_id, lesson_id) do update set
    seconds_watched = greatest(public.lesson_progress.seconds_watched, least(greatest(coalesce(p_seconds, 0), 0), 86400)),
    completed_at = coalesce(public.lesson_progress.completed_at, case when coalesce(p_completed, false) then now() end),
    last_at = now();
  return (select jsonb_build_object('seconds_watched', p.seconds_watched, 'completed_at', p.completed_at,
            'xp', (select e.xp_awarded from public.gamification_events e where e.user_id = v_uid and e.event_type = 'LESSON_COMPLETED' and e.source_id = l.id::text and e.created_at >= now()))
          from public.lesson_progress p where p.user_id = v_uid and p.lesson_id = l.id);
end
$$;

-- "Treinar questões deste tema": o tema da aula; se não houver questão com esse tema, a área.
create function public.app_start_lesson_questions(p_id uuid, p_count integer default 20) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  l public.lessons;
  v_filters jsonb;
begin
  select * into l from public.lessons where id = p_id;
  if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  v_filters := jsonb_build_object('area', l.area, 'topic', l.topic);
  if (select count(*) from public.practice_pool(v_filters)) = 0 then v_filters := jsonb_build_object('area', l.area); end if;
  return public.app_start_session('questoes', v_filters, coalesce(p_count, 20)) || jsonb_build_object('filters', v_filters, 'lesson_id', l.id);
end
$$;

-- ---------------------------------------------------------------- administração (equipe)
create function public.app_lesson_topics(p_area text default null) returns jsonb
  language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('area', x.area, 'topic', x.topic, 'questions', x.n) order by x.n desc, x.topic), '[]'::jsonb)
  from (select q.area, q.topic, count(*)::int n from public.questions q
        where q.status <> 'annulled' and (nullif(p_area, '') is null or q.area::text = p_area) group by q.area, q.topic) x
$$;

create function public.app_admin_lessons() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'lessons', coalesce((select jsonb_agg(public.lesson_view(l) || jsonb_build_object(
        'completed_by', (select count(*)::int from public.lesson_progress p where p.lesson_id = l.id and p.completed_at is not null),
        'started_by', (select count(*)::int from public.lesson_progress p where p.lesson_id = l.id)) order by l.area, l.position, l.created_at)
      from public.lessons l), '[]'::jsonb));
end
$$;

create function public.app_admin_save_lesson(p_lesson jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb := coalesce(p_lesson, '{}'::jsonb);
  v_id uuid;
  v_points text[];
begin
  perform public.assert_staff();
  if nullif(btrim(coalesce(a ->> 'title', '')), '') is null then raise exception 'Informe o título da aula.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(a ->> 'topic', '')), '') is null then raise exception 'Informe o tema da aula.' using errcode = '22023'; end if;
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  if a ? 'key_points' and jsonb_typeof(a -> 'key_points') = 'array' then
    select array_agg(btrim(x) order by o) into v_points from jsonb_array_elements_text(a -> 'key_points') with ordinality as t (x, o) where btrim(x) <> '';
  end if;
  begin
    if nullif(a ->> 'id', '') is null then
      insert into public.lessons (area, topic, title, duration_minutes, instructor, specialty, video_url, summary, key_points, guideline_title, guideline_url, published, position, created_by)
      values ((a ->> 'area')::public.med_area, btrim(a ->> 'topic'), btrim(a ->> 'title'), (a ->> 'duration_minutes')::int, nullif(btrim(coalesce(a ->> 'instructor', '')), ''),
              nullif(btrim(coalesce(a ->> 'specialty', '')), ''), nullif(btrim(coalesce(a ->> 'video_url', '')), ''), nullif(btrim(coalesce(a ->> 'summary', '')), ''),
              coalesce(v_points, '{}'), nullif(btrim(coalesce(a ->> 'guideline_title', '')), ''), nullif(btrim(coalesce(a ->> 'guideline_url', '')), ''),
              coalesce((a ->> 'published')::boolean, false), coalesce((a ->> 'position')::int, 0), (select auth.uid()))
      returning id into v_id;
    else
      v_id := (a ->> 'id')::uuid;
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
        published = coalesce((a ->> 'published')::boolean, published),
        position = coalesce((a ->> 'position')::int, position)
        where id = v_id;
      if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
    end if;
  exception when check_violation then
    raise exception 'Dados da aula inválidos: confira duração (1 a 600 min), endereços (https) e tamanhos dos textos.' using errcode = '22023';
  end;
  perform public.admin_log('lesson.save', v_id::text, a - 'summary');
  return public.app_lesson(v_id);
end
$$;

create function public.app_admin_delete_lesson(p_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  delete from public.lessons where id = p_id;
  if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  perform public.admin_log('lesson.delete', p_id::text);
  return true;
end
$$;

-- Registra um material: arquivo já guardado pelo servidor (storage_path) ou endereço externo (url).
create function public.app_admin_lesson_material(p_lesson_id uuid, p_material jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb := coalesce(p_material, '{}'::jsonb);
  v_kind constant text := coalesce(m ->> 'kind', 'other');
begin
  perform public.assert_staff();
  if not exists (select 1 from public.lessons where id = p_lesson_id) then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  if v_kind not in ('slides', 'flashcast', 'guideline', 'other') then raise exception 'Tipo de material inválido.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(m ->> 'title', '')), '') is null then raise exception 'Informe o título do material.' using errcode = '22023'; end if;
  if nullif(m ->> 'storage_path', '') is null and nullif(m ->> 'url', '') is null then raise exception 'Informe o arquivo ou o endereço do material.' using errcode = '22023'; end if;
  if nullif(m ->> 'storage_path', '') is not null and not (m ->> 'storage_path' ~ ('^lessons/' || p_lesson_id::text || '/')) then
    raise exception 'Caminho de arquivo inválido.' using errcode = '22023';
  end if;
  -- slides e flashcast: um por aula (o novo substitui)
  if v_kind in ('slides', 'flashcast') then delete from public.lesson_materials where lesson_id = p_lesson_id and kind = v_kind; end if;
  insert into public.lesson_materials (lesson_id, kind, title, storage_path, content_type, size_bytes, url, position)
  values (p_lesson_id, v_kind, btrim(m ->> 'title'), nullif(m ->> 'storage_path', ''), m ->> 'content_type', (m ->> 'size_bytes')::bigint, nullif(btrim(coalesce(m ->> 'url', '')), ''),
          case v_kind when 'slides' then 1 when 'flashcast' then 2 when 'guideline' then 3 else 9 end);
  perform public.admin_log('lesson.material', p_lesson_id::text, m);
  return public.app_lesson(p_lesson_id);
end
$$;

create function public.app_admin_delete_lesson_material(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_lesson uuid;
begin
  perform public.assert_staff();
  delete from public.lesson_materials where id = p_id returning lesson_id into v_lesson;
  if v_lesson is null then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  perform public.admin_log('lesson.material.delete', p_id::text);
  return public.app_lesson(v_lesson);
end
$$;

revoke execute on function public.app_lessons(text, text) from anon;
revoke execute on function public.app_lesson(uuid) from anon;
revoke execute on function public.app_lesson_material(uuid) from anon;
revoke execute on function public.app_lesson_progress(uuid, integer, boolean) from anon;
revoke execute on function public.app_start_lesson_questions(uuid, integer) from anon;
revoke execute on function public.app_lesson_topics(text) from anon;
