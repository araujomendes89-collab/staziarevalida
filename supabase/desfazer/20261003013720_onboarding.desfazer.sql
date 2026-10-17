-- DESFAZER da 20261003013720_onboarding.sql (onboarding inteligente).
-- Apaga só o que a 13720 criou: as funções novas e as duas tabelas novas (com o estado do onboarding de cada aluno e as
-- preferências novas: dias da semana, áreas difíceis, jeito de estudar, Tutor escolhido, lembretes).
-- NÃO desfaz o que o onboarding gravou em lugares que já existiam (são dados do próprio aluno, iguais aos do "Personalizar
-- plano"): profiles.exam_date, daily_minutes, study_days_per_week, phase e onboarding_completed_at; o nivelamento adiado; a
-- escolha do teste (app_escolher_teste, da 13640) e o personagem do Tutor (app_tutor_set_character, se existia).
-- Pode ser rodado de novo sem erro ("if exists").
-- Antes de rodar, se quiser guardar: select * from public.aluno_onboarding; select * from public.aluno_preferencias_estudo;

drop function if exists public.app_onboarding_dica_vista(text);
drop function if exists public.app_onboarding_tour(text, integer);
drop function if exists public.app_onboarding_salvar(text, jsonb);
drop function if exists public.onboarding_adiar_nivelamento(uuid);
drop function if exists public.onboarding_garantir(uuid);
drop function if exists public.app_onboarding_estado();
drop function if exists public.onboarding_estado_de(uuid);
drop function if exists public.onboarding_conta_antiga(uuid);
drop function if exists public.onboarding_ordem(text);

drop table if exists public.aluno_preferencias_estudo;
drop table if exists public.aluno_onboarding;
