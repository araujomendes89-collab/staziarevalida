-- StaziaMed · CENTRAL DE NOTIFICAÇÕES (013830) · CONFERIR (só lê; não altera nada). Rode ANTES e DEPOIS de colar
-- supabase/migrations/20261003013830_central_notificacoes.sql. Resposta: uma linha. "OK: ..." = tudo no banco; "FALTA: ..." = o que não entrou.
with falta (ordem, item) as (
  select 1, 'requisito (013760) tabela avisos_aluno' where to_regclass('public.avisos_aluno') is null
  union all select 1, 'requisito (013740) função app_legal_state()' where to_regprocedure('public.app_legal_state()') is null
  union all select 1, 'requisito (013640) tabela aluno_fases' where to_regclass('public.aluno_fases') is null
  union all select 2, 'tabela comunicados_equipe' where to_regclass('public.comunicados_equipe') is null
  union all select 3, 'coluna avisos_aluno.' || c from unnest(array['link', 'comunicado_id']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'avisos_aluno' and column_name = c)
  union all select 4, 'tipos novos (contrato_novo, comunicado) na regra de avisos_aluno'
   where not exists (select 1 from pg_constraint where conname = 'avisos_aluno_tipo_check' and pg_get_constraintdef(oid) like '%comunicado%')
  union all select 5, 'proteção (RLS) desligada em ' || t from unnest(array['avisos_aluno', 'comunicados_equipe']) t
   where to_regclass('public.' || t) is not null and not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass)
  union all select 6, 'aluno logado grava em ' || t from unnest(array['avisos_aluno', 'comunicados_equipe']) t
   where to_regclass('public.' || t) is not null and (has_table_privilege('authenticated', 'public.' || t, 'insert')
     or has_table_privilege('authenticated', 'public.' || t, 'update') or has_table_privilege('authenticated', 'public.' || t, 'delete'))
  union all select 7, 'aluno logado lê comunicados_equipe direto'
   where to_regclass('public.comunicados_equipe') is not null and has_table_privilege('authenticated', 'public.comunicados_equipe', 'select')
  union all select 8, 'função ' || f from unnest(array['app_minhas_notificacoes(integer)', 'app_notificacoes_lidas(bigint[])', 'app_meus_avisos()',
      'app_admin_comunicado_previa(text,text)', 'app_admin_comunicado_enviar(text,text,text,text,text,text)', 'app_admin_comunicados(integer)',
      'notificacao_acao(text,text,text)', 'comunicado_alunos(text,text)', 'notificacao_contrato_sincronizar(uuid)', 'comunicado_validar(text,text)', 'aviso_urgente_ativo(uuid,text,text,timestamptz)', 'aviso_resolvido(uuid,text,text,timestamptz)']) f
   where to_regprocedure('public.' || f) is null
  union all select 9, 'aluno ou visitante executa função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('notificacao_acao', 'comunicado_alunos', 'notificacao_contrato_sincronizar', 'comunicado_validar', 'aviso_urgente_ativo', 'aviso_resolvido')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  union all select 10, 'visitante executa ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_minhas_notificacoes', 'app_notificacoes_lidas', 'app_admin_comunicado_previa',
       'app_admin_comunicado_enviar', 'app_admin_comunicados')
     and has_function_privilege('anon', p.oid, 'execute')
)
select case when count(*) = 0 then 'OK: Central de Notificações (013830) no banco' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado
from falta;
