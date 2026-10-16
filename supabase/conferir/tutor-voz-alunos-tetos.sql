-- StaziaMed · VOZ AO VIVO PARA OS ALUNOS (tetos, preço e limites) · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar
-- supabase/migrations/20261003012800_tutor_voz_alunos_tetos.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) tabela ' || t from unnest(array['tutor_config','tutor_voice_calls','ai_usage_ledger']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'coluna tutor_config.' || c from unnest(array['live_account_daily_seconds','live_account_daily_usd','live_account_monthly_usd','live_price_per_min_usd','voice_rate_limits']) c
   where to_regclass('public.tutor_config') is not null
     and not exists (select 1 from information_schema.columns x where x.table_schema = 'public' and x.table_name = 'tutor_config' and x.column_name = c)
  union all select 3, 'tabela desta migração tutor_rate_limits' where to_regclass('public.tutor_rate_limits') is null
  union all select 4, 'proteção (RLS) desligada em tutor_rate_limits' where to_regclass('public.tutor_rate_limits') is not null
     and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.tutor_rate_limits'))
  union all select 5, 'aluno logado lê ou grava direto em tutor_rate_limits' where case when to_regclass('public.tutor_rate_limits') is null then false
     else has_table_privilege('authenticated', 'public.tutor_rate_limits', 'select') or has_table_privilege('authenticated', 'public.tutor_rate_limits', 'insert')
          or has_table_privilege('authenticated', 'public.tutor_rate_limits', 'update') or has_table_privilege('authenticated', 'public.tutor_rate_limits', 'delete') end
  union all select 6, 'função desta migração ' || f from unnest(array['ch_worker_tutor_rate_hit(uuid,text)','tutor_live_account_today()']) f
   where to_regprocedure('public.' || f) is null
  union all select 7, 'versão nova (Fase 0) da função ' || f.nome from (values
      ('ch_worker_tutor_voice_start(uuid,uuid,boolean,text)', 'usd_month'),
      ('ch_worker_tutor_voice_renew(uuid,uuid,text)', 'account_limit'),
      ('ch_worker_tutor_settings()', 'live_account_monthly_usd'),
      ('tutor_live_account_today()', 'usd_month'),
      ('app_admin_tutor_save_config(jsonb,text)', 'live_account_monthly_usd')) f(nome, marca)
   where to_regprocedure('public.' || f.nome) is null or pg_get_functiondef(to_regprocedure('public.' || f.nome)) not like '%' || f.marca || '%'
  union all select 8, 'visitante ou aluno logado executando a função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('ch_worker_tutor_rate_hit','tutor_live_account_today','ch_worker_tutor_voice_start','ch_worker_tutor_voice_renew','ch_worker_tutor_settings')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all select 9, 'visitante executando o painel ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'app_admin_tutor_save_config' and has_function_privilege('anon', p.oid, 'execute')
  union all select 10, 'a dica do Tutor (…10600) sumiu do painel ou da leitura do servidor' where to_regprocedure('public.ch_worker_tutor_settings()') is not null
     and pg_get_functiondef(to_regprocedure('public.ch_worker_tutor_settings()')) not like '%question_hint_enabled%'
)
select case when count(*) = 0 then 'OK: voz ao vivo dos alunos no banco (limite por aluno, tetos da conta em minutos e US$ por dia e por mês, preço por minuto, custo real da ponte; funções fechadas ao navegador)'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
