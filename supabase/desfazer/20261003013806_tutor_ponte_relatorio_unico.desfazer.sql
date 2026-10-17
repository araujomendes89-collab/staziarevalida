-- Desfaz supabase/migrations/20261003013806_tutor_ponte_relatorio_unico.sql (relatório da ponte de voz gravado uma vez só).
-- Desfaça também no servidor: sem a função, /voice/ponte-uso falha; volte a rota para ch_worker_tutor_ledger (como antes de 17/10).
-- NÃO desfaz: o custo já gravado continua no ai_usage_ledger.

drop function if exists public.ch_worker_tutor_ponte_uso(uuid, uuid, text, jsonb);
drop table if exists public.tutor_ponte_relatorios;
