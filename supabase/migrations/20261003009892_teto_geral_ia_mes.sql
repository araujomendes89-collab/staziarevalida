-- =============================================================================
-- IA02 (Fase 1 objetiva, 2026-10-12): TETO GERAL do mês para todo o gasto de IA (Central de IAs, Tutor, vozes, transcrição, Podcasts e
-- busca por significado juntos). SÓ A ESTRUTURA: nasce DESLIGADO e SEM VALOR (decisão do dono: tetos desligados até o aplicativo estar
-- finalizado; os números e o que fazer ao chegar no teto são dele). Pode ser colada de novo sem estragar nada.
--
--   * ai_settings ganha duas colunas: overall_monthly_cap_usd (vazio) e overall_cap_enabled (desligado).
--   * O banco não deixa LIGAR o teto geral sem valor. Desligar é sempre permitido.
--   * Por ora o teto geral só AVISA (na Central de IAs, a 80% e ao passar). Ele NÃO para o Tutor, as vozes nem nada: se deve parar tudo,
--     parar só as ferramentas da equipe ou só avisar é decisão do dono (pergunta registrada no relatório).
--   * O teto mensal e o teto por chamada de sempre não mudam e continuam valendo só para as IAs da Central.
--
-- A função ch_worker_ai_save_settings parte da versão MAIS NOVA (a da …5200_central_de_ias, a única) e só acrescenta as duas chaves.
-- Para desfazer: recriar ch_worker_ai_save_settings como na …5200 e tirar as duas colunas de ai_settings.
-- =============================================================================

alter table public.ai_settings
  add column if not exists overall_monthly_cap_usd numeric(12, 2) check (overall_monthly_cap_usd is null or overall_monthly_cap_usd >= 0),
  add column if not exists overall_cap_enabled boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_settings_overall_cap_needs_value' and conrelid = 'public.ai_settings'::regclass) then
    alter table public.ai_settings add constraint ai_settings_overall_cap_needs_value check (not overall_cap_enabled or overall_monthly_cap_usd is not null);
  end if;
end
$$;

-- Só as chaves presentes em p_settings mudam; null em um teto tira o teto.
create or replace function public.ch_worker_ai_save_settings(p_actor uuid, p_settings jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ai_settings;
  v_cap numeric;
  v_on boolean;
begin
  perform public.ai_assert_admin_actor(p_actor);
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'Ajustes inválidos.' using errcode = '22023'; end if;
  -- teto geral: o valor que vai valer depois desta gravação (o que veio, ou o que já estava)
  select case when p_settings ? 'overall_monthly_cap_usd' then (p_settings ->> 'overall_monthly_cap_usd')::numeric else s.overall_monthly_cap_usd end,
         case when p_settings ? 'overall_cap_enabled' then (p_settings ->> 'overall_cap_enabled')::boolean else s.overall_cap_enabled end
    into v_cap, v_on from public.ai_settings s;
  if coalesce(v_on, false) and v_cap is null then
    raise exception 'Para ligar o teto geral do mês, preencha o valor dele.' using errcode = '22023';
  end if;
  update public.ai_settings
     set monthly_cap_usd = case when p_settings ? 'monthly_cap_usd' then (p_settings ->> 'monthly_cap_usd')::numeric else monthly_cap_usd end,
         per_run_cap_usd = case when p_settings ? 'per_run_cap_usd' then (p_settings ->> 'per_run_cap_usd')::numeric else per_run_cap_usd end,
         caps_enabled = case when p_settings ? 'caps_enabled' then (p_settings ->> 'caps_enabled')::boolean else caps_enabled end,
         tab_override_enabled = case when p_settings ? 'tab_override_enabled' then (p_settings ->> 'tab_override_enabled')::boolean else tab_override_enabled end,
         overall_monthly_cap_usd = v_cap,
         overall_cap_enabled = coalesce(v_on, false),
         updated_by = p_actor, updated_at = now()
   where id
   returning * into v;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_actor, 'ai.settings', 'ai_settings', p_settings);
  return to_jsonb(v) - 'id';
end
$$;
revoke execute on function public.ch_worker_ai_save_settings(uuid, jsonb) from public, anon, authenticated;
