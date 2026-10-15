-- StaziaMed · SIMULADO TRI (ESTIMATIVA STAZIAMED) · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar
-- supabase/migrations/20261003009996_simulado_tri.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) ' || f from unnest(array['app_start_session(text,jsonb,integer,integer)','question_preliminary_info(text)']) f
   where to_regprocedure('public.' || f) is null
  union all select 2, 'tabela desta migração ' || t from unnest(array['irt_calibration_runs','irt_item_params','irt_responses','irt_session_results']) t
   where to_regclass('public.' || t) is null
  union all select 3, 'função desta migração ' || f from unnest(array[
      'irt_eap(smallint[],double precision[],double precision,double precision,integer,double precision)',
      'irt_scale(double precision)','irt_estimar_theta(smallint[],double precision[],double precision,double precision)',
      'irt_item_difficulty(text)','irt_score_session(uuid)','irt_calibration_matrix()','irt_refresh_provisional()',
      'irt_save_calibration(text,jsonb,jsonb)','irt_regrade_question(text)','irt_on_session_finish()','irt_on_answer_key_change()',
      'app_start_simulado_tri(jsonb,integer,integer)','app_session_irt_result(uuid)']) f
   where to_regprocedure('public.' || f) is null
  union all select 4, 'gatilho ' || g from unnest(array['practice_sessions_irt_score','questions_irt_regrade','question_official_answers_irt_regrade']) g
   where not exists (select 1 from pg_trigger where tgname = g and not tgisinternal)
  union all select 5, 'proteção (RLS) desligada em ' || t from unnest(array['irt_calibration_runs','irt_item_params','irt_responses','irt_session_results']) t
   where to_regclass('public.' || t) is not null and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t))
  union all select 6, 'aluno logado pode gravar direto em ' || t from unnest(array['irt_calibration_runs','irt_item_params','irt_responses','irt_session_results']) t
   where to_regclass('public.' || t) is not null
     and (has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'update')
          or has_table_privilege('authenticated', 'public.' || t, 'delete'))
  union all select 7, 'visitante (sem login) executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like any (array['irt\_%', 'app_start_simulado_tri', 'app_session_irt_result'])
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 8, 'aluno logado executando a função interna ou do servidor ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('irt_item_difficulty','irt_result_json','irt_score_session','irt_calibration_matrix','irt_refresh_provisional',
                       'irt_save_calibration','irt_regrade_question','irt_on_session_finish','irt_on_answer_key_change')
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all select 9, 'servidor (service_role) sem permissão em ' || f from unnest(array['irt_calibration_matrix()','irt_refresh_provisional()',
      'irt_save_calibration(text,jsonb,jsonb)','irt_regrade_question(text)']) f
   where to_regprocedure('public.' || f) is not null and not has_function_privilege('service_role', to_regprocedure('public.' || f), 'execute')
  union all select 10, 'escala errada (50 + 10·θ): irt_scale(1) deu ' || x.v from (
    select case when to_regprocedure('public.irt_scale(double precision)') is null then null
      else (xpath('/row/v/text()', query_to_xml('select public.irt_scale(1) as v', false, true, '')))[1]::text end as v
  ) x where x.v is not null and x.v::numeric <> 60
)
select case when count(*) = 0 then 'OK: simulado TRI pronto (modo opcional; aluno só vê o seu; dificuldade e calibração só a equipe e o servidor)'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
