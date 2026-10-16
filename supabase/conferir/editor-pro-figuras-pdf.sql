-- StaziaMed · FIGURAS DO EDITOR PROFISSIONAL NO PDF (M11b) · CONFERIR (só lê; não altera nada).
-- Rode ANTES (mostra o que falta) e DEPOIS de colar
-- supabase/migrations/20261003013100_editor_pro_figuras_pdf.sql.
-- Resposta: uma linha. "OK: ..." ou "FALTA: ...".
with falta (ordem, item) as (
  select 1, 'função ch_worker_doc_imagem_versao(uuid,uuid) não existe'
   where to_regprocedure('public.ch_worker_doc_imagem_versao(uuid,uuid)') is null
  union all select 2, 'visitante (sem login) pode executar ch_worker_doc_imagem_versao'
   where coalesce(has_function_privilege('anon', to_regprocedure('public.ch_worker_doc_imagem_versao(uuid,uuid)')::oid, 'execute'), false)
  union all select 3, 'aluno logado pode executar ch_worker_doc_imagem_versao'
   where coalesce(has_function_privilege('authenticated', to_regprocedure('public.ch_worker_doc_imagem_versao(uuid,uuid)')::oid, 'execute'), false)
)
select case when count(*) = 0 then 'OK: função ch_worker_doc_imagem_versao pronta e protegida'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
