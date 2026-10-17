-- Desfaz a 20261003013850_ajustes_cobranca.sql (ramo ajustes-cobranca). Devolve as versões ANTERIORES de ch_worker_billing_devolvido
-- (013700) e app_billing_historico (013760) e apaga o que a 013850 criou. ATENÇÃO: apaga os alertas ao dono já gravados, a nota fiscal
-- guardada em cada pagamento (o PDF continua no Asaas) e o registro de origem/motivo/quem fez das devoluções (as devoluções continuam).
-- Pode ser colado de novo.

-- versões anteriores (cópia literal das migrações 013700 e 013760)
create or replace function public.ch_worker_billing_devolvido(p_provider text, p_payment text, p_devolvido integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.billing_cobrancas;
  r public.billing_reembolsos;
  v_total boolean;
  v_ate timestamptz;
begin
  select * into x from public.billing_cobrancas where provider = p_provider and provider_payment_id = p_payment for update;
  if not found then return jsonb_build_object('conhecida', false); end if;
  v_total := p_devolvido >= x.valor_centavos;
  update public.billing_cobrancas set devolvido_centavos = least(valor_centavos, greatest(devolvido_centavos, p_devolvido)),
    status = case when v_total then 'devolvida' else 'devolvida_parcial' end, atualizado_em = now()
  where id = x.id;
  update public.billing_pedidos set status = case when v_total then 'devolvido' else 'devolvido_parcial' end, atualizado_em = now()
  where id = x.pedido_id;
  update public.billing_reembolsos set status = 'feito', atualizado_em = now()
  where cobranca_id = x.id and status in ('solicitado', 'equipe')
  returning * into r;
  v_ate := case when r.id is not null then r.acesso_ate when v_total then now() else null end;
  if x.tipo = 'plano' and v_ate is not null and x.user_id is not null then
    update public.billing_contratos set periodo_fim = least(periodo_fim, v_ate), renova = false, atualizado_em = now()
    where user_id = x.user_id and ultima_cobranca_id = x.id;
    if not public.user_has_full_access(x.user_id) then
      update public.subscriptions set current_period_end = least(current_period_end, v_ate),
        status = case when v_ate <= now() then 'canceled'::public.subscription_status else status end, updated_at = now()
      where user_id = x.user_id and plan::text = x.codigo;
    end if;
  elsif x.tipo = 'extra' and v_total and to_regclass('public.carteira_extras') is not null then
    execute $q$ update public.carteira_extras set cancelado_em = coalesce(cancelado_em, now()), cancelado_motivo = 'Devolução do pagamento'
                where referencia = $1 $q$ using p_provider || ':' || p_payment;
  end if;
  return jsonb_build_object('conhecida', true, 'total', v_total, 'acesso_ate', v_ate, 'user_id', x.user_id);
end
$$;
revoke execute on function public.ch_worker_billing_devolvido(text, text, integer) from public, anon, authenticated;

create or replace function public.app_billing_historico() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'metodo', x.metodo,
                             'valor_centavos', x.valor_centavos, 'status', x.status, 'pago_em', x.pago_em, 'em', x.criado_em,
                             'devolvido_centavos', x.devolvido_centavos, 'periodo_fim', x.periodo_fim, 'recibo_url', x.recibo_url)
                             order by x.criado_em desc)
                           from (select * from public.billing_cobrancas where user_id = v_user order by criado_em desc limit 50) x), '[]'::jsonb),
    -- o aceite do contrato da compra (o último): versão e data, para o aluno ver o que aceitou
    'aceite', (select jsonb_build_object('em', p.aceite ->> 'registrado_em', 'versao', p.aceite ->> 'contrato_versao', 'plano', p.nome)
               from public.billing_pedidos p where p.user_id = v_user and p.aceite is not null and p.status in ('pago', 'devolvido', 'devolvido_parcial')
               order by p.criado_em desc limit 1),
    'contrato_url', coalesce((select b.contrato_url from public.billing_config b), '/novo/termos'));
end
$$;
revoke execute on function public.app_billing_historico() from public, anon;
grant execute on function public.app_billing_historico() to authenticated;

-- o que a 013850 criou
drop function if exists public.app_admin_alertas_dono_salvar(jsonb);
drop function if exists public.app_admin_alertas_dono();
drop function if exists public.ch_worker_alerta_dono_marcar(bigint, boolean, text);
drop function if exists public.ch_worker_alertas_dono_pegar(integer);
drop function if exists public.ch_worker_alertas_dono_gerar();
drop function if exists public.alertas_custo_alunos_hoje();
drop function if exists public.app_admin_billing_devolucoes(integer);
drop function if exists public.app_admin_billing_pagamentos(uuid);
drop function if exists public.ch_worker_billing_nota_email_marcar(bigint, boolean, text);
drop function if exists public.ch_worker_billing_notas_email_pegar(integer);
drop function if exists public.ch_worker_billing_notas_pendentes(integer);
drop function if exists public.ch_worker_billing_nota_salvar(text, text, jsonb);
drop function if exists public.ch_worker_billing_admin_devolucao(uuid, bigint, integer, text, text);
drop function if exists public.alertas_usd(numeric);
drop function if exists public.alertas_dono_criar(text, text, text, text, jsonb);
drop table if exists public.alertas_dono;
drop table if exists public.alertas_dono_config;

drop index if exists public.billing_cobrancas_nota_email_idx;
alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_email_status_check;
alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_status_check;
alter table public.billing_cobrancas drop column if exists nota_email_erro;
alter table public.billing_cobrancas drop column if exists nota_email_em;
alter table public.billing_cobrancas drop column if exists nota_email_status;
alter table public.billing_cobrancas drop column if exists nota_autorizada_em;
alter table public.billing_cobrancas drop column if exists nota_pdf_url;
alter table public.billing_cobrancas drop column if exists nota_numero;
alter table public.billing_cobrancas drop column if exists nota_status;
alter table public.billing_cobrancas drop column if exists nota_id;

drop index if exists public.billing_reembolsos_recentes_idx;
-- devoluções feitas no painel e registradas pela 013850 (sem pedido nosso): somem junto com a origem
do $limpa$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_reembolsos' and column_name = 'origem') then
    execute $q$delete from public.billing_reembolsos where origem = 'painel'$q$;
  end if;
end $limpa$;
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_equipe_check;
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_classificacao_check;
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_motivo_check;
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_acesso_check;
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_origem_check;
alter table public.billing_reembolsos drop column if exists conferir;
alter table public.billing_reembolsos drop column if exists classificacao;
alter table public.billing_reembolsos drop column if exists acesso;
alter table public.billing_reembolsos drop column if exists feito_por;
alter table public.billing_reembolsos drop column if exists motivo;
alter table public.billing_reembolsos drop column if exists origem;
