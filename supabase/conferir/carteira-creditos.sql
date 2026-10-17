-- StaziaMed · PLANOS ETAPA 2 (carteira de créditos e minutos, MODO SOMBRA) · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o
-- que falta) e DEPOIS de colar supabase/migrations/20261003013680_carteira_creditos.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (013640) tabela ' || t from unnest(array['direitos_config', 'direitos_planos', 'direitos_recursos', 'aluno_fases']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'tabela desta migração ' || t from unnest(array['carteira_pacotes', 'carteira_extras', 'carteira_movimentos', 'carteira_avisos', 'carteira_devolucoes']) t
   where to_regclass('public.' || t) is null
  union all select 3, 'proteção (RLS) desligada em ' || t from unnest(array['carteira_pacotes', 'carteira_extras', 'carteira_movimentos', 'carteira_avisos', 'carteira_devolucoes']) t
   where to_regclass('public.' || t) is not null and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t))
  union all select 4, 'aluno logado grava em ' || t from unnest(array['carteira_pacotes', 'carteira_extras', 'carteira_movimentos', 'carteira_avisos', 'carteira_devolucoes']) t
   where to_regclass('public.' || t) is not null
     and (has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'update')
          or has_table_privilege('authenticated', 'public.' || t, 'delete'))
  union all select 5, 'função desta migração ' || f from unnest(array['ch_worker_carteira_reservar(uuid,text,text,uuid,integer)', 'ch_worker_carteira_confirmar(uuid,text,numeric,jsonb)',
      'ch_worker_carteira_devolver(uuid,text)', 'tutor_entitlement_regra_antiga(uuid)', 'tutor_entitlement(uuid)', 'carteira_numeros(uuid,text,timestamptz)',
      'app_minha_carteira()', 'app_admin_carteira()', 'app_admin_carteira_cortesia(text,numeric,integer,integer,text)', 'ch_worker_avisos_renovacao()']) f
   where to_regprocedure('public.' || f) is null
  union all select 6, 'visitante ou aluno executando a função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'ch_worker_carteira_%' or p.proname like 'carteira_%' or p.proname in ('tutor_entitlement', 'tutor_entitlement_regra_antiga', 'ch_worker_avisos_renovacao'))
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all select 7, 'visitante executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'app_admin_carteira%' or p.proname in ('app_minha_carteira', 'app_carteira_avisos_vistos'))
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 8, 'gatilho carteira_voz_fechamento em tutor_voice_calls'
   where not exists (select 1 from pg_trigger g where g.tgname = 'carteira_voz_fechamento' and g.tgrelid = 'public.tutor_voice_calls'::regclass)
  union all select 9, 'cotação do dólar vazia' where to_regclass('public.direitos_config') is not null
     and exists (select 1 from public.direitos_config where cotacao_dolar is null)
)
select case when count(*) = 0 then 'OK: carteira no banco, em modo ' ||
              coalesce((select case when c.cadeados_ligados then 'LIGADO (a carteira decide)' else 'sombra (cotas de hoje valem; a carteira só registra)' end from public.direitos_config c), '?')
              || '; funções internas fechadas ao navegador'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
