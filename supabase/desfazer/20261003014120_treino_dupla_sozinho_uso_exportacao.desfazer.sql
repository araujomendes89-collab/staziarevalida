-- DESFAZER da 20261003014120_treino_dupla_sozinho_uso_exportacao.sql.
-- app_admin_dupla_usage volta à versão da 014090 (sem o bloco "sozinho") e app_export_my_data volta à da 014030 (sem 'solo_attempts'):
-- cole de novo, nesta ordem, as definições dessas funções dos arquivos 014090 (app_admin_dupla_usage) e 014030 (app_export_my_data; sem o Stazia Match: a de produção, 013406 com o remendo do Termo 3.0).
-- Nada é apagado dos dados dos alunos.
drop function if exists public.dupla_export_solo();
