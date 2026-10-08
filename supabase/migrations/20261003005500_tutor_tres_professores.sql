-- Tutor Nexus: três professores públicos (Tranquilo, Durona, Direto). O Acolhedor recebe o jeito do antigo Professor
-- Preguiçoso e passa a se chamar Tranquilo; o id 'acolhedor' é preservado para não quebrar preferências.
--
-- Antes da troca, toda conversa cujo professor não é a Durona nem o Direto (o Acolhedor de antes e os perfis que ficam
-- desligados) recebe a marca legacy_persona com o nome e o emoji ORIGINAIS: assim ela abre só para leitura, com o nome
-- de quando foi feita ("Este professor mudou. Comece uma conversa nova."), e nenhuma conversa troca de professor no meio.
alter table public.tutor_sessions add column legacy_persona jsonb
  check (legacy_persona is null or jsonb_typeof(legacy_persona) = 'object');

update public.tutor_sessions as s
set legacy_persona = jsonb_build_object('name', t.name, 'emoji', t.emoji)
from public.tutor_personalities as t
where t.id = s.personality_id and s.personality_id not in ('durona', 'direto');

update public.tutor_personalities as target
set name = 'Tranquilo',
    emoji = '😌',
    tagline = 'Descontraído; faz você pensar antes de explicar',
    params = source.params,
    style_notes = source.style_notes,
    openings = source.openings,
    voice = source.voice || '{"realtime":"cedar"}'::jsonb,
    position = 1,
    active = true,
    examples = source.examples,
    lines = source.lines || '{"discuss":["Você marcou {tema}. O que te levou a essa escolha?","Me conta seu raciocínio antes de eu explicar."]}'::jsonb,
    examples_strong = source.examples_strong,
    lines_strong = source.lines_strong,
    engine = '{"frustration_multiplier":0.45,"sarcasm_max":40,"aggression_max":15,"patience_base":70,"warmth_base":60,"language_max":1,"language_base":1}'::jsonb
from public.tutor_personalities as source
where target.id = 'acolhedor' and source.id = 'preguicoso';

update public.tutor_personalities
set active = true, position = 3
where id = 'direto';

update public.tutor_personalities
set active = true, position = 2
where id = 'durona';

update public.tutor_personalities
set active = false
where id not in ('acolhedor', 'direto', 'durona');

-- Preferência é estado atual (não histórico): perfis aposentados passam para Tranquilo.
-- As conversas antigas não mudam: ficam só para leitura pela marca legacy_persona gravada acima.
update public.tutor_preferences
set personality_id = 'acolhedor', profanity = 'off', updated_at = now()
where personality_id not in ('acolhedor', 'direto', 'durona');

-- O painel administrativo só lista e altera os três perfis atuais; as linhas antigas ficam guardadas
-- para que sessões históricas continuem exibindo o nome e o comportamento originais.
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
