-- StaziaMed · LISTA DE INTERESSE DA 2ª FASE (013960) · CONFERIR (só lê; não altera nada). Rode ANTES e DEPOIS de colar
-- supabase/migrations/20261003013960_lista_interesse.sql. Resposta: uma linha. "OK: ..." = tudo no banco; "FALTA: ..." = o que não entrou.
with falta (ordem, item) as (
  select 1, 'requisito (013950) fila email_saida com limite do dia' where to_regprocedure('public.email_saida_teto_dia()') is null
  union all select 2, 'tabela ' || t from unnest(array['lista_interesse', 'lista_interesse_tentativas', 'lista_interesse_config']) t where to_regclass('public.' || t) is null
  union all select 3, 'proteção (RLS) desligada em ' || t from unnest(array['lista_interesse', 'lista_interesse_tentativas', 'lista_interesse_config']) t
   where to_regclass('public.' || t) is not null and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t))
  union all select 4, 'aluno ou visitante com acesso direto a ' || t || ' (' || pr || ')'
    from unnest(array['lista_interesse', 'lista_interesse_tentativas', 'lista_interesse_config']) t, unnest(array['anon', 'authenticated']) r,
         unnest(array['select', 'insert', 'update', 'delete']) pr
   where to_regclass('public.' || t) is not null and has_table_privilege(r, to_regclass('public.' || t), pr)
  union all select 5, 'fila de e-mail não aceita a lista de interesse (coluna interessado_id ou tipos novos)'
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_saida' and column_name = 'interessado_id')
      or not exists (select 1 from pg_constraint where conname = 'email_saida_kind_check' and pg_get_constraintdef(oid) like '%interesse_aviso%')
  union all select 6, 'função ' || f from unnest(array['ch_worker_interesse_inscrever(text,text,text,text,jsonb,text,text,text)',
      'ch_worker_interesse_confirmar(text,boolean)', 'ch_worker_interesse_sair(text,boolean)', 'ch_worker_interesse_limpar()',
      'ch_worker_interesse_grupo(text)', 'ch_worker_interesse_tem_grupo()',
      'app_admin_interesse_resumo(integer)', 'app_admin_interesse_lista(text,text,integer,integer)', 'app_admin_interesse_exportar(text)',
      'app_admin_interesse_aviso_previa()', 'app_admin_interesse_avisar(integer)', 'app_admin_interesse_grupo_salvar(text)',
      'app_admin_interesse_tirar(bigint)', 'lista_interesse_consentimento(text)', 'lista_interesse_limites()', 'lista_interesse_whatsapp(text)']) f
   where to_regprocedure('public.' || f) is null
  union all select 7, 'aluno ou visitante executa função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'ch_worker_interesse_%' or p.proname like 'lista_interesse_%' or p.proname = 'ch_worker_email_pegar')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  union all select 8, 'função de administração aberta ao visitante ou sem assert_admin: ' || p.proname from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'app_admin_interesse_%'
     and (has_function_privilege('anon', p.oid, 'execute') or not p.prosecdef or position('assert_admin()' in p.prosrc) = 0)
  union all select 9, 'configuração do link do grupo da 2ª fase'
   where case when to_regclass('public.lista_interesse_config') is null then false
              else query_to_xml('select 1 as x from public.lista_interesse_config where fase = ''2a_fase''', false, true, '')::text = '' end
  union all select 9, 'gatilho que marca "avisado" quando o aviso sai'
   where not exists (select 1 from pg_trigger where tgname = 'lista_interesse_aviso_enviado')
  union all select 10, 'a fila de e-mail ainda não entrega a lista de interesse ou perdeu o limite do dia (ch_worker_email_pegar)'
   where to_regprocedure('public.ch_worker_email_pegar(integer)') is not null
     and (position('interesse_confirmar' in (select prosrc from pg_proc where oid = to_regprocedure('public.ch_worker_email_pegar(integer)'))) = 0
       or position('email_saida_teto_dia' in (select prosrc from pg_proc where oid = to_regprocedure('public.ch_worker_email_pegar(integer)'))) = 0)
)
select case when count(*) = 0 then 'OK: Lista de interesse da 2ª fase (013960) no banco' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado
from falta;
