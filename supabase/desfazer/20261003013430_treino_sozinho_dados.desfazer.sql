-- DESFAZER da 20261003013430_treino_sozinho_dados.sql.
-- Apaga as funções novas e a função treino_avaliacao da Central. As colunas novas (station_attempts: answers, pressings_opened, how,
-- source, ia...; checklist_study_sessions: mode, source, solo_run_id) ficam (guardam o que os alunos escreveram). As funções refeitas
-- (app_dupla_heartbeat, app_admin_save_dupla, app_dupla_history, dupla_result_payload, app_admin_dupla_usage) ficam com o corpo novo,
-- que é compatível; para voltar ao antigo cole de novo as definições de 013320, 013310, 013400 e 013360.
delete from public.ai_functions where key = 'treino_avaliacao';
drop function if exists public.app_admin_dupla_ia();
drop function if exists public.app_admin_save_dupla_ia(jsonb);
drop function if exists public.solo_ia_status(uuid);
drop function if exists public.solo_ia_function_ready();
drop function if exists public.solo_plan_matches(uuid, text);
drop function if exists public.station_feedback_for(uuid);
drop function if exists public.solo_sp_day(timestamptz);
drop function if exists public.solo_ia_company(text);
update public.app_settings set value = value - 'sozinho' where key = 'treino_dupla';
