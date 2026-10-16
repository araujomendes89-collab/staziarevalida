-- =============================================================================
-- Taxonomia: publicar uma versão nova não separa mais os temas antigos dos novos (CC26, 2026-10-12).
--
-- Antes: "Abrir rascunho" copia a taxonomia publicada com ids novos, e "Publicar versão" só troca o rótulo (a antiga vira
-- arquivada, a nova vira publicada). Unidades, afirmações e marcas de tema dos blocos continuavam apontando para os temas da
-- versão arquivada; a Central passava a criar unidades novas nos temas novos, e o mesmo tema ficava com duas "vidas". Um tema
-- sugerido pela IA no meio do rascunho sumia da árvore. Os apelidos de um tema renomeado viravam "órfãos".
--
-- Agora:
--   - cada tema do rascunho guarda de qual tema da versão anterior ele veio (origin_node_id);
--   - ao publicar, tudo o que apontava para o tema antigo passa a apontar para o tema da versão nova (unidades, afirmações,
--     marcas de tema dos blocos), os temas que a IA sugeriu depois de aberto o rascunho entram na versão nova e os apelidos
--     seguem o tema renomeado;
--   - temas antigos de versões já arquivadas, se ainda tiverem algo ligado, são levados para a versão publicada pelo caminho
--     (área > subárea > tema > subtema) quando existe o mesmo caminho.
-- Nada é apagado: os temas da versão arquivada continuam lá para consulta.
-- Funções redefinidas partindo da 20261003001400 e da 20261003002900 (únicas versões existentes). Pode ser colada várias vezes.
-- =============================================================================

alter table public.ch_taxonomy_nodes add column if not exists origin_node_id uuid references public.ch_taxonomy_nodes (id) on delete set null;
create index if not exists ch_nodes_origin_idx on public.ch_taxonomy_nodes (origin_node_id);

-- Abre (ou devolve) a versão em rascunho, copiando a publicada e guardando de onde cada tema veio.
create or replace function public.app_ch_taxonomy_draft() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_draft public.ch_taxonomy_versions;
  v_pub public.ch_taxonomy_versions;
  v_map jsonb := '{}'::jsonb;
  r record;
  v_new uuid;
begin
  perform public.assert_staff();
  select * into v_draft from public.ch_taxonomy_versions where status = 'draft';
  if found then return v_draft.version; end if;
  select * into v_pub from public.ch_taxonomy_versions where status = 'published';
  insert into public.ch_taxonomy_versions (version, status, note, created_by)
  values ((select max(version) + 1 from public.ch_taxonomy_versions), 'draft', 'Rascunho', (select auth.uid()))
  returning * into v_draft;
  for r in with recursive tree as (
             select *, 0 as depth from public.ch_taxonomy_nodes where version_id = v_pub.id and parent_id is null
             union all
             select n.*, t.depth + 1 from public.ch_taxonomy_nodes n join tree t on n.parent_id = t.id)
           select * from tree order by depth, position loop
    insert into public.ch_taxonomy_nodes (version_id, parent_id, level, code, name, matrix_competencies, status, suggested_by_ai, position, origin_node_id)
    values (v_draft.id, nullif(v_map ->> r.parent_id::text, '')::uuid, r.level, r.code, r.name, r.matrix_competencies, r.status, r.suggested_by_ai, r.position, r.id)
    returning id into v_new;
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
  end loop;
  perform public.ch_log('taxonomy.draft', v_draft.version::text);
  return v_draft.version;
end
$$;

-- Par tema antigo → tema novo entre duas versões: vale a origem guardada no rascunho; sem ela (rascunho aberto antes desta
-- atualização), vale o mesmo caminho de nomes no mesmo nível.
create or replace function public.ch_taxonomy_map(p_from uuid, p_to uuid) returns table (old_id uuid, new_id uuid)
  language sql stable security definer set search_path = ''
as $$
  with by_origin as (
    select o.id as old_id, n.id as new_id
      from public.ch_taxonomy_nodes n
      join public.ch_taxonomy_nodes o on o.id = n.origin_node_id and o.version_id = p_from
     where n.version_id = p_to),
  by_path as (
    select ok.node_id as old_id, nk.node_id as new_id
      from public.ch_taxonomy_keys(p_from) ok
      join public.ch_taxonomy_keys(p_to) nk on nk.path_key = ok.path_key and nk.level = ok.level
     where ok.node_id not in (select b.old_id from by_origin b)
       and nk.node_id not in (select b.new_id from by_origin b))
  select old_id, new_id from by_origin
  union
  select old_id, new_id from by_path
$$;

