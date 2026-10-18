-- =============================================================================
-- NOTA FISCAL QUE FALHOU: A TAREFA DE HORA EM HORA PEDE DE NOVO, E A ADMINISTRAÇÃO VÊ O QUE FICOU SEM NOTA (Pacote 2, 17/10/2026;
-- pedido do pré-voo da produção).
--
-- Antes: o servidor pedia a nota fiscal UMA vez, logo depois do pagamento (só com as variáveis ASAAS_NFSE_* na Vercel). Se o pedido
-- caía (rede, Asaas fora do ar) ou a nota voltava com ERRO, ninguém pedia de novo e ninguém via.
-- Agora:
--   1. cada pedido de nota fica anotado no pagamento (billing_cobrancas.nota_pedidos, nota_pedido_em, nota_erro);
--   2. a tarefa de hora em hora (/api/cobranca/cron) pede de novo quando o pagamento continua sem nota (ou a nota voltou com erro),
--      no máximo 4 pedidos por pagamento (o da hora do pagamento + 3 novas tentativas), com pelo menos 50 minutos entre eles;
--      pagamento devolvido não ganha nota nova;
--   3. Administração → Vendas e pagamentos: lista "Pagamentos sem nota / nota com erro" (só administrador).
-- Só vale para pagamentos em que o app PEDIU a nota (nota fiscal ligada): com a nota desligada, nada aparece na lista.
--
-- Substitui (create or replace, mesma assinatura): ch_worker_billing_notas_pendentes (013850), que passa a devolver também o que é
-- preciso para pedir de novo. O resto é novo. Pode ser colada de novo. Depende da 013850.
-- Desfazer: supabase/desfazer/20261003013860_nota_fiscal_reenvio.desfazer.sql. Conferir: supabase/conferir/nota-fiscal-reenvio.sql.
-- =============================================================================

alter table public.billing_cobrancas add column if not exists nota_pedidos integer not null default 0;
alter table public.billing_cobrancas add column if not exists nota_pedido_em timestamptz;
alter table public.billing_cobrancas add column if not exists nota_erro text;
alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_pedidos_check;
alter table public.billing_cobrancas add constraint billing_cobrancas_nota_pedidos_check check (nota_pedidos >= 0);
alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_erro_check;
alter table public.billing_cobrancas add constraint billing_cobrancas_nota_erro_check check (nota_erro is null or char_length(nota_erro) <= 300);

-- Anota um pedido de nota feito pelo servidor (deu certo ou não). Pagamento desconhecido: nada.
create or replace function public.ch_worker_billing_nota_pedido(p_provider text, p_payment text, p_ok boolean, p_erro text default null)
  returns void
  language sql security definer set search_path = ''
as $$
  update public.billing_cobrancas set nota_pedidos = nota_pedidos + 1, nota_pedido_em = now(),
    nota_erro = case when p_ok then null else left(coalesce(nullif(btrim(p_erro), ''), 'Falha ao pedir a nota.'), 300) end,
    atualizado_em = now()
  where provider = p_provider and provider_payment_id = p_payment;
$$;

-- Pagamentos dos últimos 15 dias sem nota final (para a tarefa de hora em hora perguntar ao fornecedor). "pedir_de_novo" = pode pedir
-- a nota outra vez: continua paga, sem nota (ou com erro), menos de 4 pedidos e o último há mais de 50 minutos.
create or replace function public.ch_worker_billing_notas_pendentes(p_limite integer default 30) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider', x.provider, 'payment_id', x.provider_payment_id,
           'tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'nome', x.nome, 'nota_status', x.nota_status, 'nota_pedidos', x.nota_pedidos,
           'pedir_de_novo', x.status = 'paga' and (x.nota_status is null or x.nota_status = 'erro') and x.nota_pedidos < 4
                            and coalesce(x.nota_pedido_em, x.pago_em) < now() - interval '50 minutes') order by x.pago_em desc), '[]'::jsonb)
  from (select x.*, k.nome from public.billing_cobrancas x left join public.billing_pedidos k on k.id = x.pedido_id
        where x.status in ('paga', 'devolvida_parcial') and x.pago_em > now() - interval '15 days'
          and (x.nota_status is null or x.nota_status in ('agendada', 'erro'))
        order by x.pago_em desc limit least(100, greatest(1, coalesce(p_limite, 30)))) x
$$;

-- Administração → Vendas e pagamentos: pagamentos em que o app pediu a nota e ela não saiu (2 horas depois do pagamento) ou voltou
-- com erro, dos últimos 90 dias. Só administrador.
create or replace function public.app_admin_billing_notas_pendencias() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.pago_em desc) from (
    select x.id as cobranca_id, x.user_id, u.email, nullif(btrim(pr.name), '') as nome,
           coalesce(k.nome, case when x.tipo = 'plano' then upper(x.codigo) || ' ' || x.ciclo else 'Extra ' || x.codigo end) as produto,
           x.metodo, x.valor_centavos, x.pago_em, x.nota_status, x.nota_pedidos, x.nota_pedido_em, x.nota_erro,
           case when x.nota_status = 'erro' then 'erro' else 'sem_nota' end as situacao,
           (x.nota_pedidos < 4) as vai_tentar_de_novo
    from public.billing_cobrancas x
    left join public.billing_pedidos k on k.id = x.pedido_id
    left join auth.users u on u.id = x.user_id
    left join public.profiles pr on pr.id = x.user_id
    where x.status in ('paga', 'devolvida_parcial') and x.pago_em > now() - interval '90 days' and x.nota_pedidos > 0
      and (x.nota_status = 'erro' or (x.nota_status is null and x.pago_em < now() - interval '2 hours'))
    order by x.pago_em desc limit 200) t), '[]'::jsonb);
end
$$;

revoke execute on function public.ch_worker_billing_nota_pedido(text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_notas_pendentes(integer) from public, anon, authenticated;
revoke execute on function public.app_admin_billing_notas_pendencias() from public, anon;
grant execute on function public.app_admin_billing_notas_pendencias() to authenticated;
