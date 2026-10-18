-- StaziaMed · PLANOS ETAPA 4 (compra e avisos) · CONFERIR (só lê; não altera nada). Rode ANTES e DEPOIS de colar
-- supabase/migrations/20261003013760_compra_avisos.sql. Resposta: uma linha. "OK: ..." = tudo no banco; "FALTA: ..." = o que não entrou.
with falta (ordem, item) as (
  select 1, 'requisito (013700) tabela ' || t from unnest(array['billing_config', 'billing_cobrancas', 'billing_contratos', 'billing_pedidos']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'tabela avisos_aluno' where to_regclass('public.avisos_aluno') is null
  union all select 3, 'proteção (RLS) desligada em avisos_aluno'
   where to_regclass('public.avisos_aluno') is not null and not (select c.relrowsecurity from pg_class c where c.oid = 'public.avisos_aluno'::regclass)
  union all select 4, 'aluno logado grava em avisos_aluno'
   where to_regclass('public.avisos_aluno') is not null and (has_table_privilege('authenticated', 'public.avisos_aluno', 'insert')
     or has_table_privilege('authenticated', 'public.avisos_aluno', 'update') or has_table_privilege('authenticated', 'public.avisos_aluno', 'delete'))
  union all select 5, 'coluna billing_cobrancas.recibo_url'
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_cobrancas' and column_name = 'recibo_url')
  union all select 6, 'função ' || f from unnest(array['ch_worker_avisos_cobranca()', 'ch_worker_avisos_email_pegar(integer,integer)',
      'ch_worker_aviso_email_marcar(bigint,boolean,text)', 'app_meus_avisos()', 'app_avisos_vistos(bigint[])', 'app_billing_historico()',
      'ch_worker_billing_troca_cartao_abrir(uuid,text)', 'ch_worker_billing_para_pix(uuid,text)', 'ch_worker_billing_para_pix_desfazer(uuid,text)', 'ch_worker_billing_cartao_sem_aceite()', 'billing_termo_vigente_ok(uuid)', 'app_amostra_hoje()']) f
   where to_regprocedure('public.' || f) is null
  union all select 7, 'gatilho avisos_da_cobranca'
   where not exists (select 1 from pg_trigger where tgname = 'avisos_da_cobranca' and not tgisinternal)
  union all select 8, 'aluno executando função do servidor ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'ch\_worker\_avisos%' or p.proname like 'ch\_worker\_aviso\_%'
         or p.proname in ('avisos_criar', 'ch_worker_billing_para_pix', 'ch_worker_billing_troca_cartao_abrir', 'ch_worker_billing_recibo_salvar'))
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
)
select case when count(*) = 0 then 'OK: compra e avisos (013760) no banco' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado
from falta;
