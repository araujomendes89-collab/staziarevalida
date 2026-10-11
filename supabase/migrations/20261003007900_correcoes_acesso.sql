-- =============================================================================
-- Correções da Administração (pedido do dono de 2026-10-10, "Fazer agora"): acesso pago com data de fim e Tutor só com
-- os planos pagos ligados. Pode ser colada de novo no Supabase sem estragar nada (tudo é "create or replace" ou conferido).
--
-- US01 — "Plano pago até" não cortava o acesso: has_pro, tutor_is_pro e tutor_entitlement só olhavam plano e situação, e
--        nenhuma rotina vencia o plano. Agora o plano pago (Pro ou Elite) só vale com a data de fim no futuro; com pagamento
--        pendente, até 3 dias depois do fim (tolerância para o cartão ser cobrado de novo). Sem data de fim, não vale.
--        A regra fica numa função só (subscription_is_paid), usada pelas três. A administração passa a recusar plano pago
--        ativo ou pendente sem a data de fim (antes, sem data, o aluno ficava com o plano para sempre).
--        ATENÇÃO antes de colar: quem hoje tem Pro ou Elite sem "Plano pago até" perde o acesso pago na hora. Para ver quem é:
--          select s.user_id, u.email, s.plan, s.status, s.current_period_end from public.subscriptions s
--          join auth.users u on u.id = s.user_id
--          where s.plan in ('pro', 'elite') and s.status in ('active', 'past_due')
--            and (s.current_period_end is null or s.current_period_end <= now());
--        e dê a data em Administração > Usuários (ou cole depois desta migração).
-- CF01 — "Planos pagos + teste grátis" nascia desligado: com o Tutor ligado e essa chave desligada, todo aluno usava o
--        Tutor de graça, com os limites do plano pago. Agora o banco recusa salvar o Tutor ligado com ela desligada (mensagem
--        clara na tela) e a chave nasce ligada. Esta migração NÃO muda a configuração atual do Tutor: a decisão é do dono.
--        A equipe (administrador e editor) continua usando o Tutor como assinante, com a chave ligada ou não.
--        ATENÇÃO antes de colar: veja como o Tutor está hoje:
--          select enabled, requires_pro from public.tutor_config;
--        Se vier enabled = true e requires_pro = false, hoje todo aluno usa o Tutor de graça, e continua assim depois de
--        colar. Mas o painel do Tutor (Administração) passa a não salvar nenhuma mudança do Tutor até o dono escolher:
--          - ligar "Planos pagos + teste grátis": quem não paga entra no teste grátis de 7 dias no próximo uso e, depois,
--            vê "Seu teste grátis do Tutor terminou" sem ter onde assinar (a tela de planos e a Stripe ainda não existem);
--          - ou desligar o Tutor.
--        Peça o OK do dono antes de colar.
-- =============================================================================

-- ---------------------------------------------------------------- US01: a regra do plano pago
-- Plano pago vale: Pro ou Elite, ativo com a data de fim no futuro, ou com pagamento pendente até 3 dias depois do fim.
create or replace function public.subscription_is_paid(p_plan public.plan_code, p_status public.subscription_status, p_period_end timestamptz)
  returns boolean
  language sql stable security definer set search_path = ''
as $$
  select coalesce(
    p_plan in ('pro', 'elite')
    and ((p_status = 'active' and p_period_end > now())
      or (p_status = 'past_due' and p_period_end + interval '3 days' > now())),
    false)
$$;
revoke execute on function public.subscription_is_paid(public.plan_code, public.subscription_status, timestamptz) from public, anon, authenticated;

-- Conteúdo marcado como Pro (estações): igual ao de …4600 (equipe ou plano pago), com a regra do plano pago acima.
create or replace function public.has_pro() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_staff() or exists (
    select 1 from public.subscriptions s
    where s.user_id = (select auth.uid())
      and public.subscription_is_paid(s.plan, s.status, s.current_period_end)
  )
$$;

