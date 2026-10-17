-- Desfaz a 20261003013760_compra_avisos.sql (etapa 4: avisos de renovação/pagamento, troca da forma de pagamento, histórico,
-- aceite do contrato na compra, amostra de hoje). ATENÇÃO: apaga os avisos já gravados. Não mexe na cobrança (013700) nem nos planos.
-- volta a versão da 013700 do Pix de renovação (comparação por horas)
create or replace function public.ch_worker_billing_renovacoes_pix() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'plano', c.plano, 'ciclo', c.ciclo, 'periodo_fim', c.periodo_fim,
                                               'provider', c.provider, 'customer_id', k.customer_id) order by c.periodo_fim), '[]'::jsonb)
  from public.billing_contratos c
  join public.billing_clientes k on k.user_id = c.user_id and k.provider = c.provider
  where c.metodo = 'pix' and c.renova
    and c.periodo_fim > now() - interval '1 day'
    and c.periodo_fim <= now() + make_interval(days => (select b.renovacao_pix_dias from public.billing_config b))
    and not exists (select 1 from public.billing_pedidos p where p.user_id = c.user_id and p.motivo = 'renovacao'
                    and p.renova_ate = c.periodo_fim and p.status in ('aberto', 'pago'))
$$;
revoke execute on function public.ch_worker_billing_renovacoes_pix() from public, anon, authenticated;
drop trigger if exists avisos_da_cobranca on public.billing_cobrancas;
drop function if exists public.avisos_da_cobranca();
drop function if exists public.app_amostra_hoje();
drop function if exists public.ch_worker_billing_troca_cartao_abrir(uuid, text);
drop function if exists public.ch_worker_billing_para_pix(uuid);
drop function if exists public.ch_worker_billing_troca_situacao(uuid);
drop function if exists public.ch_worker_billing_aceite_registrar(uuid, text);
drop function if exists public.ch_worker_billing_contrato_doc();
drop function if exists public.ch_worker_billing_recibo_salvar(text, text, text);
drop function if exists public.app_billing_historico();
drop function if exists public.app_avisos_vistos(bigint[]);
drop function if exists public.app_meus_avisos();
drop function if exists public.ch_worker_aviso_email_marcar(bigint, boolean, text);
drop function if exists public.ch_worker_avisos_email_pegar(integer, integer);
drop function if exists public.ch_worker_avisos_cobranca();
drop function if exists public.avisos_criar(uuid, text, text, text, text, text);
drop function if exists public.avisos_dia(timestamptz);
drop function if exists public.avisos_brl(integer);
drop table if exists public.avisos_aluno;
alter table public.billing_config drop column if exists contrato_url;
alter table public.billing_cobrancas drop column if exists recibo_url;
