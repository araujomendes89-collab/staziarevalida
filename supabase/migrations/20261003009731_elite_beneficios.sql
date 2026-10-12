-- =============================================================================
-- PL04 (decisão do dono de 2026-10-11): o plano Elite passa a poder ter algo que o Pro não tem. Pode ser colada de novo no Supabase
-- sem estragar nada (tudo é "create ... if not exists", "create or replace" ou conferido). Depende da 9550 e da 9730 já aplicadas.
--
-- SÓ A ESTRUTURA: o dono ainda não definiu os números nem o preço. Tudo nasce IGUAL ao Pro, então nada muda para ninguém até ele preencher
-- em Administração > Configurações (bloco "Benefícios do plano Elite"):
--   * minutos de voz do Tutor por dia do Elite  - vazio = os mesmos do Pro (o valor do Pro continua no painel do Tutor, "Voz por dia (plano
--     pago, minutos)"); preenchido, vale só para o Elite com plano pago válido e nunca fica abaixo do Pro (a equipe segue com o limite do plano pago);
--   * correção de estação com devolutiva: só Elite - liga/desliga, nasce DESLIGADO. As telas de estações do aluno ainda estão em
--     construção; por enquanto esta chave só decide se o aluno Elite vê o benefício na Conta e deixa pronta a função
--     station_feedback_allowed() para as telas usarem (equipe e revisor médico passam sempre; o aluno só se for Elite com plano pago válido e a chave ligada).
-- Quem muda isso é só o administrador (como o resto das Configurações); cada mudança vai para o Registro ("Benefícios do Elite alterados").
-- =============================================================================

