-- DESFAZER da 20261003010700_dificuldade_validada_lista_equipe.sql: apaga só a função de leitura (nenhum dado é tocado).
drop function if exists public.app_admin_question_difficulties(jsonb, integer, integer);
