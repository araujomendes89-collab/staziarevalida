-- =============================================================================
-- PL04 (decisão do dono de 2026-10-11): o plano Elite passa a poder ter algo que o Pro não tem. Pode ser colada de novo no Supabase
-- sem estragar nada (tudo é "create ... if not exists", "create or replace" ou conferido). Depende da 9730 já aplicada (que traz a tabela plan_benefits e o Tutor com os minutos do Elite).
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
-- A tabela public.plan_benefits (e a leitura dos minutos de voz do Elite no tutor_entitlement) vêm da 9730, para que colar a 9730 de novo
-- nunca tire o que o dono preencheu aqui. Esta migração só traz as funções que leem e gravam essa tabela.

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

-- Para desfazer: "drop function public.station_feedback_allowed()", "drop function public.app_my_benefits()",
-- "drop function public.user_is_paid_elite(uuid)", "drop function public.app_admin_save_plan_benefits(jsonb)" e
-- "drop function public.app_admin_plan_benefits()". (A tabela public.plan_benefits e a leitura dos minutos no Tutor ficam na 9730.)