-- ---------------------------------------------------------------- onde ficam os valores
create table if not exists public.plan_benefits (
  id boolean primary key default true check (id),
  -- minutos de voz do Tutor por dia do Elite; null = igual ao Pro
  elite_voice_daily_minutes integer check (elite_voice_daily_minutes between 1 and 1440),
  -- correção de estação com devolutiva: só Elite (null/false = desligado)
  elite_station_feedback boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.plan_benefits enable row level security;
-- Sem política e sem acesso direto: só as funções abaixo (security definer) leem e gravam.
revoke all on public.plan_benefits from public, anon, authenticated;
insert into public.plan_benefits (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- Administração (só administrador)
create or replace function public.app_admin_plan_benefits() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (
    select jsonb_build_object(
      'elite_voice_daily_minutes', b.elite_voice_daily_minutes,
      'elite_station_feedback', b.elite_station_feedback,
      'pro_voice_daily_minutes', (select (c.paid_voice_daily_seconds / 60) from public.tutor_config c),
      'voice_enabled', (select c.voice_enabled from public.tutor_config c))
    from public.plan_benefits b);
end
$$;
revoke execute on function public.app_admin_plan_benefits() from public, anon;

create or replace function public.app_admin_save_plan_benefits(p_benefits jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_before jsonb;
  v_minutes integer;
  v_pro integer := (select (c.paid_voice_daily_seconds / 60) from public.tutor_config c);
  v_feedback boolean;
begin
  perform public.assert_admin();
  if p_benefits is null or jsonb_typeof(p_benefits) <> 'object' then
    raise exception 'Benefícios inválidos.' using errcode = '22023';
  end if;
  -- minutos vazios = igual ao Pro
  if nullif(btrim(coalesce(p_benefits ->> 'elite_voice_daily_minutes', '')), '') is not null then
    if (p_benefits ->> 'elite_voice_daily_minutes') !~ '^\d{1,4}$' or (p_benefits ->> 'elite_voice_daily_minutes')::int not between 1 and 1440 then
      raise exception 'Minutos de voz do Elite: de 1 a 1440, ou deixe vazio para ficar igual ao Pro.' using errcode = '22023';
    end if;
    v_minutes := (p_benefits ->> 'elite_voice_daily_minutes')::int;
    if v_minutes < v_pro then
      raise exception 'Os minutos de voz do Elite não podem ser menores que os do Pro (% min por dia).', v_pro using errcode = '22023';
    end if;
  end if;
  if p_benefits ? 'elite_station_feedback' and jsonb_typeof(p_benefits -> 'elite_station_feedback') not in ('boolean', 'null') then
    raise exception 'Correção de estação com devolutiva: ligado ou desligado.' using errcode = '22023';
  end if;
  v_feedback := coalesce((p_benefits ->> 'elite_station_feedback')::boolean, false);
  select jsonb_build_object('elite_voice_daily_minutes', b.elite_voice_daily_minutes, 'elite_station_feedback', b.elite_station_feedback)
    into v_before from public.plan_benefits b;
  update public.plan_benefits set
    elite_voice_daily_minutes = v_minutes, elite_station_feedback = v_feedback,
    updated_at = now(), updated_by = (select auth.uid())
  where id;
  perform public.admin_log('plan.benefits', 'elite', jsonb_build_object(
    'from', v_before,
    'to', jsonb_build_object('elite_voice_daily_minutes', v_minutes, 'elite_station_feedback', v_feedback, 'pro_voice_daily_minutes', v_pro)));
  return public.app_admin_plan_benefits();
end
$$;
revoke execute on function public.app_admin_save_plan_benefits(jsonb) from public, anon;

-- ---------------------------------------------------------------- o que o aluno vê
-- Elite com plano pago válido? (interna)
create or replace function public.user_is_paid_elite(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.subscriptions s
                 where s.user_id = p_user and s.plan = 'elite' and public.subscription_is_paid(s.plan, s.status, s.current_period_end))
$$;
revoke execute on function public.user_is_paid_elite(uuid) from public, anon, authenticated;

-- Os benefícios do Elite que o aluno logado enxerga: só aparecem se o dono preencheu/ligou e só para quem é Elite com plano pago
-- válido (e a equipe, que vê para conferir). Nada é inventado: sem valor, a chave vem null/false.
create or replace function public.app_my_benefits() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_elite boolean;
  b public.plan_benefits;
  v_pro integer := (select (c.paid_voice_daily_seconds / 60) from public.tutor_config c);
begin
  if v_uid is null then return null; end if;
  v_elite := public.user_is_paid_elite(v_uid);
  select * into b from public.plan_benefits;
  return jsonb_build_object(
    'elite', v_elite,
    'voice_daily_minutes', case when v_elite and b.elite_voice_daily_minutes is not null then greatest(b.elite_voice_daily_minutes, v_pro) end,
    'station_feedback', v_elite and b.elite_station_feedback);
end
$$;
revoke execute on function public.app_my_benefits() from public, anon;
grant execute on function public.app_my_benefits() to authenticated;

-- Para as telas de estações (quando existirem): pode pedir a correção com devolutiva? Equipe e revisor médico sempre; aluno só se for
-- Elite com plano pago válido e a chave estiver ligada.
create or replace function public.station_feedback_allowed() returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return false; end if;
  return public.user_has_full_access(v_uid)
      or (public.user_is_paid_elite(v_uid) and coalesce((select b.elite_station_feedback from public.plan_benefits b), false));
end
$$;
revoke execute on function public.station_feedback_allowed() from public, anon;
grant execute on function public.station_feedback_allowed() to authenticated;

-- ---------------------------------------------------------------- Tutor: minutos de voz do Elite
-- Igual ao de …9730_teste_vencido_trava_pago; muda só v_paid_voice (minutos de voz por dia do plano pago).
create or replace function public.tutor_entitlement(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.subscriptions;
  v_staff boolean;
  v_paid boolean;
  v_locked boolean;
  v_paid_voice integer;
  v_days integer := coalesce((select (x.value #>> '{}')::integer from public.app_settings x where x.key = 'trial_days'), 7);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mode text;
  v_trial text := 'none';
  v_ends timestamptz;
  v_text_limit integer; v_text_used integer;
  v_vday integer; v_vday_used integer; v_vtotal integer; v_vtotal_used integer := 0; v_vleft integer;
  v_qlimit integer; v_qused integer;
  v_block text;
begin
  select * into c from public.tutor_config;
  select * into s from public.subscriptions where user_id = p_user;
  v_staff := public.user_has_full_access(p_user); -- equipe ou revisor médico: acesso completo, sem teste
  v_paid := v_staff or public.subscription_is_paid(s.plan, s.status, s.current_period_end);
  v_locked := not v_paid and not public.subscription_trial_is_valid(s.status, s.trial_ends_at);
  -- minutos de voz por dia do plano pago: os do painel do Tutor; o Elite pago (nunca a equipe) usa os do Elite quando o dono preencheu
  -- (e nunca menos que os do plano pago). Sem valor preenchido, o Elite tem os mesmos minutos do Pro.
  v_paid_voice := c.paid_voice_daily_seconds;
  if not v_staff and s.plan = 'elite' and public.subscription_is_paid(s.plan, s.status, s.current_period_end) then
    v_paid_voice := greatest(c.paid_voice_daily_seconds, coalesce((select b.elite_voice_daily_minutes * 60 from public.plan_benefits b), 0));
  end if;
  if v_paid or not c.requires_pro then
    v_mode := 'paid';
  elsif s.tutor_trial_started_at is null then
    if v_locked then
      v_mode := 'blocked'; v_trial := 'expired';
    else
      v_mode := 'trial'; v_trial := 'available';
    end if;
  elsif now() < s.tutor_trial_started_at + make_interval(days => v_days) then
    v_mode := 'trial'; v_trial := 'active'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  else
    v_mode := 'blocked'; v_trial := 'expired'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  end if;

  v_text_used := coalesce((select u.requests from public.ai_usage u where u.user_id = p_user and u.day = v_today), 0);
  v_text_limit := case v_mode when 'paid' then c.daily_message_limit when 'trial' then c.trial_text_daily else 0 end;
  v_vday := case when not c.voice_enabled then 0 when v_mode = 'paid' then v_paid_voice when v_mode = 'trial' then c.trial_voice_daily_seconds else 0 end;
  v_vday_used := public.tutor_voice_seconds(p_user, v_today, null);
  if v_mode = 'trial' then
    v_vtotal := c.trial_voice_total_seconds;
    if s.tutor_trial_started_at is not null then v_vtotal_used := public.tutor_voice_seconds(p_user, null, s.tutor_trial_started_at); end if;
  end if;
  v_vleft := greatest(0, least(v_vday - v_vday_used, coalesce(v_vtotal - v_vtotal_used, 2147483647)));
  v_qlimit := case when v_mode = 'trial' then c.trial_questions_daily end;
  v_qused := (select count(*)::int from public.tutor_answers a where a.user_id = p_user and (a.answered_at at time zone 'America/Sao_Paulo')::date = v_today);
  v_block := case when not c.enabled then 'disabled' when v_mode = 'blocked' then 'trial_expired' end;

  return jsonb_build_object(
    'enabled', c.enabled, 'mode', v_mode, 'plan', coalesce(s.plan::text, 'trial'), 'is_paid', v_paid, 'staff', v_staff,
    'plan_locked', v_mode = 'blocked' and s.tutor_trial_started_at is null,
    'trial', jsonb_build_object('state', v_trial, 'days', v_days, 'started_at', s.tutor_trial_started_at, 'ends_at', v_ends,
                                'day', case when v_trial = 'active' then least(v_days, floor(extract(epoch from (now() - s.tutor_trial_started_at)) / 86400)::int + 1) end),
    'text', jsonb_build_object('used', v_text_used, 'limit', v_text_limit, 'remaining', greatest(0, v_text_limit - v_text_used)),
    'voice', jsonb_build_object('enabled', c.voice_enabled, 'limit_today_s', v_vday, 'used_today_s', v_vday_used, 'remaining_today_s', greatest(0, v_vday - v_vday_used),
                                'limit_total_s', v_vtotal, 'used_total_s', case when v_vtotal is not null then v_vtotal_used end,
                                'remaining_total_s', case when v_vtotal is not null then greatest(0, v_vtotal - v_vtotal_used) end, 'remaining_s', v_vleft),
    'questions', jsonb_build_object('used', v_qused, 'limit', v_qlimit, 'remaining', case when v_qlimit is not null then greatest(0, v_qlimit - v_qused) end),
    'can_use', c.enabled and v_mode <> 'blocked',
    'can_text', c.enabled and v_mode <> 'blocked' and v_text_used < v_text_limit,
    'can_voice', c.enabled and v_mode <> 'blocked' and c.voice_enabled and v_vleft > 0,
    'block_reason', v_block);
end
$$;
revoke execute on function public.tutor_entitlement(uuid) from public, anon, authenticated;

-- Para desfazer: recriar tutor_entitlement de …9730; depois "drop function public.station_feedback_allowed()", "drop function public.app_my_benefits()",
-- "drop function public.user_is_paid_elite(uuid)", "drop function public.app_admin_save_plan_benefits(jsonb)",
-- "drop function public.app_admin_plan_benefits()" e "drop table public.plan_benefits".
