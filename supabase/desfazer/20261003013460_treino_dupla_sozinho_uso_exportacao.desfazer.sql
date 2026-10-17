-- DESFAZER da 20261003013460_treino_dupla_sozinho_uso_exportacao.sql.
-- app_admin_dupla_usage volta à versão da 013430 (sem o bloco "sozinho") e app_export_my_data volta à da 013370 (sem 'solo_attempts'):
-- cole de novo, nesta ordem, as definições dessas funções dos arquivos 013430 (app_admin_dupla_usage) e 013370 (app_export_my_data).
-- Nada é apagado dos dados dos alunos.
drop function if exists public.dupla_export_solo();
