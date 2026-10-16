-- =============================================================================
-- Leitura de figuras para o PDF no Editor Profissional (M11b)
-- Permite ao trabalhador do servidor (service_role) buscar o caminho no depósito
-- e o mime de uma imagem que faz parte de uma versão de aula em processamento.
-- Só devolve se a imagem existir em public.ch_doc_assets, pertencer à mesma
-- unidade da versão (a.unit_id = v.unit_id) e estiver referenciada no conteúdo
-- da versão (jsonb_path_exists com $.** ? (@.asset == $id)).
-- Caso contrário, lança erro 'Imagem não encontrada.' com código P0002.
-- Visitantes e pessoas logadas não têm permissão de execução (só service_role).
-- Depende da migração 20261003013030_editor_pro_imagens.sql. Pode ser colada duas ou mais vezes.
-- Desfazer: supabase/desfazer/20261003013100_editor_pro_figuras_pdf.desfazer.sql
-- Conferir: supabase/conferir/editor-pro-figuras-pdf.sql
-- =============================================================================

create or replace function public.ch_worker_doc_imagem_versao(p_version_id uuid, p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_caminho text;
  v_mime text;
begin
  select a.storage_path, a.mime
    into v_caminho, v_mime
    from public.ch_doc_assets a
    join public.ch_unit_versions v on v.id = p_version_id
   where a.id = p_id
     and a.unit_id is not null
     and a.unit_id = v.unit_id
     and jsonb_path_exists(v.content, '$.** ? (@.asset == $id)', jsonb_build_object('id', p_id::text));

  if v_caminho is null then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('caminho', v_caminho, 'tipo', v_mime);
end;
$$;

revoke execute on function public.ch_worker_doc_imagem_versao(uuid, uuid) from public, anon, authenticated;
do $g$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.ch_worker_doc_imagem_versao(uuid, uuid) to service_role; end if; end $g$;
