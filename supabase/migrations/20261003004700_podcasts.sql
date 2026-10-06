-- =============================================================================
-- Podcasts (Flashcast) a partir dos materiais, no estilo NotebookLM, com revisão humana.
-- Pedido de 2026-10-06 ("Fluxo ideal no Stazia: administrador envia PDF, DOCX, texto ou link → …→ Podcast é publicado"); mapa em
-- docs/architecture/PODCASTS.md.
--
--   fontes (PDF, DOCX, texto, link ou uma aula)  →  o servidor extrai e divide em TRECHOS com a origem (documento e página)
--   →  a IA (Gemini, Claude ou OpenAI, escolhida no painel) escolhe os trechos e escreve o ROTEIRO de dois apresentadores
--      (ANA e BRUNO), cada fala citando os trechos usados; o que as fontes não esclarecem, o roteiro diz que não esclarecem
--   →  a EQUIPE revisa e aprova o roteiro (pode editar; editar tira a aprovação e o áudio)
--   →  a VOZ (Gemini TTS com dois locutores; ou OpenAI, uma voz por fala) gera o áudio; o MP3 vai para o depósito "podcasts"
--   →  o ADMINISTRADOR publica; só então os alunos ouvem (um arquivo para todos).
-- A IA nunca aprova nem publica. Nada de chave no navegador: tudo pelo servidor.
-- =============================================================================

-- ---------------------------------------------------------------- depósito (privado; no PGlite não há schema storage)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('podcasts', 'podcasts', false, 104857600,
            array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'audio/mpeg', 'application/json', 'application/octet-stream'])
    on conflict (id) do update set public = false;
  end if;
end
$$;

-- ---------------------------------------------------------------- episódios
create table public.podcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  topic text check (char_length(topic) <= 160),
  area public.med_area,
  lesson_id uuid references public.lessons (id) on delete set null,
  language text not null default 'pt-BR' check (language = 'pt-BR'),
  format text not null default 'two_hosts' check (format = 'two_hosts'),
  target_minutes smallint not null default 8 check (target_minutes between 2 and 30),
  status text not null default 'draft' check (status in ('draft', 'script_ready', 'approved', 'audio_ready', 'published')),
  -- { lines: [{ speaker: "ANA" | "BRUNO", text, style, sources: [ids dos trechos] }], missing: [o que as fontes não esclarecem] }
  script jsonb check (script is null or jsonb_typeof(script) = 'object'),
  script_meta jsonb not null default '{}'::jsonb check (jsonb_typeof(script_meta) = 'object'),  -- provedor, modelo, tokens, custo, quando
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  approval_note text check (char_length(approval_note) <= 600),
  audio_path text check (char_length(audio_path) <= 300),
  audio_bytes integer check (audio_bytes >= 0),
  audio_seconds integer check (audio_seconds >= 0),
  audio_meta jsonb not null default '{}'::jsonb check (jsonb_typeof(audio_meta) = 'object'),    -- provedor, modelo, vozes, custo
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  -- só sai para os alunos com roteiro aprovado por gente e áudio pronto
  constraint podcasts_publish_check check (status <> 'published' or (approved_at is not null and audio_path is not null and published_at is not null))
);
create index podcasts_status_idx on public.podcasts (status, published_at desc);
alter table public.podcasts enable row level security;
create policy "podcasts: equipe lê" on public.podcasts for select to authenticated using (public.is_staff());
-- aluno lê pelos app_podcast*(só publicados); escrita só pelas funções

