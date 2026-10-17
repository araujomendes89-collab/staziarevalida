-- StaziaMed · PLANOS ETAPA 1 (direitos do aluno por fase, MODO SOMBRA) · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que
-- falta) e DEPOIS de colar supabase/migrations/20261003013640_direitos_por_fase.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) função ' || f from unnest(array['user_has_full_access(uuid)', 'user_without_paid_access(uuid)', 'tutor_entitlement(uuid)', 'admin_log(text,text,jsonb)']) f
   where to_regprocedure('public.' || f) is null
  union all select 2, 'tabela desta migração ' || t from unnest(array['direitos_config', 'direitos_planos', 'direitos_recursos', 'aluno_testes', 'aluno_fases']) t
   where to_regclass('public.' || t) is null
  union all select 3, 'proteção (RLS) desligada em ' || t from unnest(array['direitos_config', 'direitos_planos', 'direitos_recursos', 'aluno_testes', 'aluno_fases']) t
   where to_regclass('public.' || t) is not null and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t))
  union all select 4, 'aluno logado grava em ' || t from unnest(array['direitos_config', 'direitos_planos', 'direitos_recursos', 'aluno_testes', 'aluno_fases']) t
   where to_regclass('public.' || t) is not null
     and (has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'update')
          or has_table_privilege('authenticated', 'public.' || t, 'delete'))
  union all select 5, 'função desta migração ' || f from unnest(array['direitos_do_aluno(uuid)', 'user_has_access(uuid,text)', 'app_my_entitlements()', 'app_escolher_teste(text)',
      'app_admin_direitos()', 'app_admin_direitos_salvar(jsonb)', 'app_admin_direitos_aluno(text)', 'direitos_sincronizar_assinatura(uuid)']) f
   where to_regprocedure('public.' || f) is null
  union all select 6, 'visitante ou aluno executando a função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('direitos_do_aluno', 'user_has_access', 'direitos_sincronizar_assinatura', 'direitos_assinatura_gatilho', 'direitos_teste_repetido', 'direitos_cadeados_ligados', 'direitos_regra_atual')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all select 7, 'visitante executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_my_entitlements', 'app_escolher_teste', 'app_admin_direitos', 'app_admin_direitos_salvar', 'app_admin_direitos_aluno')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 8, 'gatilho direitos_por_fase_sincronia em subscriptions'
   where not exists (select 1 from pg_trigger g where g.tgname = 'direitos_por_fase_sincronia' and g.tgrelid = 'public.subscriptions'::regclass)
  union all select 9, 'assinatura sem fases convertidas: ' || s.user_id::text from public.subscriptions s
   where to_regclass('public.aluno_fases') is not null
     and not exists (select 1 from public.aluno_fases f where f.user_id = s.user_id and f.fase = 'teoria')
)
select case when count(*) = 0 then 'OK: direitos por fase no banco, em modo ' ||
              coalesce((select case when c.cadeados_ligados then 'LIGADO' else 'sombra (não tranca nada)' end from public.direitos_config c), '?')
              || '; alunos convertidos; funções internas fechadas ao navegador'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
