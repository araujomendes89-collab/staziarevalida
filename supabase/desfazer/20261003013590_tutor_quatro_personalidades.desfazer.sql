-- Desfaz supabase/migrations/20261003013590_tutor_quatro_personalidades.sql (dois personagens, quatro personalidades).
-- Volta ao desenho de antes: Tranquilo, Durona e Direto ligados. O Durão e a Tranquila ficam DESLIGADOS (não são apagados: se algum
-- aluno já conversou com eles, as conversas continuam apontando para eles e abrem só para leitura).
-- NÃO desfaz: as preferências de quem estava no Direto e passaram para o Tranquilo (guarde a lista antes, se precisar), nem a marca
-- de "só leitura" nas conversas antigas do Direto (a marca só mostra o nome original, não atrapalha).

update public.tutor_personalities set active = false, position = position + 100 where id in ('durao', 'tranquila');
update public.tutor_personalities set active = true, position = 1 where id = 'acolhedor';
update public.tutor_personalities set active = true, position = 2 where id = 'durona';
update public.tutor_personalities set active = true, position = 3 where id = 'direto';
-- a voz do Tranquilo de antes (…3400 e …3600); a Durona já tinha marin / Kore
update public.tutor_personalities set voice = voice || '{"realtime":"cedar","openai":"ballad","gemini":"Enceladus"}'::jsonb where id = 'acolhedor';
alter table public.tutor_personalities drop constraint if exists tutor_personalities_character_check;
alter table public.tutor_personalities drop column if exists "character";

create or replace function public.app_admin_tutor_personalities() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'tagline', t.tagline, 'active', t.active,
                                        'voice', t.voice ->> 'realtime', 'default', t.id = 'acolhedor') order by t.position)
    from public.tutor_personalities t where t.id in ('acolhedor', 'direto', 'durona')
  ), '[]'::jsonb);
end
$$;

create or replace function public.app_admin_tutor_set_personality(p_id text, p_active boolean, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_id is null or p_id not in ('acolhedor', 'direto', 'durona') then raise exception 'Professor não encontrado.' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_id = 'acolhedor' and not coalesce(p_active, true) then
    raise exception 'Tranquilo é o professor padrão e fica sempre disponível.' using errcode = '22023';
  end if;
  update public.tutor_personalities set active = coalesce(p_active, active) where id = p_id;
  perform public.admin_log('tutor.personality', 'tutor', jsonb_build_object('id', p_id, 'active', p_active, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_personalities();
end
$$;

create or replace function public.tutor_voice_check(p_user uuid, p_voice text) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin') then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  if p_voice is null or p_voice not in ('tranquilo', 'durona', 'direto') then raise exception 'Voz inválida.' using errcode = '22023'; end if;
end
$$;
revoke execute on function public.tutor_voice_check(uuid, text) from public, anon, authenticated;

-- app_tutor_start e app_tutor_status: de volta à lista antiga de ids e sem o campo 'character'
do $undo$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_start(text, text, text, jsonb, text)'::regprocedure) into v_def;
  v_new := replace(v_def, $$id in ('acolhedor', 'durao', 'durona', 'tranquila')$$, $$id in ('acolhedor', 'durona', 'direto')$$);
  if v_new <> v_def then execute v_new; end if;

  select pg_get_functiondef('public.app_tutor_status()'::regprocedure) into v_def;
  v_new := replace(v_def, $$'voice', t.voice, 'character', t."character") order by t.position)$$, $$'voice', t.voice) order by t.position)$$);
  if v_new <> v_def then execute v_new; end if;
end
$undo$;
