-- =============================================================================
-- Adaptação licenciada: registro da licença e retirada das referências do licenciante.
--
-- Regras:
--   * a licença é um REGISTRO (quem concedeu, quando, até quando, o que autoriza, onde está o documento assinado e o TEXTO dela);
--   * só se retiram referências do licenciante se a licença cadastrada autorizar isso expressamente;
--   * o texto extraído ORIGINAL nunca é alterado: a retirada grava em revised_text (ou exclui o bloco), com registro de cada remoção e desfazer;
--   * licença vencida ou revogada volta o documento ao modo de criação independente e bloqueia a publicação de adaptações.
-- =============================================================================

create table public.ch_licenses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ch_documents (id) on delete cascade,
  licensor text not null check (char_length(btrim(licensor)) > 0),
  work_title text not null check (char_length(btrim(work_title)) > 0),
  granted_on date not null,
  expires_on date,
  allows_adaptation boolean not null default false,
  allows_visual_redesign boolean not null default false,
  allows_attribution_removal boolean not null default false,     -- pode retirar as referências do licenciante (nome, marca, contatos)
  allows_commercial_use boolean not null default false,
  authorization_reference text not null check (char_length(btrim(authorization_reference)) >= 5),   -- onde está o documento assinado
  terms_text text not null check (char_length(btrim(terms_text)) >= 40),                             -- o texto da licença, como recebido
  reference_terms text[] not null default '{}',                  -- o que identifica o licenciante no material (nome, marca, @, site, autores)
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_at timestamptz,
  revoked_reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_on is null or expires_on >= granted_on)
);
create unique index ch_licenses_active_idx on public.ch_licenses (document_id) where status = 'active';
alter table public.ch_licenses enable row level security;
create policy "licenças: equipe lê" on public.ch_licenses for select to authenticated using (public.is_staff());

create table public.ch_reference_cleanups (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.ch_licenses (id) on delete cascade,
  document_id uuid not null references public.ch_documents (id) on delete cascade,
  block_id uuid not null references public.ch_blocks (id) on delete cascade,
  action text not null check (action in ('edited', 'excluded')),
  before_text text,
  after_text text,
  before_revised text,
  before_status text not null,
  removed text[] not null default '{}',
  applied_by uuid references auth.users (id) on delete set null,
  applied_at timestamptz not null default now(),
  undone_at timestamptz
);
create index ch_reference_cleanups_doc_idx on public.ch_reference_cleanups (document_id, applied_at desc);
alter table public.ch_reference_cleanups enable row level security;
create policy "retirada de referências: equipe lê" on public.ch_reference_cleanups for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------- registro da licença
create function public.app_ch_register_license(p_document_id uuid, p_license jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_terms text[];
begin
  perform public.assert_admin();
  if not exists (select 1 from public.ch_documents where id = p_document_id) then raise exception 'Documento não encontrado.' using errcode = 'P0002'; end if;
  if not coalesce((p_license ->> 'allows_adaptation')::boolean, false) then
    raise exception 'Só entra como adaptação licenciada uma licença que autorize adaptar o material.' using errcode = '22023';
  end if;
  if coalesce(p_license ->> 'granted_on', '') = '' then raise exception 'Informe a data da concessão.' using errcode = '22023'; end if;
  v_terms := array(select btrim(t) from jsonb_array_elements_text(coalesce(p_license -> 'reference_terms', '[]'::jsonb)) t where char_length(btrim(t)) >= 3);
  if coalesce((p_license ->> 'allows_attribution_removal')::boolean, false) and cardinality(v_terms) = 0 then
    raise exception 'Para retirar as referências do licenciante, liste o que o identifica no material (nome, marca, @, site).' using errcode = '22023';
  end if;
  update public.ch_licenses set status = 'revoked', revoked_at = now(), revoked_reason = 'Substituída por um novo registro de licença.' where document_id = p_document_id and status = 'active';
  insert into public.ch_licenses (document_id, licensor, work_title, granted_on, expires_on, allows_adaptation, allows_visual_redesign, allows_attribution_removal, allows_commercial_use,
                                  authorization_reference, terms_text, reference_terms)
  values (p_document_id, btrim(p_license ->> 'licensor'), btrim(p_license ->> 'work_title'), (p_license ->> 'granted_on')::date, nullif(p_license ->> 'expires_on', '')::date,
          true, coalesce((p_license ->> 'allows_visual_redesign')::boolean, false), coalesce((p_license ->> 'allows_attribution_removal')::boolean, false), coalesce((p_license ->> 'allows_commercial_use')::boolean, false),
          btrim(p_license ->> 'authorization_reference'), btrim(p_license ->> 'terms_text'), v_terms)
  returning id into v_id;
  update public.ch_documents set rights_status = 'licensed_adaptation',
         rights_note = 'Licença de ' || btrim(p_license ->> 'licensor') || ' (' || btrim(p_license ->> 'work_title') || '), concedida em ' || (p_license ->> 'granted_on') || '. Registro: ' || v_id::text
   where id = p_document_id;
  perform public.ch_log('license.register', v_id::text, jsonb_build_object('document', p_document_id, 'licensor', p_license ->> 'licensor', 'removal', coalesce((p_license ->> 'allows_attribution_removal')::boolean, false)));
  return jsonb_build_object('id', v_id);
end
$$;

create function public.app_ch_revoke_license(p_license_id uuid, p_reason text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare l public.ch_licenses;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  update public.ch_licenses set status = 'revoked', revoked_at = now(), revoked_reason = btrim(p_reason) where id = p_license_id and status = 'active' returning * into l;
  if not found then raise exception 'Licença ativa não encontrada.' using errcode = 'P0002'; end if;
  update public.ch_documents set rights_status = 'reference_only', rights_note = 'Licença revogada: ' || btrim(p_reason) where id = l.document_id;
  perform public.ch_log('license.revoke', p_license_id::text, jsonb_build_object('reason', btrim(p_reason)));
  return true;
end
$$;

create function public.app_ch_licenses(p_document_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object(
      'expired', l.expires_on is not null and l.expires_on < current_date,
      'cleanups', (select count(*)::int from public.ch_reference_cleanups c where c.license_id = l.id and c.undone_at is null)) order by l.created_at desc)
    from public.ch_licenses l where l.document_id = p_document_id), '[]'::jsonb);