-- Leva para a versão `p_to` tudo o que ainda aponta para temas da versão `p_from`. Devolve quantas ligações mudaram.
-- Não mexe nos apelidos (quem chama cuida deles).
create or replace function public.ch_taxonomy_carry_forward(p_from uuid, p_to uuid) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_units integer := 0;
  v_claims integer := 0;
  v_blocks integer := 0;
begin
  update public.ch_units u set theme_node_id = m.new_id from public.ch_taxonomy_map(p_from, p_to) m where u.theme_node_id = m.old_id;
  get diagnostics v_units = row_count;
  update public.ch_claims c set theme_node_id = m.new_id from public.ch_taxonomy_map(p_from, p_to) m where c.theme_node_id = m.old_id;
  get diagnostics v_claims = row_count;
  -- a chave é (bloco, tema): se o bloco já tem a marca do tema novo, a antiga só sai
  delete from public.ch_block_nodes bn using public.ch_taxonomy_map(p_from, p_to) m
   where bn.node_id = m.old_id and exists (select 1 from public.ch_block_nodes x where x.block_id = bn.block_id and x.node_id = m.new_id);
  update public.ch_block_nodes bn set node_id = m.new_id from public.ch_taxonomy_map(p_from, p_to) m where bn.node_id = m.old_id;
  get diagnostics v_blocks = row_count;
  return v_units + v_claims + v_blocks;
end
$$;

create or replace function public.app_ch_taxonomy_publish(p_note text default null) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_draft public.ch_taxonomy_versions;
  v_old public.ch_taxonomy_versions;
  v_map jsonb := '{}'::jsonb;
  v_parent uuid;
  v_new uuid;
  v_moved integer := 0;
  r record;
begin
  perform public.assert_admin();
  select * into v_draft from public.ch_taxonomy_versions where status = 'draft';
  if not found then raise exception 'Não há rascunho para publicar.' using errcode = 'P0002'; end if;
  select * into v_old from public.ch_taxonomy_versions where status = 'published';

  if found then
    -- 1) temas que existem na versão atual e não vieram para o rascunho (ex.: sugeridos pela IA depois de aberto o rascunho)
    for r in with recursive tree as (
               select n.*, 0 as depth from public.ch_taxonomy_nodes n where n.version_id = v_old.id and n.parent_id is null
               union all
               select n.*, t.depth + 1 from public.ch_taxonomy_nodes n join tree t on n.parent_id = t.id)
             select * from tree order by depth, position loop
      v_parent := nullif(v_map ->> r.parent_id::text, '')::uuid;
      v_new := null;
      select d.id into v_new from public.ch_taxonomy_nodes d where d.version_id = v_draft.id and d.origin_node_id = r.id limit 1;
      if v_new is null then
        -- rascunho aberto antes desta atualização (sem origem) ou tema igual criado à mão: mesmo pai e mesmo nome
        select d.id into v_new from public.ch_taxonomy_nodes d
         where d.version_id = v_draft.id and d.origin_node_id is null and d.level = r.level
           and d.parent_id is not distinct from v_parent and lower(d.name) = lower(r.name) limit 1;
        if v_new is not null then
          update public.ch_taxonomy_nodes set origin_node_id = r.id where id = v_new;
        end if;
      end if;
      if v_new is null and (r.parent_id is null or v_parent is not null) then
        insert into public.ch_taxonomy_nodes (version_id, parent_id, level, code, name, matrix_competencies, status, suggested_by_ai, position, origin_node_id)
        values (v_draft.id, v_parent, r.level, r.code, r.name, r.matrix_competencies, r.status, r.suggested_by_ai, r.position, r.id)
        on conflict do nothing
        returning id into v_new;
        if v_new is null then
          select d.id into v_new from public.ch_taxonomy_nodes d
           where d.version_id = v_draft.id and d.level = r.level and d.parent_id is not distinct from v_parent and lower(d.name) = lower(r.name) limit 1;
        end if;
      end if;
      if v_new is not null then v_map := v_map || jsonb_build_object(r.id::text, v_new); end if;
    end loop;

    -- 2) apelidos: seguem o tema quando ele foi renomeado (ou quando o pai foi renomeado)
    update public.ch_taxonomy_aliases a set path_key = nk.path_key
      from public.ch_taxonomy_keys(v_old.id) ok
      join public.ch_taxonomy_nodes n on n.origin_node_id = ok.node_id and n.version_id = v_draft.id
      join public.ch_taxonomy_keys(v_draft.id) nk on nk.node_id = n.id
     where a.path_key = ok.path_key and ok.path_key <> nk.path_key;
  end if;

  update public.ch_taxonomy_versions set status = 'archived' where status = 'published';
  update public.ch_taxonomy_versions set status = 'published', published_at = now(), note = coalesce(nullif(btrim(p_note), ''), note) where id = v_draft.id;

  -- 3) unidades, afirmações e marcas de tema passam para a versão nova
  if v_old.id is not null then v_moved := public.ch_taxonomy_carry_forward(v_old.id, v_draft.id); end if;
  perform public.ch_log('taxonomy.publish', v_draft.version::text, jsonb_build_object('carried', v_moved));
  return v_draft.version;
