-- DESFAZER da 20261003013330_fase2_telas_reais.sql (2ª fase: telas de verdade).
-- ATENÇÃO: apaga as tentativas de estação feitas sozinho (station_attempts). As estações feitas em dupla
-- (checklist_study_sessions) e o catálogo de estações NÃO são tocados.
drop function if exists public.app_fase2_performance();
drop function if exists public.app_fase2_peps(integer);
drop function if exists public.app_fase2_abandon(uuid);
drop function if exists public.app_fase2_submit(uuid, jsonb);
drop function if exists public.app_fase2_finish(uuid);
drop function if exists public.app_fase2_begin(uuid);
drop function if exists public.app_fase2_start(text);
drop function if exists public.app_fase2_attempt(uuid);
drop function if exists public.fase2_attempt_payload(public.station_attempts);
drop function if exists public.app_fase2_overview();
drop function if exists public.app_fase2_stations();
drop function if exists public.fase2_evaluations(uuid);
drop table if exists public.station_attempts;
drop function if exists public.fase2_assert();
drop function if exists public.fase2_allowed();
