-- StaziaMed · SIMULADO COM QUESTÕES INÉDITAS · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar
-- supabase/migrations/20261003012000_simulado_volta_ineditas.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with f as (
  select p.proname, p.oid, pg_get_functiondef(p.oid) as def
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('app_start_session', 'app_start_simulado_tri')
), falta (ordem, item) as (
  select 1, 'função ' || n from unnest(array['app_start_session', 'app_start_simulado_tri']) n
   where not exists (select 1 from f where f.proname = n)
  union all select 2, 'requisito (migrações anteriores) ' || x from unnest(array[
      'simulado_gate()', 'ineditas_gate()', 'practice_pool(jsonb)', 'ineditas_released_ids()', 'ineditas_limit_for(uuid)']) x
   where to_regprocedure('public.' || x) is null
  -- o simulado volta a aceitar a prova "Questões Inéditas": o bloqueio da 010800 não pode estar no corpo
  union all select 3, 'app_start_session ainda recusa a prova Questões Inéditas no simulado (cole a 012000)' from f
   where proname = 'app_start_session' and def like '%Simulados usam apenas questões oficiais%'
  -- e as travas de acesso continuam: simulado fechado para teste vencido/plano vencido, inéditas fechadas para quem não tem acesso
  union all select 4, 'app_start_session sem a trava do simulado (simulado_gate)' from f
   where proname = 'app_start_session' and def not like '%simulado_gate%'
  union all select 5, 'app_start_session sem a trava das inéditas (ineditas_gate)' from f
   where proname = 'app_start_session' and def not like '%ineditas_gate%'
  -- o TRI continua só com oficiais, com a mensagem nova
  union all select 6, 'app_start_simulado_tri não recusa a prova Questões Inéditas' from f
   where proname = 'app_start_simulado_tri' and def not like '%staziamed%'
  union all select 7, 'app_start_simulado_tri com a mensagem antiga (cole a 012000)' from f
   where proname = 'app_start_simulado_tri' and def like '%exclusivas do banco de questões de treino%'
  union all select 8, 'visitante (sem login) executando ' || oid::regprocedure::text from f where has_function_privilege('anon', oid, 'execute')
  union all select 9, 'aluno logado sem permissão em ' || oid::regprocedure::text from f where not has_function_privilege('authenticated', oid, 'execute')
)
select case when count(*) = 0 then 'OK: simulados aceitam a prova Questões Inéditas (com os limites do plano); o TRI segue só com questões oficiais'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
