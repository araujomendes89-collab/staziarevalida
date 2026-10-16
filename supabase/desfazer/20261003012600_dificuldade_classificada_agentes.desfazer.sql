-- DESFAZER da 20261003012600_dificuldade_classificada_agentes.sql: apaga as duas funções e a tabela da classificação por agentes
-- (e só ela). A dificuldade validada pela equipe (question_difficulty_review) e a estimativa do motor não são tocadas.
drop function if exists public.app_admin_difficulty_agents_summary();
drop function if exists public.question_difficulty_effective(text);
drop table if exists public.question_difficulty_agents;
