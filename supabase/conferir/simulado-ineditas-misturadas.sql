-- StaziaMed · INÉDITAS MISTURADAS NOS SIMULADOS · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar
-- supabase/migrations/20261003012200_simulado_ineditas_misturadas.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with f as (
  select p.proname, p.oid, pg_get_functiondef(p.oid) as def
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('app_start_session', 'app_start_simulado_tri', 'app_finish_session', 'practice_result', 'app_admin_save_settings',
                      'practice_draw', 'simulado_ineditas_pct')
), falta (ordem, item) as (
  select 1, 'função ' || n from unnest(array['app_start_session', 'app_start_simulado_tri', 'app_finish_session', 'practice_result',
                                             'app_admin_save_settings', 'practice_draw', 'simulado_ineditas_pct']) n
   where not exists (select 1 from f where f.proname = n)
  union all select 2, 'requisito (migrações anteriores) ' || x from unnest(array[
      'simulado_gate()', 'ineditas_gate()', 'has_ineditas()', 'practice_pool(jsonb)', 'ineditas_released_ids()']) x
   where to_regprocedure('public.' || x) is null
  union all select 3, 'app_start_session sem a mistura de inéditas (cole a 012200)' from f
   where proname = 'app_start_session' and def not like '%simulado_ineditas_pct%'
  union all select 4, 'app_start_simulado_tri sem a marca de só oficiais (cole a 012200)' from f
   where proname = 'app_start_simulado_tri' and def not like '%stazia.simulado_so_oficial%'
  union all select 5, 'app_finish_session ainda recusa o Finalizar por inédita fora do plano (cole a 012200)' from f
   where proname = 'app_finish_session' and def not like '%from public.questions q where q.id = d.key%'
  union all select 6, 'practice_result sem o quadro das inéditas (cole a 012200)' from f
   where proname = 'practice_result' and def not like '%''ineditas''%'
  union all select 7, 'app_admin_save_settings sem a chave simulado_ineditas_pct (cole a 012200)' from f
   where proname = 'app_admin_save_settings' and def not like '%simulado_ineditas_pct%'
  union all select 8, 'a tabela de configurações não aceita a chave simulado_ineditas_pct' where not exists (
      select 1 from pg_constraint c where c.conrelid = 'public.app_settings'::regclass and c.contype = 'c'
         and pg_get_constraintdef(c.oid) like '%simulado_ineditas_pct%')
  union all select 9, 'sem a linha simulado_ineditas_pct em app_settings (o padrão 10 vale mesmo assim)' where to_regclass('public.app_settings') is not null
     and not exists (select 1 from public.app_settings s where s.key = 'simulado_ineditas_pct')
  union all select 10, 'percentual fora de 0 a 50: ' || x.v from (
    select case when to_regprocedure('public.simulado_ineditas_pct()') is null then null
      else (xpath('/row/v/text()', query_to_xml('select public.simulado_ineditas_pct() as v', false, true, '')))[1]::text end as v
  ) x where x.v is not null and x.v::int not between 0 and 50
  union all select 11, 'visitante (sem login) executando ' || oid::regprocedure::text from f
   where proname in ('app_start_session', 'app_start_simulado_tri', 'practice_draw', 'simulado_ineditas_pct') and has_function_privilege('anon', oid, 'execute')
  union all select 12, 'aluno logado sem permissão em ' || oid::regprocedure::text from f
   where proname in ('app_start_session', 'app_start_simulado_tri', 'practice_draw', 'simulado_ineditas_pct') and not has_function_privilege('authenticated', oid, 'execute')
)
select case when count(*) = 0 then 'OK: simulados comuns misturam Questões Inéditas (percentual do administrador, padrão 10); o TRI segue só com questões oficiais'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