-- Tutor: igual ao de …4600, com a regra do plano pago acima.
create or replace function public.tutor_is_pro(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.user_is_staff(p_user)
      or exists (select 1 from public.subscriptions s where s.user_id = p_user and public.subscription_is_paid(s.plan, s.status, s.current_period_end))
$$;
revoke execute on function public.tutor_is_pro(uuid) from public, anon, authenticated;

-- Tutor: igual ao de …4600_equipe_acesso_completo; só a linha de v_paid usa a regra do plano pago acima.
create or replace function public.tutor_entitlement(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.subscriptions;
  v_staff boolean;
  v_paid boolean;
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
  v_staff := public.user_is_staff(p_user);
  v_paid := v_staff or public.subscription_is_paid(s.plan, s.status, s.current_period_end);
  if v_paid or not c.requires_pro then
    v_mode := 'paid';
  elsif s.tutor_trial_started_at is null then
    v_mode := 'trial'; v_trial := 'available';
  elsif now() < s.tutor_trial_started_at + make_interval(days => v_days) then
    v_mode := 'trial'; v_trial := 'active'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  else
    v_mode := 'blocked'; v_trial := 'expired'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  end if;

  v_text_used := coalesce((select u.requests from public.ai_usage u where u.user_id = p_user and u.day = v_today), 0);
  v_text_limit := case v_mode when 'paid' then c.daily_message_limit when 'trial' then c.trial_text_daily else 0 end;
  v_vday := case when not c.voice_enabled then 0 when v_mode = 'paid' then c.paid_voice_daily_seconds when v_mode = 'trial' then c.trial_voice_daily_seconds else 0 end;
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

-- Plano atribuído à mão: igual ao de …1300_admin, mas plano pago ativo ou com pagamento pendente exige a data de fim.
create or replace function public.app_admin_set_subscription(
  p_user_id uuid, p_plan text, p_status text,
  p_trial_ends_at timestamptz default null, p_current_period_end timestamptz default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform public.assert_admin();
  if p_plan is null or p_plan not in ('trial', 'pro', 'elite') then
    raise exception 'Plano inválido.' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('trialing', 'active', 'past_due', 'canceled', 'expired') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  if p_plan = 'trial' and p_status = 'trialing' and p_trial_ends_at is null then
    raise exception 'Informe até quando vai o teste.' using errcode = '22023';
  end if;
  if p_plan in ('pro', 'elite') and p_status in ('active', 'past_due') and p_current_period_end is null then
    raise exception 'Informe até quando vai o plano pago (campo “Plano pago até”). Sem essa data, o aluno fica sem o acesso pago.' using errcode = '22023';
  end if;
  select to_jsonb(s) - 'user_id' - 'updated_at' into v_before from public.subscriptions s where s.user_id = p_user_id;
  if v_before is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  update public.subscriptions set
    plan = p_plan::public.plan_code, status = p_status::public.subscription_status,
    trial_ends_at = p_trial_ends_at, current_period_end = p_current_period_end,
    provider = coalesce(provider, 'manual'), updated_at = now()
  where user_id = p_user_id;
  perform public.admin_log('user.subscription', p_user_id::text, jsonb_build_object(
    'from', v_before,
    'to', jsonb_build_object('plan', p_plan, 'status', p_status, 'trial_ends_at', p_trial_ends_at, 'current_period_end', p_current_period_end)));
  return public.admin_user_row(p_user_id);
end
$$;
-- Sem login, ninguém chama (como as demais funções da Administração); a equipe logada continua chamando.
revoke execute on function public.app_admin_set_subscription(uuid, text, text, timestamptz, timestamptz) from public, anon;

-- ---------------------------------------------------------------- CF01: Tutor ligado só com os planos pagos
-- A chave nasce ligada (a linha única já existe; isto vale se ela for recriada).
alter table public.tutor_config alter column requires_pro set default true;

-- O banco recusa salvar o Tutor ligado com "Planos pagos + teste grátis" desligado. Vale para tudo que é salvo pelo app
-- (alguém logado, como o painel do Tutor). Ajuste direto no editor SQL do Supabase, sem ninguém logado, não passa por esta
-- trava: fica para testes internos de quem tem acesso ao banco.
create or replace function public.tutor_config_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.enabled and not new.requires_pro and (select auth.uid()) is not null then
    raise exception 'Para ligar o Tutor, ligue também “Planos pagos + teste grátis”. Sem isso, todo aluno usaria o Tutor de graça, com os limites do plano pago.'
      using errcode = '22023';
  end if;
  return new;
end
$$;
revoke execute on function public.tutor_config_guard() from public, anon, authenticated;
drop trigger if exists tutor_config_guard on public.tutor_config;
create trigger tutor_config_guard before insert or update on public.tutor_config
  for each row execute function public.tutor_config_guard();

-- A configuração atual do Tutor não é mudada aqui (veja o ATENÇÃO do CF01 no cabeçalho): se o Tutor já estiver ligado com
-- a chave desligada, o painel avisa e trava o salvar até o dono ligar a chave ou desligar o Tutor.

-- Para desfazer: recriar has_pro, tutor_is_pro e tutor_entitlement de …4600 e app_admin_set_subscription de …1300; depois
-- "drop function public.subscription_is_paid(public.plan_code, public.subscription_status, timestamptz)",
-- "drop trigger tutor_config_guard on public.tutor_config", "drop function public.tutor_config_guard()" e
-- "alter table public.tutor_config alter column requires_pro set default false".
