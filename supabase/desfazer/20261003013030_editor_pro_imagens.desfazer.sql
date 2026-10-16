-- Desfaz a migração de imagens do editor pro (20261003013030).
-- AVISO: Apagar as tabelas ch_doc_assets e ch_doc_asset_events perde todo o registro e histórico 
-- das imagens (quem enviou, aulas ligadas, etc), embora os arquivos continuem no depósito se ele não for apagado.

drop function if exists public.app_ch_doc_imagem_arquivar(uuid, boolean);
drop function if exists public.app_ch_doc_imagem_texto_alternativo(uuid, text);
drop function if exists public.app_ch_doc_imagem(uuid);
drop function if exists public.app_ch_doc_imagens(jsonb);
drop function if exists public.ch_worker_doc_imagem_aluno(uuid);
drop function if exists public.ch_worker_doc_imagem_links(uuid, uuid[]);
drop function if exists public.ch_worker_doc_imagem_arquivo(uuid, uuid);
drop function if exists public.ch_worker_doc_imagem_registrar(uuid, jsonb);
drop function if exists public.ch_doc_asset_json(public.ch_doc_assets);

drop table if exists public.ch_doc_asset_events cascade;
drop table if exists public.ch_doc_assets cascade;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    if not exists (select 1 from storage.objects where bucket_id = 'doc-imagens') then
      delete from storage.buckets where id = 'doc-imagens';
    end if;
  end if;
end
$$;
