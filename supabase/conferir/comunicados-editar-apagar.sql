-- StaziaMed · COMUNICADOS: EDITAR, APAGAR E EDITOR PROFISSIONAL (013940) · CONFERIR (só lê; não altera nada). Rode ANTES e DEPOIS de colar
-- supabase/migrations/20261003013940_comunicados_editar_apagar.sql. Resposta: uma linha. "OK: ..." = tudo no banco; "FALTA: ..." = o que não entrou.
with falta (ordem, item) as (
  select 1, 'requisito (013830) tabela comunicados_equipe' where to_regclass('public.comunicados_equipe') is null
  union all select 1, 'requisito (013110) função ch_formatacao_valida(jsonb)' where to_regprocedure('public.ch_formatacao_valida(jsonb)') is null
  union all select 2, 'tabela comunicados_historico' where to_regclass('public.comunicados_historico') is null
  union all select 3, 'coluna comunicados_equipe.' || c from unnest(array['rico', 'versao', 'editado_em', 'editado_por', 'apagado_em', 'apagado_por', 'apagado_motivo']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comunicados_equipe' and column_name = c)
  union all select 3, 'coluna avisos_aluno.' || c from unnest(array['rico', 'editado_em', 'apagado_em']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'avisos_aluno' and column_name = c)
  union all select 4, 'regra de leitura do aluno (RLS) ainda mostra os apagados'
   where not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_aluno' and policyname = 'avisos do aluno: ler os próprios'
                       and qual like '%apagado_em IS NULL%')
  union all select 5, 'proteção (RLS) desligada em comunicados_historico'
   where to_regclass('public.comunicados_historico') is not null and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.comunicados_historico'))
  union all select 6, 'aluno logado lê ou grava comunicados_historico'
   where to_regclass('public.comunicados_historico') is not null and (coalesce(has_table_privilege('authenticated', to_regclass('public.comunicados_historico'), 'select'), false)
     or coalesce(has_table_privilege('authenticated', to_regclass('public.comunicados_historico'), 'insert'), false) or coalesce(has_table_privilege('authenticated', to_regclass('public.comunicados_historico'), 'update'), false)
     or coalesce(has_table_privilege('authenticated', to_regclass('public.comunicados_historico'), 'delete'), false))
  union all select 6, 'aluno logado grava em ' || t from unnest(array['avisos_aluno', 'comunicados_equipe']) t
   where has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'update')
      or has_table_privilege('authenticated', 'public.' || t, 'delete')
  union all select 7, 'função ' || f from unnest(array['app_admin_comunicado_enviar(text,text,text,text,text,text,jsonb)',
      'app_admin_comunicado_editar(bigint,text,text,text,jsonb,text,text,integer)', 'app_admin_comunicado_apagar(bigint,text)',
      'app_admin_comunicado_restaurar(bigint)', 'app_admin_comunicados(integer,text)', 'app_admin_comunicado_historico(bigint)',
      'app_minhas_notificacoes(integer)', 'app_notificacoes_lidas(bigint[])', 'comunicado_rico_ok(jsonb)', 'comunicado_admin_linha(bigint)',
      'comunicado_conferir_texto(text,text,text,jsonb)']) f
   where to_regprocedure('public.' || f) is null
  union all select 8, 'versão antiga ainda no banco (chamada ficaria ambígua): ' || f
   from unnest(array['app_admin_comunicado_enviar(text,text,text,text,text,text)', 'app_admin_comunicados(integer)']) f
   where to_regprocedure('public.' || f) is not null
  union all select 9, 'aluno ou visitante executa função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('comunicado_rico_ok', 'comunicado_admin_linha', 'comunicado_conferir_texto', 'comunicado_foto')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  union all select 10, 'visitante executa ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_admin_comunicado_enviar', 'app_admin_comunicado_editar', 'app_admin_comunicado_apagar',
       'app_admin_comunicado_restaurar', 'app_admin_comunicados', 'app_admin_comunicado_historico', 'app_minhas_notificacoes', 'app_notificacoes_lidas')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 11, 'função de administração sem assert_admin: ' || p.proname from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_admin_comunicado_enviar', 'app_admin_comunicado_editar', 'app_admin_comunicado_apagar',
       'app_admin_comunicado_restaurar', 'app_admin_comunicados', 'app_admin_comunicado_historico')
     and (not p.prosecdef or position('assert_admin()' in p.prosrc) = 0)
  union all select 12, 'a Central do aluno ainda mostra os apagados (app_minhas_notificacoes)'
   where to_regprocedure('public.app_minhas_notificacoes(integer)') is not null
     and position('apagado_em is null' in (select prosrc from pg_proc where oid = to_regprocedure('public.app_minhas_notificacoes(integer)'))) = 0
)
select case when count(*) = 0 then 'OK: Comunicados com editar, apagar e editor profissional (013940) no banco' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado
from falta;
