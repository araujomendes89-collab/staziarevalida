-- =============================================================================
-- Voice Tutor — Personality Engine (2026-10-16). Aditiva; pode ser colada de novo. NÃO mexe em nada que já existe:
-- tutor_config, tutor_preferences, app_admin_tutor_save_config e ch_worker_tutor_settings ficam como estão (as preferências já
-- salvas dos alunos não mudam).
--
--   * tutor_voice_reaction_rules: o DONO escolhe, por professor e por nível da Durona Explosiva, quais reações de voz podem ser
--     usadas ([laughs], [sighs], [shouts]…) e com que frequência máxima (por fala e a cada 10 falas). Sem linha = não pode.
--     Nasce VAZIA: nenhuma reação passa até o dono marcar.
--   * tutor_explosiva_config: interruptor da Durona Explosiva para os alunos. NASCE DESLIGADO.
--   * tutor_explosiva_preferences: escolha do aluno (nível N1–N4, gritos ligados/desligados, ativação explícita e confirmação de
--     maioridade para N3/N4). Sem linha = modo não escolhido (vale a Durona de sempre).
--   * Funções: painel (app_admin_tutor_voice_reactions / app_admin_tutor_save_voice_reactions, só administrador, com motivo e
--     registro), servidor (ch_worker_tutor_voice_reactions, ch_worker_tutor_explosiva, só serviço) e aluno
--     (app_tutor_explosiva_preferences / app_tutor_save_explosiva_preferences, só a própria linha).
--
-- Desfazer: supabase/desfazer/20261003011900_tutor_reacoes_de_voz.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- reações escolhidas pelo dono
create table if not exists public.tutor_voice_reaction_rules (
  personality text not null check (personality in ('tranquilo', 'direto', 'durona')),
  level text not null default 'padrao' check (level in ('padrao', 'n1', 'n2', 'n3', 'n4')),
  reaction text not null check (reaction in (
    'laughs', 'laughs_harder', 'starts_laughing', 'wheezing', 'snorts', 'sighs', 'exhales', 'whispers', 'shouts',
    'excited', 'sarcastic', 'mischievously', 'curious', 'slow', 'clears_throat', 'crying')),
  allowed boolean not null default false,
  max_per_reply smallint not null default 1 check (max_per_reply between 1 and 3),
  max_per_10 smallint not null default 2 check (max_per_10 between 1 and 10),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (personality, level, reaction),
  constraint tutor_voice_reaction_rules_nivel_so_durona check (level = 'padrao' or personality = 'durona')
);
alter table public.tutor_voice_reaction_rules enable row level security;
revoke all on table public.tutor_voice_reaction_rules from anon, authenticated;

-- ---------------------------------------------------------------- interruptor da Durona Explosiva
create table if not exists public.tutor_explosiva_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.tutor_explosiva_config (id) values (true) on conflict (id) do nothing;
alter table public.tutor_explosiva_config enable row level security;
revoke all on table public.tutor_explosiva_config from anon, authenticated;

-- ---------------------------------------------------------------- escolha do aluno
create table if not exists public.tutor_explosiva_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  level text not null default 'n1' check (level in ('n1', 'n2', 'n3', 'n4')),
  shouts boolean not null default true,
  opt_in_at timestamptz,
  adult_confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint tutor_explosiva_n3_n4_ativado check (level in ('n1', 'n2') or (opt_in_at is not null and adult_confirmed_at is not null))
);
alter table public.tutor_explosiva_preferences enable row level security;
revoke all on table public.tutor_explosiva_preferences from anon, authenticated;
grant select on table public.tutor_explosiva_preferences to authenticated;
drop policy if exists "explosiva: ler a própria" on public.tutor_explosiva_preferences;
create policy "explosiva: ler a própria" on public.tutor_explosiva_preferences for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- painel (administrador)
create or replace function public.app_admin_tutor_voice_reactions() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'explosiva_enabled', (select c.enabled from public.tutor_explosiva_config c),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('personality', r.personality, 'level', r.level, 'reaction', r.reaction, 'allowed', r.allowed,
                                                            'max_per_reply', r.max_per_reply, 'max_per_10', r.max_per_10) order by r.personality, r.level, r.reaction)
                       from public.tutor_voice_reaction_rules r), '[]'::jsonb),
    'updated_at', greatest((select max(r.updated_at) from public.tutor_voice_reaction_rules r), (select c.updated_at from public.tutor_explosiva_config c)));
end
$$;
revoke execute on function public.app_admin_tutor_voice_reactions() from public, anon;

