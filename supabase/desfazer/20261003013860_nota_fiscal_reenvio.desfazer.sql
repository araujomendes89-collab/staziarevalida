-- Desfaz a 20261003013860_nota_fiscal_reenvio.sql (volta à 013850). Pode rodar de novo. Apaga só as anotações dos pedidos de nota
-- (nota_pedidos, nota_pedido_em, nota_erro); as notas guardadas (013850) ficam.
drop function if exists public.app_admin_billing_notas_pendencias();
drop function if exists public.ch_worker_billing_nota_pedido(text, text, boolean, text);

-- a versão da 013850
create or replace function public.ch_worker_billing_notas_pendentes(p_limite integer default 30) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider', x.provider, 'payment_id', x.provider_payment_id) order by x.pago_em desc), '[]'::jsonb)
  from (select * from public.billing_cobrancas x
        where x.status in ('paga', 'devolvida_parcial') and x.pago_em > now() - interval '15 days'
          and (x.nota_status is null or x.nota_status = 'agendada')
        order by x.pago_em desc limit least(100, greatest(1, coalesce(p_limite, 30)))) x
$$;
revoke execute on function public.ch_worker_billing_notas_pendentes(integer) from public, anon, authenticated;

alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_pedidos_check;
alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_erro_check;
alter table public.billing_cobrancas drop column if exists nota_pedidos;
alter table public.billing_cobrancas drop column if exists nota_pedido_em;
alter table public.billing_cobrancas drop column if exists nota_erro;
