-- StaziaMed · COMUNICADOS: LEITURA POR VERSÃO E E-MAIL (013950) · CONFERIR (só lê; não altera nada). Rode ANTES e DEPOIS de colar
-- supabase/migrations/20261003013950_comunicados_email_leitura.sql. Resposta: uma linha. "OK: ..." = tudo no banco; "FALTA: ..." = o que não entrou.
with falta (ordem, item) as (
  select 1, 'requisito (013940) comunicados com editar e apagar' where to_regclass('public.comunicados_historico') is null
  union all select 1, 'requisito (013800) fila email_saida e marketing_consents' where to_regclass('public.email_saida') is null or to_regclass('public.marketing_consents') is null
  union all select 2, 'tabela marketing_descadastro' where to_regclass('public.marketing_descadastro') is null
  union all select 3, 'coluna comunicados_equipe.' || c from unnest(array['lidas_antes', 'lido_alguma_vez', 'por_email', 'email_em']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comunicados_equipe' and column_name = c)
  union all select 4, 'fila de e-mail não aceita o tipo comunicado'
   where not exists (select 1 from pg_constraint where conname = 'email_saida_kind_check' and pg_get_constraintdef(oid) like '%comunicado%')
  union all select 5, 'proteção (RLS) desligada ou aluno/visitante com acesso em marketing_descadastro'
   where to_regclass('public.marketing_descadastro') is not null and (not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.marketing_descadastro'))
     or coalesce(has_table_privilege('authenticated', to_regclass('public.marketing_descadastro'), 'select'), false)
     or coalesce(has_table_privilege('anon', to_regclass('public.marketing_descadastro'), 'select'), false))
  union all select 6, 'função ' || f from unnest(array['app_admin_comunicado_email(bigint)', 'ch_worker_marketing_descadastro(text,boolean)',
      'marketing_token(uuid)', 'email_saida_teto_dia()', 'comunicado_email_alunos(bigint)', 'comunicado_email_enfileirar(bigint)']) f
   where to_regprocedure('public.' || f) is null
  union all select 7, 'aluno ou visitante executa função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('marketing_token', 'email_saida_teto_dia', 'comunicado_email_alunos', 'comunicado_email_enfileirar', 'ch_worker_marketing_descadastro', 'ch_worker_email_pegar')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  union all select 8, 'visitante executa ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_admin_comunicado_email', 'app_admin_comunicado_previa', 'app_admin_comunicado_editar')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 9, 'função de administração sem assert_admin: ' || p.proname from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_admin_comunicado_email', 'app_admin_comunicado_previa', 'app_admin_comunicado_editar', 'app_admin_comunicado_apagar')
     and (not p.prosecdef or position('assert_admin()' in p.prosrc) = 0)
  union all select 10, 'editar ainda não zera a leitura (app_admin_comunicado_editar)'
   where to_regprocedure('public.app_admin_comunicado_editar(bigint,text,text,text,jsonb,text,text,integer)') is not null
     and position('visto_em = null' in (select prosrc from pg_proc where oid = to_regprocedure('public.app_admin_comunicado_editar(bigint,text,text,text,jsonb,text,text,integer)'))) = 0
  union all select 11, 'a fila de e-mail ainda não entrega o comunicado nem respeita o limite do dia (ch_worker_email_pegar)'
   where to_regprocedure('public.ch_worker_email_pegar(integer)') is not null
     and position('email_saida_teto_dia' in (select prosrc from pg_proc where oid = to_regprocedure('public.ch_worker_email_pegar(integer)'))) = 0
)
select case when count(*) = 0 then 'OK: Comunicados com leitura por versão e e-mail (013950) no banco' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado
from falta;
