-- DESFAZER da 20261003014100_treino_dupla_sozinho_funcoes.sql (funções do treino sozinho).
-- Apaga as funções NOVAS. As funções refeitas (fase2_attempt_payload, app_fase2_start/begin/finish/submit/abandon/attempt/overview/peps
-- e fase2_evaluations) ficam com o corpo novo, que continua funcionando; para voltar ao corpo antigo cole de novo a 013330.
-- Tentativas entregues ou avaliando voltam a "atendimento" para a tela antiga conseguir abri-las.
update public.station_attempts set status = 'attending' where status in ('submitted', 'evaluating');
drop function if exists public.app_fase2_report_ia(uuid, integer, text);
drop function if exists public.app_fase2_deliver(uuid, jsonb);
drop function if exists public.app_fase2_print_path(uuid, text);
drop function if exists public.app_fase2_open_pressing(uuid, text);
drop function if exists public.app_fase2_save_answers(uuid, jsonb);
drop function if exists public.solo_clean_answers(jsonb);
drop function if exists public.solo_finalize(uuid, jsonb, text, jsonb);
drop function if exists public.solo_sweep(uuid);
drop function if exists public.solo_has_image(jsonb, text, bigint);
drop function if exists public.solo_pep_rows(jsonb, jsonb, boolean);
drop function if exists public.solo_clean_text(text);
