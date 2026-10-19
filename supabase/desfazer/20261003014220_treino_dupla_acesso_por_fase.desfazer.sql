-- Desfazer da 20261003014220_treino_dupla_acesso_por_fase.sql (2ª fase pela chave "prática", 19/10/2026).
-- Volta dupla_allowed e app_dupla_access ao texto da 013300 (planos antigos: Pro/Elite pagos e teste marcado em "planos") e
-- fase2_allowed ao da 013330 (só a equipe); tira os dois gatilhos novos e a função fase2_acesso. Não apaga dado nenhum.
-- ATENÇÃO: com a chave treino_dupla LIGADA, desfazer volta a deixar o PRO entrar no Treino em Dupla (a regra antiga).
-- Pode ser colado duas vezes.
drop function if exists public.app_fase2_banco();
drop trigger if exists fase2_amostra_station_attempts on public.station_attempts;
drop function if exists public.fase2_amostra_station_attempts();
drop trigger if exists fase2_venda_pedidos on public.billing_pedidos;
drop function if exists public.fase2_venda_pedidos();

create or replace function public.dupla_allowed(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_user is not null and (
    public.user_has_full_access(p_user)
    or exists (
      select 1
      from public.app_settings c
      join public.subscriptions s on s.user_id = p_user
      where c.key = 'treino_dupla'
        and c.value -> 'aberto' = 'true'::jsonb
        and jsonb_typeof(c.value -> 'planos') = 'array'
        and (c.value -> 'planos') ? s.plan::text
        and (
          (s.plan = 'trial' and s.status = 'trialing' and s.trial_ends_at > now())
          or (s.plan in ('pro', 'elite') and public.subscription_is_paid(s.plan, s.status, s.current_period_end))
        )
    )
  )
$$;

create or replace function public.app_dupla_access() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'aberto', coalesce((select c.value -> 'aberto' = 'true'::jsonb from public.app_settings c where c.key = 'treino_dupla'), false),
    'permitido', public.dupla_allowed((select auth.uid())),
    'planos', coalesce((select case when jsonb_typeof(c.value -> 'planos') = 'array' then c.value -> 'planos' end
                        from public.app_settings c where c.key = 'treino_dupla'), '[]'::jsonb),
    'equipe', public.user_is_staff((select auth.uid()))
  )
  where (select auth.uid()) is not null
$$;

create or replace function public.fase2_allowed() returns boolean
  language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and public.is_staff() $$;

create or replace function public.fase2_assert() returns uuid
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.fase2_allowed() then
    raise exception 'A 2ª fase ainda não está aberta para o seu perfil.' using errcode = '42501';
  end if;
  return (select auth.uid());
end
$$;

revoke execute on function public.app_dupla_access() from public, anon;
grant execute on function public.app_dupla_access() to authenticated;
revoke execute on function public.dupla_allowed(uuid) from public, anon, authenticated;
revoke execute on function public.fase2_allowed() from public, anon, authenticated;

-- só depois que ninguém mais a chama
drop function if exists public.fase2_acesso(uuid, text);
