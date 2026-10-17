-- Desfaz supabase/migrations/20261003013805_tutor_abertura_pronta.sql (abertura preparada na entrada do Tutor).
-- Desfaça também no servidor: sem estas funções, /opening/prepare só registra no log e não prepara nada (a abertura volta a ser
-- criada só depois de a conversa nascer).
-- NÃO desfaz: as aberturas já usadas continuam nas conversas (a reserva ficou em meta.reserve) e o custo continua no ai_usage_ledger.

drop function if exists public.ch_worker_tutor_use_ready_opening(uuid, uuid, bigint, bigint, jsonb);
drop function if exists public.ch_worker_tutor_ready_opening(uuid, uuid);
drop function if exists public.ch_worker_tutor_opening_prep_save(uuid, bigint, text, jsonb);
drop function if exists public.ch_worker_tutor_opening_prep_claim(uuid, text, text, text, text, jsonb);
drop function if exists public.tutor_opening_ready_for(uuid, uuid);
drop table if exists public.tutor_opening_ready;
