-- Desfaz a migração de leitura de figuras para PDF (20261003013100).
drop function if exists public.ch_worker_doc_imagem_versao(uuid, uuid);