create table public.podcast_sources (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcasts (id) on delete cascade,
  kind text not null check (kind in ('pdf', 'docx', 'text', 'link', 'lesson')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  storage_path text check (char_length(storage_path) <= 300),
  url text check (url is null or url ~ '^https://'),
  lesson_id uuid references public.lessons (id) on delete set null,
  pages integer check (pages >= 0),
  chars integer check (chars >= 0),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index podcast_sources_podcast_idx on public.podcast_sources (podcast_id, position);
alter table public.podcast_sources enable row level security;
create policy "fontes de podcast: equipe lê" on public.podcast_sources for select to authenticated using (public.is_staff());

create table public.podcast_chunks (
  id bigint generated always as identity primary key,
  podcast_id uuid not null references public.podcasts (id) on delete cascade,
  source_id uuid not null references public.podcast_sources (id) on delete cascade,
  ord integer not null check (ord >= 0),
  page integer check (page >= 1),
  text text not null check (char_length(text) between 1 and 4000)
);
create index podcast_chunks_podcast_idx on public.podcast_chunks (podcast_id, source_id, ord);
alter table public.podcast_chunks enable row level security;
create policy "trechos de podcast: equipe lê" on public.podcast_chunks for select to authenticated using (public.is_staff());

-- registro de uso de IA: roteiro, voz e o assistente da aula entram no mesmo livro-caixa
alter table public.ai_usage_ledger drop constraint ai_usage_ledger_feature_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_feature_check
  check (feature in ('tutor_text', 'tutor_eval', 'tutor_voice', 'tutor_voice_tokens', 'tutor_tts', 'tutor_voice_live', 'tutor_voice_backend',
                     'podcast_script', 'podcast_tts', 'lesson_assist'));

-- ---------------------------------------------------------------- apoio (user_is_staff vem de …4600)
-- Episódio completo para a equipe: fontes, roteiro e, para cada trecho citado no roteiro, de onde veio (para conferir).
create function public.podcast_admin_view(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select to_jsonb(p) || jsonb_build_object(
    'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id),
    'approved_by_name', (select coalesce(nullif(pr.name, ''), u.email) from auth.users u left join public.profiles pr on pr.id = u.id where u.id = p.approved_by),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title, 'url', s.url, 'lesson_id', s.lesson_id, 'pages', s.pages, 'chars', s.chars, 'storage_path', s.storage_path,
                                          'chunks', (select count(*)::int from public.podcast_chunks c where c.source_id = s.id), 'created_at', s.created_at)
                       order by s.position, s.created_at)
      from public.podcast_sources s where s.podcast_id = p.id), '[]'::jsonb),
    'chunks_total', (select count(*)::int from public.podcast_chunks c where c.podcast_id = p.id),
    'cited', coalesce((
      select jsonb_object_agg(c.id::text, jsonb_build_object('source', s.title, 'page', c.page, 'excerpt', left(c.text, 600)))
      from public.podcast_chunks c join public.podcast_sources s on s.id = c.source_id
      where c.podcast_id = p.id
        and c.id in (select (jsonb_array_elements_text(l -> 'sources'))::bigint from jsonb_array_elements(coalesce(p.script -> 'lines', '[]'::jsonb)) l)), '{}'::jsonb))
  from public.podcasts p where p.id = p_id
$$;

-- ---------------------------------------------------------------- aluno (só publicados)
create function public.app_podcasts(p_area text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'topic', p.topic, 'area', p.area, 'seconds', p.audio_seconds,
                                               'published_at', p.published_at, 'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id and l.published))
                   order by p.published_at desc), '[]'::jsonb)
  from public.podcasts p
  where p.status = 'published' and (select auth.uid()) is not null and (nullif(p_area, '') is null or p.area::text = p_area)
$$;

-- Episódio publicado: transcrição (quem fala e o quê) e as fontes (documento e páginas usadas), sem os trechos inteiros.
create function public.app_podcast(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'title', p.title, 'topic', p.topic, 'area', p.area, 'seconds', p.audio_seconds, 'published_at', p.published_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('speaker', l ->> 'speaker', 'text', l ->> 'text') order by o) from jsonb_array_elements(p.script -> 'lines') with ordinality as x (l, o)), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'kind', s.kind, 'url', s.url, 'pages',
                         (select jsonb_agg(distinct c.page order by c.page) from public.podcast_chunks c
                          where c.source_id = s.id and c.page is not null
                            and c.id in (select (jsonb_array_elements_text(l -> 'sources'))::bigint from jsonb_array_elements(p.script -> 'lines') l)))
                       order by s.position, s.created_at)
      from public.podcast_sources s where s.podcast_id = p.id), '[]'::jsonb),
    'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id and l.published))
  from public.podcasts p
  where p.id = p_id and p.status = 'published' and (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- equipe
create function public.app_admin_podcasts() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'topic', p.topic, 'area', p.area, 'status', p.status, 'target_minutes', p.target_minutes,
                                        'seconds', p.audio_seconds, 'sources', (select count(*)::int from public.podcast_sources s where s.podcast_id = p.id),
                                        'lines', jsonb_array_length(coalesce(p.script -> 'lines', '[]'::jsonb)), 'updated_at', p.updated_at, 'published_at', p.published_at,
                                        'lesson', (select l.title from public.lessons l where l.id = p.lesson_id))
                     order by p.updated_at desc)
    from public.podcasts p), '[]'::jsonb);
