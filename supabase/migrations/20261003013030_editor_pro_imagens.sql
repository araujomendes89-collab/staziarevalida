-- =============================================================================
-- Imagens do editor profissional
-- Arquivo no depósito PRIVADO `doc-imagens` (só o servidor, com a chave de serviço lê e grava).
-- O navegador nunca recebe o caminho; a equipe vê por endereço assinado curto gerado no servidor;
-- o aluno vê pelo servidor, que confere login e se a imagem está numa aula PUBLICADA.
-- Versões: substituir uma imagem cria uma linha nova (mesmo family_id); a antiga fica guardada.
-- Contrato com o módulo M11b (nó de figura): o documento guarda só o id da imagem em "attrs.asset"; é por essa chave que
-- ch_worker_doc_imagem_aluno reconhece que a imagem está numa aula publicada.
-- Depende das migrações 1400 (ch_units, ch_unit_versions, ch_publications), 4000 (lessons) e 9992. Pode ser colada duas ou mais vezes.
-- Desfazer: supabase/desfazer/20261003013030_editor_pro_imagens.desfazer.sql · Conferir: supabase/conferir/editor-pro-imagens.sql
-- =============================================================================

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('doc-imagens', 'doc-imagens', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

create table if not exists public.ch_doc_assets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  version integer not null default 1 check (version >= 1),
  previous_id uuid references public.ch_doc_assets (id),
  unit_id uuid references public.ch_units (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  storage_path text not null check (storage_path ~ '^[0-9a-f]{2}/[0-9a-f]{64}\.(png|jpg|webp|gif)$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','image/gif')),
  width integer not null check (width between 1 and 2400),
  height integer not null check (height between 1 and 2400),
  bytes integer not null check (bytes between 1 and 5242880),
  alt_text text not null default '' check (char_length(alt_text) <= 500),
  original_name text check (original_name is null or char_length(original_name) <= 200),
  original_mime text,
  original_bytes integer,
  processing jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by uuid references auth.users (id) on delete set null,
  unique (family_id, version)
);

create index if not exists ch_doc_assets_unit_id_created_at_idx on public.ch_doc_assets (unit_id, created_at desc);
create index if not exists ch_doc_assets_lesson_id_created_at_idx on public.ch_doc_assets (lesson_id, created_at desc);
create index if not exists ch_doc_assets_sha256_idx on public.ch_doc_assets (sha256);
create index if not exists ch_doc_assets_family_id_idx on public.ch_doc_assets (family_id);

