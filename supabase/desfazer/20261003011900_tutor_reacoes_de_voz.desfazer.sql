-- Desfaz supabase/migrations/20261003011900_tutor_reacoes_de_voz.sql (Personality Engine: reações de voz e Durona Explosiva).
-- Só remove o que aquela migração criou; nada que já existia antes é tocado. ATENÇÃO: apaga as reações marcadas pelo dono e as
-- escolhas da Durona Explosiva dos alunos (anote antes, se precisar).
drop function if exists public.app_tutor_save_explosiva_preferences(text, boolean, boolean);
drop function if exists public.app_tutor_explosiva_preferences();
drop function if exists public.ch_worker_tutor_explosiva(uuid);
drop function if exists public.tutor_adult_declared(uuid);
drop function if exists public.ch_worker_tutor_voice_reactions();
drop function if exists public.app_admin_tutor_save_voice_reactions(jsonb, boolean, text);
drop function if exists public.app_admin_tutor_voice_reactions();
drop table if exists public.tutor_explosiva_preferences;
drop table if exists public.tutor_explosiva_config;
drop table if exists public.tutor_voice_reaction_rules;