end
$$;

-- o worker consulta a licença ativa do documento (e se já venceu)
create function public.ch_worker_license(p_document_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select to_jsonb(l) || jsonb_build_object('expired', l.expires_on is not null and l.expires_on < current_date)
  from public.ch_licenses l where l.document_id = p_document_id and l.status = 'active'
$$;

-- ---------------------------------------------------------------- retirada das referências (aplica e desfaz)
create function public.ch_worker_apply_reference_cleanup(p_document_id uuid, p_license_id uuid, p_actor uuid, p_changes jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  l public.ch_licenses;
  c jsonb;
  b public.ch_blocks;
  v_current text;
  v_edited integer := 0; v_excluded integer := 0; v_skipped integer := 0;
begin
  select * into l from public.ch_licenses where id = p_license_id and document_id = p_document_id and status = 'active';
  if not found then raise exception 'Licença ativa não encontrada para este documento.' using errcode = 'P0002'; end if;
  if l.expires_on is not null and l.expires_on < current_date then raise exception 'A licença está vencida.' using errcode = '22023'; end if;
  if not l.allows_attribution_removal then raise exception 'A licença cadastrada não autoriza retirar as referências do licenciante.' using errcode = '22023'; end if;
  for c in select * from jsonb_array_elements(p_changes) loop
    select * into b from public.ch_blocks where id = (c ->> 'block_id')::uuid and document_id = p_document_id for update;
    if not found then v_skipped := v_skipped + 1; continue; end if;
    v_current := coalesce(b.revised_text, b.original_text);
    -- o bloco mudou depois da prévia (alguém revisou): não se aplica por cima
    if v_current is distinct from c ->> 'before' or b.status <> 'extracted' then v_skipped := v_skipped + 1; continue; end if;
    if coalesce((c ->> 'exclude')::boolean, false) then
      update public.ch_blocks set status = 'excluded', exclusion_reason = 'Referência do licenciante (licença ' || l.id::text || ')' where id = b.id;
      insert into public.ch_reference_cleanups (license_id, document_id, block_id, action, before_text, before_revised, before_status, removed, applied_by)
      values (l.id, p_document_id, b.id, 'excluded', v_current, b.revised_text, b.status, array(select jsonb_array_elements_text(coalesce(c -> 'removed', '[]'::jsonb))), p_actor);
      v_excluded := v_excluded + 1;
    else
      update public.ch_blocks set revised_text = c ->> 'after', flags = flags || jsonb_build_array(jsonb_build_object('code', 'reference_removed', 'license', l.id)) where id = b.id;
      insert into public.ch_reference_cleanups (license_id, document_id, block_id, action, before_text, after_text, before_revised, before_status, removed, applied_by)
      values (l.id, p_document_id, b.id, 'edited', v_current, c ->> 'after', b.revised_text, b.status, array(select jsonb_array_elements_text(coalesce(c -> 'removed', '[]'::jsonb))), p_actor);
      v_edited := v_edited + 1;
    end if;
  end loop;
  insert into public.ch_audit (actor_id, action, target, details) values (p_actor, 'license.clean_references', p_document_id::text, jsonb_build_object('license', l.id, 'edited', v_edited, 'excluded', v_excluded, 'skipped', v_skipped));
  return jsonb_build_object('edited', v_edited, 'excluded', v_excluded, 'skipped', v_skipped);
end
$$;

create function public.ch_worker_undo_reference_cleanup(p_document_id uuid, p_actor uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.ch_reference_cleanups;
  b public.ch_blocks;
  v_undone integer := 0; v_skipped integer := 0;
begin
  for r in select * from public.ch_reference_cleanups where document_id = p_document_id and undone_at is null order by applied_at desc loop
    select * into b from public.ch_blocks where id = r.block_id for update;
    if not found then v_skipped := v_skipped + 1; continue; end if;
    if r.action = 'excluded' then
      if b.status = 'excluded' then
        update public.ch_blocks set status = r.before_status, exclusion_reason = null where id = b.id;
      else v_skipped := v_skipped + 1; continue; end if;
    else
      -- só desfaz se ninguém revisou o texto depois da retirada
      if b.revised_text is distinct from r.after_text then v_skipped := v_skipped + 1; continue; end if;
      update public.ch_blocks set revised_text = r.before_revised,
             flags = coalesce((select jsonb_agg(f) from jsonb_array_elements(flags) f where f ->> 'code' <> 'reference_removed' or (f ->> 'license') is distinct from r.license_id::text), '[]'::jsonb) where id = b.id;
    end if;
    update public.ch_reference_cleanups set undone_at = now() where id = r.id;
    v_undone := v_undone + 1;
  end loop;
  insert into public.ch_audit (actor_id, action, target, details) values (p_actor, 'license.undo_clean_references', p_document_id::text, jsonb_build_object('undone', v_undone, 'skipped', v_skipped));
  return jsonb_build_object('undone', v_undone, 'skipped', v_skipped);
end
$$;

create function public.app_ch_reference_cleanups(p_document_id uuid, p_limit integer default 50) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'block_id', c.block_id, 'page', b.page_no, 'action', c.action, 'before', c.before_text, 'after', c.after_text, 'removed', c.removed,
      'applied_at', c.applied_at, 'undone', c.undone_at is not null) order by c.applied_at desc)
    from (select * from public.ch_reference_cleanups where document_id = p_document_id order by applied_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) c join public.ch_blocks b on b.id = c.block_id), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- publicação: licença vencida bloqueia adaptação