end
$$;

create function public.app_admin_podcast(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform public.assert_staff();
  v := public.podcast_admin_view(p_id);
  if v is null then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  return v;
end
$$;

-- Criar ou editar o que descreve o episódio (tema, área, aula, duração). Não mexe em roteiro nem áudio.
create function public.app_admin_save_podcast(p_podcast jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb := coalesce(p_podcast, '{}'::jsonb);
  v_id uuid := nullif(m ->> 'id', '')::uuid;
  v_area public.med_area := case when m ->> 'area' in (select unnest(enum_range(null::public.med_area))::text) then (m ->> 'area')::public.med_area end;
  v_lesson uuid := nullif(m ->> 'lesson_id', '')::uuid;
begin
  perform public.assert_staff();
  if char_length(btrim(coalesce(m ->> 'title', ''))) < 3 then raise exception 'Dê um título ao episódio (pelo menos 3 letras).' using errcode = '22023'; end if;
  if v_lesson is not null and not exists (select 1 from public.lessons where id = v_lesson) then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  if v_id is null then
    insert into public.podcasts (title, topic, area, lesson_id, target_minutes)
    values (btrim(m ->> 'title'), nullif(btrim(coalesce(m ->> 'topic', '')), ''), v_area, v_lesson, least(greatest(coalesce(nullif(m ->> 'target_minutes', '')::int, 8), 2), 30))
    returning id into v_id;
  else
    update public.podcasts set title = btrim(m ->> 'title'), topic = nullif(btrim(coalesce(m ->> 'topic', '')), ''), area = v_area, lesson_id = v_lesson,
      target_minutes = least(greatest(coalesce(nullif(m ->> 'target_minutes', '')::int, target_minutes), 2), 30), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  end if;
  perform public.admin_log('podcast.save', v_id::text, m - 'id');
  return public.podcast_admin_view(v_id);
end
$$;

-- Apagar o episódio (só administrador). Devolve os arquivos para o servidor apagar do depósito.
create function public.app_admin_delete_podcast(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_paths jsonb;
begin
  perform public.assert_admin();
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_paths from (
    select audio_path x from public.podcasts where id = p_id and audio_path is not null
    union all select storage_path from public.podcast_sources where podcast_id = p_id and storage_path is not null) t;
  delete from public.podcasts where id = p_id;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  perform public.admin_log('podcast.delete', p_id::text, '{}'::jsonb);
  return jsonb_build_object('deleted', true, 'paths', v_paths);
end
$$;

-- Tirar uma fonte. O roteiro deixa de valer (ele podia citar trechos dela).
create function public.app_admin_podcast_remove_source(p_source_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_podcast uuid;
begin
  perform public.assert_staff();
  select podcast_id into v_podcast from public.podcast_sources where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  if (select status from public.podcasts where id = v_podcast) = 'published' then raise exception 'Despublique o episódio antes de mexer nas fontes.' using errcode = '22023'; end if;
  delete from public.podcast_sources where id = p_source_id;
  update public.podcasts set script = null, script_meta = '{}'::jsonb, approved_by = null, approved_at = null, approval_note = null,
    audio_path = null, audio_bytes = null, audio_seconds = null, audio_meta = '{}'::jsonb, status = 'draft', updated_at = now()
  where id = v_podcast and script is not null;
  update public.podcasts set updated_at = now() where id = v_podcast;
  return public.podcast_admin_view(v_podcast);
end
$$;

-- Roteiro editado pela equipe: valida a forma; editar tira a aprovação e o áudio (precisa conferir e gerar de novo).
create function public.app_admin_podcast_save_script(p_id uuid, p_script jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  p public.podcasts;
  v_lines jsonb := p_script -> 'lines';
begin
  perform public.assert_staff();
  select * into p from public.podcasts where id = p_id for update;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if p.status = 'published' then raise exception 'Despublique o episódio antes de editar o roteiro.' using errcode = '22023'; end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) not between 2 and 260 then raise exception 'O roteiro precisa de 2 a 260 falas.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) l
             where coalesce(l ->> 'speaker', '') not in ('ANA', 'BRUNO') or char_length(btrim(coalesce(l ->> 'text', ''))) not between 1 and 700
                or jsonb_typeof(coalesce(l -> 'sources', '[]'::jsonb)) <> 'array') then
    raise exception 'Cada fala precisa de quem fala (ANA ou BRUNO) e de 1 a 700 caracteres.' using errcode = '22023';
  end if;
  update public.podcasts set
    script = jsonb_build_object('lines', (select jsonb_agg(jsonb_build_object('speaker', l ->> 'speaker', 'text', btrim(l ->> 'text'), 'style', left(coalesce(l ->> 'style', ''), 80),
                                                                              'sources', coalesce(l -> 'sources', '[]'::jsonb)) order by o)
                                         from jsonb_array_elements(v_lines) with ordinality as x (l, o)),
                                'missing', coalesce(p_script -> 'missing', p.script -> 'missing', '[]'::jsonb)),
    -- os avisos da conferência eram das falas antigas: saem (a tela confere de novo pelo servidor)
    script_meta = (p.script_meta - 'warnings') || jsonb_build_object('edited_by', (select auth.uid()), 'edited_at', now()),
    approved_by = null, approved_at = null, approval_note = null, audio_path = null, audio_bytes = null, audio_seconds = null, audio_meta = '{}'::jsonb,
    status = 'script_ready', updated_at = now()
  where id = p_id;
  perform public.admin_log('podcast.script.edit', p_id::text, jsonb_build_object('lines', jsonb_array_length(v_lines)));
  return public.podcast_admin_view(p_id);
end
$$;

-- Aprovação do roteiro: sempre de uma pessoa da equipe (a IA nunca aprova), com o que foi conferido.
create function public.app_admin_podcast_approve(p_id uuid, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare p public.podcasts;
begin
  perform public.assert_staff();
  select * into p from public.podcasts where id = p_id for update;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if p.script is null or p.status not in ('script_ready', 'approved') then raise exception 'Gere ou edite o roteiro antes de aprovar.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Escreva o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  update public.podcasts set approved_by = (select auth.uid()), approved_at = now(), approval_note = left(btrim(p_note), 600), status = 'approved', updated_at = now() where id = p_id;
  perform public.admin_log('podcast.approve', p_id::text, jsonb_build_object('note', left(btrim(p_note), 600)));
  return public.podcast_admin_view(p_id);
end
$$;

-- Publicar ou despublicar (só administrador). Publicar exige roteiro aprovado e áudio pronto.
create function public.app_admin_podcast_publish(p_id uuid, p_published boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare p public.podcasts;
begin
  perform public.assert_admin();
  select * into p from public.podcasts where id = p_id for update;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if coalesce(p_published, false) then
    if p.status <> 'audio_ready' or p.approved_at is null or p.audio_path is null then raise exception 'Publicar exige o roteiro aprovado e o áudio pronto.' using errcode = '22023'; end if;
    update public.podcasts set status = 'published', published_by = (select auth.uid()), published_at = now(), updated_at = now() where id = p_id;
  else
    if p.status = 'published' then update public.podcasts set status = 'audio_ready', published_by = null, published_at = null, updated_at = now() where id = p_id; end if;
  end if;
  perform public.admin_log(case when coalesce(p_published, false) then 'podcast.publish' else 'podcast.unpublish' end, p_id::text, '{}'::jsonb);
  return public.podcast_admin_view(p_id);
end
$$;

-- ---------------------------------------------------------------- servidor (chave de serviço; confere a equipe pelo usuário)
create function public.ch_worker_podcast_add_source(p_user uuid, p_podcast uuid, p_source jsonb, p_chunks jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  select status into v_status from public.podcasts where id = p_podcast for update;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if v_status = 'published' then raise exception 'Despublique o episódio antes de mexer nas fontes.' using errcode = '22023'; end if;
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then raise exception 'A fonte não tem texto aproveitável (PDF escaneado precisa de OCR na Central de Conteúdo).' using errcode = '22023'; end if;
  if (select count(*) from public.podcast_sources where podcast_id = p_podcast) >= 20 then raise exception 'No máximo 20 fontes por episódio.' using errcode = '22023'; end if;
  insert into public.podcast_sources (podcast_id, kind, title, storage_path, url, lesson_id, pages, chars, position)
  values (p_podcast, p_source ->> 'kind', left(btrim(p_source ->> 'title'), 200), nullif(p_source ->> 'storage_path', ''), nullif(p_source ->> 'url', ''),
          nullif(p_source ->> 'lesson_id', '')::uuid, nullif(p_source ->> 'pages', '')::int,
          (select sum(char_length(c ->> 'text'))::int from jsonb_array_elements(p_chunks) c),
          (select count(*)::smallint from public.podcast_sources where podcast_id = p_podcast))
  returning id into v_id;
  insert into public.podcast_chunks (podcast_id, source_id, ord, page, text)
  select p_podcast, v_id, (o - 1)::int, nullif(c ->> 'page', '')::int, left(c ->> 'text', 4000)
  from jsonb_array_elements(p_chunks) with ordinality as x (c, o)
  where char_length(btrim(coalesce(c ->> 'text', ''))) > 0;
  update public.podcasts set updated_at = now() where id = p_podcast;
  insert into public.admin_audit_log (actor_id, action, target, details) values (p_user, 'podcast.source', p_podcast::text, jsonb_build_object('kind', p_source ->> 'kind', 'title', left(p_source ->> 'title', 200)));
  return public.podcast_admin_view(p_podcast);
end
$$;

-- O que a IA do roteiro recebe: o episódio e os trechos numerados (documento e página).
create function public.ch_worker_podcast_material(p_user uuid, p_podcast uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', p.id, 'title', p.title, 'topic', p.topic, 'area', p.area, 'status', p.status, 'target_minutes', p.target_minutes, 'script', p.script,
            'chunks', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'source', s.title, 'doc', s.position + 1, 'page', c.page, 'text', c.text) order by s.position, c.ord)
                                from public.podcast_chunks c join public.podcast_sources s on s.id = c.source_id where c.podcast_id = p.id), '[]'::jsonb))
          from public.podcasts p where p.id = p_podcast);
end
$$;

-- Roteiro gerado pela IA: entra para revisão (nunca aprovado).
create function public.ch_worker_podcast_set_script(p_user uuid, p_podcast uuid, p_script jsonb, p_meta jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  if (select status from public.podcasts where id = p_podcast) = 'published' then raise exception 'Despublique o episódio antes de gerar outro roteiro.' using errcode = '22023'; end if;
  if jsonb_typeof(p_script -> 'lines') <> 'array' then raise exception 'Roteiro inválido.' using errcode = '22023'; end if;
  update public.podcasts set script = p_script, script_meta = coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('generated_by', p_user, 'generated_at', now()),
    approved_by = null, approved_at = null, approval_note = null, audio_path = null, audio_bytes = null, audio_seconds = null, audio_meta = '{}'::jsonb,
    status = 'script_ready', updated_at = now()
  where id = p_podcast;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (actor_id, action, target, details) values (p_user, 'podcast.script.ai', p_podcast::text, coalesce(p_meta, '{}'::jsonb) - 'warnings');
  return public.podcast_admin_view(p_podcast);
end
$$;

-- Para gerar o áudio: só roteiro aprovado por gente.
create function public.ch_worker_podcast_audio_job(p_user uuid, p_podcast uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare p public.podcasts;
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  select * into p from public.podcasts where id = p_podcast;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if p.approved_at is null or p.status not in ('approved', 'audio_ready') then raise exception 'Aprove o roteiro antes de gerar o áudio.' using errcode = '22023'; end if;
  return jsonb_build_object('id', p.id, 'title', p.title, 'lines', p.script -> 'lines', 'approved_at', p.approved_at, 'old_audio', p.audio_path);
end
$$;

create function public.ch_worker_podcast_set_audio(p_user uuid, p_podcast uuid, p_audio jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  update public.podcasts set audio_path = p_audio ->> 'path', audio_bytes = (p_audio ->> 'bytes')::int, audio_seconds = (p_audio ->> 'seconds')::int,
    audio_meta = coalesce(p_audio -> 'meta', '{}'::jsonb) || jsonb_build_object('generated_by', p_user, 'generated_at', now()), status = 'audio_ready', updated_at = now()
  where id = p_podcast and approved_at is not null and status in ('approved', 'audio_ready');
  if not found then raise exception 'O roteiro mudou ou não está aprovado: gere o áudio de novo.' using errcode = '22023'; end if;
  insert into public.admin_audit_log (actor_id, action, target, details) values (p_user, 'podcast.audio', p_podcast::text, (p_audio -> 'meta') || jsonb_build_object('seconds', p_audio ->> 'seconds'));
  return public.podcast_admin_view(p_podcast);
end
$$;

-- Arquivo do áudio: aluno só de episódio publicado; equipe de qualquer um (para revisar antes de publicar).
create function public.ch_worker_podcast_audio_path(p_user uuid, p_podcast uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select p.audio_path from public.podcasts p
  where p.id = p_podcast and p.audio_path is not null and (p.status = 'published' or public.user_is_staff(p_user))
$$;

-- Aula como fonte: título, resumo, pontos-chave e o PDF complementar (se houver).
create function public.ch_worker_podcast_lesson(p_user uuid, p_lesson uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', l.id, 'title', l.title, 'topic', l.topic, 'area', l.area, 'summary', l.summary, 'key_points', l.key_points,
            'slides', (select m.storage_path from public.lesson_materials m where m.lesson_id = l.id and m.kind = 'slides' and m.storage_path is not null limit 1))
          from public.lessons l where l.id = p_lesson);
end
$$;

-- "Usar como Flashcast da aula": só áudio de roteiro aprovado por gente. O servidor copia o MP3 para o depósito das aulas
-- e registra o material pela app_admin_lesson_material (como a pessoa, com o RLS).
create function public.ch_worker_podcast_flashcast(p_user uuid, p_podcast uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare p public.podcasts;
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  select * into p from public.podcasts where id = p_podcast;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if p.approved_at is null or p.audio_path is null or p.status not in ('audio_ready', 'published') then
    raise exception 'O Flashcast precisa do roteiro aprovado e do áudio pronto.' using errcode = '22023';
  end if;
  return jsonb_build_object('title', p.title, 'lesson_id', p.lesson_id, 'audio_path', p.audio_path, 'audio_bytes', p.audio_bytes, 'seconds', p.audio_seconds);
end
$$;

do $revoke$
begin
  revoke execute on function public.podcast_admin_view(uuid) from public, anon, authenticated;
  revoke execute on function public.app_podcasts(text) from public, anon;
  revoke execute on function public.app_podcast(uuid) from public, anon;
  revoke execute on function public.app_admin_podcasts() from public, anon;
  revoke execute on function public.app_admin_podcast(uuid) from public, anon;
  revoke execute on function public.app_admin_save_podcast(jsonb) from public, anon;
  revoke execute on function public.app_admin_delete_podcast(uuid) from public, anon;
  revoke execute on function public.app_admin_podcast_remove_source(uuid) from public, anon;
  revoke execute on function public.app_admin_podcast_save_script(uuid, jsonb) from public, anon;
  revoke execute on function public.app_admin_podcast_approve(uuid, text) from public, anon;
  revoke execute on function public.app_admin_podcast_publish(uuid, boolean) from public, anon;
  revoke execute on function public.ch_worker_podcast_add_source(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_material(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_set_script(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_audio_job(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_set_audio(uuid, uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_audio_path(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_lesson(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_flashcast(uuid, uuid) from public, anon, authenticated;
end
$revoke$;