create or replace function public.app_admin_tutor_save_voice_reactions(p_rules jsonb, p_explosiva_enabled boolean, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_rule jsonb;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then raise exception 'Lista de reações inválida.' using errcode = '22023'; end if;
  if jsonb_array_length(p_rules) > 200 then raise exception 'No máximo 200 regras de reação.' using errcode = '22023'; end if;
  for v_rule in select x from jsonb_array_elements(p_rules) x loop
    if jsonb_typeof(v_rule) <> 'object'
       or coalesce(v_rule ->> 'personality', '') not in ('tranquilo', 'direto', 'durona')
       or coalesce(v_rule ->> 'level', '') not in ('padrao', 'n1', 'n2', 'n3', 'n4')
       or (v_rule ->> 'level' <> 'padrao' and v_rule ->> 'personality' <> 'durona')
       or jsonb_typeof(v_rule -> 'allowed') is distinct from 'boolean'
       or coalesce(v_rule ->> 'max_per_reply', '') !~ '^[1-3]$'
       or coalesce(v_rule ->> 'max_per_10', '') !~ '^([1-9]|10)$' then
      raise exception 'Regra de reação inválida: confira professor, nível, reação e frequência.' using errcode = '22023';
    end if;
  end loop;
  v_old := public.app_admin_tutor_voice_reactions();
  -- a lista enviada é a lista inteira: o que não veio deixa de valer
  delete from public.tutor_voice_reaction_rules where true;
  insert into public.tutor_voice_reaction_rules (personality, level, reaction, allowed, max_per_reply, max_per_10, updated_at, updated_by)
  select x ->> 'personality', x ->> 'level', x ->> 'reaction', (x ->> 'allowed')::boolean, (x ->> 'max_per_reply')::smallint, (x ->> 'max_per_10')::smallint, now(), (select auth.uid())
    from jsonb_array_elements(p_rules) x
  on conflict (personality, level, reaction) do update set allowed = excluded.allowed, max_per_reply = excluded.max_per_reply, max_per_10 = excluded.max_per_10,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  if p_explosiva_enabled is not null then
    update public.tutor_explosiva_config set enabled = p_explosiva_enabled, updated_at = now(), updated_by = (select auth.uid()) where id;
  end if;
  perform public.admin_log('tutor.voice_reactions', 'tutor', jsonb_build_object('from', v_old - 'updated_at', 'to', jsonb_build_object('rules', p_rules, 'explosiva_enabled', p_explosiva_enabled), 'reason', btrim(p_reason)));
  return public.app_admin_tutor_voice_reactions();
end
$$;
revoke execute on function public.app_admin_tutor_save_voice_reactions(jsonb, boolean, text) from public, anon;

-- ---------------------------------------------------------------- servidor (só serviço)
create or replace function public.ch_worker_tutor_voice_reactions() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'explosiva_enabled', (select c.enabled from public.tutor_explosiva_config c),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('personality', r.personality, 'level', r.level, 'reaction', r.reaction, 'allowed', r.allowed,
                                                            'max_per_reply', r.max_per_reply, 'max_per_10', r.max_per_10))
                       from public.tutor_voice_reaction_rules r where r.allowed), '[]'::jsonb))
$$;
revoke execute on function public.ch_worker_tutor_voice_reactions() from public, anon, authenticated;

create or replace function public.ch_worker_tutor_explosiva(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('level', p.level, 'shouts', p.shouts, 'opt_in_at', p.opt_in_at, 'adult_confirmed_at', p.adult_confirmed_at)
    from public.tutor_explosiva_preferences p where p.user_id = p_user
$$;
revoke execute on function public.ch_worker_tutor_explosiva(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- aluno (só a própria escolha)
create or replace function public.app_tutor_explosiva_preferences() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'available', (select c.enabled from public.tutor_explosiva_config c),
    'choice', (select jsonb_build_object('level', p.level, 'shouts', p.shouts, 'activated', p.opt_in_at is not null, 'adult_confirmed', p.adult_confirmed_at is not null)
                 from public.tutor_explosiva_preferences p where p.user_id = (select auth.uid())))
  where (select auth.uid()) is not null
$$;
revoke execute on function public.app_tutor_explosiva_preferences() from public, anon;

-- N3 e N4 só com ativação explícita (p_activate) e confirmação de maioridade (p_confirm_adult) nesta chamada ou já gravada.
-- p_level nulo = sair do modo Explosiva (apaga a linha; volta a Durona de sempre).
create or replace function public.app_tutor_save_explosiva_preferences(p_level text, p_shouts boolean, p_activate boolean, p_confirm_adult boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_prev public.tutor_explosiva_preferences;
  v_adult timestamptz;
  v_optin timestamptz;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_level is null then
    delete from public.tutor_explosiva_preferences where user_id = v_user;
    return public.app_tutor_explosiva_preferences();
  end if;
  if not coalesce((select c.enabled from public.tutor_explosiva_config c), false) then
    raise exception 'A Durona Explosiva ainda não foi liberada.' using errcode = '42501';
  end if;
  if p_level not in ('n1', 'n2', 'n3', 'n4') then raise exception 'Nível inválido.' using errcode = '22023'; end if;
  select * into v_prev from public.tutor_explosiva_preferences where user_id = v_user;
  v_adult := case when coalesce(p_confirm_adult, false) then now() else v_prev.adult_confirmed_at end;
  v_optin := case when p_level in ('n3', 'n4') then case when coalesce(p_activate, false) then now() else v_prev.opt_in_at end else v_prev.opt_in_at end;
  if p_level in ('n3', 'n4') and (v_adult is null or v_optin is null) then
    raise exception 'Os níveis 3 e 4 pedem ativação explícita e a confirmação de que você é maior de 18 anos.' using errcode = '22023';
  end if;
  insert into public.tutor_explosiva_preferences (user_id, level, shouts, opt_in_at, adult_confirmed_at, updated_at)
  values (v_user, p_level, coalesce(p_shouts, v_prev.shouts, true), v_optin, v_adult, now())
  on conflict (user_id) do update set level = excluded.level, shouts = excluded.shouts, opt_in_at = excluded.opt_in_at,
    adult_confirmed_at = excluded.adult_confirmed_at, updated_at = excluded.updated_at;
  return public.app_tutor_explosiva_preferences();
end
$$;
revoke execute on function public.app_tutor_save_explosiva_preferences(text, boolean, boolean, boolean) from public, anon;
