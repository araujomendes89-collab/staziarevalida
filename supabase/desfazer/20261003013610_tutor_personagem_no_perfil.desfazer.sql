-- Desfaz supabase/migrations/20261003013610_tutor_personagem_no_perfil.sql (personagem do Tutor no perfil do aluno).
-- Volta ao desenho de antes: a escolha do personagem fica só no aparelho. Rode ANTES de desfazer a …13590 (o gatilho lê
-- tutor_personalities.character, que aquele desfazer apaga).
-- NÃO desfaz: quem tocou num personagem e teve a personalidade trocada para a calma dele (Tranquilo ou Tranquila) continua nela.

-- app_tutor_status e app_tutor_save_preferences: sem o campo 'character' (antes de apagar a coluna, que a primeira lê)
do $undo$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_status()'::regprocedure) into v_def;
  v_new := replace(v_def, $$, 'character', p."character")$$, $$)$$);
  if v_new <> v_def then execute v_new; end if;

  select pg_get_functiondef('public.app_tutor_save_preferences(jsonb)'::regprocedure) into v_def;
  v_new := replace(v_def, $$, 'character', t."character");$$, $$);$$);
  if v_new <> v_def then execute v_new; end if;
end
$undo$;

drop function if exists public.app_tutor_set_character(text);
drop trigger if exists tutor_preferences_character_sync on public.tutor_preferences;
drop function if exists public.tutor_preferences_character_sync();
alter table public.tutor_preferences drop constraint if exists tutor_preferences_character_check;
alter table public.tutor_preferences drop column if exists "character";
