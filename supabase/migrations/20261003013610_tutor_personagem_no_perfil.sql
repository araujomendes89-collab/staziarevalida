-- =============================================================================
-- Tutor: a escolha do personagem (Stazi ou Stazia) fica no PERFIL do aluno (decisão do dono, 17/10/2026). Aditiva; pode ser colada de novo.
--
--   Antes, a escolha do personagem ficava só no aparelho (localStorage); trocar de celular ou de navegador voltava ao padrão.
--   * tutor_preferences.character ('stazi' | 'stazia' | nulo): o personagem do aluno. Quem já tem preferência ganha o personagem
--     da personalidade preferida (tutor_personalities.character, …13590).
--   * Personagem e personalidade andam juntos (gatilho): toda vez que a personalidade é gravada (Começar, app_tutor_save_preferences,
--     ajustes da equipe), o personagem passa a ser o dela. Gravar uma personalidade da Stazia faz o personagem virar Stazia.
--   * app_tutor_set_character(p_character): o toque no personagem na entrada do Tutor. Se a personalidade preferida for do outro
--     personagem, passa para a CALMA do personagem novo (Tranquilo ou Tranquila), sem palavrão — a mesma regra da tela (a firme com
--     palavrão fica por escolha do aluno). Só 'stazi' ou 'stazia'; grava só a linha de quem está logado.
--   * app_tutor_status devolve preferences.character; app_tutor_save_preferences devolve o character junto. O resto das duas funções
--     é a definição vigente, remendada com pg_get_functiondef (mesma técnica da …13590).
--   * RLS como estava: o aluno só lê a própria linha; gravar, só pelas funções (security definer).
--
-- Para desfazer: supabase/desfazer/20261003013610_tutor_personagem_no_perfil.desfazer.sql (antes de desfazer a …13590).
-- =============================================================================

-- ---------------------------------------------------------------- coluna
alter table public.tutor_preferences add column if not exists "character" text;
alter table public.tutor_preferences drop constraint if exists tutor_preferences_character_check;
alter table public.tutor_preferences add constraint tutor_preferences_character_check check ("character" is null or "character" in ('stazi', 'stazia'));

-- ---------------------------------------------------------------- quem já tem preferência: o personagem da personalidade preferida
update public.tutor_preferences as p set "character" = t."character"
from public.tutor_personalities as t
where t.id = p.personality_id and t."character" is not null and p."character" is distinct from t."character";

-- ---------------------------------------------------------------- personagem acompanha a personalidade
-- A personalidade manda: se ela pertence a um personagem, o personagem é esse. Personalidade sem personagem (o Direto, aposentado)
-- deixa o personagem como estava.
create or replace function public.tutor_preferences_character_sync() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_char text;
begin
  select t."character" into v_char from public.tutor_personalities t where t.id = new.personality_id;
  if v_char is not null then new."character" := v_char; end if;
  return new;
end
$$;
revoke execute on function public.tutor_preferences_character_sync() from public, anon, authenticated;

drop trigger if exists tutor_preferences_character_sync on public.tutor_preferences;
create trigger tutor_preferences_character_sync before insert or update on public.tutor_preferences
  for each row execute function public.tutor_preferences_character_sync();

-- ---------------------------------------------------------------- o toque no personagem
create or replace function public.app_tutor_set_character(p_character text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  p public.tutor_preferences;
  t public.tutor_personalities;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if p_character is null or p_character not in ('stazi', 'stazia') then raise exception 'Personagem inválido.' using errcode = '22023'; end if;
  select * into p from public.tutor_preferences where user_id = v_user;
  -- a personalidade preferida já é deste personagem (e está ligada): fica como está
  select * into t from public.tutor_personalities x where x.id = p.personality_id and x.active and x."character" = p_character;
  if not found then
    -- senão, a calma do personagem (sem palavrão); se a equipe desligou a calma, a outra que estiver ligada
    select * into t from public.tutor_personalities x where x."character" = p_character and x.active
    order by coalesce((x.params ->> 'profanity')::int, 0) >= 20, x.position limit 1;
    if not found then raise exception 'Professor não encontrado.' using errcode = 'P0002'; end if;
  end if;
  insert into public.tutor_preferences (user_id, personality_id, intensity, profanity, "character", updated_at)
  values (v_user, t.id, 3, case when coalesce((t.params ->> 'profanity')::int, 0) >= 20 then (select c.max_profanity from public.tutor_config c) else 'off' end, p_character, now())
  on conflict (user_id) do update set
    "character" = excluded."character",
    personality_id = excluded.personality_id,
    -- trocar de personagem troca de professor: intensidade e palavrão seguem a regra de app_tutor_save_preferences;
    -- ficar no mesmo professor não mexe em nada além da data
    intensity = case when public.tutor_preferences.personality_id = excluded.personality_id then public.tutor_preferences.intensity else 3 end,
    profanity = case when public.tutor_preferences.personality_id = excluded.personality_id then public.tutor_preferences.profanity else excluded.profanity end,
    updated_at = now()
  returning * into p;
  return jsonb_build_object('personality_id', p.personality_id, 'profanity', p.profanity, 'chosen', true, 'character', p."character");
end
$$;
revoke execute on function public.app_tutor_set_character(text) from public, anon;
grant execute on function public.app_tutor_set_character(text) to authenticated;

-- ---------------------------------------------------------------- app_tutor_status / app_tutor_save_preferences: devolvem o character
-- Aplicado sobre a definição vigente (pg_get_functiondef). Falha alto se o trecho esperado não estiver lá (nem o já trocado).
do $patch$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_status()'::regprocedure) into v_def;
  v_new := replace(v_def, $$jsonb_build_object('personality_id', 'acolhedor', 'profanity', 'off', 'chosen', false)$$,
                          $$jsonb_build_object('personality_id', 'acolhedor', 'profanity', 'off', 'chosen', false, 'character', p."character")$$);
  v_new := replace(v_new, $$jsonb_build_object('personality_id', p.personality_id, 'profanity', p.profanity, 'chosen', true)$$,
                          $$jsonb_build_object('personality_id', p.personality_id, 'profanity', p.profanity, 'chosen', true, 'character', p."character")$$);
  if v_new = v_def and position($$'chosen', true, 'character', p."character")$$ in v_def) = 0 then
    raise exception 'app_tutor_status: trecho das preferências não encontrado.';
  end if;
  if (length(v_new) - length(replace(v_new, $$'character', p."character")$$, ''))) / length($$'character', p."character")$$) <> 2 then
    raise exception 'app_tutor_status: as duas saídas das preferências precisam do personagem.';
  end if;
  if v_new <> v_def then execute v_new; end if;

  select pg_get_functiondef('public.app_tutor_save_preferences(jsonb)'::regprocedure) into v_def;
  v_new := replace(v_def, $$return jsonb_build_object('personality_id', t.id, 'profanity', v_prof, 'chosen', true);$$,
                          $$return jsonb_build_object('personality_id', t.id, 'profanity', v_prof, 'chosen', true, 'character', t."character");$$);
  if v_new = v_def and position($$'character', t."character");$$ in v_def) = 0 then
    raise exception 'app_tutor_save_preferences: trecho do retorno não encontrado.';
  end if;
  if v_new <> v_def then execute v_new; end if;
end
$patch$;
