-- =============================================================================
-- PL01 (Fase 1 objetiva, 2026-10-12): a tela de planos do ALUNO, SÓ INFORMATIVA.
-- Pode ser colada de novo no Supabase sem estragar nada (create or replace). Depende da 9730 e da 9731 já coladas (usa a tabela plan_benefits).
--
-- O que o aluno logado enxerga (função app_plans_info):
--   * por plano (Teste grátis, Pro, Elite): o nome, a descrição e a lista de recursos que o administrador escreveu em Administração > Planos;
--   * quando o Tutor está ligado com planos pagos: os minutos de voz por dia do Pro (o mesmo valor do painel do Tutor) e, para o Elite,
--     só o que o dono preencheu/ligou em Configurações > "Benefícios do plano Elite" (vazio = igual ao Pro, nada é mostrado a mais).
-- O que NÃO sai desta função, de propósito: preço, periodicidade da cobrança, "marcado para venda" e qualquer coisa de pagamento. A
-- Stripe está parada por decisão do dono; os preços só entram depois. Também não há botão de assinar em nenhum lugar.
--
-- Só quem está logado chama (visitante e papel público não). Não grava nada.
-- Para desfazer: "drop function public.app_plans_info()".
-- =============================================================================

create or replace function public.app_plans_info() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  b public.plan_benefits;
  v_tutor_paid boolean;
  v_pro integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para ver os planos.' using errcode = '42501';
  end if;
  select * into c from public.tutor_config;
  select * into b from public.plan_benefits;
  -- o Tutor só aparece como "dos planos pagos" quando está no ar E cobra plano pago (sem isso ele é aberto a todos)
  v_tutor_paid := coalesce(c.enabled, false) and coalesce(c.requires_pro, false);
  v_pro := case when v_tutor_paid and coalesce(c.voice_enabled, false) then c.paid_voice_daily_seconds / 60 end;
  return jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', p.code, 'name', p.name, 'description', p.description, 'features', p.features,
               -- só o teste grátis conta se é oferecido no cadastro; nos pagos isso é "marcado para venda" e não sai
               'offered_at_signup', case when p.code = 'trial' then p.active end) order by p.position)
        from public.plans p), '[]'::jsonb),
    'tutor_paid', v_tutor_paid,
    'pro_voice_daily_minutes', v_pro,
    'elite_voice_daily_minutes', case when v_pro is not null and b.elite_voice_daily_minutes is not null then greatest(b.elite_voice_daily_minutes, v_pro) end,
    'elite_station_feedback', coalesce(b.elite_station_feedback, false));
end
$$;
revoke execute on function public.app_plans_info() from public, anon;
grant execute on function public.app_plans_info() to authenticated;
