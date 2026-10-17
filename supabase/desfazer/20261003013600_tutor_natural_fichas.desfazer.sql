-- Desfaz supabase/migrations/20261003013600_tutor_natural_fichas.sql (abertura e passagem criadas pela IA).
-- Volta ao desenho de antes: a abertura e a passagem ficam só nas falas sorteadas em SQL (openings / lines).
-- Desfaça também no servidor (server/tutor/opening.ts): sem estas funções, o servidor só registra no log e mantém a reserva.
-- NÃO desfaz: as falas já trocadas nas conversas antigas continuam com o texto da IA (a reserva ficou em meta.reserve, se precisar).

drop function if exists public.ch_worker_tutor_voice_opening_save(uuid, uuid, text);
drop function if exists public.ch_worker_tutor_voice_openings(uuid, uuid);
drop function if exists public.ch_worker_tutor_set_opening(uuid, uuid, bigint, text, jsonb, jsonb);
drop function if exists public.ch_worker_tutor_opening_state(uuid, uuid);
drop table if exists public.tutor_recent_openings;