end
$$;

-- Apelidos de tema (CC27): as mensagens de erro falam "apelido" em vez de "alias" (corpo da 20261003002900, só o texto muda).
create or replace function public.app_ch_taxonomy_add_alias(p_node_id uuid, p_alias text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ver uuid;
  v_node record;
  v_key text := regexp_replace(public.fold_text(btrim(coalesce(p_alias, ''))), '\s+', ' ', 'g');
  v_other text;
  v_id uuid;
begin
  perform public.assert_staff();
  if char_length(v_key) = 0 then raise exception 'Informe o apelido.' using errcode = '22023'; end if;
  select version_id into v_ver from public.ch_taxonomy_nodes where id = p_node_id;
  if not found then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
  select * into v_node from public.ch_taxonomy_keys(v_ver) k where k.node_id = p_node_id;
  if v_node.name_key = v_key then raise exception 'O apelido é igual ao nome do tema.' using errcode = '22023'; end if;
  select k.path into v_other from public.ch_taxonomy_keys(v_ver) k where k.name_key = v_key and k.node_id <> p_node_id limit 1;
  if v_other is not null then raise exception 'Já existe um tema com esse nome: %.', v_other using errcode = '22023'; end if;
  select k.path into v_other from public.ch_taxonomy_aliases a join public.ch_taxonomy_keys(v_ver) k on k.path_key = a.path_key where a.alias_key = v_key limit 1;
  if v_other is not null then raise exception 'Esse apelido já pertence a: %.', v_other using errcode = '22023'; end if;
  insert into public.ch_taxonomy_aliases (path_key, alias, alias_key) values (v_node.path_key, btrim(p_alias), v_key) returning id into v_id;
  perform public.ch_log('taxonomy.alias_add', v_id::text, jsonb_build_object('path', v_node.path, 'alias', btrim(p_alias)));
  return jsonb_build_object('id', v_id, 'path', v_node.path);
end
$$;

create or replace function public.app_ch_taxonomy_remove_alias(p_alias_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_alias text;
begin
  perform public.assert_staff();
  delete from public.ch_taxonomy_aliases where id = p_alias_id returning alias into v_alias;
  if not found then raise exception 'Apelido não encontrado.' using errcode = 'P0002'; end if;
  perform public.ch_log('taxonomy.alias_remove', p_alias_id::text, jsonb_build_object('alias', v_alias));
  return true;
end
$$;


-- Versões que já foram publicadas e arquivadas antes desta atualização: o que ainda aponta para elas vai para a versão
-- publicada pelo caminho de nomes (só quando o mesmo caminho existe lá). Sem versão arquivada ou sem nada ligado, não faz nada.
do $backfill$
declare
  v_pub uuid;
  v_old uuid;
begin
  select id into v_pub from public.ch_taxonomy_versions where status = 'published';
  if v_pub is null then return; end if;
  for v_old in select id from public.ch_taxonomy_versions where status = 'archived' order by version desc loop
    perform public.ch_taxonomy_carry_forward(v_old, v_pub);
  end loop;
  -- o rascunho aberto agora (se houver) passa a saber de onde cada tema veio, pelo caminho de nomes
  update public.ch_taxonomy_nodes d set origin_node_id = pk.node_id
    from public.ch_taxonomy_versions dv, public.ch_taxonomy_keys(v_pub) pk, public.ch_taxonomy_keys(
      (select id from public.ch_taxonomy_versions where status = 'draft')) dk
   where dv.status = 'draft' and d.version_id = dv.id and d.origin_node_id is null
     and dk.node_id = d.id and pk.path_key = dk.path_key and pk.level = dk.level;
end
$backfill$;

do $revoke$
begin
  revoke execute on function public.ch_taxonomy_map(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_taxonomy_carry_forward(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.app_ch_taxonomy_draft() from public, anon;
  revoke execute on function public.app_ch_taxonomy_publish(text) from public, anon;
  revoke execute on function public.app_ch_taxonomy_add_alias(uuid, text) from public, anon;
  revoke execute on function public.app_ch_taxonomy_remove_alias(uuid) from public, anon;
  grant execute on function public.app_ch_taxonomy_add_alias(uuid, text) to authenticated;
  grant execute on function public.app_ch_taxonomy_remove_alias(uuid) to authenticated;
  grant execute on function public.app_ch_taxonomy_draft() to authenticated;
  grant execute on function public.app_ch_taxonomy_publish(text) to authenticated;
end
$revoke$;