create table if not exists public.ch_doc_asset_events (
  id bigint generated always as identity primary key,
  asset_id uuid not null references public.ch_doc_assets (id) on delete cascade,
  family_id uuid not null,
  action text not null check (action in ('enviada','nova_versao','texto_alternativo','arquivada','restaurada')),
  actor uuid references auth.users (id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index if not exists ch_doc_asset_events_family_id_at_idx on public.ch_doc_asset_events (family_id, at);

alter table public.ch_doc_assets enable row level security;
alter table public.ch_doc_asset_events enable row level security;

drop policy if exists "imagens do editor: equipe lê" on public.ch_doc_assets;
create policy "imagens do editor: equipe lê" on public.ch_doc_assets for select to authenticated using (public.is_staff());

drop policy if exists "histórico das imagens: equipe lê" on public.ch_doc_asset_events;
create policy "histórico das imagens: equipe lê" on public.ch_doc_asset_events for select to authenticated using (public.is_staff());

revoke insert, update, delete, truncate on public.ch_doc_assets from anon, authenticated;
revoke all on public.ch_doc_assets from anon;
revoke insert, update, delete, truncate on public.ch_doc_asset_events from anon, authenticated;
revoke all on public.ch_doc_asset_events from anon;


create or replace function public.ch_doc_asset_json(a public.ch_doc_assets) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'family_id', a.family_id, 'version', a.version, 'previous_id', a.previous_id,
    'unit_id', a.unit_id, 'lesson_id', a.lesson_id, 'mime', a.mime, 'width', a.width, 'height', a.height,
    'bytes', a.bytes, 'sha256', a.sha256, 'alt_text', a.alt_text, 'original_name', a.original_name,
    'original_mime', a.original_mime, 'processing', a.processing, 'uploaded_by', a.uploaded_by,
    'enviada_por', (select u.email from auth.users u where u.id = a.uploaded_by),
    'created_at', a.created_at, 'retired_at', a.retired_at
  )
$$;
revoke execute on function public.ch_doc_asset_json(public.ch_doc_assets) from public, anon, authenticated;


create or replace function public.ch_worker_doc_imagem_registrar(p_actor uuid, p_asset jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.ch_doc_assets;
  v_new_id uuid;
  v_new public.ch_doc_assets;
  v_substitui uuid;
  v_max_v int;
  v_unit_id uuid;
  v_lesson_id uuid;
  v_alt_text text;
begin
  if not exists (select 1 from public.user_roles r where r.user_id = p_actor and r.role in ('editor','admin')) then
    raise exception 'Imagens do editor: acesso restrito à equipe.' using errcode = '42501';
  end if;

  v_substitui := (p_asset ->> 'substitui')::uuid;
  
  if v_substitui is null then
    select * into v_old from public.ch_doc_assets 
     where sha256 = p_asset->>'sha256' 
       and unit_id is not distinct from (p_asset->>'unit_id')::uuid 
       and lesson_id is not distinct from (p_asset->>'lesson_id')::uuid 
       and retired_at is null 
     limit 1;
    
    if v_old.id is not null then
      return public.ch_doc_asset_json(v_old) || '{"repetida": true}'::jsonb;
    end if;

    v_new_id := gen_random_uuid();
    insert into public.ch_doc_assets (
      id, family_id, version, previous_id, unit_id, lesson_id, storage_path, sha256, mime,
      width, height, bytes, alt_text, original_name, original_mime, original_bytes, processing,
      uploaded_by
    ) values (
      v_new_id, v_new_id, 1, null, (p_asset->>'unit_id')::uuid, (p_asset->>'lesson_id')::uuid,
      p_asset->>'storage_path', p_asset->>'sha256', p_asset->>'mime',
      (p_asset->>'width')::int, (p_asset->>'height')::int, (p_asset->>'bytes')::int,
      btrim(coalesce(p_asset->>'alt_text', '')), p_asset->>'original_name', p_asset->>'original_mime',
      (p_asset->>'original_bytes')::int, coalesce(p_asset->'processing', '{}'::jsonb), p_actor
    ) returning * into v_new;

    insert into public.ch_doc_asset_events (asset_id, family_id, action, actor)
    values (v_new.id, v_new.family_id, 'enviada', p_actor);
  else
    select * into v_old from public.ch_doc_assets where id = v_substitui;
    if v_old.id is null then
      raise exception 'Imagem não encontrada.' using errcode = 'P0002';
    end if;

    select max(version) into v_max_v from public.ch_doc_assets where family_id = v_old.family_id;
    
    v_unit_id := coalesce((p_asset->>'unit_id')::uuid, v_old.unit_id);
    v_lesson_id := coalesce((p_asset->>'lesson_id')::uuid, v_old.lesson_id);
    v_alt_text := coalesce(nullif(btrim(coalesce(p_asset->>'alt_text', '')), ''), v_old.alt_text);
    
    insert into public.ch_doc_assets (
      family_id, version, previous_id, unit_id, lesson_id, storage_path, sha256, mime,
      width, height, bytes, alt_text, original_name, original_mime, original_bytes, processing,
      uploaded_by
    ) values (
      v_old.family_id, v_max_v + 1, v_old.id, v_unit_id, v_lesson_id,
      p_asset->>'storage_path', p_asset->>'sha256', p_asset->>'mime',
      (p_asset->>'width')::int, (p_asset->>'height')::int, (p_asset->>'bytes')::int,
      v_alt_text, p_asset->>'original_name', p_asset->>'original_mime',
      (p_asset->>'original_bytes')::int, coalesce(p_asset->'processing', '{}'::jsonb), p_actor
    ) returning * into v_new;

    insert into public.ch_doc_asset_events (asset_id, family_id, action, actor, detail)
    values (v_new.id, v_new.family_id, 'nova_versao', p_actor, jsonb_build_object('substitui', v_substitui));
  end if;

  return public.ch_doc_asset_json(v_new) || '{"repetida": false}'::jsonb;
end
$$;
revoke execute on function public.ch_worker_doc_imagem_registrar(uuid, jsonb) from public, anon, authenticated;
do $g$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.ch_worker_doc_imagem_registrar(uuid, jsonb) to service_role; end if; end $g$;


create or replace function public.ch_worker_doc_imagem_arquivo(p_actor uuid, p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_asset public.ch_doc_assets;
begin
  if not (exists (select 1 from public.user_roles r where r.user_id = p_actor and r.role in ('editor','admin')) or
          exists (select 1 from public.ch_reviewer_areas r where r.user_id = p_actor)) then
    raise exception 'Imagens do editor: acesso restrito à equipe.' using errcode = '42501';
  end if;

  select * into v_asset from public.ch_doc_assets where id = p_id;
  if v_asset.id is null then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('caminho', v_asset.storage_path, 'tipo', v_asset.mime);
end
$$;
revoke execute on function public.ch_worker_doc_imagem_arquivo(uuid, uuid) from public, anon, authenticated;
do $g$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.ch_worker_doc_imagem_arquivo(uuid, uuid) to service_role; end if; end $g$;


create or replace function public.ch_worker_doc_imagem_links(p_actor uuid, p_ids uuid[]) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not (exists (select 1 from public.user_roles r where r.user_id = p_actor and r.role in ('editor','admin')) or
          exists (select 1 from public.ch_reviewer_areas r where r.user_id = p_actor)) then
    raise exception 'Imagens do editor: acesso restrito à equipe.' using errcode = '42501';
  end if;
  
  if array_length(p_ids, 1) > 100 then
    raise exception 'No máximo 100 imagens por pedido.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'caminho', storage_path, 'tipo', mime)), '[]'::jsonb)
    into v_res
    from public.ch_doc_assets
   where id = any(p_ids);
   
  return v_res;
end
$$;
revoke execute on function public.ch_worker_doc_imagem_links(uuid, uuid[]) from public, anon, authenticated;
do $g$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.ch_worker_doc_imagem_links(uuid, uuid[]) to service_role; end if; end $g$;


create or replace function public.ch_worker_doc_imagem_aluno(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_asset public.ch_doc_assets;
  v_found boolean := false;
begin
  select * into v_asset from public.ch_doc_assets where id = p_id;
  if v_asset.id is null then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
      from public.lessons l
      join public.ch_unit_versions v on v.id = l.ch_version_id and v.unit_id = l.ch_unit_id and v.status = 'published'
     where l.origin = 'central' and l.published
       and exists (select 1 from public.ch_publications p where p.unit_version_id = v.id and p.retired_at is null)
       and jsonb_path_exists(v.content, '$.** ? (@.asset == $id)', jsonb_build_object('id', p_id::text))
  ) then
    v_found := true;
  end if;
  
  if not v_found then
    if exists (
      select 1
        from public.lessons l
       where l.published
         and jsonb_path_exists(to_jsonb(l) -> 'summary_rico', '$.** ? (@.asset == $id)', jsonb_build_object('id', p_id::text))
    ) then
      v_found := true;
    end if;
  end if;

  if not v_found then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('caminho', v_asset.storage_path, 'tipo', v_asset.mime);
end
$$;
revoke execute on function public.ch_worker_doc_imagem_aluno(uuid) from public, anon, authenticated;
do $g$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.ch_worker_doc_imagem_aluno(uuid) to service_role; end if; end $g$;


create or replace function public.app_ch_doc_imagens(p_filtro jsonb default '{}') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_unit_id uuid;
  v_lesson_id uuid;
  v_busca text;
  v_arquivadas boolean;
  v_todas_versoes boolean;
  v_limite int;
  v_pagina int;
  v_total int;
  v_itens jsonb;
begin
  perform public.assert_staff();
  
  v_unit_id := (p_filtro->>'unit_id')::uuid;
  v_lesson_id := (p_filtro->>'lesson_id')::uuid;
  v_busca := p_filtro->>'busca';
  v_arquivadas := coalesce((p_filtro->>'arquivadas')::boolean, false);
  v_todas_versoes := coalesce((p_filtro->>'todas_versoes')::boolean, false);
  v_limite := coalesce((p_filtro->>'limite')::int, 60);
  if v_limite < 1 then v_limite := 1; end if;
  if v_limite > 200 then v_limite := 200; end if;
  v_pagina := coalesce((p_filtro->>'pagina')::int, 0);
  if v_pagina < 0 then v_pagina := 0; end if;

  if v_busca is not null and v_busca <> '' then
    v_busca := '%' || replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  else
    v_busca := null;
  end if;

  with q as (
    select * from public.ch_doc_assets a
    where (v_unit_id is null or a.unit_id = v_unit_id)
      and (v_lesson_id is null or a.lesson_id = v_lesson_id)
      and (v_arquivadas or a.retired_at is null)
      and (v_busca is null or a.alt_text ilike v_busca or a.original_name ilike v_busca)
      and (v_todas_versoes or a.id = (select a2.id from public.ch_doc_assets a2 where a2.family_id = a.family_id order by a2.version desc limit 1))
  ),
  tot as (select count(*) as c from q)
  select coalesce(jsonb_agg(public.ch_doc_asset_json(q.*) order by q.created_at desc, q.id), '[]'::jsonb), (select c from tot)
    into v_itens, v_total
    from (select * from q order by created_at desc, id offset v_pagina * v_limite limit v_limite) q;
    
  return jsonb_build_object('itens', coalesce(v_itens, '[]'::jsonb), 'total', coalesce(v_total, 0));
end
$$;
revoke execute on function public.app_ch_doc_imagens(jsonb) from public, anon, authenticated;
grant execute on function public.app_ch_doc_imagens(jsonb) to authenticated;


create or replace function public.app_ch_doc_imagem(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_asset public.ch_doc_assets;
  v_versoes jsonb;
  v_historico jsonb;
begin
  perform public.assert_staff();
  
  select * into v_asset from public.ch_doc_assets where id = p_id;
  if v_asset.id is null then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(public.ch_doc_asset_json(a) order by a.version asc), '[]'::jsonb)
    into v_versoes
    from public.ch_doc_assets a
   where a.family_id = v_asset.family_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'acao', e.action,
      'por', (select email from auth.users u where u.id = e.actor),
      'em', e.at,
      'detalhe', e.detail
    ) order by e.at asc), '[]'::jsonb)
    into v_historico
    from public.ch_doc_asset_events e
   where e.family_id = v_asset.family_id;

  return jsonb_build_object(
    'imagem', public.ch_doc_asset_json(v_asset),
    'versoes', v_versoes,
    'historico', v_historico
  );
