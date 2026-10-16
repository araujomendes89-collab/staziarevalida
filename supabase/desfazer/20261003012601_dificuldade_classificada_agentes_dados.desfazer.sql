-- DESFAZER da carga de dados da classificação por agentes (20261003012601):
-- Apaga todas as linhas inseridas na tabela question_difficulty_agents.
-- Não altera a estrutura da tabela, não altera funções e não mexe em question_difficulty_review (validação humana).
delete from public.question_difficulty_agents;
