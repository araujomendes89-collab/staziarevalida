-- =============================================================================
-- Fase 1 · Grupo A · CC09 — Central de Conteúdo › Documentos: "Tirar marcas de terceiros" volta a funcionar SEM licença cadastrada.
-- Depois que as regras de licença saíram (migração 7100), a retirada de nome/marca de outro curso ficou impossível: o servidor exigia
-- uma licença que não existe mais. Agora o administrador digita os nomes e endereços a tirar, vê a prévia (antes e depois, nada é
-- gravado), aplica e pode desfazer. O texto extraído ORIGINAL nunca é alterado: o resultado vai para o texto revisado (ou o bloco que só
-- tinha a marca é excluído), tudo registrado em ch_reference_cleanups.
-- Pode ser colada de novo no Supabase sem estragar nada. Não apaga nem altera nenhum dado. Desfazer continua usando
-- ch_worker_undo_reference_cleanup (20261003003000), que já funciona sem licença.
-- =============================================================================

-- A retirada sem licença não tem licença para registrar.
alter table public.ch_reference_cleanups alter column license_id drop not null;

create or replace function public.ch_worker_apply_reference_cleanup_free(p_document_id uuid, p_actor uuid, p_terms text[], p_changes jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c jsonb;
  b public.ch_blocks;
  v_current text;
  v_edited integer := 0; v_excluded integer := 0; v_skipped integer := 0;
begin
  if not exists (select 1 from public.ch_documents where id = p_document_id) then
    raise exception 'Documento não encontrado.' using errcode = 'P0002';
  end if;
  for c in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    select * into b from public.ch_blocks where id = (c ->> 'block_id')::uuid and document_id = p_document_id for update;
    if not found then v_skipped := v_skipped + 1; continue; end if;
    v_current := coalesce(b.revised_text, b.original_text);
    -- o bloco mudou depois da prévia (alguém revisou): não se aplica por cima
    if v_current is distinct from c ->> 'before' or b.status <> 'extracted' then v_skipped := v_skipped + 1; continue; end if;
    if coalesce((c ->> 'exclude')::boolean, false) then
      update public.ch_blocks set status = 'excluded', exclusion_reason = 'Marca de terceiros (retirada pela equipe)' where id = b.id;
      insert into public.ch_reference_cleanups (license_id, document_id, block_id, action, before_text, before_revised, before_status, removed, applied_by)
      values (null, p_document_id, b.id, 'excluded', v_current, b.revised_text, b.status, array(select jsonb_array_elements_text(coalesce(c -> 'removed', '[]'::jsonb))), p_actor);
      v_excluded := v_excluded + 1;
    else
      update public.ch_blocks set revised_text = c ->> 'after', flags = flags || jsonb_build_array(jsonb_build_object('code', 'reference_removed')) where id = b.id;
      insert into public.ch_reference_cleanups (license_id, document_id, block_id, action, before_text, after_text, before_revised, before_status, removed, applied_by)
      values (null, p_document_id, b.id, 'edited', v_current, c ->> 'after', b.revised_text, b.status, array(select jsonb_array_elements_text(coalesce(c -> 'removed', '[]'::jsonb))), p_actor);
      v_edited := v_edited + 1;
    end if;
  end loop;
  insert into public.ch_audit (actor_id, action, target, details)
  values (p_actor, 'content.clean_references', p_document_id::text, jsonb_build_object('terms', coalesce(to_jsonb(p_terms), '[]'::jsonb), 'edited', v_edited, 'excluded', v_excluded, 'skipped', v_skipped));
  return jsonb_build_object('edited', v_edited, 'excluded', v_excluded, 'skipped', v_skipped);
end
$$;

do $revoke$
begin
  revoke execute on function public.ch_worker_apply_reference_cleanup_free(uuid, uuid, text[], jsonb) from public, anon, authenticated;
end
$revoke$;