end
$$;
revoke execute on function public.app_ch_doc_imagem(uuid) from public, anon, authenticated;
grant execute on function public.app_ch_doc_imagem(uuid) to authenticated;


create or replace function public.app_ch_doc_imagem_texto_alternativo(p_id uuid, p_texto text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_asset public.ch_doc_assets;
  v_old_text text;
  v_new_text text;
begin
  perform public.assert_staff();
  
  v_new_text := btrim(coalesce(p_texto, ''));
  if char_length(v_new_text) > 500 then
    raise exception 'Texto alternativo com mais de 500 caracteres.' using errcode = '22023';
  end if;

  select * into v_asset from public.ch_doc_assets where id = p_id for update;
  if v_asset.id is null then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;

  v_old_text := v_asset.alt_text;
  
  if v_old_text is distinct from v_new_text then
    update public.ch_doc_assets set alt_text = v_new_text where id = p_id returning * into v_asset;
    insert into public.ch_doc_asset_events (asset_id, family_id, action, actor, detail)
    values (v_asset.id, v_asset.family_id, 'texto_alternativo', (select auth.uid()), jsonb_build_object('antes', v_old_text, 'depois', v_new_text));
  end if;

  return public.ch_doc_asset_json(v_asset);
end
$$;
revoke execute on function public.app_ch_doc_imagem_texto_alternativo(uuid, text) from public, anon, authenticated;
grant execute on function public.app_ch_doc_imagem_texto_alternativo(uuid, text) to authenticated;


create or replace function public.app_ch_doc_imagem_arquivar(p_id uuid, p_arquivar boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_asset public.ch_doc_assets;
  v_actor uuid := (select auth.uid());
begin
  perform public.assert_staff();
  
  select * into v_asset from public.ch_doc_assets where id = p_id for update;
  if v_asset.id is null then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;

  if p_arquivar then
    if v_asset.retired_at is null then
      update public.ch_doc_assets set retired_at = now(), retired_by = v_actor where id = p_id returning * into v_asset;
      insert into public.ch_doc_asset_events (asset_id, family_id, action, actor)
      values (v_asset.id, v_asset.family_id, 'arquivada', v_actor);
    end if;
  else
    if v_asset.retired_at is not null then
      update public.ch_doc_assets set retired_at = null, retired_by = null where id = p_id returning * into v_asset;
      insert into public.ch_doc_asset_events (asset_id, family_id, action, actor)
      values (v_asset.id, v_asset.family_id, 'restaurada', v_actor);
    end if;
  end if;

  return public.ch_doc_asset_json(v_asset);
end
$$;
revoke execute on function public.app_ch_doc_imagem_arquivar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_ch_doc_imagem_arquivar(uuid, boolean) to authenticated;
