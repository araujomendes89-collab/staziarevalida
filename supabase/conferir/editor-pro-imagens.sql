-- StaziaMed · IMAGENS DO EDITOR PROFISSIONAL (M11a) · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar
-- supabase/migrations/20261003013030_editor_pro_imagens.sql. Precisa do esquema "storage" do Supabase (existe em todo projeto Supabase).
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou.
with falta (ordem, item) as (
  select 1, 'tabela ' || t from unnest(array['ch_doc_assets','ch_doc_asset_events']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'função desta migração ' || f from unnest(array[
    'ch_worker_doc_imagem_registrar(uuid,jsonb)',
    'ch_worker_doc_imagem_arquivo(uuid,uuid)',
    'ch_worker_doc_imagem_links(uuid,uuid[])',
    'ch_worker_doc_imagem_aluno(uuid)',
    'app_ch_doc_imagens(jsonb)',
    'app_ch_doc_imagem(uuid)',
    'app_ch_doc_imagem_texto_alternativo(uuid,text)',
    'app_ch_doc_imagem_arquivar(uuid,boolean)'
  ]) f
   where to_regprocedure('public.' || f) is null
  union all select 3, 'visitante (sem login) executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_ch_doc_imagens','app_ch_doc_imagem','app_ch_doc_imagem_texto_alternativo','app_ch_doc_imagem_arquivar')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 4, 'aluno logado executando a função só do servidor ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('ch_worker_doc_imagem_registrar','ch_worker_doc_imagem_arquivo','ch_worker_doc_imagem_links','ch_worker_doc_imagem_aluno')
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all select 5, 'RLS desligado em ' || t.relname from pg_class t join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname in ('ch_doc_assets','ch_doc_asset_events') and not t.relrowsecurity
  union all select 6, 'visitante (sem login) pode ler a tabela ' || t.relname from pg_class t join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname in ('ch_doc_assets','ch_doc_asset_events') and has_table_privilege('anon', t.oid, 'select')
  union all select 7, 'pessoa logada pode gravar direto (' || p || ') em ' || t from unnest(array['ch_doc_assets','ch_doc_asset_events']) t, unnest(array['insert','update','delete']) p
   where to_regclass('public.' || t) is not null and has_table_privilege('authenticated', 'public.' || t, p)
  union all select 8, 'depósito doc-imagens está PÚBLICO (tem de ser privado)' where exists (select 1 from storage.buckets where id = 'doc-imagens' and public)
  union all select 9, 'depósito doc-imagens não existe' where not exists (select 1 from storage.buckets where id = 'doc-imagens')
  union all select 10, 'função interna executável por pessoa logada: ch_doc_asset_json'
   where coalesce(has_function_privilege('authenticated', to_regprocedure('public.ch_doc_asset_json(public.ch_doc_assets)')::oid, 'execute'), false)
)
select case when count(*) = 0 then 'OK: imagens do editor profissional prontas (tabelas, funções, proteção e depósito privado)'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
