-- DESFAZER da 20261003013450_treino_dupla_sozinho_ia.sql (avaliação por IA do treino sozinho).
-- Apaga as funções de serviço. Treinos já avaliados por IA continuam como estão (nota, resultado e a avaliação espelhada).
-- Uma tentativa que estava "avaliando" volta a "entregue" (a cota é devolvida).
update public.station_attempts set status = 'submitted', ia_reserved_at = null where status = 'evaluating';
drop function if exists public.solo_ia_month_cost(timestamptz, timestamptz);
drop function if exists public.ch_worker_solo_fail(uuid, uuid, text);
drop function if exists public.ch_worker_solo_save_eval(uuid, uuid, jsonb);
drop function if exists public.ch_worker_solo_prepare(uuid, uuid);