create or replace function public.app_ch_publish(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if public.ch_flag('shadow_mode') then
    raise exception 'Modo sombra ligado: a IA analisa e sugere, mas nada é publicado. Um administrador precisa desligá-lo.' using errcode = '55000';
  end if;
  if not public.ch_flag('publish_enabled') then
    raise exception 'Publicação desligada. Um administrador precisa ligá-la em Configuração.' using errcode = '55000';
  end if;
  if exists (select 1 from public.ch_unit_versions v where v.id = p_version_id and v.origin = 'adaptation')
     and exists (select 1 from public.ch_licenses l
                 where l.status = 'active' and l.expires_on is not null and l.expires_on < current_date
                   and l.document_id in (select c.document_id from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id where uc.unit_version_id = p_version_id)) then
    raise exception 'Publicação bloqueada: a licença do material de origem está vencida.' using errcode = '22023';
  end if;
  return public.ch_publish_impl(p_version_id);
end
$$;

do $revoke$
begin
  revoke execute on function public.ch_worker_license(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_apply_reference_cleanup(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_undo_reference_cleanup(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.app_ch_register_license(uuid, jsonb) from public, anon;
  revoke execute on function public.app_ch_revoke_license(uuid, text) from public, anon;
  revoke execute on function public.app_ch_licenses(uuid) from public, anon;
  revoke execute on function public.app_ch_reference_cleanups(uuid, integer) from public, anon;
  revoke execute on function public.app_ch_publish(uuid) from public, anon;
end
$revoke$;
